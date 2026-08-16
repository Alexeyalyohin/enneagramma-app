/**
 * Правило записи типа в лид (Чертёж.md, БЛОК 5):
 * «`enneagram_type` перезаписывается только если был NULL или пришёл более
 * уверенный результат (`confidence` выше)».
 *
 * Отдельной колонки под confidence в `leads` нет (и это правильно: у лида не
 * одна попытка). Поэтому «прошлая уверенность» берётся из завершённых сессий
 * этого лида — они и есть история измерений.
 */

import { parseTestResult } from '@/lib/test-engine'
import { logWarn } from '@/lib/logger'
import type { ServiceClient } from '@/lib/supabase/types'
import type { EnneagramType } from '@/lib/test-engine'

export interface TypeAssignmentInput {
  type: EnneagramType
  wing: EnneagramType
  confidence: number
}

export interface TypeAssignmentOutcome {
  applied: boolean
  reason: 'was_null' | 'more_confident' | 'kept_existing'
  previousConfidence: number | null
}

/**
 * Проставляет тип лиду, если это разрешено правилом уверенности.
 * @param exceptSessionId сессия, результат которой мы сейчас применяем —
 *                        её из истории исключаем, иначе сравним результат сам с собой.
 */
export async function applyTypeToLead(
  client: ServiceClient,
  leadId: string,
  input: TypeAssignmentInput,
  exceptSessionId?: string
): Promise<TypeAssignmentOutcome> {
  const { data: lead, error: leadError } = await client
    .from('leads')
    .select('id, enneagram_type')
    .eq('id', leadId)
    .maybeSingle()
  if (leadError) throw leadError
  if (!lead) {
    logWarn('leads.type_assignment_lead_missing', { lead_id: leadId })
    return { applied: false, reason: 'kept_existing', previousConfidence: null }
  }

  if (lead.enneagram_type === null) {
    await writeType(client, leadId, input)
    return { applied: true, reason: 'was_null', previousConfidence: null }
  }

  const previousConfidence = await bestConfidenceAmong(client, leadId, exceptSessionId)

  if (previousConfidence === null || input.confidence > previousConfidence) {
    await writeType(client, leadId, input)
    return { applied: true, reason: 'more_confident', previousConfidence }
  }

  return { applied: false, reason: 'kept_existing', previousConfidence }
}

/**
 * Уверенность (0..1), которой соответствует ТЕКУЩИЙ активный тип лида —
 * для отображения (например, боту Salebot), не для правила присвоения выше.
 *
 * Работает благодаря инварианту `applyTypeToLead`: тип лида переписывается
 * только когда новая confidence строго больше всех предыдущих, поэтому
 * текущий тип всегда — тип сессии с ГЛОБАЛЬНЫМ максимумом confidence среди
 * завершённых сессий лида.
 */
export async function currentTypeConfidence(client: ServiceClient, leadId: string): Promise<number | null> {
  return bestConfidenceAmong(client, leadId)
}

async function writeType(
  client: ServiceClient,
  leadId: string,
  input: TypeAssignmentInput
): Promise<void> {
  const { error } = await client
    .from('leads')
    .update({ enneagram_type: input.type, wing: input.wing })
    .eq('id', leadId)
  if (error) throw error
}

/** Максимальная уверенность среди завершённых сессий лида (опц. кроме одной). */
async function bestConfidenceAmong(
  client: ServiceClient,
  leadId: string,
  exceptSessionId?: string
): Promise<number | null> {
  let query = client
    .from('test_sessions')
    .select('id, result')
    .eq('lead_id', leadId)
    .eq('status', 'completed')
    .not('result', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)

  if (exceptSessionId) query = query.neq('id', exceptSessionId)

  const { data, error } = await query
  if (error) throw error
  if (!data || data.length === 0) return null

  let best: number | null = null
  for (const row of data) {
    const result = parseTestResult(row.result)
    if (result && (best === null || result.confidence > best)) best = result.confidence
  }
  return best
}
