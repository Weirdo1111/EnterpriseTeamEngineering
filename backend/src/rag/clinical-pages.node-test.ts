import assert from 'node:assert/strict'
import test from 'node:test'
import { clinicalPageChunks } from './clinical-pages.js'

test('clinical pages retain short headings and bullets with their physical page', () => {
  const chunks = clinicalPageChunks([
    { text: 'Follow-up', metadata: { pageNumber: 2 } },
    { text: 'A paragraph. '.repeat(95), metadata: { pageNumber: 2 } },
    { text: 'Review', metadata: { pageNumber: 1, closestHeading: 'Assessment' } },
    { text: 'Another paragraph. '.repeat(65), metadata: { pageNumber: 1 } },
  ])
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0]?.location, 'Page 1')
  assert.match(chunks[0]!.content, /^Review\n/)
  assert.match(chunks[1]!.content, /^Follow-up\n/)
})

test('clinical page chunks are bounded without dropping text or mixing pages', () => {
  const text = 'A longer evidence paragraph. '.repeat(100)
  const chunks = clinicalPageChunks([{ text, metadata: { pageNumber: 4 } }], 300)
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every(chunk => chunk.content.length <= 300 && chunk.location === 'Page 4'))
  assert.equal(chunks.map(chunk => chunk.content).join(' ').replace(/\s+/g, ' ').trim(), text.trim())
})

test('sparse scan extraction and missing page provenance are rejected', () => {
  assert.throws(() => clinicalPageChunks([{ text: 'Only a scanned chart label.', metadata: { pageNumber: 1 } }]), /Insufficient/)
  assert.throws(() => clinicalPageChunks([{ text: 'An actual paragraph. '.repeat(100), metadata: {} }]), /page provenance/)
  assert.throws(() => clinicalPageChunks([], 0), /chunk size/)
})
