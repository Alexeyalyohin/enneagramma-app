/**
 * Общие типы Supabase-клиентов. Отдельный файл, чтобы `client.ts`/`server.ts`/
 * `service.ts` остались ровно такими, какими их зафиксировала database-фаза.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/** Клиент с ключом `service_role` (обходит RLS). Только серверный код. */
export type ServiceClient = SupabaseClient<Database>

export type Tables = Database['public']['Tables']
export type LeadRow = Tables['leads']['Row']
export type LeadInsert = Tables['leads']['Insert']
export type LeadUpdate = Tables['leads']['Update']
export type TestSessionRow = Tables['test_sessions']['Row']
export type WaitlistEntryRow = Tables['waitlist_entries']['Row']
export type TypeDescriptionRow = Tables['type_descriptions']['Row']
export type EventInsert = Tables['events']['Insert']
