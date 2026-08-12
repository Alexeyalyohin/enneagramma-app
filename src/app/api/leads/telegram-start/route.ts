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
import { logError } from '@/lib/logger'
import { buildLinkStartPayload } from '@/lib/signing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  session_id: z.uuid(),
  consent_152fz: z.literal(true),
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

    const { session_id: sessionId } = parsed.data
    const supabase = createServiceClient()

    const { data: session, error: sessionError } = await supabase
      .from('test_sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) {
      logError('api.leads.telegram_start.session_select_failed', { session_id: sessionId }, sessionError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось прочитать сессию')
    }
    if (!session) {
      return apiError(404, ERROR_CODES.SESSION_NOT_FOUND, 'Сессия теста не найдена')
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
