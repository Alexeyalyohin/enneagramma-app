/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node test resolves optional PGlite through NODE_PATH. */
const { PGlite } = require('@electric-sql/pglite')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const path = require('node:path')

async function main() {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT false';
    CREATE TABLE public.test_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz,
      version text NOT NULL DEFAULT 'v1.1', status text NOT NULL,
      answers jsonb NOT NULL DEFAULT '[]', lead_id uuid, result jsonb
    );
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_sessions TO service_role;
  `)
  await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/20261118160000_archive_abandoned_test_sessions.sql'), 'utf8'))
  // NOW remains stable throughout the transaction, including the 30-day boundary.
  await db.exec(`BEGIN;
    INSERT INTO public.test_sessions (status, created_at, answers)
    SELECT 'abandoned', now() - interval '31 days',
      COALESCE((SELECT jsonb_agg(jsonb_build_object('q', 'q' || j, 'choice', 'sensitive-answer'))
        FROM generate_series(1, i % 16) j), '[]'::jsonb)
    FROM generate_series(1, 107) i;
    INSERT INTO public.test_sessions (status, created_at, lead_id, result) VALUES
      ('abandoned', now() - interval '1 day', NULL, NULL),
      ('abandoned', now() - interval '30 days', NULL, NULL),
      ('abandoned', now() - interval '31 days', gen_random_uuid(), NULL),
      ('abandoned', now() - interval '31 days', NULL, '{"type":8}'),
      ('completed', now() - interval '31 days', NULL, '{"type":8}'),
      ('in_progress', now() - interval '31 days', NULL, NULL);
    INSERT INTO public.test_sessions (status, created_at) VALUES ('abandoned', NULL);
  `)
  async function cohorts() {
    const result = []
    for (const days of [7, 30, 90, 365]) {
      result.push((await db.query(`SELECT count(*) AS starts,
        count(*) FILTER (WHERE question_5_answered) AS q5,
        count(*) FILTER (WHERE question_15_answered) AS q15,
        count(*) FILTER (WHERE status = 'completed') AS completed
        FROM public.test_funnel_sessions WHERE created_at >= now() - $1 * interval '1 day'`, [days])).rows)
    }
    return result
  }
  const before = await cohorts()
  await db.exec('SET LOCAL ROLE service_role')
  assert.equal((await db.query('SELECT public.archive_abandoned_test_sessions() AS n')).rows[0].n, 100)
  await db.exec('RESET ROLE')
  assert.deepEqual(await cohorts(), before)
  assert.equal((await db.query('SELECT public.archive_abandoned_test_sessions() AS n')).rows[0].n, 7)
  assert.equal((await db.query('SELECT public.archive_abandoned_test_sessions() AS n')).rows[0].n, 0)
  assert.deepEqual(await cohorts(), before)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.test_sessions')).rows[0].n, 7)
  const columns = (await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_name='test_session_funnel_archive' ORDER BY ordinal_position`)).rows.map(x => x.column_name)
  assert.deepEqual(columns, ['id', 'created_at', 'version', 'question_5_answered', 'question_15_answered', 'archived_at'])

  // A failed delete must roll back the preceding archive insert as well.
  await db.exec(`INSERT INTO public.test_sessions (status, created_at) VALUES ('abandoned', now() - interval '31 days');
    CREATE FUNCTION public.block_cleanup() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END';
    CREATE TRIGGER block_cleanup BEFORE DELETE ON public.test_sessions FOR EACH ROW EXECUTE FUNCTION public.block_cleanup();
    SAVEPOINT failed_cleanup;`)
  await assert.rejects(db.query('SELECT public.archive_abandoned_test_sessions()'), /count mismatch/)
  await db.exec('ROLLBACK TO SAVEPOINT failed_cleanup')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.test_session_funnel_archive')).rows[0].n, 107)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.test_sessions')).rows[0].n, 8)
  await db.exec('DROP TRIGGER block_cleanup ON public.test_sessions')

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SAVEPOINT check_permissions; SET LOCAL ROLE ${role}`)
    await assert.rejects(db.query('SELECT public.archive_abandoned_test_sessions()'), /permission denied/)
    await db.exec('ROLLBACK TO SAVEPOINT check_permissions')
  }
  await db.exec('SET LOCAL ROLE authenticated')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.test_session_funnel_archive')).rows[0].n, 0)
  await db.exec('RESET ROLE; ROLLBACK')
  await db.close()
  console.log('PASS: PostgreSQL migration; 100-row bound; 30-day boundary; protected rows; cohort counts 7/30/90/365 unchanged; repeated cleanup; transactional rollback; RLS and RPC permissions; archive contains no answers')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
