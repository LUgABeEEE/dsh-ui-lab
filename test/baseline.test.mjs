import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  baselinePaths,
  hashFile,
  readBaselineManifest,
  writeBaseline,
} from '../src/baseline.mjs'

function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-baseline-'))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('baselinePaths names files the same way capture does', () => {
  // Paths are joined with node:path, so build the fixture with the same rules
  // instead of hard-coding POSIX separators: the naming rule is what this test
  // pins, not the platform's separator.
  const outDir = join(tmpdir(), 'dsh-ui-lab-out')
  const baselineDir = join(tmpdir(), 'dsh-ui-lab-base')
  const paths = baselinePaths(outDir, baselineDir, 'mobile', 'phone-390x844')
  assert.equal(paths.name, 'mobile__phone-390x844.png')
  assert.equal(paths.current, join(outDir, 'mobile__phone-390x844.png'))
  assert.equal(paths.reference, join(baselineDir, 'mobile__phone-390x844.png'))
  if (process.platform !== 'win32') {
    // Keep the original POSIX expectations asserted on POSIX hosts.
    const posix = baselinePaths('/tmp/out', '/tmp/base', 'mobile', 'phone-390x844')
    assert.equal(posix.current, '/tmp/out/mobile__phone-390x844.png')
    assert.equal(posix.reference, '/tmp/base/mobile__phone-390x844.png')
  }
})

test('writeBaseline copies the screenshots and records their hashes', () => {
  withTempDir(dir => {
    const out = join(dir, 'out')
    const base = join(dir, 'base')
    mkdirSync(out, { recursive: true })
    // Contents do not have to be a real PNG: this only checks the bookkeeping.
    writeFileSync(join(out, 'mobile__phone-390x844.png'), 'first', { flag: 'w' })
    const manifestPath = join(base, 'baseline.json')
    const written = writeBaseline({
      entries: [
        { name: 'mobile__phone-390x844.png', current: join(out, 'mobile__phone-390x844.png') },
        { name: 'mobile__tablet-768x1024.png', current: join(out, 'missing.png') },
      ],
      baselineDir: base,
      surface: 'mobile',
      generatedAt: '2026-10-30T00:00:00.000Z',
    })
    assert.equal(written.path, manifestPath)
    assert.equal(readFileSync(join(base, 'mobile__phone-390x844.png'), 'utf8'), 'first')
    assert.equal(existsSync(join(base, 'mobile__tablet-768x1024.png')), false, 'a missing capture is skipped')
    assert.equal(written.manifest.files.length, 1)
    assert.equal(written.manifest.surface, 'mobile')
    assert.equal(written.manifest.files[0].sha256, hashFile(join(out, 'mobile__phone-390x844.png')))
  })
})

test('readBaselineManifest tolerates a directory without a manifest', () => {
  withTempDir(dir => {
    assert.equal(readBaselineManifest(dir), null)
    writeFileSync(join(dir, 'baseline.json'), '{"version":2}')
    assert.equal(readBaselineManifest(dir), null, 'an unknown manifest version is ignored')
    writeFileSync(join(dir, 'baseline.json'), 'not json')
    assert.equal(readBaselineManifest(dir), null)
  })
})

test('hashFile is stable and content-addressed', () => {
  withTempDir(dir => {
    const first = join(dir, 'a.png')
    const second = join(dir, 'b.png')
    writeFileSync(first, 'same bytes')
    writeFileSync(second, 'same bytes')
    assert.equal(hashFile(first), hashFile(second))
    writeFileSync(second, 'other bytes')
    assert.notEqual(hashFile(first), hashFile(second))
  })
})
