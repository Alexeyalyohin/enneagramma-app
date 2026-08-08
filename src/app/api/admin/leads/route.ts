/**
 * GET /api/admin/leads?page=1&per_page=20&stage=captured — список лидов.
 * Чертёж.md, БЛОК 3, GROUP «Админ» + edge case 14 (пагинация server-side по 20).
 * Только владелец.
 */

import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, apiPaginated } from '@/lib/api-response'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { requireAdmin } from '@/lib/auth/admin'
import { createServiceClient } from '@/lib/supabase/service'
import { toApiErrorResponse } from '@/lib/errors'
import type { ServiceClient } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Этапы воронки, по которым фильтруется список. Совпадают со шагами
 * `/api/admin/funnel`, чтобы клик по столбцу вёл в осмысленную выборку.
 */
const STAGES = ['captured', 'typed', 'telegram', 'club', 'waitlist'] as const
type Stage = (typeof STAGES)[number]

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Потолок 100: страница крупнее уже не помещается в экран и бьёт по отклику.
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  stage: z.enum(STAGES).default('captured'),
  /** Поиск по телефону/имени/нику/почте — по подстроке. */
  q: z.string().trim().max(64).optional(),
})

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, 'admin', RATE_LIMITS.admin)
  if (limited) return limited

  try {
    await requireAdmin()

    const params = request.nextUrl.searchParams
    const parsed = querySchema.safeParse({
      page: params.get('page') ?? undefined,
      per_page: params.get('per_page') ?? undefined,
      stage: params.get('stage') ?? undefined,
      q: params.get('q') ?? undefined,
    })

    if (!parsed.success) {
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Некорректные параметры выборки')
    }

    const { page, per_page: perPage, stage, q } = parsed.data
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    const supabase = createServiceClient()

    /**
     * Этапы `club` и `waitlist` фильтруются через предварительную выборку
     * lead_id, а не через `!inner`-join.
     * Почему так: join потребовал бы динамической строки select, из-за чего
     * типизация ответа схлопнулась бы в `any`. Предвыборка тут дешёвая —
     * подписчиков клуба и заявок B2B в MVP десятки, а не десятки тысяч
     * (в отличие от самих лидов, где пагинация обязательна — edge case 14).
     */
    const restrictToIds = await stageLeadIds(supabase, stage)
    if (restrictToIds !== null && restrictToIds.length === 0) {
      return apiPaginated([], { total: 0, page, per_page: perPage })
    }

    let query = supabase
      .from('leads')
      .select(
        'id, phone, email, telegram_id, telegram_username, full_name, source, enneagram_type, wing, subscribed_telegram, consent_152fz, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to)

    if (stage === 'typed') query = query.not('enneagram_type', 'is', null)
    if (stage === 'telegram') query = query.eq('subscribed_telegram', true)
    if (restrictToIds !== null) query = query.in('id', restrictToIds)

    if (q) {
      // Спецсимволы LIKE вырезаем: иначе «%» из поиска вернёт всю таблицу.
      const pattern = `%${q.replace(/[%_,]/g, '')}%`
      query = query.or(
        `phone.ilike.${pattern},full_name.ilike.${pattern},telegram_username.ilike.${pattern},email.ilike.${pattern}`
      )
    }

    const { data, count, error } = await query
    if (error) throw error

    return apiPaginated(data ?? [], { total: count ?? 0, page, per_page: perPage })
  } catch (error) {
    return toApiErrorResponse(error, 'api.admin.leads.failed')
  }
}

/** `null` — этап не требует ограничения по id. */
async function stageLeadIds(client: ServiceClient, stage: Stage): Promise<string[] | null> {
  if (stage === 'club') {
    const { data, error } = await client
      .from('club_subscriptions')
      .select('lead_id')
      .in('status', ['active', 'past_due'])
    if (error) throw error
    return [...new Set((data ?? []).map((row) => row.lead_id))]
  }

  if (stage === 'waitlist') {
    const { data, error } = await client.from('waitlist_entries').select('lead_id')
    if (error) throw error
    return [...new Set((data ?? []).map((row) => row.lead_id))]
  }

  return null
}
