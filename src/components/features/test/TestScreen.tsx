'use client'

import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTestSession } from '@/lib/test/useTestSession'
import { BackButton } from './BackButton'
import { MatrixViz } from './MatrixViz'
import { PortraitPickCard } from './PortraitPickCard'
import { TestIntro } from './TestIntro'
import { TestProgress } from './TestProgress'
import { TestSkeleton } from './TestSkeleton'
import { TriadCard } from './TriadCard'

/** Оркестратор экрана `/test` (Чертёж.md, БЛОК 4 «Экран: Тест»). */
export function TestScreen() {
  const {
    phase,
    step,
    progress,
    matrix,
    canGoBack,
    answerError,
    isSavingAnswer,
    submitError,
    fatalMessage,
    selectOption,
    retryAnswer,
    goBack,
    submitTest,
    restart,
    beginTest,
  } = useTestSession()

  if (phase === 'loading') {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-8 sm:py-12 lg:max-w-[900px]">
        <TestSkeleton />
      </div>
    )
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-8 sm:py-12 lg:max-w-[900px]">
        <TestIntro onStart={beginTest} />
      </div>
    )
  }

  if (phase === 'fatal') {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-4 px-4 py-20 text-center">
        <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />
        <p className="text-base text-foreground">{fatalMessage ?? 'Не удалось начать тест'}</p>
        <Button onClick={restart}>Начать заново</Button>
      </div>
    )
  }

  if (!step || !progress || !matrix) return null

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-8 sm:py-12 lg:max-w-[900px] lg:flex-row-reverse lg:items-start lg:gap-10">
      <div className="mx-auto w-36 sm:w-44 lg:mx-0 lg:w-56">
        <MatrixViz matrix={matrix} />
      </div>

      <div className="flex flex-1 flex-col gap-5">
        <TestProgress answered={progress.answered} totalMin={progress.total_min} />

        {step.kind === 'ready' && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-lg font-medium">Готово.</p>
            <p className="text-sm text-muted-foreground">Посмотрим, что получилось.</p>
            {submitError && (
              <Alert variant="destructive" className="text-left">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Не удалось получить результат</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <Button onClick={submitTest} disabled={phase === 'submitting'}>
              {phase === 'submitting' ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Считаем...
                </>
              ) : (
                'Узнать свой тип'
              )}
            </Button>
          </div>
        )}

        {step.kind === 'portrait_pick' && (
          <>
            <PortraitPickCard candidates={step.candidates} onPick={(type) => selectOption(String(type))} disabled={isSavingAnswer} />
            {answerError && (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Не удалось сохранить выбор</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>{answerError}</span>
                  <Button type="button" size="sm" variant="outline" onClick={retryAnswer}>
                    Повторить
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {(step.kind === 'triad' || step.kind === 'tiebreak') && (
          <>
            <TriadCard
              prompt={step.prompt}
              options={step.options}
              onSelect={selectOption}
              disabled={isSavingAnswer}
            />
            {answerError && (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Не удалось сохранить ответ</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>{answerError}</span>
                  <Button type="button" size="sm" variant="outline" onClick={retryAnswer}>
                    Повторить
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        <div>
          <BackButton onClick={goBack} disabled={!canGoBack || isSavingAnswer} />
        </div>
      </div>
    </div>
  )
}
