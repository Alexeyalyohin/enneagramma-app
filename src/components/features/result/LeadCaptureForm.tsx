'use client'

/**
 * Захват лида на экране результата (Чертёж.md, US-002; БЛОК 4 «Экран:
 * Результат»). Без чекбокса согласия кнопка отправки НЕ активна (disabled,
 * не просто ошибка валидации при сабмите).
 */

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { apiPost } from '@/lib/fetch-api'
import { isValidRuPhone, normalizePhoneE164 } from '@/lib/phone'
import { PhoneInput } from '@/components/features/leads/PhoneInput'

const schema = z.object({
  phone: z
    .string()
    .min(1, 'Введите телефон')
    .refine((value) => isValidRuPhone(normalizePhoneE164(value)), {
      message: 'Телефон должен быть российским: +7 999 000-00-00',
    }),
  consent: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export interface LeadCaptureResult {
  lead_id: string
  merged: boolean
  telegram_deep_link: string
}

interface LeadCaptureFormProps {
  sessionId: string
  onCaptured: (result: LeadCaptureResult) => void
}

export function LeadCaptureForm({ sessionId, onCaptured }: LeadCaptureFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', consent: false },
  })

  // useWatch, а не form.watch(): совместим с React Compiler (watch() из
  // useForm() не мемоизируется безопасно и выключает компилятору для файла).
  const consentChecked = useWatch({ control, name: 'consent' })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    const result = await apiPost<LeadCaptureResult>('/api/leads/capture', {
      session_id: sessionId,
      phone: normalizePhoneE164(values.phone),
      consent_152fz: true,
      source: 'test',
    })
    setSubmitting(false)

    if (!result.ok) {
      // Форма остаётся заполненной (Чертёж.md, БЛОК 4: «Error: Toast, форма остаётся заполненной»).
      toast.add({
        title: 'Не удалось сохранить результат',
        description: result.error.message,
        type: 'error',
      })
      return
    }

    onCaptured(result.data)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-phone">Телефон</Label>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneInput
              id="lead-phone"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={submitting}
              ariaInvalid={Boolean(errors.phone)}
            />
          )}
        />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
      </div>

      <div className="flex items-start gap-2">
        <Controller
          control={control}
          name="consent"
          render={({ field }) => (
            <Checkbox
              id="lead-consent"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              disabled={submitting}
            />
          )}
        />
        <Label htmlFor="lead-consent" className="text-xs leading-snug font-normal text-muted-foreground">
          Согласен(на) на обработку персональных данных в соответствии с 152-ФЗ
        </Label>
      </div>

      <Button type="submit" disabled={!consentChecked || submitting} className="w-full sm:w-auto">
        {submitting ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Сохраняем...
          </>
        ) : (
          'Сохранить и получать разборы'
        )}
      </Button>
    </form>
  )
}
