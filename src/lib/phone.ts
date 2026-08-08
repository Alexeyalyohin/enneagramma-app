/**
 * Нормализация телефона в E.164 (`+7XXXXXXXXXX`) — CLAUDE.md «Правила кодирования»
 * и Чертёж.md, БЛОК 5 «Валидация форм».
 *
 * БД формат не чинит (см. COMMENT на `leads.phone`), поэтому нормализация
 * обязана происходить здесь — до любой записи и до любого поиска лида,
 * иначе дедуп по телефону развалится.
 */

import { z } from 'zod'

/** Единственный допустимый в БД формат телефона. */
export const E164_RU_REGEX = /^\+7\d{10}$/

/**
 * Приводит пользовательский ввод к `+7XXXXXXXXXX`.
 *
 * Разбираемые формы: `8 (999) 000-11-22`, `+7 999 000 11 22`, `79990001122`,
 * `9990001122`. Всё остальное возвращается «как есть» после чистки — валидность
 * проверяет `zPhoneRu`, а не эта функция (разделение: transform ≠ validate).
 */
export function normalizePhoneE164(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 0) return ''

  // 8XXXXXXXXXX → 7XXXXXXXXXX (российская «восьмёрка»)
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`
  // 9XXXXXXXXX — ввели без кода страны
  if (digits.length === 10) return `+7${digits}`

  return `+${digits}`
}

/** Проверка без нормализации: строка уже в E.164 РФ. */
export function isValidRuPhone(value: string): boolean {
  return E164_RU_REGEX.test(value)
}

/**
 * Zod-схема телефона: нормализует, затем валидирует.
 * Порядок важен — сначала transform, потом refine, иначе `8 999…` не пройдёт.
 */
export const zPhoneRu = z
  .string()
  .trim()
  .transform(normalizePhoneE164)
  .refine(isValidRuPhone, { message: 'Телефон должен быть российским, в формате +7XXXXXXXXXX' })

/**
 * Нормализация Telegram-username: без `@`, в нижнем регистре.
 * Telegram сам регистронезависим, поэтому сравнивать надо в одном регистре.
 */
export function normalizeTelegramUsername(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase()
}

export const zTelegramUsername = z
  .string()
  .trim()
  .max(64)
  .transform(normalizeTelegramUsername)
  .refine((v) => /^[a-z0-9_]{5,32}$/.test(v), {
    message: 'Ник в Telegram: 5–32 символа, латиница, цифры и «_»',
  })
