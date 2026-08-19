/**
 * GET /api/admin/funnel?period=30 — метрики воронки.
 * Чертёж.md, БЛОК 3, GROUP «Админ». Только владелец.
 *
 * Права проверяются дважды: middleware (`src/middleware.ts`) и `requireAdmin()`
 * здесь — прямой POST/GET мимо матчера всё равно упрётся в 403 (edge case 11).
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { requireAdmin } from '@/lib/auth/admin'
import { createServiceClient } from '@/lib/supabase/service'
import { toApiErrorResponse } from '@/lib/errors'
import type { EventType } from '@/types/domain'
import type { ServiceClient } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  period: z.coerce.number().int().min(1).max(365).default(30),
})

/**
 * Основная цепочка воронки: конверсия каждого шага считается от предыдущего.
 * Порядок фиксирован — он же порядок отрисовки столбцов в админке.
 *
 * `lead_captured` сюда намеренно не входит: событие пишет только старый
 * `/api/leads/capture` (форма с телефоном на экране результата), которую
 * убрали в пользу Telegram как основного пути захвата (см. коммит
 * "make Telegram the primary result-screen capture path, drop phone form").
 * Реальный путь теперь test_completed → telegram_cta_clicked напрямую —
 * держать lead_captured как обязательное звено давало абсурдный процент
 * (telegram_cta_clicked делился на почти нулевой мёртвый счётчик).
 */
const FUNNEL_CHAIN: readonly EventType[] = [
  'test_started',
  'test_completed',
  'telegram_cta_clicked',
  'club_paid',
]

/** Боковые метрики: у них нет осмысленного «предыдущего шага» в основной цепочке. */
const SIDE_STEPS: readonly EventType[] = ['lead_captured', 'waitlist_deposit_paid']

interface FunnelStep {
  key: EventType
  count: number
  cr_from_prev?: number
}

async function countEvents(
  client: ServiceClient,
  eventType: EventType,
  sinceIso: string
): Promise<number> {
  const { count, error } = await client
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .gte('created_at', sinceIso)

  if (error) throw error
  return count ?? 0
}

function ratio(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined
  return Math.round((current / previous) * 1000) / 1000
}

export async function GET(request: NextRequest) {
  try {
    // requireAdmin() ДО rate-limit: иначе неаутентифицированные запросы жрут
    // ту же корзину лимита, что и легитимные запросы владельца с того же IP.
    await requireAdmin()

    const limited = enforceRateLimit(request, 'admin', RATE_LIMITS.admin)
    if (limited) return limited

    const parsed = querySchema.safeParse({
      period: request.nextUrl.searchParams.get('period') ?? undefined,
    })
    if (!parsed.success) {
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Некорректный период')
    }

    const periodDays = parsed.data.period
    // TIMESTAMPTZ хранится в UTC, отображение — в MSK (edge case 22).
    // Для окна «последние N дней» смещение не влияет на границу выборки.
    const sinceIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()

    const supabase = createServiceClient()

    const chainCounts = await Promise.all(
      FUNNEL_CHAIN.map((eventType) => countEvents(supabase, eventType, sinceIso))
    )
    const sideCounts = await Promise.all(
      SIDE_STEPS.map((eventType) => countEvents(supabase, eventType, sinceIso))
    )

    const steps: FunnelStep[] = FUNNEL_CHAIN.map((key, index) => {
      const count = chainCounts[index]
      if (index === 0) return { key, count }
      const cr = ratio(count, chainCounts[index - 1])
      return cr === undefined ? { key, count } : { key, count, cr_from_prev: cr }
    })

    SIDE_STEPS.forEach((key, index) => steps.push({ key, count: sideCounts[index] }))

    // MRR — сумма цен только по активным подпискам зеркала Salebot.
    // past_due в MRR не берём: деньги за период фактически не пришли.
    const { data: activeSubscriptions, error: subscriptionsError } = await supabase
      .from('club_subscriptions')
      .select('price_kopecks')
      .eq('status', 'active')

    if (subscriptionsError) throw subscriptionsError

    const mrrKopecks = (activeSubscriptions ?? []).reduce((sum, row) => sum + row.price_kopecks, 0)

    return apiSuccess({
      period_days: periodDays,
      steps,
      mrr_kopecks: mrrKopecks,
      active_clubs: activeSubscriptions?.length ?? 0,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'api.admin.funnel.failed')
  }
}
