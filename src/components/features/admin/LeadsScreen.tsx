'use client'

/** Оркестратор `/admin/leads` (Чертёж.md, БЛОК 4 «Экран: Список лидов»). */

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { apiFetchPaginated, type PaginationMeta } from '@/lib/fetch-api'
import { LEAD_STAGES, type AdminLeadRow, type LeadStage } from '@/lib/admin/types'
import { LeadsFilters } from './LeadsFilters'
import { LeadsPagination } from './LeadsPagination'
import { LeadsTable } from './LeadsTable'

const PER_PAGE = 20

function parseStage(raw: string | null): LeadStage {
  return raw && (LEAD_STAGES as readonly string[]).includes(raw) ? (raw as LeadStage) : 'captured'
}

function parsePage(raw: string | null): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : 1
}

export function LeadsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const stage = parseStage(searchParams.get('stage'))
  const page = parsePage(searchParams.get('page'))
  const query = searchParams.get('q') ?? ''

  const [leads, setLeads] = useState<AdminLeadRow[] | null>(null)
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)

  // `load` — `async` по той же причине, что в DashboardScreen/useTestSession:
  // синхронный `setLoading(true)` до `await` не триггерит set-state-in-effect.
  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ stage, page: String(page), per_page: String(PER_PAGE) })
    if (query) params.set('q', query)

    const result = await apiFetchPaginated<AdminLeadRow>(`/api/admin/leads?${params.toString()}`)
    setLoading(false)
    if (!result.ok) {
      toast.add({ title: 'Не удалось загрузить лидов', description: result.error.message, type: 'error' })
      return
    }
    setLeads(result.data)
    setMeta(result.meta)
  }, [stage, page, query])

  useEffect(() => {
    // Локальная async-обёртка — см. пояснение в DashboardScreen.
    async function run() {
      await load()
    }
    void run()
  }, [load])

  const updateParams = useCallback(
    (next: { stage?: LeadStage; q?: string; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next.stage !== undefined) {
        params.set('stage', next.stage)
        params.set('page', '1')
      }
      if (next.q !== undefined) {
        if (next.q) params.set('q', next.q)
        else params.delete('q')
        params.set('page', '1')
      }
      if (next.page !== undefined) params.set('page', String(next.page))
      router.push(`/admin/leads?${params.toString()}`)
    },
    [router, searchParams]
  )

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl font-medium text-foreground">Лиды</h1>

      <LeadsFilters
        stage={stage}
        query={query}
        onStageChange={(next) => updateParams({ stage: next })}
        onQueryChange={(next) => updateParams({ q: next })}
      />

      {loading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {!loading && leads && leads.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-foreground">Лидов не найдено</p>
          <p className="text-xs text-muted-foreground">Измените фильтр или поисковый запрос.</p>
        </div>
      )}

      {!loading && leads && leads.length > 0 && meta && (
        <>
          <LeadsTable leads={leads} />
          <LeadsPagination
            page={meta.page}
            perPage={meta.per_page}
            total={meta.total}
            onPageChange={(next) => updateParams({ page: next })}
          />
        </>
      )}
    </div>
  )
}
