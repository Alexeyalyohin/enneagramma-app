import type { WingMeta } from '@/lib/result/types'

interface WingHintProps {
  wing: number
  tied: boolean
  wings: { left: WingMeta; right: WingMeta } | null
}

/** Подсказка про крыло (Чертёж.md, БЛОК 4: `WingHint`). */
export function WingHint({ wing, wings, tied }: WingHintProps) {
  const match = wings ? [wings.left, wings.right].find((candidate) => candidate.type === wing) : null

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-foreground">
        {tied ? (
          'Оба соседних крыла набрали одинаковое число баллов.'
        ) : (
          <>
            С крылом <span className="font-medium text-primary">{wing}</span>
            {match ? ` — ${match.title}` : ''}
          </>
        )}
      </p>
      {!tied && match?.hint && <p className="mt-1 text-sm text-muted-foreground">{match.hint}</p>}
    </div>
  )
}
