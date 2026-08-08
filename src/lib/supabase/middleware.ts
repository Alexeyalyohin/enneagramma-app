/**
 * Обновление сессии Supabase в middleware — стандартный паттерн `@supabase/ssr`
 * для Next.js App Router.
 *
 * Почему это обязательно: серверные компоненты не умеют писать cookie, поэтому
 * refresh-токен продлевается только здесь. Без этого владельца будет случайным
 * образом выкидывать из админки.
 *
 * Правило безопасности: доверяем ТОЛЬКО `auth.getUser()` — он проверяет JWT на
 * сервере Supabase. `getSession()` в middleware читает cookie как есть, её можно
 * подделать (CLAUDE.md: «не доверяй данным от клиента»).
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import type { User } from '@supabase/supabase-js'

export interface SessionState {
  /** Ответ с актуализированными auth-cookie. Его нужно вернуть из middleware. */
  response: NextResponse
  user: User | null
  isAdmin: boolean
}

export async function updateSession(request: NextRequest): Promise<SessionState> {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          // Ответы, выставляющие auth-cookie, нельзя кэшировать на CDN Vercel:
          // иначе чужая сессия уедет другому пользователю. Библиотека передаёт
          // сюда готовый набор no-store заголовков.
          if (headers) {
            for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    // Политика profiles_select_own позволяет владельцу прочитать свою строку.
    // Namely is_admin() здесь не зовём: RPC в middleware — лишний round-trip,
    // а условие ровно то же (profiles.role = 'admin').
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    isAdmin = profile?.role === 'admin'
  }

  return { response, user, isAdmin }
}

/** Переносит обновлённые auth-cookie на другой ответ (редирект, 403 и т.п.). */
export function withSessionCookies(source: NextResponse, target: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}
