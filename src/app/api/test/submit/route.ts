/**
 * POST /api/test/submit — завершить сессию и посчитать тип.
 * Чертёж.md, БЛОК 3, GROUP «Тест». Публичный роут, rate-limit 60/мин на IP.
 *
 * Идемпотентность: повторный submit по уже завершённой сессии возвращает тот же
 * результат, а не 409. Это прямое требование edge case 2 — фронт ретраит submit
 * до трёх раз, и ретрай после успешного, но не дошедшего ответа не должен
 * выглядеть как ошибка.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess, readJsonBody } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { logError, logWarn } from '@/lib/logger'
import { applyTypeToLead } from '@/lib/leads/type-assignment'
import {
  computeResult,
  isReadyForResult,
  parseStoredAnswers,
  parseTestResult,
  scoreAnswers,
  type StoredAnswer,
  type TestResult,
} from '@/lib/test-engine'
import type { Json } from '@/types/database'
import { logInfo } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ session_id: z.uuid() })

function resultPayload(sessionId: string, result: TestResult) {
  return {
    session_id: sessionId,
    type: result.type,
    wing: result.wing,
    confidence: result.confidence,
    runner_up: result.runner_up,
    borderline: result.borderline,
    result_url: `/test/result/${sessionId}`,
  }
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'test', RATE_LIMITS.test)
  if (limited) return limited

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = bodySchema.safeParse(body.body)
    if (!parsed.success) {
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Некорректный session_id')
    }

    const sessionId = parsed.data.session_id
    const supabase = createServiceClient()

    const { data: session, error: sessionError } = await supabase
      .from('test_sessions')
      .select('id, status, answers, result, lead_id')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) {
      logError('api.test.submit.select_failed', { session_id: sessionId }, sessionError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось прочитать сессию')
    }
    if (!session) {
      return apiError(404, ERROR_CODES.SESSION_NOT_FOUND, 'Сессия не найдена')
    }

    if (session.status === 'completed') {
      const existing = parseTestResult(session.result)
      if (existing) return apiSuccess(resultPayload(sessionId, existing))
      // Статус completed без читаемого результата — пересчитываем ниже.
      logWarn('api.test.submit.completed_without_result', { session_id: sessionId })
    }

    if (session.status === 'abandoned') {
      return apiError(409, ERROR_CODES.SESSION_ABANDONED, 'Сессия устарела. Пройдите тест заново')
    }

    const answers = parseStoredAnswers(session.answers)
    // Готовность = все 15 базовых вопросов + разрешённые спорные пары + шаг
    // выбора портрета (см. computeNextStep в flow.ts) — не только счётчик 15.
    if (!isReadyForResult(answers)) {
      return apiError(422, ERROR_CODES.INSUFFICIENT_ANSWERS, 'Ответьте на все вопросы')
    }

    const scores = scoreAnswers(answers)
    const result = computeResult(answers)
    logDebugSnapshot(sessionId, answers, result)

    const { error: updateError } = await supabase
      .from('test_sessions')
      .update({
        status: 'completed',
        result: result as unknown as Json,
        axis_scores: scores as unknown as Json,
      })
      .eq('id', sessionId)

    if (updateError) {
      logError('api.test.submit.update_failed', { session_id: sessionId }, updateError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось сохранить результат')
    }

    await recordEvent(supabase, {
      eventType: 'test_completed',
      sessionId,
      leadId: session.lead_id,
      metadata: {
        type: result.type,
        wing: result.wing,
        confidence: result.confidence,
        borderline: result.borderline,
      },
    })

    // Сессия уже привязана к лиду (человек проходит тест повторно, будучи лидом) —
    // применяем правило уверенности. Для анонимной сессии это сделает /api/leads/capture.
    if (session.lead_id) {
      try {
        await applyTypeToLead(
          supabase,
          session.lead_id,
          { type: result.type, wing: result.wing, confidence: result.confidence },
          sessionId
        )
      } catch (error) {
        // Тип в лиде — вторичен по отношению к самому результату теста:
        // не даём этой ошибке съесть успешный submit.
        logError('api.test.submit.type_assignment_failed', { session_id: sessionId, lead_id: session.lead_id }, error)
      }
    }

    return apiSuccess(resultPayload(sessionId, result))
  } catch (error) {
    return toApiErrorResponse(error, 'api.test.submit.failed')
  }
}

/**
 * Диагностика прохождения — аналог `dataLine()` эталона (версия, тип,
 * раннер-ап, уверенность, поайтемный лог), но НЕ пользователю: только в
 * структурированный серверный лог, за фича-флагом `NEXT_PUBLIC_TEST_DEBUG`
 * (решение по Этапу 1 п.№8 — самоотчёт пользователю не показываем).
 * `NEXT_PUBLIC_`-префикс — только ради единообразия имени флага в `.env.local`
 * с остальными переключателями проекта; здесь переменная читается исключительно
 * на сервере, в клиентский бандл не идёт.
 */
function logDebugSnapshot(sessionId: string, answers: readonly StoredAnswer[], result: TestResult): void {
  if (process.env.NEXT_PUBLIC_TEST_DEBUG !== 'true') return

  const answersById = Object.fromEntries(answers.map((a) => [a.q, a.choice]))
  logInfo('test.debug_snapshot', {
    session_id: sessionId,
    version: result.version,
    type: result.type,
    runner_up: result.runner_up,
    confidence: result.confidence,
    borderline: result.borderline,
    switched: result.switched,
    tiebreak_path: result.tiebreak_path,
    answers: answersById,
  })
}
