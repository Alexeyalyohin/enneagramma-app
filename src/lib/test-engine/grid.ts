/**
 * Сетка 3×3 и канонические свойства типов (Чертёж.md, БЛОК 5).
 *
 *                | Позитивный | Компетентность | Реактивность
 *   Ассертивные  |     7      |       3        |      8
 *   Долженствующие|     2      |       1        |      6
 *   Отстранённые |     9      |       5        |      4
 *
 * Центры: gut — 8/9/1, heart — 2/3/4, head — 5/6/7.
 * Это чистые данные + чистые функции: ни БД, ни рандома, ни времени.
 */

import type { Center, EnneagramType, HarmonicTriad, SocialTriad } from './types'
import { ENNEAGRAM_TYPES } from './types'

/** Канонический порядок значений осей — он же порядок разрешения ничьих. */
export const SOCIAL_ORDER: readonly SocialTriad[] = ['assertive', 'compliant', 'withdrawn']
export const HARMONIC_ORDER: readonly HarmonicTriad[] = ['positive', 'competency', 'reactive']
export const CENTER_ORDER: readonly Center[] = ['gut', 'heart', 'head']

export const TYPE_GRID: Record<SocialTriad, Record<HarmonicTriad, EnneagramType>> = {
  assertive: { positive: 7, competency: 3, reactive: 8 },
  compliant: { positive: 2, competency: 1, reactive: 6 },
  withdrawn: { positive: 9, competency: 5, reactive: 4 },
}

export interface TypeMeta {
  type: EnneagramType
  title: string
  social: SocialTriad
  harmonic: HarmonicTriad
  center: Center
}

export const TYPE_META: Record<EnneagramType, TypeMeta> = {
  1: { type: 1, title: 'Тип 1 — Реформатор', social: 'compliant', harmonic: 'competency', center: 'gut' },
  2: { type: 2, title: 'Тип 2 — Помощник', social: 'compliant', harmonic: 'positive', center: 'heart' },
  3: { type: 3, title: 'Тип 3 — Достигатор', social: 'assertive', harmonic: 'competency', center: 'heart' },
  4: { type: 4, title: 'Тип 4 — Индивидуалист', social: 'withdrawn', harmonic: 'reactive', center: 'heart' },
  5: { type: 5, title: 'Тип 5 — Исследователь', social: 'withdrawn', harmonic: 'competency', center: 'head' },
  6: { type: 6, title: 'Тип 6 — Скептик', social: 'compliant', harmonic: 'reactive', center: 'head' },
  7: { type: 7, title: 'Тип 7 — Энтузиаст', social: 'assertive', harmonic: 'positive', center: 'head' },
  8: { type: 8, title: 'Тип 8 — Лидер', social: 'assertive', harmonic: 'reactive', center: 'gut' },
  9: { type: 9, title: 'Тип 9 — Миротворец', social: 'withdrawn', harmonic: 'positive', center: 'gut' },
}

/** Ячейка сетки → тип. */
export function typeFromCell(social: SocialTriad, harmonic: HarmonicTriad): EnneagramType {
  return TYPE_GRID[social][harmonic]
}

export function isEnneagramType(value: number): value is EnneagramType {
  return (ENNEAGRAM_TYPES as readonly number[]).includes(value)
}

/** Соседи по кругу Эннеаграммы: `type-1` и `type+1` с замыканием 9 ↔ 1. */
export function neighborsOf(type: EnneagramType): [EnneagramType, EnneagramType] {
  const left = type === 1 ? 9 : ((type - 1) as EnneagramType)
  const right = type === 9 ? 1 : ((type + 1) as EnneagramType)
  return [left, right]
}

/** Нормализованный ключ спорной пары: всегда «меньший_больший». */
export function pairKey(a: EnneagramType, b: EnneagramType): `${number}_${number}` {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

/** Второй тип пары. */
export function otherInPair(pair: `${number}_${number}`, type: EnneagramType): EnneagramType {
  const [a, b] = pair.split('_').map(Number) as [EnneagramType, EnneagramType]
  return a === type ? b : a
}
