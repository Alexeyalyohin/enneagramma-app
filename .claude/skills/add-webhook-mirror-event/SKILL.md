---
name: add-webhook-mirror-event
description: "Добавляет новое событие в обработчик /api/webhooks/salebot или /api/webhooks/prodamus и зеркалирует его в БД. Используй когда нужно завести новый тип события от Salebot/Prodamus."
---
Ты добавляешь обработку нового события в вебхук-эндпоинт. Выполни пошагово:

1. Определи источник события — Salebot (`/api/webhooks/salebot`) или Prodamus (`/api/webhooks/prodamus`) — и точный набор полей, которые он присылает
2. Добавь `event_type` в `CHECK`-constraint таблицы `events` через миграцию (делегируй `database-architect` при необходимости)
3. Напиши обработчик в `integrations-specialist`-зоне:
   - Проверка подписи/секрета — ДО парсинга бизнес-данных
   - Идемпотентность по `salebot_event_id` (Salebot) или `(provider, provider_payment_id)`/`idempotence_key` (Prodamus) — SELECT перед INSERT, повторное событие — no-op
   - Обновление соответствующей зеркальной таблицы (`club_subscriptions`, `telegram_access_grants`, `payments`, `waitlist_entries`) только из полей, реально пришедших в вебхуке — не додумывай значения
   - Запись события в `events`
   - Ответ `200 { "ok": true }` при успехе
4. Напиши тест на повторную доставку одного и того же события — убедись, что запись не дублируется и период/статус не двоится
5. Если событие подразумевает действие в Telegram (сообщение, кик, инвайт) — этого действия в коде приложения быть не должно, только зеркалирование
