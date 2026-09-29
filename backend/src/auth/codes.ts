import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { DbUser } from '../db.js'
import type { Channel, CodeSender } from './delivery.js'

export class AuthCodeError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const eligible = (user: DbUser | null): user is DbUser => Boolean(user && user.status === 'active' && ['doctor', 'seniorDoctor', 'admin'].includes(user.role))
const invalid = () => new AuthCodeError(401, 'Invalid or expired code')
export interface CodeAuth {
  request(account: string, channel: Channel, ip: string): Promise<void>
  verify(account: string, channel: Channel, code: string, ip: string): Promise<DbUser>
}

export function createCodeAuth(pool: Pool, sender: CodeSender, secret: string): CodeAuth & { processNext(): Promise<boolean> } {
  if (secret.length < 32) throw new Error('AUTH_CODE_SECRET must contain at least 32 characters')
  const digest = (...parts: string[]) => createHmac('sha256', secret).update(JSON.stringify(parts)).digest('hex')
  const contact = (user: DbUser, channel: Channel) => (channel === 'email' ? user.email : user.phone) || ''

  async function limit(rules: { key: string; seconds: number; max: number }[]) {
    const buckets = rules.map(rule => ({ ...rule, key: digest('limit', rule.key) }))
      .sort((a, b) => a.key.localeCompare(b.key))
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      for (const bucket of buckets) {
        await conn.execute('INSERT IGNORE INTO auth_rate_limits (bucket_key, expires_at) VALUES (?, ?)', [bucket.key, new Date(0)])
        const [rows] = await conn.execute<RowDataPacket[]>('SELECT hits, expires_at <= NOW(3) AS expired FROM auth_rate_limits WHERE bucket_key = ? FOR UPDATE', [bucket.key])
        if (Number(rows[0]!.expired) === 0 && Number(rows[0]!.hits) >= bucket.max) throw new AuthCodeError(429, 'Too many requests. Try again later.')
        await conn.execute('UPDATE auth_rate_limits SET hits = IF(expires_at <= NOW(3), 1, hits + 1), expires_at = IF(expires_at <= NOW(3), TIMESTAMPADD(SECOND, ?, NOW(3)), expires_at) WHERE bucket_key = ?', [bucket.seconds, bucket.key])
      }
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  }

  let usernameEncoding: Promise<{ charset: string; collation: string }> | undefined
  async function accountKey(account: string): Promise<string> {
    // Use MySQL's actual comparison rules for EVERY input, including nonexistent accounts.
    // JS lowercase/Unicode normalization does not reproduce ai_ci collation equivalence.
    usernameEncoding ??= pool.query<RowDataPacket[]>(
      "SELECT CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='username'",
    ).then(([rows]) => {
      const row = rows[0]
      if (!row || !/^[a-zA-Z0-9_]+$/.test(row.charset) || !/^[a-zA-Z0-9_]+$/.test(row.collation)) {
        throw new Error('Unsupported username encoding')
      }
      return { charset: String(row.charset), collation: String(row.collation) }
    }).catch((error: unknown) => {
      usernameEncoding = undefined
      throw error
    })
    const { charset, collation } = await usernameEncoding
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT HEX(WEIGHT_STRING(CONVERT(? USING ${charset}) COLLATE ${collation})) AS account_key`, [account],
    )
    return String(rows[0]!.account_key)
  }

  return {
    async request(account, channel, ip) {
      // IP limits apply before lookup, including unknown accounts and unavailable channels.
      await limit([{ key: `send-ip:${ip}`, seconds: 3600, max: 30 }])
      const key = await accountKey(account)
      await limit([
        { key: `send-minute:${key}:${channel}`, seconds: 60, max: 1 },
        { key: `send-hour:${key}:${channel}`, seconds: 3600, max: 5 },
      ])
      if (!sender.available(channel)) throw new AuthCodeError(503, 'Verification service unavailable')
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        const [users] = await conn.execute<(DbUser & RowDataPacket)[]>('SELECT * FROM users WHERE username = ? LIMIT 1 FOR UPDATE', [account])
        const user = users[0] ?? null
        if (user) {
          await conn.execute("UPDATE auth_login_codes SET used_at = NOW(3), delivery_status = IF(delivery_status='queued', 'suppressed', delivery_status) WHERE user_id = ? AND channel = ? AND used_at IS NULL", [user.id, channel])
        }
        // Unknown/disabled/unconfigured contacts take the same durable acceptance path.
        // No plaintext code exists yet: the worker creates it immediately before delivery.
        await conn.execute('INSERT INTO auth_login_codes (id, user_id, channel, destination_hash, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 5 MINUTE))',
          [randomUUID(), user?.id ?? null, channel, digest('destination', user ? contact(user, channel) : '')])
        await conn.commit()
      } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    },
    async processNext() {
      // Crash recovery is fail-closed: an uncertain external send is never blindly retried.
      await pool.execute("UPDATE auth_login_codes SET delivery_status='failed', used_at=NOW(3), lease_expires_at=NULL WHERE delivery_status IN ('processing','pending') AND lease_expires_at <= NOW(3)")
      const claim = await pool.getConnection()
      let job: RowDataPacket | undefined
      try {
        await claim.beginTransaction()
        const [jobs] = await claim.query<RowDataPacket[]>("SELECT * FROM auth_login_codes WHERE delivery_status='queued' ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED")
        job = jobs[0]
        if (job) await claim.execute("UPDATE auth_login_codes SET delivery_status='processing', lease_expires_at=DATE_ADD(NOW(3), INTERVAL 1 MINUTE) WHERE id=?", [job.id])
        await claim.commit()
      } catch (error) { await claim.rollback(); throw error } finally { claim.release() }
      if (!job) return false

      let destination = ''
      let code = ''
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        // Claim was committed before acquiring the user lock, preserving user -> code lock order.
        const [users] = await conn.execute<(DbUser & RowDataPacket)[]>('SELECT * FROM users WHERE id = ? FOR UPDATE', [job.user_id])
        const user = users[0] ?? null
        const [records] = await conn.execute<RowDataPacket[]>('SELECT *, expires_at > NOW(3) AS fresh, lease_expires_at > NOW(3) AS leased FROM auth_login_codes WHERE id=? FOR UPDATE', [job.id])
        const record = records[0]!
        if (record.delivery_status !== 'processing' || record.used_at || Number(record.fresh) !== 1 || Number(record.leased) !== 1 ||
            !eligible(user) || !contact(user, job.channel) || record.destination_hash !== digest('destination', contact(user, job.channel))) {
          await conn.execute("UPDATE auth_login_codes SET delivery_status='suppressed', used_at=COALESCE(used_at,NOW(3)), lease_expires_at=NULL WHERE id=? AND delivery_status='processing'", [job.id])
          await conn.commit()
          return true
        }
        destination = contact(user, job.channel)
        code = String(randomInt(0, 1_000_000)).padStart(6, '0')
        await conn.execute("UPDATE auth_login_codes SET delivery_status='pending', code_hash=?, expires_at=DATE_ADD(NOW(3), INTERVAL 5 MINUTE) WHERE id=?", [digest(job.id, code), job.id])
        await conn.commit()
      } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
      try {
        await sender.send(job.channel, destination, code, job.id)
        await pool.execute("UPDATE auth_login_codes SET delivery_status='sent', lease_expires_at=NULL WHERE id=? AND delivery_status='pending' AND used_at IS NULL AND lease_expires_at > NOW(3)", [job.id])
      } catch {
        await pool.execute("UPDATE auth_login_codes SET delivery_status='failed', used_at=NOW(3), lease_expires_at=NULL WHERE id=? AND delivery_status='pending'", [job.id])
      }
      return true
    },
    async verify(account, channel, code, ip) {
      await limit([{ key: `verify-ip:${ip}`, seconds: 600, max: 60 }])
      // Disabling SMS also blocks codes issued by a previous development process.
      if (channel === 'sms' && !sender.available('sms')) throw new AuthCodeError(503, 'Verification service unavailable')
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        // Same user lock order as issuance serializes consumption, sends and concurrent logins.
        const [users] = await conn.execute<(DbUser & RowDataPacket)[]>('SELECT * FROM users WHERE username = ? LIMIT 1 FOR UPDATE', [account])
        const user = users[0] ?? null
        if (!eligible(user)) throw invalid()
        const [codes] = await conn.execute<RowDataPacket[]>('SELECT *, expires_at > NOW(3) AS fresh FROM auth_login_codes WHERE user_id = ? AND channel = ? ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE', [user.id, channel])
        const record = codes[0]
        if (!record || record.used_at || Number(record.fresh) !== 1 || record.delivery_status !== 'sent' || record.attempts >= 5) throw invalid()
        await conn.execute('UPDATE auth_login_codes SET attempts = attempts + 1 WHERE id = ?', [record.id])
        const matches = timingSafeEqual(Buffer.from(record.code_hash, 'hex'), Buffer.from(digest(record.id, code), 'hex'))
        if (!matches || record.destination_hash !== digest('destination', contact(user, channel))) {
          await conn.commit() // Failed attempts must survive the error response.
          throw invalid()
        }
        await conn.execute('UPDATE auth_login_codes SET used_at = NOW(3) WHERE id = ?', [record.id])
        await conn.commit()
        return user
      } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    },
  }
}
