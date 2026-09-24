import { Router } from 'express'
import type { Pool } from 'mysql2/promise'
import type { DbUser, UserLookup } from '../db.js'
import { ArkApiError } from '../rag/ark.js'
import { createAuthenticated } from './auth.js'

type RagService = { ask(question: string): Promise<{ answer: string; sources: unknown[]; generationMode: 'generated' | 'retrieval-only' }> }
type KnowledgeRepository = { listDocuments(): Promise<unknown[]> }

export function createRagRouter(users: UserLookup, secret: string, service: RagService, repository: KnowledgeRepository, pool: Pool) {
  const router = Router()
  router.use(createAuthenticated(users, secret))

  router.get('/documents', async (_req, res) => { res.json({ documents: await repository.listDocuments() }) })
  router.post('/query', async (req, res) => {
    const user = res.locals.user as DbUser
    if (!['doctor', 'seniorDoctor'].includes(user.role)) {
      res.status(403).json({ message: 'Administrators cannot generate clinical or project guidance.' }); return
    }
    const question = typeof req.body?.question === 'string' ? req.body.question : ''
    try {
      const result = await service.ask(question)
      await pool.execute(
        'INSERT INTO audit_logs (user_id, user_name, role, action, resource_type, resource_id, result, ip_address, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.name, user.role, 'Queried RAG knowledge base', 'knowledge_base', 'default', 'Pending Review', req.ip || null, JSON.stringify({ questionLength: question.length, sourceIds: result.sources.map(source => (source as { id: string }).id) })],
      )
      res.json(result)
    } catch (error) {
      if (error instanceof ArkApiError) {
        res.status(502).json({ message: error.status === 429 ? 'The AI model is temporarily rate limited. Retry shortly.' : `AI provider error: ${error.code}` }); return
      }
      const message = error instanceof Error ? error.message : 'Unable to query the knowledge base.'
      res.status(message.includes('empty') ? 409 : 400).json({ message })
    }
  })
  return router
}
