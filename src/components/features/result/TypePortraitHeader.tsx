interface TypePortraitHeaderProps {
  title: string
  shortSummary: string | null
}

/**
 * Имя типа + короткая сводка — рендерится отдельно от длинного текста
 * портрета (`TypePortrait`), чтобы человек видел, какой у него тип, ещё до
 * CTA-блока `TelegramCTA`, который теперь стоит выше по странице.
 */
export function TypePortraitHeader({ title, shortSummary }: TypePortraitHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-serif text-3xl leading-tight text-balance text-foreground sm:text-4xl">
        {title}
      </h1>
      {shortSummary && <p className="text-base text-muted-foreground">{shortSummary}</p>}
    </div>
  )
}
