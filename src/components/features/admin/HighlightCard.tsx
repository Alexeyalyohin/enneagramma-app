import Link from 'next/link'
import { formatPercent } from '@/lib/format'

interface HighlightCardProps {
  count: number
  crFromPrev?: number
}

/**
 * Узкое горлышко «сайт → подписчик» (Чертёж.md, US-007: «главная метрика»).
 * Ведёт на `/admin/leads?stage=captured` — прямое соответствие `lead_captured`.
 */
export function HighlightCard({ count, crFromPrev }: HighlightCardProps) {
  return (
    <Link
      href="/admin/leads?stage=captured"
      className="flex flex-col gap-1 rounded-xl border border-primary/40 bg-primary/5 p-5 transition-colors hover:bg-primary/10"
    >
      <p className="text-xs font-medium text-primary">Узкое горлышко: сайт → подписчик</p>
      <p className="text-2xl font-medium text-foreground">{count}</p>
      <p className="text-xs text-muted-foreground">
        {typeof crFromPrev === 'number'
          ? `Конверсия из завершивших тест: ${formatPercent(crFromPrev)}`
          : 'Пока недостаточно данных'}
      </p>
    </Link>
  )
}
