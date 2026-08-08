'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, LogOut, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/auth/login/actions'

const LINKS = [
  { href: '/admin', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/admin/leads', label: 'Лиды', icon: Users },
] as const

/** Общий список навигации — используется и в мобильном Sheet, и в desktop-сайдбаре. */
export function AdminNav() {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col justify-between">
      <nav className="flex flex-col gap-1" aria-label="Разделы админки">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>

      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Выйти
        </button>
      </form>
    </div>
  )
}
