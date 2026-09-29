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
  assert.equal(result.retrievalStrategy, 'source-group')
  assert.equal(result.citations[0]?.sourceId, result.sources[0]?.id)
  assert.ok(result.traceId)
})

test('downgrades generated text without valid source citations', async () => {
  const service = createRagService({ chunks: async () => chunks, embed: async () => [1, 0], answer: async () => 'Unsupported generated claim' })
  const result = await service.ask('What authentication is required?')
  assert.equal(result.answerDecision, 'retrieval-only')
  assert.equal(result.generationMode, 'retrieval-only')
  assert.deepEqual(result.citations, [])
  assert.match(result.answer, /did not contain verifiable citations/)
})

test('downgrades an answer containing an out-of-range citation', async () => {
  const service = createRagService({ chunks: async () => chunks, embed: async () => [1, 0], answer: async () => 'Valid fact [1], invented source [99].' })
  const result = await service.ask('What authentication is required?')
  assert.equal(result.answerDecision, 'retrieval-only')
  assert.deepEqual(result.citations, [])
})

test('returns retrieved evidence when the generation model is rate limited', async () => {
  const service = createRagService({ chunks: async () => chunks, embed: async () => [1, 0], answer: async () => { throw new ArkApiError(429, 'rate_limit', 'limited') } })
  const result = await service.ask('What authentication is required?')
  assert.equal(result.generationMode, 'retrieval-only')
  assert.match(result.answer, /JWT authentication/)
})

test('isolates project, guideline, and one synthetic patient retrieval scope', async () => {
  const scoped = [
    { ...chunks[0]!, id: 'project', category: 'project-documents', content: 'Project RBAC requirement' },
    { ...chunks[0]!, id: 'guide', documentId: 'guide-doc', category: 'geriatric-clinical-guidance', content: 'Fall risk guideline' },
    { ...chunks[0]!, id: 'patient-a', documentId: 'patient-a-doc', category: 'synthetic-patient-records', synthetic: true, content: 'Synthetic patient A condition' },
    { ...chunks[0]!, id: 'patient-b', documentId: 'patient-b-doc', category: 'synthetic-patient-records', synthetic: true, content: 'Synthetic patient B condition' },
  ]
  const contexts: string[] = []
  const service = createRagService({ chunks: async () => scoped, embed: async () => [1, 0], answer: async (_question, context) => { contexts.push(context); return '[1]' } })
  await service.ask({ question: 'requirements', scope: 'project' })
  await service.ask({ question: 'falls', scope: 'clinical-guideline' })
  await service.ask({ question: 'patient condition', scope: 'synthetic-patient', documentId: 'patient-a-doc' })
  assert.match(contexts[0]!, /Project RBAC/)
  assert.doesNotMatch(contexts[0]!, /Fall risk|patient A/)
  assert.match(contexts[1]!, /Fall risk guideline/)
  assert.doesNotMatch(contexts[1]!, /Project RBAC|patient A/)
  assert.match(contexts[2]!, /patient A condition|Fall risk guideline/)
  assert.doesNotMatch(contexts[2]!, /patient B condition|Project RBAC/)
})

test('requires a patient document and abstains from clinical diagnosis or weak evidence', async () => {
  const scoped = [
    { ...chunks[0]!, id: 'guide', documentId: 'guide-doc', category: 'geriatric-clinical-guidance', content: 'Fall risk guideline' },
    { ...chunks[0]!, id: 'patient', documentId: 'patient-doc', category: 'synthetic-patient-records', synthetic: true, content: 'Synthetic medication history' },
  ]
  let generated = false
  const service = createRagService({ chunks: async () => scoped, embed: async () => [0, 1], answer: async () => { generated = true; return 'unsafe' }, minimumScore: 0.5 })
  await assert.rejects(() => service.ask({ question: 'history', scope: 'synthetic-patient' }), /documentId is required/)
  await assert.rejects(() => service.ask({ question: 'history', scope: 'clinical-guideline', documentId: 'patient-doc' }), /only valid for synthetic-patient/)
  const unsafe = await service.ask({ question: 'What exact dose should I prescribe?', scope: 'clinical-guideline' })
  assert.equal(unsafe.answerDecision, 'abstained')
  const weak = await service.ask({ question: 'unrelated evidence', scope: 'clinical-guideline' })
  assert.equal(weak.evidenceStatus, 'insufficient')
  assert.equal(generated, false)
})

test('allows factual synthetic summaries that explicitly avoid diagnosis', async () => {
  const scoped = [{ ...chunks[0]!, documentId: 'patient-doc', category: 'synthetic-patient-records', synthetic: true, content: 'Synthetic medication history' }]
  let generated = false
  const service = createRagService({ chunks: async () => scoped, embed: async () => [1, 0], answer: async () => { generated = true; return 'Factual summary [1]' } })
  const result = await service.ask({ question: 'Summarize the record without making a diagnosis', scope: 'synthetic-patient', documentId: 'patient-doc' })
  assert.equal(result.answerDecision, 'answered')
  assert.equal(generated, true)
})

test('precision strategy keeps scope isolation and uses one query embedding', async () => {
  let embeddings = 0
  const scoped = [
    { ...chunks[0]!, id: 'project', documentId: 'project', category: 'project-documents', content: 'Medication monitoring' },
    { ...chunks[0]!, id: 'target', documentId: 'target', category: 'synthetic-patient-records', synthetic: true, content: 'Recorded medications' },
    { ...chunks[0]!, id: 'other', documentId: 'other', category: 'synthetic-patient-records', synthetic: true, content: 'Recorded medications' },
  ]
  const service = createRagService({ chunks: async () => scoped, embed: async () => { embeddings += 1; return [1, 0] }, answer: async () => 'Recorded facts [1]', retrievalStrategy: 'precision' })
  const result = await service.ask({ question: 'Recorded medications', scope: 'synthetic-patient', documentId: 'target' })
  assert.equal(result.retrievalStrategy, 'precision')
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0]!.documentId, 'target')
  assert.equal(embeddings, 1)
})

test('precision strategy abstains instead of invoking the model for below-floor sources', async () => {
  let generated = false
  const service = createRagService({ chunks: async () => [chunks[0]!], embed: async () => [0, 1], answer: async () => { generated = true; return '[1]' }, retrievalStrategy: 'precision', minimumScore: 0.5 })
  const result = await service.ask('JWT authentication')
  assert.equal(result.answerDecision, 'abstained')
  assert.equal(result.retrievalStrategy, 'precision')
  assert.equal(result.sources.length, 0)
  assert.equal(generated, false)
})
