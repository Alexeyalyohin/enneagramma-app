/**
 * Разбор JSONB-полей `test_sessions` в типизированные структуры.
 *
 * Почему через Zod, а не через `as`: в JSONB лежит то, что записала прошлая
 * версия кода. Приводить это к типу «на честном слове» — прямой путь к падению
 * роута на данных полугодовой давности. Битые элементы отбрасываем молча,
 * но с сохранением порядка валидных.
 */

import { z } from 'zod'
import { ENNEAGRAM_TYPES, type StoredAnswer, type TestResult } from './types'

const storedAnswerSchema = z.object({
  q: z.string().min(1).max(64),
  choice: z.string().min(1).max(32),
  at: z.string(),
})

const enneagramTypeSchema = z
  .number()
  .int()
  .refine((v): v is (typeof ENNEAGRAM_TYPES)[number] => (ENNEAGRAM_TYPES as readonly number[]).includes(v))

const testResultSchema = z.object({
  type: enneagramTypeSchema,
  wing: enneagramTypeSchema,
  confidence: z.number().min(0).max(1),
  runner_up: enneagramTypeSchema,
  tiebreak_path: z.array(z.string()).default([]),
  borderline: z.boolean().default(false),
  version: z.string().default('v1.0'),
  // Раньше версии v0.4 (без переноса из эталона) этого поля не было —
  // читаем старые записи как false, а не роняем парсинг.
  switched: z.boolean().default(false),
})

/** `test_sessions.answers` → массив ответов. Любой мусор → пустой массив. */
export function parseStoredAnswers(raw: unknown): StoredAnswer[] {
  if (!Array.isArray(raw)) return []

  const answers: StoredAnswer[] = []
  for (const item of raw) {
    const parsed = storedAnswerSchema.safeParse(item)
    if (parsed.success) answers.push(parsed.data)
  }
  return answers
}

/** `test_sessions.result` → итог теста, либо `null`, если результат не читается. */
export function parseTestResult(raw: unknown): TestResult | null {
  const parsed = testResultSchema.safeParse(raw)
  return parsed.success ? (parsed.data as TestResult) : null
}
