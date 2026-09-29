import 'dotenv/config'
import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createDb } from './db.js'
import { createAuthRouter } from './routes/auth.js'
import { createRecordRepository } from './records/repository.js'
import { createRecordService } from './records/service.js'
import { createRecordsRouter } from './routes/records.js'
import { createAiRouter } from './routes/ai.js'
import { loadMedicationCatalog } from './ai/medication-safety.js'
import { loadDdiIndex } from './ai/ddinter.js'
import { arkConfig, createArkClient } from './rag/ark.js'
import { createKnowledgeRepository } from './rag/repository.js'
import { createRagService } from './rag/service.js'
import { retrievalStrategy } from './rag/precision-retrieval.js'
import { createRagRouter } from './routes/rag.js'

async function main() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters in backend/.env')
  const db = createDb()
  try {
    await db.check()
    const app = express()
    app.disable('x-powered-by')
    app.use(helmet())
    app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }))
    app.use(express.json({ limit: '16kb' }))
    app.use('/api/auth', createAuthRouter(db, secret))
    app.use('/api/records', createRecordsRouter(db, secret, createRecordService(createRecordRepository(db.pool)), db.pool))
    const knowledge = createKnowledgeRepository(db.pool)
    const ark = createArkClient(arkConfig())
    app.use('/api/ai', createAiRouter(db, secret, db.pool, { chunks: knowledge.readyChunks, embed: ark.embed }, loadMedicationCatalog(), ark.extractClinicalNarrative, loadDdiIndex()))
    app.use('/api/rag', createRagRouter(db, secret, createRagService({ chunks: knowledge.readyChunks, embed: ark.embed, answer: ark.answer, retrievalStrategy: retrievalStrategy() }), knowledge, db.pool))
    const errors: ErrorRequestHandler = (_error, _req, res, _next) => {
      res.status(500).json({ message: 'Internal server error' })
    }
    app.use(errors)
    const port = Number(process.env.PORT || 3000)
    const server = app.listen(port, '127.0.0.1', () => console.log(`Backend listening on http://127.0.0.1:${port}`))
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => server.close(() => { void db.close() }))
    }
  } catch (error) {
    await db.close()
    throw error
  }
}

main().catch((error: unknown) => {
  console.error('Backend startup failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
