/**
 * Расчёт осей, кандидат-типа, пошагового нокаута спорных пар, confidence и
 * крыла. Перенесено 1-в-1 из эталона `ennea-test-v1_0.html` (функции
 * `classify`, `finishBase`, `buildTies`/`startTie`/`endTie`/`dropLoser`,
 * `computeConfidence`, `support`/`wingText`) под stateless-архитектуру
 * приложения: эталон держит состояние в переменной браузера и идёт вперёд
 * шаг за шагом, здесь то же самое пересчитывается заново из сохранённых
 * ответов на каждый запрос — это чистые функции, детерминированные при
 * одинаковом входе.
 *
 * Проверено на 9 эталонных профилях (по одному на тип, скрипт в
 * scripts/verify-test-engine.ts на момент переноса, не хранится в репозитории
 * постоянно) — тип/крыло/уверенность совпадают с ручным прогоном эталона.
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
import { CENTER_QUESTIONS, TIEBREAK_ITEMS, TRIAD_QUESTIONS } from './questions'
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

const SOCIAL_QUESTION_IDS = new Set(TRIAD_QUESTIONS.filter((q) => q.axis === 'social').map((q) => q.id))
const HARMONIC_QUESTION_IDS = new Set(TRIAD_QUESTIONS.filter((q) => q.axis === 'harmonic').map((q) => q.id))
const CENTER_QUESTION_IDS = new Set(CENTER_QUESTIONS.map((q) => q.id))

export function emptyAxisScores(): AxisScores {
  return {
    social: { assertive: 0, compliant: 0, withdrawn: 0 },
    harmonic: { positive: 0, competency: 0, reactive: 0 },
    center: { gut: 0, heart: 0, head: 0 },
  }
}

/** Считает баллы осей по сохранённым ответам на 15 базовых вопросов. */
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

// ============================================================================
// 1. classify() — эталон: high (лидер ≥4 и отрыв ≥2) / low (ровно 2/2/2) / medium
// ============================================================================

export type AxisLevel = 'high' | 'medium' | 'low'

export interface AxisClassification<TValue extends string> {
  level: AxisLevel
  /** Полюсы, прошедшие в кандидаты: 1 (high), 2 (medium) или все 3 (low). */
  poles: TValue[]
  /** Полное ранжирование по убыванию счёта, ничьи — по каноническому порядку. */
  sorted: { key: TValue; value: number }[]
}

export function classifyAxis<TValue extends string>(
  counts: Record<TValue, number>,
  order: readonly TValue[]
): AxisClassification<TValue> {
  const sorted = [...order]
    .map((key) => ({ key, value: counts[key] }))
    .sort((a, b) => b.value - a.value || order.indexOf(a.key) - order.indexOf(b.key))

  const top = sorted[0]
  const second = sorted[1]

  if (top.value >= 4 && top.value - second.value >= 2) {
    return { level: 'high', poles: [top.key], sorted }
  }
  if (sorted[0].value === 2 && sorted[1].value === 2 && sorted[2].value === 2) {
    return { level: 'low', poles: [...order], sorted }
  }
  return { level: 'medium', poles: [top.key, second.key], sorted }
}

// ============================================================================
// 2. finishBase() — сверка с центром, при конфликте — понижение high→medium
// ============================================================================

export type CenterFlag = 'ok' | 'conflict' | 'split'

export interface BaseState {
  socialPoles: SocialTriad[]
  socialLevel: AxisLevel
  harmPoles: HarmonicTriad[]
  harmLevel: AxisLevel
  centerFlag: CenterFlag
}

export interface BaseAssessment extends BaseState {
  scores: AxisScores
  social: AxisClassification<SocialTriad>
  harmonic: AxisClassification<HarmonicTriad>
  center: AxisClassification<Center>
}

