/**
 * Запись событий воронки в `events` (Чертёж.md, БЛОК 2).
 *
 * Принцип: аналитика НЕ ломает основной поток. Если вставка события не удалась,
 * пользователь всё равно получает свой результат/лид — мы только пишем в лог.
 */

import type { EventType } from '@/types/domain'
import type { Json } from '@/types/database'
import type { ServiceClient } from '@/lib/supabase/types'
import { logError } from '@/lib/logger'

export interface RecordEventInput {
  eventType: EventType
  leadId?: string | null
  sessionId?: string | null
  metadata?: Record<string, unknown>
}

function toInsert(input: RecordEventInput) {
  return {
    event_type: input.eventType,
    lead_id: input.leadId ?? null,
    session_id: input.sessionId ?? null,
    metadata: (input.metadata ?? {}) as Json,
  }
}

/** Пишет событие «мягко»: ошибка логируется, но не всплывает наверх. */
export async function recordEvent(client: ServiceClient, input: RecordEventInput): Promise<void> {
  const { error } = await client.from('events').insert(toInsert(input))

  if (error) {
    logError('events.record_failed', {
      event_type: input.eventType,
      lead_id: input.leadId ?? null,
      session_id: input.sessionId ?? null,
      pg_code: error.code,
    }, error)
  }
}
