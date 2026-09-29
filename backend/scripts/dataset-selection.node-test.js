import assert from 'node:assert/strict'
import test from 'node:test'
import { datasetPath, selectDatasetSources } from './dataset-selection.js'

const catalog = { sources: [{ id: 'guide', category: 'geriatric-clinical-guidance' }, { id: 'patient', category: 'synthetic-patient-records' }] }
test('dataset selectors do not refresh unrelated patient downloads', () => {
  assert.equal(selectDatasetSources(catalog, []).length, 2)
  assert.deepEqual(selectDatasetSources(catalog, ['--clinical']).map(item => item.id), ['guide'])
  assert.deepEqual(selectDatasetSources(catalog, ['--source=patient']).map(item => item.id), ['patient'])
  assert.throws(() => selectDatasetSources(catalog, ['--source=missing']), /Unknown/)
  assert.throws(() => selectDatasetSources(catalog, ['--clinical', '--source=guide']), /combine/)
  assert.throws(() => selectDatasetSources(catalog, ['--unknown']), /Use/)
})
test('dataset paths cannot escape their root', () => {
  assert.match(datasetPath(process.cwd(), 'nhc/guide.pdf'), /guide\.pdf$/)
  assert.throws(() => datasetPath(process.cwd(), '../outside.pdf'), /leaves/)
  assert.throws(() => datasetPath(process.cwd(), process.cwd()), /relative/)
  assert.throws(() => datasetPath(process.cwd(), '.'), /leaves/)
})
