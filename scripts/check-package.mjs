#!/usr/bin/env node
/**
 * Pack dsh-ui-lab the way npm would publish it, install that tarball into a
 * throwaway prefix, and run the CLI from the installed copy.
 *
 * Unit tests run against the source tree, so a broken `files` allowlist (a
 * missing module, a missing profile table, a bin that is not executable) stays
 * invisible until someone installs the package. This check is that first
 * install — it runs in CI and in `prepublishOnly`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REQUIRED_FILES = [
  'package.json',
  'src/cli.mjs',
  'src/capture.mjs',
  'src/profiles.mjs',
  'profiles/profiles.json',
  'README.md',
  'README.zh.md',
  'CHANGELOG.md',
  'LICENSE',
]

const failures = []
const notes = []
const fail = message => failures.push(message)

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    ...options,
  })
}

const work = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-package-'))
try {
  run('npm', ['pack', '--pack-destination', work, '--silent'])
  const packed = readdirSync(work).filter(name => name.endsWith('.tgz'))
  if (packed.length !== 1) throw new Error(`expected one tarball, got ${packed.join(', ') || 'none'}`)
  notes.push(`tarball ${packed[0]}`)

  const prefix = join(work, 'app')
  run('npm', ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--ignore-scripts', join(work, packed[0])])
  const installed = join(prefix, 'node_modules', 'dsh-ui-lab')
  if (!existsSync(installed)) throw new Error('npm did not install dsh-ui-lab into the prefix')

  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(installed, file))) fail(`published tarball is missing ${file}`)
  }

  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
  const source = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  if (manifest.version !== source.version) fail(`installed version ${manifest.version} != source ${source.version}`)
  if (manifest.bin?.['dsh-ui-lab'] !== 'src/cli.mjs') fail('published manifest lost the dsh-ui-lab bin')
  if (manifest.type !== 'module') fail('published manifest lost "type": "module"')

  const cli = join(installed, 'src', 'cli.mjs')
  const version = run(process.execPath, [cli, '--version']).trim()
  if (version !== manifest.version) fail(`cli --version printed ${version}, expected ${manifest.version}`)
  const listed = run(process.execPath, [cli, 'list'])
  if (!/10 profile\(s\)/.test(listed)) fail(`cli list output looks wrong: ${listed.slice(0, 120)}`)
  notes.push(`cli ${version}, 10 profiles`)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error('check-package: FAIL')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`check-package: ok（${notes.join('；')}）`)
