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
}

export interface RagAnswer { answer: string; sources: RagSource[]; generationMode?: 'generated' | 'retrieval-only' }

export const ragService = {
  async query(question: string): Promise<RagAnswer> {
    if (!apiEnabled) return { answer: 'The backend knowledge base is not configured. Connect the authenticated API to retrieve answers from imported project documents.', sources: [] }
    return apiRequest<RagAnswer>('/api/rag/query', { method: 'POST', body: JSON.stringify({ question }) })
  },
}
