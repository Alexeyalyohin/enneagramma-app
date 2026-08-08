import Link from 'next/link'
import { formatPercent } from '@/lib/format'
import type { EventType } from '@/types/domain'
import type { FunnelStep } from '@/lib/admin/types'

const STEP_LABELS: Partial<Record<EventType, string>> = {
  test_started: 'Начали тест',
  test_completed: 'Завершили тест',
  lead_captured: 'Оставили контакт',
  telegram_cta_clicked: 'Перешли в Telegram',
  club_paid: 'Оплатили клуб',
  waitlist_deposit_paid: 'Внесли депозит',
}

/**
 * Шаги, у которых есть прямое соответствие фильтру `stage` в `/admin/leads`
 * (Чертёж.md, GROUP «Админ»). У остальных шагов ссылки нет — намеренно.
 */
const STAGE_BY_EVENT: Partial<Record<EventType, string>> = {
  lead_captured: 'captured',
  club_paid: 'club',
  waitlist_deposit_paid: 'waitlist',
}

interface FunnelChartProps {
  steps: FunnelStep[]
}

/** Столбцы конверсии по шагам воронки (Чертёж.md, БЛОК 4: `FunnelChart`). */
export function FunnelChart({ steps }: FunnelChartProps) {
  const max = Math.max(1, ...steps.map((step) => step.count))

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-foreground">Воронка</h2>
      <ul className="flex flex-col gap-3">
        {steps.map((step) => {
          const width = Math.max(4, Math.round((step.count / max) * 100))
          const label = STEP_LABELS[step.key] ?? step.key
          const stage = STAGE_BY_EVENT[step.key]

          const row = (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <span>
                  {step.count}
                  {typeof step.cr_from_prev === 'number' ? ` · ${formatPercent(step.cr_from_prev)}` : ''}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          )

          return (
            <li key={step.key}>
              {stage ? (
                <Link
                  href={`/admin/leads?stage=${stage}`}
                  className="-m-1 block rounded-lg p-1 transition-colors hover:bg-muted/60"
                >
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
