import { apiEnabled, apiRequest } from './http'

export interface RagSource {
  id: string
  documentId: string
  title: string
  filename: string
  location?: string
  heading?: string
  excerpt: string
  score: number
  sourceUrl?: string
  publisher?: string
  licenseName?: string
  synthetic: boolean
  category?: string
}

export type RagScope = 'project' | 'clinical-guideline' | 'synthetic-patient'

export interface KnowledgeDocument {
  id: string
  title: string
  filename: string
  sourceType: string
  sourceUrl?: string
  publisher?: string
  licenseName?: string
  licenseUrl?: string
  category?: string
  synthetic: boolean
  status: 'processing' | 'ready' | 'failed'
  chunkCount: number
  updatedAt: string
}

export interface RagAnswer {
  traceId: string
  generatedAt: string
  answer: string
  sources: RagSource[]
  citations: { index: number; sourceId: string }[]
  generationMode: 'generated' | 'retrieval-only' | 'not-run'
  scope: RagScope
  answerDecision: 'answered' | 'abstained' | 'retrieval-only'
  evidenceStatus: 'sufficient' | 'insufficient'
  clinicianReviewRequired: boolean
}

export interface RagQueryOptions { scope: RagScope; documentId?: string }

export function ragQueryBody(question: string, options: RagQueryOptions) {
  return { question, scope: options.scope, ...(options.documentId ? { documentId: options.documentId } : {}) }
}

export const ragService = {
  async listDocuments(): Promise<KnowledgeDocument[]> {
    if (!apiEnabled) return []
    return (await apiRequest<{ documents: KnowledgeDocument[] }>('/api/rag/documents')).documents
  },
  async query(question: string, options: RagQueryOptions): Promise<RagAnswer> {
    if (!apiEnabled) throw new Error('The authenticated knowledge API is not configured.')
    return apiRequest<RagAnswer>('/api/rag/query', { method: 'POST', body: JSON.stringify(ragQueryBody(question, options)) })
  },
}
