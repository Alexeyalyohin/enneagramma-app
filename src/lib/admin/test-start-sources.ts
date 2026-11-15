import type { ServiceClient } from '@/lib/supabase/types'
import { cleanTestAttribution } from '@/lib/test/attribution'
import type { TestStartSource } from './types'

const PAGE_SIZE = 500

export async function getTestStartSources(
  client: ServiceClient,
  since: string,
  until: string
): Promise<TestStartSource[]> {
  const counts = new Map<string | null, number>()
  let lastId: string | undefined

  // Берём только utm_source из каждого события старта, без истории ответов.
  // Страницы запрашиваются по ID, чтобы пройти лимит выдачи PostgREST.
  for (;;) {
    let query = client
      .from('events')
      .select('id, source:metadata->>utm_source')
      .eq('event_type', 'test_started')
      .gte('created_at', since)
      .lt('created_at', until)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (lastId) query = query.gt('id', lastId)
    const { data, error } = await query
    if (error) throw error

    for (const row of data) {
      const source = cleanTestAttribution({ utm_source: row.source }).utm_source ?? null
      counts.set(source, (counts.get(source) ?? 0) + 1)
    }

    if (data.length < PAGE_SIZE) break
    lastId = data[data.length - 1].id
  }

  return [...counts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)
}
