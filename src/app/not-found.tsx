import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Страница не найдена — Эннеаграмма.one',
}

/**
 * Глобальный 404 (Чертёж-интерфейса-Эннеаграмма.md, «Экран: 404»).
 * Статическая заглушка без данных — Loading/Empty неприменимы, это и есть
 * состояние ошибки маршрута.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-20 text-center">
      <span className="text-xs font-semibold tracking-wide text-primary uppercase">
        Эннеаграмма · страница не найдена
      </span>
      <p className="mt-6 font-serif text-8xl leading-none text-primary sm:text-9xl">0</p>
      <p className="mt-6 max-w-100 text-base text-muted-foreground">
        Такого типа не бывает — а такой страницы тем более. Проверь адрес или иди дальше отсюда.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button render={<a href="https://enneagramma.one" />} nativeButton={false} className="w-full sm:w-auto">
          На главную
        </Button>
        <Button
          render={<Link href="/test" />}
          nativeButton={false}
          variant="outline"
          className="w-full sm:w-auto"
        >
          Пройти тест
        </Button>
      </div>
    </main>
  )
}
