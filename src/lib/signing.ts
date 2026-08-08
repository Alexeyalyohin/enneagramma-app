/**
 * Подписи и секреты внешних интеграций.
 *
 * В файле ТРИ независимых механизма — намеренно не смешанных в одну функцию,
 * потому что у них разные владельцы, разные секреты и разная модель угроз:
 *
 *   1. `signLinkToken` / `verifyLinkToken` — НАШ short-lived токен для deep-link
 *      в бота Salebot (`?start=club_<token>`). Секрет — `LINK_SIGNING_SECRET`.
 *   2. `verifyProdamusSignature` — HMAC-SHA256 входящего вебхука Prodamus.
 *      Секрет — `PRODAMUS_SECRET_KEY`. Алгоритм диктует провайдер.
 *   3. `verifySalebotSecret` — простой общий секрет в заголовке/URL вебхука
 *      Salebot. Это НЕ подпись: сравнивается само значение `SALEBOT_WEBHOOK_SECRET`.
 *
 * Общее правило: все сравнения — constant-time (`timingSafeEqual`), никаких `===`
 * по секретам. Отсутствие секрета в env = «не валидно» (fail closed), а не
 * «пропустить»: иначе забытая переменная на Vercel молча открывает вебхук миру.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { logError } from '@/lib/logger'

// -----------------------------------------------------------------------------
// Общее
// -----------------------------------------------------------------------------

/** Сравнение секретов/подписей за постоянное время. Разная длина → false. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function readEnv(name: string): string | null {
  const value = process.env[name]
  if (!value || value.trim() === '') return null
  return value
}

// -----------------------------------------------------------------------------
// 1. Токен deep-link в бота Salebot
// -----------------------------------------------------------------------------

/**
 * Префикс полезной нагрузки `?start=` (Чертёж: `?start=club_<signed_token>`).
 * Salebot присылает токен в `/api/leads/link-telegram` обычно вместе с ним.
 */
export const CLUB_TOKEN_PREFIX = 'club_'

/** TTL по умолчанию — сутки (edge case 25: просроченный токен отклоняем). */
export const LINK_TOKEN_TTL_SECONDS = 24 * 60 * 60

const LINK_TOKEN_VERSION = 1
const SUBJECT_LEAD = 1
const SUBJECT_SESSION = 2
/** 128 бит усечённого HMAC — достаточно для суточного токена, экономит длину. */
const MAC_BYTES = 16
const PAYLOAD_BYTES = 22 // version(1) + kind(1) + uuid(16) + exp(4)

/**
 * ПОЧЕМУ БИНАРНЫЙ ФОРМАТ, А НЕ JSON+base64.
 *
 * Telegram жёстко ограничивает параметр deep-link: 1–64 символа из набора
 * `A-Z a-z 0-9 _ -`. На `club_` уходит 5 символов, остаётся 59. JSON вида
 * `{"lead_id":"<uuid>","exp":1234567890}` + отдельная подпись base64 не влезают
 * даже близко (~110 символов), а точка-разделитель (JWT-стиль) в `start`
 * вообще запрещена. Поэтому:
 *
 *   payload = [версия:1][вид субъекта:1][UUID:16][exp UNIX-сек, BE:4]  = 22 байта
 *   token   = base64url(payload || HMAC-SHA256(payload)[0..16])        = 51 символ
 *   `club_` + токен                                                    = 56 символов
 *
 * СЛЕДСТВИЕ (осознанный компромисс): в токен помещается РОВНО ОДИН субъект.
 * Пара `lead_id` + `session_id` (38 байт payload) не укладывается в лимит ни при
 * каком разумном размере MAC. Приоритет — `lead_id` (долговечный ключ), и только
 * если лида ещё нет (анонимный проходивший тест) — `session_id`; лид тогда
 * создастся в `link-telegram` по пришедшему `telegram_id`, а сессия подтянется
 * из токена. Функциональной потери нет: по `session_id` лид находится, а по
 * `lead_id` сессия для клубного сценария Salebot не нужна.
 *
 * `exp` как UInt32BE валиден до 2106 года.
 */
export interface LinkTokenPayload {
  lead_id?: string
  session_id?: string
  /** UNIX-время (секунды) истечения. */
  exp: number
}

