'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { LEAD_STAGES, type LeadStage } from '@/lib/admin/types'

const STAGE_LABELS: Record<LeadStage, string> = {
  captured: 'Все лиды',
  typed: 'С типом',
  telegram: 'В Telegram',
  club: 'Клуб',
  waitlist: 'Лист ожидания',
}

interface LeadsFiltersProps {
  stage: LeadStage
  query: string
  onStageChange: (stage: LeadStage) => void
  onQueryChange: (query: string) => void
}

/** Фильтр по стадии + поиск с debounce (Чертёж.md, БЛОК 4 «Экран: Список лидов»). */
export function LeadsFilters({ stage, query, onStageChange, onQueryChange }: LeadsFiltersProps) {
  const [inputValue, setInputValue] = useState(query)
  const onQueryChangeRef = useRef(onQueryChange)
  const isFirstRun = useRef(true)

  useEffect(() => {
    onQueryChangeRef.current = onQueryChange
  }, [onQueryChange])

  // Синхронизация при внешнем изменении URL (напр. кнопка «Назад» браузера).
  // Не через эффект (react-hooks/set-state-in-effect) — «подгонка стейта под
  // изменившийся пропс» делается прямо во время рендера (паттерн из доков
  // React: https://react.dev/learn/you-might-not-need-an-effect).
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setInputValue(query)
  }

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    const timer = setTimeout(() => onQueryChangeRef.current(inputValue), 400)
    return () => clearTimeout(timer)
  }, [inputValue])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        role="tablist"
        aria-label="Стадия лида"
        className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1"
      >
        {LEAD_STAGES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={stage === item}
            onClick={() => onStageChange(item)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs transition-colors sm:text-sm',
              stage === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {STAGE_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="relative w-full sm:w-64">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Телефон, имя, ник, email"
          className="pl-8"
          aria-label="Поиск по лидам"
        />
      </div>
    </div>
  )
}
