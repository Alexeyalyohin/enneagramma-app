/**
 * Зеркалирование событий Salebot в `club_subscriptions` / `telegram_access_grants`.
 * Чертёж.md, БЛОК 5 «Жизненный цикл подписки клуба» и «Доступ в закрытый Telegram».
 *
 * ГРАНИЦА: это ЗЕРКАЛО ДЛЯ МЕТРИК, не операционная логика. Источник правды —
 * Salebot: он берёт оплату, ведёт рекуррент Prodamus, добавляет в канал и кикает.
 * Отсюда правила, которые нельзя нарушать:
 *   • все значения (`price_kopecks`, `is_founder_price`, `current_period_end`,
 *     `grace_until`, `chat_id`) берутся ТОЛЬКО из тела вебхука — ничего не
 *     вычисляем и не достраиваем «по умолчанию» (edge case 9: цена — свойство
 *     товара в Prodamus, приложение лишь фиксирует пришедшее);
 *   • Telegram Bot API отсюда не вызывается ни при каких обстоятельствах;
 *   • неполные данные — повод залогировать и пропустить зеркалирование,
 *     а не «додумать» строку в БД.
 *
 * Идемпотентность обеспечивается ВЫШЕ по стеку (`insertEventStrict` по
 * `salebot_event_id` в роуте), поэтому здесь повторной защиты нет — сюда
 * управление на дубле уже не доходит.
 */

import { randomUUID } from 'node:crypto'
import { logWarn } from '@/lib/logger'
import type { Json } from '@/types/database'
import type { ServiceClient } from '@/lib/supabase/types'
import type { SalebotEventType } from '@/types/domain'
import {
  subscriptionPriceKopecks,
  type SalebotWebhookBody,
} from '@/lib/salebot/webhook'

export interface MirrorResult {
  /** Изменилось ли зеркало. `false` — событие принято, но менять было нечего. */
  mirrored: boolean
  subscriptionId: string | null
  note?: string
}

interface SubscriptionRow {
  id: string
  status: string
  current_period_end: string
}

/** Живая (active/past_due) подписка лида — по частичному UNIQUE она максимум одна. */
async function findLiveSubscription(
  client: ServiceClient,
  leadId: string
): Promise<SubscriptionRow | null> {
  const { data, error } = await client
    .from('club_subscriptions')
    .select('id, status, current_period_end')
    .eq('lead_id', leadId)
    .in('status', ['active', 'past_due'])
    .maybeSingle()

  if (error) throw error
  return data
}

