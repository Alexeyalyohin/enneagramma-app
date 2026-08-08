/**
 * Крон `retry-salebot-sync` — Чертёж.md, БЛОК 5 «Cron-задачи»: каждые 15 мин.
 * Ищет рассинхрон зеркала: `club_subscriptions` в статусе `active` без
 * соответствующего `telegram_access_grants.status='granted'` — то есть
 * `club_paid` пришёл, а `access_granted` от Salebot нет.
 *
 * ВАЖНО (честно, не скрываем): «подсвечивает в админке» из Чертежа реализовано
 * пока только структурированным логом (`logWarn`), не отдельным флагом в БД —
 * в схеме нет столбца под это, а строку в `events` с новым типом события
 * завести нельзя без миграции (CHECK-констрейнт `event_type`). Полноценная
 * подсветка ждёт экрана `/admin/subscriptions`, которого пока нет (см. отчёт
 * QA-фазы). Сам факт рассинхрона крон уже находит и логирует — это тот
 * минимум, который не требует новой миграции задним числом.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { logError, logInfo, logWarn } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Даём Salebot время реально выдать доступ, прежде чем считать рассинхроном. */
const GRACE_MS = 15 * 60 * 1000
/** Не пересматриваем всю историю каждые 15 минут — только недавние подписки. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Cron only' } }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = Date.now()
  const graceCutoffIso = new Date(now - GRACE_MS).toISOString()
  const lookbackIso = new Date(now - LOOKBACK_MS).toISOString()

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('club_subscriptions')
    .select('id, lead_id, started_at')
    .eq('status', 'active')
    .lt('started_at', graceCutoffIso)
    .gte('started_at', lookbackIso)

  if (subscriptionsError) {
    logError('cron.retry_salebot_sync.subscriptions_failed', {}, subscriptionsError)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: subscriptionsError.message } },
      { status: 500 }
    )
  }

  if (!subscriptions || subscriptions.length === 0) {
    logInfo('cron.retry_salebot_sync.done', { checked: 0, desynced: 0 })
    return NextResponse.json({ data: { checked: 0, desynced: 0 } })
  }

  const leadIds = [...new Set(subscriptions.map((s) => s.lead_id))]

  const { data: grants, error: grantsError } = await supabase
    .from('telegram_access_grants')
    .select('lead_id')
    .eq('status', 'granted')
    .in('lead_id', leadIds)

  if (grantsError) {
    logError('cron.retry_salebot_sync.grants_failed', {}, grantsError)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: grantsError.message } }, { status: 500 })
  }

  const grantedLeadIds = new Set((grants ?? []).map((g) => g.lead_id))
  const desynced = subscriptions.filter((s) => !grantedLeadIds.has(s.lead_id))

  for (const s of desynced) {
    logWarn('cron.retry_salebot_sync.desync_detected', {
      subscription_id: s.id,
      lead_id: s.lead_id,
      started_at: s.started_at,
      reason: 'club_paid без access_granted спустя 15+ минут',
    })
  }

  logInfo('cron.retry_salebot_sync.done', { checked: subscriptions.length, desynced: desynced.length })
  return NextResponse.json({ data: { checked: subscriptions.length, desynced: desynced.length } })
}
