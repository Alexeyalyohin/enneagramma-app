/**
 * POST /api/waitlist — встать в лист ожидания сертификации (B2B).
 * Чертёж.md, БЛОК 3, GROUP «Лист ожидания». Публичный роут, rate-limit 10/мин.
 *
 * Депозит здесь НЕ создаётся: `POST /api/waitlist/deposit` — отдельный роут
 * и зона integrations-specialist (прямой вызов Prodamus).
 *
 * РЕШЕНИЕ по повторной заявке. Чертёж даёт код `409 ALREADY_ON_WAITLIST`, но
 * там же говорит, что «смена тарифа возможна», а схема держит ровно одну запись
 * на лида (idx_waitlist_one_per_lead) и COMMENT на таблице прямо предписывает
 * «повторная заявка апдейтит существующую». Выбран апдейт:
 *   • человек, вернувшийся сменить тариф, получает ожидаемый результат,
 *     а не ошибку, из которой непонятно, что делать;
 *   • оплаченный депозит при этом не трогается — он живёт в тех же полях.
 * Флаг `updated: true` в ответе позволяет фронту показать «Тариф обновлён»
 * вместо «Вы в списке». Код `ALREADY_ON_WAITLIST` оставлен в справочнике
 * ошибок на случай, если владелец захочет вернуть жёсткое поведение.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { logError } from '@/lib/logger'
import { zPhoneRu } from '@/lib/phone'
import { hasIssueOn, optionalField } from '@/lib/validation'
import { resolveLead } from '@/lib/leads/identity'
import { WAITLIST_TIERS } from '@/types/domain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  // Телефон обязателен: по нему пойдут депозит и уведомления Prodamus
  // (Чертёж, БЛОК 3: «Ключ идентичности — телефон, email опционален»).
  phone: zPhoneRu,
  email: optionalField(z.email().max(254)),
  full_name: optionalField(z.string().max(120)),
  tier_interest: z.enum(WAITLIST_TIERS),
  note: optionalField(z.string().max(500)),
  consent_152fz: z.literal(true),
})

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'waitlist', RATE_LIMITS.waitlist)
  if (limited) return limited

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      if (hasIssueOn(parsed.error, 'consent_152fz')) {
        return apiError(400, ERROR_CODES.CONSENT_REQUIRED, 'Нужно согласие на обработку данных')
      }
      if (hasIssueOn(parsed.error, 'phone')) {
        return apiError(400, ERROR_CODES.IDENTITY_REQUIRED, 'Укажите телефон в формате +7XXXXXXXXXX')
      }
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Проверьте введённые данные')
    }

    const input = parsed.data
    const supabase = createServiceClient()

    const resolved = await resolveLead(supabase, {
      phone: input.phone,
      email: input.email,
      fullName: input.full_name,
      source: 'waitlist',
      consent152fz: true,
    })

    const leadId = resolved.lead.id

    const { data: existing, error: existingError } = await supabase
      .from('waitlist_entries')
      .select('id, tier_interest, deposit_status')
      .eq('lead_id', leadId)
      .maybeSingle()

    if (existingError) {
      logError('api.waitlist.select_failed', { lead_id: leadId }, existingError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось прочитать лист ожидания')
    }

    if (existing) {
      const patch: { tier_interest: string; note?: string } = { tier_interest: input.tier_interest }
      if (input.note) patch.note = input.note

      const { data: updated, error: updateError } = await supabase
        .from('waitlist_entries')
        .update(patch)
        .eq('id', existing.id)
        .select('id, tier_interest, deposit_status')
        .single()

      if (updateError || !updated) {
        logError('api.waitlist.update_failed', { lead_id: leadId, entry_id: existing.id }, updateError)
        return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось обновить заявку')
      }

      await recordEvent(supabase, {
        eventType: 'waitlist_joined',
        leadId,
        metadata: {
          waitlist_id: updated.id,
          tier_interest: updated.tier_interest,
          previous_tier: existing.tier_interest,
          updated: true,
        },
      })

      return apiSuccess({
        waitlist_id: updated.id,
        lead_id: leadId,
        tier_interest: updated.tier_interest,
        deposit_status: updated.deposit_status,
        updated: true,
      })
    }

    const { data: created, error: insertError } = await supabase
      .from('waitlist_entries')
      .insert({
        lead_id: leadId,
        tier_interest: input.tier_interest,
        note: input.note ?? null,
      })
      .select('id, tier_interest, deposit_status')
      .single()

    if (insertError || !created) {
      // 23505 — гонка двух одновременных заявок одного лида.
      if (insertError?.code === '23505') {
        return apiError(409, ERROR_CODES.ALREADY_ON_WAITLIST, 'Вы уже в листе ожидания')
      }
      logError('api.waitlist.insert_failed', { lead_id: leadId }, insertError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось создать заявку')
    }

    await recordEvent(supabase, {
      eventType: 'waitlist_joined',
      leadId,
      metadata: { waitlist_id: created.id, tier_interest: created.tier_interest, updated: false },
    })

    return apiSuccess(
      {
        waitlist_id: created.id,
        lead_id: leadId,
        tier_interest: created.tier_interest,
        deposit_status: created.deposit_status,
        updated: false,
      },
      201
    )
  } catch (error) {
    return toApiErrorResponse(error, 'api.waitlist.failed')
  }
}
