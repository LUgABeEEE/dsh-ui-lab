import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArgs } from '../src/args.mjs'
import { UsageError } from '../src/errors.mjs'

function usageError(argv) {
  assert.throws(() => parseArgs(argv), UsageError)
}

test('parses list with class filtering and json', () => {
  const parsed = parseArgs(['list', '--class', 'phone', '--json'])
  assert.equal(parsed.command, 'list')
  assert.equal(parsed.options.class, 'phone')
  assert.equal(parsed.options.json, true)
  assert.equal(parsed.help, false)
})

test('parses shot flags and --flag=value syntax', () => {
  const parsed = parseArgs([
    'shot',
    '--surface=web',
    '--profile=phone-390x844',
    '--out',
    '.shots',
    '--wait',
    '500',
    '--json',
  ])
  assert.equal(parsed.command, 'shot')
  assert.deepEqual(parsed.options, {
    surface: 'web',
    profile: 'phone-390x844',
    out: '.shots',
    wait: 500,
    json: true,
    fresh: false,
  })
})

test('parses matrix selection', () => {
  const parsed = parseArgs(['matrix', '--surface', 'mobile', '--class', 'phone', '--profiles', 'iphone se,pixel 7'])
  assert.equal(parsed.command, 'matrix')
  assert.equal(parsed.options.surface, 'mobile')
  assert.equal(parsed.options.class, 'phone')
  assert.equal(parsed.options.profiles, 'iphone se,pixel 7')
})

test('parses measure and inject', () => {
  const parsed = parseArgs(['measure', '--profile', 'iphone', '--inject', 'packs/demo', '--fresh'])
  assert.equal(parsed.command, 'measure')
  assert.equal(parsed.options.profile, 'iphone')
  assert.equal(parsed.options.inject, 'packs/demo')
  assert.equal(parsed.options.fresh, true)
})

test('accepts the mobile admin-url override', () => {
  const parsed = parseArgs(['shot', '--profile', 'iphone', '--surface', 'mobile', '--admin-url', 'http://192.0.2.10:3080'])
  assert.equal(parsed.options['admin-url'], 'http://192.0.2.10:3080')
})

test('no arguments prints help', () => {
  const parsed = parseArgs([])
  assert.equal(parsed.help, true)
  assert.equal(parsed.command, null)
})

test('--help and --version are global', () => {
  assert.equal(parseArgs(['--help']).help, true)
  assert.equal(parseArgs(['shot', '--help']).help, true)
  assert.equal(parseArgs(['--version']).version, true)
})

test('rejects unknown commands and options', () => {
  usageError(['frobnicate'])
  usageError(['list', '--bogus'])
  usageError(['list', '-x'])
})

test('rejects missing option values', () => {
  usageError(['shot', '--profile'])
  usageError(['shot', '--profile', '--surface', 'web'])
})

test('rejects invalid flag values', () => {
  usageError(['matrix', '--wait', '-1'])
  usageError(['matrix', '--wait', 'soon'])
  usageError(['matrix', '--surface', 'desktop'])
  usageError(['list', '--class', 'watch'])
})

test('shot and measure require a profile', () => {
  usageError(['shot'])
  usageError(['measure'])
  usageError(['shot', '--class', 'phone'])
})

test('matrix rejects --profile and shot rejects --profiles', () => {
  usageError(['matrix', '--profile', 'iphone'])
  usageError(['shot', '--profile', 'iphone', '--profiles', 'phone'])
})

test('list only accepts flags it uses', () => {
  usageError(['list', '--profile', 'iphone'])
  usageError(['list', '--out', '.shots'])
})
