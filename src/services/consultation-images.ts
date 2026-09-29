import type { ConsultationImage } from '@/types/clinical'

export const CONSULTATION_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const CONSULTATION_IMAGE_MAX_PIXELS = 24_000_000
const DATABASE_NAME = 'doctor-platform-consultation-images'
const STORE_NAME = 'images'
type ImageMimeType = ConsultationImage['mimeType']
type ImageDimensions = { width: number; height: number }
type ImageDecoder = (url: string) => Promise<ImageDimensions>

export interface ConsultationImageStore {
  put(id: string, blob: Blob): Promise<void>
  get(id: string): Promise<Blob>
  remove(id: string): Promise<void>
}

function storageError(action: string, error?: DOMException | null) {
  if (error?.name === 'ConstraintError') {
    return new Error('This image identifier already exists in local storage. Select the image again to create a new attachment; the saved image has not been replaced.')
  }
  if (error?.name === 'QuotaExceededError') {
    return new Error('Image storage is full. Free browser storage space and retry. Your selected image has been kept.')
  }
  return new Error(`Unable to ${action} local consultation images. Check browser storage permissions and retry.`)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support local image storage. Please use a browser with IndexedDB enabled.'))
      return
    }
    let request: IDBOpenDBRequest
    try { request = indexedDB.open(DATABASE_NAME, 1) }
    catch { reject(storageError('open')); return }
    let rejected = false
    request.onblocked = () => {
      rejected = true
      reject(new Error('Image storage is blocked by another open page. Close other tabs for this app and retry.'))
    }
    request.onupgradeneeded = () => {
      if (rejected) { request.transaction?.abort(); return }
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
    }
    request.onerror = () => { rejected = true; reject(storageError('open', request.error)) }
    request.onsuccess = () => {
      const database = request.result
      if (rejected) { database.close(); return }
      database.onversionchange = () => database.close()
      resolve(database)
    }
  })
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  action: string,
  requestFor: (store: IDBObjectStore) => IDBRequest,
  resultFor: (result: unknown) => T,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    let request: IDBRequest
    try {
      transaction = database.transaction(STORE_NAME, mode)
      request = requestFor(transaction.objectStore(STORE_NAME))
    } catch {
      database.close()
      reject(storageError(action))
      return
    }
    let result: unknown
    let failure: Error | undefined
    request.onsuccess = () => { result = request.result }
    request.onerror = () => { failure = storageError(action, request.error) }
    transaction.onerror = () => { failure ??= storageError(action, transaction.error) }
    transaction.onabort = () => {
      database.close()
      reject(failure ?? storageError(action, transaction.error))
    }
    // A successful request alone does not guarantee that its transaction was committed.
    transaction.oncomplete = () => {
      database.close()
      try { resolve(resultFor(result)) }
      catch (error) { reject(error) }
    }
  })
}

function checkId(id: string) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('An image identifier is required.')
}

export const consultationImageStore: ConsultationImageStore = {
  async put(id, blob) {
    checkId(id)
    if (!(blob instanceof Blob)) throw new Error('Select a valid image file before saving.')
    // Never overwrite a blob that another saved message may already reference.
    await runTransaction('readwrite', 'save', store => store.add(blob, id), () => undefined)
  },
  async get(id) {
    checkId(id)
    return runTransaction('readonly', 'read', store => store.get(id), result => {
      if (result === undefined) throw new Error('This image is missing from this browser. Its message is still available, but the image file could not be found.')
      if (!(result instanceof Blob)) throw new Error('This stored image is damaged and cannot be displayed. Its message has been kept unchanged.')
      return result
    })
  },
  async remove(id) {
    checkId(id)
    await runTransaction('readwrite', 'remove', store => store.delete(id), () => undefined)
  },
}

export function validateConsultationImageFile(file: Pick<File, 'size' | 'type'>): ImageMimeType {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.')
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('The selected image file is empty or invalid.')
  if (file.size > CONSULTATION_IMAGE_MAX_BYTES) throw new Error('Images must be no larger than 5 MiB.')
  return file.type as ImageMimeType
}

function detectMimeType(bytes: Uint8Array): ImageMimeType | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if ([0x52, 0x49, 0x46, 0x46].every((byte, index) => bytes[index] === byte)
    && [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte)) return 'image/webp'
  return undefined
}

function decodeBrowserImage(url: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      image.onload = null
      image.onerror = null
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      image.onload = null
      image.onerror = null
      reject(new Error('The selected image cannot be decoded. Choose an undamaged JPEG, PNG, or WebP file.'))
    }
    image.src = url
  })
}

export async function prepareConsultationImage(
  file: File,
  decode: ImageDecoder = decodeBrowserImage,
): Promise<{ image: ConsultationImage; blob: Blob; previewUrl: string }> {
  const mimeType = validateConsultationImageFile(file)
  let header: Uint8Array
  try { header = new Uint8Array(await file.slice(0, 12).arrayBuffer()) }
  catch { throw new Error('The selected image could not be read. Choose the file again and retry.') }
  if (detectMimeType(header) !== mimeType) {
    throw new Error('The image contents do not match its declared file type. Choose an original JPEG, PNG, or WebP file.')
  }
  let previewUrl: string
  try { previewUrl = URL.createObjectURL(file) }
  catch { throw new Error('Unable to preview the selected image. Choose the file again and retry.') }
  try {
    let dimensions: ImageDimensions
    try { dimensions = await decode(previewUrl) }
    catch { throw new Error('The selected image cannot be decoded. Choose an undamaged JPEG, PNG, or WebP file.') }
    const { width, height } = dimensions
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      throw new Error('The selected image has invalid dimensions.')
    }
    if (width * height > CONSULTATION_IMAGE_MAX_PIXELS) throw new Error('Images must contain no more than 24 megapixels.')
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      throw new Error('This browser cannot create image identifiers. Open the app in a secure browser context and retry.')
    }
    return {
      image: { id: crypto.randomUUID(), name: file.name, mimeType, size: file.size, width, height },
      // Keep the original bytes. The caller owns the returned preview URL and must revoke it when finished.
      blob: file,
      previewUrl,
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error
  }
}
