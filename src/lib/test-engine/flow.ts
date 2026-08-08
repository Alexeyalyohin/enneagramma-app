/**
 * Адаптивный поток теста: какой вопрос следующий и какой итог.
 * Чертёж.md, БЛОК 5, шаги 1–6.
 *
 * Порядок предъявления: 12 триад → 3 вопроса центра → 0–2 tiebreak → ready.
 * Чистые функции: состояние живёт в `test_sessions.answers`, движок его только читает.
 */

import {
  ORDERED_BASE_QUESTIONS,
  TIEBREAK_ITEMS,
  findBaseQuestion,
  findTiebreakQuestion,
} from './questions'
import { assessBase, pickWing, scoreAnswers } from './scoring'
import { neighborsOf, otherInPair } from './grid'
import {
  MIN_ANSWERS,
  TEST_VERSION,
  type AxisScores,
  type EnneagramType,
  type MatrixSnapshot,
  type NextStep,
  type StoredAnswer,
  type TestProgress,
  type TestResult,
} from './types'

const BASE_QUESTION_IDS = new Set(ORDERED_BASE_QUESTIONS.map((q) => q.id))

/**
 * Правки очков после tiebreak. Чертёж задаёт факт корректировки, но не числа —
 * значения ниже подобраны так, чтобы:
 *   • согласие с кандидатом уверенно перебрасывало через порог 0.7;
 *   • «раскол» 1:1 оставлял результат в пограничной зоне (edge case 8);
 *   • победа конкурента давала умеренный, а не завышенный прирост.
 */
const TIEBREAK_DELTA = {
  /** Первый же вопрос подтвердил кандидата. */
  confirmed: 0.15,
  /** Оба вопроса ушли конкуренту — меняем тип. */
  flipped: 0.1,
  /** 1:1 — неопределённость подтвердилась. */
  split: -0.05,
} as const

export interface TiebreakOutcome {
  finalType: EnneagramType
  /** Второй тип пары — он и станет `runner_up`. */
  other: EnneagramType
  confidenceDelta: number
  /** Идентификаторы фактически заданных tiebreak-вопросов. */
  path: string[]
  /** Tiebreak доигран до конца. */
  resolved: boolean
}

function answersMap(answers: readonly StoredAnswer[]): Map<string, string> {
  return new Map<string, string>(answers.map((answer) => [answer.q, answer.choice] as const))
}

/** Сколько базовых вопросов (триады + центр) уже отвечено. */
export function countBaseAnswers(answers: readonly StoredAnswer[]): number {
  return answers.filter((answer) => BASE_QUESTION_IDS.has(answer.q)).length
}

export function buildProgress(answers: readonly StoredAnswer[]): TestProgress {
  return { answered: countBaseAnswers(answers), total_min: MIN_ANSWERS }
}

export function buildMatrix(scores: AxisScores): MatrixSnapshot {
  return { social: scores.social, harmonic: scores.harmonic, center: scores.center }
}

/**
 * Следующий шаг по уже сохранённым ответам.
 *
 * Адаптивность tiebreak: первый вопрос пары задаём всегда, второй — только если
 * первый ответ разошёлся с кандидатом. Отсюда «1–2 форсированных вопроса» из Чертежа.
 */
export function computeNextStep(answers: readonly StoredAnswer[]): NextStep {
  const answered = answersMap(answers)

  for (const question of ORDERED_BASE_QUESTIONS) {
    if (!answered.has(question.id)) {
      return {
        kind: 'triad',
        question_id: question.id,
        axis: question.axis,
        prompt: question.prompt,
        options: [...question.options],
      }
    }
  }

  const base = assessBase(scoreAnswers(answers))
  if (!base.needsTiebreak || base.tiebreakPair === null) return { kind: 'ready' }

  const items = TIEBREAK_ITEMS[base.tiebreakPair]
  const first = items[0]
  const firstChoice = answered.get(first.id)

  if (firstChoice === undefined) {
    return {
      kind: 'tiebreak',
      pair: base.tiebreakPair,
      question_id: first.id,
      prompt: first.prompt,
      options: [...first.options],
    }
  }

  // Первый ответ подтвердил кандидата — второй вопрос не нужен.
  if (firstChoice === String(base.candidate)) return { kind: 'ready' }

  const second = items[1]
  if (!answered.has(second.id)) {
    return {
      kind: 'tiebreak',
      pair: base.tiebreakPair,
      question_id: second.id,
      prompt: second.prompt,
      options: [...second.options],
    }
  }

  return { kind: 'ready' }
}

