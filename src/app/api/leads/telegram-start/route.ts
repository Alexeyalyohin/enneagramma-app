/**
 * POST /api/leads/telegram-start — ссылка на бота для кнопки «Получить
 * полный разбор в Telegram» на экране результата. Публичный роут, 5/мин на IP.
 *
 * Ссылка статическая, по одной на тип (src/config/telegram-links.ts):
 * платформа бота не принимает надёжно произвольный `?start=<token>`, поэтому
 * подписанный токен сессии больше не выдаём. Берётся тип, показанный на
 * экране (primary или раннер-ап после AlternativeTypeSwitch), без крыла и
 * процента. Роут по-прежнему фиксирует клик (`telegram_cta_clicked`) и
 * выбор зрителя (`viewer_selected_type`) для воронки.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { logError, logWarn } from '@/lib/logger'
import { parseTestResult } from '@/lib/test-engine'
import type { EnneagramType, TestResult } from '@/lib/test-engine/types'
import { TELEGRAM_LINKS_BY_TYPE } from '@/config/telegram-links'
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

    const result = parseTestResult(session.result)
    if (!result) {
      return apiError(409, ERROR_CODES.RESULT_NOT_READY, 'Результат теста ещё не готов')
    }

    const displayedType =
      selectedType !== undefined
        ? await recordViewerSelection(supabase, sessionId, result, selectedType)
        : result.type

    const botLink = TELEGRAM_LINKS_BY_TYPE[displayedType]
    if (!botLink) {
      // Ссылка для типа не задана в конфиге — ошибка конфигурации, а не ввода.
      logError('api.leads.telegram_start.bot_link_missing', { type: displayedType })
      return apiError(503, ERROR_CODES.PROVIDER_UNAVAILABLE, 'Бот временно недоступен')
    }

    await recordEvent(supabase, {
      eventType: 'telegram_cta_clicked',
      sessionId,
      metadata: { subject: 'session', type: displayedType },
    })

    return apiSuccess({ bot_deep_link: botLink })
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
 *
 * Возвращает тип, на чью ссылку вести: выбранный, если он валиден для
 * сессии, иначе исходный `result.type`.
 */
async function recordViewerSelection(
  client: ServiceClient,
  sessionId: string,
  result: TestResult,
  selectedType: number
): Promise<EnneagramType> {
  let nextValue: EnneagramType | null
  if (selectedType === result.type) {
    nextValue = null
  } else if (selectedType === result.runner_up) {
    nextValue = result.runner_up
  } else {
    logWarn('api.leads.telegram_start.selected_type_mismatch', {
      session_id: sessionId,
      selected_type: selectedType,
      type: result.type,
      runner_up: result.runner_up,
    })
    return result.type
  }

  const { error } = await client
    .from('test_sessions')
    .update({ viewer_selected_type: nextValue })
    .eq('id', sessionId)

  if (error) {
    logError('api.leads.telegram_start.viewer_selection_failed', { session_id: sessionId }, error)
  }
  return nextValue ?? result.type
}
