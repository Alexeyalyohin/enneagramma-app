/**
 * Мелкие помощники Zod, общие для всех роутов.
 *
 * Зачем: формы фронта присылают `null` и `""` там, где поле «не заполнено»
 * (см. пример тела `/api/leads/capture` в Чертеже — `"email": null`).
 * Без нормализации это ловится как ошибка формата, хотя пользователь просто
 * ничего не ввёл.
 */

import { z } from 'zod'

/** `null`, `""` и строка из пробелов → `undefined`. */
export function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

/**
 * Необязательное поле, которое допускает `null` и пустую строку.
 * Внешний `.optional()` делает ключ по-настоящему необязательным и в типе,
 * и при разборе объекта; внутренний нужен, чтобы явный `null` не падал.
 */
export function optionalField<T extends z.ZodType>(schema: T) {
  return z.preprocess(blankToUndefined, schema.optional()).optional()
}

/** Есть ли среди ошибок разбора проблема с конкретным полем. */
export function hasIssueOn(error: z.ZodError, field: string): boolean {
  return error.issues.some((issue) => issue.path[0] === field)
}

/** Первое человекочитаемое сообщение об ошибке — для показа в форме. */
export function firstIssueMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback
}
