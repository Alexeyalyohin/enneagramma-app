interface MetricCardProps {
  label: string
  value: string
  hint?: string
}

/** Простая карточка метрики (MRR, активные клубы — Чертёж.md, БЛОК 4). */
export function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
