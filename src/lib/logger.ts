/**
 * Структурированное логирование (CLAUDE.md: логи — объектами, не строками).
 *
 * Внешнего логгера в стеке нет и заводить его в бэкенд-фазе не требуется:
 * пишем в stdout/stderr одной JSON-строкой — Vercel Logs так их и индексирует,
 * и при появлении Sentry/Axiom подменяется только этот модуль.
 *
 * ПДн в логи не кладём: телефон/email/telegram — только в виде `lead_id`
 * либо маскированного хвоста (см. `maskPhone`).
 */

type LogLevel = 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>

interface SerializedError {
  name: string
  message: string
  stack?: string
}

function serializeError(error: unknown): SerializedError | undefined {
  if (error === undefined || error === null) return undefined
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { name: 'UnknownError', message: String(error) }
}

function write(level: LogLevel, event: string, context: LogContext, error?: unknown): void {
  const entry = {
    level,
    event,
    at: new Date().toISOString(),
    ...context,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  }

  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function logInfo(event: string, context: LogContext = {}): void {
  write('info', event, context)
}

export function logWarn(event: string, context: LogContext = {}, error?: unknown): void {
  write('warn', event, context, error)
}

export function logError(event: string, context: LogContext = {}, error?: unknown): void {
  write('error', event, context, error)
}

/** `+79990001122` → `+7999***1122`. Для диагностики без утечки ПДн в логи. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  if (phone.length < 8) return '***'
  return `${phone.slice(0, 5)}***${phone.slice(-4)}`
}
