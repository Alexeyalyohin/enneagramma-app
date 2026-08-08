/**
 * Живая визуализация сетки 3×3 (Чертёж.md, БЛОК 4 «Экран: Тест», БЛОК 5
 * «Алгоритм определения типа»). Строки — социальная ось, столбцы —
 * гармоническая. Точных совместных баллов по ячейке API не отдаёт (только
 * маргинальные суммы по каждой оси), поэтому яркость ячейки — сумма
 * `social[row] + harmonic[col]`: чем чаще ответы ложатся в обе категории
 * этой ячейки, тем она теплее. Достаточно, чтобы матрица «оживала» после
 * каждого ответа, не выдавая цифр, которых у нас на самом деле нет.
 */

import { cn } from '@/lib/utils'
import type { MatrixSnapshot } from '@/lib/test-engine'

const SOCIAL_ROWS: Array<{ key: keyof MatrixSnapshot['social']; label: string }> = [
  { key: 'assertive', label: 'Ассертивные' },
  { key: 'compliant', label: 'Долженствующие' },
  { key: 'withdrawn', label: 'Отстранённые' },
]

const HARMONIC_COLS: Array<{ key: keyof MatrixSnapshot['harmonic']; label: string }> = [
  { key: 'positive', label: 'Позитивный настрой' },
  { key: 'competency', label: 'Компетентность' },
  { key: 'reactive', label: 'Реактивность' },
]

/** Каноническая раскладка типов по сетке (Чертёж.md, БЛОК 5). */
const TYPE_GRID: number[][] = [
  [7, 3, 8],
  [2, 1, 6],
  [9, 5, 4],
]

interface MatrixVizProps {
  matrix: MatrixSnapshot
  className?: string
}

export function MatrixViz({ matrix, className }: MatrixVizProps) {
  const size = 56
  const gap = 4
  const dimension = size * 3 + gap * 2

  const sums = SOCIAL_ROWS.flatMap((row) =>
    HARMONIC_COLS.map((col) => matrix.social[row.key] + matrix.harmonic[col.key])
  )
  const max = Math.max(1, ...sums)

  return (
    <svg
      viewBox={`0 0 ${dimension} ${dimension}`}
      role="img"
      aria-label="Живая карта совпадений теста по сетке 3 на 3"
      className={cn('block w-full', className)}
    >
      {SOCIAL_ROWS.map((row, r) =>
        HARMONIC_COLS.map((col, c) => {
          const value = matrix.social[row.key] + matrix.harmonic[col.key]
          const intensity = 0.1 + 0.7 * (value / max)
          const x = c * (size + gap)
          const y = r * (size + gap)
          return (
            <g key={`${row.key}-${col.key}`}>
              <rect
                x={x}
                y={y}
                width={size}
                height={size}
                rx={8}
                fill="var(--color-brass)"
                stroke="var(--color-brass)"
                strokeOpacity={0.35}
                style={{ fillOpacity: intensity, transition: 'fill-opacity 400ms ease' }}
              >
                <title>
                  {row.label} × {col.label}
                </title>
              </rect>
              <text
                x={x + size / 2}
                y={y + size / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={18}
                fontWeight={600}
                fill="var(--color-foreground)"
              >
                {TYPE_GRID[r][c]}
              </text>
            </g>
          )
        })
      )}
    </svg>
  )
}
