'use client'

import { cn } from '@/lib/utils'

const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

interface PeriodSwitcherProps {
  value: Period
  onChange: (period: Period) => void
}

export function PeriodSwitcher({ value, onChange }: PeriodSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Период"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      {PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          aria-pressed={value === period}
          onClick={() => onChange(period)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            value === period
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {period} дн.
        </button>
      ))}
    </div>
  )
}
