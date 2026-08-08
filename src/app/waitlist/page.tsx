import type { Metadata } from 'next'
import { WaitlistScreen } from '@/components/features/waitlist/WaitlistScreen'

export const metadata: Metadata = {
  title: 'Лист ожидания — Эннеаграмма.one',
  description: 'Зафиксируй место и раннюю цену сертификационной программы.',
}

export default function WaitlistPage() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <WaitlistScreen />
    </main>
  )
}
