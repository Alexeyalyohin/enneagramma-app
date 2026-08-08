/**
 * POST /api/leads/capture — создать/обновить лида и привязать сессию теста.
 * Чертёж.md, БЛОК 3 (GROUP «Лиды») + БЛОК 5 («Разрешение идентичности лида»).
 * Публичный роут, rate-limit 10/мин на IP (edge case 13).
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { logError } from '@/lib/logger'
import { zPhoneRu, zTelegramUsername } from '@/lib/phone'
import { hasIssueOn, optionalField } from '@/lib/validation'
import { resolveLead } from '@/lib/leads/identity'
import { applyTypeToLead } from '@/lib/leads/type-assignment'
import { parseTestResult } from '@/lib/test-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    session_id: optionalField(z.uuid()),
    phone: optionalField(zPhoneRu),
    email: optionalField(z.email().max(254)),
    telegram_username: optionalField(zTelegramUsername),
    full_name: optionalField(z.string().max(120)),
    consent_152fz: z.literal(true),
    source: z.enum(['test', 'club_page', 'waitlist', 'direct']).default('test'),
  })
  // Хотя бы один идентификатор. Телефон — основной: только он позволяет
  // СОЗДАТЬ лида (CHECK leads_identity_present), ник Telegram — лишь доопознать
  // уже существующего (подробности в src/lib/leads/identity.ts).
  .refine((data) => Boolean(data.phone ?? data.telegram_username), {
    message: 'Укажите телефон или Telegram',
    path: ['identity'],
  })

/** Ссылка на бота для CTA после захвата. Подписанный deep-link выдаёт /api/club/start. */
function telegramDeepLink(): string {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? 'https://t.me/enneagramma_one'
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'leads-capture', RATE_LIMITS.leadsCapture)
  if (limited) return limited

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      if (hasIssueOn(parsed.error, 'consent_152fz')) {
        return apiError(400, ERROR_CODES.CONSENT_REQUIRED, 'Нужно согласие на обработку данных')
      }
      if (hasIssueOn(parsed.error, 'identity')) {
        return apiError(400, ERROR_CODES.IDENTITY_REQUIRED, 'Укажите телефон или Telegram')
      }
      if (hasIssueOn(parsed.error, 'phone')) {
        return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Телефон должен быть в формате +7XXXXXXXXXX')
      }
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Проверьте введённые данные')
    }

    const input = parsed.data
    const supabase = createServiceClient()

    const resolved = await resolveLead(supabase, {
      phone: input.phone,
      email: input.email,
      telegramUsername: input.telegram_username,
      fullName: input.full_name,
      source: input.source,
      consent152fz: true,
    })

    const lead = resolved.lead
    let typeApplied = false

    // Привязка сессии теста к лиду + перенос типа по правилу уверенности.
    if (input.session_id) {
      const { data: session, error: sessionError } = await supabase
        .from('test_sessions')
        .select('id, status, result, lead_id')
        .eq('id', input.session_id)
        .maybeSingle()

      if (sessionError) {
        logError('api.leads.capture.session_select_failed', { session_id: input.session_id }, sessionError)
      } else if (session) {
        if (session.lead_id !== lead.id) {
          const { error: linkError } = await supabase
            .from('test_sessions')
            .update({ lead_id: lead.id })
            .eq('id', session.id)
          if (linkError) {
            logError('api.leads.capture.session_link_failed', { session_id: session.id, lead_id: lead.id }, linkError)
          }
        }

        const result = parseTestResult(session.result)
        if (session.status === 'completed' && result) {
          const outcome = await applyTypeToLead(
            supabase,
            lead.id,
            { type: result.type, wing: result.wing, confidence: result.confidence },
            session.id
          )
          typeApplied = outcome.applied
        }
      }
    }

    await recordEvent(supabase, {
      eventType: 'lead_captured',
      leadId: lead.id,
      sessionId: input.session_id ?? null,
      metadata: {
        source: input.source,
        created: resolved.created,
        merged: resolved.merged,
        type_applied: typeApplied,
        // «Архивная запись» поглощённого лида (edge case 7): отдельной таблицы
        // архива в схеме нет, поэтому снимок живёт в metadata этого события.
        ...(resolved.mergedFrom ? { merged_from: resolved.mergedFrom } : {}),
      },
    })

    return apiSuccess({
      lead_id: lead.id,
      merged: resolved.merged,
      telegram_deep_link: telegramDeepLink(),
    })
  } catch (error) {
    // AppError (например IDENTITY_REQUIRED из resolveLead) отдаётся своим
    // кодом и статусом, всё остальное — 500 без деталей наружу.
    return toApiErrorResponse(error, 'api.leads.capture.failed')
  }
}
