/** Типы ответов `/api/admin/*` (Чертёж.md, БЛОК 3, GROUP «Админ»). */

import type { EventType } from '@/types/domain'

export interface FunnelStep {
  key: EventType
  count: number
  cr_from_prev?: number
}

export interface FunnelResponse {
  period_days: number
  steps: FunnelStep[]
  mrr_kopecks: number
  active_clubs: number
}

export interface AdminLeadRow {
  id: string
  phone: string | null
  email: string | null
  telegram_id: number | null
  telegram_username: string | null
  full_name: string | null
  source: string
  enneagram_type: number | null
  wing: number | null
  subscribed_telegram: boolean
  consent_152fz: boolean
  created_at: string
}

export const LEAD_STAGES = ['captured', 'typed', 'telegram', 'club', 'waitlist'] as const
export type LeadStage = (typeof LEAD_STAGES)[number]
