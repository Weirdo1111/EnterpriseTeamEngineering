import 'dotenv/config'
import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import { createDb } from './db.js'
import { createAuthRouter } from './routes/auth.js'

async function main() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters in backend/.env')
  const db = createDb()
  try {
    await db.check()
    const app = express()
    app.disable('x-powered-by')
    app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }))
    app.use(express.json({ limit: '16kb' }))
    app.use('/api/auth', createAuthRouter(db, secret))
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
