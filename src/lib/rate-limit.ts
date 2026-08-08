/**
 * Rate limiting per IP (Чертёж.md, БЛОК 5 «Безопасность»).
 *
 * ⚠️ ОСОЗНАННОЕ ОГРАНИЧЕНИЕ MVP: счётчики живут in-memory, в Map внутри одного
 * serverless-инстанса Vercel. Это значит:
 *   • при нескольких параллельных инстансах фактический лимит = лимит × число инстансов;
 *   • после cold start счётчики обнуляются.
 * Этого достаточно, чтобы срезать примитивный спам-бот (edge case 13 из Чертежа),
 * и НЕдостаточно для распределённой защиты под нагрузкой.
 *
 * Почему так: внешней инфраструктуры счётчиков в проекте нет — ни Upstash Redis,
 * ни его переменных в `.env.local`. Заводить новую инфраструктуру в бэкенд-фазе
 * не входит в задачу. Вынос в Redis (Upstash / Vercel KV) — отдельная задача
 * перед продакшн-масштабом; интерфейс `rateLimit()` спроектирован так, чтобы
 * замена хранилища не задела вызывающий код.
 */

import { apiError, ERROR_CODES } from '@/lib/api-response'
import type { NextResponse } from 'next/server'

/** Лимиты запросов в минуту (Чертёж, БЛОК 5 «Rate limiting»). */
export const RATE_LIMITS = {
  /** `/api/test/*` — 60/мин: тест — это 15+ быстрых ответов подряд. */
  test: 60,
  /** `/api/leads/capture` — 10/мин. */
  leadsCapture: 10,
  /** `/api/leads/telegram-cta-clicked` — та же цена ошибки, что у capture. */
  leadsTelegramCtaClicked: 10,
  /** `/api/leads/link-telegram` — 10/мин (зона integrations-specialist). */
  leadsLinkTelegram: 10,
  /** `/api/waitlist` — 10/мин: та же цена ошибки, что у захвата лида. */
  waitlist: 10,
  /** `/api/club/start` — 5/мин (зона integrations-specialist). */
  clubStart: 5,
  /** `/api/waitlist/deposit` — 5/мин (зона integrations-specialist). */
  waitlistDeposit: 5,
  /**
   * `/api/admin/*` — в Чертеже лимита нет: роут и так за admin-сессией.
   * Мягкий потолок стоит только чтобы кривой цикл в UI не заспамил БД.
   */
  admin: 120,
} as const

const WINDOW_MS = 60_000

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Раз в минуту подчищаем протухшие корзины, чтобы Map не рос бесконечно. */
let lastSweepAt = 0
function sweep(now: number): void {
  if (now - lastSweepAt < WINDOW_MS) return
  lastSweepAt = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  /** UNIX-время (мс) сброса окна. */
  resetAt: number
  /** Сколько секунд ждать до следующей попытки (для заголовка Retry-After). */
  retryAfterSeconds: number
}

/**
 * Инкрементирует счётчик по ключу и сообщает, укладывается ли запрос в лимит.
 * @param key   уникальный ключ окна, обычно `${scope}:${ip}`
 * @param limit максимум запросов в окне
 * @param windowMs длина окна, по умолчанию минута
 */
export function rateLimit(key: string, limit: number, windowMs: number = WINDOW_MS): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const bucket: Bucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, bucket)
    return {
      ok: true,
      limit,
      remaining: limit - 1,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  existing.count += 1
  const remaining = Math.max(0, limit - existing.count)
  return {
    ok: existing.count <= limit,
    limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/**
 * IP клиента. На Vercel реальный адрес приходит в `x-forwarded-for`
 * (первый элемент списка); `request.ip` в Next.js 16 больше нет.
 * Если IP не определился — все такие запросы делят одну корзину `unknown`,
 * это намеренно строгий, а не разрешающий дефолт.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Стандартный 429-ответ с заголовками лимита. */
export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  return apiError(429, ERROR_CODES.RATE_LIMITED, 'Слишком много запросов. Попробуйте через минуту', {
    'Retry-After': String(result.retryAfterSeconds),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  })
}

/**
 * Хелпер «всё в одном» для роутов: проверить лимит и, если превышен,
 * сразу отдать готовый 429. Возвращает `null`, когда запрос можно пропускать.
 *
 *   const limited = enforceRateLimit(request, 'test', RATE_LIMITS.test)
 *   if (limited) return limited
 */
export function enforceRateLimit(request: Request, scope: string, limit: number): NextResponse | null {
  const result = rateLimit(`${scope}:${getClientIp(request)}`, limit)
  return result.ok ? null : rateLimitedResponse(result)
}
