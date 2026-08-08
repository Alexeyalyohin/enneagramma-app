/**
 * Серверная проверка прав владельца.
 *
 * Второй рубеж после middleware. Дублирование намеренное: middleware можно
 * обойти конфигурацией матчера или внутренним вызовом, а `requireAdmin()`
 * спрашивает саму БД — ту же функцию `is_admin()`, на которой стоят все
 * RLS-политики чтения (Чертёж.md, БЛОК 5 «Безопасность»).
 */

import { AuthError, ForbiddenError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

export interface AdminIdentity {
  userId: string
  email: string | null
}

/**
 * Возвращает владельца или бросает `AuthError` (401) / `ForbiddenError` (403).
 * Бросает, а не возвращает флаг: забыть проверить булев результат легко,
 * забыть обработать исключение — заметно сложнее.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) throw new AuthError()

  const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin')
  if (rpcError) throw rpcError
  if (isAdmin !== true) throw new ForbiddenError()

  return { userId: user.id, email: user.email ?? null }
}

/** Мягкий вариант для UI: просто «владелец или нет», без исключений. */
export async function isAdminSession(): Promise<boolean> {
  try {
    await requireAdmin()
    return true
  } catch {
    return false
  }
}
