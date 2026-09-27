import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname, normalize } from 'node:path'
import { OfficeConverter, type OfficeChunk } from 'officeparser'
import { createDb } from '../db.js'
import { arkConfig, createArkClient } from './ark.js'
import { parseFhirBundle, type ParsedKnowledgeChunk } from './fhir.js'
import { createKnowledgeRepository, type KnowledgeChunkInput, type KnowledgeDocumentInput } from './repository.js'

type DatasetSource = {
  id: string
  title: string
  publisher: string
  category: string
  sourceUrl: string
  licenseName: string
  licenseUrl: string
  synthetic: boolean
  localPath: string
}

const paths = process.argv.slice(2)
if (!paths.length) {
  console.error('Usage: npm run ingest -- <document.pdf|presentation.pptx|synthea-fhir.json> [...]')
  process.exit(1)
}

const catalog = JSON.parse(await readFile(new URL('../../data/dataset-catalog.json', import.meta.url), 'utf8')) as { sources: DatasetSource[] }
const db = createDb()
const config = arkConfig()
const ark = createArkClient(config)
const repository = createKnowledgeRepository(db.pool)
const embedDelayMs = Math.max(0, Number(process.env.AI_EMBED_DELAY_MS || 1200))
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function sourceFor(path: string, filename: string) {
  const normalized = normalize(path).replaceAll('\\', '/').toLowerCase()
  return catalog.sources.find(source => {
    const local = source.localPath.replaceAll('\\', '/').toLowerCase()
    return local.includes('/') ? normalized.endsWith(local) : normalized.includes(`/${local}/`) || filename.toLowerCase() === local
  })
}

function metadata(source: DatasetSource | undefined): Pick<KnowledgeDocumentInput, 'sourceUrl' | 'publisher' | 'licenseName' | 'licenseUrl' | 'category' | 'synthetic'> {
  return source ? {
    sourceUrl: source.sourceUrl, publisher: source.publisher, licenseName: source.licenseName,
    licenseUrl: source.licenseUrl, category: source.category, synthetic: source.synthetic,
  } : {}
}

function splitLongChunks(chunks: ParsedKnowledgeChunk[], maximum = 1400) {
  return chunks.flatMap(chunk => {
    if (chunk.content.length <= maximum) return [chunk]
    const parts: ParsedKnowledgeChunk[] = []
    for (let start = 0; start < chunk.content.length; start += maximum) {
      parts.push({ ...chunk, heading: `${chunk.heading} (part ${parts.length + 1})`, content: chunk.content.slice(start, start + maximum) })
    }
    return parts
  })
}

async function parseDocument(path: string, extension: string, bytes: Buffer) {
  if (extension === 'json') {
    const parsed = parseFhirBundle(bytes.toString('utf8'))
    return { title: parsed.title, chunks: splitLongChunks(parsed.chunks) }
  }
  const result = await OfficeConverter.convert(path, 'chunks', {
    parseConfig: { ignoreSlideMasters: true, ignoreComments: true },
    generatorConfig: { chunksConfig: { strategy: 'document-structure', splitBy: extension === 'pptx' ? 'slide' : 'page', maxChunkSize: 1400 } },
  })
  const parsed = result.value as OfficeChunk[]
  return {
    title: basename(path).replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, ''),
    chunks: parsed.filter(chunk => chunk.text.trim().length >= 30).map(chunk => ({
      location: chunk.metadata.slideNumber ? `Slide ${chunk.metadata.slideNumber}` : chunk.metadata.pageNumber ? `Page ${chunk.metadata.pageNumber}` : 'Document',
      heading: chunk.metadata.closestHeading || 'Document content', content: chunk.text.trim(),
    })),
  }
}

try {
  for (const path of paths) {
    const filename = basename(path)
    const extension = extname(filename).slice(1).toLowerCase()
    if (!['pdf', 'pptx', 'docx', 'json'].includes(extension)) throw new Error(`Unsupported document type: ${filename}`)
    const bytes = await readFile(path)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const id = `KD-${hash.slice(0, 32)}`
    const source = sourceFor(path, filename)
    console.log(`Parsing ${filename}...`)
    const parsed = await parseDocument(path, extension, bytes)
    if (!parsed.chunks.length) throw new Error('No searchable text was extracted from the document.')
    const title = source?.id === 'cdc-steadi-pocket-guide' ? source.title : parsed.title
    await repository.beginDocument({ id, title, filename, sourceType: extension === 'json' ? 'fhir-r4' : extension, hash, ...metadata(source) })
    try {
      const chunks: KnowledgeChunkInput[] = []
      for (let index = 0; index < parsed.chunks.length; index += 1) {
        const chunk = parsed.chunks[index]!
        console.log(`  Embedding ${index + 1}/${parsed.chunks.length} (${chunk.location})`)
        chunks.push({ index, location: chunk.location, heading: chunk.heading, content: chunk.content, embedding: await ark.embed(chunk.content), model: config.embeddingModel })
        if (embedDelayMs && index < parsed.chunks.length - 1) await wait(embedDelayMs)
      }
      await repository.saveChunks(id, chunks)
      console.log(`Ready: ${filename} (${chunks.length} chunks)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repository.failDocument(id, message)
      throw error
    }
  }
} catch (error) {
  console.error('Knowledge import failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await db.close()
}
