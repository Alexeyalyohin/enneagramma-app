/**
 * Middleware авторизации владельца (Чертёж.md, БЛОК 5 «Безопасность»,
 * edge case 11).
 *
 * Расположение: `src/middleware.ts` — в проекте есть каталог `src/`, и Next.js
 * ищет файл именно там (`(?:src/)?middleware`), а не в корне репозитория.
 * В Next.js 16 файл переименован в `proxy.ts`; `middleware.ts` продолжает
 * работать и остаётся именем по умолчанию в спецификации проекта.
 *
 * Что делает:
 *   • продлевает сессию Supabase (иначе владельца выкидывает из админки);
 *   • `/api/admin/*` без прав → 403 FORBIDDEN (JSON, не редирект — это API);
 *   • `/admin/*` без прав → редирект на /auth/login;
 *   • `/auth/login` с активной сессией владельца → редирект в /admin.
 *
 * Middleware — первый рубеж, а не единственный: каждый роут `/api/admin/*`
 * проверяет права ещё раз через `requireAdmin()` (CLAUDE.md: проверять и на
 * клиенте, и на сервере, никогда только на одной стороне).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { updateSession, withSessionCookies } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { response, isAdmin } = await updateSession(request)
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/admin')) {
    if (!isAdmin) {
      return withSessionCookies(
        response,
        NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Доступ только для владельца' } },
          { status: 403 }
        )
      )
    }
    return response
  }

  if (pathname.startsWith('/admin')) {
    if (!isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.search = ''
      url.searchParams.set('redirect', pathname)
      return withSessionCookies(response, NextResponse.redirect(url))
    }
    return response
  }

  if (pathname === '/auth/login' && isAdmin) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    url.search = ''
    return withSessionCookies(response, NextResponse.redirect(url))
  }

  return response
}

export const config = {
  // Публичные роуты (тест, лиды, вебхуки) сюда намеренно не попадают:
  // у них нет сессии, и лишний вызов auth.getUser() только добавил бы задержку.
  matcher: ['/admin/:path*', '/api/admin/:path*', '/auth/:path*'],
}
