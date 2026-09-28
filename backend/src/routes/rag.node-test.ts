import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import type { Pool } from 'mysql2/promise'
import type { DbUser } from '../db.js'
import type { RagQuery, RagResult } from '../rag/service.js'
import { createRagRouter } from './rag.js'

const secret = 'test-only-secret-at-least-32-characters-long'
const doctor: DbUser = { id: '1', username: 'doctor.demo', password_hash: 'hash', name: 'Doctor', role: 'doctor', status: 'active' }
const admin: DbUser = { ...doctor, id: '2', username: 'admin.demo', role: 'admin' }

function token(user: DbUser) { return jwt.sign({}, secret, { subject: user.id, algorithm: 'HS256' }) }

test('RAG route forwards scope and document ID and exposes ingestion status', async () => {
  let received: RagQuery | undefined
  const result: RagResult = {
    traceId: 'trace-1', generatedAt: '2026-09-27T00:00:00.000Z', citations: [],
    answer: 'Synthetic facts [1]', sources: [], generationMode: 'generated', scope: 'synthetic-patient',
    answerDecision: 'answered', evidenceStatus: 'sufficient', clinicianReviewRequired: true,
  }
  const service = { async ask(query: RagQuery) { received = query; return result } }
  const repository = { async listDocuments() { return [] }, async listIngestionJobs() { return [{ id: 'KI-1', status: 'ready' }] } }
  const pool = { execute: async () => [{ affectedRows: 1 }] } as unknown as Pool
  const users = { byAccount: async () => null, byId: async (id: string) => id === admin.id ? admin : doctor }
  const app = express(); app.use(express.json()); app.use('/api/rag', createRagRouter(users, secret, service, repository, pool))
  const response = await request(app).post('/api/rag/query').set('Authorization', `Bearer ${token(doctor)}`)
    .send({ question: 'Summarize conditions', scope: 'synthetic-patient', documentId: 'KD-PATIENT' })
  assert.equal(response.status, 200)
  assert.deepEqual(received, { question: 'Summarize conditions', scope: 'synthetic-patient', documentId: 'KD-PATIENT' })
  const jobs = await request(app).get('/api/rag/ingestion-jobs').set('Authorization', `Bearer ${token(doctor)}`)
  assert.equal(jobs.body.jobs[0].status, 'ready')
  assert.equal((await request(app).post('/api/rag/query').set('Authorization', `Bearer ${token(admin)}`).send({ question: 'test' })).status, 403)
})
