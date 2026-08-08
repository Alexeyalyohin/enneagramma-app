/** Прогресс-бар теста, латунь (Чертёж.md, БЛОК 4 «Экран: Тест»). */
interface TestProgressProps {
  answered: number
  totalMin: number
}

export function TestProgress({ answered, totalMin }: TestProgressProps) {
  const percent = totalMin > 0 ? Math.min(100, Math.round((answered / totalMin) * 100)) : 0

  return (
    <div
      role="progressbar"
      aria-label="Прогресс теста"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="w-full"
    >
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Вопрос {Math.min(answered + 1, totalMin)} из {totalMin}
      </p>
    </div>
  )
}
