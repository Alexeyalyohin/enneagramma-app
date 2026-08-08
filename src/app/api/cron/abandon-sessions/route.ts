/**
 * Крон `abandon-sessions` — Чертёж.md, БЛОК 5 «Cron-задачи»: ежедневно 03:00 MSK.
 * Помечает `test_sessions` в `in_progress` дольше 24 ч как `abandoned`
 * (US-001, критерий приёмки: «Незавершённая сессия старше 24 ч не показывает
 * результат — предлагает начать заново»; `/api/test/answer` и `/api/test/submit`
 * уже обрабатывают код `SESSION_ABANDONED`, этот крон — то, что реально
 * переводит сессию в этот статус).
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { logError, logInfo } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Cron only' } }, { status: 401 })
  }

  const supabase = createServiceClient()
  const cutoffIso = new Date(Date.now() - ABANDON_AFTER_MS).toISOString()

  // Ошибка крона не критична (Чертёж: «лог ошибки, не критично») — сессии
  // просто останутся in_progress до следующего успешного прогона.
  const { data, error } = await supabase
    .from('test_sessions')
    .update({ status: 'abandoned' })
    .eq('status', 'in_progress')
    .lt('created_at', cutoffIso)
    .select('id')

  if (error) {
    logError('cron.abandon_sessions.failed', { cutoff: cutoffIso }, error)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 })
  }

  const count = data?.length ?? 0
  logInfo('cron.abandon_sessions.done', { count, cutoff: cutoffIso })
  return NextResponse.json({ data: { abandoned: count } })
}