export function assessBase(scores: AxisScores): BaseAssessment {
  const social = classifyAxis(scores.social, SOCIAL_ORDER)
  const harmonic = classifyAxis(scores.harmonic, HARMONIC_ORDER)
  const center = classifyAxis(scores.center, CENTER_ORDER)

  let socialPoles = social.poles
  let socialLevel = social.level
  let harmPoles = harmonic.poles
  let harmLevel = harmonic.level

  const declared = center.level === 'low' ? null : center.sorted[0].key
  const candidates: EnneagramType[] = []
  for (const s of socialPoles) for (const h of harmPoles) candidates.push(typeFromCell(s, h))

  let centerFlag: CenterFlag
  if (declared === null) {
    centerFlag = 'split'
  } else if (candidates.some((t) => TYPE_META[t].center === declared)) {
    centerFlag = 'ok'
  } else {
    centerFlag = 'conflict'
    if (socialLevel === 'high' && social.sorted[1]) {
      socialPoles = [social.sorted[0].key, social.sorted[1].key]
      socialLevel = 'medium'
    } else if (harmLevel === 'high' && harmonic.sorted[1]) {
      harmPoles = [harmonic.sorted[0].key, harmonic.sorted[1].key]
      harmLevel = 'medium'
    }
  }

  return { scores, social, harmonic, center, socialPoles, socialLevel, harmPoles, harmLevel, centerFlag }
}

// ============================================================================
// 3. buildTies()/startTie()/dropLoser() — пошаговый нокаут спорных пар.
//    Чистая реализация: воспроизводит цепочку эталона по уже отвеченным
//    tiebreak-вопросам, не храня промежуточное состояние нигде, кроме answers.
// ============================================================================

export interface TieRound {
  pair: TiebreakPairKey
  typeA: EnneagramType
  typeB: EnneagramType
  votesA: number
  votesB: number
  winner: EnneagramType
  loser: EnneagramType
}

export type TieResolution =
  | { done: true; socialPole: SocialTriad; harmPole: HarmonicTriad; log: TieRound[] }
  | { done: false; nextQuestionId: string; pair: TiebreakPairKey }

function sortPolesByScore<TValue extends string>(
  poles: readonly TValue[],
  scores: Record<TValue, number>,
  order: readonly TValue[]
): TValue[] {
  return [...poles].sort((a, b) => scores[b] - scores[a] || order.indexOf(a) - order.indexOf(b))
}

/**
 * Голосование по банку из 3 вопросов пары. Эталон решает раунд, только когда
 * заданы все 3 (majority vote), не адаптивно — в отличие от версии v0.4.
 * Если банка для пары нет (в переносе такого не бывает — все 18 реально
 * достижимых пар покрыты), эталон отдаёт победу «типу A» без вопросов.
 */
function tallyPairVotes(
  typeA: EnneagramType,
  typeB: EnneagramType,
  answered: ReadonlyMap<string, string>
): { done: true; round: TieRound } | { done: false; nextQuestionId: string } {
  const key = pairKey(typeA, typeB)
  const items = TIEBREAK_ITEMS[key]

  if (!items) {
    return {
      done: true,
      round: { pair: key, typeA, typeB, votesA: 0, votesB: 0, winner: typeA, loser: typeB },
    }
  }

  let votesA = 0
  let votesB = 0
  for (const item of items) {
    const choice = answered.get(item.id)
    if (choice === undefined) return { done: false, nextQuestionId: item.id }
    if (choice === String(typeA)) votesA += 1
    else if (choice === String(typeB)) votesB += 1
  }

  const winner = votesA >= votesB ? typeA : typeB
  const loser = winner === typeA ? typeB : typeA
  return { done: true, round: { pair: key, typeA, typeB, votesA, votesB, winner, loser } }
}

/**
 * Пошаговый нокаут: сначала полностью разрешает гармоническую ось (фиксируя
 * лучший социальный полюс), затем — если он тоже был спорным — социальную
 * (фиксируя уже разрешённый гармонический). Может понадобиться больше одного
 * раунда на ось, если на ней была тройная ничья (`low`) — эталон в этом
 * случае сравнивает первые два полюса по каноническому порядку, а третий
 * возвращается в игру, если первый раунд его не исключил.
 */
export function resolveTies(
  socialPolesIn: readonly SocialTriad[],
  harmPolesIn: readonly HarmonicTriad[],
  scores: AxisScores,
  answered: ReadonlyMap<string, string>
): TieResolution {
  let socialPoles = sortPolesByScore(socialPolesIn, scores.social, SOCIAL_ORDER)
  let harmPoles = sortPolesByScore(harmPolesIn, scores.harmonic, HARMONIC_ORDER)
  const log: TieRound[] = []

  for (;;) {
    if (harmPoles.length > 1) {
      const row = socialPoles[0]
      const typeA = typeFromCell(row, harmPoles[0])
      const typeB = typeFromCell(row, harmPoles[1])
      const outcome = tallyPairVotes(typeA, typeB, answered)
      if (!outcome.done) return { done: false, nextQuestionId: outcome.nextQuestionId, pair: pairKey(typeA, typeB) }
      log.push(outcome.round)
      harmPoles = harmPoles.filter((pole) => typeFromCell(row, pole) !== outcome.round.loser)
      continue
    }
    if (socialPoles.length > 1) {
      const col = harmPoles[0]
      const typeA = typeFromCell(socialPoles[0], col)
      const typeB = typeFromCell(socialPoles[1], col)
      const outcome = tallyPairVotes(typeA, typeB, answered)
      if (!outcome.done) return { done: false, nextQuestionId: outcome.nextQuestionId, pair: pairKey(typeA, typeB) }
      log.push(outcome.round)
      socialPoles = socialPoles.filter((pole) => typeFromCell(pole, col) !== outcome.round.loser)
      continue
    }
    break
  }

  return { done: true, socialPole: socialPoles[0], harmPole: harmPoles[0], log }
}

