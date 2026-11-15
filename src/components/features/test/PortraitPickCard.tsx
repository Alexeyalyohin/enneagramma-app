'use client'

import { useId } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { PortraitCandidate } from '@/lib/test-engine'

interface PortraitPickCardProps {
  candidates: [PortraitCandidate, PortraitCandidate]
  onPick: (type: number) => void
  disabled?: boolean
}

/** Финальный шаг: выбор между двумя короткими описаниями от первого лица. */
export function PortraitPickCard({ candidates, onPick, disabled = false }: PortraitPickCardProps) {
  const descriptionId = useId()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-lg leading-snug font-medium text-foreground">Последний шаг</p>
        <p className="text-sm text-muted-foreground">
          Прочитай два описания и отметь то, в котором больше узнаёшь себя.
        </p>
      </div>

      {candidates.map((candidate, index) => (
        <Card
          key={candidate.type}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={`Выбрать описание ${index + 1}`}
          aria-describedby={`${descriptionId}-${index}-body ${descriptionId}-${index}-fear`}
          onClick={() => !disabled && onPick(candidate.type)}
          onKeyDown={(event) => {
            if (disabled) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onPick(candidate.type)
            }
          }}
          className={cn(
            'cursor-pointer p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:p-6',
            disabled && 'pointer-events-none opacity-60'
          )}
        >
          <p className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">
            Описание {index + 1}
          </p>
          <div
            id={`${descriptionId}-${index}-body`}
            className="flex flex-col gap-2.5 font-serif text-[15.5px] leading-relaxed text-foreground"
          >
            {candidate.body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          <p
            id={`${descriptionId}-${index}-fear`}
            className="mt-3 border-t border-border pt-3 text-[13.5px] text-muted-foreground"
          >
            Главный страх: <b className="font-semibold text-foreground">{candidate.fear}</b>
          </p>
          <p className="mt-3 text-[13px] font-semibold text-primary">Это про меня →</p>
        </Card>
      ))}
    </div>
  )
}
