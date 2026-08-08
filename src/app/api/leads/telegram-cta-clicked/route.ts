/**
 * POST /api/leads/telegram-cta-clicked — фиксирует клик по CTA «Открыть
 * Telegram-канал» на экране результата (Чертёж.md, US-002 шаг 5/6; БЛОК 2
 * `events.event_type = 'telegram_cta_clicked'`; воронка в
 * `/api/admin/funnel` считает именно это событие между `lead_captured` и
 * `club_paid`).
 *
 * ПОЧЕМУ отдельный роут: сама ссылка на бесплатный канал — прямой
 * `https://t.me/...`, серверного похода не требует. Но клиент не может писать
 * в `events` напрямую (RLS закрыта, пишет только service_role), а без этого
 * события шаг воронки навсегда остаётся нулевым. Роут не создаёт и не меняет
 * лида — только логирует факт клика.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { optionalField } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    lead_id: optionalField(z.uuid()),
    session_id: optionalField(z.uuid()),
  })
  .refine((data) => Boolean(data.lead_id ?? data.session_id), {
    message: 'Укажите lead_id или session_id',
    path: ['identity'],
  })

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'leads-telegram-cta-clicked', RATE_LIMITS.leadsTelegramCtaClicked)
  if (limited) return limited

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Укажите lead_id или session_id')
    }

    const supabase = createServiceClient()
    await recordEvent(supabase, {
      eventType: 'telegram_cta_clicked',
      leadId: parsed.data.lead_id ?? null,
      sessionId: parsed.data.session_id ?? null,
    })

    // Событие — «мягкая» аналитика (см. src/lib/events.ts): даже если запись
    // не удалась, пользователь не должен увидеть ошибку на клике по ссылке.
    return apiSuccess({ ok: true })
  } catch (error) {
    return toApiErrorResponse(error, 'api.leads.telegram_cta_clicked.failed')
  }
}
