import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { pathToFileURL } from 'node:url'
import { config } from 'dotenv'
import mysql from 'mysql2/promise'

const identifier = value => `\`${String(value).replaceAll('`', '``')}\``

// expectedId binds deletion to the account shown before confirmation, even if the
// username is deleted/recreated while the administrator is answering the prompt.
export async function deleteUser(connection, username, expectedId) {
  if (typeof username !== 'string' || !username.trim() || username.length > 50) {
    throw new Error('Username must contain 1–50 characters.')
  }
  await connection.beginTransaction()
  try {
    const [users] = await connection.execute('SELECT * FROM users WHERE username = ? LIMIT 1 FOR UPDATE', [username])
    const user = users[0]
    if (!user || user.username !== username) throw new Error('Account not found. Enter the exact username.')
    if (String(user.id) !== String(expectedId)) throw new Error('Account changed since confirmation. Run the command again.')
    const [[{ database }]] = await connection.query('SELECT DATABASE() AS `database`')
    const [references] = await connection.execute(
      'SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = ?',
      [database, 'users'],
    )
    // Explicitly protect business references even if their FK permits CASCADE or SET NULL.
    for (const ref of references) {
      if (ref.TABLE_SCHEMA === database && ref.TABLE_NAME === 'auth_login_codes' && ref.COLUMN_NAME === 'user_id' && ref.REFERENCED_COLUMN_NAME === 'id') continue
      const [rows] = await connection.execute(
        `SELECT 1 FROM ${identifier(ref.TABLE_SCHEMA)}.${identifier(ref.TABLE_NAME)} WHERE ${identifier(ref.COLUMN_NAME)} = ? LIMIT 1`,
        [user[ref.REFERENCED_COLUMN_NAME]],
      )
      if (rows.length) throw new Error(`Account has referenced business data in ${ref.TABLE_NAME}; deletion refused. Disable the account instead.`)
    }
    const [tables] = await connection.execute(
      'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [database, 'auth_login_codes'],
    )
    if (tables.length) await connection.execute('DELETE FROM auth_login_codes WHERE user_id = ?', [user.id])
    const [result] = await connection.execute('DELETE FROM users WHERE id = ?', [user.id])
    if (result.affectedRows !== 1) throw new Error('Account changed; deletion cancelled.')
    await connection.commit()
    return { id: String(user.id), username: user.username }
  } catch (error) {
    await connection.rollback()
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: npm run delete-user -- [username]\nReads backend/.env. Requires interactive confirmation; deletes the account and its login codes. Accounts referenced by business data are not deleted.')
    return
  }
  if (args.length > 1 || args[0]?.startsWith('-')) throw new Error('Usage: npm run delete-user -- [username]')
  if (!stdin.isTTY) throw new Error('Run this script in a terminal to confirm account deletion.')
  config({ path: new URL('../.env', import.meta.url), quiet: true })
  const prompt = createInterface({ input: stdin, output: stdout })
  let connection
  try {
    const username = (args[0] ?? await prompt.question('Username to delete: ')).trim()
    if (!username || username.length > 50) throw new Error('Username must contain 1–50 characters.')
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'doctor_platform',
      supportBigNumbers: true,
      bigNumberStrings: true,
    })
    const [users] = await connection.execute('SELECT id, username, name, role FROM users WHERE username = ? LIMIT 1', [username])
    const user = users[0]
    if (!user || user.username !== username) throw new Error('Account not found. Enter the exact username.')
    console.log(`Database: ${process.env.MYSQL_DATABASE || 'doctor_platform'} on ${process.env.MYSQL_HOST || '127.0.0.1'}:${process.env.MYSQL_PORT || 3306}`)
    console.log(`Account: ${user.username} | ID: ${user.id} | Name: ${user.name} | Role: ${user.role}`)
    const confirmation = await prompt.question(`Permanently delete this account and its login codes? Type "DELETE ${user.username}" to confirm: `)
    if (confirmation !== `DELETE ${user.username}`) { console.log('Cancelled. No data deleted.'); return }
    const deleted = await deleteUser(connection, username, String(user.id))
    console.log(`Deleted account ${deleted.username} (ID: ${deleted.id}) and its login codes.`)
  } finally {
    await connection?.end()
    prompt.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Could not delete user: ${error.code === 'ER_ROW_IS_REFERENCED_2' ? 'Account is referenced by other data; nothing was deleted.' : error.message}`)
    process.exitCode = 1
  })
}
