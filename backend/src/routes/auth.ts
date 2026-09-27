import { Router, type Request, type Response, type NextFunction } from 'express'
import argon2 from 'argon2'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import { AuthCodeError, type CodeAuth } from '../auth/codes.js'
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

export function createAuthRouter(users: UserLookup, secret: string, codes?: CodeAuth) {
  const router = Router()
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

  function completeLogin(res: Response, user: DbUser) {
    const token = jwt.sign({}, secret, { algorithm: 'HS256', subject: String(user.id), expiresIn: '2h' })
    res.json({ token, user: publicUser(user) })
  }

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

  async function authenticated(req: Request, res: Response, next: NextFunction) {
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

  router.post('/login', async (req, res) => {
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

  return router
}
