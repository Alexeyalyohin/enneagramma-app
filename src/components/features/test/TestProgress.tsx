import type { NextStep, TestProgress as Progress } from '@/lib/test-engine'

interface TestProgressProps {
  kind: NextStep['kind']
  progress: Progress
}

export function TestProgress({ kind, progress }: TestProgressProps) {
  if (kind === 'tiebreak') {
    const answered = progress.clarifications_answered
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {answered === undefined ? 'Уточняющие вопросы' : `Уточняющий вопрос ${answered + 1}`}
      </p>
    )
  }

  if (kind !== 'triad') return null

  const { answered, total_min: totalMin } = progress
  const percent = totalMin > 0 ? Math.min(100, Math.round((answered / totalMin) * 100)) : 0

  return (
    <div
      role="progressbar"
      aria-label="Прогресс основных вопросов"
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
        Основной вопрос {Math.min(answered + 1, totalMin)} из {totalMin}
      </p>
    </div>
  )
}
