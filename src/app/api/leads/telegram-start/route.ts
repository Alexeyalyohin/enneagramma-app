/**
 * POST /api/leads/telegram-start — подписанная ссылка на бота для кнопки
 * «Получить полный разбор в Telegram» на экране результата.
 * Чертёж.md, БЛОК 4, экран «Результат», действие 2: «Клик TelegramCTA →
 * событие telegram_cta_clicked → deep-link в бота Salebot (?start=... с
 * токеном сессии)». Публичный роут, 5/мин на IP.
 *
 * Заменяет прежний `/api/leads/telegram-cta-clicked` (тот только писал
 * событие в статическую ссылку без токена — деталь реализации бэкенд-фазы,
 * разошедшаяся с Чертежом; токена не было, Salebot не мог опознать сессию).
 *
 * Лид на этот момент ещё не существует — ни телефона, ни telegram_id нет
 * (CHECK leads_identity_present их требует). Здесь только подписываем токен
 * с session_id (тот же механизм, что и `/api/club/start` — см.
 * src/lib/signing.ts) и фиксируем клик для воронки. Лид создаст Salebot
 * через POST /api/leads/link-telegram, когда пользователь реально стартует
 * бота — там же перенесётся тип теста на лида.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { logError, logWarn } from '@/lib/logger'
import { buildLinkStartPayload } from '@/lib/signing'
import { parseTestResult } from '@/lib/test-engine'
import { optionalField } from '@/lib/validation'
import type { ServiceClient } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  session_id: z.uuid(),
  consent_152fz: z.literal(true),
  /**
   * Тип, который сейчас показан на экране результата (переключатель
   * раннер-апа, см. AlternativeTypeSwitch) — primary или альтернатива.
   * Опционально: старые клиенты/без переключателя просто не шлют поле.
   */
  selected_type: optionalField(z.coerce.number().int().min(1).max(9)),
})

/** Имя бота Salebot без «@». Реального бота может ещё не быть — тогда плейсхолдер. */
function botUsername(): string {
  const raw = process.env.NEXT_PUBLIC_SALEBOT_BOT_USERNAME ?? ''
  return raw.trim().replace(/^@+/, '')
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'telegram-start', RATE_LIMITS.telegramStart)
  if (limited) return limited

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      return apiError(400, ERROR_CODES.CONSENT_REQUIRED, 'Нужно согласие на обработку данных')
    }

    const username = botUsername()
    if (!username) {
      // Без имени бота ссылка бессмысленна. Это ошибка конфигурации, а не ввода.
      logError('api.leads.telegram_start.bot_username_missing', {})
      return apiError(503, ERROR_CODES.PROVIDER_UNAVAILABLE, 'Бот временно недоступен')
    }

    const { session_id: sessionId, selected_type: selectedType } = parsed.data
    const supabase = createServiceClient()

    const { data: session, error: sessionError } = await supabase
      .from('test_sessions')
      .select('id, result')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) {
      logError('api.leads.telegram_start.session_select_failed', { session_id: sessionId }, sessionError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось прочитать сессию')
    }
    if (!session) {
      return apiError(404, ERROR_CODES.SESSION_NOT_FOUND, 'Сессия теста не найдена')
    }

    if (selectedType !== undefined) {
      await recordViewerSelection(supabase, sessionId, session.result, selectedType)
    }

    const startPayload = buildLinkStartPayload({ session_id: sessionId })

    await recordEvent(supabase, {
      eventType: 'telegram_cta_clicked',
      sessionId,
      metadata: { subject: 'session' },
    })

    return apiSuccess({ bot_deep_link: `https://t.me/${username}?start=${startPayload}` })
  } catch (error) {
    return toApiErrorResponse(error, 'api.leads.telegram_start.failed')
  }
}

/**
 * Запоминает, какой портрет был на экране в момент клика — только когда это
 * реально альтернатива (равна `runner_up` сохранённого результата), иначе
 * трактуем как «пользователь смотрел на исходный тип» и явно очищаем
 * колонку в `null`. Каждый клик перезаписывает значение безусловно — важно
 * для случая «открыл результат → посмотрел раннер-апа → передумал →
 * вернулся → кликнул»: должно остаться то, что было на экране именно при
 * ПОСЛЕДНЕМ клике, а не залипнуть на первом выборе.
 *
 * Значение с фронта не подставляется слепо: если оно не совпадает ни с
 * `result.type`, ни с `result.runner_up` (испорченный клиент/чужой запрос),
 * колонку не трогаем вовсе — лучше оставить прежнее состояние, чем записать
 * тип, которого для этой сессии не существует.
 */
async function recordViewerSelection(
  client: ServiceClient,
  sessionId: string,
  rawResult: unknown,
  selectedType: number
): Promise<void> {
  const result = parseTestResult(rawResult)
  if (!result) return

  let nextValue: number | null
  if (selectedType === result.type) {
    nextValue = null
  } else if (selectedType === result.runner_up) {
    nextValue = selectedType
  } else {
    logWarn('api.leads.telegram_start.selected_type_mismatch', {
      session_id: sessionId,
      selected_type: selectedType,
      type: result.type,
      runner_up: result.runner_up,
    })
    return
  }

  const { error } = await client
    .from('test_sessions')
    .update({ viewer_selected_type: nextValue })
    .eq('id', sessionId)

  if (error) {
    logError('api.leads.telegram_start.viewer_selection_failed', { session_id: sessionId }, error)
  }
}
