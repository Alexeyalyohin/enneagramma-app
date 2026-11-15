'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { LastTestResult } from '@/lib/test/storage'

interface TestIntroProps {
  onStart: () => void
  lastResult: LastTestResult | null
}

/**
 * Стартовый экран показывается до первого вопроса; переход к
 * вопросам — только по клику «Начать» (сессия на бэкенде создаётся тогда же,
 * не раньше — см. `useTestSession`).
 */
export function TestIntro({ onStart, lastResult }: TestIntroProps) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-semibold tracking-wide text-primary uppercase">
        Эннеаграмма · определение типа
      </span>
      <h1 className="font-serif text-3xl leading-tight text-balance text-foreground sm:text-4xl">
        Тест на тип Эннеаграммы
      </h1>
      {lastResult && (
        <Link
          href={`/test/result/${lastResult.sessionId}`}
          className="self-start rounded-lg border border-border px-4 py-3 text-sm text-primary underline underline-offset-4"
        >
          {lastResult.type ? `Открыть последний результат — тип ${lastResult.type}` : 'Открыть последний результат'}
        </Link>
      )}
      <p className="text-base text-muted-foreground">
        Здесь нет «да» и «нет». В каждом шаге — несколько описаний одной ситуации. Выбирай то, что
        ближе к тому, как ты реально устроен, а не к тому, каким хотел бы быть.
      </p>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-foreground/90 marker:text-primary">
        <li>Отвечай про большую часть жизни, а не про последний месяц.</li>
        <li>Ни один вариант не лучше остальных. Все три нормальные.</li>
        <li>Если завис между двумя — бери тот, который срабатывает первым, до того как ты подумал.</li>
        <li>Сначала 15 основных вопросов. Затем могут быть уточнения, а в конце будет выбор из двух описаний.</li>
      </ul>
      <Button onClick={onStart} className="w-full sm:w-auto">
        Начать
      </Button>
    </div>
  )
}
