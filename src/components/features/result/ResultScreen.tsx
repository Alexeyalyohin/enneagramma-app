'use client'

/** Оркестратор `/test/result/[sessionId]` (Чертёж.md, БЛОК 4 «Экран: Результат»). */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/fetch-api'
import type { TestResultData } from '@/lib/result/types'
import { AlternativeTypeSwitch } from './AlternativeTypeSwitch'
import { ConfidenceBadge } from './ConfidenceBadge'
import { ResultSkeleton } from './ResultSkeleton'
import { TelegramCTA } from './TelegramCTA'
import { TypePortrait } from './TypePortrait'
import { WingHint } from './WingHint'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-ready' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; data: TestResultData }

interface ResultScreenProps {
  sessionId: string
}

export function ResultScreen({ sessionId }: ResultScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  // Чисто отображение уже посчитанного раннер-апа — сессию/тест это не трогает.
  const [viewingAlternative, setViewingAlternative] = useState(false)

  // `load` — `async`: см. пояснение в DashboardScreen/useTestSession про
  // react-hooks/set-state-in-effect.
  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const result = await apiGet<TestResultData>(`/api/test/result/${sessionId}`)
    if (!result.ok) {
      if (result.error.code === 'RESULT_NOT_READY') {
        setState({ kind: 'not-ready' })
        return
      }
      setState({ kind: 'error', message: result.error.message })
      return
    }
    setState({ kind: 'loaded', data: result.data })
  }, [sessionId])

  useEffect(() => {
    // Локальная async-обёртка — см. пояснение в DashboardScreen.
    async function run() {
      await load()
    }
    void run()
  }, [load])

  if (state.kind === 'loading') return <ResultSkeleton />

  if (state.kind === 'not-ready') {
    return (
      <div className="mx-auto flex w-full max-w-180 flex-col items-center gap-4 px-4 py-20 text-center">
        <p className="text-base text-foreground">Тест не завершён</p>
        {/* nativeButton={false}: рендерится как <a> (next/link), не <button> — Base UI иначе ждёт настоящий <button>. */}
        <Button render={<Link href="/test" />} nativeButton={false}>
          Пройти заново
        </Button>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-180 flex-col items-center gap-4 px-4 py-20 text-center">
        <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />
        <p className="text-base text-foreground">{state.message}</p>
        <Button onClick={load}>Повторить</Button>
      </div>
    )
  }

  const { data } = state
  const alternative = data.alternative
  const showingAlternative = viewingAlternative && alternative !== null

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6 px-4 py-10 sm:py-14">
      {showingAlternative && alternative ? (
        <TypePortrait title={alternative.title} portraitMd={alternative.portrait_md} shortSummary={alternative.short_summary} />
      ) : (
        <TypePortrait title={data.title} portraitMd={data.portrait_md} shortSummary={data.short_summary} />
      )}

      {!showingAlternative && (
        <>
          <ConfidenceBadge confidence={data.confidence} borderline={data.borderline} runnerUp={data.runner_up} />
          <WingHint wing={data.wing} wings={data.wings} />
        </>
      )}

      {alternative && (
        <AlternativeTypeSwitch
          viewing={showingAlternative}
          primaryType={data.type}
          alternativeType={alternative.type}
          onToggle={() => setViewingAlternative((prev) => !prev)}
        />
      )}

      <TelegramCTA sessionId={sessionId} />
    </div>
  )
}
