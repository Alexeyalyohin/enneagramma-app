import type { WingMeta } from '@/lib/result/types'

interface WingHintProps {
  wing: number
  wings: { left: WingMeta; right: WingMeta } | null
}

/** Подсказка про крыло (Чертёж.md, БЛОК 4: `WingHint`). */
export function WingHint({ wing, wings }: WingHintProps) {
  const match = wings ? [wings.left, wings.right].find((candidate) => candidate.type === wing) : null

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-foreground">
        С крылом <span className="font-medium text-primary">{wing}</span>
        {match ? ` — ${match.title}` : ''}
      </p>
      {match?.hint && <p className="mt-1 text-sm text-muted-foreground">{match.hint}</p>}
    </div>
  )
}
