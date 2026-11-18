import { createHash } from 'node:crypto'
import type { MatrixSnapshot, NextStep, StoredAnswer } from '@/lib/test-engine'

export type PublicNextStep =
  | Omit<Extract<NextStep, { kind: 'triad' }>, 'axis'>
  | Omit<Extract<NextStep, { kind: 'tiebreak' }>, 'pair'>
  | Extract<NextStep, { kind: 'portrait_pick' | 'ready' }>

/** Нейтральные стабильные коды транспорта, не токены авторизации. */
function code(prefix: string, value: string): string {
  return prefix + createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function publicQuestionId(questionId: string): string {
  return code('q_', questionId)
}

export function publicChoiceId(questionId: string, choice: string): string {
  return code('o_', `${questionId}:${choice}`)
}

/** Клиенту нужны вопрос и варианты; оси, пары и баллы остаются на сервере. */
export function publicNextStep(step: NextStep): PublicNextStep {
  if (step.kind === 'ready') return { kind: 'ready' }
  const question_id = publicQuestionId(step.question_id)
  if (step.kind === 'portrait_pick') {
    return { kind: step.kind, question_id, candidates: step.candidates }
  }
  return {
    kind: step.kind,
    question_id,
    prompt: step.prompt,
    options: step.options.map(({ value, label }) => ({
      value: publicChoiceId(step.question_id, value),
      label,
    })),
  }
}

/** Поддерживаем «Назад» и коды из уже открытых вкладок предыдущей версии. */
export function internalQuestionId(answers: readonly StoredAnswer[], next: NextStep, supplied: string): string {
  const known = answers.map((answer) => answer.q)
  if (next.kind !== 'ready') known.push(next.question_id)
  return known.find((id) => publicQuestionId(id) === supplied) ?? supplied
}

export function internalChoice(step: NextStep, supplied: string): string {
  if (step.kind === 'ready' || step.kind === 'portrait_pick') return supplied
  return step.options.find((option) => publicChoiceId(step.question_id, option.value) === supplied)?.value ?? supplied
}

/** Нулевой снимок сохраняет контракт старых вкладок без раскрытия баллов. */
export function compatibilityMatrix(): MatrixSnapshot {
  return {
    social: { assertive: 0, compliant: 0, withdrawn: 0 },
    harmonic: { positive: 0, competency: 0, reactive: 0 },
    center: { gut: 0, heart: 0, head: 0 },
  }
}
