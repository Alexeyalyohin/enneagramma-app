'use client'

import { forwardRef } from 'react'
import { Input } from '@/components/ui/input'

/** `89990001122` / `+7 999...` → `+7 (999) 000-11-22` для показа в поле. */
function formatRuPhoneDisplay(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits.length > 0 && !digits.startsWith('7')) digits = `7${digits}`
  digits = digits.slice(0, 11)
  if (digits.length === 0) return ''

  const rest = digits.slice(1)
  let out = '+7'
  if (rest.length > 0) out += ` (${rest.slice(0, 3)}`
  if (rest.length >= 3) out += ')'
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`
  return out
}

interface PhoneInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  ariaInvalid?: boolean
  autoFocus?: boolean
}

/** Маскированное поле телефона `+7 (___) ___-__-__` (Чертёж.md, БЛОК 4). */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { id, value, onChange, onBlur, disabled, ariaInvalid, autoFocus },
  ref
) {
  return (
    <Input
      id={id}
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      autoFocus={autoFocus}
      placeholder="+7 (___) ___-__-__"
      value={value}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      onBlur={onBlur}
      onChange={(event) => onChange(formatRuPhoneDisplay(event.target.value))}
    />
  )
})