/** Ожидаемый сейчас вопрос — им валидируем входящий `question_id`. */
export function expectedQuestionId(answers: readonly StoredAnswer[]): string | null {
  const next = computeNextStep(answers)
  return next.kind === 'ready' ? null : next.question_id
}

/** Допустим ли такой вариант ответа для такого вопроса. */
export function isChoiceValid(questionId: string, choice: string): boolean {
  const question = findBaseQuestion(questionId) ?? findTiebreakQuestion(questionId)
  if (!question) return false
  return question.options.some((option) => option.value === choice)
}

/**
 * Применяет ответ к списку.
 *
 * Если на этот вопрос уже отвечали (пользователь нажал «Назад» и передумал —
 * см. Чертёж, БЛОК 4, экран «Тест»), ответ заменяется, а всё, что шло ПОСЛЕ него,
 * отбрасывается: дальнейший путь мог зависеть от изменённого ответа, и оставлять
 * его — значит смешивать два разных прохождения.
 */
export function applyAnswer(
  answers: readonly StoredAnswer[],
  questionId: string,
  choice: string,
  at: string
): StoredAnswer[] {
  const existingIndex = answers.findIndex((answer) => answer.q === questionId)
  const head = existingIndex >= 0 ? answers.slice(0, existingIndex) : answers
  return [...head, { q: questionId, choice, at }]
}

/** Минимум ответов набран — результат можно считать. */
export function hasEnoughAnswers(answers: readonly StoredAnswer[]): boolean {
  return countBaseAnswers(answers) >= MIN_ANSWERS
}

function resolveTiebreak(
  answers: readonly StoredAnswer[],
  candidate: EnneagramType,
  pair: string | null
): TiebreakOutcome {
  if (pair === null || !(pair in TIEBREAK_ITEMS)) {
    return { finalType: candidate, other: candidate, confidenceDelta: 0, path: [], resolved: false }
  }

  const typedPair = pair as keyof typeof TIEBREAK_ITEMS
  const items = TIEBREAK_ITEMS[typedPair]
  const other = otherInPair(typedPair, candidate)
  const answered = answersMap(answers)

  const firstChoice = answered.get(items[0].id)
  if (firstChoice === undefined) {
    return { finalType: candidate, other, confidenceDelta: 0, path: [], resolved: false }
  }

  if (firstChoice === String(candidate)) {
    return {
      finalType: candidate,
      other,
      confidenceDelta: TIEBREAK_DELTA.confirmed,
      path: [items[0].id],
      resolved: true,
    }
  }

  const secondChoice = answered.get(items[1].id)
  if (secondChoice === undefined) {
    return {
      finalType: candidate,
      other,
      confidenceDelta: 0,
      path: [items[0].id],
      resolved: false,
    }
  }

  const path = [items[0].id, items[1].id]
  if (secondChoice === String(candidate)) {
    return { finalType: candidate, other, confidenceDelta: TIEBREAK_DELTA.split, path, resolved: true }
  }

  return { finalType: other, other: candidate, confidenceDelta: TIEBREAK_DELTA.flipped, path, resolved: true }
}

/**
 * Итог теста: тип, крыло, confidence, раннер-ап и путь tiebreak.
 * Вызывающий обязан заранее убедиться в `hasEnoughAnswers()` — иначе результат
 * будет посчитан по неполным данным (роут `submit` отдаёт на это 422).
 */
export function computeResult(answers: readonly StoredAnswer[]): TestResult {
  const scores = scoreAnswers(answers)
  const base = assessBase(scores)
  const outcome = resolveTiebreak(answers, base.candidate, base.tiebreakPair)

  const type = outcome.finalType
  const confidence = clamp01(round2(base.confidence + outcome.confidenceDelta))
  const wing = pickWing(type, scores)

  let runnerUp: EnneagramType = outcome.other !== type ? outcome.other : base.runnerUp
  if (runnerUp === type) runnerUp = neighborsOf(type)[1]

  return {
    type,
    wing,
    confidence,
    runner_up: runnerUp,
    tiebreak_path: outcome.path,
    // Едж-кейс 8: не прячем неопределённость, а помечаем её честно.
    borderline: confidence < 0.6,
    version: TEST_VERSION,
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
