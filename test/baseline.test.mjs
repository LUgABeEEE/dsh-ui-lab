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
  const paths = baselinePaths('/tmp/out', '/tmp/base', 'mobile', 'phone-390x844')
  assert.equal(paths.name, 'mobile__phone-390x844.png')
  assert.equal(paths.current, '/tmp/out/mobile__phone-390x844.png')
  assert.equal(paths.reference, '/tmp/base/mobile__phone-390x844.png')
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
