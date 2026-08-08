/**
 * Форматирование значений для UI.
 * CLAUDE.md: суммы — всегда `INTEGER` в копейках, отображение с форматированием.
 */

const RUB_FORMATTER = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

/** `149000` → `1 490 ₽`. Копейки округляются вниз до рублей для читаемости. */
export function formatKopecksToRub(kopecks: number): string {
  const rubles = Math.round(kopecks / 100);
  return `${RUB_FORMATTER.format(rubles)} ₽`;
}

/** `0.82` → `82%`. */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** ISO-дата → `08.08.2026, 14:05` в MSK. */
export function formatDateMsk(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}
