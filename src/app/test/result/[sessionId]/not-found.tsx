import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ResultNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-4 py-20 text-center">
      <p className="max-w-100 text-base text-foreground">
        Результат не найден. Возможно, ссылка неполная
      </p>
      <Button render={<Link href="/test" />} nativeButton={false}>
        Пройти тест
      </Button>
    </main>
  )
}
