import assert from 'node:assert/strict'
import test from 'node:test'
import { cosineSimilarity, createRagService, rankChunks, rankSourceGroups } from './service.js'
import { ArkApiError } from './ark.js'

const chunks = [
  { id: '1', documentId: 'd1', title: 'Architecture', filename: 'a.pptx', content: 'JWT authentication', embedding: [1, 0] },
  { id: '2', documentId: 'd2', title: 'Requirements', filename: 'b.pdf', location: 'Page 3', content: 'Patient management', embedding: [0, 1] },
]

test('computes cosine similarity and ranks the closest source', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1)
  assert.equal(rankChunks(chunks, [0.9, 0.1])[0]?.chunk.id, '1')
})

test('groups fragments from the same source location into one result', () => {
  const fragmented = [
    { ...chunks[0]!, id: '1a', location: 'Slide 2', index: 1, content: 'JWT authentication' },
    { ...chunks[0]!, id: '1b', location: 'Slide 2', index: 2, content: 'RBAC authorization' },
    chunks[1]!,
  ]
  const ranked = rankSourceGroups(fragmented, [1, 0], 5, 'authentication authorization')
  assert.equal(ranked.length, 2)
  assert.match(ranked[0]!.chunk.content, /JWT authentication\nRBAC authorization/)
})

test('uses source metadata in hybrid lexical ranking', () => {
  const records = [
    { ...chunks[0]!, id: 'older', title: 'Synthetic clinical record age 95', content: 'Recorded medications', embedding: [1, 0] },
    { ...chunks[0]!, id: 'younger', title: 'Synthetic clinical record age 65', content: 'Recorded medications', embedding: [1, 0] },
  ]
  assert.equal(rankSourceGroups(records, [1, 0], 2, 'medications for age 95')[0]?.chunk.id, 'older')
})

test('returns generated text with traceable sources', async () => {
  const service = createRagService({ chunks: async () => chunks, embed: async () => [0, 1], answer: async (_question, context) => `Based on ${context.includes('Patient management') ? '[1]' : 'missing'}` })
  const result = await service.ask('What is required for patients?')
  assert.equal(result.answer, 'Based on [1]')
  assert.equal(result.sources[0]?.location, 'Page 3')
  assert.equal(result.generationMode, 'generated')
})

test('returns retrieved evidence when the generation model is rate limited', async () => {
  const service = createRagService({ chunks: async () => chunks, embed: async () => [1, 0], answer: async () => { throw new ArkApiError(429, 'rate_limit', 'limited') } })
  const result = await service.ask('What authentication is required?')
  assert.equal(result.generationMode, 'retrieval-only')
  assert.match(result.answer, /JWT authentication/)
})
