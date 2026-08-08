import type { Metadata } from 'next'
import { TestScreen } from '@/components/features/test/TestScreen'

export const metadata: Metadata = {
  title: 'Пройди тест — Эннеаграмма.one',
  description: 'Адаптивный тест на 3×3: узнай свой тип личности за пару минут.',
}

export default function TestPage() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <TestScreen />
    </main>
  )
}
