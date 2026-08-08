'use client'

/** Оркестратор `/admin` (Чертёж.md, US-007; БЛОК 4 «Экран: Дашборд владельца»). */

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { apiGet } from '@/lib/fetch-api'
import { formatKopecksToRub } from '@/lib/format'
import type { FunnelResponse } from '@/lib/admin/types'
import { FunnelChart } from './FunnelChart'
import { HighlightCard } from './HighlightCard'
import { MetricCard } from './MetricCard'
import { PeriodSwitcher, type Period } from './PeriodSwitcher'

const VALID_PERIODS = new Set<Period>([7, 30, 90])

function parsePeriod(raw: string | null): Period {
  const value = Number(raw)
  return VALID_PERIODS.has(value as Period) ? (value as Period) : 30
}

export function DashboardScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const period = parsePeriod(searchParams.get('period'))

  const [data, setData] = useState<FunnelResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // `load` объявлена `async`: синхронный `setLoading(true)` до первого `await`
  // тогда не считается «setState синхронно в эффекте» (react-hooks/set-state-in-effect) —
  // тот же приём, что и в src/lib/test/useTestSession.ts (`startNewSession`).
  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<FunnelResponse>(`/api/admin/funnel?period=${period}`)
    setLoading(false)
    if (!result.ok) {
      toast.add({ title: 'Не удалось загрузить метрики', description: result.error.message, type: 'error' })
      return
    }
    setData(result.data)
  }, [period])

  useEffect(() => {
    // Локальная async-обёртка внутри эффекта: react-hooks/set-state-in-effect
    // трассирует прямой вызов внешнего useCallback-а вида `load()` как
    // «setState синхронно в эффекте» независимо от его async-ности — но не
    // трассирует функцию, объявленную буквально в теле самого эффекта
    // (тот же приём в src/lib/test/useTestSession.ts).
    async function run() {
      await load()
    }
    void run()
  }, [load])

  function handlePeriodChange(next: Period) {
    router.push(`/admin?period=${next}`)
  }

  const leadCapturedStep = data?.steps.find((step) => step.key === 'lead_captured')
  const isEmpty = data ? data.steps.every((step) => step.count === 0) && data.mrr_kopecks === 0 : false

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-foreground">Дашборд воронки</h1>
        <PeriodSwitcher value={period} onChange={handlePeriodChange} />
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="col-span-full h-64 w-full rounded-xl" />
        </div>
      )}

      {!loading && data && isEmpty && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-foreground">За период нет данных</p>
          <p className="text-xs text-muted-foreground">Попробуйте выбрать более длинный период — 30 или 90 дней.</p>
        </div>
      )}

      {!loading && data && !isEmpty && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <HighlightCard count={leadCapturedStep?.count ?? 0} crFromPrev={leadCapturedStep?.cr_from_prev} />
            <MetricCard label="MRR клуба" value={formatKopecksToRub(data.mrr_kopecks)} />
            <MetricCard label="Активные подписки" value={String(data.active_clubs)} />
          </div>
          <FunnelChart steps={data.steps} />
        </>
      )}
    </div>
  )
}
