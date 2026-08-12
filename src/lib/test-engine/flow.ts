/**
 * Адаптивный поток теста: какой вопрос следующий и какой итог.
 * Перенесено 1-в-1 из эталона `ennea-test-v1_0.html` под stateless-архитектуру
 * приложения (состояние — только `test_sessions.answers`, движок его читает
 * заново на каждый запрос; см. подробное пояснение в scoring.ts).
 *
 * Порядок предъявления: 12 триад → 3 вопроса центра → 0–9 tiebreak-вопросов
 * (пошаговый нокаут, порциями по 3) → выбор портрета → ready.
 */

import { portraitCandidate } from './portraits'
import { ORDERED_BASE_QUESTIONS, TIEBREAK_ITEMS } from './questions'
import {
  BORDERLINE_THRESHOLD,
  assessBase,
  buildFinalists,
  computeConfidence,
  pickWing,
  resolveTies,
  scoreAnswers,
} from './scoring'
import { pairKey } from './grid'
import {
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
/** Псевдо-ID финального шага — не входит ни в один банк вопросов. */
const PORTRAIT_PICK_ID = 'portrait_pick'

function answersMap(answers: readonly StoredAnswer[]): Map<string, string> {
  return new Map<string, string>(answers.map((answer) => [answer.q, answer.choice] as const))
}

/** Сколько базовых вопросов (триады + центр) уже отвечено. */
export function countBaseAnswers(answers: readonly StoredAnswer[]): number {
  return answers.filter((answer) => BASE_QUESTION_IDS.has(answer.q)).length
}

export function buildProgress(answers: readonly StoredAnswer[]): TestProgress {
  return { answered: countBaseAnswers(answers), total_min: BASE_QUESTION_IDS.size }
}

export function buildMatrix(scores: AxisScores): MatrixSnapshot {
  return { social: scores.social, harmonic: scores.harmonic, center: scores.center }
}

/**
 * Итог разрешения ничьих + финалисты — общая часть для `computeNextStep`
 * (нужно знать, дошли ли до шага портрета) и `computeResult`.
 */
function resolveToFinalists(answers: readonly StoredAnswer[]) {
  const answered = answersMap(answers)
  const scores = scoreAnswers(answers)
  const base = assessBase(scores)
  const tie = resolveTies(base.socialPoles, base.harmPoles, scores, answered)
  return { scores, base, tie }
}

/**
 * Следующий шаг по уже сохранённым ответам.
 *
 * Порядок: сперва все 15 базовых вопросов по порядку; затем — пока разрешение
 * спорных полюсов не завершено — очередной tiebreak-вопрос (может быть до 9,
 * если на обеих осях была тройная ничья); затем — шаг выбора портрета; затем ready.
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

  const { scores, tie } = resolveToFinalists(answers)

  if (!tie.done) {
    const items = TIEBREAK_ITEMS[tie.pair]
    const question = items.find((item) => item.id === tie.nextQuestionId)
    if (!question) {
      // Оборонительная ветка: пары без банка отдаются без вопроса в scoring.ts
      // (tallyPairVotes) — сюда дойти в норме нельзя. Считаем нокаут завершённым
      // худшим доступным способом, чтобы не подвесить пользователя навечно.
      return { kind: 'ready' }
    }
    return {
      kind: 'tiebreak',
      pair: tie.pair,
      question_id: question.id,
      prompt: question.prompt,
      options: [...question.options],
    }
  }

  const finalists = buildFinalists(tie.socialPole, tie.harmPole, tie.log, scores)
  if (!answered.has(PORTRAIT_PICK_ID)) {
    return {
      kind: 'portrait_pick',
      question_id: PORTRAIT_PICK_ID,
      candidates: [portraitCandidate(finalists.winner), portraitCandidate(finalists.runnerUp)],
    }
  }

  return { kind: 'ready' }
}

/** Ожидаемый сейчас вопрос — `null`, если тест уже готов к результату. */
export function expectedQuestionId(answers: readonly StoredAnswer[]): string | null {
  const next = computeNextStep(answers)
  return next.kind === 'ready' ? null : next.question_id
}

/** Допустим ли вариант ответа для конкретного вычисленного шага. */
export function isValidStepChoice(step: NextStep, choice: string): boolean {
  if (step.kind === 'ready') return false
  if (step.kind === 'portrait_pick') return step.candidates.some((c) => String(c.type) === choice)
  return step.options.some((option) => option.value === choice)
}

/**
 * Применяет ответ к списку.
 *
 * Если на этот вопрос уже отвечали (пользователь нажал «Назад» и передумал),
 * ответ заменяется, а всё, что шло ПОСЛЕ него, отбрасывается — дальнейший путь
 * (в т.ч. состав спорных пар и кандидаты на портрет) мог зависеть от
 * изменённого ответа.
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

/** Всё пройдено, включая шаг выбора портрета — можно считать финальный результат. */
export function isReadyForResult(answers: readonly StoredAnswer[]): boolean {
  return computeNextStep(answers).kind === 'ready'
}

/**
 * Итог теста: тип, крыло, confidence, раннер-ап, путь tiebreak и флаг
 * переопределения портрета. Вызывающий обязан заранее убедиться в
 * `isReadyForResult()` — иначе портрет ещё не выбран и результат будет
 * посчитан по неполным данным (роут `submit` отдаёт на это 422).
 */
export function computeResult(answers: readonly StoredAnswer[]): TestResult {
  const answered = answersMap(answers)
  const { scores, base, tie } = resolveToFinalists(answers)

  if (!tie.done) {
    // Не должно случиться при вызове после isReadyForResult(), но не бросаем
    // необработанное исключение наружу — считаем по кандидату без нокаута.
    const fallbackType = 1 as EnneagramType
    return {
      type: fallbackType,
      wing: fallbackType,
      confidence: 0.45,
      runner_up: fallbackType,
      tiebreak_path: [],
      borderline: true,
      version: TEST_VERSION,
      switched: false,
    }
  }

  const finalists = buildFinalists(tie.socialPole, tie.harmPole, tie.log, scores)
  const pickedRaw = answered.get(PORTRAIT_PICK_ID)
  const picked = pickedRaw ? (Number(pickedRaw) as EnneagramType) : finalists.winner

  const switched = picked !== finalists.winner
  const type = switched ? picked : finalists.winner
  const runnerUp = switched ? finalists.winner : finalists.runnerUp

  const confidence = computeConfidence({
    socialLevel: base.socialLevel,
    harmLevel: base.harmLevel,
    centerFlag: base.centerFlag,
    tieLog: tie.log,
    switched,
  })

  const wing = pickWing(type, scores)
  const tiebreakPath = tie.log.flatMap((round) => {
    const items = TIEBREAK_ITEMS[pairKey(round.typeA, round.typeB)]
    return items ? items.map((item) => item.id) : []
  })

  return {
    type,
    wing,
    confidence,
    runner_up: runnerUp,
    tiebreak_path: tiebreakPath,
    borderline: confidence < BORDERLINE_THRESHOLD,
    version: 'v1.0',
    switched,
  }
}
