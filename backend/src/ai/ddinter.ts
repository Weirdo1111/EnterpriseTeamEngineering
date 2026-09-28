import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type DdiPair = { severity: 'Major' | 'Moderate' | 'Minor' | 'Unknown'; mechanism: string | null; drugA: string; drugB: string }
export type DdiIndex = {
  source: string
  resolve: (name: string) => string | null
  pair: (firstId: string, secondId: string) => DdiPair | null
}

type Document = {
  schemaVersion: number
  source: { name: string; url: string; terms: string }
  drugs: { id: string; name: string; rxnormName: string | null }[]
  mechanisms: Record<string, string | null>
  interactions: [string, string, string, string][]
}

const normalize = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
const key = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`

export function createDdiIndex(value: unknown): DdiIndex {
  const data = value as Document
  if (!data || data.schemaVersion !== 1 || data.source?.name !== 'DDInter 2.0' || !Array.isArray(data.drugs) || !Array.isArray(data.interactions) || !data.mechanisms ||
    data.drugs.length > 10000 || data.interactions.length > 1000000) throw new Error('Invalid DDInter index')
  const names = new Map<string, string | null>()
  const drugs = new Map<string, string>()
  for (const drug of data.drugs) {
    if (typeof drug.id !== 'string' || typeof drug.name !== 'string' || !drug.name.trim() || drugs.has(drug.id)) throw new Error('Invalid DDInter drug')
    drugs.set(drug.id, drug.name)
    for (const name of [drug.name, drug.rxnormName]) {
      if (!name) continue
      const alias = normalize(name)
      if (!names.has(alias)) names.set(alias, drug.id)
      else if (names.get(alias) !== drug.id) names.set(alias, null)
    }
  }
  const pairs = new Map<string, DdiPair>()
  for (const row of data.interactions) {
    if (!Array.isArray(row) || row.length !== 4 || !drugs.has(row[0]) || !drugs.has(row[1]) || !['Major', 'Moderate', 'Minor', 'Unknown'].includes(row[2])) throw new Error('Invalid DDInter interaction')
    pairs.set(key(row[0], row[1]), { severity: row[2] as DdiPair['severity'], mechanism: data.mechanisms[row[3]] || null, drugA: drugs.get(row[0])!, drugB: drugs.get(row[1])! })
  }
  return { source: `${data.source.name} (non-commercial educational data)`, resolve: name => names.get(normalize(name)) || null, pair: (a, b) => pairs.get(key(a, b)) || null }
}

export function loadDdiIndex(path = process.env.DDINTER_KNOWLEDGE_PATH || fileURLToPath(new URL('../../data/ddinter/interactions.json', import.meta.url))): DdiIndex | null {
  try { return createDdiIndex(JSON.parse(readFileSync(path, 'utf8'))) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !process.env.DDINTER_KNOWLEDGE_PATH) return null
    throw error
  }
}
