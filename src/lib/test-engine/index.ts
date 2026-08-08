/**
 * Публичный вход движка теста v0.4.
 * Роуты импортируют только отсюда — внутренняя раскладка модулей может меняться.
 */

export * from './types'
export * from './grid'
export * from './questions'
export * from './scoring'
export * from './flow'
export { parseStoredAnswers, parseTestResult } from './serialization'
