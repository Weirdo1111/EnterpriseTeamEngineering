import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Pool } from 'mysql2/promise'
import type { DbUser, UserLookup } from '../db.js'
import { createAuthenticated } from './auth.js'
import { RecordServiceError, createRecordService } from '../records/service.js'

type Service = ReturnType<typeof createRecordService>

export function createRecordsRouter(users: UserLookup, secret: string, service: Service, pool: Pool) {
  const router = Router()
  router.use(createAuthenticated(users, secret))

  async function audit(req: Request, user: DbUser, action: string, resourceId: string, result: 'Success' | 'Blocked' | 'Pending Review', details?: object) {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, role, action, resource_type, resource_id, result, ip_address, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.name, user.role, action, 'medical_record', resourceId, result, req.ip || null, details ? JSON.stringify(details) : null],
    )
  }

  function user(res: Response) { return res.locals.user as DbUser }
  const body = (req: Request) => req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  const context = (req: Request) => ({ ipAddress: req.ip || undefined })

  router.get('/', async (_req, res) => { res.json({ records: await service.list(user(res)) }) })
  router.get('/:id', async (req, res) => { res.json({ record: await service.getById(req.params.id!, user(res)) }) })

  router.post('/', async (req, res) => {
    const current = user(res)
    const record = await service.create(body(req), current, context(req))
    res.status(201).json({ record })
  })

  router.patch('/:id', async (req, res) => {
    const current = user(res)
    const record = await service.update(req.params.id!, body(req), current, context(req))
    res.json({ record })
  })

  router.post('/:id/submit', async (req, res) => {
    const current = user(res)
    const record = await service.submit(req.params.id!, body(req), current, context(req))
    res.json({ record })
  })

  router.post('/:id/orders', async (req, res) => {
    const current = user(res)
    const record = await service.addOrder(req.params.id!, body(req), current, context(req))
    res.status(201).json({ record })
  })

  router.patch('/:id/orders/:orderId', async (req, res) => {
    const current = user(res)
    const record = await service.updateOrder(req.params.id!, req.params.orderId!, body(req), current, context(req))
    res.json({ record })
  })

  router.post('/:id/orders/:orderId/stop', async (req, res) => {
    const current = user(res)
    const record = await service.stopOrder(req.params.id!, req.params.orderId!, body(req), current, context(req))
    res.json({ record })
  })

  router.post('/:id/reviews', async (req, res) => {
    const current = user(res)
    const record = await service.review(req.params.id!, body(req), current, context(req))
    res.json({ record })
  })

  const errors = async (error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (!(error instanceof RecordServiceError)) { next(error); return }
    const current = res.locals.user as DbUser | undefined
    if (current && req.params.id) {
      try { await audit(req, current, 'Rejected medical record operation', String(req.params.id), 'Blocked', { reason: error.message }) }
      catch { /* Preserve the original domain error if audit persistence fails. */ }
    }
    res.status(error.status).json({ message: error.message })
  }
  router.use(errors)
  return router
}
