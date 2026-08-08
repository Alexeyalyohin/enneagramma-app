'use client'

import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BackButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function BackButton({ onClick, disabled = false }: BackButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      aria-label="Вернуться к предыдущему вопросу"
      className="gap-1.5 text-muted-foreground"
    >
      <ArrowLeft aria-hidden="true" />
      Назад
    </Button>
  )
}
