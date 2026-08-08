---
name: create-migration
description: "Создаёт SQL-миграцию для Supabase. Используй когда нужно изменить схему базы данных."
---
Создай миграцию в `supabase/migrations/` по следующему шаблону:

1. Имя файла: `YYYYMMDDHHMMSS_$ARGUMENTS.sql`
2. Содержимое:
   - Комментарий с описанием что делает миграция
   - `CREATE TABLE` / `ALTER TABLE`
   - RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
   - Политики: `CREATE POLICY ...`
   - Индексы: `CREATE INDEX ...`
   - Комментарии: `COMMENT ON TABLE/COLUMN`
3. Если доступен Supabase MCP — выполни миграцию
4. Обнови TypeScript типы если возможно
5. Если создаваемая таблица — зеркало Salebot (аналог `club_subscriptions`/`telegram_access_grants`): не давай политику записи authenticated/anon, только `is_admin()` на SELECT
