/**
 * Правило записи типа в лид.
 *
 * ОТСТУПЛЕНИЕ ОТ ЧЕРТЕЖА (осознанное, подтверждено владельцем 2026-08-19).
 * Чертёж.md:791 предписывал: «`enneagram_type` перезаписывается только если
 * был NULL или пришёл более уверенный результат (`confidence` выше)». На
 * практике это давало контринтуитивный результат: если самая первая попытка
 * случайно оказывалась самой уверенной, лид застревал на её типе НАВСЕГДА —
 * бот показывал результат многолетней давности, сколько бы раз человек ни
 * пересдавал тест. Правило заменено на простое: побеждает последнее по
 * времени ЗАВЕРШЁННОЕ прохождение, confidence в сравнении не участвует.
 */

import { logWarn } from '@/lib/logger'
import { parseTestResult } from '@/lib/test-engine'
import type { ServiceClient } from '@/lib/supabase/types'
import type { EnneagramType } from '@/lib/test-engine'

export interface TypeAssignmentInput {
  type: EnneagramType
  wing: EnneagramType
  confidence: number
}

export interface TypeAssignmentOutcome {
  applied: boolean
  reason: 'was_null' | 'newer_result'
}

/** Проставляет лиду тип последнего завершённого прохождения — безусловно. */
export async function applyTypeToLead(
  client: ServiceClient,
  leadId: string,
  input: TypeAssignmentInput
): Promise<TypeAssignmentOutcome> {
  const { data: lead, error: leadError } = await client
    .from('leads')
    .select('id, enneagram_type')
    .eq('id', leadId)
    .maybeSingle()
  if (leadError) throw leadError
  if (!lead) {
    logWarn('leads.type_assignment_lead_missing', { lead_id: leadId })
    return { applied: false, reason: 'newer_result' }
  }

  const reason = lead.enneagram_type === null ? 'was_null' : 'newer_result'
  await writeType(client, leadId, input)
  return { applied: true, reason }
}

export interface CurrentResultSummary {
  /** Уверенность (0..1) — на самом деле «насколько чётко разошлись два кандидата», не «уверенность именно в этом типе» (см. closeCall). */
  confidence: number
  /**
   * Был тай-брейк между кандидатами ИЛИ итоговая уверенность ниже порога
   * (edge case 8) — тот же признак «близкого выбора», что решает, показывать
   * ли альтернативный портрет на экране результата (`/api/test/result`).
   * Когда true, `confidence` нельзя подписывать как «уверенность в типе X» —
   * это уверенность в разрыве между X и вторым кандидатом, не в самом X.
   */
  closeCall: boolean
}

/**
 * Confidence/closeCall ПОСЛЕДНЕГО по времени завершённого прохождения лида —
 * им же, по правилу в `applyTypeToLead`, определён текущий `enneagram_type`/
 * `wing`. Для отображения (например, боту Salebot), не для бизнес-правила.
 */
export async function currentResultSummary(client: ServiceClient, leadId: string): Promise<CurrentResultSummary | null> {
  const { data, error } = await client
    .from('test_sessions')
    .select('result')
    .eq('lead_id', leadId)
    .eq('status', 'completed')
    .not('result', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const result = parseTestResult(data.result)
  if (!result) return null

  return {
    confidence: result.confidence,
    closeCall: result.tiebreak_path.length > 0 || result.borderline,
  }
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
