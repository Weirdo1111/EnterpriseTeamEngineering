import assert from 'node:assert/strict'
import test from 'node:test'
import { createDdiIndex } from './ddinter.js'

const fixture = {
  schemaVersion: 1,
  source: { name: 'DDInter 2.0', url: 'https://example.test', terms: 'https://example.test/terms' },
  drugs: [
    { id: 'D1', name: 'Drug A', rxnormName: 'A generic' },
    { id: 'D2', name: 'Drug B', rxnormName: null },
  ],
  mechanisms: { '1': 'Test mechanism' },
  interactions: [['D1', 'D2', 'Major', '1']],
}

test('resolves generic names and looks up interactions in either direction', () => {
  const index = createDdiIndex(fixture)
  assert.equal(index.resolve('  A GENERIC  '), 'D1')
  assert.equal(index.pair('D2', 'D1')?.severity, 'Major')
  assert.equal(index.pair('D1', 'D2')?.mechanism, 'Test mechanism')
  assert.equal(index.resolve('unknown'), null)
})

test('ambiguous names are not guessed and malformed rows fail closed', () => {
  const index = createDdiIndex({ ...fixture, drugs: [...fixture.drugs, { id: 'D3', name: 'A generic', rxnormName: null }] })
  assert.equal(index.resolve('A generic'), null)
  assert.throws(() => createDdiIndex({ ...fixture, interactions: [['D1', 'missing', 'Major', '1']] }), /Invalid DDInter interaction/)
})
