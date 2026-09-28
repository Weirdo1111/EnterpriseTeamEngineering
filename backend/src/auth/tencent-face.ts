import { createHash, createHmac } from 'node:crypto'

export type FaceVerifier = (personId: string, image: string) => Promise<boolean>
export class CloudFaceError extends Error {
  constructor(public code: string, public requestId?: string) { super('Face provider unavailable') }
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const hmac = (key: string | Buffer, text: string) => createHmac('sha256', key).update(text).digest()
const safeCode = (value: unknown) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9.]{0,95}$/.test(value) ? value : 'ProviderError'
const safeId = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value) ? value : undefined

// Tencent Cloud API 2020-03-03, signed using the documented TC3-HMAC-SHA256 scheme.
// Only the server-supplied PersonId is sent. No Url or browser-supplied options are accepted.
export function createTencentFaceVerifier(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): FaceVerifier {
  const secretId = env.TENCENT_SECRET_ID
  const secretKey = env.TENCENT_SECRET_KEY
  const region = env.TENCENT_FACE_REGION
  const threshold = Number(env.TENCENT_FACE_THRESHOLD || 60)
  return async (personId, image) => {
    if (env.TENCENT_FACE_ENABLED !== 'true') throw new CloudFaceError('Disabled')
    if (!secretId || !secretKey || !region || !/^[a-z]+-[a-z]+(?:-\d+)?$/.test(region) || !Number.isFinite(threshold) || threshold < 60 || threshold > 100) {
      throw new CloudFaceError('InvalidConfiguration')
    }
    const payload = JSON.stringify({ PersonId: personId, Image: image, QualityControl: 3 })
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
    const host = 'iai.tencentcloudapi.com'
    const contentType = 'application/json; charset=utf-8'
    const signedHeaders = 'content-type;host;x-tc-action'
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:verifyface\n`
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(payload)}`
    const scope = `${date}/iai/tc3_request`
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonicalRequest)}`
    const signingKey = hmac(hmac(hmac(`TC3${secretKey}`, date), 'iai'), 'tc3_request')
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
    try {
      const response = await fetcher(`https://${host}/`, {
        method: 'POST', signal: AbortSignal.timeout(8000), redirect: 'error',
        headers: {
          'Content-Type': contentType,
          Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
          'X-TC-Action': 'VerifyFace', 'X-TC-Version': '2020-03-03',
          'X-TC-Region': region, 'X-TC-Timestamp': String(timestamp),
          ...(env.TENCENT_SESSION_TOKEN ? { 'X-TC-Token': env.TENCENT_SESSION_TOKEN } : {}),
        },
        body: payload,
      })
      if (!response.ok) throw new CloudFaceError('HttpError')
      const data = await response.json() as { Response?: { Error?: { Code?: unknown }; RequestId?: unknown; IsMatch?: unknown; Score?: unknown; FaceModelVersion?: unknown } }
      const result = data?.Response
      if (!result) throw new CloudFaceError('InvalidResponse')
      if (result.Error) throw new CloudFaceError(safeCode(result.Error.Code), safeId(result.RequestId))
      if (result.FaceModelVersion !== '3.0' || typeof result.IsMatch !== 'boolean' || typeof result.Score !== 'number' || !Number.isFinite(result.Score) || result.Score < 0 || result.Score > 100) {
        throw new CloudFaceError('InvalidResponse', safeId(result.RequestId))
      }
      return result.IsMatch === true && result.Score >= threshold
    } catch (error) {
      if (error instanceof CloudFaceError) throw error
      // Never propagate provider messages, request bodies, SDK errors, or credentials.
      throw new CloudFaceError('TransportError')
    }
  }
}