export interface SignLinkTokenInput {
  lead_id?: string | null
  session_id?: string | null
  /** Явный `exp` (UNIX-сек). Если не задан — считается из `ttl_seconds`. */
  exp?: number
  ttl_seconds?: number
}

export type LinkTokenFailure = 'missing_secret' | 'malformed' | 'bad_signature' | 'expired'

export type LinkTokenVerification =
  | { valid: true; payload: LinkTokenPayload }
  | { valid: false; reason: LinkTokenFailure }

const UUID_HEX = /^[0-9a-f]{32}$/i

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '')
  if (!UUID_HEX.test(hex)) throw new Error('link-token: субъект должен быть UUID')
  return Buffer.from(hex, 'hex')
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function linkSecret(): string | null {
  return readEnv('LINK_SIGNING_SECRET')
}

/**
 * Подписывает токен deep-link. Бросает, если нет секрета или субъекта —
 * это ошибка конфигурации/вызова, а не пользовательский сценарий.
 */
export function signLinkToken(input: SignLinkTokenInput): string {
  const secret = linkSecret()
  if (!secret) {
    throw new Error('LINK_SIGNING_SECRET не задан — токен deep-link подписать нечем')
  }

  const kind = input.lead_id ? SUBJECT_LEAD : SUBJECT_SESSION
  const subjectId = input.lead_id ?? input.session_id
  if (!subjectId) {
    throw new Error('signLinkToken: нужен lead_id или session_id')
  }

  const exp = input.exp ?? Math.floor(Date.now() / 1000) + (input.ttl_seconds ?? LINK_TOKEN_TTL_SECONDS)

  const payload = Buffer.alloc(PAYLOAD_BYTES)
  payload.writeUInt8(LINK_TOKEN_VERSION, 0)
  payload.writeUInt8(kind, 1)
  uuidToBytes(subjectId).copy(payload, 2)
  payload.writeUInt32BE(exp, 18)

  const mac = createHmac('sha256', secret).update(payload).digest().subarray(0, MAC_BYTES)
  return Buffer.concat([payload, mac]).toString('base64url')
}

/**
 * Проверяет токен из `?start=club_<token>`: формат → подпись → TTL.
 * Префикс `club_` допускается и снимается — Salebot передаёт `token` целиком.
 */
export function verifyLinkToken(raw: string, nowSeconds?: number): LinkTokenVerification {
  const secret = linkSecret()
  if (!secret) {
    logError('signing.link_token.missing_secret', {})
    return { valid: false, reason: 'missing_secret' }
  }

  const trimmed = raw.trim()
  const token = trimmed.startsWith(CLUB_TOKEN_PREFIX)
    ? trimmed.slice(CLUB_TOKEN_PREFIX.length)
    : trimmed
  if (token === '' || !/^[A-Za-z0-9_-]+$/.test(token)) return { valid: false, reason: 'malformed' }

  let decoded: Buffer
  try {
    decoded = Buffer.from(token, 'base64url')
  } catch {
    return { valid: false, reason: 'malformed' }
  }

  if (decoded.length !== PAYLOAD_BYTES + MAC_BYTES) return { valid: false, reason: 'malformed' }

  const payload = decoded.subarray(0, PAYLOAD_BYTES)
  const mac = decoded.subarray(PAYLOAD_BYTES)

  if (payload.readUInt8(0) !== LINK_TOKEN_VERSION) return { valid: false, reason: 'malformed' }
  const kind = payload.readUInt8(1)
  if (kind !== SUBJECT_LEAD && kind !== SUBJECT_SESSION) return { valid: false, reason: 'malformed' }

  const expected = createHmac('sha256', secret).update(payload).digest().subarray(0, MAC_BYTES)
  if (!timingSafeEqual(mac, expected)) return { valid: false, reason: 'bad_signature' }

  const exp = payload.readUInt32BE(18)
  const now = nowSeconds ?? Math.floor(Date.now() / 1000)
  if (exp <= now) return { valid: false, reason: 'expired' }

  const subjectId = bytesToUuid(payload.subarray(2, 18))
  return {
    valid: true,
    payload:
      kind === SUBJECT_LEAD ? { lead_id: subjectId, exp } : { session_id: subjectId, exp },
  }
}

