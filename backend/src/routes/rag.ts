import { Router } from 'express'
import type { Pool } from 'mysql2/promise'
import type { DbUser, UserLookup } from '../db.js'
import { ArkApiError } from '../rag/ark.js'
import type { RagQuery, RagResult } from '../rag/service.js'
import { createAuthenticated } from './auth.js'

type RagService = { ask(query: RagQuery): Promise<RagResult> }
type KnowledgeRepository = { listDocuments(): Promise<unknown[]>; listIngestionJobs(): Promise<unknown[]> }

export function createRagRouter(users: UserLookup, secret: string, service: RagService, repository: KnowledgeRepository, pool: Pool) {
  const router = Router()
  router.use(createAuthenticated(users, secret))

  router.get('/documents', async (_req, res) => { res.json({ documents: await repository.listDocuments() }) })
  router.get('/ingestion-jobs', async (_req, res) => { res.json({ jobs: await repository.listIngestionJobs() }) })
  router.post('/query', async (req, res) => {
    const user = res.locals.user as DbUser
    if (!['doctor', 'seniorDoctor'].includes(user.role)) {
      res.status(403).json({ message: 'Administrators cannot generate clinical or project guidance.' }); return
    }
    const question = typeof req.body?.question === 'string' ? req.body.question : ''
    const scope = typeof req.body?.scope === 'string' ? req.body.scope : undefined
    const documentId = typeof req.body?.documentId === 'string' ? req.body.documentId : undefined
    try {
      const result = await service.ask({ question, scope: scope as RagQuery['scope'], documentId })
      await pool.execute(
        'INSERT INTO audit_logs (user_id, user_name, role, action, resource_type, resource_id, result, ip_address, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.name, user.role, 'Queried RAG knowledge base', 'knowledge_base', documentId || result.scope, 'Pending Review', req.ip || null, JSON.stringify({ traceId: result.traceId, questionLength: question.length, scope: result.scope, retrievalStrategy: result.retrievalStrategy, answerDecision: result.answerDecision, citationSourceIds: result.citations.map(citation => citation.sourceId), sourceIds: result.sources.map(source => source.id) })],
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
