import type { Metadata } from 'next'
import { ResultScreen } from '@/components/features/result/ResultScreen'

export const metadata: Metadata = {
  title: 'Твой результат — Эннеаграмма.one',
  description: 'Портрет твоего типа личности и что с ним делать дальше.',
}

interface ResultPageProps {
  params: Promise<{ sessionId: string }>
}

export default async function TestResultPage({ params }: ResultPageProps) {
  const { sessionId } = await params

  return (
    <main className="flex flex-1 flex-col bg-background">
      <ResultScreen sessionId={sessionId} />
    </main>
  )
}
