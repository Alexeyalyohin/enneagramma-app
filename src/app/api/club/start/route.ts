/**
 * POST /api/club/start — выдать deep-link в бота Salebot по клику «Вступить в клуб».
 * Чертёж.md, БЛОК 3, GROUP «Клуб (хендофф в Salebot)». Публичный, 5/мин на IP.
 *
 * ЭТО НЕ ЧЕКАУТ. Роут не создаёт платёж, не обращается к Prodamus и ничего не
 * знает о цене клуба. Он только фиксирует согласие 152-ФЗ, подписывает токен и
 * отдаёт ссылку в бота — оплату, рекуррент и доступ в канал ведёт Salebot.
 *
 * Edge case 19 (повторный старт при активной подписке): ссылка выдаётся всегда.
 * Проверять активную подписку по нашему зеркалу и «беречь» пользователя от
 * второй оплаты нельзя — зеркало отстаёт от Salebot, а Salebot сам опознаёт
 * активного подписчика и второй раз денег не берёт.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { logError, logWarn } from '@/lib/logger'
import { zPhoneRu } from '@/lib/phone'
import { hasIssueOn, optionalField } from '@/lib/validation'
import { resolveLead } from '@/lib/leads/identity'
import { buildLinkStartPayload } from '@/lib/signing'
import type { ServiceClient } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    session_id: optionalField(z.uuid()),
    phone: optionalField(zPhoneRu),
    consent_152fz: z.literal(true),
  })
  .refine((data) => Boolean(data.phone ?? data.session_id), {
    message: 'Нужен телефон или session_id',
    path: ['identity'],
  })

/** Имя бота Salebot без «@». Реального бота может ещё не быть — тогда плейсхолдер. */
function botUsername(): string {
  const raw = process.env.NEXT_PUBLIC_SALEBOT_BOT_USERNAME ?? ''
  return raw.trim().replace(/^@+/, '')
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'club-start', RATE_LIMITS.clubStart)
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
        return apiError(400, ERROR_CODES.IDENTITY_REQUIRED, 'Укажите телефон или пройдите тест')
      }
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Проверьте введённые данные')
    }

    const input = parsed.data
    const username = botUsername()
    if (!username) {
      // Без имени бота ссылка бессмысленна. Это ошибка конфигурации, а не ввода.
      logError('api.club.start.bot_username_missing', {})
      return apiError(503, ERROR_CODES.PROVIDER_UNAVAILABLE, 'Бот клуба временно недоступен')
    }

    const supabase = createServiceClient()

    const sessionId: string | null = input.session_id ?? null
    let leadId: string | null = null

    if (input.phone) {
      const resolved = await resolveLead(supabase, {
        phone: input.phone,
        source: 'club_page',
        consent152fz: true,
      })
      leadId = resolved.lead.id
      if (sessionId) await attachSession(supabase, sessionId, leadId)
    } else if (sessionId) {
      const session = await loadSession(supabase, sessionId)
      if (!session) {
        // Токен на несуществующую сессию Salebot ничем не поможет.
        return apiError(404, ERROR_CODES.SESSION_NOT_FOUND, 'Сессия теста не найдена')
      }
      leadId = session.lead_id
      if (leadId) await recordConsent(supabase, leadId)
    }

    // Токен несёт РОВНО ОДИН субъект (лимит Telegram на длину `?start=`,
    // подробности — в src/lib/signing.ts). Приоритет у lead_id как у
    // долговечного ключа; session_id — запасной вариант для анонимного лида,
    // по нему `/api/leads/link-telegram` создаст лида при первом `?start=`.
    const startPayload = buildLinkStartPayload(
      leadId ? { lead_id: leadId } : { session_id: sessionId }
    )

    await recordEvent(supabase, {
      eventType: 'club_start_clicked',
      leadId,
      sessionId,
      metadata: {
        subject: leadId ? 'lead' : 'session',
        with_phone: Boolean(input.phone),
      },
    })

    return apiSuccess({
      bot_deep_link: `https://t.me/${username}?start=${startPayload}`,
      lead_id: leadId,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'api.club.start.failed')
  }
}

async function loadSession(
  client: ServiceClient,
  sessionId: string
): Promise<{ id: string; lead_id: string | null } | null> {
  const { data, error } = await client
    .from('test_sessions')
    .select('id, lead_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Привязывает сессию теста к лиду, если она ещё ничья. Чужую не перехватываем. */
async function attachSession(
  client: ServiceClient,
  sessionId: string,
  leadId: string
): Promise<void> {
  const session = await loadSession(client, sessionId)
  if (!session || session.lead_id === leadId) return

  if (session.lead_id !== null) {
    logWarn('api.club.start.session_owned_by_other_lead', {
      session_id: sessionId,
      lead_id: leadId,
    })
    return
  }

  const { error } = await client.from('test_sessions').update({ lead_id: leadId }).eq('id', sessionId)
  if (error) {
    logWarn('api.club.start.session_link_failed', { session_id: sessionId, lead_id: leadId }, error)
  }
}

/** Фиксация согласия 152-ФЗ до выдачи ссылки (Чертёж, БЛОК 3). */
async function recordConsent(client: ServiceClient, leadId: string): Promise<void> {
  const { error } = await client
    .from('leads')
    .update({ consent_152fz: true, consent_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('consent_152fz', false)

  if (error) {
    logWarn('api.club.start.consent_update_failed', { lead_id: leadId }, error)
  }
}
