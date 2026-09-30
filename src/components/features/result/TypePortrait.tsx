import { renderSimpleMarkdown } from '@/lib/simple-markdown'

interface TypePortraitProps {
  portraitMd: string | null
}

/**
 * Текст портрета типа от первого лица, сериф (Чертёж.md, БЛОК 4 «Экран:
 * Результат»). Заголовок и краткая сводка вынесены в `TypePortraitHeader` —
 * рендерятся раньше, до CTA-блока.
 */
export function TypePortrait({ portraitMd }: TypePortraitProps) {
  return (
    <article className="flex flex-col gap-4">
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
