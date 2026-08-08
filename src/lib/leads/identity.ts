/**
 * Разрешение идентичности лида: поиск, создание, мердж.
 * Чертёж.md, БЛОК 5 «Разрешение идентичности лида (дедуп/мердж)» + edge case 7.
 *
 * Ключи идентичности — нормализованный `phone` (E.164) и `telegram_id`.
 * `email` вторичен и в дедупе НЕ участвует (у пары может быть общий ящик).
 * `telegram_username` тоже не ключ: он меняется владельцем в любой момент,
 * но по нему можно доопознать уже существующего лида (см. ниже).
 *
 * Модуль общий: им пользуются `/api/leads/capture`, `/api/waitlist`,
 * а также `/api/club/start`, `/api/leads/link-telegram` и вебхук Salebot
 * (зона integrations-specialist).
 */

import { ValidationError } from '@/lib/errors'
import { ERROR_CODES } from '@/lib/api-response'
import { logWarn } from '@/lib/logger'
import type { LeadRow, LeadUpdate, ServiceClient } from '@/lib/supabase/types'
import type { LeadSource } from '@/types/domain'

/** Набор колонок лида, общий для всех выборок модуля (и для `telegram-link.ts`). */
export const LEAD_COLUMNS =
  'id, phone, email, telegram_id, telegram_username, full_name, source, enneagram_type, wing, subscribed_telegram, consent_152fz, consent_at, created_at, updated_at'

export interface LeadIdentityInput {
  /** Уже нормализованный E.164. Нормализация — на входе роута, не здесь. */
  phone?: string | null
  telegramId?: number | null
  /** Уже нормализованный (без «@», нижний регистр). */
  telegramUsername?: string | null
  email?: string | null
  fullName?: string | null
  source?: LeadSource
  consent152fz?: boolean
  subscribedTelegram?: boolean
}

export interface ResolveLeadResult {
  lead: LeadRow
  created: boolean
  merged: boolean
  /** Снимок поглощённого лида — кладём в metadata события как «архивную запись». */
  mergedFrom: Partial<LeadRow> | null
}

/** Поиск лида по ключу идентичности. */
export async function findLeadByPhone(client: ServiceClient, phone: string): Promise<LeadRow | null> {
  const { data, error } = await client.from('leads').select(LEAD_COLUMNS).eq('phone', phone).maybeSingle()
  if (error) throw error
  return data
}

