/**
 * POST /api/test/session — создать сессию теста.
 * Чертёж.md, БЛОК 3, GROUP «Тест». Публичный роут, rate-limit 60/мин на IP.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { logError } from '@/lib/logger'
import { TEST_VERSION, buildMatrix, buildProgress, computeNextStep, emptyAxisScores } from '@/lib/test-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Тело пустое. Схема оставлена явной: если появятся utm-метки, они добавятся сюда.
const bodySchema = z.object({})

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'test', RATE_LIMITS.test)
  if (limited) return limited

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Некорректное тело запроса')
    }

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('test_sessions')
      .insert({ version: TEST_VERSION, answers: [], status: 'in_progress' })
      .select('id')
      .single()

    if (error || !data) {
      logError('api.test.session.insert_failed', { pg_code: error?.code }, error)
      return apiError(500, ERROR_CODES.SESSION_CREATE_FAILED, 'Не удалось создать сессию')
    }

    await recordEvent(supabase, { eventType: 'test_started', sessionId: data.id })

    return apiSuccess(
      {
        session_id: data.id,
        version: TEST_VERSION,
        first_block: 'triads',
        // Первый вопрос отдаём сразу: иначе клиенту нужен лишний round-trip,
        // а тест открывается во фрейме Tilda, где каждый запрос заметен.
        next: computeNextStep([]),
        progress: buildProgress([]),
        matrix: buildMatrix(emptyAxisScores()),
      },
      201
    )
  } catch (error) {
    return toApiErrorResponse(error, 'api.test.session.failed')
  }
}
