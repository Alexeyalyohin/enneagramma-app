const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
const MAX_UTM_LENGTH = 128

export type TestAttribution = Partial<Record<(typeof UTM_KEYS)[number], string>>

export function cleanTestAttribution(input: unknown): TestAttribution {
  const attribution: TestAttribution = {}
  if (!input || typeof input !== 'object') return attribution

  const values = input as Record<string, unknown>
  for (const key of UTM_KEYS) {
    const raw = values[key]
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    // Метки — короткие названия кампаний, без управляющих символов и адресов почты.
    if (value && value.length <= MAX_UTM_LENGTH && /^[\p{L}\p{M}\p{N} _.,+%()-]+$/u.test(value)) {
      attribution[key] = key === 'utm_source' ? value.toLowerCase() : value
    }
  }
  return attribution
}

const MAIN_SITE_ORIGIN = 'https://enneagramma.one'
const PARENT_ORIGINS = new Set([MAIN_SITE_ORIGIN, 'https://www.enneagramma.one'])
const MESSAGE_REQUEST = 'enneagramma:test-attribution-request'
const MESSAGE_REPLY = 'enneagramma:test-attribution'
const PARENT_TIMEOUT_MS = 250

/** Метки из прямой ссылки или от страницы Tilda, в которую встроен тест. */
export function readTestAttribution(): Promise<TestAttribution> {
  const query = new URLSearchParams(window.location.search)
  const direct = cleanTestAttribution(Object.fromEntries(UTM_KEYS.map((key) => [key, query.get(key)])))
  if (Object.keys(direct).length || window.parent === window) return Promise.resolve(direct)

  const origin = document.referrer ? new URL(document.referrer).origin : MAIN_SITE_ORIGIN
  if (!PARENT_ORIGINS.has(origin)) return Promise.resolve({})

  return new Promise((resolve) => {
    function finish(attribution: TestAttribution) {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve(attribution)
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== origin || event.source !== window.parent) return
      if (event.data?.type === MESSAGE_REPLY) finish(cleanTestAttribution(event.data.utm))
    }

    const timeout = window.setTimeout(() => finish({}), PARENT_TIMEOUT_MS)
    window.addEventListener('message', onMessage)
    window.parent.postMessage(MESSAGE_REQUEST, origin)
  })
}
