import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ResultScreen } from '@/components/features/result/ResultScreen'
import { readResultSession } from '@/lib/result/session'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Твой результат — Эннеаграмма.one',
  description: 'Портрет твоего типа личности и что с ним делать дальше.',
  robots: { index: false, follow: false },
}

interface ResultPageProps {
  params: Promise<{ sessionId: string }>
}

export default async function TestResultPage({ params }: ResultPageProps) {
  const { sessionId } = await params
  // При временной ошибке БД клиентский экран оставляет возможность повторить запрос.
  const session = await readResultSession(sessionId).catch(() => undefined)
  if (session === null) notFound()

  return (
    <main className="flex flex-1 flex-col bg-background">
      <ResultScreen sessionId={sessionId} />
    </main>
  )
}
