import { createHmac } from 'node:crypto'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { FaceAuthError, type FaceLimits } from './face.js'

// Reuses the existing durable limiter table, with separate face-login bucket names.
export function createFaceLimits(pool: Pool, secret: string): FaceLimits {
  if (secret.length < 32) throw new Error('AUTH_CODE_SECRET must contain at least 32 characters')
  async function consume(key: string, maximum: number) {
    const digest = createHmac('sha256', secret).update(key).digest('hex')
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      // Acquire an exclusive row lock immediately. INSERT IGNORE takes shared locks on
      // duplicate keys and can deadlock when concurrent requests then upgrade to UPDATE.
      await conn.execute('INSERT INTO auth_rate_limits (bucket_key, expires_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE bucket_key=auth_rate_limits.bucket_key', [digest, new Date(0)])
      const [rows] = await conn.execute<RowDataPacket[]>('SELECT hits, expires_at <= NOW(3) AS expired FROM auth_rate_limits WHERE bucket_key=? FOR UPDATE', [digest])
      if (Number(rows[0]!.expired) === 0 && Number(rows[0]!.hits) >= maximum) throw new FaceAuthError(429)
      await conn.execute('UPDATE auth_rate_limits SET hits=IF(expires_at<=NOW(3),1,hits+1), expires_at=IF(expires_at<=NOW(3),DATE_ADD(NOW(3), INTERVAL 15 MINUTE),expires_at) WHERE bucket_key=?', [digest])
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  }
  return {
    ip: ip => consume(`face-ip:${ip}`, 30),
    async account(account) {
      // Match MySQL username equivalence (case/accent variants cannot bypass the limiter).
      const [columns] = await pool.query<RowDataPacket[]>("SELECT CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='username'")
      const column = columns[0]
      if (!column || !/^[A-Za-z0-9_]+$/.test(column.charset) || !/^[A-Za-z0-9_]+$/.test(column.collation)) throw new Error('Unsupported username encoding')
      const [rows] = await pool.execute<RowDataPacket[]>(`SELECT HEX(WEIGHT_STRING(CONVERT(? USING ${column.charset}) COLLATE ${column.collation})) AS k`, [account])
      await consume(`face-account:${rows[0]!.k}`, 5)
    },
  }
}
