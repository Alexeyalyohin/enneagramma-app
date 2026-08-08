/**
 * Унифицированный формат ответов API (Чертёж.md, БЛОК 3 «Общие правила»).
 *
 *   успех:      { "data": ... }                       + опц. { "meta": ... }
 *   пагинация:  { "data": [...], "meta": { total, page, per_page } }
 *   ошибка:     { "error": { "code": "ERROR_CODE", "message": "..." } }
 *
 * Общий модуль: им пользуются и роуты теста/лидов/админки, и вебхуки
 * (integrations-specialist) — формат ошибок обязан совпадать везде.
 */

import { NextResponse } from 'next/server'

export interface ApiErrorPayload {
  error: {
    code: string
    message: string
  }
}

export interface PaginationMeta {
  total: number
  page: number
  per_page: number
}

export interface ApiSuccessPayload<TData, TMeta = never> {
  data: TData
  meta?: TMeta
}

/**
 * Коды ошибок, зафиксированные в Чертеже (БЛОК 3) + общие технические.
 * Держать в синхроне с фронтендом: он маппит код в текст для пользователя.
 */
export const ERROR_CODES = {
  // общие
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  // тест
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  SESSION_ABANDONED: 'SESSION_ABANDONED',
  UNEXPECTED_QUESTION: 'UNEXPECTED_QUESTION',
  INVALID_CHOICE: 'INVALID_CHOICE',
  INSUFFICIENT_ANSWERS: 'INSUFFICIENT_ANSWERS',
  RESULT_NOT_READY: 'RESULT_NOT_READY',
  // лиды / лист ожидания
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  IDENTITY_REQUIRED: 'IDENTITY_REQUIRED',
  LEAD_NOT_FOUND: 'LEAD_NOT_FOUND',
  ALREADY_ON_WAITLIST: 'ALREADY_ON_WAITLIST',
  WAITLIST_NOT_FOUND: 'WAITLIST_NOT_FOUND',
  DEPOSIT_ALREADY_PAID: 'DEPOSIT_ALREADY_PAID',
  // авторизация
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  // интеграции (используются integrations-specialist)
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  /**
   * Общий секрет источника не совпал (Salebot). Отличается от INVALID_SIGNATURE
   * намеренно: там криптографическая подпись тела, здесь — предъявленный секрет.
   */
  INVALID_SECRET: 'INVALID_SECRET',
  INVALID_TOKEN: 'INVALID_TOKEN',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** Успешный ответ `{ data }`. По умолчанию 200, для создания ресурса — 201. */
export function apiSuccess<TData>(
  data: TData,
  status = 200,
  headers?: HeadersInit
): NextResponse<{ data: TData }> {
  return NextResponse.json({ data }, { status, headers })
}

/** Ответ со списком и мета-пагинацией `{ data, meta }`. */
export function apiPaginated<TItem>(
  data: TItem[],
  meta: PaginationMeta,
  status = 200
): NextResponse<{ data: TItem[]; meta: PaginationMeta }> {
  return NextResponse.json({ data, meta }, { status })
}

/** Ответ об ошибке `{ error: { code, message } }`. */
export function apiError(
  status: number,
  code: ErrorCode | string,
  message: string,
  headers?: HeadersInit
): NextResponse<ApiErrorPayload> {
  return NextResponse.json({ error: { code, message } }, { status, headers })
}

/**
 * Безопасный парсинг JSON-тела: пустое тело трактуем как `{}`
 * (нужно для `POST /api/test/session` с пустым запросом),
 * битый JSON — как ошибку валидации, а не как 500.
 */
export async function readJsonBody(request: Request): Promise<
  { ok: true; body: unknown } | { ok: false; response: NextResponse<ApiErrorPayload> }
> {
  const raw = await request.text()
  if (raw.trim() === '') return { ok: true, body: {} }

  try {
    return { ok: true, body: JSON.parse(raw) as unknown }
  } catch {
    return {
      ok: false,
      response: apiError(400, ERROR_CODES.INVALID_JSON, 'Тело запроса — не валидный JSON'),
    }
  }
}
