---
description: Правила для обработчиков вебхуков (Salebot, Prodamus)
globs: ["src/app/api/webhooks/**"]
---
- Обязательная проверка подписи/секрета ДО любой записи в БД: HMAC-SHA256 для Prodamus (`PRODAMUS_SECRET_KEY`), секрет Salebot в URL/заголовке (+ опц. HMAC)
- Неверная подпись → `400 INVALID_SIGNATURE`, начисления/зеркалирования нет
- Идемпотентность обязательна: `salebot_event_id` для Salebot, `(provider, provider_payment_id)`/`idempotence_key` для Prodamus — повторная доставка не двоит запись
- Всегда отвечай `200 { "ok": true }` при успешном приёме валидного события — иначе источник ретраит доставку
- Никогда не вызывай Telegram Bot API из обработчика — доступ/сообщения/кик ведёт Salebot
- Тело Prodamus — `multipart/form-data`, не JSON; парсить соответствующим образом
