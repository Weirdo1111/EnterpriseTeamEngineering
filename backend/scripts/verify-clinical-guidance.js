import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createDb } from '../dist/db.js'
import { arkConfig, createArkClient } from '../dist/rag/ark.js'
import { createKnowledgeRepository } from '../dist/rag/repository.js'
import { filterChunksForScope, rankSourceGroups } from '../dist/rag/service.js'
import { relatedGuidance } from '../dist/ai/similar.js'

const catalog = JSON.parse(await readFile(new URL('../data/dataset-catalog.json', import.meta.url), 'utf8'))
const cases = [
  { id: 'nhc-hypertension-diet-2023', query: '\u9ad8\u8840\u538b\u60a3\u8005\u7684\u81b3\u98df\u6307\u5bfc\u548c\u8840\u538b\u81ea\u6211\u7ba1\u7406' },
  { id: 'nhc-diabetes-diet-2023', query: '\u7cd6\u5c3f\u75c5\u60a3\u8005\u7684\u81b3\u98df\u6307\u5bfc\u548c\u8840\u7cd6\u81ea\u6211\u7ba1\u7406' },
  { id: 'nhc-copd-health-services-2024', query: '\u6162\u6027\u963b\u585e\u6027\u80ba\u75be\u75c5\u60a3\u8005\u7684\u968f\u8bbf\u8bb0\u5f55\u548c\u5065\u5eb7\u670d\u52a1' },
  { id: 'who-hypertension-2021', query: 'What follow-up intervals does the WHO hypertension guideline discuss?' },
  { id: 'who-icope-second-edition', query: 'How does ICOPE describe person-centred assessment and care planning for declining intrinsic capacity?' },
]
const db = createDb()
const report = { ranAt: new Date().toISOString(), kind: 'Topic smoke test; not a clinical accuracy benchmark', cases: [] }
try {
  await db.check()
  const all = await createKnowledgeRepository(db.pool).readyChunks()
  const guidelines = filterChunksForScope(all, 'clinical-guideline')
  const ark = createArkClient(arkConfig())
  for (const test of cases) {
    const source = catalog.sources.find(source => source.id === test.id)
    assert.ok(source, `Missing catalog entry: ${test.id}`)
    assert.ok(guidelines.some(chunk => chunk.title === source.title), `Guideline not ready: ${test.id}`)
    const started = Date.now()
    const vector = await ark.embed(test.query)
    const ranked = rankSourceGroups(guidelines, vector, 5, test.query)
    const related = relatedGuidance(all, test.query, vector)
    const found = ranked.some(item => item.chunk.title === source.title && item.score >= 0.15)
    const relatedFound = related.some(item => item.title === source.title)
    const entry = { id: test.id, query: test.query, foundInTop5: found, foundInRelatedGuidance: relatedFound, durationMs: Date.now() - started,
      sources: ranked.map(({ chunk, score }) => ({ title: chunk.title, location: chunk.location, sourceUrl: chunk.sourceUrl, score })), related: related.map(item => item.title) }
    report.cases.push(entry)
    console.log(JSON.stringify(entry))
    assert.ok(found, `Expected guideline missing from top five: ${test.id}`)
    assert.ok(relatedFound, `Expected guideline missing from related guidance: ${test.id}`)
    assert.ok(ranked.every(item => item.chunk.category === 'geriatric-clinical-guidance' && !item.chunk.synthetic && item.chunk.sourceUrl), 'Guidance scope/provenance violation')
  }
  console.log(`Passed ${report.cases.length} new-topic smoke tests.`)
} finally {
  await writeFile(new URL('../data/open-datasets/clinical-guidance-smoke.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`)
  await db.close()
}
