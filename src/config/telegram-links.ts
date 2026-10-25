/**
 * Статические ссылки на бота — по одной на каждый тип Эннеаграммы.
 * Кнопка «Получить полный разбор в Telegram» на экране результата ведёт
 * на ссылку того типа, который показан на экране (крыло и процент не
 * учитываются — бот их не показывает).
 *
 * Заменили подписанный `?start=club_<token>`: платформа бота не умеет
 * надёжно принимать произвольный параметр после `/start`.
 *
 * Пустая строка = ссылка для типа ещё не задана: роут
 * `/api/leads/telegram-start` ответит 503, а не отправит в никуда.
 */

import type { EnneagramType } from '@/lib/test-engine/types'

export const TELEGRAM_LINKS_BY_TYPE: Record<EnneagramType, string> = {
  1: 'https://t.me/Enneagramma_one_bot?start=quiz_type_1',
  2: 'https://t.me/Enneagramma_one_bot?start=quiz_type_2',
  3: 'https://t.me/Enneagramma_one_bot?start=quiz_type_3',
  4: 'https://t.me/Enneagramma_one_bot?start=quiz_type_4',
  5: 'https://t.me/Enneagramma_one_bot?start=quiz_type_5',
  6: 'https://t.me/Enneagramma_one_bot?start=quiz_type_6',
  7: 'https://t.me/Enneagramma_one_bot?start=quiz_type_7',
  8: 'https://t.me/Enneagramma_one_bot?start=quiz_type_8',
  9: 'https://t.me/Enneagramma_one_bot?start=quiz_type_9',
}

/**
 * Ссылка кнопки «Вступить в клуб» (`/api/club/start`). Статическая по той же
 * причине: подписанный `?start=club_<token>` платформа бота не принимает.
 */
export const TELEGRAM_CLUB_LINK = 'https://t.me/Enneagramma_one_bot?start=club'
