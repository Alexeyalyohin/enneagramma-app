'use client'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { PortraitCandidate } from '@/lib/test-engine'

interface PortraitPickCardProps {
  candidates: [PortraitCandidate, PortraitCandidate]
  onPick: (type: number) => void
  disabled?: boolean
}

/**
 * Финальный шаг из эталона v1.0: два коротких портрета от первого лица,
 * пользователь выбирает тот, что «ёкнул» — выбор может переопределить
 * алгоритмического победителя (см. TestResult.switched).
 */
export function PortraitPickCard({ candidates, onPick, disabled = false }: PortraitPickCardProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-lg leading-snug font-medium text-foreground">Последний шаг</p>
        <p className="text-sm text-muted-foreground">
          Ниже два текста от первого лица. Не разбирай их логически — просто отметь тот, от которого
          что-то ёкнуло.
        </p>
      </div>

      {candidates.map((candidate) => (
        <Card
          key={candidate.type}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onClick={() => !disabled && onPick(candidate.type)}
          onKeyDown={(event) => {
            if (disabled) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onPick(candidate.type)
            }
          }}
          className={cn(
            'cursor-pointer p-5 transition-colors hover:border-primary sm:p-6',
            disabled && 'pointer-events-none opacity-60'
          )}
        >
          <p className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">
            Тип {candidate.type} · {candidate.name}
          </p>
          <div className="flex flex-col gap-2.5 font-serif text-[15.5px] leading-relaxed text-foreground">
            {candidate.body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-3 border-t border-border pt-3 text-[13.5px] text-muted-foreground">
            Главный страх: <b className="font-semibold text-foreground">{candidate.fear}</b>
          </p>
          <p className="mt-3 text-[13px] font-semibold text-primary">Это про меня →</p>
        </Card>
      ))}
    </div>
  )
}
