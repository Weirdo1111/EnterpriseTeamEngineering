import type { ParsedKnowledgeChunk } from './fhir.js'

type PdfBlock = { text: string; metadata: { pageNumber?: number; closestHeading?: string } }

export function clinicalPageChunks(blocks: PdfBlock[], maximum = 3200): ParsedKnowledgeChunk[] {
  if (!Number.isInteger(maximum) || maximum < 100) throw new Error('Invalid clinical chunk size.')
  const pages = new Map<number, { text: string[]; heading: string }>()
  for (const block of blocks) {
    if (!block.text.trim()) continue
    const page = block.metadata.pageNumber
    if (!page || page < 1 || !Number.isInteger(page)) throw new Error('Clinical PDF text requires page provenance.')
    const group = pages.get(page) ?? { text: [], heading: block.metadata.closestHeading || 'Clinical guidance' }
    group.text.push(block.text.trim())
    pages.set(page, group)
  }
  // Scanned attachments can expose only a small chart while omitting the actual guideline.
  if ([...pages.values()].reduce((sum, page) => sum + page.text.join('\n').length, 0) < 1000) {
    throw new Error('Insufficient clinical PDF text; obtain a text edition or validated OCR before ingestion.')
  }
  const result: ParsedKnowledgeChunk[] = []
  for (const [page, group] of [...pages].sort(([left], [right]) => left - right)) {
    let remaining = group.text.join('\n')
    let part = 0
    while (remaining) {
      let boundary = Math.min(maximum, remaining.length)
      if (remaining.length > maximum) {
        const separator = Math.max(remaining.lastIndexOf('\n', maximum), remaining.lastIndexOf(' ', maximum))
        if (separator >= maximum / 2) boundary = separator
      }
      result.push({ location: `Page ${page}`, heading: `${group.heading} (part ${++part})`, content: remaining.slice(0, boundary).trim() })
      remaining = remaining.slice(boundary).trim()
    }
  }
  return result
}
