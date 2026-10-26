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
