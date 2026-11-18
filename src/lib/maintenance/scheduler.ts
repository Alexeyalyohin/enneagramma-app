import { runTestSessionMaintenance } from '@/lib/maintenance/test-sessions'
import { logError, logInfo } from '@/lib/logger'

const INTERVAL_MS = 60 * 60 * 1000
const maintenanceGlobal = globalThis as typeof globalThis & {
  enneagrammaSessionMaintenance?: ReturnType<typeof setInterval>
}

/** Для постоянного Node-процесса RelaxDev; register включает его явно. */
export function startTestSessionMaintenance() {
  if (maintenanceGlobal.enneagrammaSessionMaintenance) return
  let running = false
  async function run() {
    if (running) return
    running = true
    try {
      await runTestSessionMaintenance()
    } catch (error) {
      logError('maintenance.test_sessions.failed', {}, error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => { void run() }, INTERVAL_MS)
  timer.unref()
  maintenanceGlobal.enneagrammaSessionMaintenance = timer
  logInfo('maintenance.test_sessions.started', { interval_ms: INTERVAL_MS })
  void run()
}
