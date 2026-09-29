import assert from 'node:assert/strict'
import test from 'node:test'
import { createDb } from './db.js'

test('accepts an explicitly empty MySQL password', async () => {
  const previous = {
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
  }
  Object.assign(process.env, {
    MYSQL_USER: 'root',
    MYSQL_PASSWORD: '',
    MYSQL_DATABASE: 'doctor_platform',
  })

  let db: ReturnType<typeof createDb> | undefined
  try {
    assert.doesNotThrow(() => { db = createDb() })
  } finally {
    await db?.close()
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('rejects a missing MySQL password variable', () => {
  const previous = {
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
  }
  process.env.MYSQL_USER = 'root'
  process.env.MYSQL_DATABASE = 'doctor_platform'
  delete process.env.MYSQL_PASSWORD
  try {
    assert.throws(() => createDb(), /MYSQL_PASSWORD is required/)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
