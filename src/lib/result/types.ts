/** Типы ответа `GET /api/test/result/[sessionId]` (Чертёж.md, БЛОК 3). */

export interface WingMeta {
  type: number
  title: string
  hint: string
}

export interface AlternativeTypeData {
  type: number
  title: string
  portrait_md: string | null
  short_summary: string | null
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
  /** Портрет раннер-апа — только когда выбор был близким (тай-брейк/низкая уверенность), иначе `null`. */
  alternative: AlternativeTypeData | null
}
