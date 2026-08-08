'use client'

/** Оркестратор `/test/result/[sessionId]` (Чертёж.md, БЛОК 4 «Экран: Результат»). */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/fetch-api'
import type { TestResultData } from '@/lib/result/types'
import { ConfidenceBadge } from './ConfidenceBadge'
import { LeadCaptureForm, type LeadCaptureResult } from './LeadCaptureForm'
import { ResultSkeleton } from './ResultSkeleton'
import { TelegramCTA } from './TelegramCTA'
import { TypePortrait } from './TypePortrait'
import { WingHint } from './WingHint'

/** Совпадает с дефолтом бэкенда в `POST /api/leads/capture` (см. src/app/api/leads/capture/route.ts). */
const DEFAULT_TELEGRAM_LINK = 'https://t.me/enneagramma_one'

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
  const [captureResult, setCaptureResult] = useState<LeadCaptureResult | null>(null)

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
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-4 px-4 py-20 text-center">
        <p className="text-base text-foreground">Тест не завершён</p>
        <Button render={<Link href="/test" />}>Пройти заново</Button>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-4 px-4 py-20 text-center">
        <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />
        <p className="text-base text-foreground">{state.message}</p>
        <Button onClick={load}>Повторить</Button>
      </div>
    )
  }

  const { data } = state
  const showTelegramCta = Boolean(captureResult) || data.captured

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-10 sm:py-14">
      <TypePortrait title={data.title} portraitMd={data.portrait_md} shortSummary={data.short_summary} />

      <ConfidenceBadge confidence={data.confidence} borderline={data.borderline} runnerUp={data.runner_up} />

      <WingHint wing={data.wing} wings={data.wings} />

      {showTelegramCta ? (
        <TelegramCTA
          leadId={captureResult?.lead_id ?? ''}
          sessionId={sessionId}
          deepLink={captureResult?.telegram_deep_link ?? DEFAULT_TELEGRAM_LINK}
        />
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div>
            <p className="text-sm font-medium text-foreground">Сохрани результат и получай разборы</p>
            <p className="text-xs text-muted-foreground">Оставь телефон — пришлём разбор и не потеряем твой тип.</p>
          </div>
          <LeadCaptureForm sessionId={sessionId} onCaptured={setCaptureResult} />
        </div>
      )}
    </div>
  )
}
