import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const children = new Set()
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) child.kill('SIGTERM')
  const timeout = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL')
  }, 5000)
  timeout.unref()
}

function start(name, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' })
  children.add(child)
  child.on('error', error => {
    console.error(`${name} failed to start: ${error.message}`)
    children.delete(child)
    stop(1)
  })
  child.on('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      console.error(`${name} exited (${signal || code}); stopping development servers.`)
      stop(code || 1)
    }
  })
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
start('Backend', ['dist/server.js'], fileURLToPath(new URL('../backend/', import.meta.url)))
start('Frontend', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'], root)