/** Последняя по времени подписка лида — нужна для привязки grant'а после отмены. */
async function findLatestSubscription(
  client: ServiceClient,
  leadId: string
): Promise<SubscriptionRow | null> {
  const { data, error } = await client
    .from('club_subscriptions')
    .select('id, status, current_period_end')
    .eq('lead_id', leadId)
    .order('started_at', { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

/**
 * Применяет событие Salebot к зеркалу.
 * @param raw полное тело вебхука — кладём в `payments.raw_webhook` как есть.
 */
export async function applySalebotEvent(
  client: ServiceClient,
  event: SalebotEventType,
  leadId: string,
  body: SalebotWebhookBody,
  raw: unknown
): Promise<MirrorResult> {
  switch (event) {
    case 'subscriber_created':
      return mirrorSubscriberCreated(client, leadId)
    case 'club_paid':
      return mirrorClubPaid(client, leadId, body, raw)
    case 'subscription_renewed':
      return mirrorRenewed(client, leadId, body, raw)
    case 'subscription_past_due':
      return mirrorStatusChange(client, leadId, body, 'past_due')
    case 'subscription_churned':
      return mirrorStatusChange(client, leadId, body, 'canceled')
    case 'access_granted':
      return mirrorAccess(client, leadId, body, 'granted')
    case 'access_revoked':
      return mirrorAccess(client, leadId, body, 'revoked')
  }
}

/** `subscriber_created` — подписчик появился в боте. Зеркалим только флаг лида. */
async function mirrorSubscriberCreated(
  client: ServiceClient,
  leadId: string
): Promise<MirrorResult> {
  const { error } = await client
    .from('leads')
    .update({ subscribed_telegram: true })
    .eq('id', leadId)

  if (error) throw error
  return { mirrored: true, subscriptionId: null }
}

/**
 * `club_paid` — создание/актуализация зеркала подписки.
 * Без `price_kopecks` и `current_period_end` строку создать нельзя (оба NOT NULL),
 * а выдумывать их запрещено — тогда событие остаётся только в `events`.
 */
async function mirrorClubPaid(
  client: ServiceClient,
  leadId: string,
  body: SalebotWebhookBody,
  raw: unknown
): Promise<MirrorResult> {
  const subscription = body.subscription
  const priceKopecks = subscriptionPriceKopecks(subscription)
  const currentPeriodEnd = subscription?.current_period_end ?? null

  if (priceKopecks === null || currentPeriodEnd === null) {
    logWarn('salebot.club_paid.incomplete_payload', {
      lead_id: leadId,
      salebot_event_id: body.salebot_event_id,
      has_price: priceKopecks !== null,
      has_period_end: currentPeriodEnd !== null,
      reason: 'price_kopecks/current_period_end приходят только из вебхука — зеркало не создано',
    })
    return { mirrored: false, subscriptionId: null, note: 'incomplete_payload' }
  }

  const existing = await findLiveSubscription(client, leadId)

  const common = {
    status: 'active',
    price_kopecks: priceKopecks,
    is_founder_price: subscription?.is_founder_price ?? false,
    current_period_end: currentPeriodEnd,
    grace_until: subscription?.grace_until ?? null,
    canceled_at: null,
    salebot_subscriber_id: subscription?.salebot_subscriber_id ?? body.salebot_subscriber_id ?? null,
    prodamus_subscription_id: subscription?.prodamus_subscription_id ?? null,
    customer_phone: subscription?.customer_phone ?? body.lead?.phone ?? null,
  }

  let subscriptionId: string

  if (existing) {
    // Повтор оплаты по уже живой подписке (например, ручное продление владельцем):
    // обновляем ту же строку — второй активной быть не может (idx_club_one_active).
    const { data, error } = await client
      .from('club_subscriptions')
      .update(common)
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error) throw error
    subscriptionId = data.id
  } else {
    const { data, error } = await client
      .from('club_subscriptions')
      .insert({
        lead_id: leadId,
        started_at: subscription?.started_at ?? new Date().toISOString(),
        ...common,
      })
      .select('id')
      .single()
    if (error) throw error
    subscriptionId = data.id
  }

  await mirrorClubPayment(client, leadId, subscriptionId, body, raw)
  return { mirrored: true, subscriptionId }
}

/** `subscription_renewed` — двигаем период. Сами период не продлеваем никогда. */
async function mirrorRenewed(
  client: ServiceClient,
  leadId: string,
  body: SalebotWebhookBody,
  raw: unknown
): Promise<MirrorResult> {
  const currentPeriodEnd = body.subscription?.current_period_end ?? null
  if (!currentPeriodEnd) {
    logWarn('salebot.renewed.missing_period_end', {
      lead_id: leadId,
      salebot_event_id: body.salebot_event_id,
    })
    return { mirrored: false, subscriptionId: null, note: 'missing_period_end' }
  }

  const existing = await findLiveSubscription(client, leadId)
  if (!existing) {
    // Рассинхрон: продление без исходного club_paid. Чинить догадкой нельзя —
    // подсветит крон `retry-salebot-sync` (edge case 17).
    logWarn('salebot.renewed.no_live_subscription', {
      lead_id: leadId,
      salebot_event_id: body.salebot_event_id,
    })
    return { mirrored: false, subscriptionId: null, note: 'no_live_subscription' }
  }

  const price = subscriptionPriceKopecks(body.subscription)

  const { error } = await client
    .from('club_subscriptions')
    .update({
      status: 'active',
      current_period_end: currentPeriodEnd,
      grace_until: body.subscription?.grace_until ?? null,
      ...(price !== null ? { price_kopecks: price } : {}),
    })
    .eq('id', existing.id)
  if (error) throw error

  await mirrorClubPayment(client, leadId, existing.id, body, raw)
  return { mirrored: true, subscriptionId: existing.id }
}

/** `subscription_past_due` / `subscription_churned` — только статус зеркала. */
async function mirrorStatusChange(
  client: ServiceClient,
  leadId: string,
  body: SalebotWebhookBody,
  status: 'past_due' | 'canceled'
): Promise<MirrorResult> {
  const existing = await findLiveSubscription(client, leadId)
  if (!existing) {
    logWarn('salebot.status_change.no_live_subscription', {
      lead_id: leadId,
      salebot_event_id: body.salebot_event_id,
      target_status: status,
    })
    return { mirrored: false, subscriptionId: null, note: 'no_live_subscription' }
  }

  const patch =
    status === 'past_due'
      ? { status, grace_until: body.subscription?.grace_until ?? null }
      : { status, canceled_at: body.subscription?.canceled_at ?? body.occurred_at ?? new Date().toISOString() }

  const { error } = await client.from('club_subscriptions').update(patch).eq('id', existing.id)
  if (error) throw error

  return { mirrored: true, subscriptionId: existing.id }
}

/**
 * `access_granted` / `access_revoked` — зеркало доступа в закрытый канал.
 * Сам доступ выдаёт и отзывает Salebot; здесь только отметка для метрик.
 */
async function mirrorAccess(
  client: ServiceClient,
  leadId: string,
  body: SalebotWebhookBody,
  status: 'granted' | 'revoked'
): Promise<MirrorResult> {
  const subscription = (await findLiveSubscription(client, leadId)) ?? (await findLatestSubscription(client, leadId))
  const subscriptionId = subscription?.id ?? null
  const timestamp = body.occurred_at ?? new Date().toISOString()

  const { data: existing, error: selectError } = await client
    .from('telegram_access_grants')
    .select('id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (selectError) throw selectError

  const patch = {
    status,
    subscription_id: subscriptionId,
    chat_id: body.access?.chat_id ?? null,
    granted_at: status === 'granted' ? (body.access?.granted_at ?? timestamp) : undefined,
    revoked_at: status === 'revoked' ? (body.access?.revoked_at ?? timestamp) : undefined,
  }

  const row = existing?.[0]
  if (row) {
    const { error } = await client
      .from('telegram_access_grants')
      .update({
        status: patch.status,
        subscription_id: patch.subscription_id,
        ...(patch.chat_id !== null ? { chat_id: patch.chat_id } : {}),
        ...(patch.granted_at ? { granted_at: patch.granted_at } : {}),
        ...(patch.revoked_at ? { revoked_at: patch.revoked_at } : {}),
      })
      .eq('id', row.id)
    if (error) throw error
    return { mirrored: true, subscriptionId }
  }

  const { error } = await client.from('telegram_access_grants').insert({
    lead_id: leadId,
    subscription_id: subscriptionId,
    status: patch.status,
    chat_id: patch.chat_id,
    granted_at: patch.granted_at ?? null,
    revoked_at: patch.revoked_at ?? null,
  })
  if (error) throw error

  return { mirrored: true, subscriptionId }
}

/**
 * Зеркало клубного платежа в едином реестре `payments`.
 *
 * Пишется только если Salebot прислал идентификатор платежа и сумму — реестр
 * не должен наполняться строками «примерно на такую-то сумму». Конфликт по
 * `(provider, provider_payment_id)` означает, что этот платёж уже зеркалирован
 * (например, ретрай другого события) — это не ошибка.
 */
async function mirrorClubPayment(
  client: ServiceClient,
  leadId: string,
  subscriptionId: string,
  body: SalebotWebhookBody,
  raw: unknown
): Promise<void> {
  const providerPaymentId = body.subscription?.provider_payment_id ?? null
  const amountKopecks = subscriptionPriceKopecks(body.subscription)

  if (!providerPaymentId || amountKopecks === null) return

  const { error } = await client.from('payments').insert({
    lead_id: leadId,
    subscription_id: subscriptionId,
    product_type: 'club',
    provider: 'prodamus',
    provider_payment_id: providerPaymentId,
    idempotence_key: randomUUID(),
    amount_kopecks: amountKopecks,
    status: 'succeeded',
    raw_webhook: (raw ?? null) as Json,
  })

  if (error) {
    if (error.code === '23505') return
    logWarn('salebot.club_payment_mirror_failed', {
      lead_id: leadId,
      provider_payment_id: providerPaymentId,
      pg_code: error.code,
    })
  }
}
