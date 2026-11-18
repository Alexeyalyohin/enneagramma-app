/** Срок действия незавершённого теста, одинаковый для API и фоновой задачи. */
export const TEST_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000

interface SessionLifetime {
  status: string
  created_at: string | null
}

/** Проверка на запросе не зависит от своевременного запуска фоновой задачи. */
export function isTestSessionExpired(session: SessionLifetime, now = Date.now()): boolean {
  if (session.status === 'abandoned') return true
  if (session.status !== 'in_progress' || !session.created_at) return false

  const createdAt = Date.parse(session.created_at)
  return Number.isFinite(createdAt) && createdAt < now - TEST_SESSION_LIFETIME_MS
}

