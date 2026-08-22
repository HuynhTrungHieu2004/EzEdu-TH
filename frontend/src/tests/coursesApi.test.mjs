import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../api/coursesApi.ts', import.meta.url), 'utf8')

assert.match(source, /import client from ['"]\.\/client['"]/u)
assert.match(source, /['"`]\/courses/u)
assert.doesNotMatch(source, /\bMOCK_/u)
assert.doesNotMatch(source, /setTimeout/u)
assert.doesNotMatch(source, /\.push\(|\.unshift\(|\.splice\(/u)
