/**
 * GET /api/test/result/[sessionId] — публичный результат теста + портрет типа.
 * Чертёж.md, БЛОК 3, GROUP «Тест». Публичный роут, rate-limit 60/мин на IP.
 *
 * БЕЗОПАСНОСТЬ (edge case 10): по чужому/подобранному `sessionId` отдаём ТОЛЬКО
 * публичную часть — тип, крыло, уверенность и редакционный портрет. Ни телефона,
 * ни email, ни telegram, ни идентификатора лида здесь быть не может. Флаг
 * `captured` — единственное, что говорит о лиде, и он булев: он нужен фронту,
 * чтобы решить, показывать ли форму захвата.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiSuccess } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { recordEvent } from '@/lib/events'
import { toApiErrorResponse } from '@/lib/errors'
import { logError, logWarn } from '@/lib/logger'
import { TYPE_META, parseTestResult } from '@/lib/test-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ sessionId: z.uuid() })

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const limited = enforceRateLimit(request, 'test', RATE_LIMITS.test)
  if (limited) return limited

  try {
    const parsed = paramsSchema.safeParse(await context.params)
    // Кривой id и несуществующая сессия отвечают одинаково: не подтверждаем
    // существование чужих сессий даже косвенно, кодом ошибки.
    if (!parsed.success) {
      return apiError(404, ERROR_CODES.RESULT_NOT_READY, 'Тест не завершён')
    }

    const sessionId = parsed.data.sessionId
    const supabase = createServiceClient()

    const { data: session, error: sessionError } = await supabase
      .from('test_sessions')
      .select('id, status, result, lead_id')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) {
      logError('api.test.result.select_failed', { session_id: sessionId }, sessionError)
      return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось прочитать результат')
    }

    if (!session || session.status !== 'completed') {
      return apiError(404, ERROR_CODES.RESULT_NOT_READY, 'Тест не завершён')
    }

    const result = parseTestResult(session.result)
    if (!result) {
      logWarn('api.test.result.unreadable_result', { session_id: sessionId })
      return apiError(404, ERROR_CODES.RESULT_NOT_READY, 'Тест не завершён')
    }

    const { data: description, error: descriptionError } = await supabase
      .from('type_descriptions')
      .select('type, title, social_triad, harmonic_triad, center, portrait_md, short_summary, wings')
      .eq('type', result.type)
      .maybeSingle()

    if (descriptionError) {
      logError('api.test.result.description_failed', { session_id: sessionId, type: result.type }, descriptionError)
    }

    // Описания типов — редакционный контент. Если сид ещё не залит, отдаём
    // результат с заголовком из движка, а не 500: тип посчитан, он корректен.
    if (!description) {
      logWarn('api.test.result.description_missing', { type: result.type })
    }

    await recordEvent(supabase, {
      eventType: 'result_viewed',
      sessionId,
      leadId: session.lead_id,
      metadata: { type: result.type },
    })

    return apiSuccess({
      type: result.type,
      title: description?.title ?? TYPE_META[result.type].title,
      wing: result.wing,
      confidence: result.confidence,
      runner_up: result.runner_up,
      borderline: result.borderline,
      social_triad: description?.social_triad ?? TYPE_META[result.type].social,
      harmonic_triad: description?.harmonic_triad ?? TYPE_META[result.type].harmonic,
      center: description?.center ?? TYPE_META[result.type].center,
      portrait_md: description?.portrait_md ?? null,
      short_summary: description?.short_summary ?? null,
      wings: description?.wings ?? null,
      captured: session.lead_id !== null,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'api.test.result.failed')
  }
}