/** Готовая нагрузка для `?start=` — с префиксом клуба. */
export function buildClubStartPayload(input: SignLinkTokenInput): string {
  return `${CLUB_TOKEN_PREFIX}${signLinkToken(input)}`
}

// -----------------------------------------------------------------------------
// 2. Подпись Prodamus (HMAC-SHA256)
// -----------------------------------------------------------------------------

/**
 * ⚠️ ВЕРИФИЦИРОВАТЬ ПЕРЕД ПРОДАКШНОМ.
 *
 * Алгоритм реализован строго по описанию в Чертёж.md (БЛОК 3 «Вебхуки» и
 * БЛОК 5 «Интеграция: Prodamus»): значения → строки → сортировка ключей по
 * алфавиту вглубь → JSON → HMAC-SHA256 по `PRODAMUS_SECRET_KEY` → hex.
 * Это перенос логики PHP-класса `Hmac` Prodamus на TypeScript, сделанный по
 * текстовому описанию, БЕЗ доступа к официальной документации/исходнику
 * провайдера. Тонкие места, где реализации расходятся чаще всего:
 *
 *   • флаги `json_encode`: PHP по умолчанию экранирует `/` и не-ASCII
 *     (`\/`, `\uXXXX`), Prodamus использует JSON_UNESCAPED_UNICODE |
 *     JSON_UNESCAPED_SLASHES — здесь мы считаем именно так, потому что
 *     `JSON.stringify` в JS ведёт себя ровно как эта пара флагов;
 *   • `strval(true)` в PHP = `"1"`, `strval(false)` = `""`, `strval(null)` = `""`;
 *   • `products[0][price]` в PHP-массиве становится СПИСКОМ (JSON `[...]`),
 *     а не объектом — здесь это восстанавливает `parseNestedFormFields`;
 *   • поле `signature` в подписываемый набор не входит.
 *
 * Перед приёмом реальных денег: сверить с официальным `Hmac.php` Prodamus
 * (или прогнать тестовый платёж в песочнице) и зафиксировать расхождения.
 * Выдавать это за проверенную реализацию нельзя.
 */
function prodamusSecret(): string | null {
  return readEnv('PRODAMUS_SECRET_KEY')
}

/** PHP `ksort` (SORT_REGULAR): числовые ключи сравниваются как числа. */
function compareKeys(a: string, b: string): number {
  const numA = Number(a)
  const numB = Number(b)
  if (a !== '' && b !== '' && Number.isFinite(numA) && Number.isFinite(numB)) {
    return numA - numB
  }
  return a < b ? -1 : a > b ? 1 : 0
}

/** Рекурсивно: значения → строки (по правилам PHP `strval`), ключи → по алфавиту. */
function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForSignature)

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort(compareKeys)) {
      sorted[key] = normalizeForSignature(source[key])
    }
    return sorted
  }

  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? '1' : ''
  return String(value)
}

/** Канонический JSON, по которому считается HMAC. Вынесен для отладки/тестов. */
export function prodamusCanonicalJson(fields: Record<string, unknown>): string {
  const withoutSignature: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'signature' || key === 'sign' || key === 'Sign') continue
    withoutSignature[key] = value
  }
  return JSON.stringify(normalizeForSignature(withoutSignature))
}

/** Считает подпись Prodamus (hex, нижний регистр). */
export function createProdamusSignature(fields: Record<string, unknown>, secretKey?: string): string {
  const secret = secretKey ?? prodamusSecret()
  if (!secret) {
    throw new Error('PRODAMUS_SECRET_KEY не задан — подписать запрос к Prodamus нечем')
  }
  return createHmac('sha256', secret).update(prodamusCanonicalJson(fields), 'utf8').digest('hex')
}

/**
 * Проверяет подпись вебхука Prodamus.
 * Вызывать ДО любой записи в БД (edge case 12): не совпало → `400 INVALID_SIGNATURE`.
 */
