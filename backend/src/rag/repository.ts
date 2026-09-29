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
  category?: string
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

export type KnowledgeIngestionJob = {
  id: string
  documentId: string
  filename: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  totalChunks: number
  completedChunks: number
  attempts: number
  errorMessage?: string
  updatedAt: Date
}

type ChunkRow = RowDataPacket & {
  id: string; chunk_index: number; document_id: string; title: string; filename: string; location_label: string | null
  source_url: string | null; publisher: string | null; license_name: string | null; is_synthetic: number; dataset_category: string | null
  heading: string | null; content: string; embedding: string
}

type IngestionJobRow = RowDataPacket & {
  id: string; document_id: string; filename: string; status: KnowledgeIngestionJob['status']; total_chunks: number
  completed_chunks: number; attempts: number; error_message: string | null; updated_at: Date
}

const ingestionJob = (row: IngestionJobRow): KnowledgeIngestionJob => ({
  id: row.id, documentId: row.document_id, filename: row.filename, status: row.status,
  totalChunks: row.total_chunks, completedChunks: row.completed_chunks, attempts: row.attempts,
  errorMessage: row.error_message ?? undefined, updatedAt: row.updated_at,
})

export function createKnowledgeRepository(pool: Pool) {
  return {
    async listDocuments() {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT id, title, filename, source_type AS sourceType, source_url AS sourceUrl, publisher, license_name AS licenseName, license_url AS licenseUrl, dataset_category AS category, is_synthetic AS synthetic, status, chunk_count AS chunkCount, error_message AS errorMessage, updated_at AS updatedAt FROM knowledge_documents ORDER BY updated_at DESC')
      return rows
    },
    async listIngestionJobs() {
      const [rows] = await pool.query<IngestionJobRow[]>(`SELECT id, document_id, filename, status, total_chunks, completed_chunks, attempts, error_message, updated_at
        FROM knowledge_ingestion_jobs ORDER BY updated_at DESC`)
      return rows.map(ingestionJob)
    },
    async readyChunks(): Promise<StoredKnowledgeChunk[]> {
      const [rows] = await pool.query<ChunkRow[]>(`SELECT c.id, c.chunk_index, c.document_id, d.title, d.filename, d.source_url, d.publisher, d.license_name, d.is_synthetic, d.dataset_category, c.location_label, c.heading, c.content, c.embedding
        FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id WHERE d.status = 'ready' ORDER BY c.document_id, c.chunk_index`)
      return rows.map(row => ({
        id: String(row.id), index: row.chunk_index, documentId: row.document_id, title: row.title, filename: row.filename,
        sourceUrl: row.source_url ?? undefined, publisher: row.publisher ?? undefined, licenseName: row.license_name ?? undefined, synthetic: Boolean(row.is_synthetic), category: row.dataset_category ?? undefined,
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
    async prepareIngestion(document: KnowledgeDocumentInput, totalChunks: number) {
      const jobId = `KI-${document.hash.slice(0, 32)}`
      await pool.execute(`INSERT INTO knowledge_ingestion_jobs
        (id, document_id, filename, source_type, content_hash, status, total_chunks, completed_chunks, attempts)
        VALUES (?, ?, ?, ?, ?, 'queued', ?, 0, 0)
        ON DUPLICATE KEY UPDATE filename=VALUES(filename), source_type=VALUES(source_type), total_chunks=VALUES(total_chunks)`,
      [jobId, document.id, document.filename, document.sourceType, document.hash, totalChunks])
      const [existing] = await pool.execute<IngestionJobRow[]>(`SELECT id, document_id, filename, status, total_chunks, completed_chunks, attempts, error_message, updated_at
        FROM knowledge_ingestion_jobs WHERE id=? LIMIT 1`, [jobId])
      if (existing[0]?.status === 'ready') return ingestionJob(existing[0])
      await pool.execute(`UPDATE knowledge_ingestion_jobs SET status='processing', attempts=attempts+1, error_message=NULL,
        started_at=CURRENT_TIMESTAMP(3), completed_at=NULL WHERE id=?`, [jobId])
      const [rows] = await pool.execute<IngestionJobRow[]>(`SELECT id, document_id, filename, status, total_chunks, completed_chunks, attempts, error_message, updated_at
        FROM knowledge_ingestion_jobs WHERE id=? LIMIT 1`, [jobId])
      return ingestionJob(rows[0]!)
    },
    async stagedChunkIndexes(jobId: string) {
      const [rows] = await pool.execute<(RowDataPacket & { chunk_index: number })[]>('SELECT chunk_index FROM knowledge_ingestion_job_chunks WHERE job_id=?', [jobId])
      return new Set(rows.map(row => row.chunk_index))
    },
    async stageIngestionChunk(jobId: string, chunk: KnowledgeChunkInput) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute(`INSERT INTO knowledge_ingestion_job_chunks
          (job_id, chunk_index, location_label, heading, content, embedding, embedding_model, dimensions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE location_label=VALUES(location_label), heading=VALUES(heading), content=VALUES(content), embedding=VALUES(embedding), embedding_model=VALUES(embedding_model), dimensions=VALUES(dimensions)`,
        [jobId, chunk.index, chunk.location ?? null, chunk.heading ?? null, chunk.content, JSON.stringify(chunk.embedding), chunk.model, chunk.embedding.length])
        await connection.execute(`UPDATE knowledge_ingestion_jobs SET completed_chunks=(SELECT COUNT(*) FROM knowledge_ingestion_job_chunks WHERE job_id=?) WHERE id=?`, [jobId, jobId])
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    },
    async completeIngestion(jobId: string, document: KnowledgeDocumentInput) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [counts] = await connection.execute<(RowDataPacket & { count: number | string })[]>('SELECT COUNT(*) count FROM knowledge_ingestion_job_chunks WHERE job_id=?', [jobId])
        const chunkCount = Number(counts[0]?.count ?? 0)
        if (!Number.isSafeInteger(chunkCount) || chunkCount < 0) throw new Error('Invalid ingestion checkpoint count.')
        const [jobs] = await connection.execute<IngestionJobRow[]>('SELECT total_chunks FROM knowledge_ingestion_jobs WHERE id=? FOR UPDATE', [jobId])
        if (!jobs[0] || chunkCount !== jobs[0].total_chunks) throw new Error(`Ingestion checkpoint is incomplete (${chunkCount}/${jobs[0]?.total_chunks ?? 0}).`)
        await connection.execute('DELETE FROM knowledge_documents WHERE filename=? AND id<>?', [document.filename, document.id])
        await connection.execute(`INSERT INTO knowledge_documents
          (id, title, filename, source_type, source_url, publisher, license_name, license_url, dataset_category, is_synthetic, content_hash, status, chunk_count, error_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, NULL)
          ON DUPLICATE KEY UPDATE title=VALUES(title), filename=VALUES(filename), source_type=VALUES(source_type), source_url=VALUES(source_url), publisher=VALUES(publisher), license_name=VALUES(license_name), license_url=VALUES(license_url), dataset_category=VALUES(dataset_category), is_synthetic=VALUES(is_synthetic), status='ready', chunk_count=VALUES(chunk_count), error_message=NULL`,
        [document.id, document.title, document.filename, document.sourceType, document.sourceUrl ?? null, document.publisher ?? null,
          document.licenseName ?? null, document.licenseUrl ?? null, document.category ?? null, document.synthetic ? 1 : 0, document.hash, chunkCount])
        await connection.execute('DELETE FROM knowledge_chunks WHERE document_id=?', [document.id])
        await connection.execute(`INSERT INTO knowledge_chunks (document_id, chunk_index, location_label, heading, content, embedding, embedding_model, dimensions)
          SELECT ?, chunk_index, location_label, heading, content, embedding, embedding_model, dimensions
          FROM knowledge_ingestion_job_chunks WHERE job_id=? ORDER BY chunk_index`, [document.id, jobId])
        await connection.execute(`UPDATE knowledge_ingestion_jobs SET status='ready', completed_chunks=?, error_message=NULL,
          completed_at=CURRENT_TIMESTAMP(3) WHERE id=?`, [chunkCount, jobId])
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    },
    async failIngestion(jobId: string, message: string) {
      await pool.execute("UPDATE knowledge_ingestion_jobs SET status='failed', error_message=? WHERE id=?", [message.slice(0, 1000), jobId])
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
