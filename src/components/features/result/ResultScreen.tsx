'use client'

/** Оркестратор `/test/result/[sessionId]` (Чертёж.md, БЛОК 4 «Экран: Результат»). */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { apiGet } from '@/lib/fetch-api'
import type { TestResultData } from '@/lib/result/types'
import { clearLastTestResult, clearTestState } from '@/lib/test/storage'
import { AlternativeTypeSwitch } from './AlternativeTypeSwitch'
import { ConfidenceBadge } from './ConfidenceBadge'
import { ResultSkeleton } from './ResultSkeleton'
import { TelegramCTA } from './TelegramCTA'
import { TypePortrait } from './TypePortrait'
import { TypePortraitHeader } from './TypePortraitHeader'
import { WingHint } from './WingHint'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-ready' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; data: TestResultData }

interface ResultScreenProps {
  sessionId: string
}

export function ResultScreen({ sessionId }: ResultScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [manualResultUrl, setManualResultUrl] = useState('')
  // Чисто отображение уже посчитанного раннер-апа — сессию/тест это не трогает.
  const [viewingAlternative, setViewingAlternative] = useState(false)

  function resetTest() {
    clearLastTestResult(sessionId)
    clearTestState()
  }

  async function copyResultLink() {
    const url = new URL(`/test/result/${sessionId}`, window.location.origin).href
    try {
      await navigator.clipboard.writeText(url)
      setManualResultUrl('')
      toast.add({ title: 'Ссылка скопирована', type: 'success' })
    } catch {
      setManualResultUrl(url)
    }
  }

  // `load` — `async`: см. пояснение в DashboardScreen/useTestSession про
  // react-hooks/set-state-in-effect.
  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const result = await apiGet<TestResultData>(`/api/test/result/${sessionId}`)
    if (!result.ok) {
      if (result.error.code === 'RESULT_NOT_FOUND') {
        clearLastTestResult(sessionId)
        setState({ kind: 'not-found' })
        return
      }
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

  if (state.kind === 'not-found') {
    return (
      <div className="mx-auto flex w-full max-w-180 flex-col items-center gap-4 px-4 py-20 text-center">
        <p className="text-base text-foreground">Результат не найден. Возможно, ссылка неполная</p>
        <Button render={<Link href="/test" />} nativeButton={false}>
          Пройти тест
        </Button>
      </div>
    )
  }

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
  const displayedType = showingAlternative && alternative ? alternative.type : data.type
  const portraitDisagrees = typeof data.portrait_type === 'number' && data.portrait_type !== data.type

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6 px-4 py-10 sm:py-14">
      {showingAlternative && alternative ? (
        <TypePortraitHeader title={alternative.title} shortSummary={alternative.short_summary} />
      ) : (
        <TypePortraitHeader title={data.title} shortSummary={data.short_summary} />
      )}

      {!showingAlternative && (
        <>
          <ConfidenceBadge borderline={data.borderline} runnerUp={data.runner_up} />
          <WingHint wing={data.wing} wings={data.wings} tied={data.wing_tied} />
        </>
      )}

      {alternative && (
        <AlternativeTypeSwitch
          viewing={showingAlternative}
          primaryType={data.type}
          alternativeType={alternative.type}
          portraitDisagrees={portraitDisagrees}
          onToggle={() => setViewingAlternative((prev) => !prev)}
        />
      )}

      {/* Задача (2026-09-30): CTA — первое действие на экране, сразу после
          уверенности/крыла, а не в конце страницы после длинного текста. */}
      <TelegramCTA sessionId={sessionId} selectedType={displayedType} />

      <p className="text-sm text-muted-foreground">
        Используй результат как гипотезу для самонаблюдения. Тест не предназначен для психологической диагностики.
      </p>

      {showingAlternative && alternative ? (
        <TypePortrait portraitMd={alternative.portrait_md} />
      ) : (
        <TypePortrait portraitMd={data.portrait_md} />
      )}

      <section aria-labelledby="compatibility-heading" className="border-t border-border pt-6">
        <h2 id="compatibility-heading" className="text-xl font-medium text-foreground">
          Твой тип в отношениях
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Посмотри, что вас сближает и как лучше понимать друг друга.
          {' '}Выбери тип партнёра — свой тип тоже можно изменить.
        </p>
        <a
          href={`https://enneagramma.one/compatibility?type=${displayedType}`}
          target="_top"
          className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Посмотреть совместимость →
        </a>
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" size="lg" onClick={copyResultLink}>
            Скопировать ссылку
          </Button>
          <Button
            render={<Link href="/test" onNavigate={resetTest} />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            Пройти заново
          </Button>
        </div>
        {manualResultUrl && (
          <label className="flex flex-col gap-2 text-sm text-muted-foreground">
            Скопируй ссылку вручную
            <input
              type="text"
              readOnly
              value={manualResultUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
        )}
      </div>

      {/* Чертёж-интерфейса-Эннеаграмма.md, «Тест (результат)»: выход для тех,
          кто не готов оставить контакт — доступен всегда, без формы. Внешняя
          ссылка: главная живёт на Tilda (enneagramma.one), не в этом приложении. */}
      <nav aria-label="Ссылки сайта" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <a href="https://enneagramma.one" target="_top" className="underline-offset-4 hover:underline">
          Вернуться на главную
        </a>
        <a
          href="https://enneagramma.one/offer"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Договор оферты
        </a>
      </nav>
    </div>
  )
}
