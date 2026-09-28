export type Channel = 'email' | 'sms'
export interface CodeSender {
  available(channel: Channel): boolean
  send(channel: Channel, destination: string, code: string, challengeId?: string): Promise<void>
}

// Email retains its existing configuration. SMS has no live provider implementation.
export function createCodeSender(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): CodeSender {
  const mode = env.AUTH_DELIVERY_MODE || 'disabled'
  if ((env.SMS_DELIVERY_MODE || 'disabled') !== 'disabled') {
    throw new Error('SMS delivery is suspended; set SMS_DELIVERY_MODE=disabled')
  }
  if (!['disabled', 'provider'].includes(mode)) {
    throw new Error('AUTH_DELIVERY_MODE must be disabled or provider; local simulated delivery has been removed')
  }
  const available = (channel: Channel) => channel === 'email' && mode === 'provider' && Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
  return {
    available,
    async send(channel, destination, code) {
      if (!available(channel)) throw new Error('Delivery unavailable')
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [destination], subject: 'Login verification code', text: `Your login code is ${code}. It expires in 5 minutes. Do not share it.` }),
      })
      if (!response.ok) throw new Error('Delivery failed')
      const result = await response.json() as { id?: string }
      if (!result.id) throw new Error('Delivery failed')
    },
  }
}