// ============================================================================
// 4. buildFinalists() — победитель + второй финалист (для шага выбора портрета)
// ============================================================================

export interface Finalists {
  winner: EnneagramType
  runnerUp: EnneagramType
}

function supportScore(type: EnneagramType, scores: AxisScores): number {
  const meta = TYPE_META[type]
  return scores.social[meta.social] + scores.harmonic[meta.harmonic]
}

/**
 * Второй финалист: если был нокаут — последний проигравший; если нокаута не
 * было вовсе (обе оси сразу `high`) — сосед по кругу Эннеаграммы с большей
 * суммой сырых баллов (без веса центра — так в эталоне).
 */
export function buildFinalists(
  socialPole: SocialTriad,
  harmPole: HarmonicTriad,
  tieLog: readonly TieRound[],
  scores: AxisScores
): Finalists {
  const winner = typeFromCell(socialPole, harmPole)

  if (tieLog.length > 0) {
    return { winner, runnerUp: tieLog[tieLog.length - 1].loser }
  }

  const [left, right] = neighborsOf(winner)
  const runnerUp = supportScore(left, scores) >= supportScore(right, scores) ? left : right
  return { winner, runnerUp }
}

// ============================================================================
// 5. computeConfidence() — формула эталона 1-в-1: старт 88, дискретные штрафы,
//    потолок 55 при переопределении портрета, клэмп [45, 92].
// ============================================================================

export interface ConfidenceInputs {
  socialLevel: AxisLevel
  harmLevel: AxisLevel
  centerFlag: CenterFlag
  tieLog: readonly TieRound[]
  /** Пользователь на шаге выбора портрета выбрал НЕ алгоритмического победителя. */
  switched: boolean
}

/** Хранится как доля [0,1] (совместимость со схемой `test_sessions.result`/API), не как проценты [45,92]. */
export function computeConfidence(inputs: ConfidenceInputs): number {
  let c = 88
  if (inputs.socialLevel === 'medium') c -= 8
  if (inputs.socialLevel === 'low') c -= 16
  if (inputs.harmLevel === 'medium') c -= 8
  if (inputs.harmLevel === 'low') c -= 16
  if (inputs.centerFlag === 'conflict') c -= 12
  if (inputs.centerFlag === 'split') c -= 5

  // «Узкая» победа 2:1 в раунде нокаута — тот же сигнал, что и строковая
  // проверка `":2"`/`":1"` в эталоне: при 3 голосах это ровно случай (2,1).
  for (const round of inputs.tieLog) {
    if (Math.min(round.votesA, round.votesB) === 1) c -= 5
  }

  if (inputs.switched) c = Math.min(c, 55)

  const clamped = Math.max(45, Math.min(92, Math.round(c)))
  return clamped / 100
}

/** Порог «неустойчивого» результата — 62%, из эталона (было 60% в v0.4). */
export const BORDERLINE_THRESHOLD = 0.62

// ============================================================================
// 6. wing/support() — крыло по сумме сырых баллов соседа (без веса центра).
// ============================================================================

/**
 * Крыло финального типа. При равной поддержке эталон не форсирует выбор
 * (текст «выражены примерно поровну») — здесь нужен конкретный тип для
 * `leads.wing`, поэтому равенство разрешается в пользу правого соседа
 * (`type+1`), как и в v0.4: детерминированный дефолт без содержательного
 * предпочтения.
 */
export function pickWing(type: EnneagramType, scores: AxisScores): EnneagramType {
  const [left, right] = neighborsOf(type)
  return supportScore(left, scores) > supportScore(right, scores) ? left : right
}
