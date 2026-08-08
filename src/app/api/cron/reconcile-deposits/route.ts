/**
 * Крон `reconcile-deposits` — Чертёж.md, БЛОК 5 «Cron-задачи»: каждые 10 мин.
 * Помечает «зависшими» депозиты листа ожидания (`waitlist_entries.deposit_status
 * = 'pending'`), для которых вебхук Prodamus не пришёл дольше часа (edge case 20a).
 *
 * Как и `retry-salebot-sync`, подсветка пока — структурированный лог, не флаг
 * в БД: столбца под это в схеме нет, заводить его без ревью database-architect
 * в этой фазе не стали. См. пояснение в retry-salebot-sync/route.ts.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { logError, logInfo, logWarn } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STALE_AFTER_MS = 60 * 60 * 1000

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Cron only' } }, { status: 401 })
  }

  const supabase = createServiceClient()
  const cutoffIso = new Date(Date.now() - STALE_AFTER_MS).toISOString()

  // `updated_at` — прокси момента, когда deposit_status стал 'pending':
  // moddatetime двигает его при любом UPDATE строки, а /api/waitlist/deposit
  // обновляет её именно тогда, когда выставляет 'pending'.
  const { data: stale, error } = await supabase
    .from('waitlist_entries')
    .select('id, lead_id, deposit_payment_id, updated_at')
    .eq('deposit_status', 'pending')
    .lt('updated_at', cutoffIso)

  if (error) {
    logError('cron.reconcile_deposits.failed', {}, error)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 })
  }

  for (const entry of stale ?? []) {
    logWarn('cron.reconcile_deposits.stale_pending', {
      waitlist_id: entry.id,
      lead_id: entry.lead_id,
      payment_id: entry.deposit_payment_id,
      pending_since: entry.updated_at,
    })
  }

  const count = stale?.length ?? 0
  logInfo('cron.reconcile_deposits.done', { stale: count })
  return NextResponse.json({ data: { stale: count } })
}
