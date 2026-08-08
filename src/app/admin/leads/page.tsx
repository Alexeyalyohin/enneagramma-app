import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadsScreen } from '@/components/features/admin/LeadsScreen'

export const metadata: Metadata = {
  title: 'Лиды — Эннеаграмма.one',
}

export default function AdminLeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 sm:p-6 lg:p-8">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <LeadsScreen />
    </Suspense>
  )
}
