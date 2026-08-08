/**
 * Запись событий воронки в `events` (Чертёж.md, БЛОК 2).
 *
 * Принцип: аналитика НЕ ломает основной поток. Если вставка события не удалась,
 * пользователь всё равно получает свой результат/лид — мы только пишем в лог.
 * Единственное исключение — вебхуки: там вставка события служит замком
 * идемпотентности, и её результат обязателен (для этого есть `insertEventStrict`).
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
  /** Ключ идемпотентности вебхука Salebot. Для внутренних событий не заполняется. */
  salebotEventId?: string | null
}

function toInsert(input: RecordEventInput) {
  return {
    event_type: input.eventType,
    lead_id: input.leadId ?? null,
    session_id: input.sessionId ?? null,
    metadata: (input.metadata ?? {}) as Json,
    salebot_event_id: input.salebotEventId ?? null,
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

/**
 * Пишет событие «жёстко» и возвращает флаг, была ли строка вставлена.
 * `false` при конфликте уникального `salebot_event_id` — это и есть сигнал
 * «событие уже обработано, повтор — no-op» для обработчиков вебхуков.
 */
export async function insertEventStrict(
  client: ServiceClient,
  input: RecordEventInput
): Promise<{ inserted: boolean; id: string | null }> {
  const { data, error } = await client.from('events').insert(toInsert(input)).select('id').single()

  if (error) {
    // 23505 — unique_violation по idx_events_salebot_event_id
    if (error.code === '23505') return { inserted: false, id: null }
    throw error
  }

  return { inserted: true, id: data.id }
}
