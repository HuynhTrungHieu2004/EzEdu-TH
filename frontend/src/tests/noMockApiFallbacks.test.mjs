import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name)
  return entry.isDirectory() ? sourceFiles(target) : /\.(ts|tsx)$/u.test(entry.name) ? [target] : []
})

for (const file of [...sourceFiles(path.join(src, 'api')), ...sourceFiles(path.join(src, 'pages'))]) {
  const name = path.relative(src, file)
  const source = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(source, /\bMOCK_[A-Z0-9_]*/u, `${name} still contains mock data`)
  assert.doesNotMatch(source, /\bINITIAL_(DATA|NOTIFICATIONS|CLASSES)\b/u, `${name} still contains initial fake data`)
  assert.doesNotMatch(source, /\bmockData\b/u, `${name} still contains mock data`)
  assert.doesNotMatch(
    source,
    /from ['"][^'"]*data\/studentLmsData['"]/u,
    `${name} still imports static LMS data`,
  )
  assert.doesNotMatch(
    source,
    /catch\s*\([^)]*\)\s*\{[^}]*return\s+[^;]*(mock|fallback)/isu,
    `${name} still falls back after an API error`,
  )
}
