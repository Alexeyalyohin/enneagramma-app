'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AdminNav } from './AdminNav'

/**
 * Sidebar владельца (Чертёж.md, БЛОК 4 «Экран: Дашборд владельца»):
 * persistent aside на desktop, `Sheet`-drawer на mobile.
 */
export function AdminSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:hidden">
        <span className="text-sm font-medium text-foreground">Эннеаграмма.one</span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Открыть меню" />}>
            <Menu aria-hidden="true" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <SheetTitle className="mb-4">Меню</SheetTitle>
            <AdminNav />
          </SheetContent>
        </Sheet>
      </header>

      <aside className="hidden w-60 shrink-0 border-r border-border p-4 lg:block">
        <p className="mb-6 px-3 text-sm font-medium text-foreground">Эннеаграмма.one</p>
        <AdminNav />
      </aside>
    </>
  )
}
