import { consultationSeed } from '@/mocks/consultations'
import { useAuthStore } from '@/stores/auth'
import type { ConsultationImage, ConsultationMessage, ConsultationSession, ConsultationSummary, ConsultationSummaryInput, Role } from '@/types/clinical'
import type { ConsultationImageStore } from './consultation-images'

export const CONSULTATION_STORAGE_KEY = 'doctor-platform-consultations-v1'
export const CONSULTATION_STORAGE_VERSION = 3
export const CONSULTATION_MESSAGE_LIMIT = 5000
export const CONSULTATION_IMAGE_SIZE_LIMIT = 5 * 1024 * 1024
export const CONSULTATION_IMAGE_PIXEL_LIMIT = 24_000_000
export const CONSULTATION_SUMMARY_LIMITS = {
  chiefComplaint: 1000,
  consultationNotes: 5000,
  assessment: 3000,
  plan: 3000,
  followUp: 2000,
} as const
const summaryFields = Object.keys(CONSULTATION_SUMMARY_LIMITS) as Array<keyof ConsultationSummaryInput>

export interface ConsultationImageInput {
  content: string
  clientMessageId: string
  image: ConsultationImage
  blob: Blob
}

export interface DemoConsultationRequestInput {
  clientRequestId: string
  patientId: string
  patientName: string
  complaint: string
  content: string
}

export interface DemoConsultationMessageInput {
  content: string
  clientMessageId: string
  image?: ConsultationImage
  blob?: Blob
}

export interface ConsultationService {
  list(): Promise<ConsultationSession[]>
  accept(id: string): Promise<ConsultationSession>
  sendMessage(id: string, input: { content: string; clientMessageId: string }): Promise<ConsultationSession>
  sendImage(id: string, input: ConsultationImageInput): Promise<ConsultationSession>
  saveSummary(id: string, input: ConsultationSummaryInput, authorName: string): Promise<ConsultationSession>
  complete(id: string): Promise<ConsultationSession>
  createDemoRequest(input: DemoConsultationRequestInput): Promise<ConsultationSession>
  receiveDemoMessage(id: string, input: DemoConsultationMessageInput): Promise<ConsultationSession>
  markRead(id: string): Promise<ConsultationSession>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSummaryInput(value: unknown): value is ConsultationSummaryInput {
  if (!isObject(value)) return false
  return summaryFields.every(field => typeof value[field] === 'string' && (value[field] as string).length <= CONSULTATION_SUMMARY_LIMITS[field])
    && isText(value.chiefComplaint) && isText(value.consultationNotes)
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!parts) return false
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]!
    && Number(parts[4]) < 24 && Number(parts[5]) < 60 && Number(parts[6]) < 60
    && (parts[7] === undefined || (Number(parts[7]) < 24 && Number(parts[8]) < 60))
    && Number.isFinite(Date.parse(value))
}

function isSummary(value: unknown): value is ConsultationSummary {
  if (!isObject(value) || !isSummaryInput(value)) return false
  return Object.keys(value).every(key => [...summaryFields, 'authorName', 'updatedAt'].includes(key))
    && isText(value.authorName) && value.authorName.length <= 200 && isIsoTimestamp(value.updatedAt)
}

