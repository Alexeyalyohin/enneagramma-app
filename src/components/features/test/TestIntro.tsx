'use client'

import { Button } from '@/components/ui/button'

interface TestIntroProps {
  onStart: () => void
}

/**
 * Стартовый экран теста — перенесён дословно из эталона `ennea-test-v1_0.html`
 * (`renderIntro()`). Показывается один раз, до первого вопроса; переход к
 * вопросам — только по клику «Начать» (сессия на бэкенде создаётся тогда же,
 * не раньше — см. `useTestSession`).
 */
export function TestIntro({ onStart }: TestIntroProps) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-semibold tracking-wide text-primary uppercase">
        Эннеаграмма · определение типа
      </span>
      <h1 className="font-serif text-3xl leading-tight text-balance text-foreground sm:text-4xl">
        Тест на тип Эннеаграммы
      </h1>
      <p className="text-base text-muted-foreground">
        Здесь нет «да» и «нет». В каждом шаге — несколько описаний одной ситуации. Выбирай то, что
        ближе к тому, как ты реально устроен, а не к тому, каким хотел бы быть.
      </p>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-foreground/90 marker:text-primary">
        <li>Отвечай про большую часть жизни, а не про последний месяц.</li>
        <li>Ни один вариант не лучше остальных. Все три нормальные.</li>
        <li>Если завис между двумя — бери тот, который срабатывает первым, до того как ты подумал.</li>
        <li>15 шагов, дальше тест сам решит, нужны ли уточнения. Обычно 5–8 минут.</li>
      </ul>
      <Button onClick={onStart} className="w-full sm:w-auto">
        Начать
      </Button>
    </div>
  )
}