export function verifyProdamusSignature(fields: Record<string, unknown>, signature: string): boolean {
  const secret = prodamusSecret()
  if (!secret) {
    logError('signing.prodamus.missing_secret', {})
    return false
  }
  if (!signature || signature.trim() === '') return false

  try {
    const expected = createProdamusSignature(fields, secret)
    return safeEqual(expected, signature.trim().toLowerCase())
  } catch (error) {
    logError('signing.prodamus.verify_failed', {}, error)
    return false
  }
}

/**
 * Восстанавливает вложенную структуру из плоских ключей формы
 * (`products[0][price]` → `{ products: [ { price } ] }`), как это делает PHP
 * при разборе `$_POST`. Без этого шага канонический JSON не совпадёт с тем,
 * по которому Prodamus считал подпись.
 *
 * Объект, все ключи которого — последовательные `0..n-1`, превращается в массив:
 * `json_encode` в PHP для такого массива даёт `[...]`, а не `{...}`.
 */
export function parseNestedFormFields(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {}

  for (const [rawKey, value] of Object.entries(flat)) {
    const segments = splitFormKey(rawKey)
    let cursor: Record<string, unknown> = root

    for (let i = 0; i < segments.length; i += 1) {
      let segment = segments[i]
      // `a[]=1` — PHP дописывает в конец списка.
      if (segment === '') segment = String(Object.keys(cursor).length)

      if (i === segments.length - 1) {
        cursor[segment] = value
        continue
      }

      const next = cursor[segment]
      if (next === null || typeof next !== 'object') {
        const created: Record<string, unknown> = {}
        cursor[segment] = created
        cursor = created
      } else {
        cursor = next as Record<string, unknown>
      }
    }
  }

  return listify(root) as Record<string, unknown>
}

function splitFormKey(key: string): string[] {
  const open = key.indexOf('[')
  if (open === -1) return [key]

  const segments = [key.slice(0, open)]
  const rest = key.slice(open)
  const matcher = /\[([^\]]*)\]/g
  let match = matcher.exec(rest)
  while (match !== null) {
    segments.push(match[1])
    match = matcher.exec(rest)
  }
  return segments
}

function listify(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value

  const source = value as Record<string, unknown>
  const keys = Object.keys(source)
  const converted: Record<string, unknown> = {}
  for (const key of keys) converted[key] = listify(source[key])

  const isList = keys.length > 0 && keys.every((key, index) => key === String(index))
  return isList ? keys.map((key) => converted[key]) : converted
}

// -----------------------------------------------------------------------------
// 3. Секрет Salebot (не подпись — общий секрет)
// -----------------------------------------------------------------------------

/** Заголовки, в которых принимаем секрет Salebot. */
const SALEBOT_SECRET_HEADERS = ['x-salebot-secret', 'x-webhook-secret', 'x-api-key'] as const
/** Параметры URL, в которых принимаем секрет Salebot. */
const SALEBOT_SECRET_QUERY = ['secret', 'salebot_secret', 'key'] as const

/**
 * Секрет Salebot в заголовке ИЛИ в URL (Чертёж: «секрет Salebot в URL/заголовке»).
 * URL-вариант нужен потому, что конструктор не всегда даёт задать заголовки.
 *
 * ПДн-нюанс: секрет в query попадает в логи Vercel. Это допущение Чертежа;
 * при возможности настраивать заголовок в ЛК Salebot — использовать заголовок.
 */
export function verifySalebotSecret(request: Request): boolean {
  const expected = readEnv('SALEBOT_WEBHOOK_SECRET')
  if (!expected) {
    logError('signing.salebot.missing_secret', {})
    return false
  }

  for (const header of SALEBOT_SECRET_HEADERS) {
    const provided = request.headers.get(header)
    if (provided && safeEqual(expected, provided.trim())) return true
  }

  // `Authorization: Bearer <secret>` — частый вариант в конструкторах.
  const authorization = request.headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    if (safeEqual(expected, authorization.slice(7).trim())) return true
  }

  try {
    const url = new URL(request.url)
    for (const param of SALEBOT_SECRET_QUERY) {
      const provided = url.searchParams.get(param)
      if (provided && safeEqual(expected, provided.trim())) return true
    }
  } catch {
    // Некорректный URL — считаем, что секрета нет.
  }

  return false
}
