import { spawnSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { datasetPath, selectDatasetSources } from './dataset-selection.js'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
const datasetDirectory = join(backendDirectory, 'data/open-datasets')
const catalog = JSON.parse(await readFile(join(backendDirectory, 'data/dataset-catalog.json'), 'utf8'))
const documents = []
for (const source of selectDatasetSources(catalog, process.argv.slice(2))) {
  const path = datasetPath(datasetDirectory, source.localPath)
  if (source.localPath.endsWith('.pdf')) documents.push(path)
  else if (source.id === 'synthea-older-adults') {
    documents.push(...(await readdir(path)).filter(filename => filename.endsWith('.json')).sort().map(filename => datasetPath(path, filename)))
  }
}
const result = spawnSync(process.execPath, [join(backendDirectory, 'dist/rag/ingest.js'), ...documents], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
