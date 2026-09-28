import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { createFaceLimits } from '../dist/auth/face-limits.js'
import { createFaceAuth } from '../dist/auth/face.js'
import { createCodeAuth } from '../dist/auth/codes.js'

const secret = 'local-mysql-test-secret-at-least-32-characters'
test('real MySQL migration, server mapping, durable face limits and existing email verification', { skip: process.env.FACE_MYSQL_TEST !== '1' }, async t => {
  const options = {
    ...(process.env.MYSQL_TEST_HOST ? { host: process.env.MYSQL_TEST_HOST, port: Number(process.env.MYSQL_TEST_PORT || 3306) } : { socketPath: process.env.MYSQL_TEST_SOCKET || '/tmp/mysql.sock' }),
    user: process.env.MYSQL_TEST_USER || 'root', password: process.env.MYSQL_TEST_PASSWORD || '', supportBigNumbers: true, bigNumberStrings: true,
  }
  const database = `ete_face_test_${randomUUID().replaceAll('-', '')}`
  const admin = await mysql.createConnection(options)
  let pool
  t.after(async () => { await pool?.end(); await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end() })
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  pool = mysql.createPool({ ...options, database, connectionLimit: 10 })
  await pool.query(`CREATE TABLE users (id BIGINT PRIMARY KEY AUTO_INCREMENT, username VARCHAR(50) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL, email VARCHAR(100), phone VARCHAR(20), role VARCHAR(30) NOT NULL, status VARCHAR(20) DEFAULT 'active') ENGINE=InnoDB`)
  await pool.query("INSERT INTO users (id,username,password_hash,name,email,role) VALUES (9007199254740993,'Doctór','unchanged-hash','Doctor','doctor@example.invalid','doctor'),(2,'other','other-hash','Other',NULL,'doctor')")
  async function migrate(path) {
    const migration = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^--.*$/gm, '')
    const parts = migration.split(/DELIMITER \/\/|DELIMITER ;/)
    for (const statement of parts[0].split(';')) if (statement.trim()) await pool.query(statement)
    for (const statement of parts[1].split('//')) if (statement.trim()) await pool.query(statement)
    for (const statement of parts[2].split(';')) if (statement.trim()) await pool.query(statement)
  }
  await migrate('../migrations/001-login-codes.sql')
  await migrate('../migrations/005-auth-tencent-face.sql')
  await migrate('../migrations/005-auth-tencent-face.sql')
  await t.test('migration reruns without changing users; PersonIds unique and BIGINT precise', async () => {
    const [rows] = await pool.query('SELECT * FROM users ORDER BY id')
    assert.equal(rows.length, 2)
    assert.equal(rows[1].id, '9007199254740993')
    assert.equal(rows[1].password_hash, 'unchanged-hash')
    assert.ok(rows.every(row => row.tencent_person_id === null))
    await pool.execute('UPDATE users SET tencent_person_id=? WHERE id=?', ['doctor_9007199254740993', '9007199254740993'])
    await assert.rejects(pool.execute('UPDATE users SET tencent_person_id=? WHERE id=2', ['doctor_9007199254740993']), error => error.code === 'ER_DUP_ENTRY')
  })
  const lookup = async (column, value) => (await pool.execute(`SELECT * FROM users WHERE ${column}=?`, [value]))[0][0] ?? null
  const users = { byAccount: a => lookup('username', a), byId: id => lookup('id', id) }
  await t.test('cloud gets only stored mapping; database user returned for JWT', async () => {
    let id
    const face = createFaceAuth(users, async person => { id = person; return true }, createFaceLimits(pool, secret), () => {})
    const user = await face.verify('doctor', 'synthetic-photo')
    assert.equal(id, 'doctor_9007199254740993')
    assert.equal(user.id, '9007199254740993')
    assert.equal(user.role, 'doctor')
  })
  await t.test('case/accent aliases share budget and limits survive service reconstruction', async () => {
    const limits = createFaceLimits(pool, secret)
    for (let i = 0; i < 14; i++) await limits.account(['DOCTOR', 'Doctór', 'doctór', 'doctor'][i % 4])
    await assert.rejects(createFaceLimits(pool, secret).account('DOCTÓR'), error => error.status === 429)
  })
  await t.test('concurrent unknown account attempts cannot exceed fifteen', async () => {
    const limits = createFaceLimits(pool, secret)
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => limits.account('unknown')))
    assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 15, JSON.stringify(attempts.filter(a => a.status === 'rejected').map(a => ({ status: a.reason.status, code: a.reason.code }))))
    assert.ok(attempts.filter(a => a.status === 'rejected').every(a => a.reason.status === 429), JSON.stringify(attempts.filter(a => a.status === 'rejected').map(a => ({ status: a.reason.status, code: a.reason.code }))))
  })
  await t.test('IP attempts limited independently of account', async () => {
    const limits = createFaceLimits(pool, secret)
    await limits.ip('test-ip')
    const [rows] = await pool.query('SELECT TIMESTAMPDIFF(SECOND,NOW(3),expires_at) AS remaining FROM auth_rate_limits WHERE hits=1 AND expires_at>NOW(3)')
    assert.ok(rows.some(row => row.remaining >= 295 && row.remaining <= 300))
    for (let i = 1; i < 15; i++) await limits.ip('test-ip')
    await assert.rejects(createFaceLimits(pool, secret).ip('test-ip'), error => error.status === 429 && error.retryAfter === 300)
  })
  await t.test('account window expires after five minutes and resets', async () => {
    const limits = createFaceLimits(pool, secret)
    await limits.account('window-test')
    const [rows] = await pool.query('SELECT TIMESTAMPDIFF(SECOND,NOW(3),expires_at) AS remaining FROM auth_rate_limits WHERE hits=1 AND expires_at>NOW(3)')
    assert.ok(rows.some(row => row.remaining >= 295 && row.remaining <= 300))
    await pool.query('UPDATE auth_rate_limits SET expires_at=DATE_SUB(NOW(3), INTERVAL 1 SECOND)')
    for (let i=0; i<15; i++) await limits.account('window-test')
    await assert.rejects(limits.account('window-test'), error => error.status === 429 && error.retryAfter === 300)
  })
  await t.test('existing email challenge generation and one-time verification still work', async () => {
    let code
    const codes = createCodeAuth(pool, { available: () => true, send: async (_channel, _contact, value) => { code = value } }, secret)
    await codes.request('doctor', 'email', 'email-ip')
    await codes.processNext()
    assert.match(code, /^\d{6}$/)
    assert.equal((await codes.verify('doctor', 'email', code, 'email-ip')).id, '9007199254740993')
    await assert.rejects(codes.verify('doctor', 'email', code, 'email-ip'), error => error.status === 401)
  })
})
