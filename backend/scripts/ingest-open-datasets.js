import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
const datasetDirectory = join(backendDirectory, 'data/open-datasets')
const syntheaDirectory = join(datasetDirectory, 'synthea')
const syntheticRecords = (await readdir(syntheaDirectory))
  .filter(filename => filename.endsWith('.json')).sort().map(filename => join(syntheaDirectory, filename))
const documents = [join(datasetDirectory, 'cdc/steadi-falls-pocket-guide.pdf'), ...syntheticRecords]
const result = spawnSync(process.execPath, [join(backendDirectory, 'dist/rag/ingest.js'), ...documents], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
