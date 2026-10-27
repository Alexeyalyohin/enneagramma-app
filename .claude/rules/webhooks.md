---
description: Правила для обработчиков вебхуков (сейчас только Prodamus)
globs: ["src/app/api/webhooks/**"]
---
- Единственный входящий вебхук — `/api/webhooks/prodamus` (депозит листа ожидания). Вебхук Salebot удалён вместе с выводом Salebot; бот на ChatPlace в приложение ничего не шлёт
- Обязательная проверка подписи ДО любой записи в БД: HMAC-SHA256 для Prodamus (`PRODAMUS_SECRET_KEY`)
- Неверная подпись → `400 INVALID_SIGNATURE`, начисления/зеркалирования нет
- Идемпотентность обязательна: `(provider, provider_payment_id)`/`idempotence_key` для Prodamus — повторная доставка не двоит запись. Колонка `events.salebot_event_id` историческая, не заполняется
- Всегда отвечай `200 { "ok": true }` при успешном приёме валидного события — иначе источник ретраит доставку
- Никогда не вызывай Telegram Bot API из обработчика — доступ/сообщения/кик ведёт ChatPlace
- Тело Prodamus — `multipart/form-data`, не JSON; парсить соответствующим образом
