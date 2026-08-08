/**
 * Контракт входящего вебхука Salebot (Чертёж.md, БЛОК 3 «Вебхуки»).
 *
 * Схема намеренно СНИСХОДИТЕЛЬНА к содержимому и строга только к каркасу
 * (`event`, `salebot_event_id`). Причина: Salebot ретраит доставку до `200`,
 * поэтому падать `400` из-за телефона в неожиданном формате нельзя — это
 * бесконечный цикл ретраев по нерешаемой проблеме. Кривой телефон трактуется
 * как «телефона нет», кривая дата — как «даты нет», а событие всё равно
 * фиксируется в `events` для метрик и сверки кроном `retry-salebot-sync`.
 */

import { z } from 'zod'
import { optionalField } from '@/lib/validation'
import { isValidRuPhone, normalizePhoneE164, normalizeTelegramUsername } from '@/lib/phone'
import { SALEBOT_EVENT_TYPES, type SalebotEventType } from '@/types/domain'

/**
 * Все поля ниже «мягкие»: неразобранное значение превращается в `undefined`
 * (= «поле не пришло»), а не в ошибку разбора. Обработчик на такое отвечает
 * логом и пропуском зеркалирования — но `200`, чтобы Salebot не ушёл в вечный
 * ретрай. Строгость оставлена только каркасу события.
 */
function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function toOptionalInt(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
  }
  return undefined
}

function toOptionalBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'да'].includes(normalized)) return true
    if (['false', '0', 'no', 'нет', ''].includes(normalized)) return false
  }
  return undefined
}

/** Любая парсящаяся дата → ISO-строка (в БД TIMESTAMPTZ, хранение в UTC). */
function toOptionalIsoDate(value: unknown): string | undefined {
  const raw = toOptionalString(value)
  if (raw === undefined) return undefined
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

const zLooseString = (max: number) =>
  z.preprocess(toOptionalString, z.string().max(max).optional()).optional()
const zLooseInt = z.preprocess(toOptionalInt, z.number().int().optional()).optional()
const zLoosePositiveInt = z
  .preprocess(toOptionalInt, z.number().int().positive().optional())
  .optional()
const zLooseBool = z.preprocess(toOptionalBool, z.boolean().optional()).optional()
const zTimestamp = z.preprocess(toOptionalIsoDate, z.string().optional()).optional()

const leadSchema = z.object({
  telegram_id: zLoosePositiveInt,
  telegram_username: zLooseString(64),
  phone: zLooseString(32),
  email: zLooseString(254),
  full_name: zLooseString(160),
})

const subscriptionSchema = z.object({
  /** Цена приходит из вебхука и только из него — приложение её не вычисляет. */
  price_kopecks: zLoosePositiveInt,
  /** Синоним из примера в Чертеже. */
  amount_kopecks: zLoosePositiveInt,
  is_founder_price: zLooseBool,
  current_period_end: zTimestamp,
  started_at: zTimestamp,
  grace_until: zTimestamp,
  canceled_at: zTimestamp,
  provider_payment_id: zLooseString(200),
  prodamus_subscription_id: zLooseString(200),
  salebot_subscriber_id: zLooseString(200),
  customer_phone: zLooseString(32),
})

const accessSchema = z.object({
  chat_id: zLooseInt,
  granted_at: zTimestamp,
  revoked_at: zTimestamp,
})

export const salebotWebhookSchema = z.object({
  event: z.string().trim().min(1).max(64),
  salebot_event_id: z.string().trim().min(1).max(200),
  // `optionalField`, а не `.optional()`: конструктор вполне может прислать
  // `"subscription": null` для событий без подписки — падать на этом нельзя.
  lead: optionalField(leadSchema),
  subscription: optionalField(subscriptionSchema),
  access: optionalField(accessSchema),
  salebot_subscriber_id: zLooseString(200),
  occurred_at: zTimestamp,
})

export type SalebotWebhookBody = z.infer<typeof salebotWebhookSchema>
export type SalebotSubscriptionPayload = z.infer<typeof subscriptionSchema>
export type SalebotAccessPayload = z.infer<typeof accessSchema>

export function isSupportedSalebotEvent(event: string): event is SalebotEventType {
  return (SALEBOT_EVENT_TYPES as readonly string[]).includes(event)
}

export interface SalebotLeadIdentity {
  phone: string | null
  telegramId: number | null
  telegramUsername: string | null
  email: string | null
  fullName: string | null
}

/**
 * Приводит блок `lead` к ключам идентичности приложения.
 * Невалидный телефон/ник не роняет обработку — он просто не участвует в поиске.
 */
export function extractLeadIdentity(body: SalebotWebhookBody): SalebotLeadIdentity {
  const rawPhone = body.lead?.phone ?? body.subscription?.customer_phone ?? null
  const normalizedPhone = rawPhone ? normalizePhoneE164(rawPhone) : null
  const phone = normalizedPhone && isValidRuPhone(normalizedPhone) ? normalizedPhone : null

  const rawUsername = body.lead?.telegram_username ?? null
  const username = rawUsername ? normalizeTelegramUsername(rawUsername) : null

  return {
    phone,
    telegramId: body.lead?.telegram_id ?? null,
    telegramUsername: username && /^[a-z0-9_]{5,32}$/.test(username) ? username : null,
    email: body.lead?.email ?? null,
    fullName: body.lead?.full_name ?? null,
  }
}

/** Цена подписки из вебхука: `price_kopecks` или синоним `amount_kopecks`. */
export function subscriptionPriceKopecks(
  subscription: SalebotSubscriptionPayload | undefined
): number | null {
  return subscription?.price_kopecks ?? subscription?.amount_kopecks ?? null
}
