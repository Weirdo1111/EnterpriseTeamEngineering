import type { DbUser, UserLookup } from '../db.js'
import { CloudFaceError, type FaceVerifier } from './tencent-face.js'

export const FACE_FAILURE = 'Face verification failed. Please retry or use another sign-in method.'
export const MAX_FACE_BASE64 = 2_800_000
export class FaceAuthError extends Error {
  constructor(public status = 401) { super(status === 429 ? 'Too many attempts. Try again later.' : FACE_FAILURE) }
}
export interface FaceLimits {
  ip(ip: string): Promise<void>
  account(account: string): Promise<void>
}
export interface FaceAuth {
  limitIp(ip: string): Promise<void>
  verify(account: string, image: string): Promise<DbUser>
}

// Canonical Base64 JPEG/PNG only; the cloud service performs full decoding and quality checks.
export function validFaceImage(image: unknown): image is string {
  if (typeof image !== 'string' || image.length < 16 || image.length > MAX_FACE_BASE64 || image.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return false
  const bytes = Buffer.from(image, 'base64')
  if (bytes.toString('base64') !== image) return false
  return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
}
const eligible = (user: DbUser | null): user is DbUser => Boolean(user && user.status === 'active' && ['doctor', 'seniorDoctor', 'admin'].includes(user.role) && user.tencent_person_id)
export function createFaceAuth(users: UserLookup, verifyFace: FaceVerifier, limits: FaceLimits,
  log: (event: Record<string, string | undefined>) => void = event => console.warn('Face authentication', event),
): FaceAuth {
  return {
    limitIp: ip => limits.ip(ip),
    async verify(account, image) {
      // All attempts count, even unknown accounts and successes; no reset-based bypass.
      await limits.account(account)
      try {
        const user = await users.byAccount(account)
        if (!eligible(user)) { log({ code: 'NotEligible' }); throw new FaceAuthError() }
        const personId = user.tencent_person_id!
        if (!await verifyFace(personId, image)) { log({ code: 'NotMatched' }); throw new FaceAuthError() }
        // Cloud calls are asynchronous: re-read status, role and mapping before issuing any JWT.
        const current = await users.byId(user.id)
        if (!eligible(current) || current.tencent_person_id !== personId) { log({ code: 'AccountChanged' }); throw new FaceAuthError() }
        return current
      } catch (error) {
        if (error instanceof FaceAuthError) throw error
        log(error instanceof CloudFaceError ? { code: error.code, requestId: error.requestId } : { code: 'InternalFailure' })
        throw new FaceAuthError()
      }
    },
  }
}
