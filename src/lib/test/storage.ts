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
