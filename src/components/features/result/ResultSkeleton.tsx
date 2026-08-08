import { Skeleton } from '@/components/ui/skeleton'

/** Loading-состояние результата: скелет портрета (3 абзаца) + бейджи. */
export function ResultSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6 px-4 py-10 sm:py-14">
      <Skeleton className="h-10 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-6 w-40 rounded-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}
