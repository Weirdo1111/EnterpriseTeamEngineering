import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['--test', 'dist/records/repository.integration.node-test.js'], {
  stdio: 'inherit', env: { ...process.env, RUN_DB_INTEGRATION: '1' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
