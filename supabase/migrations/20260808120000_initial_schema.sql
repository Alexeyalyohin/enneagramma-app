-- =============================================================================
-- Эннеаграмма.one — начальная схема (Чертёж.md, БЛОК 2 "Data Model")
-- =============================================================================
-- ПОЧЕМУ одна миграция на все таблицы: это первичная установка схемы, между
-- таблицами есть циклическая по смыслу связность (payments <-> waitlist_entries,
-- club_subscriptions <-> payments), и разбивать её на части нет смысла —
-- откат тоже логично делать целиком.
--
-- Архитектурный инвариант (CLAUDE.md): B2C-пользователи НЕ имеют Supabase Auth.
-- Браузер никогда не пишет в БД напрямую. Вся запись — server-side через
-- service_role, который обходит RLS. Поэтому ни у anon, ни у authenticated нет
-- ни одной политики записи; authenticated-владелец получает только SELECT
-- через is_admin() (и полный доступ к контенту type_descriptions).
--
-- Идемпотентность и атомарность: скрипт оборачивается в BEGIN…COMMIT (либо
-- применяется целиком, либо не применяется вовсе) и начинается с DROP …
-- IF EXISTS, поэтому повторный прогон на той же базе безопасен.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Сброс перед пересозданием (идемпотентность). Порядок обратный зависимостям
-- (FK), CASCADE подчищает индексы/политики/триггеры вместе с таблицами.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS
  public.events,
  public.telegram_access_grants,
  public.waitlist_entries,
  public.payments,
  public.club_subscriptions,
  public.type_descriptions,
  public.test_sessions,
  public.leads,
  public.profiles
  CASCADE;
DROP FUNCTION IF EXISTS public.is_admin();
-- moddatetime не удаляем: расширение может использоваться другими схемами.

-- -----------------------------------------------------------------------------
-- 0. Общие объекты
-- -----------------------------------------------------------------------------

-- moddatetime ставим в схему extensions (конвенция Supabase: public держим
-- чистым от объектов расширений). В триггерах ссылаемся полным именем
-- extensions.moddatetime, чтобы не зависеть от search_path вызывающей роли.
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1. profiles — только владелец
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'Владелец',
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- CASCADE: профиль не имеет смысла без учётной записи владельца.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Политики profiles намеренно НЕ используют is_admin() — иначе получим
-- рекурсию (is_admin() читает profiles). Владелец видит и правит только себя.
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.profiles IS
  'Профиль владельца проекта. 1:1 с auth.users. B2C-лиды сюда НЕ попадают — у них нет Supabase Auth.';
COMMENT ON COLUMN public.profiles.role IS
  'Единственная допустимая роль — admin. Расширять список только вместе с обновлением is_admin().';

-- Проверка, что текущий пользователь — владелец.
-- ПОЧЕМУ здесь, а не в разделе "0. Общие объекты": функция LANGUAGE sql
-- резолвит объекты своего тела уже при CREATE FUNCTION (не как plpgsql), и
-- обращение к public.profiles должно идти ПОСЛЕ создания самой таблицы —
-- иначе `relation "public.profiles" does not exist` прямо на этом операторе.
-- SECURITY DEFINER — потому что функция читает profiles, на которой включена RLS:
-- без DEFINER политика на любой другой таблице не смогла бы проверить роль
-- (и мы получили бы рекурсию политик).
-- SET search_path = '' + полные имена — защита от подмены search_path
-- (обязательное требование к SECURITY DEFINER, иначе линтер Supabase ругается).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'TRUE, если текущий JWT принадлежит владельцу (profiles.role = admin). Используется во всех RLS-политиках чтения админки.';

