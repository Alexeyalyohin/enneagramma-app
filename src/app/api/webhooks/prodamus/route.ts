/**
 * POST /api/webhooks/prodamus — уведомление Prodamus по РАЗОВОМУ ДЕПОЗИТУ
 * листа ожидания. Чертёж.md, БЛОК 3 «Вебхуки» + БЛОК 5 «Интеграция: Prodamus».
 *
 * СЮДА НЕ ПРИХОДИТ КЛУБНАЯ ПОДПИСКА. Рекуррент клуба ведёт Salebot: Prodamus
 * шлёт его уведомления в Salebot, а к нам приходит уже событие `club_paid`
 * на `/api/webhooks/salebot`. Если в этот роут прилетит платёж с
 * `product_type='club'` — это ошибка настройки ЛК, и мы её логируем, а не
 * «дорабатываем» подписку руками.
 *
 * Формат тела — `multipart/form-data`, НЕ JSON: разбираем `request.formData()`.
 * Подпись HMAC-SHA256 проверяется ДО любой записи в БД (edge case 12):
 * не совпало → `400 INVALID_SIGNATURE`, начисления нет.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError } from '@/lib/api-response'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { parseNestedFormFields, verifyProdamusSignature } from '@/lib/signing'
import { logError, logInfo, logWarn } from '@/lib/logger'
import type { Json } from '@/types/database'
import type { ServiceClient } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ok(extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, ...extra }, { status: 200 })
}

/**
 * Тело приходит как `multipart/form-data` — разбираем его платформенным
 * `request.formData()`, а не `request.json()` (правило из .claude/rules/webhooks.md).
 */
async function readFormFields(
  request: NextRequest
): Promise<{ ok: true; fields: Record<string, string> } | { ok: false }> {
  try {
    const form = await request.formData()
    const fields: Record<string, string> = {}
    for (const [key, value] of form.entries()) {
      // Файлов Prodamus не шлёт; всё, что не строка, игнорируем.
      if (typeof value === 'string') fields[key] = value
    }
    return { ok: true, fields }
  } catch (error) {
    logWarn(
      'webhooks.prodamus.unparsable_body',
      { content_type: request.headers.get('content-type') },
      error
    )
    return { ok: false }
  }
}

export async function POST(request: NextRequest) {
  const form = await readFormFields(request)
  if (!form.ok) {
    return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Тело запроса не разобрано как форма')
  }
  const flat = form.fields

  // Подпись — в заголовке `Sign` либо в поле `signature`.
  const signature =
    request.headers.get('sign') ??
    request.headers.get('signature') ??
    flat.signature ??
    flat.sign ??
    ''

  const fields = parseNestedFormFields(flat)

  if (!verifyProdamusSignature(fields, signature)) {
    logWarn('webhooks.prodamus.bad_signature', { order_id: flat.order_id ?? null })
    return apiError(400, ERROR_CODES.INVALID_SIGNATURE, 'Не удалось верифицировать подпись')
  }

  try {
    const orderId = (flat.order_id ?? '').trim()
    if (!UUID_REGEX.test(orderId)) {
      // Не наш идентификатор заказа. Ретраи не помогут — принимаем и логируем.
      logWarn('webhooks.prodamus.unknown_order_format', { order_id: orderId || null })
      return ok({ matched: false })
    }

    const supabase = createServiceClient()

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, lead_id, status, product_type, amount_kopecks')
      .eq('id', orderId)
      .maybeSingle()

    if (paymentError) throw paymentError

    if (!payment) {
      logWarn('webhooks.prodamus.payment_not_found', { order_id: orderId })
      return ok({ matched: false })
    }

    if (payment.product_type !== 'deposit') {
      // Клубный платёж в этом роуте — признак того, что в ЛК Prodamus
      // urlNotification клубного товара указывает не на Salebot.
      logError('webhooks.prodamus.unexpected_product', {
        order_id: orderId,
        product_type: payment.product_type,
        reason: 'клубный рекуррент должен приходить в Salebot, а не в приложение',
      })
      return ok({ matched: false })
    }

    const status = (flat.payment_status ?? '').trim().toLowerCase()
    const rawWebhook = fields as Json

    // Идемпотентность: повторная доставка по уже зачтённому платежу — no-op.
    if (payment.status === 'succeeded') {
      logInfo('webhooks.prodamus.duplicate', { order_id: orderId })
      return ok({ duplicate: true })
    }

    if (status !== 'success') {
      // Промежуточные/неуспешные статусы фиксируем, но депозит не зачитываем.
      const { error } = await supabase
        .from('payments')
        .update({ raw_webhook: rawWebhook })
        .eq('id', payment.id)
      if (error) throw error

      logInfo('webhooks.prodamus.non_success_status', { order_id: orderId, payment_status: status })
      return ok({ matched: true, applied: false })
    }

    const providerPaymentId = (flat.payment_id ?? flat.id ?? '').trim() || null

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: 'succeeded',
        raw_webhook: rawWebhook,
        ...(providerPaymentId ? { provider_payment_id: providerPaymentId } : {}),
      })
      .eq('id', payment.id)

    if (updateError) {
      // 23505 — этот provider_payment_id уже занят другой строкой платежа.
      // Статус важнее идентификатора провайдера: повторяем без него.
      if (updateError.code === '23505') {
        logWarn('webhooks.prodamus.provider_id_conflict', {
          order_id: orderId,
          provider_payment_id: providerPaymentId,
        })
        const { error: retryError } = await supabase
          .from('payments')
          .update({ status: 'succeeded', raw_webhook: rawWebhook })
          .eq('id', payment.id)
        if (retryError) throw retryError
      } else {
        throw updateError
      }
    }

    const waitlistId = await markWaitlistDepositPaid(supabase, payment.lead_id, payment.id)

    await recordEvent(supabase, {
      eventType: 'waitlist_deposit_paid',
      leadId: payment.lead_id,
      metadata: {
        payment_id: payment.id,
        waitlist_id: waitlistId,
        amount_kopecks: payment.amount_kopecks,
        provider: 'prodamus',
        provider_payment_id: providerPaymentId,
      },
    })

    logInfo('webhooks.prodamus.deposit_paid', {
      order_id: orderId,
      lead_id: payment.lead_id,
      waitlist_id: waitlistId,
    })

    return ok({ matched: true, applied: true })
  } catch (error) {
    // 500 → Prodamus повторит доставку; повтор безопасен (проверка `succeeded`).
    logError('webhooks.prodamus.failed', { order_id: flat.order_id ?? null }, error)
    return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось обработать уведомление')
  }
}

/**
 * Проставляет депозит в листе ожидания. Запись ищем по лиду — она одна на лида
 * (`idx_waitlist_one_per_lead`). Возвращает id записи или `null`, если её нет
 * (депозит без заявки — повод для разбора, но не для отказа в приёме вебхука).
 */
async function markWaitlistDepositPaid(
  client: ServiceClient,
  leadId: string,
  paymentId: string
): Promise<string | null> {
  const { data: entry, error: selectError } = await client
    .from('waitlist_entries')
    .select('id')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (selectError) throw selectError

  if (!entry) {
    logWarn('webhooks.prodamus.waitlist_entry_missing', { lead_id: leadId, payment_id: paymentId })
    return null
  }

  const { error: updateError } = await client
    .from('waitlist_entries')
    .update({ deposit_status: 'paid', deposit_payment_id: paymentId })
    .eq('id', entry.id)

  if (updateError) throw updateError
  return entry.id
}
