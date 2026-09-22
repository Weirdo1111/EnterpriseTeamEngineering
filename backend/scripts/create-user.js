import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Writable } from 'node:stream'
import { config } from 'dotenv'
import argon2 from 'argon2'
import mysql from 'mysql2/promise'

config({ path: new URL('../.env', import.meta.url), quiet: true })

const roles = new Set(['doctor', 'seniorDoctor', 'admin'])

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Create a user in doctor_platform.users. Configure backend/.env, then run: npm run create-user')
  process.exit(0)
}

if (!stdin.isTTY) {
  console.error('Run this script in a terminal so the password can be entered without echoing it.')
  process.exit(1)
}

let hideInput = false
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hideInput) stdout.write(chunk, encoding)
    callback()
  },
})
const prompt = createInterface({ input: stdin, output, terminal: true })

async function askPassword(label) {
  stdout.write(label)
  hideInput = true
  try {
    return await prompt.question('')
  } finally {
    hideInput = false
    stdout.write('\n')
  }
}

let connection
try {
  const username = (await prompt.question('Username: ')).trim()
  const name = (await prompt.question('Name: ')).trim()
  const emailInput = (await prompt.question('Email (optional): ')).trim()
  const role = (await prompt.question('Role (doctor/seniorDoctor/admin): ')).trim()

  if (!username || username.length > 50 || !name || name.length > 100) {
    throw new Error('Username must be 1–50 characters and name must be 1–100 characters.')
  }
  if (emailInput.length > 100 || (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput))) {
    throw new Error('Enter a valid email of at most 100 characters, or leave it empty.')
  }
  if (!roles.has(role)) throw new Error('Role must be doctor, seniorDoctor, or admin.')

  const password = await askPassword('Password: ')
  const confirmation = await askPassword('Confirm password: ')
  if (password.length < 8) throw new Error('Password must contain at least 8 characters.')
  if (password !== confirmation) throw new Error('Passwords do not match.')

  connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'doctor_platform',
  })

  const [existing] = await connection.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username])
  if (existing.length) throw new Error('Username already exists.')

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  await connection.execute(
    'INSERT INTO users (username, password_hash, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
    [username, passwordHash, name, emailInput || null, role, 'active'],
  )
  console.log(`Created user ${username} with role ${role}.`)
} catch (error) {
  if (error?.code === 'ER_DUP_ENTRY') console.error('Username already exists.')
  else console.error(`Could not create user: ${error.message}`)
  process.exitCode = 1
} finally {
  await connection?.end()
  prompt.close()
}
