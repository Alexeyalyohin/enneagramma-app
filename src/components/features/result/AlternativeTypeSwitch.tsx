'use client'

import { Button } from '@/components/ui/button'

interface AlternativeTypeSwitchProps {
  viewing: boolean
  primaryType: number
  alternativeType: number
  onToggle: () => void
}

/**
 * Переключатель на второй вариант (раннер-ап) — показывается только когда
 * выбор алгоритма был близким (тай-брейк или низкая уверенность, см.
 * `TestResultData.alternative` в `/api/test/result/[sessionId]`). Ничего не
 * пересчитывает и не трогает сессию — просто переключает, какой из уже
 * посчитанных портретов показан на экране.
 */
export function AlternativeTypeSwitch({
  viewing,
  primaryType,
  alternativeType,
  onToggle,
}: AlternativeTypeSwitchProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      {!viewing && (
        <p className="text-xs text-muted-foreground">
          Выбор теста был близким — тип {alternativeType} тоже был реальным кандидатом.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={onToggle}
        className="w-full justify-center whitespace-normal sm:w-auto"
      >
        {viewing ? `← Вернуться к Типу ${primaryType}` : `Не откликается? Смотрю Тип ${alternativeType} →`}
      </Button>
    </div>
  )
}
