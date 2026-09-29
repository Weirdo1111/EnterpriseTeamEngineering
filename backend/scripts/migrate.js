import { readdir, readFile } from 'node:fs/promises'
import { config } from 'dotenv'
import mysql from 'mysql2/promise'

config({ path: new URL('../.env', import.meta.url), quiet: true })
const directory = new URL('../migrations/', import.meta.url)

// Migration files put each statement terminator at the end of a line. Custom
// DELIMITER blocks keep stored-procedure semicolons within a single statement.
function statements(sql) {
  let delimiter = ';'
  let buffer = ''
  const result = []
  for (const line of sql.split(/\r?\n/)) {
    const directive = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i)
    if (directive) {
      if (buffer.trim()) throw new Error('DELIMITER inside an unfinished statement')
      delimiter = directive[1]
      continue
    }
    if (!buffer.trim() && (!line.trim() || /^\s*--/.test(line))) continue
    buffer += line + '\n'
    if (buffer.trimEnd().endsWith(delimiter)) {
      result.push(buffer.trimEnd().slice(0, -delimiter.length))
      buffer = ''
    }
  }
  if (buffer.trim()) throw new Error('Unterminated migration statement')
  return result
}

let connection
let locked = false
let currentFile = ''
try {
  connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  })
  const [[lock]] = await connection.query("SELECT GET_LOCK(CONCAT('migrate:', LEFT(DATABASE(), 48)), 30) AS acquired")
  if (Number(lock.acquired) !== 1) throw new Error('Another migration is running')
  locked = true
  const [columns] = await connection.query(`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
    FROM information_schema.columns WHERE table_schema=DATABASE()`)
  const userId = columns.find(c => c.tableName === 'users' && c.columnName === 'id')
  const userType = userId ? userId.columnType.toUpperCase() : 'BIGINT UNSIGNED'
  if (!['BIGINT', 'BIGINT UNSIGNED'].includes(userType)) throw new Error('users.id must be BIGINT or BIGINT UNSIGNED; no schema changes applied')
  const references = { medical_records: ['doctor_id', 'reviewed_by'], medical_orders: ['created_by', 'stopped_by'], record_reviews: ['reviewer_id'], audit_logs: ['user_id'], auth_login_codes: ['user_id'] }
  for (const column of columns) {
    if (references[column.tableName]?.includes(column.columnName) && column.columnType.toUpperCase() !== userType) {
      throw new Error(`Existing ${column.tableName}.${column.columnName} does not match users.id; no schema changes applied`)
    }
  }
  await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  const [appliedRows] = await connection.query('SELECT filename FROM schema_migrations')
  const applied = new Set(appliedRows.map(row => row.filename))
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
  const files = ['001_core_schema.sql', ...names.filter(name => name !== '001_core_schema.sql')]
  // Parse all pending files before running any of their DDL.
  const pending = []
  for (const filename of files) {
    if (applied.has(filename)) continue
    let sql = await readFile(new URL(filename, directory), 'utf8')
    if (['001_core_schema.sql', '001-login-codes.sql'].includes(filename)) {
      // Only user foreign-key declarations change; existing users and unrelated IDs stay intact.
      sql = sql.replace(/^(\s*(?:doctor_id|reviewed_by|created_by|stopped_by|reviewer_id|user_id)\s+)BIGINT(?: UNSIGNED)?\b/gm, `$1${userType}`)
    }
    pending.push({ filename, queries: statements(sql) })
  }
  for (const { filename, queries } of pending) {
    currentFile = filename
    // MySQL DDL implicitly commits. Record success only after every statement;
    // restartable migrations handle an interrupted file on the next invocation.
    for (const sql of queries) await connection.query(sql)
    await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename])
    console.log(`Applied ${filename}`)
  }
  console.log('Database migrations are up to date.')
} catch (error) {
  console.error(`Migration failed${currentFile ? ` (${currentFile})` : ''}:`, error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (connection) {
    try { if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT('migrate:', LEFT(DATABASE(), 48)))") }
    finally { await connection.end() }
  }
}
