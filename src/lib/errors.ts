/**
 * Кастомные ошибки приложения. Каждая несёт код и HTTP-статус, чтобы роут
 * не занимался маппингом «что случилось → какой код отдать».
 *
 * Правило: бросать типизированную ошибку в бизнес-логике (`src/lib/**`),
 * ловить в роуте через `toApiErrorResponse()`.
 */

import { apiError, ERROR_CODES, type ApiErrorPayload, type ErrorCode } from '@/lib/api-response'
import { logError } from '@/lib/logger'
import type { NextResponse } from 'next/server'

export class AppError extends Error {
  readonly code: ErrorCode | string
  readonly status: number
  readonly context: Record<string, unknown>

  constructor(
    code: ErrorCode | string,
    message: string,
    status = 500,
    context: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.status = status
    this.context = context
  }
}

/** 400/422 — данные не прошли проверку. */
export class ValidationError extends AppError {
  constructor(message: string, code: ErrorCode | string = ERROR_CODES.VALIDATION_ERROR, status = 400, context: Record<string, unknown> = {}) {
    super(code, message, status, context)
  }
}

/** 401 — нет сессии. */
export class AuthError extends AppError {
  constructor(message = 'Требуется вход', context: Record<string, unknown> = {}) {
    super(ERROR_CODES.UNAUTHORIZED, message, 401, context)
  }
}

/** 403 — сессия есть, прав нет. */
export class ForbiddenError extends AppError {
  constructor(message = 'Доступ только для владельца', context: Record<string, unknown> = {}) {
    super(ERROR_CODES.FORBIDDEN, message, 403, context)
  }
}

/** 404 — ресурса нет (или мы намеренно не подтверждаем его существование). */
export class NotFoundError extends AppError {
  constructor(message: string, code: ErrorCode | string = 'NOT_FOUND', context: Record<string, unknown> = {}) {
    super(code, message, 404, context)
  }
}

/** 409 — конфликт состояния (сессия завершена, запись уже существует). */
export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode | string, context: Record<string, unknown> = {}) {
    super(code, message, 409, context)
  }
}

/**
 * Единая точка превращения исключения в HTTP-ответ.
 * Неизвестные ошибки наружу отдаются как 500 без деталей (детали — только в лог).
 */
export function toApiErrorResponse(
  error: unknown,
  logScope: string,
  logContext: Record<string, unknown> = {}
): NextResponse<ApiErrorPayload> {
  if (error instanceof AppError) {
    // Ожидаемые 4xx логируем без стека — это не инцидент, а нормальный поток.
    if (error.status >= 500) {
      logError(logScope, { ...logContext, ...error.context, code: error.code }, error)
    }
    return apiError(error.status, error.code, error.message)
  }

  logError(logScope, logContext, error)
  return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Внутренняя ошибка сервера')
}
