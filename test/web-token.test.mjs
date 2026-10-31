import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { RuntimeError } from '../src/errors.mjs'
import { readTokenFile, resolveWebToken } from '../src/token.mjs'

function withTokenFile(mode, content, run) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-token-'))
  try {
    const file = join(directory, 'web-token')
    writeFileSync(file, content, { mode })
    run(file)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('reads a token file only when it is mode 600', () => {
  withTokenFile(0o600, '  fixture-token-123\n', file => {
    assert.equal(readTokenFile(file), 'fixture-token-123')
  })
})

test('refuses a token file that is readable by group or others', () => {
  withTokenFile(0o644, 'fixture-token-123', file => {
    assert.throws(
      () => readTokenFile(file),
      error => {
        assert.ok(error instanceof RuntimeError)
        assert.match(error.message, /mode 600/)
        assert.doesNotMatch(error.message, /fixture-token-123/)
        return true
      },
    )
  })
})

test('rejects missing, empty and non-file token paths', () => {
  assert.throws(() => readTokenFile('/definitely/not/here/token'), RuntimeError)

  withTokenFile(0o600, '   \n', file => {
    assert.throws(() => readTokenFile(file), /empty/)
  })

  const directory = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-token-dir-'))
  try {
    assert.throws(() => readTokenFile(directory), /not a regular file/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('token precedence is url > env > file', () => {
  withTokenFile(0o600, 'from-file', file => {
    assert.deepEqual(resolveWebToken({ urlToken: 'from-url', envToken: 'from-env', tokenFile: file }), {
      token: 'from-url',
      source: 'url',
    })
    assert.deepEqual(resolveWebToken({ envToken: 'from-env', tokenFile: file }), {
      token: 'from-env',
      source: 'env',
    })
    assert.deepEqual(resolveWebToken({ tokenFile: file }), { token: 'from-file', source: 'file' })
  })
})

test('an unused token file is not read (so its mode cannot break a URL-token run)', () => {
  assert.deepEqual(resolveWebToken({ urlToken: 'from-url', tokenFile: '/definitely/not/here' }), {
    token: 'from-url',
    source: 'url',
  })
  assert.deepEqual(resolveWebToken({ envToken: 'from-env', tokenFile: '/definitely/not/here' }), {
    token: 'from-env',
    source: 'env',
  })
})

test('no token configured resolves to null', () => {
  assert.deepEqual(resolveWebToken(), { token: null, source: null })
  assert.deepEqual(resolveWebToken({ urlToken: '', envToken: '  ', tokenFile: '' }), {
    token: null,
    source: null,
  })
})
