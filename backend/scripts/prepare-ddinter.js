import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const commit = '7e2bd2c245bd33550ca1b14951d6955767026775'
const expectedHash = 'b55f8b147a11a6b394f669f3d007253d595f9016005e42f92a689f249e4f1b2a'
const url = `https://raw.githubusercontent.com/pbiondich/openmrs-ddi-knowledge-base/${commit}/out/ddi_knowledge_base.json`
const destination = resolve('data/ddinter/interactions.json')

const source = process.argv[2] ? await readFile(resolve(process.argv[2])) : Buffer.from(await (async () => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`DDInter download failed: HTTP ${response.status}`)
  return response.arrayBuffer()
})())
const hash = createHash('sha256').update(source).digest('hex')
if (hash !== expectedHash) throw new Error(`DDInter source checksum mismatch: ${hash}`)

const data = JSON.parse(source.toString('utf8'))
if (data.metadata?.source?.name !== 'DDInter 2.0' || !Array.isArray(data.drugs) || !Array.isArray(data.interactions) || !data.mechanisms) {
  throw new Error('Unexpected DDInter source format')
}
const compact = {
  schemaVersion: 1,
  source: { name: 'DDInter 2.0', url: 'https://ddinter2.scbdd.com/', terms: 'https://ddinter.scbdd.com/terms/', upstreamCommit: commit, sourceSha256: hash },
  drugs: data.drugs.map(({ id, name, rxnorm_name }) => ({ id, name, rxnormName: rxnorm_name || null })),
  mechanisms: Object.fromEntries(Object.entries(data.mechanisms).map(([id, mechanism]) => [id, mechanism?.text || null])),
  interactions: data.interactions,
}
await mkdir(dirname(destination), { recursive: true })
await writeFile(destination, JSON.stringify(compact))
console.log(`Prepared ${compact.drugs.length} drugs and ${compact.interactions.length} DDInter pairs at ${destination}`)