function isImage(value: unknown): value is ConsultationImage {
  if (!isObject(value)) return false
  const positiveInteger = (item: unknown): item is number => typeof item === 'number' && Number.isSafeInteger(item) && item > 0
  return isText(value.id) && /^[a-zA-Z0-9_-]{1,200}$/.test(value.id)
    && isText(value.name) && value.name.length <= 255 && !value.name.includes('\0')
    && ['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType as string)
    && positiveInteger(value.size) && value.size <= CONSULTATION_IMAGE_SIZE_LIMIT
    && positiveInteger(value.width) && positiveInteger(value.height)
    && value.width * value.height <= CONSULTATION_IMAGE_PIXEL_LIMIT
}

function isMessage(value: unknown, version: number): value is ConsultationMessage {
  if (!isObject(value)) return false
  const validImage = version >= 2 && isImage(value.image)
  return isText(value.id)
    && ['doctor', 'patient', 'ai'].includes(value.sender as string)
    && typeof value.content === 'string' && (isText(value.content) || validImage)
    && value.content.length <= CONSULTATION_MESSAGE_LIMIT
    // Existing demo history has display times; new messages use full ISO timestamps.
    && isText(value.time)
    && (value.attachment === undefined || isText(value.attachment))
    && (value.image === undefined || validImage)
}

function isSession(value: unknown, version: number): value is ConsultationSession {
  if (!isObject(value)) return false
  return ['id', 'patientId', 'patientName', 'complaint', 'updatedAt'].every(key => isText(value[key]))
    && ['waiting', 'active', 'completed'].includes(value.status as string)
    && typeof value.unread === 'number' && Number.isSafeInteger(value.unread) && value.unread >= 0
    && Array.isArray(value.messages) && value.messages.every(message => isMessage(message, version))
    && new Set(value.messages.map(message => message.id)).size === value.messages.length
    && (value.summary === undefined || (version >= 3 && isSummary(value.summary)))
}

export function createLocalConsultationService(options: {
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
  role: () => Role
  imageStore?: ConsultationImageStore
}): ConsultationService {
  function read(): ConsultationSession[] {
    let raw: string | null
    try { raw = options.storage().getItem(CONSULTATION_STORAGE_KEY) }
    catch { throw new Error('Unable to read local consultation history. Check browser storage permissions and retry.') }
    if (raw === null) return structuredClone(consultationSeed)
    try {
      const saved: unknown = JSON.parse(raw)
      if (!isObject(saved) || ![1, 2, CONSULTATION_STORAGE_VERSION].includes(saved.version as number) || !Array.isArray(saved.consultations)
        || !saved.consultations.every(session => isSession(session, saved.version as number))
        || new Set(saved.consultations.map(session => session.id)).size !== saved.consultations.length) {
        throw new Error('Invalid stored history')
      }
      const imageIds = saved.consultations.flatMap(session => session.messages.flatMap(message => message.image ? [message.image.id] : []))
      if (new Set(imageIds).size !== imageIds.length) throw new Error('Duplicate stored image')
      return saved.consultations
    } catch {
      throw new Error('Local consultation history is damaged or uses an unsupported format. The saved data has been kept unchanged.')
    }
  }

  function checkWrite() {
    if (!['doctor', 'seniorDoctor'].includes(options.role())) {
      throw new Error('Your current role has read-only access to consultations.')
    }
  }

  function find(sessions: ConsultationSession[], id: string) {
    const session = sessions.find(item => item.id === id)
    if (!session) throw new Error('Consultation not found.')
    return session
  }

  function commit(sessions: ConsultationSession[]) {
    try {
      options.storage().setItem(CONSULTATION_STORAGE_KEY, JSON.stringify({ version: CONSULTATION_STORAGE_VERSION, consultations: sessions }))
    } catch {
      throw new Error('Save failed: unable to write consultation history. Check storage space or browser permissions and retry. Your input has been kept.')
    }
  }

  function existingImageRetry(session: ConsultationSession, input: Omit<ConsultationImageInput, 'blob'>, sender: 'doctor' | 'patient') {
    const existing = session.messages.find(message => message.id === input.clientMessageId)
    if (!existing) return false
    const image = existing.image
    if (existing.sender !== sender || existing.content !== input.content || existing.attachment !== undefined || !image
      || !(['id', 'name', 'mimeType', 'size', 'width', 'height'] as const).every(key => image[key] === input.image[key])) {
      throw new Error('This message identifier has already been used for different content.')
    }
    return true
  }

  function imageIsReferenced(sessions: ConsultationSession[], imageId: string) {
    return sessions.some(session => session.messages.some(message => message.image?.id === imageId))
  }

  function checkImageTarget(sessions: ConsultationSession[], id: string, input: Omit<ConsultationImageInput, 'blob'>, sender: 'doctor' | 'patient') {
    const session = find(sessions, id)
    if (sender === 'patient' && session.status === 'completed') throw new Error('This consultation is completed. New messages cannot be received.')
    if (existingImageRetry(session, input, sender)) return { session, saved: true }
    if (session.status === 'completed') throw new Error('This consultation is completed. New messages cannot be sent.')
    if (imageIsReferenced(sessions, input.image.id)) throw new Error('This image identifier is already in use. Select the image again.')
    return { session, saved: false }
  }

  function incrementUnread(session: ConsultationSession) {
    if (session.unread >= Number.MAX_SAFE_INTEGER) throw new Error('The unread message count is too large. Mark the consultation as read and retry.')
    session.unread++
  }

  async function persistImageMessage(id: string, input: ConsultationImageInput, sender: 'doctor' | 'patient') {
    checkWrite()
    if (!input || !isImage(input.image)) throw new Error('Invalid image details. Use a JPEG, PNG, or WebP image up to 5 MiB and 24 megapixels.')
    if (typeof input.content !== 'string' || input.content.trim().length > CONSULTATION_MESSAGE_LIMIT) {
      throw new Error(`Image captions must contain at most ${CONSULTATION_MESSAGE_LIMIT} characters.`)
    }
    if (!isText(input.clientMessageId)) throw new Error('A message identifier is required. Please retry.')
    if (!(input.blob instanceof Blob) || input.blob.size !== input.image.size || input.blob.type !== input.image.mimeType) {
      throw new Error('The selected image does not match its file details. Select it again.')
    }
    const image: ConsultationImage = {
      id: input.image.id, name: input.image.name, mimeType: input.image.mimeType,
      size: input.image.size, width: input.image.width, height: input.image.height,
    }
    const snapshot = { content: input.content.trim(), clientMessageId: input.clientMessageId, image }
    const blob = input.blob
    const previous = checkImageTarget(read(), id, snapshot, sender)
    if (previous.saved) return previous.session
    const imageStore = options.imageStore ?? (await import('./consultation-images')).consultationImageStore
    let blobSaved = false
    try {
      try { await imageStore.put(image.id, blob) }
      catch (writeError) {
        // Recover a prior upload only when its unreferenced bytes are identical.
        try {
          const latest = checkImageTarget(read(), id, snapshot, sender)
          if (latest.saved) { checkWrite(); return latest.session }
          const stored = await imageStore.get(image.id)
          if (stored.size !== blob.size || stored.type !== blob.type) throw writeError
          const [storedBytes, inputBytes] = await Promise.all([stored.arrayBuffer(), blob.arrayBuffer()])
          const expected = new Uint8Array(inputBytes)
          if (!new Uint8Array(storedBytes).every((byte, index) => byte === expected[index])) throw writeError
        } catch { throw writeError }
      }
      blobSaved = true
      checkWrite()
      const sessions = read()
      const target = checkImageTarget(sessions, id, snapshot, sender)
      if (target.saved) return target.session
      const now = new Date().toISOString()
      target.session.messages.push({ id: snapshot.clientMessageId, sender, content: snapshot.content, image, time: now })
      if (sender === 'doctor') {
        target.session.status = 'active'
        target.session.unread = 0
      } else incrementUnread(target.session)
      target.session.updatedAt = now
      commit(sessions)
      return target.session
    } catch (error) {
      if (blobSaved) {
        try {
          if (!imageIsReferenced(read(), image.id)) await imageStore.remove(image.id)
        } catch { /* Preserve the original error and any potentially referenced image. */ }
      }
      throw error
    }
  }

  return {
    async list() { return read() },
    async accept(id) {
      checkWrite()
      const sessions = read()
      const session = find(sessions, id)
      if (session.status === 'completed') throw new Error('A completed consultation cannot be accepted again.')
      if (session.status === 'active' && session.unread === 0) return session
      session.status = 'active'
      session.unread = 0
      session.updatedAt = new Date().toISOString()
      commit(sessions)
      return session
    },
    async sendMessage(id, input) {
      checkWrite()
      if (!input || !isText(input.content)) throw new Error('Enter a message before sending.')
      const content = input.content.trim()
      if (content.length > CONSULTATION_MESSAGE_LIMIT) throw new Error(`Messages must contain at most ${CONSULTATION_MESSAGE_LIMIT} characters.`)
      if (!isText(input.clientMessageId)) throw new Error('A message identifier is required. Please retry.')
      const sessions = read()
      const session = find(sessions, id)
      const existing = session.messages.find(message => message.id === input.clientMessageId)
      if (existing) {
        if (existing.sender !== 'doctor' || existing.content !== content || existing.attachment !== undefined || existing.image !== undefined) {
          throw new Error('This message identifier has already been used for different content.')
        }
        // A retry of an already saved message is safe even if the consultation later ended.
        return session
      }
      if (session.status === 'completed') throw new Error('This consultation is completed. New messages cannot be sent.')
      const now = new Date().toISOString()
      session.messages.push({ id: input.clientMessageId, sender: 'doctor', content, time: now })
      session.status = 'active'
      session.unread = 0
      session.updatedAt = now
      commit(sessions)
      return session
    },
    async sendImage(id, input) { return persistImageMessage(id, input, 'doctor') },
    async createDemoRequest(input) {
      checkWrite()
      const limits = { clientRequestId: 200, patientId: 200, patientName: 200, complaint: 1000, content: CONSULTATION_MESSAGE_LIMIT } as const
      if (!isObject(input)) throw new Error('Enter valid demo request details.')
      for (const field of Object.keys(limits) as Array<keyof DemoConsultationRequestInput>) {
        if (!isText(input[field]) || input[field].trim().length > limits[field]) throw new Error(`The ${field} field is required and must contain at most ${limits[field]} characters.`)
      }
      const request = {
        clientRequestId: input.clientRequestId.trim(), patientId: input.patientId,
        patientName: input.patientName.trim(), complaint: input.complaint.trim(), content: input.content.trim(),
      }
      const id = `C-DEMO-${request.clientRequestId}`
      const messageId = `M-DEMO-${request.clientRequestId}`
      const sessions = read()
      const existing = sessions.find(session => session.id === id)
      if (existing) {
        const first = existing.messages[0]
        if (existing.patientId !== request.patientId || existing.patientName !== request.patientName || existing.complaint !== request.complaint
          || first?.id !== messageId || first.sender !== 'patient' || first.content !== request.content || first.image || first.attachment) {
          throw new Error('This request identifier has already been used for different content.')
        }
        return existing
      }
      const now = new Date().toISOString()
      const session: ConsultationSession = {
        id, patientId: request.patientId, patientName: request.patientName, complaint: request.complaint,
        status: 'waiting', unread: 1, updatedAt: now,
        messages: [{ id: messageId, sender: 'patient', content: request.content, time: now }],
      }
      sessions.unshift(session)
      commit(sessions)
      return session
    },
    async receiveDemoMessage(id, input) {
      checkWrite()
      if (!isObject(input) || typeof input.content !== 'string') throw new Error('Enter valid demo patient message text.')
      if (!isText(input.clientMessageId) || input.clientMessageId.trim().length > 200) throw new Error('A message identifier of at most 200 characters is required.')
      const clientMessageId = input.clientMessageId.trim()
      if (input.image !== undefined || input.blob !== undefined) {
        return persistImageMessage(id, { content: input.content, clientMessageId, image: input.image!, blob: input.blob! }, 'patient')
      }
      const content = input.content.trim()
      if (!content || content.length > CONSULTATION_MESSAGE_LIMIT) throw new Error(`Enter a patient message of at most ${CONSULTATION_MESSAGE_LIMIT} characters or attach an image.`)
      const sessions = read()
      const session = find(sessions, id)
      if (session.status === 'completed') throw new Error('This consultation is completed. New messages cannot be received.')
      const existing = session.messages.find(message => message.id === clientMessageId)
      if (existing) {
        if (existing.sender !== 'patient' || existing.content !== content || existing.image !== undefined || existing.attachment !== undefined) {
          throw new Error('This message identifier has already been used for different content.')
        }
        return session
      }
      const now = new Date().toISOString()
      session.messages.push({ id: clientMessageId, sender: 'patient', content, time: now })
      incrementUnread(session)
      session.updatedAt = now
      commit(sessions)
      return session
    },
    async markRead(id) {
      checkWrite()
      const sessions = read()
      const session = find(sessions, id)
      if (!session.unread) return session
      session.unread = 0
      commit(sessions)
      return session
    },
    async saveSummary(id, input, authorName) {
      checkWrite()
      if (!isObject(input) || !summaryFields.every(field => typeof input[field] === 'string')) {
        throw new Error('Enter valid text for every consultation summary field.')
      }
      const fields: ConsultationSummaryInput = {
        chiefComplaint: input.chiefComplaint.trim(),
        consultationNotes: input.consultationNotes.trim(),
        assessment: input.assessment.trim(),
        plan: input.plan.trim(),
        followUp: input.followUp.trim(),
      }
      if (!fields.chiefComplaint || !fields.consultationNotes) throw new Error('Chief complaint and consultation notes are required.')
      for (const field of summaryFields) {
        if (fields[field].length > CONSULTATION_SUMMARY_LIMITS[field]) {
          throw new Error(`The ${field} summary field must contain at most ${CONSULTATION_SUMMARY_LIMITS[field]} characters.`)
        }
      }
      if (!isText(authorName) || authorName.trim().length > 200) throw new Error('A valid author name of at most 200 characters is required.')
      const author = authorName.trim()
      const sessions = read()
      const session = find(sessions, id)
      if (session.status === 'waiting') throw new Error('Accept the consultation before saving its summary.')
      if (session.status === 'completed') throw new Error('This consultation is completed. Its summary is read-only.')
      if (session.summary?.authorName === author && summaryFields.every(field => session.summary![field] === fields[field])) return session
      const now = new Date().toISOString()
      session.summary = { ...fields, authorName: author, updatedAt: now }
      session.updatedAt = now
      commit(sessions)
      return session
    },
    async complete(id) {
      checkWrite()
      const sessions = read()
      const session = find(sessions, id)
      if (session.status === 'completed') return session
      if (session.status !== 'active') throw new Error('Accept the consultation before completing it.')
      session.status = 'completed'
      session.unread = 0
      session.updatedAt = new Date().toISOString()
      commit(sessions)
      return session
    },
  }
}

// Local demo adapter; replace with the shared consultation API when it is available.
export const consultationService = createLocalConsultationService({
  storage: () => window.localStorage,
  role: () => useAuthStore().currentRole,
})
