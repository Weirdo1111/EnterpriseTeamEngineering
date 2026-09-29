import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { createKnowledgeRepository, type KnowledgeDocumentInput } from './repository.js'

const document: KnowledgeDocumentInput = { id: 'guide', title: 'Guideline', filename: 'guide.pdf', sourceType: 'pdf', hash: 'hash' }

function fixture(count: number | string) {
  const state = { committed: false, rolledBack: false, released: false, writes: [] as string[] }
  const connection = {
    async beginTransaction() {},
    async execute(sql: string) {
      if (sql.startsWith('SELECT COUNT')) return [[{ count }]]
      if (sql.startsWith('SELECT total_chunks')) return [[{ total_chunks: 9 }]]
      state.writes.push(sql)
      return [{ affectedRows: 1 }]
    },
    async commit() { state.committed = true },
    async rollback() { state.rolledBack = true },
    release() { state.released = true },
  }
  const pool = { async getConnection() { return connection } } as unknown as Pool
  return { repository: createKnowledgeRepository(pool), state }
}

test('completed ingestion accepts both numeric and big-number string COUNT results', async () => {
  for (const count of [9, '9']) {
    const { repository, state } = fixture(count)
    await repository.completeIngestion('job', document)
    assert.equal(state.committed, true)
    assert.equal(state.rolledBack, false)
    assert.equal(state.released, true)
    assert.ok(state.writes.some(sql => sql.startsWith('INSERT INTO knowledge_chunks')))
  }
})

test('incomplete or invalid counts roll back before modifying ready documents', async () => {
  for (const count of ['8', '-1', 'NaN', '9007199254740993']) {
    const { repository, state } = fixture(count)
    await assert.rejects(repository.completeIngestion('job', document), /checkpoint/)
    assert.equal(state.committed, false)
    assert.equal(state.rolledBack, true)
    assert.equal(state.released, true)
    assert.deepEqual(state.writes, [])
  }
})
