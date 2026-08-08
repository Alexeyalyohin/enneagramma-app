/**
 * POST /api/webhooks/salebot — приём событий бота Salebot для зеркала метрик.
 * Чертёж.md, БЛОК 3 «Вебхуки» + БЛОК 5 «Интеграция: Salebot».
 *
 * ЧТО ЭТОТ РОУТ ДЕЛАЕТ: пишет событие в `events` и обновляет зеркала
 * `club_subscriptions` / `telegram_access_grants`.
 * ЧТО ОН НЕ ДЕЛАЕТ И НЕ БУДЕТ: не вызывает Telegram Bot API, не выдаёт и не
 * отзывает доступ в канал, не берёт оплату, не продлевает подписку. Всё это —
 * Salebot ↔ Prodamus (CLAUDE.md, «Жёсткое ограничение»).
 *
 * ПОРЯДОК ШАГОВ ОБЯЗАТЕЛЕН:
 *   1. секрет источника — ДО любой записи в БД (иначе `400 INVALID_SIGNATURE`);
 *   2. `insertEventStrict` по `salebot_event_id` — замок идемпотентности:
 *      дубль доставки (edge case 16) уходит в `200 { ok: true }` до того, как
 *      кто-либо коснётся зеркал;
 *   3. опознание лида по `telegram_id`/`phone`;
 *   4. зеркалирование по контракту события;
 *   5. `200 { ok: true }` при любом валидном событии — даже если лид не нашёлся.
 *      Не-200 заставит Salebot ретраить нерешаемую проблему бесконечно;
 *      рассинхрон зеркала — забота крона `retry-salebot-sync` (edge case 17).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ERROR_CODES, apiError, readJsonBody } from '@/lib/api-response'
import { createServiceClient } from '@/lib/supabase/service'
import { insertEventStrict } from '@/lib/events'
import { verifySalebotSecret } from '@/lib/signing'
import { logError, logInfo, logWarn, maskPhone } from '@/lib/logger'
import { resolveLead } from '@/lib/leads/identity'
import { applySalebotEvent } from '@/lib/salebot/mirror'
import {
  extractLeadIdentity,
  isSupportedSalebotEvent,
  salebotWebhookSchema,
} from '@/lib/salebot/webhook'
import type { ServiceClient } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ответ по контракту Чертежа: `{ "ok": true }`, а не общий `{ data }`. */
function ok(extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, ...extra }, { status: 200 })
}

