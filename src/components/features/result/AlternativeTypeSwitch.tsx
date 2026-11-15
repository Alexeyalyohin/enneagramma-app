'use client'

import { Button } from '@/components/ui/button'

interface AlternativeTypeSwitchProps {
  viewing: boolean
  primaryType: number
  alternativeType: number
  portraitDisagrees: boolean
  onToggle: () => void
}

/** Переключает описания двух типов в сохранённом результате. */
export function AlternativeTypeSwitch({
  viewing,
  primaryType,
  alternativeType,
  portraitDisagrees,
  onToggle,
}: AlternativeTypeSwitchProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      {portraitDisagrees && (
        <p className="text-sm text-muted-foreground">
          По ответам ближе тип {primaryType}. В конце теста ты выбрал(а) описание типа {alternativeType}.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={onToggle}
        className="w-full justify-center whitespace-normal sm:w-auto"
      >
        {viewing ? `Вернуться к типу ${primaryType}` : `Посмотреть описание типа ${alternativeType}`}
      </Button>
    </div>
  )
}
