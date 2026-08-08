---
description: Правила для API и серверного кода
globs: ["src/app/api/**", "src/actions/**", "src/app/actions/**"]
---
- Валидация через Zod на каждом эндпоинте до обращения к БД
- Авторизация на каждом эндпоинте (`is_admin()` для `/api/admin/*`)
- Формат ошибок: `{ "error": { "code": "ERROR_CODE", "message": "..." } }`
- Пагинация: `{ "data": [...], "meta": { "total": N, "page": P, "per_page": PP } }`
- Rate-limit (per IP): `/api/test/*` — 60/мин; `/api/leads/capture`, `/api/leads/link-telegram` — 10/мин; `/api/club/start`, `/api/waitlist/deposit` — 5/мин
- Структурированное логирование, типизированные ответы
- Приложение не реализует чекаут/рекуррент клуба и не вызывает Telegram Bot API — это зона Salebot