export async function POST(request: NextRequest) {
  // 1. Источник. Никаких чтений/записей БД до этой проверки.
  if (!verifySalebotSecret(request)) {
    logWarn('webhooks.salebot.bad_secret', {})
    return apiError(400, ERROR_CODES.INVALID_SIGNATURE, 'Не удалось верифицировать источник')
  }

  try {
    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const parsed = salebotWebhookSchema.safeParse(body.body)
    if (!parsed.success) {
      // Каркас события сломан (нет `event`/`salebot_event_id`) — ретраить нечего,
      // но и молчать нельзя: это баг сценария в Salebot, его надо увидеть.
      logError('webhooks.salebot.invalid_body', { issues: parsed.error.issues.length })
      return apiError(400, ERROR_CODES.VALIDATION_ERROR, 'Некорректное тело события')
    }

    const payload = parsed.data

    if (!isSupportedSalebotEvent(payload.event)) {
      // Неизвестный тип события — принимаем и игнорируем. Ошибка вызвала бы
      // вечные ретраи по событию, которого нет в нашем контракте.
      logWarn('webhooks.salebot.unsupported_event', {
        event: payload.event,
        salebot_event_id: payload.salebot_event_id,
      })
      return ok({ ignored: true })
    }

    const supabase = createServiceClient()

    // 2. Замок идемпотентности. lead_id заполним после опознания лида.
    const inserted = await insertEventStrict(supabase, {
      eventType: payload.event,
      salebotEventId: payload.salebot_event_id,
      metadata: {
        source: 'salebot',
        event: payload.event,
        occurred_at: payload.occurred_at ?? null,
      },
    })

    if (!inserted.inserted) {
      logInfo('webhooks.salebot.duplicate', {
        event: payload.event,
        salebot_event_id: payload.salebot_event_id,
      })
      return ok({ duplicate: true })
    }

    // 3. Опознание лида по telegram_id/phone.
    const identity = extractLeadIdentity(payload)
    const leadId = await resolveWebhookLead(supabase, identity, payload.salebot_event_id)

    if (!leadId) {
      logWarn('webhooks.salebot.lead_not_resolved', {
        event: payload.event,
        salebot_event_id: payload.salebot_event_id,
        telegram_id: identity.telegramId,
        phone: maskPhone(identity.phone),
        reason: 'событие сохранено в events, зеркало не обновлено',
      })
      return ok({ lead_matched: false })
    }

    await linkEventToLead(supabase, inserted.id, leadId)

    // 4. Зеркалирование по контракту события.
    const mirror = await applySalebotEvent(supabase, payload.event, leadId, payload, body.body)

    logInfo('webhooks.salebot.processed', {
      event: payload.event,
      salebot_event_id: payload.salebot_event_id,
      lead_id: leadId,
      mirrored: mirror.mirrored,
      ...(mirror.note ? { note: mirror.note } : {}),
    })

    // 5. Всегда 200 на валидное событие.
    return ok({ lead_matched: true, mirrored: mirror.mirrored })
  } catch (error) {
    // Внутренняя ошибка — единственный случай, когда мы отвечаем не-200 и
    // просим Salebot повторить.
    //
    // ЧЕСТНО ПРО КОМПРОМИСС: замок идемпотентности — строка в `events`, и она
    // уже вставлена. Если падение случилось ПОСЛЕ вставки события, но ДО
    // зеркалирования, ретрай Salebot увидит дубль и зеркало не обновит.
    // Выбор осознанный: альтернатива (сначала зеркалировать, потом ставить
    // замок) допускает ДВОЙНУЮ подписку при дубле доставки, а это хуже —
    // деньги и метрики. Незеркалированное событие ловится сверкой:
    // `events` без соответствующей строки в `club_subscriptions` подсветит крон
    // `retry-salebot-sync` (edge case 17). Транзакции на несколько таблиц
    // из PostgREST недоступны, поэтому «атомарно» это не решается.
    logError('webhooks.salebot.failed', {}, error)
    return apiError(500, ERROR_CODES.INTERNAL_ERROR, 'Не удалось обработать событие')
  }
}

/**
 * Находит лида по ключам идентичности; создаёт нового, если ключ есть, но лида
 * нет (человек пришёл в бота, минуя тест — `telegram_id` сам по себе валидный
 * ключ). Отсутствие ключей — не повод для 500: возвращаем `null`, событие уже
 * записано, владелец увидит рассинхрон в админке.
 */
async function resolveWebhookLead(
  client: ServiceClient,
  identity: ReturnType<typeof extractLeadIdentity>,
  salebotEventId: string
): Promise<string | null> {
  if (!identity.phone && !identity.telegramId) return null

  try {
    const resolved = await resolveLead(client, {
      phone: identity.phone,
      telegramId: identity.telegramId,
      telegramUsername: identity.telegramUsername,
      email: identity.email,
      fullName: identity.fullName,
      source: 'club_page',
      subscribedTelegram: true,
    })
    return resolved.lead.id
  } catch (error) {
    logError('webhooks.salebot.lead_resolve_failed', { salebot_event_id: salebotEventId }, error)
    return null
  }
}

/** Досылает `lead_id` в уже вставленную (замком идемпотентности) строку события. */
async function linkEventToLead(
  client: ServiceClient,
  eventId: string | null,
  leadId: string
): Promise<void> {
  if (!eventId) return
  const { error } = await client.from('events').update({ lead_id: leadId }).eq('id', eventId)
  if (error) {
    logWarn('webhooks.salebot.event_lead_link_failed', { event_id: eventId, lead_id: leadId })
  }
}
