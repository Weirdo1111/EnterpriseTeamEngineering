import { config } from 'dotenv'
import argon2 from 'argon2'
import mysql from 'mysql2/promise'

config({ path: new URL('../.env', import.meta.url), quiet: true })

const password = process.env.DEMO_PASSWORD
if (!password || password.length < 8) {
  console.error('Set DEMO_PASSWORD to at least 8 characters in backend/.env.')
  process.exit(1)
}

const users = [
  ['doctor.demo', 'Dr. Riley Lin', 'doctor.demo@example.test', 'doctor'],
  ['senior.demo', 'Dr. Michael Zhou', 'senior.demo@example.test', 'seniorDoctor'],
  ['admin.demo', 'Platform Admin', 'admin.demo@example.test', 'admin'],
]

let connection
try {
  connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'doctor_platform',
  })
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  for (const [username, name, email, role] of users) {
    await connection.execute(
      `INSERT INTO users (username, password_hash, name, email, role, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), name=VALUES(name), email=VALUES(email), role=VALUES(role), status='active'`,
      [username, passwordHash, name, email, role],
    )
    console.log(`Ready: ${username} (${role})`)
  }
} catch (error) {
  console.error(`Could not seed demo users: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await connection?.end()
}
