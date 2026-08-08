'use client'

/**
 * CTA «Открыть Telegram-канал» после захвата лида (Чертёж.md, US-002 шаг 5/6).
 * Клик шлёт `telegram_cta_clicked` fire-and-forget ДО перехода по ссылке —
 * не ждём ответа и не блокируем переход (см. src/app/api/leads/telegram-cta-clicked).
 */

import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/fetch-api'

interface TelegramCTAProps {
  leadId: string
  sessionId: string
  deepLink: string
}

export function TelegramCTA({ leadId, sessionId, deepLink }: TelegramCTAProps) {
  function handleClick() {
    void apiPost('/api/leads/telegram-cta-clicked', { lead_id: leadId, session_id: sessionId })
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm text-foreground">Результат сохранён. Разборы приходят в Telegram.</p>
      <Button
        render={<a href={deepLink} target="_blank" rel="noopener noreferrer" onClick={handleClick} />}
        className="w-full sm:w-auto"
      >
        <Send aria-hidden="true" />
        Открыть Telegram-канал
      </Button>
    </div>
  )
}
