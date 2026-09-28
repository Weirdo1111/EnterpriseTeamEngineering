import test from 'node:test'
import assert from 'node:assert/strict'
import { createTencentFaceVerifier } from '../dist/auth/tencent-face.js'

const env = { TENCENT_FACE_ENABLED: 'true', TENCENT_SECRET_ID: 'test-id', TENCENT_SECRET_KEY: 'test-key', TENCENT_FACE_REGION: 'ap-guangzhou' }
test('VerifyFace uses the latest API and accepts only strict matching on model 3.0', async () => {
  let sent
  const verify = createTencentFaceVerifier(env, async (url, options) => {
    sent = { url, options, payload: JSON.parse(options.body) }
    return new Response(JSON.stringify({ Response: { IsMatch: true, Score: 80, FaceModelVersion: '3.0', RequestId: 'test-request' } }))
  })
  assert.equal(await verify('doctor_1', 'synthetic-image'), true)
  assert.equal(sent.url, 'https://iai.tencentcloudapi.com/')
  assert.equal(sent.options.headers['X-TC-Version'], '2020-03-03')
  assert.equal(sent.options.headers['X-TC-Action'], 'VerifyFace')
  assert.deepEqual(sent.payload, { PersonId: 'doctor_1', Image: 'synthetic-image', QualityControl: 3 })
})

import express from 'express'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'
import argon2 from 'argon2'
import { createAuthRouter } from '../dist/routes/auth.js'
import { createFaceAuth, FaceAuthError, FACE_FAILURE, validFaceImage } from '../dist/auth/face.js'
import { CloudFaceError } from '../dist/auth/tencent-face.js'

