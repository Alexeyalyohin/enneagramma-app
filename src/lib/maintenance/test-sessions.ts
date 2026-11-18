import { createServiceClient } from '@/lib/supabase/service'
import { TEST_SESSION_LIFETIME_MS } from '@/lib/test/session-lifetime'
import { logInfo } from '@/lib/logger'

const RETENTION_DAYS = 30
const REQUEST_TIMEOUT_MS = 30_000
type ServiceClient = ReturnType<typeof createServiceClient>

/** Повторный запуск безопасен: меняется только статус незавершённых сессий. */
export async function abandonExpiredTestSessions(supabase: ServiceClient, now = Date.now()) {
  const cutoff = new Date(now - TEST_SESSION_LIFETIME_MS).toISOString()
  const { count, error } = await supabase
    .from('test_sessions')
    .update({ status: 'abandoned' }, { count: 'exact' })
    .eq('status', 'in_progress')
    .lt('created_at', cutoff)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))

  if (error) throw new Error(`Session maintenance update failed (${error.code})`)
  if (count === null) throw new Error('Session maintenance update returned no count')

  logInfo('cron.abandon_sessions.done', { count, cutoff })
  return count
}

/** Пока только оценка объёма очистки: записи и ответы не удаляются. */
export async function runTestSessionMaintenance(now = Date.now()) {
  const supabase = createServiceClient()
  const abandoned = await abandonExpiredTestSessions(supabase, now)
  const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('test_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'abandoned')
    .is('lead_id', null)
    .is('result', null)
    .lt('created_at', cutoff)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))

  if (error) throw new Error(`Session retention preview failed (${error.code})`)
  if (count === null) throw new Error('Session retention preview returned no count')

  const summary = { abandoned, retention_candidates: count, retention_days: RETENTION_DAYS, dry_run: true }
  logInfo('maintenance.test_sessions.done', summary)
  return summary
}