export async function findLeadByTelegramId(
  client: ServiceClient,
  telegramId: number
): Promise<LeadRow | null> {
  const { data, error } = await client
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('telegram_id', telegramId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Поиск по нику Telegram. Не ключ идентичности, поэтому теоретически может
 * вернуть несколько строк — берём самую раннюю и предупреждаем в лог.
 */
export async function findLeadByTelegramUsername(
  client: ServiceClient,
  username: string
): Promise<LeadRow | null> {
  const { data, error } = await client
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('telegram_username', username)
    .order('created_at', { ascending: true })
    .limit(2)
  if (error) throw error
  if (!data || data.length === 0) return null
  if (data.length > 1) {
    logWarn('leads.duplicate_telegram_username', { username, lead_id: data[0].id })
  }
  return data[0]
}

/**
 * Находит существующего лида или создаёт нового; при конфликте ключей — мержит.
 *
 * ОГРАНИЧЕНИЕ СХЕМЫ (важно): CHECK `leads_identity_present` требует непустой
 * `phone` ИЛИ `telegram_id`. Чертёж в Zod-схеме `capture` допускает «телефон
 * ИЛИ telegram_username», но одного ника для создания лида БД не примет —
 * `telegram_id` приходит только из Salebot. Поэтому: по нику мы ищем и
 * дополняем уже существующего лида, а создать нового без телефона/telegram_id
 * не можем и отвечаем `IDENTITY_REQUIRED`.
 */
export async function resolveLead(
  client: ServiceClient,
  input: LeadIdentityInput
): Promise<ResolveLeadResult> {
  const phone = input.phone ?? null
  const telegramId = input.telegramId ?? null
  const telegramUsername = input.telegramUsername ?? null

  const byPhone = phone ? await findLeadByPhone(client, phone) : null
  const byTelegram = telegramId ? await findLeadByTelegramId(client, telegramId) : null
  const byUsername =
    !byPhone && !byTelegram && telegramUsername
      ? await findLeadByTelegramUsername(client, telegramUsername)
      : null

  let merged = false
  let mergedFrom: Partial<LeadRow> | null = null
  let target: LeadRow | null = byPhone ?? byTelegram ?? byUsername

  // Два разных лида (телефон в одном, telegram в другом) → мердж в старшего.
  if (byPhone && byTelegram && byPhone.id !== byTelegram.id) {
    const [older, younger] = orderByAge(byPhone, byTelegram)
    const outcome = await mergeLeads(client, older, younger)
    target = outcome.lead
    merged = true
    mergedFrom = outcome.archived
  }

  if (target) {
    const updated = await fillMissingFields(client, target, input)
    return { lead: updated, created: false, merged, mergedFrom }
  }

  if (!phone && !telegramId) {
    throw new ValidationError(
      'Укажите телефон — по нему мы вас узнаем. Telegram привяжется сам при переходе в бота',
      ERROR_CODES.IDENTITY_REQUIRED
    )
  }

  const created = await createLead(client, input)
  return { lead: created, created: true, merged: false, mergedFrom: null }
}

function orderByAge(a: LeadRow, b: LeadRow): [LeadRow, LeadRow] {
  const aTime = a.created_at ? Date.parse(a.created_at) : Number.MAX_SAFE_INTEGER
  const bTime = b.created_at ? Date.parse(b.created_at) : Number.MAX_SAFE_INTEGER
  return aTime <= bTime ? [a, b] : [b, a]
}

async function createLead(client: ServiceClient, input: LeadIdentityInput): Promise<LeadRow> {
  const { data, error } = await client
    .from('leads')
    .insert({
      phone: input.phone ?? null,
      email: input.email ?? null,
      telegram_id: input.telegramId ?? null,
      telegram_username: input.telegramUsername ?? null,
      full_name: input.fullName ?? null,
      source: input.source ?? 'test',
      subscribed_telegram: input.subscribedTelegram ?? false,
      consent_152fz: input.consent152fz ?? false,
      consent_at: input.consent152fz ? new Date().toISOString() : null,
    })
    .select(LEAD_COLUMNS)
    .single()

  if (error) throw error
  return data
}

/**
 * Дополняет лида недостающими полями. Существующие значения НЕ затираем:
 * если у лида уже есть телефон, а пришёл другой — это повод для мерджа,
 * а не для тихой перезаписи ключа идентичности.
 */
async function fillMissingFields(
  client: ServiceClient,
  lead: LeadRow,
  input: LeadIdentityInput
): Promise<LeadRow> {
  const patch: LeadUpdate = {}

  if (!lead.phone && input.phone) patch.phone = input.phone
  if (!lead.email && input.email) patch.email = input.email
  if (!lead.telegram_id && input.telegramId) patch.telegram_id = input.telegramId
  if (input.telegramUsername && lead.telegram_username !== input.telegramUsername) {
    patch.telegram_username = input.telegramUsername
  }
  if (!lead.full_name && input.fullName) patch.full_name = input.fullName
  if (input.subscribedTelegram && !lead.subscribed_telegram) patch.subscribed_telegram = true
  if (input.consent152fz && !lead.consent_152fz) {
    patch.consent_152fz = true
    patch.consent_at = new Date().toISOString()
  }

  if (Object.keys(patch).length === 0) return lead

  const { data, error } = await client
    .from('leads')
    .update(patch)
    .eq('id', lead.id)
    .select(LEAD_COLUMNS)
    .single()

  if (error) {
    // 23505 — ключ идентичности уже занят другим живым лидом. Такое возможно,
    // если мердж не смог удалить поглощённого (на нём остались зависимые строки).
    // Роняться из-за этого нельзя: лид найден, дальше по воронке он поедет и без
    // дописанного поля. Владелец увидит рассинхрон по этому предупреждению.
    if (error.code === '23505') {
      logWarn('leads.fill_conflict', {
        lead_id: lead.id,
        fields: Object.keys(patch),
      })
      return lead
    }
    throw error
  }

  return data
}

export interface MergeOutcome {
  lead: LeadRow
  /** Снимок поглощённого лида до удаления. */
  archived: Partial<LeadRow>
  /** Удалось ли физически удалить поглощённого лида. */
  sourceDeleted: boolean
}

/**
 * Мердж двух лидов в старшего (edge case 7).
 *
 * Порядок: переносим FK → дополняем поля старшего → удаляем младшего.
 *
 * РЕШЕНИЕ по «архивной записи»: отдельной таблицы архива в схеме нет и заводить
 * её ради редкого случая избыточно. Снимок поглощённого лида возвращается
 * наверх и кладётся в `events.metadata` (JSONB) вместе с событием, которое
 * вызвало мердж, — это и есть архивная запись, доступная владельцу в админке.
 *
 * ОСТОРОЖНО с удалением: почти все FK на `leads` идут с ON DELETE CASCADE.
 * Поэтому младшего удаляем ТОЛЬКО если после переноса на нём не осталось
 * зависимых строк. Если что-то перенести не удалось (конфликт уникальных
 * индексов — например, у обоих активная подписка клуба), младший остаётся
 * жить, а в лог уходит предупреждение владельцу. Терять зеркало оплаты
 * молча — хуже, чем оставить лишнюю строку.
 */
export async function mergeLeads(
  client: ServiceClient,
  target: LeadRow,
  source: LeadRow
): Promise<MergeOutcome> {
  const archived: Partial<LeadRow> = {
    id: source.id,
    phone: source.phone,
    email: source.email,
    telegram_id: source.telegram_id,
    telegram_username: source.telegram_username,
    full_name: source.full_name,
    source: source.source,
    enneagram_type: source.enneagram_type,
    wing: source.wing,
    created_at: source.created_at,
  }

  // 1. Простые переносы — уникальных ограничений по lead_id нет.
  //    Развёрнуто по таблицам, а не циклом: у типизированного клиента
  //    `from(union)` схлопывает вывод типов в непригодное объединение.
  const sessionsMove = await client
    .from('test_sessions')
    .update({ lead_id: target.id })
    .eq('lead_id', source.id)
  if (sessionsMove.error) throw sessionsMove.error

  const eventsMove = await client.from('events').update({ lead_id: target.id }).eq('lead_id', source.id)
  if (eventsMove.error) throw eventsMove.error

  const paymentsMove = await client
    .from('payments')
    .update({ lead_id: target.id })
    .eq('lead_id', source.id)
  if (paymentsMove.error) throw paymentsMove.error

  const grantsMove = await client
    .from('telegram_access_grants')
    .update({ lead_id: target.id })
    .eq('lead_id', source.id)
  if (grantsMove.error) throw grantsMove.error

  // 2. club_subscriptions: частичный UNIQUE (lead_id) WHERE status IN (active, past_due).
  await transferClubSubscriptions(client, target.id, source.id)

  // 3. waitlist_entries: UNIQUE (lead_id) — одна запись на лида.
  await transferWaitlistEntry(client, target.id, source.id)

  // 4. Удаляем младшего — только если он больше ничего не держит.
  //
  // ПОРЯДОК КРИТИЧЕН: `phone` и `telegram_id` защищены частичными UNIQUE-
  // индексами. Пока младший жив, его ключи заняты, и попытка перенести их на
  // старшего упала бы с 23505. Поэтому сначала удаление, потом заполнение.
  const leftovers = await countDependents(client, source.id)
  const sourceDeleted = leftovers === 0

  if (sourceDeleted) {
    const { error } = await client.from('leads').delete().eq('id', source.id)
    if (error) throw error
  } else {
    logWarn('leads.merge_source_kept', {
      target_lead_id: target.id,
      source_lead_id: source.id,
      leftovers,
      reason: 'на поглощённом лиде остались зависимые строки, удаление каскадом их бы уничтожило',
    })
  }

  // 5. Дополняем старшего данными младшего. Ключи идентичности забираем только
  //    если младший физически удалён; иначе — лишь неконфликтные поля.
  const merged = await fillMissingFields(client, target, {
    phone: sourceDeleted ? source.phone : null,
    telegramId: sourceDeleted ? source.telegram_id : null,
    // Свой ник у старшего не затираем: у него он актуальнее.
    telegramUsername: target.telegram_username ? null : source.telegram_username,
    email: source.email,
    fullName: source.full_name,
    subscribedTelegram: source.subscribed_telegram,
    consent152fz: source.consent_152fz,
  })

  return { lead: merged, archived, sourceDeleted }
}

async function transferClubSubscriptions(
  client: ServiceClient,
  targetId: string,
  sourceId: string
): Promise<void> {
  const { count, error: countError } = await client
    .from('club_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', targetId)
    .in('status', ['active', 'past_due'])
  if (countError) throw countError

  const query = client.from('club_subscriptions').update({ lead_id: targetId }).eq('lead_id', sourceId)
  // У старшего уже есть живая подписка — переносим только историю,
  // иначе упрёмся в idx_club_one_active.
  const { error } = (count ?? 0) > 0 ? await query.in('status', ['canceled', 'expired']) : await query
  if (error) throw error
}

async function transferWaitlistEntry(
  client: ServiceClient,
  targetId: string,
  sourceId: string
): Promise<void> {
  const { data: targetEntry, error: targetError } = await client
    .from('waitlist_entries')
    .select('id, deposit_status')
    .eq('lead_id', targetId)
    .maybeSingle()
  if (targetError) throw targetError

  if (!targetEntry) {
    const { error } = await client
      .from('waitlist_entries')
      .update({ lead_id: targetId })
      .eq('lead_id', sourceId)
    if (error) throw error
    return
  }

  // У старшего запись уже есть. Оплаченный депозит младшего важнее —
  // подтягиваем его в запись старшего, дубль удаляем.
  const { data: sourceEntry, error: sourceError } = await client
    .from('waitlist_entries')
    .select('id, tier_interest, deposit_status, deposit_payment_id')
    .eq('lead_id', sourceId)
    .maybeSingle()
  if (sourceError) throw sourceError
  if (!sourceEntry) return

  if (targetEntry.deposit_status === 'none' && sourceEntry.deposit_status !== 'none') {
    const { error } = await client
      .from('waitlist_entries')
      .update({
        tier_interest: sourceEntry.tier_interest,
        deposit_status: sourceEntry.deposit_status,
        deposit_payment_id: sourceEntry.deposit_payment_id,
      })
      .eq('id', targetEntry.id)
    if (error) throw error
  }

  const { error: deleteError } = await client.from('waitlist_entries').delete().eq('id', sourceEntry.id)
  if (deleteError) throw deleteError
}

/** Сколько строк всё ещё ссылается на лида. Ноль — лида можно удалять безопасно. */
async function countDependents(client: ServiceClient, leadId: string): Promise<number> {
  const head = { count: 'exact', head: true } as const

  const results = await Promise.all([
    client.from('test_sessions').select('id', head).eq('lead_id', leadId),
    client.from('events').select('id', head).eq('lead_id', leadId),
    client.from('payments').select('id', head).eq('lead_id', leadId),
    client.from('telegram_access_grants').select('id', head).eq('lead_id', leadId),
    client.from('club_subscriptions').select('id', head).eq('lead_id', leadId),
    client.from('waitlist_entries').select('id', head).eq('lead_id', leadId),
  ])

  let total = 0
  for (const result of results) {
    if (result.error) throw result.error
    total += result.count ?? 0
  }
  return total
}
