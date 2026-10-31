/** Command-line parsing and validation. Pure: no I/O, no browser. */
import { UsageError } from './errors.mjs'
import { PROFILE_CATEGORIES } from './profiles.mjs'

export const COMMANDS = Object.freeze(['list', 'shot', 'matrix', 'measure', 'doctor'])
export const SURFACES = Object.freeze(['mobile', 'web'])

const BOOLEAN_FLAGS = new Set(['json', 'fresh', 'help', 'version'])
const VALUE_FLAGS = new Set([
  'surface',
  'profile',
  'profiles',
  'class',
  'out',
  'url',
  'admin-url',
  'wait',
  'inject',
  'playwright',
  'open',
  'baseline',
  'save-baseline',
  'diff-threshold',
])

const VALUE_FLAG_NAMES = [...VALUE_FLAGS]

function fail(message) {
  throw new UsageError(message)
}

/**
 * Parse argv (without `node` and the script path).
 *
 * @param {string[]} argv
 * @returns {{ command: string|null, options: Record<string, unknown>, help: boolean, version: boolean }}
 */
export function parseArgs(argv) {
  const tokens = [...argv]
  const options = { json: false, fresh: false }
  let command = null

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]

    if (token === '--') fail('positional arguments are not supported')

    if (token.startsWith('--')) {
      const equals = token.indexOf('=')
      const name = equals === -1 ? token.slice(2) : token.slice(2, equals)
      const inline = equals === -1 ? undefined : token.slice(equals + 1)

      if (name === '') fail('empty option name')
      if (BOOLEAN_FLAGS.has(name)) {
        if (inline !== undefined) fail(`--${name} does not take a value`)
        options[name] = true
        continue
      }
      if (!VALUE_FLAGS.has(name)) fail(`unknown option --${name}`)

      let value = inline
      if (value === undefined) {
        index += 1
        value = tokens[index]
        if (value === undefined || value.startsWith('--')) fail(`--${name} requires a value`)
      }
      options[name] = value
      continue
    }

    if (token === '-h') {
      options.help = true
      continue
    }
    if (token === '-v') {
      options.version = true
      continue
    }
    if (token.startsWith('-')) fail(`unknown option ${token}`)

    if (command === null) {
      if (!COMMANDS.includes(token)) fail(`unknown command "${token}" (expected one of ${COMMANDS.join(', ')})`)
      command = token
      continue
    }
    fail(`unexpected argument "${token}"`)
  }

  if (command === null && options.help !== true && options.version !== true) options.help = true

  if (options.wait !== undefined) {
    const wait = Number(options.wait)
    if (!Number.isInteger(wait) || wait < 0) fail('--wait must be a non-negative integer number of milliseconds')
    options.wait = wait
  }
  if (options.surface !== undefined && !SURFACES.includes(options.surface)) {
    fail(`--surface must be one of ${SURFACES.join(', ')}`)
  }
  if (options['diff-threshold'] !== undefined) {
    const threshold = Number(options['diff-threshold'])
    if (!Number.isFinite(threshold) || threshold < 0) fail('--diff-threshold must be a non-negative percentage')
    options['diff-threshold'] = threshold
  }
  if (options.class !== undefined && !PROFILE_CATEGORIES.includes(options.class)) {
    fail(`--class must be one of ${PROFILE_CATEGORIES.join(', ')}`)
  }

  validateCommand(command, options)

  return { command, options, help: Boolean(options.help), version: Boolean(options.version) }
}

/**
 * Command-specific flag rules.
 *
 * @param {string|null} command
 * @param {Record<string, unknown>} options
 */
export function validateCommand(command, options) {
  if (options.help === true || options.version === true) return

  if (command === 'list') {
    const unused = VALUE_FLAG_NAMES.filter(name => name !== 'class' && options[name] !== undefined)
    if (options.fresh !== false && options.fresh !== undefined) unused.push('fresh')
    if (unused.length > 0) fail(`--${unused[0]} is not used by list`)
    return
  }

  if (command === 'doctor') {
    const unused = VALUE_FLAG_NAMES.filter(name => name !== 'playwright' && options[name] !== undefined)
    if (options.fresh !== false && options.fresh !== undefined) unused.push('fresh')
    if (unused.length > 0) fail(`--${unused[0]} is not used by doctor`)
    return
  }

  if (command === 'list' && (options.baseline !== undefined || options['save-baseline'] !== undefined)) {
    fail('list does not use baseline options')
  }
  if (command === 'measure' && (options.baseline !== undefined || options['save-baseline'] !== undefined)) {
    fail('measure writes no screenshot, so baseline flags have nothing to work with')
  }
  if (command === 'shot' || command === 'measure') {
    if (typeof options.profile !== 'string' || options.profile.trim() === '') {
      fail(`${command} requires --profile <id|name>`)
    }
    if (options.profiles !== undefined) fail('--profiles is for matrix; use --profile for a single device')
    return
  }

  if (command === 'matrix') {
    if (options.profile !== undefined) fail('use --profiles or --class for matrix')
    return
  }
}
