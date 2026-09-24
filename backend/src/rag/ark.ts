type ArkErrorPayload = { error?: { code?: string; message?: string }; code?: string; message?: string }

export class ArkApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}

export type ArkConfig = {
  apiKey: string
  baseUrl: string
  chatModel: string
  embeddingModel: string
  embeddingDimensions: number
}

export function arkConfig(env = process.env): ArkConfig {
  const required = ['AI_API_KEY', 'AI_CHAT_MODEL', 'AI_EMBEDDING_MODEL'] as const
  for (const key of required) if (!env[key]) throw new Error(`${key} is required for RAG in backend/.env`)
  return {
    apiKey: env.AI_API_KEY!,
    baseUrl: (env.AI_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''),
    chatModel: env.AI_CHAT_MODEL!,
    embeddingModel: env.AI_EMBEDDING_MODEL!,
    embeddingDimensions: Number(env.AI_EMBEDDING_DIMENSIONS || 1024),
  }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function createArkClient(config: ArkConfig, fetcher: typeof fetch = fetch) {
  async function post<T>(path: string, body: object, retries = 2): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetcher(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      })
      const payload = await response.json().catch(() => ({})) as T & ArkErrorPayload
      if (response.ok) return payload
      if (response.status === 429 && attempt < retries) {
        await wait(750 * 2 ** attempt)
        continue
      }
      const code = payload.error?.code || payload.code || `HTTP_${response.status}`
      throw new ArkApiError(response.status, code, payload.error?.message || payload.message || 'AI provider request failed.')
    }
  }

  return {
    async embed(text: string) {
      const response = await post<{ data?: { embedding?: number[] } }>('/embeddings/multimodal', {
        model: config.embeddingModel,
        input: [{ type: 'text', text }],
        dimensions: config.embeddingDimensions,
        encoding_format: 'float',
        instructions: 'Represent healthcare requirements, clinical guidance, and project documents for semantic retrieval.',
      })
      const embedding = response.data?.embedding
      if (!Array.isArray(embedding) || embedding.length !== config.embeddingDimensions) throw new Error('The embedding provider returned an invalid vector.')
      return embedding
    },
    async answer(question: string, context: string) {
      const response = await post<{ choices?: { message?: { content?: string } }[] }>('/chat/completions', {
        model: config.chatModel,
        temperature: 0.1,
        max_tokens: 1200,
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: 'You are a healthcare software project assistant. Answer only from the supplied sources. Cite factual claims with [1], [2], and so on. If the sources are insufficient, say so explicitly. Do not diagnose patients or invent clinical facts. Keep the answer concise and professional.' },
          { role: 'user', content: `Question:\n${question}\n\nSources:\n${context}` },
        ],
      })
      const answer = response.choices?.[0]?.message?.content?.trim()
      if (!answer) throw new Error('The chat provider returned an empty answer.')
      return answer
    },
  }
}
