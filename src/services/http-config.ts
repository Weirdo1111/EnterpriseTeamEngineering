export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export function backendConfig(value: string | undefined, name: string) {
  const raw = value?.trim() ?? ''
  if (!raw) return { baseUrl: '', configurationError: '' }

  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Invalid backend origin')
    }
    return { baseUrl: url.origin, configurationError: '' }
  } catch {
    return { baseUrl: raw, configurationError: `${name} must be an HTTP(S) origin without credentials, a path, query, or fragment.` }
  }
}

export function validateApiToken(token: string) {
  if (!token || token.startsWith('demo-') || /[\r\n]/.test(token)) {
    throw new ApiError(401, 'Sign in with a verified server account before using the backend.')
  }
  return token
}
