import { renderSimpleMarkdown } from '@/lib/simple-markdown'

interface TypePortraitProps {
  title: string
  portraitMd: string | null
  shortSummary: string | null
}

/** Портрет типа от первого лица, сериф (Чертёж.md, БЛОК 4 «Экран: Результат»). */
export function TypePortrait({ title, portraitMd, shortSummary }: TypePortraitProps) {
  return (
    <article className="flex flex-col gap-4">
      <h1 className="font-serif text-3xl leading-tight text-balance text-foreground sm:text-4xl">
        {title}
      </h1>
      {shortSummary && <p className="text-base text-muted-foreground">{shortSummary}</p>}
      {portraitMd ? (
        <div className="flex flex-col gap-4 font-serif text-lg leading-relaxed text-foreground/90">
          {renderSimpleMarkdown(portraitMd)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Полный портрет этого типа скоро появится здесь — а тип уже точно посчитан.
        </p>
      )}
    </article>
  )
}
