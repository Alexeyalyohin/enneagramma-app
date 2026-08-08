/**
 * POST /api/waitlist/deposit — создать разовый депозитный платёж (B2B).
 * Чертёж.md, БЛОК 3, GROUP «Лист ожидания». Публичный, 5/мин на IP.
 *
 * Это ЕДИНСТВЕННОЕ место, где приложение обращается к Prodamus напрямую.
 * Клубная подписка сюда отношения не имеет: её оплату и рекуррент ведёт Salebot.
 *
 * Порядок намеренно такой: строка `payments` со статусом `pending` создаётся
 * ДО похода в провайдера. Если провайдер недоступен (edge case 3) — отдаём
 * `503 PROVIDER_UNAVAILABLE`, но лид не теряется: заявка в листе ожидания и
 * незавершённый платёж остаются, повторный клик переиспользует ту же строку
 * (`idempotence_key` не плодится), а зависший `pending` подсветит крон
 * `reconcile-deposits`.
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { toApiErrorResponse } from '@/lib/errors'
import { logError, logInfo } from '@/lib/logger'
import { getPaymentProvider } from '@/lib/payment-provider'
import type { ServiceClient } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  waitlist_id: z.uuid(),
})

/** Сумма депозита — из env, чтобы менять без деплоя кода. По умолчанию 5 000 ₽. */
const DEFAULT_DEPOSIT_KOPECKS = 500_000

function depositAmountKopecks(): number {
  const raw = process.env.DEPOSIT_AMOUNT_KOPECKS
  if (!raw) return DEFAULT_DEPOSIT_KOPECKS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    logError('api.waitlist.deposit.bad_amount_env', { raw })
    return DEFAULT_DEPOSIT_KOPECKS
  }
  return parsed
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'waitlist-deposit', RATE_LIMITS.waitlistDeposit)
  if (limited) return limited

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Некорректный waitlist_id')
    }

    const supabase = createServiceClient()

    const { data: entry, error: entryError } = await supabase
      .from('waitlist_entries')
      .select('id, lead_id, tier_interest, deposit_status, deposit_payment_id')
      .eq('id', parsed.data.waitlist_id)
      .maybeSingle()

    if (entryError) throw entryError
    if (!entry) {
      return apiError(404, ERROR_CODES.WAITLIST_NOT_FOUND, 'Заявка в лист ожидания не найдена')
    }

    if (entry.deposit_status === 'paid') {
      return apiError(409, ERROR_CODES.DEPOSIT_ALREADY_PAID, 'Депозит уже оплачен')
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, phone, email')
      .eq('id', entry.lead_id)
      .maybeSingle()

    if (leadError) throw leadError
    if (!lead) {
      logError('api.waitlist.deposit.lead_missing', { waitlist_id: entry.id })
      return apiError(404, ERROR_CODES.LEAD_NOT_FOUND, 'Лид не найден')
    }
    if (!lead.phone) {
      // Prodamus шлёт чек по телефону; без него платёж не собрать.
      return apiError(400, ERROR_CODES.IDENTITY_REQUIRED, 'Нужен телефон для оплаты депозита')
    }

    const amountKopecks = depositAmountKopecks()
    const payment = await ensurePendingPayment(supabase, {
      leadId: lead.id,
      existingPaymentId: entry.deposit_payment_id,
      amountKopecks,
    })

    // Провайдер вызывается ПОСЛЕ создания строки платежа — см. шапку файла.
    const provider = getPaymentProvider()
    const { confirmationUrl } = await provider.createPayment({
      amountKopecks,
      description: 'Депозит: лист ожидания сертификации',
      orderId: payment.id,
      customerPhone: lead.phone,
      customerEmail: lead.email ?? undefined,
      metadata: {
        waitlist_id: entry.id,
        lead_id: lead.id,
        tier_interest: entry.tier_interest,
      },
    })

    const { error: markError } = await supabase
      .from('waitlist_entries')
      .update({ deposit_status: 'pending', deposit_payment_id: payment.id })
      .eq('id', entry.id)

    if (markError) throw markError

    logInfo('api.waitlist.deposit.link_created', {
      waitlist_id: entry.id,
      payment_id: payment.id,
      amount_kopecks: amountKopecks,
      reused: payment.reused,
    })

    return apiSuccess({
      payment_id: payment.id,
      confirmation_url: confirmationUrl,
      amount_kopecks: amountKopecks,
    })
  } catch (error) {
    // PaymentProviderError уже несёт 503 PROVIDER_UNAVAILABLE (edge case 3).
    return toApiErrorResponse(error, 'api.waitlist.deposit.failed')
  }
}

interface EnsurePaymentInput {
  leadId: string
  existingPaymentId: string | null
  amountKopecks: number
}

/**
 * Возвращает незавершённый депозитный платёж лида, создавая его при
 * необходимости. Переиспользование `pending`-строки — это и есть защита от
 * двойного платежа при повторном клике: `order_id` (= `payments.id`) остаётся
 * тем же, `idempotence_key` не плодится.
 */
async function ensurePendingPayment(
  client: ServiceClient,
  input: EnsurePaymentInput
): Promise<{ id: string; reused: boolean }> {
  if (input.existingPaymentId) {
    const { data, error } = await client
      .from('payments')
      .select('id, status, amount_kopecks')
      .eq('id', input.existingPaymentId)
      .maybeSingle()
    if (error) throw error
    if (data && data.status === 'pending' && data.amount_kopecks === input.amountKopecks) {
      return { id: data.id, reused: true }
    }
  }

  const { data: pending, error: pendingError } = await client
    .from('payments')
    .select('id')
    .eq('lead_id', input.leadId)
    .eq('product_type', 'deposit')
    .eq('status', 'pending')
    .eq('amount_kopecks', input.amountKopecks)
    .order('created_at', { ascending: false })
    .limit(1)

  if (pendingError) throw pendingError
  if (pending && pending.length > 0) return { id: pending[0].id, reused: true }

  const { data: created, error: insertError } = await client
    .from('payments')
    .insert({
      lead_id: input.leadId,
      product_type: 'deposit',
      provider: 'prodamus',
      idempotence_key: randomUUID(),
      amount_kopecks: input.amountKopecks,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError) throw insertError
  return { id: created.id, reused: false }
}
