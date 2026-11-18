-- Additive migration: installing this function does not delete any sessions.
-- Enable application cleanup only after the migration and funnel deployment.
CREATE TABLE public.test_session_funnel_archive (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  version TEXT NOT NULL,
  question_5_answered BOOLEAN NOT NULL,
  question_15_answered BOOLEAN NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_session_funnel_archive_created_at
  ON public.test_session_funnel_archive (created_at);
ALTER TABLE public.test_session_funnel_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_session_funnel_archive_admin_read
  ON public.test_session_funnel_archive FOR SELECT TO authenticated
  USING (public.is_admin());
REVOKE ALL ON public.test_session_funnel_archive FROM anon, authenticated;
GRANT SELECT ON public.test_session_funnel_archive TO authenticated;
GRANT SELECT, INSERT ON public.test_session_funnel_archive TO service_role;

-- One statement/snapshot includes live and archived sessions without changing
-- historical cohort boundaries or dropping starts from the denominator.
CREATE VIEW public.test_funnel_sessions WITH (security_invoker = true) AS
  SELECT id, created_at, version, status,
    (answers -> 4 ->> 'q') IS NOT NULL AS question_5_answered,
    (answers -> 14 ->> 'q') IS NOT NULL AS question_15_answered
  FROM public.test_sessions
  UNION ALL
  SELECT id, created_at, version, 'abandoned'::text AS status,
    question_5_answered, question_15_answered
  FROM public.test_session_funnel_archive;
REVOKE ALL ON public.test_funnel_sessions FROM anon, authenticated;
GRANT SELECT ON public.test_funnel_sessions TO service_role;

CREATE FUNCTION public.archive_abandoned_test_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  archived_count INTEGER;
  deleted_count INTEGER;
BEGIN
  WITH candidates AS MATERIALIZED (
    SELECT id, created_at, version,
      (answers -> 4 ->> 'q') IS NOT NULL AS question_5_answered,
      (answers -> 14 ->> 'q') IS NOT NULL AS question_15_answered
    FROM public.test_sessions
    WHERE status = 'abandoned'
      AND lead_id IS NULL
      AND result IS NULL
      AND created_at < now() - interval '30 days'
    ORDER BY created_at, id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  ), archived AS (
    INSERT INTO public.test_session_funnel_archive
      (id, created_at, version, question_5_answered, question_15_answered)
    SELECT id, created_at, version, question_5_answered, question_15_answered
    FROM candidates
    RETURNING id
  ), deleted AS (
    DELETE FROM public.test_sessions AS sessions
    USING archived
    WHERE sessions.id = archived.id
      AND sessions.status = 'abandoned'
      AND sessions.lead_id IS NULL
      AND sessions.result IS NULL
      AND sessions.created_at < now() - interval '30 days'
    RETURNING sessions.id
  )
  SELECT (SELECT count(*) FROM archived), (SELECT count(*) FROM deleted)
  INTO archived_count, deleted_count;

  IF archived_count <> deleted_count THEN
    RAISE EXCEPTION 'Session archive/delete count mismatch';
  END IF;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_abandoned_test_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_abandoned_test_sessions() TO service_role;
COMMENT ON TABLE public.test_session_funnel_archive IS
  'Minimal cohort statistics for removed abandoned tests; no answers, results or lead identifiers.';
