import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../api/assignmentsApi.ts', import.meta.url), 'utf8')

for (const route of ['/assignments', '/submissions', '/ai-grade', '/teacher-grade']) {
  assert.ok(source.includes(route), `missing ${route}`)
}
assert.match(source, /import client from ['"]\.\/client['"]/u)
assert.doesNotMatch(source, /\bMOCK_|setTimeout|\.push\(|\.unshift\(/u)
