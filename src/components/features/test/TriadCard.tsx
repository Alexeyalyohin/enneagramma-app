'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { QuestionOption } from '@/lib/test-engine'

interface TriadCardProps {
  prompt: string
  options: QuestionOption[]
  onSelect: (value: string) => void
  disabled?: boolean
}

/** Карточка форсированного выбора: триада или tiebreak-пара (2–3 варианта). */
export function TriadCard({ prompt, options, onSelect, disabled = false }: TriadCardProps) {
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-balance text-lg leading-snug font-medium sm:text-xl">
          {prompt}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-0 pb-0">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            size="lg"
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className="h-auto min-h-11 w-full justify-start whitespace-normal px-4 py-3 text-left text-sm leading-snug"
          >
            {option.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
