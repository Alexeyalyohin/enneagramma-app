'use server'

/**
 * Вход владельца (Чертёж.md, БЛОК 4, экран «Вход владельца»).
 *
 * Server Action, а не роут: это мутация состояния сессии, форма вызывает её
 * напрямую через `useActionState` (CLAUDE.md: мутации — Server Actions).
 *
 * Правило текста ошибки: всегда одно и то же «Неверный email или пароль».
 * Ни «пользователь не найден», ни «неверный пароль» — иначе форма превращается
 * в оракул существования учётных записей. Публичного sign-up в проекте нет,
 * учётная запись владельца одна.
 */

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { logInfo, logWarn } from '@/lib/logger'
import { RATE_LIMITS, getClientIpFromHeaderLookup, rateLimit } from '@/lib/rate-limit'

const GENERIC_ERROR = 'Неверный email или пароль'

const loginSchema = z.object({
  email: z.email(),
  // Чертёж, БЛОК 5 «Валидация форм»: пароль владельца — не короче 8 символов.
  password: z.string().min(8),
})

export interface LoginState {
  error: string | null
}

export const initialLoginState: LoginState = { error: null }

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  // Единственная точка входа в админку — лимитируем попытки по IP, как и
  // все остальные публичные мутации в проекте (Server Action, поэтому IP
  // берём из next/headers, а не из Request).
  const headerList = await headers()
  const ip = getClientIpFromHeaderLookup((name) => headerList.get(name))
  const limit = rateLimit(`login:${ip}`, RATE_LIMITS.login)
  if (!limit.ok) {
    return { error: 'Слишком много попыток входа. Подождите минуту и попробуйте снова' }
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  // Даже ошибку формата отдаём общим текстом: подсказывать боту,
  // что email распознан, а пароль короткий, незачем.
  if (!parsed.success) return { error: GENERIC_ERROR }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error || !data.user) {
    logWarn('auth.login_failed', { reason: error?.message ?? 'no_user' })
    return { error: GENERIC_ERROR }
  }

  // Учётная запись есть, но она не владелец — сессию не оставляем.
  const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin')
  if (rpcError || isAdmin !== true) {
    await supabase.auth.signOut()
    logWarn('auth.login_not_admin', { user_id: data.user.id })
    return { error: GENERIC_ERROR }
  }

  logInfo('auth.login_success', { user_id: data.user.id })

  revalidatePath('/', 'layout')
  // redirect() бросает исключение — код ниже не выполняется, это ожидаемо.
  redirect('/admin')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/auth/login')
}
