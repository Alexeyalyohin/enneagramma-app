'use client'

/**
 * Стейт-машина экрана `/test` (Чертёж.md, БЛОК 4 «Экран: Тест»).
 *
 * Ответственность:
 *   - создать сессию / восстановить локальный снимок после F5 (edge case 5);
 *   - отправлять ответы, буферизуя последний неотправленный при сетевой
 *     ошибке (edge case 1) — UI не блокируется, показывается retry;
 *   - «Назад» — чисто локальный откат стека истории, без запроса
 *     (Чертёж.md, БЛОК 4: «из локального стейта, без запроса»);
 *   - завершение теста и переход на страницу результата.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/fetch-api'
import type { MatrixSnapshot, NextStep, TestProgress } from '@/lib/test-engine'
import { clearTestState, loadTestState, saveTestState, type HistoryEntry } from './storage'

interface SessionResponse {
  session_id: string
  version: string
  first_block: string
  next: NextStep
  progress: TestProgress
  matrix: MatrixSnapshot
}

/** Ответ GET /api/test/session/[id] — то же самое, но без version/first_block. */
interface SessionRestoreResponse {
  session_id: string
  next: NextStep
  progress: TestProgress
  matrix: MatrixSnapshot
}

interface AnswerResponse {
  next: NextStep
  progress: TestProgress
  matrix: MatrixSnapshot
}

interface SubmitResponse {
  session_id: string
  type: number
  wing: number
  confidence: number
  runner_up: number
  borderline: boolean
  result_url: string
}

type Phase = 'loading' | 'intro' | 'active' | 'submitting' | 'fatal'

/** Коды, при которых локальный снимок больше не годится — нужен новый старт. */
const RESTART_CODES = new Set(['SESSION_ABANDONED', 'SESSION_NOT_FOUND', 'SESSION_COMPLETED', 'UNEXPECTED_QUESTION'])

export interface UseTestSessionResult {
  phase: Phase
  step: NextStep | null
  progress: TestProgress | null
  matrix: MatrixSnapshot | null
  canGoBack: boolean
  answerError: string | null
  isSavingAnswer: boolean
  submitError: string | null
  fatalMessage: string | null
  selectOption: (value: string) => void
  retryAnswer: () => void
  goBack: () => void
  submitTest: () => void
  restart: () => void
  beginTest: () => void
}

