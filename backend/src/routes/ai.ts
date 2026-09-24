import { Router } from 'express'
import type { Pool } from 'mysql2/promise'
import type { DbUser, UserLookup } from '../db.js'
import { generateClinicalDraft } from '../ai/service.js'
import { createAuthenticated } from './auth.js'

export function createAiRouter(users: UserLookup, secret: string, pool: Pool) {
  const router = Router()
  router.use(createAuthenticated(users, secret))
  router.post('/record-draft', async (req, res) => {
    const user = res.locals.user as DbUser
    if (!['doctor', 'seniorDoctor'].includes(user.role)) {
      res.status(403).json({ message: 'Administrators cannot generate clinical content.' }); return
    }
    try {
      const suggestion = generateClinicalDraft(req.body && typeof req.body === 'object' ? req.body : {})
      const patientId = suggestion.sourceIds[0]!
      await pool.execute(
        'INSERT INTO audit_logs (user_id, user_name, role, action, resource_type, resource_id, result, ip_address, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.name, user.role, 'Generated AI medical record draft', 'patient', patientId, 'Pending Review', req.ip || null, JSON.stringify({ generator: suggestion.generator, sourceIds: suggestion.sourceIds })],
      )
      res.json({ suggestion })
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unable to generate the clinical draft.' })
    }
  })
  return router
}
