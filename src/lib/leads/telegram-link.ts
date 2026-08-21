/**
 * Привязка `telegram_id` к лиду по токену из deep-link.
 * Чертёж.md, БЛОК 5 «Доступ в закрытый Telegram» → «Линковка telegram_id».
 *
 * Вызывается ТОЛЬКО из `/api/leads/link-telegram`, куда стучится Salebot после
 * `?start=club_<token>`. Приложение здесь не общается с Telegram — `telegram_id`
 * приносит Salebot, мы лишь сопоставляем его с лидом и отдаём тип для сегментации.
 */

import { logWarn } from '@/lib/logger'
import { LEAD_COLUMNS, resolveLead } from '@/lib/leads/identity'
import { applyTypeToLead, currentResultSummary } from '@/lib/leads/type-assignment'
import { parseStoredAnswers, parseTestResult, pickWing, scoreAnswers, type EnneagramType } from '@/lib/test-engine'
import type { LeadRow, ServiceClient } from '@/lib/supabase/types'

export interface LinkTelegramInput {
  /** Субъект токена: лид… */
  leadId?: string | null
  /** …либо сессия теста (лида ещё не было в момент выдачи ссылки). */
  sessionId?: string | null
  telegramId: number
  telegramUsername?: string | null
}

export interface LinkTelegramResult {
  leadId: string
  merged: boolean
  created: boolean
  enneagramType: number | null
  wing: number | null
  /** Уверенность (0..1) текущего enneagramType/wing, см. `currentResultSummary`. */
  confidence: number | null
  /** Выбор был близким (тай-брейк/borderline) — confidence не про конкретный тип, см. `currentResultSummary`. */
  closeCall: boolean
  /** Сессия из токена привязана к лиду в этом вызове. */
  sessionLinked: boolean
}

async function findLeadById(client: ServiceClient, leadId: string): Promise<LeadRow | null> {
  const { data, error } = await client.from('leads').select(LEAD_COLUMNS).eq('id', leadId).maybeSingle()
  if (error) throw error
  return data
}

export async function linkTelegramToLead(
  client: ServiceClient,
  input: LinkTelegramInput
): Promise<LinkTelegramResult> {
  const tokenLead = input.leadId ? await findLeadById(client, input.leadId) : null

  if (input.leadId && !tokenLead) {
    // Лид из токена исчез (удалён по 152-ФЗ или поглощён мерджем).
    // Не ошибка: ниже опознаем/создадим лида по самому `telegram_id`.
    logWarn('leads.link_telegram.token_lead_missing', { lead_id: input.leadId })
  }

  // Лид уже привязан к ДРУГОМУ Telegram-аккаунту. Ключ идентичности молча не
  // перезаписываем (тот же принцип, что в fillMissingFields): это либо смена
  // аккаунта, либо чужой токен — и то и другое требует внимания владельца,
  // а не тихой подмены.
  if (tokenLead && tokenLead.telegram_id !== null && tokenLead.telegram_id !== input.telegramId) {
    logWarn('leads.link_telegram.conflict', {
      lead_id: tokenLead.id,
      existing_telegram_id: tokenLead.telegram_id,
      incoming_telegram_id: input.telegramId,
    })
    const summary = await currentResultSummary(client, tokenLead.id)
    return {
      leadId: tokenLead.id,
      merged: false,
      created: false,
      enneagramType: tokenLead.enneagram_type,
      wing: tokenLead.wing,
      confidence: summary?.confidence ?? null,
      closeCall: summary?.closeCall ?? false,
      sessionLinked: false,
    }
  }

  const resolved = await resolveLead(client, {
    // Телефон лида из токена нужен, чтобы resolveLead увидел ОБА ключа и при
    // конфликте (телефон в одном лиде, telegram в другом) выполнил мердж — это
    // ровно edge case 7.
    phone: tokenLead?.phone ?? null,
    telegramId: input.telegramId,
    telegramUsername: input.telegramUsername ?? null,
    source: 'club_page',
    subscribedTelegram: true,
    // Согласие уже дано: без `consent_152fz: true` подписанный токен не выдаётся
    // (`/api/club/start`), а подделать его нельзя — он проверен HMAC.
    consent152fz: true,
  })

  const leadId = resolved.lead.id
  let sessionLinked = false
  let enneagramType = resolved.lead.enneagram_type
  let wing = resolved.lead.wing
  let closeCall = false

  if (input.sessionId) {
    const outcome = await attachSessionAndType(client, input.sessionId, leadId)
    sessionLinked = outcome.linked
    closeCall = outcome.closeCall
    if (outcome.typeApplied) {
      const refreshed = await findLeadById(client, leadId)
      enneagramType = refreshed?.enneagram_type ?? enneagramType
      wing = refreshed?.wing ?? wing
    }
  }

  const summary = await currentResultSummary(client, leadId)

  return {
    leadId,
    merged: resolved.merged,
    created: resolved.created,
    enneagramType,
    wing,
    confidence: summary?.confidence ?? null,
    // Приоритет — closeCall ИМЕННО той сессии, что привязывалась в этом
    // вызове (она точно относится к enneagramType выше); currentResultSummary
    // — запасной источник для пути без sessionId (лид уже существовал).
    closeCall: input.sessionId ? closeCall : (summary?.closeCall ?? false),
    sessionLinked,
  }
}

