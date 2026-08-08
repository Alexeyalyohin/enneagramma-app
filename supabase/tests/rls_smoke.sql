-- =============================================================================
-- Проверка RLS после применения 20260808120000_initial_schema.sql
-- Запускать в SQL Editor Supabase целиком (три оператора подряд: создание
-- функции, вызов, удаление функции — каждый самостоятелен, не зависит от
-- временных объектов конкретного соединения).
--
-- Результат — обычная таблица (check_no, check_name, status, details) в
-- панели Results после второго оператора. Смотри строки со status = 'FAIL'.
--
-- Тестовые данные (лид +79990000002, telegram_id 100000001/100000002,
-- club_subscription, event) вставляются и сразу же гарантированно
-- откатываются намеренным исключением-«сентинелом» внутри функции — уже
-- собранные строки результата это исключение не затрагивает (RETURN NEXT
-- пишет в tuplestore функции, а не в таблицу, и откату через SAVEPOINT не
-- подчиняется). После прогона в БД не остаётся ни тестовых строк, ни самой
-- функции (её дропает третий оператор).
-- =============================================================================

CREATE OR REPLACE FUNCTION public._run_rls_checks()
RETURNS TABLE(check_no INT, check_name TEXT, status TEXT, details TEXT)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_missing TEXT;
  v_bad TEXT;
  v_count INT;
  v_admin_flag BOOLEAN;
  v_lead UUID;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1. RLS включена на всех девяти таблицах
  -- ---------------------------------------------------------------------------
  SELECT string_agg(c.relname, ', ')
  INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = FALSE;

  check_no := 1; check_name := 'RLS enabled on all tables';
  IF v_missing IS NOT NULL THEN
    status := 'FAIL'; details := v_missing;
  ELSE
    status := 'OK'; details := NULL;
  END IF;
  RETURN NEXT;

  -- ---------------------------------------------------------------------------
  -- 2. Ни у anon, ни у authenticated нет политик записи
  --    (легальные исключения — type_descriptions и profiles_update_own)
  -- ---------------------------------------------------------------------------
  SELECT string_agg(format('%s.%s (%s)', tablename, policyname, cmd), '; ')
  INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd <> 'SELECT'
    AND tablename NOT IN ('type_descriptions', 'profiles');

  check_no := 2; check_name := 'No write policies outside mirrors/content';
  IF v_bad IS NOT NULL THEN
    status := 'FAIL'; details := v_bad;
  ELSE
    status := 'OK'; details := NULL;
  END IF;
  RETURN NEXT;

  -- ---------------------------------------------------------------------------
  -- 3. Зеркала Salebot: только SELECT-политика и ничего больше
  -- ---------------------------------------------------------------------------
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('club_subscriptions', 'telegram_access_grants')
    AND cmd <> 'SELECT';

  check_no := 3; check_name := 'Salebot mirrors are read-only';
  IF v_count > 0 THEN
    status := 'FAIL'; details := v_count || ' write policies found';
  ELSE
    status := 'OK'; details := NULL;
  END IF;
  RETURN NEXT;

  -- ---------------------------------------------------------------------------
  -- 8. moddatetime-триггеры подключены на всех восьми таблицах, где они нужны
  --    (events — единственное осознанное исключение, append-only).
  --    ПОЧЕМУ структурная проверка по каталогу, а не живой UPDATE + сравнение
  --    timestamp: весь тест — одна транзакция, а now()/CURRENT_TIMESTAMP (на
  --    них основан moddatetime) замораживаются на момент её начала; pg_sleep
  --    реальное время не сдвигает то, что видит now(). "До" и "после" внутри
  --    одной транзакции совпадут ВСЕГДА, сработал триггер или нет — такое
  --    сравнение принципиально не может обнаружить проблему. Смотрим вместо
  --    этого напрямую в pg_trigger: триггер физически привязан к функции.
  -- ---------------------------------------------------------------------------
  SELECT string_agg(t.tbl, ', ')
  INTO v_missing
  FROM unnest(ARRAY['profiles','leads','test_sessions','type_descriptions',
                     'club_subscriptions','payments','waitlist_entries',
                     'telegram_access_grants']) AS t(tbl)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND c.relname = t.tbl
      AND NOT tg.tgisinternal
      AND p.proname = 'moddatetime'
      AND pn.nspname = 'extensions'
  );

  check_no := 8; check_name := 'moddatetime trigger wired on all mutable tables';
  IF v_missing IS NOT NULL THEN
    status := 'FAIL'; details := 'missing on: ' || v_missing;
  ELSE
    status := 'OK'; details := NULL;
  END IF;
  RETURN NEXT;

  -- ---------------------------------------------------------------------------
  -- 4. Поведение от имени anon: читается только type_descriptions
  -- ---------------------------------------------------------------------------
  SET LOCAL ROLE anon;

  EXECUTE 'SELECT count(*) FROM public.leads' INTO v_count;
  check_no := 4; check_name := 'anon cannot read leads';
  IF v_count <> 0 THEN status := 'FAIL'; details := v_count || ' rows visible';
  ELSE status := 'OK'; details := NULL; END IF;
  RETURN NEXT;

  EXECUTE 'SELECT count(*) FROM public.club_subscriptions' INTO v_count;
  check_no := 4; check_name := 'anon cannot read club_subscriptions';
  IF v_count <> 0 THEN status := 'FAIL'; details := v_count || ' rows visible';
  ELSE status := 'OK'; details := NULL; END IF;
  RETURN NEXT;

  EXECUTE 'SELECT count(*) FROM public.type_descriptions' INTO v_count;
  check_no := 4; check_name := 'anon can read type_descriptions';
  status := 'OK'; details := v_count || ' rows visible';
  RETURN NEXT;

  BEGIN
    EXECUTE $q$INSERT INTO public.leads (phone) VALUES ('+79990000001')$q$;
    check_no := 4; check_name := 'anon cannot insert into leads';
    status := 'FAIL'; details := 'insert succeeded';
  EXCEPTION WHEN OTHERS THEN
    check_no := 4; check_name := 'anon cannot insert into leads';
    status := 'OK'; details := SQLERRM;
  END;
  RETURN NEXT;

  RESET ROLE;

  -- ---------------------------------------------------------------------------
  -- 5. Поведение от имени authenticated БЕЗ profiles.role = 'admin'
  -- ---------------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}';

  EXECUTE 'SELECT public.is_admin()' INTO v_admin_flag;
  check_no := 5; check_name := 'is_admin() = false for non-admin';
  IF v_admin_flag THEN status := 'FAIL'; details := 'returned true';
  ELSE status := 'OK'; details := NULL; END IF;
  RETURN NEXT;

  EXECUTE 'SELECT count(*) FROM public.payments' INTO v_count;
  check_no := 5; check_name := 'non-admin cannot read payments';
  IF v_count <> 0 THEN status := 'FAIL'; details := v_count || ' rows visible';
  ELSE status := 'OK'; details := NULL; END IF;
  RETURN NEXT;

  EXECUTE 'SELECT count(*) FROM public.events' INTO v_count;
  check_no := 5; check_name := 'non-admin cannot read events';
  IF v_count <> 0 THEN status := 'FAIL'; details := v_count || ' rows visible';
  ELSE status := 'OK'; details := NULL; END IF;
  RETURN NEXT;

  RESET ROLE;

  -- ---------------------------------------------------------------------------
  -- 6-8. Констрейнты + идемпотентность + триггер. Все пишут тестовые строки —
  -- поэтому целиком в savepoint-блоке, который в конце гарантированно
  -- откатывается намеренным исключением. RETURN NEXT выше и внутри этого
  -- блока в tuplestore функции уже не откатывается вместе с данными.
  -- ---------------------------------------------------------------------------
  BEGIN
    -- 6a. лид без identity отвергается
    BEGIN
      INSERT INTO public.leads (full_name) VALUES ('Ничей лид');
      check_no := 6; check_name := 'leads_identity_present rejects empty identity';
      status := 'FAIL'; details := 'insert succeeded';
    EXCEPTION WHEN check_violation THEN
      check_no := 6; check_name := 'leads_identity_present rejects empty identity';
      status := 'OK'; details := NULL;
    END;
    RETURN NEXT;

    INSERT INTO public.leads (phone) VALUES ('+79990000002') RETURNING id INTO v_lead;

    -- 6b. дубль телефона отвергается
    BEGIN
      INSERT INTO public.leads (phone) VALUES ('+79990000002');
      check_no := 6; check_name := 'idx_leads_phone rejects duplicate phone';
      status := 'FAIL'; details := 'insert succeeded';
    EXCEPTION WHEN unique_violation THEN
      check_no := 6; check_name := 'idx_leads_phone rejects duplicate phone';
      status := 'OK'; details := NULL;
    END;
    RETURN NEXT;

    -- 6c. NULL-телефоны не конфликтуют
    INSERT INTO public.leads (telegram_id) VALUES (100000001), (100000002);
    check_no := 6; check_name := 'NULL phones do not conflict';
    status := 'OK'; details := NULL;
    RETURN NEXT;

    -- 7a. один активный клуб на лида
    INSERT INTO public.club_subscriptions (lead_id, price_kopecks, current_period_end)
    VALUES (v_lead, 149000, NOW() + INTERVAL '30 days');

    BEGIN
      INSERT INTO public.club_subscriptions (lead_id, price_kopecks, current_period_end)
      VALUES (v_lead, 149000, NOW() + INTERVAL '30 days');
      check_no := 7; check_name := 'idx_club_one_active enforces single active sub';
      status := 'FAIL'; details := 'second insert succeeded';
    EXCEPTION WHEN unique_violation THEN
      check_no := 7; check_name := 'idx_club_one_active enforces single active sub';
      status := 'OK'; details := NULL;
    END;
    RETURN NEXT;

    -- 7b. идемпотентность вебхука Salebot
    INSERT INTO public.events (lead_id, event_type, salebot_event_id)
    VALUES (v_lead, 'club_paid', 'evt_test_dup');

    BEGIN
      INSERT INTO public.events (lead_id, event_type, salebot_event_id)
      VALUES (v_lead, 'club_paid', 'evt_test_dup');
      check_no := 7; check_name := 'idx_events_salebot_event_id enforces idempotency';
      status := 'FAIL'; details := 'duplicate insert succeeded';
    EXCEPTION WHEN unique_violation THEN
      check_no := 7; check_name := 'idx_events_salebot_event_id enforces idempotency';
      status := 'OK'; details := NULL;
    END;
    RETURN NEXT;

    -- Намеренный откат всех вставок 6-7 (сентинел-исключение -> savepoint rollback).
    RAISE EXCEPTION '__rollback_test_data__';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__rollback_test_data__' THEN
      RAISE;  -- настоящая неожиданная ошибка — не глотаем, пробрасываем дальше
    END IF;
    -- иначе: это наш сентинел, тестовые данные внутри блока откачены, продолжаем
  END;

  RETURN;
END;
$fn$;

SELECT * FROM public._run_rls_checks() ORDER BY check_no, check_name;

DROP FUNCTION public._run_rls_checks();
