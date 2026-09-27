import type { Pool, RowDataPacket } from 'mysql2/promise'

export type KnowledgeChunkInput = {
  index: number
  location?: string
  heading?: string
  content: string
  embedding: number[]
  model: string
}

export type StoredKnowledgeChunk = {
  id: string
  index?: number
  documentId: string
  title: string
  filename: string
  sourceUrl?: string
  publisher?: string
  licenseName?: string
  synthetic?: boolean
  location?: string
  heading?: string
  content: string
  embedding: number[]
}

export type KnowledgeDocumentInput = {
  id: string
  title: string
  filename: string
  sourceType: string
  hash: string
  sourceUrl?: string
  publisher?: string
  licenseName?: string
  licenseUrl?: string
  category?: string
  synthetic?: boolean
}

type ChunkRow = RowDataPacket & {
  id: string; chunk_index: number; document_id: string; title: string; filename: string; location_label: string | null
  source_url: string | null; publisher: string | null; license_name: string | null; is_synthetic: number
  heading: string | null; content: string; embedding: string
}

export function createKnowledgeRepository(pool: Pool) {
  return {
    async listDocuments() {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT id, title, filename, source_type AS sourceType, source_url AS sourceUrl, publisher, license_name AS licenseName, license_url AS licenseUrl, dataset_category AS category, is_synthetic AS synthetic, status, chunk_count AS chunkCount, error_message AS errorMessage, updated_at AS updatedAt FROM knowledge_documents ORDER BY updated_at DESC')
      return rows
    },
    async readyChunks(): Promise<StoredKnowledgeChunk[]> {
      const [rows] = await pool.query<ChunkRow[]>(`SELECT c.id, c.chunk_index, c.document_id, d.title, d.filename, d.source_url, d.publisher, d.license_name, d.is_synthetic, c.location_label, c.heading, c.content, c.embedding
        FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id WHERE d.status = 'ready' ORDER BY c.document_id, c.chunk_index`)
      return rows.map(row => ({
        id: String(row.id), index: row.chunk_index, documentId: row.document_id, title: row.title, filename: row.filename,
        sourceUrl: row.source_url ?? undefined, publisher: row.publisher ?? undefined, licenseName: row.license_name ?? undefined, synthetic: Boolean(row.is_synthetic),
        location: row.location_label ?? undefined, heading: row.heading ?? undefined, content: row.content,
        embedding: JSON.parse(row.embedding) as number[],
      }))
    },
    async beginDocument(document: KnowledgeDocumentInput) {
      await pool.execute(`INSERT INTO knowledge_documents (id, title, filename, source_type, source_url, publisher, license_name, license_url, dataset_category, is_synthetic, content_hash, status, chunk_count, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', 0, NULL)
        ON DUPLICATE KEY UPDATE id=VALUES(id), title=VALUES(title), filename=VALUES(filename), source_type=VALUES(source_type), source_url=VALUES(source_url), publisher=VALUES(publisher), license_name=VALUES(license_name), license_url=VALUES(license_url), dataset_category=VALUES(dataset_category), is_synthetic=VALUES(is_synthetic), status='processing', chunk_count=0, error_message=NULL`,
      [document.id, document.title, document.filename, document.sourceType, document.sourceUrl ?? null, document.publisher ?? null,
        document.licenseName ?? null, document.licenseUrl ?? null, document.category ?? null, document.synthetic ? 1 : 0, document.hash])
      await pool.execute('DELETE FROM knowledge_chunks WHERE document_id = ?', [document.id])
    },
    async saveChunks(documentId: string, chunks: KnowledgeChunkInput[]) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        for (const chunk of chunks) {
          await connection.execute(`INSERT INTO knowledge_chunks (document_id, chunk_index, location_label, heading, content, embedding, embedding_model, dimensions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [documentId, chunk.index, chunk.location ?? null, chunk.heading ?? null, chunk.content, JSON.stringify(chunk.embedding), chunk.model, chunk.embedding.length])
        }
        await connection.execute("UPDATE knowledge_documents SET status='ready', chunk_count=?, error_message=NULL WHERE id=?", [chunks.length, documentId])
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    },
    async failDocument(documentId: string, message: string) {
      await pool.execute("UPDATE knowledge_documents SET status='failed', error_message=? WHERE id=?", [message.slice(0, 1000), documentId])
    },
  }
}
