import { z } from 'zod'
import { AppError } from '@/lib/errors'
import { logError } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'

const sessionIdSchema = z.uuid()

/** Общая проверка ссылки для серверной страницы результата и публичного API. */
export async function readResultSession(sessionId: string) {
  if (!sessionIdSchema.safeParse(sessionId).success) return null

  const { data, error } = await createServiceClient()
    .from('test_sessions')
    .select('id, status, result, lead_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) {
    logError('test.result.session_select_failed', { session_id: sessionId }, error)
    throw new AppError('INTERNAL_ERROR', 'Не удалось прочитать результат', 500)
  }

  return data
}
