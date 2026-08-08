/**
 * Авторизация Vercel Cron (Чертёж.md, БЛОК 5 «Cron-задачи»).
 *
 * Vercel сам добавляет заголовок `Authorization: Bearer $CRON_SECRET` к
 * запросам от Cron Jobs, если задана переменная окружения `CRON_SECRET` —
 * это документированный способ защитить крон-роуты от прямого публичного
 * вызова (без него `/api/cron/*` были бы обычными публичными GET-эндпоинтами).
 */

export function verifyCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get('authorization')
  return header === `Bearer ${secret}`
}
