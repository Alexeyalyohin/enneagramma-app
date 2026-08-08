import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardScreen } from '@/components/features/admin/DashboardScreen'

export const metadata: Metadata = {
  title: 'Дашборд — Эннеаграмма.one',
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 sm:p-6 lg:p-8">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <DashboardScreen />
    </Suspense>
  )
}
