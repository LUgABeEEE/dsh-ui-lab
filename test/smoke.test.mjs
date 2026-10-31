import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8')
const pkg = JSON.parse(read('package.json'))

test('package metadata exposes an installable CLI', () => {
  assert.equal(pkg.name, 'dsh-ui-lab')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.engines.node, '>=20')
  assert.equal(pkg.bin['dsh-ui-lab'], 'src/cli.mjs')
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'files field is required')

  for (const script of ['test', 'lint', 'shot']) {
    assert.equal(typeof pkg.scripts[script], 'string', `missing "${script}" script`)
  }

  const manifests = { ...pkg.devDependencies, ...pkg.peerDependencies }
  assert.equal(typeof manifests.playwright, 'string', 'playwright must be a dev or peer dependency')
})

test('the CLI entry point is valid ESM and reports its version', () => {
  const checked = spawnSync(process.execPath, ['--check', join(ROOT, 'src/cli.mjs')], {
    encoding: 'utf8',
  })
  assert.equal(checked.status, 0, checked.stderr)

  const version = spawnSync(process.execPath, [join(ROOT, 'src/cli.mjs'), '--version'], {
    encoding: 'utf8',
  })
  assert.equal(version.status, 0, version.stderr)
  assert.equal(version.stdout.trim(), pkg.version)
})

test('required open-source documents exist', () => {
  const documents = [
    'README.md',
    'README.zh.md',
    'LICENSE',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'SECURITY.md',
  ]
  for (const document of documents) {
    assert.ok(existsSync(join(ROOT, document)), `${document} is missing`)
  }

  const license = read('LICENSE')
  assert.match(license, /MIT License/)
  assert.match(license, /2026/)
  assert.match(license, /LUgABeEEE/)

  assert.match(read('CHANGELOG.md'), /## \[Unreleased\]/)
})

test('the repository contains no machine-specific absolute paths', () => {
  const offenders = []
  for (const file of ['README.md', 'README.zh.md', 'CONTRIBUTING.md', 'package.json']) {
    const text = read(file)
    for (const match of text.matchAll(/\/(?:data|home|Users)\/[^\s)"'`]+/g)) {
      offenders.push(`${file}: ${match[0]}`)
    }
  }
  assert.deepEqual(offenders, [])
})
