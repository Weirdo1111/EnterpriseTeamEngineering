import mysql, { type RowDataPacket } from 'mysql2/promise'

export interface DbUser {
  id: string
  username: string
  password_hash: string
  name: string
  role: string
  email?: string | null
  phone?: string | null
  tencent_person_id?: string | null
  status: string
}

type UserRow = DbUser & RowDataPacket

export function createDb() {
  for (const key of ['MYSQL_USER', 'MYSQL_DATABASE']) {
    if (process.env[key] === undefined || process.env[key] === '') throw new Error(`${key} is required in backend/.env`)
  }
  if (process.env.MYSQL_PASSWORD === undefined) throw new Error('MYSQL_PASSWORD is required in backend/.env')
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    supportBigNumbers: true,
    bigNumberStrings: true,
  })
  const columns = 'id, username, password_hash, name, role, status, email, phone, tencent_person_id'
  return {
    pool,
    async check() {
      await pool.query(`SELECT ${columns} FROM users LIMIT 0`)
      await pool.query('SELECT id, user_id, channel, code_hash, destination_hash, expires_at, used_at, attempts, delivery_status, lease_expires_at FROM auth_login_codes LIMIT 0')
      await pool.query('SELECT bucket_key, hits, expires_at FROM auth_rate_limits LIMIT 0')
    },
    async byAccount(account: string): Promise<DbUser | null> {
      const [rows] = await pool.execute<UserRow[]>(`SELECT ${columns} FROM users WHERE username = ? LIMIT 1`, [account])
      return rows[0] ?? null
    },
    async byId(id: string): Promise<DbUser | null> {
      const [rows] = await pool.execute<UserRow[]>(`SELECT ${columns} FROM users WHERE id = ? LIMIT 1`, [id])
      return rows[0] ?? null
    },
    close() { return pool.end() },
  }
}

export type UserLookup = Pick<ReturnType<typeof createDb>, 'byAccount' | 'byId'>
