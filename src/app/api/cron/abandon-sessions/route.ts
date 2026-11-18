/**
 * Крон `abandon-sessions` — Чертёж.md, БЛОК 5 «Cron-задачи»: ежедневно 03:00 MSK.
 * Помечает `test_sessions` в `in_progress` дольше 24 ч как `abandoned`
 * (US-001, критерий приёмки: «Незавершённая сессия старше 24 ч не показывает
 * результат — предлагает начать заново»; `/api/test/answer` и `/api/test/submit`
 * проверяют возраст сессии на каждом запросе; крон сохраняет этот статус в БД).
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { abandonExpiredTestSessions } from '@/lib/maintenance/test-sessions'
import { toApiErrorResponse } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Cron only' } }, { status: 401 })
  }

  try {
    const count = await abandonExpiredTestSessions(createServiceClient())
    return NextResponse.json({ data: { abandoned: count } })
  } catch (error) {
    return toApiErrorResponse(error, 'cron.abandon_sessions.failed')
  }
}
