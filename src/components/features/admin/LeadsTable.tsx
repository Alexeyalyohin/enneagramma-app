import { formatDateMsk } from '@/lib/format'
import type { AdminLeadRow } from '@/lib/admin/types'

interface LeadsTableProps {
  leads: AdminLeadRow[]
}

/** Таблица лидов (Чертёж.md, БЛОК 4 «Экран: Список лидов»; edge case 14). */
export function LeadsTable({ leads }: LeadsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Контакт</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Telegram</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Тип</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Источник</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Дата</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {leads.map((lead) => (
            <tr key={lead.id} className="text-foreground">
              <td className="px-4 py-2.5">
                <div className="flex flex-col">
                  <span>{lead.full_name || lead.phone || lead.email || '—'}</span>
                  {lead.phone && <span className="text-xs text-muted-foreground">{lead.phone}</span>}
                </div>
              </td>
              <td className="px-4 py-2.5">
                {lead.subscribed_telegram ? (
                  <span className="text-primary">
                    {lead.telegram_username ? `@${lead.telegram_username}` : 'подписан'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {lead.enneagram_type ? `${lead.enneagram_type}${lead.wing ? `w${lead.wing}` : ''}` : '—'}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{lead.source}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{formatDateMsk(lead.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
