---
description: Правила для работы с базой данных
globs: ["supabase/**", "src/**/*database*", "src/**/*migration*"]
---
- Все изменения схемы через миграции в `supabase/migrations/`
- RLS обязательна на каждой таблице
- Именование таблиц: snake_case, множественное число
- FK всегда с явным `ON DELETE CASCADE`/`SET NULL`
- Индексы для FK и часто используемых фильтров
- `club_subscriptions`/`telegram_access_grants` — зеркала Salebot: пишет только `service_role` из вебхука, не бизнес-логика приложения
