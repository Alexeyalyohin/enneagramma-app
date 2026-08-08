/** Типы ответа `GET /api/test/result/[sessionId]` (Чертёж.md, БЛОК 3). */

export interface WingMeta {
  type: number
  title: string
  hint: string
}

export interface TestResultData {
  type: number
  title: string
  wing: number
  confidence: number
  runner_up: number
  borderline: boolean
  social_triad: string
  harmonic_triad: string
  center: string
  portrait_md: string | null
  short_summary: string | null
  wings: { left: WingMeta; right: WingMeta } | null
  captured: boolean
}
