/**
 * Расчёт осей, кандидат-типа, confidence, крыла и выбора спорной пары.
 * Чертёж.md, БЛОК 5, шаги 1–5.
 *
 * Всё здесь — чистые функции: одни и те же ответы всегда дают один и тот же
 * результат, без обращений к БД, времени и рандому. Это принципиально:
 * `computeNextStep` вызывается на каждом ответе и обязан быть воспроизводимым,
 * иначе спорная пара «прыгала» бы между запросами.
 */

import {
  CENTER_ORDER,
  HARMONIC_ORDER,
  SOCIAL_ORDER,
  TYPE_META,
  neighborsOf,
  pairKey,
  typeFromCell,
} from './grid'
import { CENTER_QUESTIONS, TRIAD_QUESTIONS, hasTiebreakPair } from './questions'
import type {
  AxisScores,
  Center,
  EnneagramType,
  HarmonicTriad,
  SocialTriad,
  StoredAnswer,
  TiebreakPairKey,
} from './types'

const SOCIAL_SET = new Set<string>(SOCIAL_ORDER)
const HARMONIC_SET = new Set<string>(HARMONIC_ORDER)
const CENTER_SET = new Set<string>(CENTER_ORDER)

const SOCIAL_QUESTION_IDS = new Set(
  TRIAD_QUESTIONS.filter((q) => q.axis === 'social').map((q) => q.id)
)
const HARMONIC_QUESTION_IDS = new Set(
  TRIAD_QUESTIONS.filter((q) => q.axis === 'harmonic').map((q) => q.id)
)
const CENTER_QUESTION_IDS = new Set(CENTER_QUESTIONS.map((q) => q.id))

export function emptyAxisScores(): AxisScores {
  return {
    social: { assertive: 0, compliant: 0, withdrawn: 0 },
    harmonic: { positive: 0, competency: 0, reactive: 0 },
    center: { gut: 0, heart: 0, head: 0 },
  }
}

/**
 * Считает баллы осей по сохранённым ответам.
 * Ответы на tiebreak-вопросы оси НЕ трогают — иначе выбор спорной пары
 * менялся бы прямо во время самого tiebreak.
 */
export function scoreAnswers(answers: readonly StoredAnswer[]): AxisScores {
  const scores = emptyAxisScores()

  for (const answer of answers) {
    if (SOCIAL_QUESTION_IDS.has(answer.q) && SOCIAL_SET.has(answer.choice)) {
      scores.social[answer.choice as SocialTriad] += 1
    } else if (HARMONIC_QUESTION_IDS.has(answer.q) && HARMONIC_SET.has(answer.choice)) {
      scores.harmonic[answer.choice as HarmonicTriad] += 1
    } else if (CENTER_QUESTION_IDS.has(answer.q) && CENTER_SET.has(answer.choice)) {
      scores.center[answer.choice as Center] += 1
    }
  }

  return scores
}

export interface AxisRank<TValue extends string> {
  /** Значения оси по убыванию баллов; ничьи разрешаются каноническим порядком. */
  ranked: TValue[]
  top: TValue
  runnerUp: TValue
  /** Отрыв лидера от второго места в баллах. */
  margin: number
}

/**
 * Ранжирование оси. Ничья разрешается фиксированным каноническим порядком
 * (`SOCIAL_ORDER` и т.д.) — детерминизм важнее «справедливости»: сам факт
 * ничьей всё равно обнулит margin и уронит confidence, а дальше сработает tiebreak.
 */
export function rankAxis<TValue extends string>(
  scores: Record<TValue, number>,
  order: readonly TValue[]
): AxisRank<TValue> {
  const ranked = [...order].sort((a, b) => {
    const diff = scores[b] - scores[a]
    if (diff !== 0) return diff
    return order.indexOf(a) - order.indexOf(b)
  })

  const top = ranked[0]
  const runnerUp = ranked[1]
  return { ranked, top, runnerUp, margin: scores[top] - scores[runnerUp] }
}

export type CenterVerdict = 'match' | 'conflict' | 'neutral'

/** Бонус центра из Чертежа: +0.1 при совпадении, −0.15 при конфликте. */
export const CENTER_BONUS: Record<CenterVerdict, number> = {
  match: 0.1,
  conflict: -0.15,
  neutral: 0,
}

/**
 * `confidence = clamp(0.5 + 0.5 * (margin_social + margin_harmonic) / 12 + center_bonus, 0, 1)`
 * (Чертёж, БЛОК 5, шаг 3). Максимум сырых баллов на ось — 6, поэтому знаменатель 12.
 */
