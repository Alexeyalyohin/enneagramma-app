import type { Metadata } from 'next'
import { AdminSidebar } from '@/components/layouts/AdminSidebar'

export const metadata: Metadata = {
  title: 'Админка — Эннеаграмма.one',
}

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background lg:flex-row">
      <AdminSidebar />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  )
}
