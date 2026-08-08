/**
 * Типы движка теста v0.4 (Чертёж.md, БЛОК 5 «Алгоритм определения типа»).
 * Только типы — никакой логики и никаких побочных эффектов.
 */

import type { Center, HarmonicTriad, SocialTriad } from '@/types/domain'

export type { Center, HarmonicTriad, SocialTriad }

export const ENNEAGRAM_TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
export type EnneagramType = (typeof ENNEAGRAM_TYPES)[number]

/** Версия механики. Пишется в `test_sessions.version` — результаты версий несопоставимы. */
export const TEST_VERSION = 'v0.4'

/** Минимум ответов до расчёта результата: 12 триад + 3 вопроса центра. */
export const MIN_ANSWERS = 15

/** Ось, которую грузит вопрос. `center` — блок чека центра. */
export type QuestionAxis = 'social' | 'harmonic' | 'center'

export interface QuestionOption<TValue extends string = string> {
  value: TValue
  label: string
}

export interface TriadQuestion {
  id: string
  axis: QuestionAxis
  prompt: string
  options: QuestionOption[]
}

/** Ключ спорной пары, всегда «меньший_больший»: `4_5`, а не `5_4`. */
export type TiebreakPairKey = `${number}_${number}`

export interface TiebreakQuestion {
  id: string
  pair: TiebreakPairKey
  prompt: string
  /** Ровно два варианта; `value` — номер типа строкой. */
  options: QuestionOption[]
}

/** Ответ в том виде, в каком лежит в `test_sessions.answers` (JSONB). */
export interface StoredAnswer {
  q: string
  choice: string
  at: string
}

export interface AxisScores {
  social: Record<SocialTriad, number>
  harmonic: Record<HarmonicTriad, number>
  center: Record<Center, number>
}

/** Что кладём в `test_sessions.result` (JSONB). */
export interface TestResult {
  type: EnneagramType
  wing: EnneagramType
  confidence: number
  runner_up: EnneagramType
  /** Идентификаторы заданных tiebreak-вопросов в порядке предъявления. */
  tiebreak_path: string[]
  /** `confidence < 0.6` после tiebreak — честно помечаем пограничность (edge case 8). */
  borderline: boolean
  version: string
}

/**
 * Следующий шаг для клиента. Вопросы центра намеренно едут тем же `kind: 'triad'`:
 * по контракту Чертежа (БЛОК 3) видов ровно три — triad / tiebreak / ready,
 * а вопрос центра — такая же форсированная тройка вариантов. Различить их
 * можно по полю `axis`, если UI захочет подсветить блок иначе.
 */
export type NextStep =
  | {
      kind: 'triad'
      question_id: string
      axis: QuestionAxis
      prompt: string
      options: QuestionOption[]
    }
  | {
      kind: 'tiebreak'
      pair: TiebreakPairKey
      question_id: string
      prompt: string
      options: QuestionOption[]
    }
  | { kind: 'ready' }

export interface TestProgress {
  answered: number
  total_min: number
}

/** Живая матрица для визуализации сетки 3×3 на фронте. */
export interface MatrixSnapshot {
  social: Record<SocialTriad, number>
  harmonic: Record<HarmonicTriad, number>
  center: Record<Center, number>
}