/**
 * Привязывает сессию теста к лиду и переносит тип по правилу «последнее
 * прохождение побеждает» (см. `applyTypeToLead`). Чужую сессию (уже
 * принадлежит другому лиду) не перехватываем.
 */
async function attachSessionAndType(
  client: ServiceClient,
  sessionId: string,
  leadId: string
): Promise<{ linked: boolean; typeApplied: boolean; closeCall: boolean }> {
  const { data: session, error } = await client
    .from('test_sessions')
    .select('id, status, result, lead_id, answers, viewer_selected_type')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw error
  if (!session) {
    logWarn('leads.link_telegram.session_missing', { session_id: sessionId, lead_id: leadId })
    return { linked: false, typeApplied: false, closeCall: false }
  }

  let linked = session.lead_id === leadId

  if (session.lead_id === null) {
    const { error: linkError } = await client
      .from('test_sessions')
      .update({ lead_id: leadId })
      .eq('id', sessionId)
    if (linkError) {
      logWarn('leads.link_telegram.session_link_failed', { session_id: sessionId, lead_id: leadId })
    } else {
      linked = true
    }
  } else if (session.lead_id !== leadId) {
    logWarn('leads.link_telegram.session_owned_by_other_lead', {
      session_id: sessionId,
      lead_id: leadId,
    })
    return { linked: false, typeApplied: false, closeCall: false }
  }

  const result = parseTestResult(session.result)
  if (!linked || session.status !== 'completed' || !result) {
    return { linked, typeApplied: false, closeCall: false }
  }

  const closeCall = result.tiebreak_path.length > 0 || result.borderline

  // Если на экране результата пользователь явно переключился на раннер-апа
  // перед кликом в Telegram — записываем в лид ЕГО выбор, не алгоритмического
  // победителя. Сверяем с result.runner_up здесь заново, а не доверяем
  // колонке слепо: /api/leads/telegram-start пишет её раньше и независимо,
  // а session.result мог теоретически с тех пор смениться повторным
  // /api/test/submit по той же сессии.
  let type = result.type
  let wing = result.wing
  if (session.viewer_selected_type !== null && session.viewer_selected_type === result.runner_up) {
    type = session.viewer_selected_type as EnneagramType
    const scores = scoreAnswers(parseStoredAnswers(session.answers))
    wing = pickWing(type, scores)
  }

  const outcome = await applyTypeToLead(client, leadId, { type, wing, confidence: result.confidence })

  return { linked, typeApplied: outcome.applied, closeCall }
}
