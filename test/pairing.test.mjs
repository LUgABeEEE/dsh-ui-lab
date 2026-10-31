import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scrub } from '../src/errors.mjs'
import { pairingStatePath, redactUrl } from '../src/pairing.mjs'

test('pairing state lives under the configured cache directory', () => {
  // The directory is joined with node:path; do not assume POSIX separators.
  const stateDir = join(tmpdir(), 'dsh-ui-lab-cache')
  assert.equal(pairingStatePath(stateDir), join(stateDir, 'mobile-state.json'))
  if (process.platform !== 'win32') {
    // Keep the original POSIX expectation asserted on POSIX hosts.
    assert.equal(pairingStatePath('/work/.cache'), '/work/.cache/mobile-state.json')
  }
})

test('redactUrl strips tokens, userinfo and fragments of credentials', () => {
  assert.equal(
    redactUrl('http://127.0.0.1:3080/?token=abc123&x=1'),
    'http://127.0.0.1:3080/?token=%3Credacted%3E&x=1',
  )
  assert.equal(redactUrl('https://user:pass@example.test/path?code=zzz'), 'https://example.test/path?code=%3Credacted%3E')
  assert.doesNotMatch(redactUrl('http://127.0.0.1:3080/?token=abc123'), /abc123/)
})

test('scrub removes credential-looking values from arbitrary messages', () => {
  const message = scrub('goto https://x.test/?token=SECRET&csrf=ALSO failed')
  assert.doesNotMatch(message, /SECRET|ALSO/)
  assert.match(message, /token=<redacted>/)
})