export function computeConfidence(
  marginSocial: number,
  marginHarmonic: number,
  centerBonus: number
): number {
  const raw = 0.5 + (0.5 * (marginSocial + marginHarmonic)) / 12 + centerBonus
  return clamp01(round2(raw))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export interface BaseAssessment {
  scores: AxisScores
  social: AxisRank<SocialTriad>
  harmonic: AxisRank<HarmonicTriad>
  center: AxisRank<Center>
  candidate: EnneagramType
  /** Ближайший конкурент — с ним и идём в tiebreak, если он нужен. */
  runnerUp: EnneagramType
  centerVerdict: CenterVerdict
  confidence: number
  /** Чертёж: tiebreak нужен при `confidence < 0.7` ИЛИ нулевом отрыве по любой оси. */
  needsTiebreak: boolean
  /** Спорная пара из банка. `null` — если подходящей пары в банке нет. */
  tiebreakPair: TiebreakPairKey | null
}

/**
 * Базовая оценка по 12 триадам + чеку центра, до tiebreak.
 * Считается только из осевых баллов, поэтому стабильна на протяжении tiebreak.
 */
export function assessBase(scores: AxisScores): BaseAssessment {
  const social = rankAxis(scores.social, SOCIAL_ORDER)
  const harmonic = rankAxis(scores.harmonic, HARMONIC_ORDER)
  const center = rankAxis(scores.center, CENTER_ORDER)

  const candidate = typeFromCell(social.top, harmonic.top)

  // Ничья по центру (1/1/1) — не совпадение и не конфликт: сигнала просто нет.
  const centerVerdict: CenterVerdict =
    center.margin === 0 ? 'neutral' : center.top === TYPE_META[candidate].center ? 'match' : 'conflict'

  const confidence = computeConfidence(social.margin, harmonic.margin, CENTER_BONUS[centerVerdict])
  const alternatives = rankAlternatives(candidate, social, harmonic, center, centerVerdict)

  const runnerUp = alternatives[0] ?? candidate
  const tiebreakPair: TiebreakPairKey | null =
    alternatives.map((alt) => pairKey(candidate, alt)).find((key) => hasTiebreakPair(key)) ?? null

  return {
    scores,
    social,
    harmonic,
    center,
    candidate,
    runnerUp,
    centerVerdict,
    confidence,
    needsTiebreak: confidence < 0.7 || social.margin === 0 || harmonic.margin === 0,
    tiebreakPair,
  }
}

/**
 * Конкуренты кандидата, от самого спорного к менее спорному.
 *
 * 1. Соседние ячейки по той оси, где отрыв меньше (главный источник спорности).
 * 2. Если обе оси дали нулевой отрыв — сначала диагональ: спорны обе оси разом
 *    (это единственный случай, когда осмысленна пара вроде `2_3`).
 * 3. Если центр конфликтует — типы той же строки/столбца, чей центр совпал
 *    с измеренным: центр говорит, что мы промахнулись именно ячейкой.
 */
function rankAlternatives(
  candidate: EnneagramType,
  social: AxisRank<SocialTriad>,
  harmonic: AxisRank<HarmonicTriad>,
  center: AxisRank<Center>,
  centerVerdict: CenterVerdict
): EnneagramType[] {
  const bySocial = typeFromCell(social.runnerUp, harmonic.top)
  const byHarmonic = typeFromCell(social.top, harmonic.runnerUp)

  const ordered: EnneagramType[] =
    social.margin <= harmonic.margin ? [bySocial, byHarmonic] : [byHarmonic, bySocial]

  if (social.margin === 0 && harmonic.margin === 0) {
    ordered.unshift(typeFromCell(social.runnerUp, harmonic.runnerUp))
  }

  if (centerVerdict === 'conflict') {
    const sameRow = HARMONIC_ORDER.map((h) => typeFromCell(social.top, h))
    const sameColumn = SOCIAL_ORDER.map((s) => typeFromCell(s, harmonic.top))
    for (const type of [...sameRow, ...sameColumn]) {
      if (TYPE_META[type].center === center.top) ordered.push(type)
    }
  }

  return dedupe(ordered.filter((type) => type !== candidate))
}

function dedupe(types: EnneagramType[]): EnneagramType[] {
  return [...new Set(types)]
}

/**
 * Крыло — сосед по кругу (`type ± 1`), «чьи оси ближе к вторичным баллам»
 * (Чертёж, шаг 5).
 *
 * Эвристика v0.4: сосед получает сумму сырых баллов по своим осям плюс
 * половину балла своего центра (центр — сигнал более слабый, три вопроса
 * против двенадцати). Ничья разрешается в пользу правого соседа (`type + 1`) —
 * ради детерминизма, содержательного предпочтения тут нет.
 */
export function pickWing(type: EnneagramType, scores: AxisScores): EnneagramType {
  const [left, right] = neighborsOf(type)

  const weight = (neighbor: EnneagramType): number => {
    const meta = TYPE_META[neighbor]
    return scores.social[meta.social] + scores.harmonic[meta.harmonic] + 0.5 * scores.center[meta.center]
  }

  return weight(left) > weight(right) ? left : right
}
