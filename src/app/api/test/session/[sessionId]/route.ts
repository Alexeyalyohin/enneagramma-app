/**
 * GET /api/test/session/[sessionId] — восстановить состояние сессии теста.
 * Чертёж.md, US-001, критерий приёмки: «Обновление страницы (F5) восстанавливает
 * сессию из БД по session_id» — до этого роута F5 восстанавливал прогресс
 * ТОЛЬКО из localStorage (см. src/lib/test/useTestSession.ts), что молча
 * теряет прогресс там, где localStorage партиционирован/недоступен (в первую
 * очередь — iOS Safari ITP в iframe при встраивании в Tilda, см. Чертёж
 * «Интеграция: Tilda»). Это находка QA-фазы, не архитектурная недоделка.
 *
 * Публичный роут: `session_id` — непредсказуемый UUID, а отдаём мы только то
 * же самое, что и так лежит у клиента (шаг/прогресс/матрицу), без ПДн лида —
 * тот же принцип, что в GET /api/test/result/[sessionId] (edge case 10).
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { toApiErrorResponse } from '@/lib/errors'
import { logError } from '@/lib/logger'
import { buildMatrix, buildProgress, computeNextStep, parseStoredAnswers, scoreAnswers } from '@/lib/test-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ sessionId: z.uuid() })

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const limited = enforceRateLimit(request, 'test', RATE_LIMITS.test)
  if (limited) return limited

  try {
    const parsed = paramsSchema.safeParse(await context.params)
    if (!parsed.success) {
      return apiError(404, ERROR_CODES.SESSION_NOT_FOUND, 'Сессия не найдена')
    }

    const supabase = createServiceClient()
    const { data: session, error } = await supabase
      .from('test_sessions')
      .select('id, status, answers')
      .eq('id', parsed.data.sessionId)
      .maybeSingle()

    if (error) {
      logError('api.test.session.get.select_failed', { session_id: parsed.data.sessionId }, error)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось прочитать сессию')
    }
    if (!session) {
      return apiError(404, ERROR_CODES.SESSION_NOT_FOUND, 'Сессия не найдена')
    }
    if (session.status === 'completed') {
      return apiError(409, ERROR_CODES.SESSION_COMPLETED, 'Сессия уже завершена')
    }
    if (session.status === 'abandoned') {
      return apiError(409, ERROR_CODES.SESSION_ABANDONED, 'Сессия устарела. Пройдите тест заново')
    }

    const answers = parseStoredAnswers(session.answers)
    const scores = scoreAnswers(answers)

    return apiSuccess({
      session_id: session.id,
      next: computeNextStep(answers),
      progress: buildProgress(answers),
      matrix: buildMatrix(scores),
    })
  } catch (error) {
    return toApiErrorResponse(error, 'api.test.session.get.failed')
  }
}
