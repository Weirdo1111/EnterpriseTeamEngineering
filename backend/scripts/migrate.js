import { readdir, readFile } from 'node:fs/promises'
import { config } from 'dotenv'
import mysql from 'mysql2/promise'

config({ path: new URL('../.env', import.meta.url), quiet: true })

const directory = new URL('../migrations/', import.meta.url)
let connection
try {
  connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true,
  })
  await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  const [appliedRows] = await connection.query('SELECT filename FROM schema_migrations')
  const applied = new Set(appliedRows.map(row => row.filename))
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
  for (const filename of files) {
    if (applied.has(filename)) continue
    const sql = await readFile(new URL(filename, directory), 'utf8')
    await connection.beginTransaction()
    try {
      await connection.query(sql)
      await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename])
      await connection.commit()
      console.log(`Applied ${filename}`)
    } catch (error) {
      await connection.rollback()
      throw error
    }
  }
  console.log('Database migrations are up to date.')
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally { await connection?.end() }
