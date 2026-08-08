import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/components/features/auth/LoginForm'

export const metadata: Metadata = {
  title: 'Вход — Эннеаграмма.one',
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm p-6">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-xl">Вход владельца</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  )
}
