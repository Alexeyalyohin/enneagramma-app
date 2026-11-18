/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node check transpiles the real TypeScript modules. */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
const repo = path.resolve(__dirname, '..')
const cache = new Map()
const mocks = new Map()
const plain = value => JSON.parse(JSON.stringify(value))

function load(file) {
  file = path.resolve(repo, file)
  if (cache.has(file)) return cache.get(file)
  const exports = {}
  cache.set(file, exports)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(source, {
    exports, Date, Request, Response, console, process,
    require(name) {
      if (mocks.has(name)) return mocks.get(name)
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
      const target = name.startsWith('@/') ? path.join(repo, 'src', name.slice(2)) : path.resolve(path.dirname(file), name)
      return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'))
    },
  }, { filename: file })
  return exports
}

const engine = load('src/lib/test-engine/index.ts')
const protocol = load('src/lib/test/public-protocol.ts')
const neutral = () => plain(protocol.compatibilityMatrix())
function checkPublic(step, output) {
  assert.equal(Object.hasOwn(output, 'axis'), false)
  assert.equal(Object.hasOwn(output, 'pair'), false)
  if (step.kind === 'ready') return
  assert.match(output.question_id, /^q_[a-f0-9]{16}$/)
  if (step.kind === 'portrait_pick') return
  assert.deepEqual(plain(output.options.map(x => x.label)), plain(step.options.map(x => x.label)))
  output.options.forEach(x => assert.match(x.value, /^o_[a-f0-9]{16}$/))
  assert.equal(new Set(output.options.map(x => x.value)).size, output.options.length)
}

for (const version of ['v1.0', 'v1.1']) for (const target of [1, 2, 3, 4, 5, 6, 7, 8, 9, null]) {
  let original = [], transported = [], steps = 0
  for (;;) {
    const step = engine.computeNextStep(original, version)
    const output = protocol.publicNextStep(step)
    checkPublic(step, output)
    if (step.kind === 'ready') break
    assert.ok(steps++ < 40, 'Flow must finish')
    let choice
    if (step.kind === 'portrait_pick') choice = String(step.candidates[0].type)
    else if (target && step.kind === 'triad') {
      const meta = engine.TYPE_META[target]
      choice = step.options.find(x => x.value === meta[step.axis])?.value ?? step.options[0].value
    } else choice = step.options[steps % step.options.length].value
    const supplied = step.kind === 'portrait_pick' ? choice : output.options[step.options.findIndex(x => x.value === choice)].value
    const restoredId = protocol.internalQuestionId(transported, engine.computeNextStep(transported, version), output.question_id)
    assert.equal(restoredId, step.question_id)
    const decoded = protocol.internalChoice(step, supplied)
    assert.equal(decoded, choice)
    assert.equal(engine.isValidStepChoice(step, decoded), true)
    original = engine.applyAnswer(original, step.question_id, choice, '2026-11-18T00:00:00Z')
    transported = engine.applyAnswer(transported, restoredId, decoded, '2026-11-18T00:00:00Z')
    assert.deepEqual(plain(transported), plain(original))
  }
  assert.deepEqual(plain(engine.computeResult(transported, version)), plain(engine.computeResult(original, version)))
}

async function checkRoutes() {
  const id = '11111111-1111-4111-8111-111111111111'
  let session
  const db = { from(table) {
    assert.equal(table, 'test_sessions')
    let update
    const query = {
      insert(values) { session = { ...values, id, created_at: new Date().toISOString() }; return query },
      select() { return query }, eq() { return query },
      single: async () => ({ data: { id }, error: null }),
      maybeSingle: async () => ({ data: session, error: null }),
      update(values) { update = values; return query },
      then(resolve, reject) { Object.assign(session, update); return Promise.resolve({ error: null }).then(resolve, reject) },
    }
    return query
  } }
  mocks.set('@/lib/supabase/service', { createServiceClient: () => db })
  mocks.set('@/lib/rate-limit', { RATE_LIMITS: { test: 60, testSessionCreate: 10 }, enforceRateLimit: () => null })
  mocks.set('@/lib/events', { recordEvent: async () => {} })
  mocks.set('@/lib/logger', { logError() {}, logWarn() {}, logInfo() {} })
  const create = load('src/app/api/test/session/route.ts')
  const answer = load('src/app/api/test/answer/route.ts')
  const restore = load('src/app/api/test/session/[sessionId]/route.ts')
  const request = body => new Request('https://example.test/api/test', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  let response = await create.POST(request({}))
  assert.equal(response.status, 201)
  let payload = (await response.json()).data
  checkPublic(engine.computeNextStep([]), payload.next)
  assert.deepEqual(payload.matrix, neutral())
  const send = (question_id, choice) => answer.POST(request({ session_id: id, question_id, choice }))
  response = await send(payload.next.question_id, payload.next.options[0].value)
  assert.equal(response.status, 200)
  payload = (await response.json()).data
  assert.deepEqual(payload.matrix, neutral())
  assert.equal(session.answers[0].choice, engine.computeNextStep([]).options[0].value)
  assert.ok(Object.values(session.axis_scores.social).some(x => x > 0))
  response = await restore.GET(new Request('https://example.test'), { params: Promise.resolve({ sessionId: id }) })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data.matrix, neutral())
  // An old tab may submit a semantic key from its cached question.
  const legacy = engine.computeNextStep(session.answers)
  response = await send(legacy.question_id, legacy.options[0].value)
  assert.equal(response.status, 200)
  // Returning to a previous question still replaces and truncates answers.
  const first = engine.computeNextStep([])
  response = await send(protocol.publicQuestionId(first.question_id), protocol.publicChoiceId(first.question_id, first.options[1].value))
  assert.equal(response.status, 200)
  assert.equal(session.answers.length, 1)
  assert.equal(session.answers[0].choice, first.options[1].value)
  const next = engine.computeNextStep(session.answers)
  response = await send(protocol.publicQuestionId(next.question_id), 'o_ffffffffffffffff')
  assert.equal(response.status, 422)
  assert.equal(session.answers.length, 1)
}

checkRoutes().then(() => console.log('PASS: 9 type paths + balanced path for v1.0/v1.1; unchanged results and labels; opaque IDs; no axes/pairs; neutral scores; real create/answer/restore handlers; legacy keys; backtracking; invalid option rejected'))
  .catch(error => { console.error(error); process.exitCode = 1 })