// Synthetic bytes, not a person's photograph. Recognition is explicitly mocked.
const image = Buffer.from([255, 216, 255, ...Array(40).fill(0)]).toString('base64')
const secret = 'test-jwt-secret-at-least-32-characters'
function fixture(verify = async () => true) {
  const user = { id: '9007199254740993', username: 'doctor', name: 'Doctor', role: 'doctor', status: 'active', tencent_person_id: 'doctor_9007199254740993', password_hash: '' }
  const logs = []
  const attempts = new Map()
  const limits = {
    async ip(ip) { const key = `ip:${ip}`; const n = (attempts.get(key) || 0) + 1; attempts.set(key, n); if (n > 30) throw new FaceAuthError(429) },
    async account(account) { const n = (attempts.get(account) || 0) + 1; attempts.set(account, n); if (n > 5) throw new FaceAuthError(429) },
  }
  const users = { byAccount: async a => a === user.username ? { ...user } : null, byId: async id => id === user.id ? { ...user } : null }
  return { user, logs, users, faces: createFaceAuth(users, verify, limits, event => logs.push(event)) }
}
async function serve(t, f) {
  const app = express()
  app.use('/api/auth', createAuthRouter(f.users, secret, undefined, f.faces))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const base = `http://127.0.0.1:${server.address().port}`
  return async (path, body, headers = {}) => {
    const response = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json(), headers: response.headers }
  }
}
test('mock本人 matches server PersonId, gets existing JWT and /me; mapping never leaks', async t => {
  let received
  const f = fixture(async (personId, photo) => { received = { personId, photo }; return true })
  const call = await serve(t, f)
  const result = await call('/api/auth/face/login', { account: 'doctor', image })
  assert.equal(result.status, 200)
  assert.deepEqual(received, { personId: f.user.tencent_person_id, photo: image })
  const payload = jwt.verify(result.body.token, secret, { algorithms: ['HS256'] })
  assert.equal(payload.sub, f.user.id)
  assert.equal(payload.exp - payload.iat, 7200)
  assert.equal(result.body.user.id, f.user.id)
  assert.equal(result.body.user.role, 'doctor')
  assert.equal(result.body.user.tencent_person_id, undefined)
  assert.equal(result.body.user.password_hash, undefined)
  assert.equal((await call('/api/auth/me', undefined, { Authorization: `Bearer ${result.body.token}` })).status, 200)
  f.user.status = 'disabled'
  assert.equal((await call('/api/auth/me', undefined, { Authorization: `Bearer ${result.body.token}` })).status, 401)
})
test('other-photo rejection, unknown, unenrolled, disabled and cloud failure have identical responses, no JWT', async t => {
  const cases = [
    { account: 'unknown', setup: () => {}, verify: async () => true },
    { account: 'doctor', setup: f => { f.user.tencent_person_id = null }, verify: async () => true },
    { account: 'doctor', setup: f => { f.user.status = 'disabled' }, verify: async () => true },
    { account: 'doctor', setup: () => {}, verify: async () => false },
    { account: 'doctor', setup: () => {}, verify: async () => { throw new CloudFaceError('TransportError') } },
  ]
  for (const scenario of cases) {
    const f = fixture(scenario.verify); scenario.setup(f)
    const call = await serve(t, f)
    const result = await call('/api/auth/face/login', { account: scenario.account, image })
    assert.equal(result.status, 401)
    assert.deepEqual(result.body, { message: FACE_FAILURE })
    assert.equal(result.body.token, undefined)
  }
})
test('PersonId, role, URL and other extra fields are rejected without calling the provider', async t => {
  let calls = 0
  const f = fixture(async () => { calls++; return true })
  const call = await serve(t, f)
  for (const extra of [{ PersonId: 'admin' }, { personId: 'admin' }, { role: 'admin' }, { permissions: ['all'] }, { Url: 'https://example.invalid' }]) {
    assert.equal((await call('/api/auth/face/login', { account: 'doctor', image, ...extra })).status, 400)
  }
  assert.equal((await call('/api/auth/face/login?PersonId=admin', { account: 'doctor', image })).status, 400)
  assert.equal(calls, 0)
})
test('five failed attempts exhaust account budget; no JWT on the sixth attempt', async t => {
  let calls = 0
  const call = await serve(t, fixture(async () => { calls++; return false }))
  for (let n = 0; n < 5; n++) assert.equal((await call('/api/auth/face/login', { account: 'doctor', image })).status, 401)
  const result = await call('/api/auth/face/login', { account: 'doctor', image })
  assert.equal(result.status, 429)
  assert.equal(result.headers.get('retry-after'), '900')
  assert.equal(result.body.token, undefined)
  assert.equal(calls, 5)
})
test('role/status/mapping are reloaded after the cloud call', async () => {
  for (const change of [f => { f.user.status = 'disabled' }, f => { f.user.tencent_person_id = 'different-person' }]) {
    const f = fixture(async () => { change(f); return true })
    await assert.rejects(f.faces.verify('doctor', image), error => error.status === 401)
  }
  const f = fixture(async () => { f.user.role = 'seniorDoctor'; return true })
  assert.equal((await f.faces.verify('doctor', image)).role, 'seniorDoctor')
})
test('provider error messages and photos are not copied to server logs', async () => {
  const f = fixture(async () => { throw new Error(`SECRET and ${image}`) })
  await assert.rejects(f.faces.verify('doctor', image))
  assert.deepEqual(f.logs, [{ code: 'InternalFailure' }])
})
test('large requests and invalid image encodings are rejected before cloud calls', async t => {
  let calls = 0
  const call = await serve(t, fixture(async () => { calls++; return true }))
  for (const bad of ['', 'not-base64', `data:image/jpeg;base64,${image}`, 'a'.repeat(2_800_004)]) {
    assert.equal((await call('/api/auth/face/login', { account: 'doctor', image: bad })).status, 400)
  }
  assert.equal((await call('/api/auth/face/login', { account: 'doctor', image: 'a'.repeat(3 * 1024 * 1024) })).status, 413)
  assert.equal(calls, 0)
  assert.equal(validFaceImage(image), true)
})
test('password login remains functional and does not require a cloud enrollment', async t => {
  const f = fixture()
  f.user.password_hash = await argon2.hash('fixture-password')
  f.user.tencent_person_id = null
  const call = await serve(t, f)
  const result = await call('/api/auth/login', { account: 'doctor', password: 'fixture-password' })
  assert.equal(result.status, 200)
  assert.equal(result.body.user.role, 'doctor')
})
test('strict provider responses fail closed: nonmatches, low score, wrong model, malformed and errors', async () => {
  const good = { IsMatch: true, Score: 80, FaceModelVersion: '3.0' }
  for (const result of [{ ...good, IsMatch: false }, { ...good, Score: 59 }]) {
    assert.equal(await createTencentFaceVerifier(env, async () => new Response(JSON.stringify({ Response: result })))('doctor_1', image), false)
  }
  for (const result of [{ ...good, FaceModelVersion: '2.0' }, { ...good, IsMatch: 'true' }, { ...good, Score: '80' }, {}, { ...good, Error: { Code: 'AuthFailure.SecretIdNotFound', Message: 'sensitive' } }]) {
    await assert.rejects(createTencentFaceVerifier(env, async () => new Response(JSON.stringify({ Response: result })))('doctor_1', image), CloudFaceError)
  }
  for (const fetcher of [async () => { throw new Error('raw secret') }, async () => new Response('bad', { status: 500 }), async () => new Response('not-json')]) {
    await assert.rejects(createTencentFaceVerifier(env, fetcher)('doctor_1', image), error => error instanceof CloudFaceError && !error.message.includes('raw secret'))
  }
})
test('unconfigured or disabled cloud verification never contacts a provider', async () => {
  let called = false
  for (const config of [{}, { ...env, TENCENT_SECRET_KEY: '' }, { ...env, TENCENT_FACE_THRESHOLD: '0' }, { ...env, TENCENT_FACE_THRESHOLD: 'NaN' }]) {
    await assert.rejects(createTencentFaceVerifier(config, async () => { called = true; return new Response() })('doctor_1', image))
  }
  assert.equal(called, false)
})
