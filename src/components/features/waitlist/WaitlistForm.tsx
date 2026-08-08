'use client'

/** Основная форма листа ожидания (Чертёж.md, US-006; БЛОК 4 «Экран: Лист ожидания»). */

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiPost } from '@/lib/fetch-api'
import { isValidRuPhone, normalizePhoneE164 } from '@/lib/phone'
import { PhoneInput } from '@/components/features/leads/PhoneInput'
import { WAITLIST_TIERS, type WaitlistTier, type DepositStatus } from '@/types/domain'
import { TierSelector } from './TierSelector'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const schema = z.object({
  phone: z
    .string()
    .min(1, 'Введите телефон')
    .refine((value) => isValidRuPhone(normalizePhoneE164(value)), {
      message: 'Телефон должен быть российским: +7 999 000-00-00',
    }),
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || EMAIL_REGEX.test(value), { message: 'Некорректный email' }),
  fullName: z.string().trim().max(120),
  tier: z.enum(WAITLIST_TIERS),
  consent: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export interface WaitlistSubmitResult {
  waitlist_id: string
  lead_id: string
  tier_interest: WaitlistTier
  deposit_status: DepositStatus
  updated: boolean
}

interface WaitlistFormProps {
  onSubmitted: (result: WaitlistSubmitResult) => void
}

export function WaitlistForm({ onSubmitted }: WaitlistFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', email: '', fullName: '', tier: 'self', consent: false },
  })

  // useWatch, а не form.watch() — совместимо с React Compiler (см. LeadCaptureForm).
  const consentChecked = useWatch({ control, name: 'consent' })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setFormError(null)

    const result = await apiPost<WaitlistSubmitResult>('/api/waitlist', {
      phone: normalizePhoneE164(values.phone),
      email: values.email || undefined,
      full_name: values.fullName || undefined,
      tier_interest: values.tier,
      consent_152fz: true,
    })

    setSubmitting(false)

    if (!result.ok) {
      setFormError(result.error.message)
      return
    }

    onSubmitted(result.data)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Какой тариф интересен</Label>
        <Controller
          control={control}
          name="tier"
          render={({ field }) => (
            <TierSelector value={field.value} onChange={field.onChange} disabled={submitting} />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="waitlist-phone">Телефон</Label>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneInput
              id="waitlist-phone"
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="waitlist-email">Email (необязательно)</Label>
        <Input id="waitlist-email" type="email" disabled={submitting} {...register('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="waitlist-name">Имя (необязательно)</Label>
        <Input id="waitlist-name" type="text" disabled={submitting} {...register('fullName')} />
      </div>

      <div className="flex items-start gap-2">
        <Controller
          control={control}
          name="consent"
          render={({ field }) => (
            <Checkbox
              id="waitlist-consent"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              disabled={submitting}
            />
          )}
        />
        <Label htmlFor="waitlist-consent" className="text-xs leading-snug font-normal text-muted-foreground">
          Согласен(на) на обработку персональных данных в соответствии с 152-ФЗ
        </Label>
      </div>

      {formError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось отправить заявку</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={!consentChecked || submitting} className="w-full sm:w-auto">
        {submitting ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Отправляем...
          </>
        ) : (
          'Встать в лист ожидания'
        )}
      </Button>
    </form>
  )
}
