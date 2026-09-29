import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consultationSeed } from '@/mocks/consultations'
import type { ConsultationImage, ConsultationSession, ConsultationSummaryInput, Role } from '@/types/clinical'
import { CONSULTATION_IMAGE_PIXEL_LIMIT, CONSULTATION_IMAGE_SIZE_LIMIT, CONSULTATION_STORAGE_KEY, CONSULTATION_STORAGE_VERSION, CONSULTATION_SUMMARY_LIMITS, createLocalConsultationService, type DemoConsultationRequestInput, type DemoConsultationMessageInput } from './consultations'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
  }
}

const activeId = 'C-20260912-01'
const waitingId = 'C-20260912-02'
const completedId = 'C-20260911-03'
const message = (clientMessageId = 'outgoing-1', content = 'Please send your updated monitoring record.') => ({ clientMessageId, content })
const serialize = (sessions: ConsultationSession[] = structuredClone(consultationSeed)) => JSON.stringify({ version: 1, consultations: sessions })
const lastMessage = (session: ConsultationSession) => session.messages[session.messages.length - 1]!

describe('local consultation history', () => {
  let storage: ReturnType<typeof memoryStorage>
  let role: Role
  const create = () => createLocalConsultationService({ storage: () => storage, role: () => role })

  beforeEach(() => { storage = memoryStorage(); role = 'doctor' })

  it('loads independent copies of the original demo history without writing on a read', async () => {
    const service = create()
    const sessions = await service.list()
    expect(sessions).toEqual(consultationSeed)
    expect(sessions[0]!.messages[2]!.attachment).toBe('Home-Blood-Pressure-Log.jpg')
    sessions[0]!.messages[0]!.content = 'Unsaved change'
    sessions.splice(1)
    expect(await service.list()).toEqual(consultationSeed)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('atomically sends a waiting consultation message, activates it, and restores it after refresh', async () => {
    const saved = await create().sendMessage(waitingId, message())
    expect(storage.setItem).toHaveBeenCalledOnce()
    expect(saved.status).toBe('active')
    expect(saved.unread).toBe(0)
    expect(saved.messages).toHaveLength(3)
    const sent = lastMessage(saved)
    expect(sent).toMatchObject({ id: 'outgoing-1', sender: 'doctor', content: message().content })
    expect(sent.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(new Date(sent.time).toISOString()).toBe(sent.time)
    expect(saved.updatedAt).toBe(sent.time)
    expect((await create().list()).find(session => session.id === waitingId)).toEqual(saved)
  })

  it('persists accept and completion and keeps repeated state transitions idempotent', async () => {
    await create().accept(waitingId)
    expect((await create().list()).find(session => session.id === waitingId)).toMatchObject({ status: 'active', unread: 0 })
    storage.setItem.mockClear()
    await create().accept(waitingId)
    expect(storage.setItem).not.toHaveBeenCalled()
    const ended = await create().complete(waitingId)
    expect(ended.status).toBe('completed')
    expect((await create().list()).find(session => session.id === waitingId)).toEqual(ended)
    storage.setItem.mockClear()
    expect(await create().complete(waitingId)).toEqual(ended)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('re-reads storage before writes so separate service instances preserve each other’s changes', async () => {
    const first = create()
    const second = create()
    await first.list()
    const firstSaved = await second.sendMessage(activeId, message('first'))
    const secondSaved = await first.sendMessage(waitingId, message('second'))
    const restored = await create().list()
    expect(restored.find(session => session.id === activeId)).toEqual(firstSaved)
    expect(restored.find(session => session.id === waitingId)).toEqual(secondSaved)
    expect(restored.find(session => session.id === completedId)).toEqual(consultationSeed[2])
  })

  it('does not append or write again for an identical retry, including after completion', async () => {
    const service = create()
    const first = await service.sendMessage(activeId, message())
    storage.setItem.mockClear()
    expect(await create().sendMessage(activeId, message())).toEqual(first)
    expect(storage.setItem).not.toHaveBeenCalled()
    await service.complete(activeId)
    storage.setItem.mockClear()
    const retried = await create().sendMessage(activeId, message())
    expect(retried.status).toBe('completed')
    expect(retried.messages.filter(item => item.id === 'outgoing-1')).toHaveLength(1)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('rejects reuse of a message ID with different content without replacing the stored message', async () => {
    await create().sendMessage(activeId, message())
    const before = storage.getItem(CONSULTATION_STORAGE_KEY)
    storage.setItem.mockClear()
    await expect(create().sendMessage(activeId, message('outgoing-1', 'Different message'))).rejects.toThrow('different content')
    await expect(create().sendMessage(activeId, message('m1', consultationSeed[0]!.messages[0]!.content))).rejects.toThrow('different content')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(before)
  })

  it('deduplicates immediate repeated submissions from the same page', async () => {
    const service = create()
    const [first, retry] = await Promise.all([service.sendMessage(waitingId, message()), service.sendMessage(waitingId, message())])
    expect(retry).toEqual(first)
    expect(storage.setItem).toHaveBeenCalledOnce()
  })

  it('rejects new messages and reopening after completion while preserving history', async () => {
    const ended = await create().complete(activeId)
    const before = storage.getItem(CONSULTATION_STORAGE_KEY)
    storage.setItem.mockClear()
    await expect(create().sendMessage(activeId, message())).rejects.toThrow('completed')
    await expect(create().accept(activeId)).rejects.toThrow('completed')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect((await create().list()).find(session => session.id === activeId)).toEqual(ended)
  })

  it('does not complete an unaccepted waiting consultation', async () => {
    await expect(create().complete(waitingId)).rejects.toThrow('Accept the consultation')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(await create().list()).toEqual(consultationSeed)
  })

  it('rejects all writes for an administrator and checks the current role on every operation', async () => {
    const service = create()
    role = 'admin'
    expect(await service.list()).toEqual(consultationSeed)
    await expect(service.accept(waitingId)).rejects.toThrow('read-only')
    await expect(service.sendMessage(activeId, message())).rejects.toThrow('read-only')
    await expect(service.complete(activeId)).rejects.toThrow('read-only')
    expect(storage.setItem).not.toHaveBeenCalled()
    role = 'seniorDoctor'
    expect(lastMessage(await service.sendMessage(activeId, message())).id).toBe('outgoing-1')
  })

  it.each(['', '   \n\t', 'a'.repeat(5001)])('rejects invalid message text without saving: %s', async content => {
    await expect(create().sendMessage(activeId, message('invalid', content))).rejects.toThrow()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(await create().list()).toEqual(consultationSeed)
  })

  it('accepts the 5000-character boundary, trims surrounding whitespace, and requires a retry ID', async () => {
    const saved = await create().sendMessage(activeId, message('limit', `  ${'a'.repeat(5000)}  `))
    expect(lastMessage(saved).content).toBe('a'.repeat(5000))
    storage.setItem.mockClear()
    await expect(create().sendMessage(activeId, message('  '))).rejects.toThrow('identifier')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('does not add attachments or change the sender from extra input properties', async () => {
    const saved = await create().sendMessage(activeId, { ...message(), attachment: 'new-upload.jpg', sender: 'patient' } as ReturnType<typeof message>)
    expect(lastMessage(saved)).toMatchObject({ sender: 'doctor' })
    expect(lastMessage(saved)).not.toHaveProperty('attachment')
  })

  it.each(['accept', 'sendMessage', 'complete'] as const)('rejects a missing consultation during %s without saving', async operation => {
    const service = create()
    await expect(operation === 'sendMessage' ? service.sendMessage('missing', message()) : service[operation]('missing')).rejects.toThrow('not found')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['accept', 'sendMessage', 'complete'] as const)('keeps persisted history and previously returned objects intact when %s cannot save', async operation => {
    const original = serialize()
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    const service = create()
    const before = await service.list()
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    const attempt = operation === 'sendMessage' ? service.sendMessage(waitingId, message())
      : operation === 'accept' ? service.accept(waitingId) : service.complete(activeId)
    await expect(attempt).rejects.toThrow('Save failed')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(before).toEqual(consultationSeed)
    expect(await create().list()).toEqual(consultationSeed)
  })

  it('keeps missing storage and shared seeds untouched after a failed first send, and allows retry', async () => {
    const originalSeed = structuredClone(consultationSeed)
    const service = create()
    storage.setItem.mockImplementationOnce(() => { throw new Error('Storage denied') })
    await expect(service.sendMessage(waitingId, message())).rejects.toThrow('Save failed')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBeNull()
    expect(consultationSeed).toEqual(originalSeed)
    expect(await service.list()).toEqual(originalSeed)
    const saved = await service.sendMessage(waitingId, message())
    expect(saved.messages.filter(item => item.id === 'outgoing-1')).toHaveLength(1)
  })

  it('does not replace inaccessible history with seeds on storage read errors', async () => {
    storage.getItem.mockImplementation(() => { throw new Error('Access denied') })
    await expect(create().list()).rejects.toThrow('Unable to read')
    await expect(create().sendMessage(activeId, message())).rejects.toThrow('Unable to read')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['', '{broken', 'null', '[]', '{"version":99,"consultations":[]}', '{"version":1,"consultations":[{}]}'])('protects malformed or unknown stored history: %s', async raw => {
    storage.setItem(CONSULTATION_STORAGE_KEY, raw)
    storage.setItem.mockClear()
    await expect(create().list()).rejects.toThrow('kept unchanged')
    await expect(create().accept(waitingId)).rejects.toThrow('kept unchanged')
    await expect(create().sendMessage(activeId, message())).rejects.toThrow('kept unchanged')
    await expect(create().complete(activeId)).rejects.toThrow('kept unchanged')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['state', 'sender', 'unread', 'duplicateSession', 'duplicateMessage'] as const)('protects structurally invalid history: %s', async defect => {
    const sessions = structuredClone(consultationSeed)
    if (defect === 'state') sessions[0]!.status = 'unknown' as ConsultationSession['status']
    if (defect === 'sender') sessions[0]!.messages[0]!.sender = 'unknown' as ConsultationSession['messages'][number]['sender']
    if (defect === 'unread') sessions[0]!.unread = -1
    if (defect === 'duplicateSession') sessions.push(structuredClone(sessions[0]!))
    if (defect === 'duplicateMessage') sessions[0]!.messages.push(structuredClone(sessions[0]!.messages[0]!))
    const original = serialize(sessions)
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockClear()
    await expect(create().sendMessage(activeId, message())).rejects.toThrow('kept unchanged')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('preserves an intentionally empty history without repopulating seed conversations', async () => {
    const original = serialize([])
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockClear()
    expect(await create().list()).toEqual([])
    await expect(create().sendMessage(activeId, message())).rejects.toThrow('not found')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('does not let callers mutate persisted messages or seed history through returned objects', async () => {
    const saved = await create().sendMessage(activeId, message())
    lastMessage(saved).content = 'Unsaved edit'
    saved.messages[0]!.content = 'Changed historical message'
    const restored = (await create().list()).find(session => session.id === activeId)!
    expect(lastMessage(restored).content).toBe(message().content)
    expect(restored.messages[0]).toEqual(consultationSeed[0]!.messages[0])
  })
})

function memoryImages() {
  const values = new Map<string, Blob>()
  return {
    values,
    put: vi.fn(async (id: string, blob: Blob) => {
      if (values.has(id)) throw new Error('Image identifier already exists.')
      values.set(id, blob)
    }),
    get: vi.fn(async (id: string) => {
      const blob = values.get(id)
      if (!blob) throw new Error('Image missing.')
      return blob
    }),
    remove: vi.fn(async (id: string) => { values.delete(id) }),
  }
}

function imageInput(id = 'image-1', content = '') {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
  const image: ConsultationImage = { id, name: 'Monitoring.png', mimeType: 'image/png', size: blob.size, width: 200, height: 100 }
  return { content, clientMessageId: `message-${id}`, image, blob }
}

describe('local consultation images', () => {
  let storage: ReturnType<typeof memoryStorage>
  let images: ReturnType<typeof memoryImages>
  let role: Role
  const create = () => createLocalConsultationService({ storage: () => storage, role: () => role, imageStore: images })

  beforeEach(() => { storage = memoryStorage(); images = memoryImages(); role = 'doctor' })

  it('reads version 1 unchanged and migrates existing text and sample references on the next successful write', async () => {
    const original = serialize()
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockClear()
    expect(await create().list()).toEqual(consultationSeed)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    await create().sendImage(waitingId, imageInput())
    const saved = JSON.parse(storage.getItem(CONSULTATION_STORAGE_KEY)!)
    expect(saved.version).toBe(CONSULTATION_STORAGE_VERSION)
    expect(saved.consultations[0]).toEqual(consultationSeed[0])
    expect(saved.consultations[1].messages.slice(0, 2)).toEqual(consultationSeed[1]!.messages)
    expect(saved.consultations[2]).toEqual(consultationSeed[2])
  })

  it('also upgrades version 1 on an ordinary text write without touching image storage', async () => {
    storage.setItem(CONSULTATION_STORAGE_KEY, serialize())
    await create().sendMessage(activeId, message())
    expect(JSON.parse(storage.getItem(CONSULTATION_STORAGE_KEY)!).version).toBe(CONSULTATION_STORAGE_VERSION)
    expect(images.put).not.toHaveBeenCalled()
  })

  it('writes the Blob before metadata, permits an image without a caption, and restores its reference', async () => {
    const input = imageInput()
    const memorySet = storage.setItem.getMockImplementation()!
    storage.setItem.mockImplementation((key, value) => {
      expect(images.values.get(input.image.id)).toBe(input.blob)
      memorySet(key, value)
    })
    const saved = await create().sendImage(waitingId, input)
    expect(saved.status).toBe('active')
    expect(saved.unread).toBe(0)
    expect(lastMessage(saved)).toMatchObject({ id: input.clientMessageId, content: '', sender: 'doctor', image: input.image })
    expect((await create().list()).find(item => item.id === waitingId)).toEqual(saved)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).not.toContain('base64')
    expect(await images.get(input.image.id)).toBe(input.blob)
  })

  it('trims captions and keeps already-returned metadata independent from caller changes', async () => {
    const input = imageInput('caption-image', '  Latest home reading.  ')
    const saved = await create().sendImage(activeId, input)
    input.image.name = 'Changed.png'
    expect(lastMessage(saved).content).toBe('Latest home reading.')
    expect(lastMessage(saved).image?.name).toBe('Monitoring.png')
    lastMessage(saved).image!.name = 'Unsaved.png'
    expect(lastMessage((await create().list())[0]!).image?.name).toBe('Monitoring.png')
  })

  it('idempotently retries the same image and caption even after completion without rewriting the Blob', async () => {
    const input = imageInput('retry-image', 'Review this reading')
    const service = create()
    await service.sendImage(activeId, input)
    await service.complete(activeId)
    storage.setItem.mockClear(); images.put.mockClear()
    const retried = await create().sendImage(activeId, input)
    expect(retried.status).toBe('completed')
    expect(retried.messages.filter(item => item.id === input.clientMessageId)).toHaveLength(1)
    expect(images.put).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('rejects a text retry that collides with an image message and vice versa', async () => {
    const input = imageInput('collision', 'Shared text')
    await create().sendImage(activeId, input)
    await expect(create().sendMessage(activeId, message(input.clientMessageId, input.content))).rejects.toThrow('different content')
    await create().sendMessage(activeId, message('text-first', 'Shared text'))
    await expect(create().sendImage(activeId, { ...imageInput('other'), content: 'Shared text', clientMessageId: 'text-first' })).rejects.toThrow('different content')
    expect(images.values.size).toBe(1)
  })

  it.each(['caption', 'name', 'dimensions'] as const)('rejects an image retry with changed %s', async changed => {
    const input = imageInput('changed', 'Original caption')
    await create().sendImage(activeId, input)
    if (changed === 'caption') input.content = 'Different caption'
    if (changed === 'name') input.image.name = 'Different.png'
    if (changed === 'dimensions') input.image.width = 300
    const original = storage.getItem(CONSULTATION_STORAGE_KEY)
    await expect(create().sendImage(activeId, input)).rejects.toThrow('different content')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(images.put).toHaveBeenCalledOnce()
  })

  it('rejects reusing a referenced image ID in another message or conversation without changing the original Blob', async () => {
    const input = imageInput('referenced')
    await create().sendImage(activeId, input)
    await expect(create().sendImage(waitingId, { ...input, clientMessageId: 'new-message' })).rejects.toThrow('already in use')
    expect(images.put).toHaveBeenCalledOnce()
    expect(images.values.get(input.image.id)).toBe(input.blob)
    expect(images.remove).not.toHaveBeenCalled()
  })

  it('does not overwrite an unrelated orphan that uses the same image ID', async () => {
    const input = imageInput('existing-orphan')
    const original = new Blob([new Uint8Array([4, 3, 2, 1])], { type: 'image/png' })
    images.values.set(input.image.id, original)
    await expect(create().sendImage(activeId, input)).rejects.toThrow('already exists')
    expect(images.values.get(input.image.id)).toBe(original)
    expect(images.remove).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('keeps history intact when Blob saving fails', async () => {
    const original = serialize()
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockClear()
    images.put.mockRejectedValueOnce(new Error('Image storage unavailable'))
    await expect(create().sendImage(activeId, imageInput())).rejects.toThrow('Image storage unavailable')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(images.remove).not.toHaveBeenCalled()
  })

  it('cleans up the new Blob when metadata fails, preserves version 1, and supports a successful retry', async () => {
    const input = imageInput('metadata-failure')
    const original = serialize()
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(create().sendImage(activeId, input)).rejects.toThrow('Save failed')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(images.remove).toHaveBeenCalledWith(input.image.id)
    expect(images.values.size).toBe(0)
    const saved = await create().sendImage(activeId, input)
    expect(saved.messages.filter(item => item.id === input.clientMessageId)).toHaveLength(1)
    expect(images.values.size).toBe(1)
  })

  it('reuses an identical unreferenced Blob on retry after cleanup also failed', async () => {
    const input = imageInput('orphan-retry')
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    images.remove.mockRejectedValueOnce(new Error('Cleanup unavailable'))
    await expect(create().sendImage(activeId, input)).rejects.toThrow('Save failed')
    expect(images.values.get(input.image.id)).toBe(input.blob)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBeNull()
    const saved = await create().sendImage(activeId, input)
    expect(saved.messages.filter(item => item.id === input.clientMessageId)).toHaveLength(1)
    expect(images.values.size).toBe(1)
  })

  it('preserves other messages written while an image is being saved', async () => {
    const input = imageInput('interleaved')
    const put = images.put.getMockImplementation()!
    images.put.mockImplementationOnce(async (id, blob) => {
      await put(id, blob)
      await create().sendMessage(activeId, message('meanwhile', 'Another reply'))
      await create().sendMessage(waitingId, message('other-session', 'Other session reply'))
    })
    const saved = await create().sendImage(activeId, input)
    expect(saved.messages.map(item => item.id)).toContain('meanwhile')
    expect(lastMessage(saved).id).toBe(input.clientMessageId)
    expect((await create().list()).find(item => item.id === waitingId)!.messages.map(item => item.id)).toContain('other-session')
  })

  it('uses the original image and caption if the caller changes its draft during the asynchronous write', async () => {
    const input = imageInput('snapshot', 'Original caption')
    const originalImage = { ...input.image }
    const put = images.put.getMockImplementation()!
    images.put.mockImplementationOnce(async (id, blob) => {
      await put(id, blob)
      input.content = 'Edited caption'
      input.clientMessageId = 'different-message'
      input.image.name = 'Edited.png'
      input.image.id = 'different-image'
    })
    const saved = await create().sendImage(activeId, input)
    expect(lastMessage(saved)).toMatchObject({ id: 'message-snapshot', content: 'Original caption', image: originalImage })
  })

  it('does not remove a Blob that became referenced by another successful message while saving', async () => {
    const input = imageInput('referenced-during-save')
    const put = images.put.getMockImplementation()!
    images.put.mockImplementationOnce(async (id, blob) => {
      await put(id, blob)
      const sessions = structuredClone(consultationSeed)
      sessions[1]!.messages.push({ id: 'other-image-message', sender: 'doctor', content: '', image: { ...input.image }, time: new Date().toISOString() })
      storage.setItem(CONSULTATION_STORAGE_KEY, JSON.stringify({ version: 2, consultations: sessions }))
    })
    await expect(create().sendImage(activeId, input)).rejects.toThrow('already in use')
    expect(images.values.get(input.image.id)).toBe(input.blob)
    expect(images.remove).not.toHaveBeenCalled()
    expect((await create().list())[1]!.messages.some(item => item.id === 'other-image-message')).toBe(true)
  })

  it.each(['completed', 'roleChanged'] as const)('rechecks %s after asynchronous Blob storage and cleans up without appending', async change => {
    const input = imageInput(change)
    const put = images.put.getMockImplementation()!
    images.put.mockImplementationOnce(async (id, blob) => {
      await put(id, blob)
      if (change === 'completed') await create().complete(activeId)
      else role = 'admin'
    })
    await expect(create().sendImage(activeId, input)).rejects.toThrow(change === 'completed' ? 'completed' : 'read-only')
    expect((await create().list())[0]!.messages.some(item => item.id === input.clientMessageId)).toBe(false)
    expect(images.values.size).toBe(0)
    expect(images.remove).toHaveBeenCalledWith(input.image.id)
  })

  it('retains the Blob if history becomes unreadable after the write rather than risking referenced image deletion', async () => {
    const put = images.put.getMockImplementation()!
    images.put.mockImplementationOnce(async (id, blob) => {
      await put(id, blob)
      storage.setItem(CONSULTATION_STORAGE_KEY, '{damaged')
    })
    await expect(create().sendImage(activeId, imageInput())).rejects.toThrow('kept unchanged')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe('{damaged')
    expect(images.values.size).toBe(1)
    expect(images.remove).not.toHaveBeenCalled()
  })

  it('rejects new images for completed sessions, administrators and unknown sessions before touching Blob storage', async () => {
    await expect(create().sendImage(completedId, imageInput())).rejects.toThrow('completed')
    await expect(create().sendImage('unknown', imageInput())).rejects.toThrow('not found')
    role = 'admin'
    await expect(create().sendImage(activeId, imageInput())).rejects.toThrow('read-only')
    expect(images.put).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each([
    { id: '' }, { id: '../image' }, { name: '' }, { name: 'a'.repeat(256) },
    { mimeType: 'image/svg+xml' }, { size: 0 }, { size: CONSULTATION_IMAGE_SIZE_LIMIT + 1 },
    { size: 1.5 }, { width: 0 }, { width: Infinity }, { height: -1 }, { height: 1.1 },
    { width: CONSULTATION_IMAGE_PIXEL_LIMIT + 1, height: 1 },
  ])('rejects invalid image metadata %j before Blob saving', async fields => {
    const input = imageInput()
    Object.assign(input.image, fields)
    await expect(create().sendImage(activeId, input)).rejects.toThrow('Invalid image details')
    expect(images.put).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('rejects caption overflow, missing message IDs, and Blob metadata mismatches', async () => {
    await expect(create().sendImage(activeId, imageInput('long', 'x'.repeat(5001)))).rejects.toThrow('captions')
    await expect(create().sendImage(activeId, { ...imageInput(), clientMessageId: '' })).rejects.toThrow('identifier')
    await expect(create().sendImage(activeId, { ...imageInput(), blob: new Blob(['wrong size'], { type: 'image/png' }) })).rejects.toThrow('does not match')
    await expect(create().sendImage(activeId, { ...imageInput(), blob: new Blob(['1234'], { type: 'image/jpeg' }) })).rejects.toThrow('does not match')
    expect(images.put).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('accepts the documented image size, pixel and caption boundaries', async () => {
    const input = imageInput('boundary', 'x'.repeat(5000))
    input.blob = new Blob([new Uint8Array(CONSULTATION_IMAGE_SIZE_LIMIT)], { type: 'image/png' })
    Object.assign(input.image, { size: CONSULTATION_IMAGE_SIZE_LIMIT, width: 6000, height: 4000 })
    const saved = await create().sendImage(activeId, input)
    expect(lastMessage(saved).image).toEqual(input.image)
    expect(lastMessage(saved).content).toHaveLength(5000)
  })

  it.each(['v1Image', 'invalidImage', 'emptyText', 'duplicateImage'] as const)('protects malformed persisted image history: %s', async defect => {
    const sessions = structuredClone(consultationSeed)
    const input = imageInput()
    sessions[0]!.messages.push({ id: 'stored-image', sender: 'doctor', content: '', time: new Date().toISOString(), image: input.image })
    let version = 2
    if (defect === 'v1Image') version = 1
    if (defect === 'invalidImage') input.image.width = -1
    if (defect === 'emptyText') delete lastMessage(sessions[0]!).image
    if (defect === 'duplicateImage') sessions[1]!.messages.push({ ...lastMessage(sessions[0]!), id: 'another-message' })
    const original = JSON.stringify({ version, consultations: sessions })
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockClear()
    await expect(create().list()).rejects.toThrow('kept unchanged')
    await expect(create().sendImage(activeId, imageInput('fresh'))).rejects.toThrow('kept unchanged')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(images.put).not.toHaveBeenCalled()
  })
})

function summaryInput(fields: Partial<ConsultationSummaryInput> = {}): ConsultationSummaryInput {
  return {
    chiefComplaint: 'Elevated home readings',
    consultationNotes: 'Reviewed the readings reported during this consultation.',
    assessment: '',
    plan: '',
    followUp: '',
    ...fields,
  }
}

describe('local consultation summaries', () => {
  let storage: ReturnType<typeof memoryStorage>
  let images: ReturnType<typeof memoryImages>
  let role: Role
  const author = 'Dr. Riley Lin'
  const create = () => createLocalConsultationService({ storage: () => storage, role: () => role, imageStore: images })

  beforeEach(() => { storage = memoryStorage(); images = memoryImages(); role = 'doctor' })

  it('saves trimmed manual fields and author, restores after refresh, and preserves messages, status and unread count', async () => {
    const original = structuredClone(consultationSeed)
    original[0]!.unread = 3
    storage.setItem(CONSULTATION_STORAGE_KEY, serialize(original))
    const input = summaryInput({ chiefComplaint: '  Elevated readings  ', consultationNotes: '\nReviewed patient report.\n', assessment: '  Further review recorded  ', plan: '  ', followUp: '\n' })
    const saved = await create().saveSummary(activeId, input, `  ${author}  `)
    expect(saved.summary).toMatchObject({ chiefComplaint: 'Elevated readings', consultationNotes: 'Reviewed patient report.', assessment: 'Further review recorded', plan: '', followUp: '', authorName: author })
    expect(saved.summary!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(saved.updatedAt).toBe(saved.summary!.updatedAt)
    expect(saved.messages).toEqual(original[0]!.messages)
    expect(saved.status).toBe('active')
    expect(saved.unread).toBe(3)
    expect((await create().list())[0]).toEqual(saved)
    expect(JSON.parse(storage.getItem(CONSULTATION_STORAGE_KEY)!).version).toBe(3)
    expect(input.chiefComplaint).toBe('  Elevated readings  ')
  })

  it('reads version 2 images without rewriting and migrates them intact only after saving a summary', async () => {
    const original = structuredClone(consultationSeed)
    const image = imageInput('previous-image')
    original[0]!.messages.push({ id: image.clientMessageId, sender: 'doctor', content: '', image: image.image, time: '2026-09-27T08:00:00.000Z' })
    await images.put(image.image.id, image.blob)
    images.put.mockClear()
    const raw = JSON.stringify({ version: 2, consultations: original })
    storage.setItem(CONSULTATION_STORAGE_KEY, raw)
    storage.setItem.mockClear()
    expect(await create().list()).toEqual(original)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
    const saved = await create().saveSummary(activeId, summaryInput(), author)
    expect(saved.messages).toEqual(original[0]!.messages)
    expect(JSON.parse(storage.getItem(CONSULTATION_STORAGE_KEY)!).version).toBe(3)
    expect((await create().list())[0]!.messages).toEqual(original[0]!.messages)
    expect(images.put).not.toHaveBeenCalled()
    expect(images.remove).not.toHaveBeenCalled()
    expect(await images.get(image.image.id)).toBe(image.blob)
  })

  it('leaves an identical active-session summary unchanged without rewriting its timestamps', async () => {
    const input = summaryInput()
    const saved = await create().saveSummary(activeId, input, author)
    storage.setItem.mockClear()
    const retried = await create().saveSummary(activeId, { ...input, chiefComplaint: ` ${input.chiefComplaint} ` }, ` ${author} `)
    expect(retried).toEqual(saved)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('persists edited fields and updates the author independently of previous returned objects', async () => {
    const service = create()
    const first = await service.saveSummary(activeId, summaryInput(), author)
    const second = await service.saveSummary(activeId, summaryInput({ plan: 'Documented plan from physician.' }), 'Dr. Michael Zhou')
    expect(second.summary).toMatchObject({ plan: 'Documented plan from physician.', authorName: 'Dr. Michael Zhou' })
    expect(first.summary!.plan).toBe('')
    expect(first.summary!.authorName).toBe(author)
    second.summary!.plan = 'Unsaved edit'
    expect((await create().list())[0]!.summary!.plan).toBe('Documented plan from physician.')
    storage.setItem.mockClear()
    await service.saveSummary(activeId, summaryInput({ plan: 'Documented plan from physician.' }), author)
    expect(storage.setItem).toHaveBeenCalledOnce()
  })

  it('permits senior doctors and rejects administrators using the current role on every save', async () => {
    const service = create()
    role = 'seniorDoctor'
    const first = await service.saveSummary(activeId, summaryInput(), author)
    const original = storage.getItem(CONSULTATION_STORAGE_KEY)
    role = 'admin'
    storage.setItem.mockClear()
    await expect(service.saveSummary(activeId, summaryInput({ plan: 'Changed' }), author)).rejects.toThrow('read-only')
    await expect(service.saveSummary(activeId, summaryInput(), author)).rejects.toThrow('read-only')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect((await service.list())[0]).toEqual(first)
  })

  it('requires accepting a waiting consultation and never reopens a completed consultation', async () => {
    await expect(create().saveSummary(waitingId, summaryInput(), author)).rejects.toThrow('Accept the consultation')
    await expect(create().saveSummary(completedId, summaryInput(), author)).rejects.toThrow('read-only')
    expect(storage.setItem).not.toHaveBeenCalled()
    const service = create()
    await service.accept(waitingId)
    const saved = await service.saveSummary(waitingId, summaryInput(), author)
    const completed = await service.complete(waitingId)
    expect(completed.summary).toEqual(saved.summary)
    const original = storage.getItem(CONSULTATION_STORAGE_KEY)
    await expect(create().saveSummary(waitingId, summaryInput(), author)).rejects.toThrow('read-only')
    await expect(create().saveSummary(waitingId, summaryInput({ plan: 'Change after completion' }), author)).rejects.toThrow('read-only')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
  })

  it('rejects nonexistent consultations without writing', async () => {
    await expect(create().saveSummary('missing', summaryInput(), author)).rejects.toThrow('not found')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['chiefComplaint', 'consultationNotes'] as const)('requires nonempty %s', async field => {
    await expect(create().saveSummary(activeId, summaryInput({ [field]: ' \n\t ' }), author)).rejects.toThrow('required')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(Object.keys(CONSULTATION_SUMMARY_LIMITS) as Array<keyof ConsultationSummaryInput>)('enforces the %s limit after trimming and accepts the exact boundary', async field => {
    const limit = CONSULTATION_SUMMARY_LIMITS[field]
    await expect(create().saveSummary(activeId, summaryInput({ [field]: 'x'.repeat(limit + 1) }), author)).rejects.toThrow(`at most ${limit}`)
    expect(storage.setItem).not.toHaveBeenCalled()
    const saved = await create().saveSummary(activeId, summaryInput({ [field]: `  ${'x'.repeat(limit)}  ` }), author)
    expect(saved.summary![field]).toHaveLength(limit)
  })

  it.each([undefined, null, [], 'summary', 42, {}, { chiefComplaint: 'Present', consultationNotes: 'Present' }, summaryInput({ plan: 12 as unknown as string }), summaryInput({ consultationNotes: null as unknown as string })])('rejects invalid payload types and missing fields: %j', async input => {
    await expect(create().saveSummary(activeId, input as ConsultationSummaryInput, author)).rejects.toThrow('valid text')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['', '   ', 'a'.repeat(201), null, undefined, 123])('rejects an invalid summary author: %j', async value => {
    await expect(create().saveSummary(activeId, summaryInput(), value as string)).rejects.toThrow('author name')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('accepts an author at the boundary and ignores extra input properties rather than letting callers replace author or timestamp', async () => {
    const input = { ...summaryInput(), authorName: 'Injected', updatedAt: 'Yesterday', unexpected: 'Ignored' }
    const saved = await create().saveSummary(activeId, input, 'a'.repeat(200))
    expect(saved.summary!.authorName).toBe('a'.repeat(200))
    expect(saved.summary!.updatedAt).not.toBe('Yesterday')
    expect(saved.summary).not.toHaveProperty('unexpected')
  })

  it.each(['initial', 'update'] as const)('keeps saved history and returned objects unchanged when an %s summary write fails', async mode => {
    storage.setItem(CONSULTATION_STORAGE_KEY, serialize())
    const service = create()
    if (mode === 'update') await service.saveSummary(activeId, summaryInput(), author)
    const original = storage.getItem(CONSULTATION_STORAGE_KEY)
    const previouslyReturned = await service.list()
    const snapshot = structuredClone(previouslyReturned)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(service.saveSummary(activeId, summaryInput({ plan: 'New plan' }), author)).rejects.toThrow('Save failed')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(previouslyReturned).toEqual(snapshot)
    expect(await create().list()).toEqual(snapshot)
    expect((await service.saveSummary(activeId, summaryInput({ plan: 'New plan' }), author)).summary!.plan).toBe('New plan')
  })

  it('preserves a summary through text messages, image messages, acceptance and completion', async () => {
    const service = create()
    const summary = (await service.saveSummary(activeId, summaryInput(), author)).summary
    expect((await service.sendMessage(activeId, message('after-summary'))).summary).toEqual(summary)
    expect((await service.sendImage(activeId, imageInput('after-summary'))).summary).toEqual(summary)
    expect((await service.accept(activeId)).summary).toEqual(summary)
    expect((await service.complete(activeId)).summary).toEqual(summary)
    expect((await create().list())[0]!.summary).toEqual(summary)
  })

  it('preserves a summary saved while an asynchronous image write is pending', async () => {
    const put = images.put.getMockImplementation()!
    images.put.mockImplementationOnce(async (id, blob) => {
      await put(id, blob)
      await create().saveSummary(activeId, summaryInput(), author)
    })
    const saved = await create().sendImage(activeId, imageInput('during-summary'))
    expect(saved.summary).toMatchObject({ ...summaryInput(), authorName: author })
    expect(lastMessage(saved).id).toBe('message-during-summary')
  })

  it.each([1, 2])('rejects summaries unexpectedly present in version %s instead of dropping or rewriting them', async version => {
    const sessions = structuredClone(consultationSeed)
    sessions[0]!.summary = { ...summaryInput(), authorName: author, updatedAt: '2026-09-27T10:00:00.000Z' }
    const original = JSON.stringify({ version, consultations: sessions })
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockClear()
    await expect(create().list()).rejects.toThrow('kept unchanged')
    await expect(create().saveSummary(activeId, summaryInput(), author)).rejects.toThrow('kept unchanged')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each([
    null,
    {},
    { ...summaryInput(), chiefComplaint: '', authorName: 'Author', updatedAt: '2026-09-27T10:00:00Z' },
    { ...summaryInput(), plan: 1, authorName: 'Author', updatedAt: '2026-09-27T10:00:00Z' },
    { ...summaryInput(), followUp: 'a'.repeat(2001), authorName: 'Author', updatedAt: '2026-09-27T10:00:00Z' },
    { ...summaryInput(), authorName: '', updatedAt: '2026-09-27T10:00:00Z' },
    { ...summaryInput(), authorName: 'a'.repeat(201), updatedAt: '2026-09-27T10:00:00Z' },
    { ...summaryInput(), authorName: 'Author', updatedAt: 'Yesterday' },
    { ...summaryInput(), authorName: 'Author', updatedAt: '2026-09-27T10:00:00' },
    { ...summaryInput(), authorName: 'Author', updatedAt: '2026-02-30T10:00:00Z' },
    { ...summaryInput(), authorName: 'Author', updatedAt: '2026-09-27T24:00:00Z' },
    { ...summaryInput(), authorName: 'Author', updatedAt: '2026-09-27T10:00:00+24:00' },
    { ...summaryInput(), authorName: 'Author', updatedAt: '2026-09-27T10:00:00Z', unexpected: 'unsupported' },
  ])('protects malformed version 3 summaries from all writes: %j', async summary => {
    const sessions = structuredClone(consultationSeed)
    sessions[0]!.summary = summary as ConsultationSession['summary']
    const original = JSON.stringify({ version: 3, consultations: sessions })
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockClear()
    await expect(create().list()).rejects.toThrow('kept unchanged')
    await expect(create().saveSummary(activeId, summaryInput(), author)).rejects.toThrow('kept unchanged')
    await expect(create().sendMessage(activeId, message())).rejects.toThrow('kept unchanged')
    await expect(create().accept(activeId)).rejects.toThrow('kept unchanged')
    await expect(create().complete(activeId)).rejects.toThrow('kept unchanged')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['2026-09-27T10:00:00Z', '2026-09-27T18:00:00+08:00', '2024-02-29T10:00:00.123Z'])('accepts a valid complete ISO summary timestamp: %s', updatedAt => {
    const sessions = structuredClone(consultationSeed)
    sessions[0]!.summary = { ...summaryInput(), authorName: author, updatedAt }
    storage.setItem(CONSULTATION_STORAGE_KEY, JSON.stringify({ version: 3, consultations: sessions }))
    return expect(create().list()).resolves.toEqual(sessions)
  })
})

const demoRequest = (fields: Partial<DemoConsultationRequestInput> = {}): DemoConsultationRequestInput => ({
  clientRequestId: 'request-1', patientId: 'patient-1', patientName: 'Fictional Patient', complaint: 'Demo follow-up', content: 'Could you review these fictional readings?', ...fields,
})

describe('demo consultation request lifecycle', () => {
  let storage: ReturnType<typeof memoryStorage>
  let images: ReturnType<typeof memoryImages>
  let role: Role
  const create = () => createLocalConsultationService({ storage: () => storage, role: () => role, imageStore: images })

  beforeEach(() => { storage = memoryStorage(); images = memoryImages(); role = 'doctor' })

  it('creates a waiting request with a patient message, stable identifiers, one unread item and ISO times', async () => {
    const input = { ...demoRequest({ patientName: ' Fictional Patient ', content: '\nHello doctor\n' }), status: 'completed', unread: 9, summary: {} }
    const saved = await create().createDemoRequest(input)
    expect(saved).toMatchObject({ id: 'C-DEMO-request-1', patientId: 'patient-1', patientName: 'Fictional Patient', complaint: 'Demo follow-up', status: 'waiting', unread: 1 })
    expect(saved.messages).toHaveLength(1)
    expect(saved.messages[0]).toMatchObject({ id: 'M-DEMO-request-1', sender: 'patient', content: 'Hello doctor', time: saved.updatedAt })
    expect(new Date(saved.updatedAt).toISOString()).toBe(saved.updatedAt)
    expect(saved.summary).toBeUndefined()
    const restored = await create().list()
    expect(restored[0]).toEqual(saved)
    expect(restored.slice(1)).toEqual(consultationSeed)
    expect(images.put).not.toHaveBeenCalled()
  })

  it('deduplicates retried requests even after the consultation has progressed without clearing later history', async () => {
    const service = create()
    const saved = await service.createDemoRequest(demoRequest())
    await service.accept(saved.id)
    await service.sendMessage(saved.id, message('doctor-reply'))
    const completed = await service.complete(saved.id)
    storage.setItem.mockClear()
    expect(await create().createDemoRequest(demoRequest())).toEqual(completed)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect((await create().list()).filter(item => item.id === saved.id)).toHaveLength(1)
  })

  it('preserves patient IDs as opaque strings rather than trimming or parsing them', async () => {
    const patientId = ' patient:some/opaque-ID 中文 '
    const saved = await create().createDemoRequest(demoRequest({ patientId }))
    expect(saved.patientId).toBe(patientId)
    expect((await create().list()).find(item => item.id === saved.id)!.patientId).toBe(patientId)
  })

  it.each(['patientId', 'patientName', 'complaint', 'content'] as const)('rejects an existing request identifier with a changed %s', async field => {
    await create().createDemoRequest(demoRequest())
    const original = storage.getItem(CONSULTATION_STORAGE_KEY)
    await expect(create().createDemoRequest(demoRequest({ [field]: 'Different' }))).rejects.toThrow('different content')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
  })

  it.each(['clientRequestId', 'patientId', 'patientName', 'complaint', 'content'] as const)('enforces the required and bounded %s request field', async field => {
    const limits = { clientRequestId: 200, patientId: 200, patientName: 200, complaint: 1000, content: 5000 }
    await expect(create().createDemoRequest(demoRequest({ [field]: '  ' }))).rejects.toThrow('required')
    await expect(create().createDemoRequest(demoRequest({ [field]: 'x'.repeat(limits[field] + 1) }))).rejects.toThrow('at most')
    expect(storage.setItem).not.toHaveBeenCalled()
    await expect(create().createDemoRequest(demoRequest({ [field]: 'x'.repeat(limits[field]) }))).resolves.toBeDefined()
  })

  it.each([null, [], 'wrong', 7, {}, { ...demoRequest(), patientName: 7 }])('rejects malformed request payloads: %j', async input => {
    await expect(create().createDemoRequest(input as DemoConsultationRequestInput)).rejects.toThrow()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('preserves an intentionally empty store when request saving fails, then creates only one request on retry', async () => {
    const original = serialize([])
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(create().createDemoRequest(demoRequest())).rejects.toThrow('Save failed')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    await create().createDemoRequest(demoRequest())
    expect(await create().list()).toHaveLength(1)
  })

  it.each([activeId, waitingId])('receives patient text without changing session state, existing messages, or summary: %s', async id => {
    const service = create()
    if (id === activeId) await service.saveSummary(id, summaryInput(), 'Physician')
    const before = (await service.list()).find(item => item.id === id)!
    const received = await service.receiveDemoMessage(id, message('incoming-text', '  New patient reply  '))
    expect(received.status).toBe(before.status)
    expect(received.summary).toEqual(before.summary)
    expect(received.messages.slice(0, -1)).toEqual(before.messages)
    expect(lastMessage(received)).toMatchObject({ id: 'incoming-text', sender: 'patient', content: 'New patient reply' })
    expect(received.unread).toBe(before.unread + 1)
    expect(received.updatedAt).toBe(lastMessage(received).time)
    storage.setItem.mockClear()
    expect(await create().receiveDemoMessage(id, message('incoming-text', 'New patient reply'))).toEqual(received)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('prevents patient retries from colliding with doctor messages or replacing another incoming message', async () => {
    await create().sendMessage(activeId, message('doctor-id', 'Same text'))
    await expect(create().receiveDemoMessage(activeId, message('doctor-id', 'Same text'))).rejects.toThrow('different content')
    await create().receiveDemoMessage(activeId, message('patient-id', 'Original'))
    const original = storage.getItem(CONSULTATION_STORAGE_KEY)
    await expect(create().receiveDemoMessage(activeId, message('patient-id', 'Changed'))).rejects.toThrow('different content')
    await expect(create().receiveDemoMessage(activeId, { ...imageInput('mismatch'), clientMessageId: 'patient-id', content: 'Original' })).rejects.toThrow('different content')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
    expect(images.put).not.toHaveBeenCalled()
  })

  it('receives captionless patient images with persistence and retry deduplication, keeping a waiting session waiting', async () => {
    const input = imageInput('patient-image')
    const saved = await create().receiveDemoMessage(waitingId, input)
    expect(saved.status).toBe('waiting')
    expect(saved.unread).toBe(consultationSeed[1]!.unread + 1)
    expect(lastMessage(saved)).toMatchObject({ sender: 'patient', content: '', image: input.image })
    expect((await create().list())[1]).toEqual(saved)
    storage.setItem.mockClear(); images.put.mockClear()
    expect(await create().receiveDemoMessage(waitingId, input)).toEqual(saved)
    expect(images.put).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    await expect(create().sendImage(waitingId, input)).rejects.toThrow('different content')
  })

  it('retains concurrent text and summary updates while a patient image is being written', async () => {
    const put = images.put.getMockImplementation()!
    images.put.mockImplementationOnce(async (id, blob) => {
      await put(id, blob)
      await create().receiveDemoMessage(activeId, message('concurrent-patient', 'Another patient reply'))
      await create().saveSummary(activeId, summaryInput(), 'Physician')
    })
    const saved = await create().receiveDemoMessage(activeId, imageInput('concurrent-image'))
    expect(saved.unread).toBe(2)
    expect(saved.summary).toMatchObject(summaryInput())
    expect(saved.messages.some(item => item.id === 'concurrent-patient')).toBe(true)
    expect(lastMessage(saved).sender).toBe('patient')
  })

  it('keeps history untouched on incoming image metadata failure and supports a clean retry', async () => {
    storage.setItem(CONSULTATION_STORAGE_KEY, serialize())
    const before = storage.getItem(CONSULTATION_STORAGE_KEY)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    const input = imageInput('incoming-failure')
    await expect(create().receiveDemoMessage(waitingId, input)).rejects.toThrow('Save failed')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(before)
    expect(images.values.size).toBe(0)
    const saved = await create().receiveDemoMessage(waitingId, input)
    expect(saved.unread).toBe(3)
    expect(saved.messages.filter(item => item.id === input.clientMessageId)).toHaveLength(1)
  })

  it.each(['complete', 'role'] as const)('rejects incoming image commit if %s changes during the Blob write', async operation => {
    const put = images.put.getMockImplementation()!
    images.put.mockImplementationOnce(async (id, blob) => {
      await put(id, blob)
      if (operation === 'complete') await create().complete(activeId)
      else role = 'admin'
    })
    await expect(create().receiveDemoMessage(activeId, imageInput('changed-state'))).rejects.toThrow(operation === 'complete' ? 'completed' : 'read-only')
    expect((await create().list())[0]!.messages.some(item => item.id === 'message-changed-state')).toBe(false)
    expect(images.values.size).toBe(0)
  })

  it('rejects all new incoming messages on completed sessions before writing image files', async () => {
    await expect(create().receiveDemoMessage(completedId, message())).rejects.toThrow('completed')
    await expect(create().receiveDemoMessage(completedId, imageInput())).rejects.toThrow('completed')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(images.put).not.toHaveBeenCalled()
  })

  it.each([
    null, {}, { content: 42, clientMessageId: 'one' }, message('', 'text'), message('x'.repeat(201), 'text'),
    message('empty', ''), message('large', 'x'.repeat(5001)),
    { ...message(), image: imageInput().image }, { ...message(), blob: imageInput().blob },
  ])('rejects malformed or incomplete incoming messages: %j', async input => {
    await expect(create().receiveDemoMessage(activeId, input as DemoConsultationMessageInput)).rejects.toThrow()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(images.put).not.toHaveBeenCalled()
  })

  it('marks read persistently without changing session status, timestamps, messages or summary', async () => {
    const service = create()
    await service.saveSummary(activeId, summaryInput(), 'Physician')
    const before = await service.receiveDemoMessage(activeId, message('unread-text'))
    const saved = await service.markRead(activeId)
    expect(saved).toEqual({ ...before, unread: 0 })
    expect((await create().list())[0]).toEqual(saved)
    storage.setItem.mockClear()
    expect(await create().markRead(activeId)).toEqual(saved)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('marks a waiting session as read without accepting it or changing its legacy time', async () => {
    const before = consultationSeed[1]!
    expect(await create().markRead(waitingId)).toEqual({ ...before, unread: 0 })
  })

  it.each(['text', 'read'] as const)('preserves previous history when the %s operation cannot save', async operation => {
    const original = serialize()
    storage.setItem(CONSULTATION_STORAGE_KEY, original)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(operation === 'text' ? create().receiveDemoMessage(waitingId, message()) : create().markRead(waitingId)).rejects.toThrow('Save failed')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(original)
  })

  it('rejects writes for administrators and unknown sessions without changing any data', async () => {
    await expect(create().receiveDemoMessage('missing', message())).rejects.toThrow('not found')
    await expect(create().markRead('missing')).rejects.toThrow('not found')
    role = 'admin'
    await expect(create().createDemoRequest(demoRequest())).rejects.toThrow('read-only')
    await expect(create().receiveDemoMessage(activeId, message())).rejects.toThrow('read-only')
    await expect(create().receiveDemoMessage(activeId, imageInput())).rejects.toThrow('read-only')
    await expect(create().markRead(waitingId)).rejects.toThrow('read-only')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(images.put).not.toHaveBeenCalled()
    role = 'seniorDoctor'
    await expect(create().createDemoRequest(demoRequest())).resolves.toMatchObject({ status: 'waiting' })
  })

  it('never overwrites damaged history through a new request, incoming message or read receipt', async () => {
    storage.setItem(CONSULTATION_STORAGE_KEY, '{damaged')
    storage.setItem.mockClear()
    await expect(create().createDemoRequest(demoRequest())).rejects.toThrow('kept unchanged')
    await expect(create().receiveDemoMessage(activeId, message())).rejects.toThrow('kept unchanged')
    await expect(create().markRead(waitingId)).rejects.toThrow('kept unchanged')
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe('{damaged')
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
