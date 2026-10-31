#!/usr/bin/env node
/**
 * Zero-dependency lint for the scaffold.
 *
 * Two checks, no network and no browser:
 *   1. `node --check` over every JavaScript module in the tree;
 *   2. JSON.parse over every JSON file (package metadata, lockfile, profiles).
 *
 * It also verifies that every `bin` target named in package.json exists, because
 * a broken bin link is only noticed at install time otherwise.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.shots',
  'coverage',
  'playwright-report',
  'blob-report',
  'test-results',
])
const SCRIPT_EXT = new Set(['.js', '.mjs', '.cjs'])
const JSON_EXT = new Set(['.json'])

function walk(directory) {
  const entries = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      entries.push(...walk(join(directory, entry.name)))
    } else if (entry.isFile()) {
      entries.push(join(directory, entry.name))
    }
  }
  return entries
}

const files = walk(ROOT)
const modules = files.filter(file => SCRIPT_EXT.has(extname(file)))
const jsonFiles = files.filter(file => JSON_EXT.has(extname(file)))
const failures = []

for (const file of modules) {
  const rel = relative(ROOT, file)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    failures.push(`${rel}: node --check failed\n${(result.stderr || '').trim()}`)
  }
}

for (const file of jsonFiles) {
  const rel = relative(ROOT, file)
  try {
    JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    failures.push(`${rel}: invalid JSON — ${error.message}`)
  }
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
for (const [name, target] of Object.entries(pkg.bin ?? {})) {
  const resolved = resolve(ROOT, target)
  if (!resolved.startsWith(ROOT)) {
    failures.push(`package.json: bin "${name}" points outside the package (${target})`)
    continue
  }
  try {
    readFileSync(resolved)
  } catch {
    failures.push(`package.json: bin "${name}" points at a missing file (${target})`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`lint failed (${failures.length} problem(s)):\n\n${failures.join('\n\n')}\n`)
  process.exit(1)
}

process.stdout.write(
  `lint ok: node --check on ${modules.length} module(s), ${jsonFiles.length} JSON file(s), ` +
    `${Object.keys(pkg.bin ?? {}).length} bin target(s)\n`,
)
