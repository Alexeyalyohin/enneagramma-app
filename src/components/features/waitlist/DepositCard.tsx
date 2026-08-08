'use client'

/**
 * Опциональный депозит после успешной заявки (Чертёж.md, US-006 шаг 3;
 * edge case 3: `503 PROVIDER_UNAVAILABLE` → «Платёжная система недоступна»,
 * кнопка retry, заявка не теряется).
 */

import { useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/fetch-api'
import { formatKopecksToRub } from '@/lib/format'
import type { DepositStatus } from '@/types/domain'

interface DepositResponse {
  payment_id: string
  confirmation_url: string
  amount_kopecks: number
}

interface DepositCardProps {
  waitlistId: string
  initialStatus: DepositStatus
}

export function DepositCard({ waitlistId, initialStatus }: DepositCardProps) {
  const [status, setStatus] = useState<DepositStatus>(initialStatus)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDeposit() {
    setSubmitting(true)
    setError(null)

    const result = await apiPost<DepositResponse>('/api/waitlist/deposit', { waitlist_id: waitlistId })

    if (!result.ok) {
      setSubmitting(false)
      if (result.error.code === 'DEPOSIT_ALREADY_PAID') {
        setStatus('paid')
        return
      }
      setError(result.error.message)
      return
    }

    window.location.href = result.data.confirmation_url
  }

  if (status === 'paid') {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
        Депозит оплачен — место в листе ожидания зафиксировано.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          Можно зафиксировать место депозитом ({formatKopecksToRub(500_000)})
        </p>
        <p className="text-xs text-muted-foreground">Необязательно — можно просто остаться в списке.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Платёжная система недоступна</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="button" variant="outline" onClick={handleDeposit} disabled={submitting} className="w-full sm:w-auto">
        {submitting ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Готовим оплату...
          </>
        ) : (
          'Внести депозит'
        )}
      </Button>
    </div>
  )
}
