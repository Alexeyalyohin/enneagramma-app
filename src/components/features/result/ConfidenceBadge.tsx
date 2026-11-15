import { Badge } from '@/components/ui/badge'

interface ConfidenceBadgeProps {
  borderline: boolean
  runnerUp: number
}

/** Пометка о пограничном результате. */
export function ConfidenceBadge({ borderline, runnerUp }: ConfidenceBadgeProps) {
  if (!borderline) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="h-6 px-2.5 text-xs">
        Пограничный результат
      </Badge>
      <span className="text-xs text-muted-foreground">
        Стоит также посмотреть описание типа {runnerUp}.
      </span>
    </div>
  )
}
