/**
 * Абстракция платёжного провайдера — ТОЛЬКО для разовых платежей.
 * Чертёж.md, БЛОК 5 «Интеграция: Prodamus — только разовый депозит».
 *
 * ГРАНИЦА ОТВЕТСТВЕННОСТИ (важнее, чем код ниже):
 * клубная подписка и её рекуррент живут в связке Salebot ↔ Prodamus. Приложение
 * НЕ создаёт подписки, НЕ списывает повторно, НЕ отменяет — здесь нет и не должно
 * появиться метода `createSubscription`. Единственный сценарий этого модуля —
 * разовый депозит листа ожидания (B2B, без Telegram-канала).
 *
 * Интерфейс сохранён ровно таким, каким его зафиксировал Чертёж, чтобы адаптер
 * ЮKassa подключался сменой реализации (`PAYMENT_PROVIDER=yookassa`), не трогая
 * вызывающий код в `/api/waitlist/deposit`.
 */

import { AppError } from '@/lib/errors'
import { ERROR_CODES } from '@/lib/api-response'
import {
  createProdamusSignature,
  parseNestedFormFields,
  verifyProdamusSignature,
} from '@/lib/signing'
import { logError } from '@/lib/logger'

export interface CreatePaymentInput {
  amountKopecks: number
  description: string
  /** Локальный `payments.id` — он же `order_id` у провайдера. */
  orderId: string
  customerPhone: string
  customerEmail?: string
  metadata: Record<string, string>
}

export interface CreatePaymentResult {
  confirmationUrl: string
}

export interface PaymentProvider {
  createPayment(p: CreatePaymentInput): Promise<CreatePaymentResult>
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean
}

/**
 * Провайдер недоступен/не настроен → `503 PROVIDER_UNAVAILABLE` (edge case 3:
 * «Платёжная система недоступна», лид при этом не теряется — строка `payments`
 * уже создана со статусом `pending`).
 */
export class PaymentProviderError extends AppError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(ERROR_CODES.PROVIDER_UNAVAILABLE, message, 503, context)
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new PaymentProviderError('Платёжная система недоступна', { missing_env: name })
  }
  return value.trim()
}

/** Базовый URL приложения — для `urlSuccess` / `urlNotification`. */
function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

/** Копейки → строка рублей с копейками, как ждёт payform (`5000.00`). */
export function kopecksToRubles(amountKopecks: number): string {
  return (amountKopecks / 100).toFixed(2)
}

/**
 * Prodamus: собирает ПОДПИСАННУЮ ССЫЛКУ на payform.
 *
 * Сетевого вызова здесь нет — payform принимает параметры прямо в query, а
 * подтверждением оплаты служит только вебхук на `urlNotification` (возврат на
 * `urlSuccess` доверием не считается, Чертёж БЛОК 5). Поэтому `createPayment`
 * падает не «по сети», а по конфигурации (нет `PRODAMUS_FORM_URL`/секрета) —
 * и в обоих случаях наружу уходит один и тот же `503 PROVIDER_UNAVAILABLE`.
 * `async` оставлен ради интерфейса: адаптеру ЮKassa нужен реальный HTTP-вызов.
 */
export class ProdamusPaymentProvider implements PaymentProvider {
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!Number.isInteger(input.amountKopecks) || input.amountKopecks <= 0) {
      throw new PaymentProviderError('Некорректная сумма платежа', {
        amount_kopecks: input.amountKopecks,
      })
    }

    const formUrl = requiredEnv('PRODAMUS_FORM_URL')
    const base = appBaseUrl()

    const fields: Record<string, unknown> = {
      order_id: input.orderId,
      customer_phone: input.customerPhone,
      // Разовый платёж: ровно одна позиция, без блока `subscription`.
      products: [
        {
          name: input.description,
          price: kopecksToRubles(input.amountKopecks),
          quantity: '1',
        },
      ],
      urlSuccess: process.env.PRODAMUS_SUCCESS_URL?.trim() || `${base}/waitlist?deposit=success`,
      urlNotification: process.env.PRODAMUS_NOTIFICATION_URL?.trim() || `${base}/api/webhooks/prodamus`,
    }
    // Параметр `do` намеренно не передаётся: ссылка открывается пользователем
    // как страница оплаты (пример URL в Чертеже, БЛОК 3). `do=link` — это режим
    // API-ответа ссылкой, он тут не нужен.

    if (input.customerEmail) fields.customer_email = input.customerEmail

    const sys = process.env.PRODAMUS_SYS?.trim()
    if (sys) fields.sys = sys

    // Пользовательские параметры Prodamus возвращает в вебхуке как есть —
    // это наш канал «пронести» waitlist_id/lead_id до обработчика.
    for (const [key, value] of Object.entries(input.metadata)) {
      fields[`_param_${key}`] = value
    }

    let signature: string
    try {
      signature = createProdamusSignature(fields)
    } catch (error) {
      logError('payments.prodamus.sign_failed', { order_id: input.orderId }, error)
      throw new PaymentProviderError('Платёжная система недоступна', { order_id: input.orderId })
    }

    let url: URL
    try {
      url = new URL(formUrl)
    } catch {
      throw new PaymentProviderError('Платёжная система недоступна', { invalid_env: 'PRODAMUS_FORM_URL' })
    }

    for (const [key, value] of flattenFields(fields)) {
      url.searchParams.set(key, value)
    }
    url.searchParams.set('signature', signature)

    return { confirmationUrl: url.toString() }
  }

  /**
   * Проверка подписи входящего вебхука по «сырому» телу.
   *
   * Роут `/api/webhooks/prodamus` этим методом НЕ пользуется: тело приходит как
   * `multipart/form-data`, и его разбирает платформа (`request.formData()`),
   * после чего вызывается `verifyProdamusSignature(fields, signature)` напрямую.
   * Метод оставлен, потому что он часть контракта `PaymentProvider` (адаптеру
   * ЮKassa нужен именно raw-body) и покрывает доставку в `x-www-form-urlencoded`
   * или JSON, если провайдер когда-нибудь переключит формат.
   */
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    const normalizedHeaders: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value
    }

    const fields = parseRawBody(rawBody)
    const signature =
      normalizedHeaders.sign ??
      normalizedHeaders.signature ??
      (typeof fields.signature === 'string' ? fields.signature : '')

    if (!signature) return false

    return verifyProdamusSignature(fields, signature)
  }
}

function parseRawBody(rawBody: string): Record<string, unknown> {
  const trimmed = rawBody.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      return {}
    }
    return {}
  }

  const params = new URLSearchParams(trimmed)
  const flat: Record<string, string> = {}
  for (const [key, value] of params) flat[key] = value
  return parseNestedFormFields(flat)
}

/** Вложенную структуру → плоские ключи `products[0][name]` для query-строки. */
function flattenFields(fields: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = []

  const walk = (prefix: string, value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(`${prefix}[${index}]`, item))
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        walk(`${prefix}[${key}]`, nested)
      }
      return
    }
    out.push([prefix, value === null || value === undefined ? '' : String(value)])
  }

  for (const [key, value] of Object.entries(fields)) walk(key, value)
  return out
}

/**
 * Выбор реализации. Сейчас поддержан только Prodamus; ЮKassa подключается
 * добавлением класса и веткой здесь — вызывающий код не меняется.
 */
export function getPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER ?? 'prodamus').trim().toLowerCase()

  switch (name) {
    case 'prodamus':
      return new ProdamusPaymentProvider()
    default:
      throw new PaymentProviderError('Платёжная система недоступна', { unknown_provider: name })
  }
}
