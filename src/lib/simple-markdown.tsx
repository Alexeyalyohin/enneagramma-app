/**
 * Безопасный мини-рендер Markdown для `portrait_md` (Чертёж.md, БЛОК 5
 * «Безопасность»: «рендерятся через безопасный Markdown-рендер без сырого
 * HTML»). Контент редакционный (владелец пишет портреты типов), но рендерим
 * без `dangerouslySetInnerHTML` и без парсера сырого HTML — по построчным
 * React-элементам, поддержка только абзацев и `**bold**`, как и обещано
 * в задании фронтенду.
 */

import { Fragment, type ReactNode } from 'react'

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part.length > 0)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>
  })
}

/** Разбивает текст на абзацы по пустой строке, внутри — только `**bold**`. */
export function renderSimpleMarkdown(source: string): ReactNode[] {
  const paragraphs = source
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  return paragraphs.map((paragraph, index) => (
    <p key={index}>{renderInline(paragraph, `p${index}`)}</p>
  ))
}
