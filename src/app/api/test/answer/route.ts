/**
 * POST /api/test/answer — сохранить ответ и вернуть следующий шаг.
 * Чертёж.md, БЛОК 3, GROUP «Тест». Публичный роут, rate-limit 60/мин на IP.
 *
 * Роут намеренно stateless относительно клиента: единственный источник правды —
 * `test_sessions.answers` в БД. Поэтому F5 посреди теста восстанавливает
 * состояние без потерь (edge case 5), а «Назад» на фронте работает из локального
 * стейта и присылает сюда уже изменённый ответ.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { toApiErrorResponse } from '@/lib/errors'
import { logError } from '@/lib/logger'
import {
  applyAnswer,
  buildMatrix,
  buildProgress,
  computeNextStep,
  expectedQuestionId,
  isChoiceValid,
  parseStoredAnswers,
  scoreAnswers,
} from '@/lib/test-engine'
import type { Json } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  session_id: z.uuid(),
  question_id: z.string().min(2).max(40),
  choice: z.string().min(1).max(20),
})

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'test', RATE_LIMITS.test)
  if (limited) return limited

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Проверьте session_id, question_id и choice')
    }

    const { session_id: sessionId, question_id: questionId, choice } = parsed.data
    const supabase = createServiceClient()

    const { data: session, error: sessionError } = await supabase
      .from('test_sessions')
      .select('id, status, answers')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) {
      logError('api.test.answer.select_failed', { session_id: sessionId }, sessionError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось прочитать сессию')
    }
    if (!session) {
      return apiError(404, ERROR_CODES.SESSION_NOT_FOUND, 'Сессия не найдена')
    }
    if (session.status === 'completed') {
      return apiError(409, ERROR_CODES.SESSION_COMPLETED, 'Сессия уже завершена')
    }
    // Брошенную >24 ч сессию крон помечает abandoned (edge case 6): дописывать
    // в неё нельзя, но и «не найдена» — вранье, поэтому отдельный 409-код.
    if (session.status === 'abandoned') {
      return apiError(409, ERROR_CODES.SESSION_ABANDONED, 'Сессия устарела. Пройдите тест заново')
    }

    const answers = parseStoredAnswers(session.answers)

    // Принимаем либо ожидаемый сейчас вопрос, либо переответ на уже пройденный
    // (пользователь нажал «Назад»). Всё остальное — попытка подсунуть чужой шаг.
    const expected = expectedQuestionId(answers)
    const isRepeat = answers.some((answer) => answer.q === questionId)
    if (!isRepeat && questionId !== expected) {
      return apiError(
        422,
        ERROR_CODES.UNEXPECTED_QUESTION,
        'Этот вопрос сейчас не задаётся. Обновите страницу'
      )
    }

    if (!isChoiceValid(questionId, choice)) {
      return apiError(422, ERROR_CODES.INVALID_CHOICE, 'Такого варианта ответа нет')
    }

    const updatedAnswers = applyAnswer(answers, questionId, choice, new Date().toISOString())
    const scores = scoreAnswers(updatedAnswers)

    const { error: updateError } = await supabase
      .from('test_sessions')
      .update({
        answers: updatedAnswers as unknown as Json,
        axis_scores: scores as unknown as Json,
      })
      .eq('id', sessionId)
      .eq('status', 'in_progress')

    if (updateError) {
      logError('api.test.answer.update_failed', { session_id: sessionId, question_id: questionId }, updateError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось сохранить ответ')
    }

    return apiSuccess({
      next: computeNextStep(updatedAnswers),
      progress: buildProgress(updatedAnswers),
      matrix: buildMatrix(scores),
    })
  } catch (error) {
    return toApiErrorResponse(error, 'api.test.answer.failed')
  }
}
