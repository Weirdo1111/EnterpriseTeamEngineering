import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authApi } from './auth'
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'accepted' }), { status: 202 })))
})
afterEach(() => vi.unstubAllGlobals())
it('requests email only for the account preset contact', async () => {
  await authApi.requestEmailCode('doctor')
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(String(url)).toMatch(/\/api\/auth\/code\/request$/)
  expect(JSON.parse(options!.body as string)).toEqual({ account: 'doctor', channel: 'email' })
})
it('verifies email codes using the shared backend login contract', async () => {
  await authApi.loginWithEmail('doctor', '123456')
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(String(url)).toMatch(/\/api\/auth\/code\/login$/)
  expect(JSON.parse(options!.body as string)).toEqual({ account: 'doctor', channel: 'email', code: '123456' })
})
it('preserves HTTP status for throttling and does not fall back on failures', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429 }))
  await expect(authApi.requestEmailCode('doctor')).rejects.toMatchObject({ status: 429 })
})
it('does not forward old demo tokens', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'demo-admin-token' })
  await authApi.me()
  expect(vi.mocked(fetch).mock.calls[0]![1]!.headers).not.toHaveProperty('Authorization')
})

it('face login sends only account and image, never a PersonId or role', async () => {
  await authApi.loginWithFace('doctor', 'synthetic-photo')
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(String(url)).toMatch(/\/api\/auth\/face\/login$/)
  expect(JSON.parse(options!.body as string)).toEqual({ account: 'doctor', image: 'synthetic-photo' })
})
