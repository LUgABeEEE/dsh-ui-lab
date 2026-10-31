import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { UsageError } from '../src/errors.mjs'
import { resolveInjection } from '../src/inject.mjs'

function withDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-inject-'))
  try {
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('accepts a plain CSS file', () => {
  withDirectory(directory => {
    const css = join(directory, 'overrides.css')
    writeFileSync(css, '.a { color: red }')
    const injection = resolveInjection(css)
    assert.equal(injection.kind, 'css')
    assert.equal(injection.cssPath, css)
    assert.equal(injection.jsPath, null)
  })
})

test('accepts a dsh-mobile pack directory', () => {
  withDirectory(directory => {
    writeFileSync(join(directory, 'extension.json'), JSON.stringify({ id: 'core-panel' }))
    writeFileSync(join(directory, 'mobile.css'), '.b { color: blue }')
    writeFileSync(join(directory, 'mobile.js'), 'window.__injected = true')
    const injection = resolveInjection(directory)
    assert.equal(injection.kind, 'pack')
    assert.equal(injection.id, 'core-panel')
    assert.equal(injection.cssPath, join(directory, 'mobile.css'))
    assert.equal(injection.jsPath, join(directory, 'mobile.js'))
  })
})

test('rejects a missing path and unsupported files', () => {
  withDirectory(directory => {
    assert.throws(() => resolveInjection(join(directory, 'missing.css')), UsageError)
    const textFile = join(directory, 'notes.txt')
    writeFileSync(textFile, 'not css')
    assert.throws(() => resolveInjection(textFile), UsageError)
  })
})

test('rejects a directory without extension.json', () => {
  withDirectory(directory => {
    assert.throws(() => resolveInjection(directory), UsageError)
  })
})

test('rejects a pack with no injectable assets', () => {
  withDirectory(directory => {
    writeFileSync(join(directory, 'extension.json'), JSON.stringify({ id: 'empty' }))
    assert.throws(() => resolveInjection(directory), UsageError)
  })
})
