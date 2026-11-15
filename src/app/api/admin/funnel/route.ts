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
import { logError } from '@/lib/logger'
import { getTestStartSources } from '@/lib/admin/test-start-sources'
import type { EventType } from '@/types/domain'
import type { ServiceClient } from '@/lib/supabase/types'
import type { FunnelStep, TestFunnelStepKey } from '@/lib/admin/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  period: z.coerce.number().int().min(1).max(365).default(30),
})

const TEST_STEPS: readonly TestFunnelStepKey[] = [
  'test_started',
  'test_question_5_answered',
  'test_question_15_answered',
  'test_completed',
]

const ACTIVITY_EVENTS: readonly EventType[] = [
  'result_viewed',
  'telegram_cta_clicked',
  'lead_captured',
  'club_paid',
  'waitlist_deposit_paid',
]

async function countTestSessions(
  client: ServiceClient,
  step: TestFunnelStepKey,
  sinceIso: string
): Promise<number> {
  let query = client
    .from('test_sessions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceIso)

  // Первые 15 ответов всегда относятся к основным вопросам, дальше идут уточнения.
  // Проверяем ID сохранённого ответа, чтобы отличать отсутствующую позицию от заполненной.
  if (step === 'test_question_5_answered') {
    query = query.not('answers->4->>q', 'is', null)
  } else if (step === 'test_question_15_answered') {
    query = query.not('answers->14->>q', 'is', null)
  } else if (step === 'test_completed') {
    query = query.eq('status', 'completed')
  }

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
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
  if (previous <= 0 || current > previous) return undefined
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
    const now = Date.now()
    const sinceIso = new Date(now - periodDays * 24 * 60 * 60 * 1000).toISOString()

    const supabase = createServiceClient()

    const [chainCounts, activity, testStartSources] = await Promise.all([
      Promise.all(TEST_STEPS.map((step) => countTestSessions(supabase, step, sinceIso))),
      Promise.all(ACTIVITY_EVENTS.map(async (key) => ({ key, count: await countEvents(supabase, key, sinceIso) }))),
      getTestStartSources(supabase, sinceIso, new Date(now).toISOString()).catch((error: unknown) => {
        logError('api.admin.funnel.sources_failed', {}, error)
        return null
      }),
    ])

    const steps: FunnelStep[] = TEST_STEPS.map((key, index) => {
      const count = chainCounts[index]
      if (index === 0) return { key, count }
      const cr = ratio(count, chainCounts[index - 1])
      return cr === undefined ? { key, count } : { key, count, cr_from_prev: cr }
    })

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
      activity,
      test_start_sources: testStartSources,
      mrr_kopecks: mrrKopecks,
      active_clubs: activeSubscriptions?.length ?? 0,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'api.admin.funnel.failed')
  }
}
