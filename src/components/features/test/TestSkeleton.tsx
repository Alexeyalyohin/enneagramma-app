import { Skeleton } from '@/components/ui/skeleton'

/** Loading-состояние экрана теста (Чертёж.md, БЛОК 4: скелет карточки + матрицы). */
export function TestSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
      <div className="mx-auto w-36 sm:w-44 lg:order-2 lg:mx-0 lg:w-56">
        <Skeleton className="aspect-square w-full rounded-xl" />
      </div>
      <div className="flex flex-1 flex-col gap-5 lg:order-1">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  )
}
