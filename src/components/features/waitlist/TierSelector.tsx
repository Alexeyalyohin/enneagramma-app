'use client'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { WaitlistTier } from '@/types/domain'

const TIERS: Array<{ value: WaitlistTier; label: string; hint: string }> = [
  { value: 'self', label: 'Самостоятельный', hint: 'Материалы в своём темпе, без обратной связи.' },
  { value: 'guided', label: 'С сопровождением', hint: 'Материалы плюс разборы и обратная связь куратора.' },
  {
    value: 'practitioner',
    label: 'Практик + сертификат',
    hint: 'Полная программа для тех, кто хочет вести Эннеаграмму профессионально.',
  },
]

interface TierSelectorProps {
  value: WaitlistTier
  onChange: (value: WaitlistTier) => void
  disabled?: boolean
}

/** Выбор тарифа листа ожидания (Чертёж.md, БЛОК 4 «Экран: Лист ожидания»). */
export function TierSelector({ value, onChange, disabled }: TierSelectorProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as WaitlistTier)}
      disabled={disabled}
      className="gap-3"
    >
      {TIERS.map((tier) => (
        <Label
          key={tier.value}
          htmlFor={`tier-${tier.value}`}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3.5 has-[[data-checked]]:border-primary"
        >
          <RadioGroupItem value={tier.value} id={`tier-${tier.value}`} className="mt-0.5" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{tier.label}</span>
            <span className="text-xs text-muted-foreground">{tier.hint}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  )
}
