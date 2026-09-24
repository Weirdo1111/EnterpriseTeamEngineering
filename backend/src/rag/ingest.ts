import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { OfficeConverter, type OfficeChunk } from 'officeparser'
import { createDb } from '../db.js'
import { arkConfig, createArkClient } from './ark.js'
import { createKnowledgeRepository, type KnowledgeChunkInput } from './repository.js'

const paths = process.argv.slice(2)
if (!paths.length) {
  console.error('Usage: npm run ingest -- <document.pdf|presentation.pptx> [...]')
  process.exit(1)
}

const db = createDb()
const config = arkConfig()
const ark = createArkClient(config)
const repository = createKnowledgeRepository(db.pool)

try {
  for (const path of paths) {
    const filename = basename(path)
    const extension = extname(filename).slice(1).toLowerCase()
    if (!['pdf', 'pptx', 'docx'].includes(extension)) throw new Error(`Unsupported document type: ${filename}`)
    const bytes = await readFile(path)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const id = `KD-${hash.slice(0, 32)}`
    const title = filename.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '')
    await repository.beginDocument({ id, title, filename, sourceType: extension, hash })
    console.log(`Parsing ${filename}...`)
    try {
      const result = await OfficeConverter.convert(path, 'chunks', {
        parseConfig: { ignoreSlideMasters: true, ignoreComments: true },
        generatorConfig: { chunksConfig: { strategy: 'document-structure', splitBy: extension === 'pptx' ? 'slide' : 'page', maxChunkSize: 1400 } },
      })
      const parsed = result.value as OfficeChunk[]
      const usable = parsed.filter(chunk => chunk.text.trim().length >= 30)
      if (!usable.length) throw new Error('No searchable text was extracted from the document.')
      const chunks: KnowledgeChunkInput[] = []
      for (let index = 0; index < usable.length; index += 1) {
        const chunk = usable[index]!
        const location = chunk.metadata.slideNumber ? `Slide ${chunk.metadata.slideNumber}` : chunk.metadata.pageNumber ? `Page ${chunk.metadata.pageNumber}` : undefined
        console.log(`  Embedding ${index + 1}/${usable.length}${location ? ` (${location})` : ''}`)
        chunks.push({ index, location, heading: chunk.metadata.closestHeading, content: chunk.text.trim(), embedding: await ark.embed(chunk.text.trim()), model: config.embeddingModel })
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
} finally { await db.close() }
