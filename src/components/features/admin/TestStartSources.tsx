import type { TestStartSource } from '@/lib/admin/types'

interface TestStartSourcesProps {
  sources: TestStartSource[]
}

export function TestStartSources({ sources }: TestStartSourcesProps) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-medium text-foreground">Старты теста по UTM-источникам</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          «Без метки» включает старты без utm_source и старты до начала сбора меток.
        </p>
      </div>
      <dl className="divide-y divide-border">
        {sources.map(({ source, count }) => (
          <div key={source ?? 'untagged:'} className="flex items-center justify-between gap-4 py-2 text-sm">
            <dt className="min-w-0 wrap-anywhere text-muted-foreground">{source ?? 'Без метки'}</dt>
            <dd className="shrink-0 text-foreground tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
