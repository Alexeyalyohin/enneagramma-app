import { Badge } from '@/components/ui/badge'
import { formatPercent } from '@/lib/format'

interface ConfidenceBadgeProps {
  confidence: number
  borderline: boolean
  runnerUp: number
}

/**
 * Уверенность результата. Пограничные случаи не прячем (Чертёж.md, edge case
 * 8: «честная пометка «пограничный между N и M», не скрываем неопределённость»).
 */
export function ConfidenceBadge({ confidence, borderline, runnerUp }: ConfidenceBadgeProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={borderline ? 'outline' : 'default'} className="h-6 px-2.5 text-xs">
        Уверенность {formatPercent(confidence)}
      </Badge>
      {borderline && (
        <span className="text-xs text-muted-foreground">
          Пограничный результат — между этим типом и типом {runnerUp}
        </span>
      )}
    </div>
  )
}