-- -----------------------------------------------------------------------------
-- 2. leads — центральная сущность воронки
-- -----------------------------------------------------------------------------
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT,                                     -- нормализованный E.164 (+7XXXXXXXXXX), первичный контакт B2C и join-ключ к подписке Prodamus
  email TEXT,                                     -- опционально: чек Prodamus, уведомления, B2B; НЕ ключ идентичности
  telegram_id BIGINT,
  telegram_username TEXT,
  full_name TEXT,
  source TEXT NOT NULL DEFAULT 'test'
    CHECK (source IN ('test','club_page','waitlist','direct','import')),
  enneagram_type SMALLINT CHECK (enneagram_type BETWEEN 1 AND 9),
  wing SMALLINT CHECK (wing BETWEEN 1 AND 9),
  subscribed_telegram BOOLEAN NOT NULL DEFAULT FALSE,
  consent_152fz BOOLEAN NOT NULL DEFAULT FALSE,   -- согласие на обработку ПДн
  consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- лид обязан иметь хотя бы один ключ идентичности: телефон ИЛИ telegram_id
  CONSTRAINT leads_identity_present CHECK (phone IS NOT NULL OR telegram_id IS NOT NULL)
);

-- ПОЧЕМУ частичные уникальные индексы, а не UNIQUE-столбцы: в Postgres NULL не
-- конфликтует с NULL, но частичный индекс дополнительно исключает NULL-строки
-- из индекса и делает намерение явным — лид может иметь только telegram_id
-- (без телефона) и наоборот.
CREATE UNIQUE INDEX idx_leads_phone ON public.leads (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_telegram_id ON public.leads (telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX idx_leads_email ON public.leads (lower(email)) WHERE email IS NOT NULL;   -- поиск, НЕ уникальный
CREATE INDEX idx_leads_type ON public.leads (enneagram_type);
CREATE INDEX idx_leads_created_at ON public.leads (created_at);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_admin_read" ON public.leads
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.leads IS
  'Лид воронки. Идентичность — phone (E.164) и/или telegram_id; Supabase Auth у B2C нет.';
COMMENT ON COLUMN public.leads.phone IS
  'Только нормализованный E.164 (+7XXXXXXXXXX). Нормализация — на уровне API до записи, БД формат не чинит.';
COMMENT ON COLUMN public.leads.email IS
  'Не ключ идентичности: у одного человека может быть общий email, дедуп по нему не делаем.';
COMMENT ON COLUMN public.leads.enneagram_type IS
  'Перезаписывается только если был NULL или пришёл результат с большей confidence (см. Чертёж, БЛОК 5).';

-- -----------------------------------------------------------------------------
-- 3. test_sessions
-- -----------------------------------------------------------------------------
CREATE TABLE public.test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,  -- NULL до захвата лида
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','abandoned')),
  -- ответы триад/центра/tiebreak: [{ "q": "triad_03", "choice": "assertive", "at": "..." }, ...]
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- сырые оси до разрешения: { "social": {...}, "harmonic": {...}, "center": {...} }
  axis_scores JSONB,
  -- итог: { "type": 4, "wing": 5, "confidence": 0.82, "runner_up": 5, "tiebreak_path": [...] }
  result JSONB,
  version TEXT NOT NULL DEFAULT 'v0.4',  -- версия механики теста
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- SET NULL (а не CASCADE): сессия начинается анонимной и остаётся валидной
-- аналитической единицей даже если лид удалён по 152-ФЗ.
--
-- Ответы и результат хранятся в JSONB намеренно: нормализация в отдельные
-- таблицы ответов не нужна для соло-MVP — аналитика по ответам делается редко,
-- а JSONB даёт атомарную запись сессии.

CREATE INDEX idx_test_sessions_lead_id ON public.test_sessions (lead_id);
CREATE INDEX idx_test_sessions_status ON public.test_sessions (status);
CREATE INDEX idx_test_sessions_created_at ON public.test_sessions (created_at);

ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_sessions_admin_read" ON public.test_sessions
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER test_sessions_updated_at BEFORE UPDATE ON public.test_sessions
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.test_sessions IS
  'Сессия адаптивного теста. Публичная страница результата читает сессию через серверный роут (service_role), не напрямую из браузера.';
COMMENT ON COLUMN public.test_sessions.version IS
  'Версия механики теста: результаты разных версий несопоставимы, поэтому версия фиксируется в самой сессии.';

-- -----------------------------------------------------------------------------
-- 4. type_descriptions — контент, редактируется владельцем
-- -----------------------------------------------------------------------------
-- ПОЧЕМУ здесь нет id/created_at: строк ровно девять, естественный ключ — номер
-- типа (1..9). Суррогатный ключ только усложнил бы join к leads.enneagram_type.
CREATE TABLE public.type_descriptions (
  type SMALLINT PRIMARY KEY CHECK (type BETWEEN 1 AND 9),
  title TEXT NOT NULL,                     -- напр. "Тип 4 — Индивидуалист"
  social_triad TEXT NOT NULL CHECK (social_triad IN ('assertive','compliant','withdrawn')),
  harmonic_triad TEXT NOT NULL CHECK (harmonic_triad IN ('positive','competency','reactive')),
  center TEXT NOT NULL CHECK (center IN ('gut','heart','head')),
  portrait_md TEXT NOT NULL,               -- портрет от первого лица (Markdown)
  short_summary TEXT NOT NULL,             -- 1–2 предложения для превью
  wings JSONB,                             -- { "left": {...}, "right": {...} }
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.type_descriptions ENABLE ROW LEVEL SECURITY;

-- Единственная таблица с публичным чтением: описания показываются на странице
-- результата теста анониму. ПДн здесь нет — только редакционный контент.
CREATE POLICY "type_descriptions_public_read" ON public.type_descriptions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "type_descriptions_admin_write" ON public.type_descriptions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER type_descriptions_updated_at BEFORE UPDATE ON public.type_descriptions
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.type_descriptions IS
  'Редакционные описания 9 типов. Единственная таблица с публичным SELECT — ПДн не содержит.';

-- -----------------------------------------------------------------------------
-- 5. club_subscriptions — ЗЕРКАЛО SALEBOT
-- -----------------------------------------------------------------------------
-- Не операционная таблица: заполняется ТОЛЬКО вебхуками /api/webhooks/salebot,
-- для метрик. Приложение сюда не пишет по своей инициативе и не управляет
-- доступом в канал — этим владеет Salebot ↔ Prodamus.
CREATE TABLE public.club_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','past_due','canceled','expired')),
  price_kopecks INTEGER NOT NULL CHECK (price_kopecks > 0),  -- пришедшая из вебхука цена
  is_founder_price BOOLEAN NOT NULL DEFAULT FALSE,
  salebot_subscriber_id TEXT,              -- id подписчика в Salebot (join к боту)
  prodamus_subscription_id TEXT,           -- id подписки Prodamus (если Salebot его отдаёт)
  customer_phone TEXT,                     -- телефон подписчика (из вебхука)
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  grace_until TIMESTAMPTZ,                  -- до какого момента терпим при past_due
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- CASCADE: зеркало подписки без лида не имеет смысла и мешает удалению по 152-ФЗ.

-- один активный клуб на лида
CREATE UNIQUE INDEX idx_club_one_active ON public.club_subscriptions (lead_id)
  WHERE status IN ('active','past_due');
CREATE INDEX idx_club_status ON public.club_subscriptions (status);
CREATE INDEX idx_club_period_end ON public.club_subscriptions (current_period_end);
-- FK-индекс на полный набор строк: idx_club_one_active покрывает только
-- active/past_due, а история (canceled/expired) тоже читается в админке.
CREATE INDEX idx_club_lead ON public.club_subscriptions (lead_id);

ALTER TABLE public.club_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club_admin_read" ON public.club_subscriptions
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER club_updated_at BEFORE UPDATE ON public.club_subscriptions
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.club_subscriptions IS
  'ЗЕРКАЛО SALEBOT. Источник правды по подписке — Salebot/Prodamus. Пишет только service_role из /api/webhooks/salebot; идемпотентность — по events.salebot_event_id.';
COMMENT ON COLUMN public.club_subscriptions.price_kopecks IS
  'Цена в копейках, как пришла в вебхуке. Приложение не вычисляет цену и не применяет промо.';
COMMENT ON COLUMN public.club_subscriptions.current_period_end IS
  'Двигается событием subscription_renewed. Приложение само период не продлевает.';

-- -----------------------------------------------------------------------------
-- 6. payments — единый реестр платежей
-- -----------------------------------------------------------------------------
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.club_subscriptions(id) ON DELETE SET NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('club','deposit')),
  provider TEXT NOT NULL DEFAULT 'prodamus' CHECK (provider IN ('prodamus','yookassa')),
  provider_payment_id TEXT,                -- id платежа у провайдера
  idempotence_key UUID NOT NULL,           -- защита от двойной оплаты
  amount_kopecks INTEGER NOT NULL CHECK (amount_kopecks > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','succeeded','canceled','refunded')),
  raw_webhook JSONB,                       -- последнее событие провайдера целиком
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- subscription_id — SET NULL: депозиты вообще не связаны с подпиской, а факт
-- платежа должен пережить удаление зеркальной записи подписки.

CREATE UNIQUE INDEX idx_payments_idempotence ON public.payments (idempotence_key);
CREATE UNIQUE INDEX idx_payments_provider_id ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX idx_payments_lead ON public.payments (lead_id);
CREATE INDEX idx_payments_status ON public.payments (status);
CREATE INDEX idx_payments_subscription ON public.payments (subscription_id)
  WHERE subscription_id IS NOT NULL;   -- FK-индекс, нужен для join'ов админки
CREATE INDEX idx_payments_created_at ON public.payments (created_at);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_admin_read" ON public.payments
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.payments IS
  'Реестр платежей. Клубные — зеркало вебхуков Salebot; депозиты листа ожидания — прямой вызов Prodamus приложением.';
COMMENT ON COLUMN public.payments.idempotence_key IS
  'Генерируется приложением до похода в Prodamus. UNIQUE — повторная отправка формы не создаёт второй платёж.';
COMMENT ON COLUMN public.payments.amount_kopecks IS
  'Всегда копейки (INTEGER). Форматирование в рубли — на фронте.';

-- -----------------------------------------------------------------------------
-- 7. waitlist_entries
-- -----------------------------------------------------------------------------
CREATE TABLE public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tier_interest TEXT NOT NULL
    CHECK (tier_interest IN ('self','guided','practitioner')),
  deposit_status TEXT NOT NULL DEFAULT 'none'
    CHECK (deposit_status IN ('none','pending','paid','refunded')),
  deposit_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- deposit_payment_id — SET NULL: строка листа ожидания живёт дольше платежа
-- (депозит может быть возвращён/аннулирован, интерес к сертификации остаётся).

CREATE UNIQUE INDEX idx_waitlist_one_per_lead ON public.waitlist_entries (lead_id);
CREATE INDEX idx_waitlist_deposit_status ON public.waitlist_entries (deposit_status);
CREATE INDEX idx_waitlist_created_at ON public.waitlist_entries (created_at);

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_admin_read" ON public.waitlist_entries
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER waitlist_updated_at BEFORE UPDATE ON public.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.waitlist_entries IS
  'Лист ожидания сертификации (B2B). Одна запись на лида — повторная заявка апдейтит существующую.';
COMMENT ON COLUMN public.waitlist_entries.deposit_status IS
  'pending дольше суток без вебхука Prodamus — подсвечивается кроном reconcile-deposits.';

-- -----------------------------------------------------------------------------
-- 8. telegram_access_grants — ЗЕРКАЛО SALEBOT
-- -----------------------------------------------------------------------------
-- Зеркало для метрик доступа. Приложение НЕ выдаёт и НЕ отзывает доступ и
-- никогда не вызывает Telegram Bot API — только отражает события
-- access_granted / access_revoked.
CREATE TABLE public.telegram_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.club_subscriptions(id) ON DELETE SET NULL,
  chat_id BIGINT,                          -- id закрытого канала (если Salebot отдаёт)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','granted','revoked')),
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_grants_lead ON public.telegram_access_grants (lead_id);
CREATE INDEX idx_grants_status ON public.telegram_access_grants (status);
CREATE INDEX idx_grants_subscription ON public.telegram_access_grants (subscription_id)
  WHERE subscription_id IS NOT NULL;   -- FK-индекс для сверки club_paid → access_granted

ALTER TABLE public.telegram_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grants_admin_read" ON public.telegram_access_grants
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER grants_updated_at BEFORE UPDATE ON public.telegram_access_grants
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE public.telegram_access_grants IS
  'ЗЕРКАЛО SALEBOT. Доступ в закрытый канал выдаёт и отзывает Salebot; приложение только отражает события для метрик и сверки рассинхрона.';

-- -----------------------------------------------------------------------------
-- 9. events — аналитика воронки
-- -----------------------------------------------------------------------------
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,  -- NULL для анонимных шагов
  session_id UUID,                          -- test_session или веб-сессия
  event_type TEXT NOT NULL CHECK (event_type IN (
    'test_started','test_completed','result_viewed','lead_captured',
    'telegram_cta_clicked','club_start_clicked','subscriber_created',
    'club_paid','access_granted','subscription_renewed','subscription_past_due',
    'subscription_churned','access_revoked',
    'waitlist_joined','waitlist_deposit_paid'
  )),
  -- РЕШЕНИЕ (в Чертеже место для ключа идемпотентности Salebot не задано явно):
  -- events — единственный журнал, куда пишется КАЖДОЕ входящее событие вебхука,
  -- поэтому ключ идемпотентности живёт здесь. Обработчик /api/webhooks/salebot
  -- сначала пытается вставить строку events с salebot_event_id; конфликт по
  -- уникальному индексу = повторная доставка = no-op, зеркала не двоятся.
  salebot_event_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- session_id намеренно без FK: сюда пишется как id test_sessions, так и
-- анонимный id веб-сессии, которого в БД может не быть вовсе.
-- lead_id SET NULL: аналитика воронки должна пережить удаление лида по 152-ФЗ.

CREATE INDEX idx_events_type_created ON public.events (event_type, created_at);
CREATE INDEX idx_events_lead ON public.events (lead_id);
CREATE UNIQUE INDEX idx_events_salebot_event_id ON public.events (salebot_event_id)
  WHERE salebot_event_id IS NOT NULL;   -- идемпотентность вебхуков Salebot

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_admin_read" ON public.events
  FOR SELECT TO authenticated USING (public.is_admin());
-- events без updated_at: только вставка, апдейтов нет — поэтому и триггера нет.

COMMENT ON TABLE public.events IS
  'Журнал событий воронки (append-only). Апдейтов нет, поэтому нет updated_at и триггера moddatetime.';
COMMENT ON COLUMN public.events.salebot_event_id IS
  'Ключ идемпотентности вебхука Salebot. Частичный UNIQUE: повторная доставка того же события — no-op.';
COMMENT ON COLUMN public.events.session_id IS
  'test_sessions.id или id анонимной веб-сессии. Без FK намеренно — вторая может не существовать в БД.';

-- -----------------------------------------------------------------------------
-- 10. Жёсткая отмена привилегий записи (defense in depth)
-- -----------------------------------------------------------------------------
-- RLS уже закрывает запись (политик записи нет), но Supabase по умолчанию
-- выдаёт anon/authenticated табличные привилегии INSERT/UPDATE/DELETE.
-- Снимаем их явно, чтобы случайно добавленная в будущем политика не открыла
-- запись из браузера. Вся запись идёт через service_role, который RLS обходит
-- и на которого эти REVOKE не распространяются.
-- Исключение — type_descriptions: владелец-authenticated правит контент через
-- политику type_descriptions_admin_write, там привилегии нужны.
REVOKE INSERT, UPDATE, DELETE ON public.profiles                FROM anon;
REVOKE INSERT, DELETE         ON public.profiles                FROM authenticated; -- UPDATE нужен для profiles_update_own
REVOKE INSERT, UPDATE, DELETE ON public.leads                   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.test_sessions           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.club_subscriptions      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments                FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.waitlist_entries        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.telegram_access_grants  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.events                  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.type_descriptions       FROM anon;

COMMIT;

-- =============================================================================
-- ПОЛНЫЙ ОТКАТ (выполнять вручную; для обычного повторного прогона миграции
-- он не нужен — DROP … IF EXISTS в начале файла уже делает её идемпотентной):
--   BEGIN;
--   DROP TABLE IF EXISTS public.events, public.telegram_access_grants,
--     public.waitlist_entries, public.payments, public.club_subscriptions,
--     public.type_descriptions, public.test_sessions, public.leads,
--     public.profiles CASCADE;
--   DROP FUNCTION IF EXISTS public.is_admin();
--   -- moddatetime не удаляем: расширение может использоваться другими схемами.
--   COMMIT;
-- =============================================================================
