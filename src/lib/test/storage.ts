/**
 * Локальное сохранение хода теста в `localStorage`.
 *
 * Зачем: контракт бэкенда не даёт роута «восстановить сессию с сервера» —
 * есть только `POST /api/test/session|answer|submit`. F5 посреди теста
 * (edge case 5 из Чертежа) поэтому восстанавливается из локального снимка
 * шага/прогресса/матрицы, а не повторным чтением из БД. Сама сессия и её
 * ответы остаются источником правды на сервере: локальный снимок — лишь
 * зеркало последнего успешного шага для UI.
 */

import type { MatrixSnapshot, NextStep, TestProgress } from '@/lib/test-engine'

const STORAGE_KEY = 'enneagramma:test:v1'
const LAST_RESULT_KEY = 'enneagramma:last-result:v1'
const SESSION_ID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

export interface LastTestResult {
  sessionId: string
  type?: number
}

export interface HistoryEntry {
  step: NextStep
  progress: TestProgress
  matrix: MatrixSnapshot
}

export interface StoredTestState {
  sessionId: string
  step: NextStep
  progress: TestProgress
  matrix: MatrixSnapshot
  history: HistoryEntry[]
}

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export function loadTestState(): StoredTestState | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredTestState> | null
    if (!parsed || typeof parsed.sessionId !== 'string' || !parsed.step) return null
    return parsed as StoredTestState
  } catch {
    return null
  }
}

export function saveTestState(state: StoredTestState): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Приватный режим / переполненная квота: тест продолжает работать,
    // просто без резюме после обновления страницы.
  }
}

export function clearTestState(): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // no-op
  }
}

export function loadLastTestResult(): LastTestResult | null {
  if (!isBrowser()) return null
  try {
    const result = JSON.parse(window.localStorage.getItem(LAST_RESULT_KEY) ?? 'null') as Partial<LastTestResult> | null
    if (!result || typeof result.sessionId !== 'string' || !SESSION_ID_PATTERN.test(result.sessionId)) return null
    const { sessionId, type } = result
    return typeof type === 'number' && Number.isInteger(type) && type >= 1 && type <= 9
      ? { sessionId, type }
      : { sessionId }
  } catch {
    return null
  }
}

export function saveLastTestResult(result: LastTestResult): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result))
  } catch {
    // Открыть и скопировать результат можно и без локального хранилища.
  }
}

export function clearLastTestResult(sessionId: string): void {
  if (loadLastTestResult()?.sessionId !== sessionId) return
  try {
    window.localStorage.removeItem(LAST_RESULT_KEY)
  } catch {
    // Хранилище может стать недоступным между чтением и записью.
  }
}
