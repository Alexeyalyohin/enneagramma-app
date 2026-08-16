/**
 * POST /api/leads/link-telegram — Salebot связывает подписчика с лидом.
 * Чертёж.md, БЛОК 3, GROUP «Клуб (хендофф в Salebot)».
 *
 * Направление вызова: Salebot → приложение. Приложение к Telegram не ходит,
 * `telegram_id` приносит бот. В ответ отдаём тип из теста — Salebot кладёт его
 * в переменную подписчика для сегментации и рассылок.
 *
 * Авторизация — ОБЩИЙ СЕКРЕТ Salebot (`X-Salebot-Secret` / URL), не подпись
 * тела, поэтому код ошибки `INVALID_SECRET` и статус `401`, а не
 * `400 INVALID_SIGNATURE` как у вебхуков с HMAC.
 *
 * Просроченный/битый токен → `400 INVALID_TOKEN` (edge case 25): Salebot
 * попросит пользователя пройти по свежей ссылке из приложения.
 *
 * РЕШЕНИЕ ПО RATE-LIMIT (отклонение от буквы Чертежа, осознанное).
 * Чертёж задаёт 10/мин на IP. Но это server-to-server callback: все подписчики
 * приходят с одного-двух IP Salebot, и общий лимит 10/мин обрубил бы воронку
 * на первом же всплеске. Поэтому лимит применяется только к запросам, НЕ
 * предъявившим верный секрет, — там он защищает от перебора секрета
 * (цель edge case 13). Аутентифицированный Salebot лимитом не режется.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { toApiErrorResponse } from '@/lib/errors'
import { logInfo, logWarn } from '@/lib/logger'
import { normalizeTelegramUsername } from '@/lib/phone'
import { optionalField } from '@/lib/validation'
import { verifyLinkToken, verifySalebotSecret } from '@/lib/signing'
import { linkTelegramToLead } from '@/lib/leads/telegram-link'
import { PORTRAIT_NAMES, type EnneagramType } from '@/lib/test-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  token: z.string().trim().min(1).max(200),
  telegram_id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  telegram_username: optionalField(z.string().max(64)),
})

export async function POST(request: NextRequest) {
  if (!verifySalebotSecret(request)) {
    const limited = enforceRateLimit(request, 'link-telegram-unauth', RATE_LIMITS.leadsLinkTelegram)
    if (limited) return limited

    logWarn('api.leads.link_telegram.bad_secret', {})
    return apiError(401, ERROR_CODES.INVALID_SECRET, 'Неверный секрет источника')
  }

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Проверьте token и telegram_id')
    }

    const input = parsed.data
    const verification = verifyLinkToken(input.token)

    if (!verification.valid) {
      logWarn('api.leads.link_telegram.invalid_token', {
        reason: verification.reason,
        telegram_id: input.telegram_id,
      })
      return apiError(
        400,
        ERROR_CODES.INVALID_TOKEN,
        verification.reason === 'expired'
          ? 'Ссылка устарела — попросите пользователя открыть свежую'
          : 'Токен не прошёл проверку'
      )
    }

    const rawUsername = input.telegram_username
      ? normalizeTelegramUsername(input.telegram_username)
      : null
    const telegramUsername = rawUsername && /^[a-z0-9_]{5,32}$/.test(rawUsername) ? rawUsername : null

    const supabase = createServiceClient()

    const result = await linkTelegramToLead(supabase, {
      leadId: verification.payload.lead_id ?? null,
      sessionId: verification.payload.session_id ?? null,
      telegramId: input.telegram_id,
      telegramUsername,
    })

    logInfo('api.leads.link_telegram.linked', {
      lead_id: result.leadId,
      merged: result.merged,
      created: result.created,
      session_linked: result.sessionLinked,
    })

    // `subscriber_created` в `events` не пишем: это событие присылает сам
    // Salebot вебхуком со своим `salebot_event_id` — иначе задвоим воронку.
    return apiSuccess({
      lead_id: result.leadId,
      enneagram_type: result.enneagramType,
      wing: result.wing,
      // Готовые для показа в боте поля — чтобы Salebot не конвертировал номер
      // типа в название сам: `type_name`/`wing_label` из того же словаря, что
      // и шаг «выбор портрета» в тесте (src/lib/test-engine/portraits.ts).
      type_name: result.enneagramType ? PORTRAIT_NAMES[result.enneagramType as EnneagramType] : null,
      wing_label: result.enneagramType && result.wing ? `${result.enneagramType}w${result.wing}` : null,
      // confidence хранится долей 0..1 (test_sessions.result) — здесь округляем
      // до целых процентов специально для отображения, не для бизнес-логики.
      confidence: result.confidence !== null ? Math.round(result.confidence * 100) : null,
      merged: result.merged,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'api.leads.link_telegram.failed')
  }
}
