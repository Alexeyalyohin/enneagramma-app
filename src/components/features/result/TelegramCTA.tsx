'use client'

/**
 * Основное действие на экране результата — «Получить полный разбор в
 * Telegram» (Чертёж.md, US-002; БЛОК 4 «Экран: Результат»). Заменяет форму
 * с телефоном: телефоном разбор не доставить, а Telegram закрывает основную
 * аудиторию.
 *
 * Ссылка на бота больше не статическая: сначала запрашиваем подписанный
 * deep-link у `/api/leads/telegram-start` (несёт session_id), потом
 * переходим — так Salebot при первом `?start=` сможет опознать сессию и
 * создать лида с telegram_id (см. POST /api/leads/link-telegram).
 */

import { useState } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { apiPost } from '@/lib/fetch-api'

interface TelegramStartResponse {
  bot_deep_link: string
}

interface TelegramCTAProps {
  sessionId: string
}

export function TelegramCTA({ sessionId }: TelegramCTAProps) {
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const result = await apiPost<TelegramStartResponse>('/api/leads/telegram-start', {
      session_id: sessionId,
      consent_152fz: true,
    })
    setLoading(false)

    if (!result.ok) {
      toast.add({ title: 'Не удалось перейти в Telegram', description: result.error.message, type: 'error' })
      return
    }

    window.open(result.data.bot_deep_link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Получи полный разбор в Telegram</p>
        <p className="text-xs text-muted-foreground">
          Пришлём подробный портрет твоего типа и разборы — прямо в Telegram.
        </p>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="telegram-consent"
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
          disabled={loading}
        />
        <Label htmlFor="telegram-consent" className="text-xs leading-snug font-normal text-muted-foreground">
          Согласен(на) на обработку персональных данных в соответствии с 152-ФЗ
        </Label>
      </div>

      <Button onClick={handleClick} disabled={!consent || loading} className="w-full sm:w-auto">
        {loading ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Открываем...
          </>
        ) : (
          <>
            <Send aria-hidden="true" />
            Получить полный разбор в Telegram
          </>
        )}
      </Button>
    </div>
  )
}
