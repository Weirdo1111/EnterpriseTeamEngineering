import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { CONSULTATION_IMAGE_MAX_BYTES, consultationImageStore, prepareConsultationImage, validateConsultationImageFile } from './consultation-images'

const signatures = {
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
} as const

function fileFor(type: keyof typeof signatures, bytes: readonly number[] = signatures[type]) {
  return new File([new Uint8Array(bytes)], 'patient-image', { type })
}

describe('consultation image preparation', () => {
  let createUrl: MockInstance<typeof URL.createObjectURL>
  let revokeUrl: MockInstance<typeof URL.revokeObjectURL>
  const decode = vi.fn(async () => ({ width: 1200, height: 800 }))

  beforeEach(() => {
    createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-preview')
    revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    decode.mockReset().mockResolvedValue({ width: 1200, height: 800 })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it.each(['image/jpeg', 'image/png', 'image/webp'] as const)('prepares %s with matching signature and preserves original bytes', async type => {
    const file = fileFor(type)
    const prepared = await prepareConsultationImage(file, decode)
    expect(prepared.image).toMatchObject({ name: file.name, mimeType: type, size: file.size, width: 1200, height: 800 })
    expect(prepared.image.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(prepared.blob).toBe(file)
    expect(await prepared.blob.arrayBuffer()).toEqual(await file.arrayBuffer())
    expect(prepared.previewUrl).toBe('blob:local-preview')
    expect(decode).toHaveBeenCalledWith(prepared.previewUrl)
    expect(revokeUrl).not.toHaveBeenCalled()
  })

  it('allocates a different attachment ID for separate selections', async () => {
    const file = fileFor('image/png')
    const first = await prepareConsultationImage(file, decode)
    const second = await prepareConsultationImage(file, decode)
    expect(second.image.id).not.toBe(first.image.id)
  })

  it.each(['image/svg+xml', 'image/gif', 'application/pdf', ''])('rejects unsupported declared file type %s before creating a preview', async type => {
    await expect(prepareConsultationImage(new File(['content'], 'image.png', { type }), decode)).rejects.toThrow('JPEG, PNG, or WebP')
    expect(createUrl).not.toHaveBeenCalled()
    expect(decode).not.toHaveBeenCalled()
  })

  it('accepts exactly 5 MiB and rejects oversized or empty files', () => {
    expect(validateConsultationImageFile({ size: CONSULTATION_IMAGE_MAX_BYTES, type: 'image/png' })).toBe('image/png')
    expect(() => validateConsultationImageFile({ size: CONSULTATION_IMAGE_MAX_BYTES + 1, type: 'image/png' })).toThrow('5 MiB')
    expect(() => validateConsultationImageFile({ size: 0, type: 'image/png' })).toThrow('empty')
  })

  it.each([
    ['image/jpeg', signatures['image/png']],
    ['image/png', signatures['image/jpeg']],
    ['image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]],
    ['image/png', [0x89, 0x50, 0x4e]],
  ] as const)('rejects mismatched or incomplete magic bytes for %s', async (type, bytes) => {
    await expect(prepareConsultationImage(fileFor(type, bytes), decode)).rejects.toThrow('do not match')
    expect(createUrl).not.toHaveBeenCalled()
    expect(decode).not.toHaveBeenCalled()
  })

  it('rejects a file that cannot be read without allocating a preview', async () => {
    const file = fileFor('image/png')
    vi.spyOn(file, 'slice').mockImplementation(() => { throw new Error('Access denied') })
    await expect(prepareConsultationImage(file, decode)).rejects.toThrow('could not be read')
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('requires image decoding after signature validation and releases the failed preview', async () => {
    decode.mockRejectedValueOnce(new Error('Invalid image data'))
    await expect(prepareConsultationImage(fileFor('image/jpeg'), decode)).rejects.toThrow('cannot be decoded')
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:local-preview')
  })

  it.each([
    { width: 0, height: 100 },
    { width: 100, height: -1 },
    { width: 1.5, height: 100 },
    { width: Number.NaN, height: 100 },
  ])('rejects invalid decoded dimensions and releases the preview: %j', async dimensions => {
    decode.mockResolvedValueOnce(dimensions)
    await expect(prepareConsultationImage(fileFor('image/png'), decode)).rejects.toThrow('invalid dimensions')
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:local-preview')
  })

  it('allows exactly 24 megapixels and rejects larger images with preview cleanup', async () => {
    decode.mockResolvedValueOnce({ width: 6000, height: 4000 })
    expect((await prepareConsultationImage(fileFor('image/webp'), decode)).image.width).toBe(6000)
    decode.mockResolvedValueOnce({ width: 6001, height: 4000 })
    await expect(prepareConsultationImage(fileFor('image/webp'), decode)).rejects.toThrow('24 megapixels')
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:local-preview')
  })

  it('releases the preview if a secure image identifier cannot be generated', async () => {
    vi.stubGlobal('crypto', {})
    await expect(prepareConsultationImage(fileFor('image/png'), decode)).rejects.toThrow('image identifiers')
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:local-preview')
  })
})

describe('consultation image storage availability', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports unavailable IndexedDB clearly for storage operations', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(consultationImageStore.put('image-1', new Blob(['bytes']))).rejects.toThrow('IndexedDB')
    await expect(consultationImageStore.get('image-1')).rejects.toThrow('IndexedDB')
    await expect(consultationImageStore.remove('image-1')).rejects.toThrow('IndexedDB')
  })

  it('rejects empty image identifiers before accessing storage', async () => {
    await expect(consultationImageStore.put(' ', new Blob(['bytes']))).rejects.toThrow('identifier')
    await expect(consultationImageStore.get('')).rejects.toThrow('identifier')
    await expect(consultationImageStore.remove('')).rejects.toThrow('identifier')
  })
})