export function useTestSession(): UseTestSessionResult {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [step, setStep] = useState<NextStep | null>(null)
  const [progress, setProgress] = useState<TestProgress | null>(null)
  const [matrix, setMatrix] = useState<MatrixSnapshot | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [isSavingAnswer, setIsSavingAnswer] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fatalMessage, setFatalMessage] = useState<string | null>(null)
  const lastChoice = useRef<string | null>(null)
  const initialized = useRef(false)

  const startNewSession = useCallback(async () => {
    setPhase('loading')
    setFatalMessage(null)
    setAnswerError(null)
    setSubmitError(null)
    clearTestState()

    const result = await apiPost<SessionResponse>('/api/test/session', {})
    if (!result.ok) {
      setFatalMessage(result.error.message)
      setPhase('fatal')
      return
    }

    setSessionId(result.data.session_id)
    setStep(result.data.next)
    setProgress(result.data.progress)
    setMatrix(result.data.matrix)
    setHistory([])
    saveTestState({
      sessionId: result.data.session_id,
      step: result.data.next,
      progress: result.data.progress,
      matrix: result.data.matrix,
      history: [],
    })
    setPhase('active')
  }, [])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Тело обёрнуто в async-функцию: react-hooks/set-state-in-effect не
    // триггерится на setState внутри async-функции (см. DashboardScreen —
    // тот же приём), а лениво инициализировать стейт из localStorage нельзя:
    // на сервере window нет, и лишний setState здесь всё равно неизбежен.
    async function init() {
      const stored = loadTestState()
      if (!stored) {
        // Первый заход — показываем интро (эталон ennea-test-v1_0.html,
        // renderIntro): сессию на бэкенде создаём только по клику «Начать»
        // (startNewSession/beginTest), не раньше — иначе плодим
        // test_sessions на каждый заход человека, который просто заглянул.
        setPhase('intro')
        return
      }

      // БД — источник правды (Чертёж, US-001: «F5 восстанавливает сессию из
      // БД по session_id»), localStorage — только кэш для офлайн-случая и
      // истории «Назад» (сервер её не хранит, там только линейные ответы).
      const result = await apiGet<SessionRestoreResponse>(`/api/test/session/${stored.sessionId}`)

      if (result.ok) {
        setSessionId(result.data.session_id)
        setStep(result.data.next)
        setProgress(result.data.progress)
        setMatrix(result.data.matrix)
        setHistory(stored.history)
        setPhase('active')
        saveTestState({
          sessionId: result.data.session_id,
          step: result.data.next,
          progress: result.data.progress,
          matrix: result.data.matrix,
          history: stored.history,
        })
        return
      }

      if (RESTART_CODES.has(result.error.code)) {
        // Сервер подтверждает: сессия правда протухла — локальный снимок не спасти.
        await startNewSession()
        return
      }

      // Сетевая ошибка / сервер недоступен (edge case 1): не блокируем
      // пользователя, продолжаем с последним локальным снимком как есть.
      setSessionId(stored.sessionId)
      setStep(stored.step)
      setProgress(stored.progress)
      setMatrix(stored.matrix)
      setHistory(stored.history)
      setPhase('active')
    }

    void init()
  }, [startNewSession])

  const selectOption = useCallback(
    (value: string) => {
      if (!sessionId || !step || !progress || !matrix || isSavingAnswer) return
      if (step.kind === 'ready') return

      const questionId = step.question_id
      lastChoice.current = value
      setAnswerError(null)
      setIsSavingAnswer(true)

      const prevEntry: HistoryEntry = { step, progress, matrix }

      void apiPost<AnswerResponse>('/api/test/answer', {
        session_id: sessionId,
        question_id: questionId,
        choice: value,
      }).then((result) => {
        setIsSavingAnswer(false)

        if (!result.ok) {
          if (RESTART_CODES.has(result.error.code)) {
            clearTestState()
            setFatalMessage('Сессия устарела. Начните тест заново')
            setPhase('fatal')
            return
          }
          // Сетевая ошибка / 5xx: ответ остаётся «в буфере» (lastChoice) —
          // кнопка «Повторить» в Alert шлёт тот же choice повторно.
          setAnswerError(result.error.message)
          return
        }

        const newHistory = [...history, prevEntry]
        setHistory(newHistory)
        setStep(result.data.next)
        setProgress(result.data.progress)
        setMatrix(result.data.matrix)
        saveTestState({
          sessionId,
          step: result.data.next,
          progress: result.data.progress,
          matrix: result.data.matrix,
          history: newHistory,
        })
      })
    },
    [sessionId, step, progress, matrix, isSavingAnswer, history]
  )

  const retryAnswer = useCallback(() => {
    if (!lastChoice.current) return
    selectOption(lastChoice.current)
  }, [selectOption])

  const goBack = useCallback(() => {
    if (history.length === 0 || !sessionId) return
    const prev = history[history.length - 1]
    const newHistory = history.slice(0, -1)
    setHistory(newHistory)
    setStep(prev.step)
    setProgress(prev.progress)
    setMatrix(prev.matrix)
    setAnswerError(null)
    saveTestState({ sessionId, step: prev.step, progress: prev.progress, matrix: prev.matrix, history: newHistory })
  }, [history, sessionId])

  const submitTest = useCallback(() => {
    if (!sessionId) return
    setSubmitError(null)
    setPhase('submitting')

    void apiPost<SubmitResponse>('/api/test/submit', { session_id: sessionId }).then((result) => {
      if (!result.ok) {
        setSubmitError(result.error.message)
        setPhase('active')
        return
      }
      clearTestState()
      router.push(result.data.result_url)
    })
  }, [sessionId, router])

  const restart = useCallback(() => {
    void startNewSession()
  }, [startNewSession])

  return {
    phase,
    step,
    progress,
    matrix,
    canGoBack: history.length > 0,
    answerError,
    isSavingAnswer,
    submitError,
    fatalMessage,
    selectOption,
    retryAnswer,
    goBack,
    submitTest,
    restart,
    // Тот же startNewSession, что и restart — отдельное имя для кнопки
    // «Начать» на интро-экране, чтобы не путать «начать» с «начать заново».
    beginTest: restart,
  }
}
