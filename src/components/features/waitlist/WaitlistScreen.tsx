'use client'

import { useState } from 'react'
import { DepositCard } from './DepositCard'
import { WaitlistForm, type WaitlistSubmitResult } from './WaitlistForm'

/** Оркестратор `/waitlist` (Чертёж.md, БЛОК 4 «Экран: Лист ожидания»). */
export function WaitlistScreen() {
  const [submitted, setSubmitted] = useState<WaitlistSubmitResult | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-10 sm:py-14">
      <div>
        <h1 className="text-2xl font-medium text-foreground sm:text-3xl">Лист ожидания сертификации</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Зафиксируй интерес и раннюю цену до старта продаж флагманской программы.
        </p>
      </div>

      {submitted ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            {submitted.updated ? 'Тариф обновлён — вы в списке.' : 'Вы в списке ожидания.'}
          </div>
          <DepositCard waitlistId={submitted.waitlist_id} initialStatus={submitted.deposit_status} />
        </div>
      ) : (
        <WaitlistForm onSubmitted={setSubmitted} />
      )}
    </div>
  )
}
