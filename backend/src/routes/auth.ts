import { Router, json, type Request, type Response, type NextFunction, type ErrorRequestHandler } from 'express'
import argon2 from 'argon2'
import { rateLimit } from 'express-rate-limit'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import { AuthCodeError, type CodeAuth } from '../auth/codes.js'
import { FACE_FAILURE, FaceAuthError, validFaceImage, type FaceAuth } from '../auth/face.js'
import type { DbUser, UserLookup } from '../db.js'

const roles = new Set(['doctor', 'seniorDoctor', 'admin'])

function publicUser(user: DbUser) {
  const id = Number(user.id)
  return {
    id: Number.isSafeInteger(id) ? id : user.id,
    account: user.username,
    name: user.name,
    role: user.role,
  }
}

export function createAuthenticated(users: UserLookup, secret: string) {
  return async function authenticated(req: Request, res: Response, next: NextFunction) {
    const match = /^Bearer (\S+)$/i.exec(req.header('Authorization') || '')
    if (!match) { res.status(401).json({ message: 'Unauthorized' }); return }
    try {
      const payload = jwt.verify(match[1]!, secret, { algorithms: ['HS256'] }) as JwtPayload
      if (typeof payload.sub !== 'string') { res.status(401).json({ message: 'Unauthorized' }); return }
      const user = await users.byId(payload.sub)
      if (!user || user.status !== 'active' || !roles.has(user.role)) {
        res.status(401).json({ message: 'Unauthorized' }); return
      }
      res.locals.user = user
      next()
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) { res.status(401).json({ message: 'Unauthorized' }); return }
      next(error)
    }
  }
}

export function createAuthRouter(users: UserLookup, secret: string, codes?: CodeAuth, faces?: FaceAuth) {
  const router = Router()
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many sign-in attempts. Try again later.' } })
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

  function completeLogin(res: Response, user: DbUser) {
    const token = jwt.sign({}, secret, { algorithm: 'HS256', subject: String(user.id), expiresIn: '2h' })
    res.json({ token, user: publicUser(user) })
  }

  const faceFailure = (res: Response, error: unknown) => {
    const status = error instanceof FaceAuthError ? error.status : 401
    if (status === 429) res.set('Retry-After', String(error instanceof FaceAuthError ? error.retryAfter : 300))
    if (!(error instanceof FaceAuthError)) console.warn('Face authentication', { code: 'InternalFailure' })
    res.status(status).json({ message: status === 429 ? 'Too many attempts. Try again later.' : FACE_FAILURE })
  }
  router.post('/face/login', async (req, res, next) => {
    try {
      if (!faces) throw new FaceAuthError()
      await faces.limitIp(req.ip || 'unknown')
      next()
    } catch (error) { faceFailure(res, error) }
  }, json({ limit: '3mb', inflate: false }), async (req, res) => {
    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(req.query).length ||
        Object.keys(body).some(key => !['account', 'image'].includes(key)) ||
        typeof body.account !== 'string' || !body.account.trim() || body.account.length > 50 || !validFaceImage(body.image)) {
      res.status(400).json({ message: 'Invalid face login request' }); return
    }
    try { completeLogin(res, await faces!.verify(body.account.trim(), body.image)) }
    catch (error) { faceFailure(res, error) }
  })
  // Keep all other authentication requests at their original small body limit.
  router.use(json({ limit: '16kb' }))

  for (const action of ['request', 'login'] as const) {
    router.post(`/code/${action}`, async (req, res, next) => {
      const body = req.body ?? {}
      const { account, channel, code } = body
      const allowed = action === 'request' ? ['account', 'channel'] : ['account', 'channel', 'code']
      if (typeof account !== 'string' || !account.trim() || account.length > 50 ||
          !['email', 'sms'].includes(channel) || Object.keys(body).some(key => !allowed.includes(key)) ||
          (action === 'login' && (typeof code !== 'string' || !/^\d{6}$/.test(code)))) {
        res.status(400).json({ message: 'Invalid login request' }); return
      }
      res.set('Cache-Control', 'no-store')
      if (!codes) { res.status(503).json({ message: 'Verification service unavailable' }); return }
      try {
        if (action === 'request') {
          await codes.request(account.trim(), channel, req.ip || 'unknown')
          res.status(202).json({ status: 'accepted', message: 'Request accepted; this does not confirm delivery. If eligible, a code will be sent to the preset contact.' })
        } else {
          completeLogin(res, await codes.verify(account.trim(), channel, code, req.ip || 'unknown'))
        }
      } catch (error) {
        if (error instanceof AuthCodeError) {
          if (error.status === 429) res.set('Retry-After', '60')
          res.status(error.status).json({ message: error.message }); return
        }
        next(error)
      }
    })
  }

  const authenticated = createAuthenticated(users, secret)

  router.post('/login', loginLimiter, async (req, res) => {
    const { account, password } = req.body ?? {}
    if (typeof account !== 'string' || typeof password !== 'string' || !account.trim() || !password || account.length > 50) {
      res.status(400).json({ message: 'Account and password are required' }); return
    }
    const user = await users.byAccount(account.trim())
    if (!user || user.status !== 'active' || !roles.has(user.role)) {
      res.status(401).json({ message: 'Invalid credentials' }); return
    }
    let valid = false
    try { valid = await argon2.verify(user.password_hash, password) } catch { /* Invalid stored hash. */ }
    if (!valid) { res.status(401).json({ message: 'Invalid credentials' }); return }
    completeLogin(res, user)
  })

  router.get('/me', authenticated, (_req, res) => {
    res.json({ user: publicUser(res.locals.user as DbUser) })
  })

  router.post('/logout', authenticated, (_req, res) => {
    res.json({ success: true })
  })

  const bodyErrors: ErrorRequestHandler = (error, _req, res, next) => {
    if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported', 'charset.unsupported'].includes(error?.type)) {
      res.status(error.type === 'entity.too.large' ? 413 : 400).json({ message: 'Invalid authentication request' })
      return
    }
    next(error)
  }
  router.use(bodyErrors)
  return router
}
