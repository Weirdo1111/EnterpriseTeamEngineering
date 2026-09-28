import 'dotenv/config'
import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import { startCodeWorker } from './auth/worker.js'
import { createCodeAuth } from './auth/codes.js'
import { createCodeSender } from './auth/delivery.js'
import { createTencentFaceVerifier } from './auth/tencent-face.js'
import { createFaceAuth } from './auth/face.js'
import { createFaceLimits } from './auth/face-limits.js'
import { createDb } from './db.js'
import { createAuthRouter } from './routes/auth.js'

async function main() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters in backend/.env')
  const sender = createCodeSender()
  const codeSecret = process.env.AUTH_CODE_SECRET
  if (!codeSecret || codeSecret.length < 32) throw new Error('AUTH_CODE_SECRET must contain at least 32 characters')
  const db = createDb()
  try {
    await db.check()
    const app = express()
    app.disable('x-powered-by')
    app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }))
    const codes = createCodeAuth(db.pool, sender, codeSecret)
    const faces = createFaceAuth(db, createTencentFaceVerifier(), createFaceLimits(db.pool, codeSecret))
    app.use('/api/auth', createAuthRouter(db, secret, codes, faces))
    const errors: ErrorRequestHandler = (_error, _req, res, _next) => {
      res.status(500).json({ message: 'Internal server error' })
    }
    app.use(errors)
    const port = Number(process.env.PORT || 3000)
    const server = app.listen(port, '127.0.0.1', () => console.log(`Backend listening on http://127.0.0.1:${port}`))
    const stopWorker = startCodeWorker(codes)
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => server.close(() => { void stopWorker().then(() => db.close()) }))
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
