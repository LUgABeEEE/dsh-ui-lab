/**
 * Device profile registry for dsh-ui-lab.
 *
 * Profiles are data (`profiles/profiles.json`), not code: adding a device never
 * touches the capture path. The module validates the whole file on load so a
 * typo fails at startup with the offending entry instead of producing a
 * screenshot at the wrong size.
 *
 * @typedef {object} Profile
 * @property {string} id              Stable kebab-case id used by `--profile`.
 * @property {string} label           Human-readable device name.
 * @property {'phone'|'tablet'|'foldable'} category
 * @property {{ width: number, height: number }} viewport  CSS pixels.
 * @property {number} deviceScaleFactor  Physical pixels per CSS pixel.
 * @property {boolean} isMobile       Forwarded to the Playwright context.
 * @property {boolean} hasTouch       Forwarded to the Playwright context.
 * @property {string} userAgent
 * @property {string} platform        `ios`, `android`, …
 * @property {string} [notes]
 *
 * @typedef {object} ResolveResult
 * @property {string} query
 * @property {'hit'|'ambiguous'|'miss'} status
 * @property {Profile|null} match      Set only for `hit`.
 * @property {Profile[]} matches       One entry for `hit`, candidates for
 *                                     `ambiguous`, empty for `miss`.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Categories a profile may declare. `foldable` is reserved for a later milestone. */
export const PROFILE_CATEGORIES = Object.freeze(['phone', 'tablet', 'foldable'])

const DEFAULT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'profiles.json')
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function invalid(source, message) {
  throw new TypeError(`${source}: ${message}`)
}

function requireString(value, field, source) {
  if (typeof value !== 'string' || value.trim() === '') {
    invalid(source, `${field} must be a non-empty string`)
  }
}

function requireCategory(value, source) {
  if (!PROFILE_CATEGORIES.includes(value)) {
    invalid(source, `category must be one of ${PROFILE_CATEGORIES.join(', ')}`)
  }
}

/**
 * Validate one profile object. Exported so tooling and tests can check a
 * candidate entry before it enters `profiles.json`.
 *
 * @param {unknown} profile
 * @param {string} [source]  Label used in error messages.
 * @returns {Profile}
 */
export function validateProfile(profile, source = 'profile') {
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
    invalid(source, 'must be an object')
  }

  requireString(profile.id, 'id', source)
  if (!ID_PATTERN.test(profile.id)) {
    invalid(source, `id "${profile.id}" must be kebab-case (a-z, 0-9, single dashes)`)
  }
  requireString(profile.label, 'label', source)
  requireCategory(profile.category, source)

  const viewport = profile.viewport
  if (typeof viewport !== 'object' || viewport === null) {
    invalid(source, 'viewport must be an object with width and height')
  }
  for (const side of ['width', 'height']) {
    const value = viewport[side]
    if (!Number.isInteger(value) || value <= 0) {
      invalid(source, `viewport.${side} must be a positive integer`)
    }
  }

  if (
    typeof profile.deviceScaleFactor !== 'number' ||
    !Number.isFinite(profile.deviceScaleFactor) ||
    profile.deviceScaleFactor <= 0
  ) {
    invalid(source, 'deviceScaleFactor must be a positive number')
  }

  if (typeof profile.isMobile !== 'boolean') invalid(source, 'isMobile must be a boolean')
  if (typeof profile.hasTouch !== 'boolean') invalid(source, 'hasTouch must be a boolean')

  requireString(profile.userAgent, 'userAgent', source)
  requireString(profile.platform, 'platform', source)
  if (profile.notes !== undefined) requireString(profile.notes, 'notes', source)

  return /** @type {Profile} */ (profile)
}

/**
 * Read and validate the profile database.
 *
 * @param {string} [filePath]  Defaults to the bundled `profiles/profiles.json`;
 *                             tests and tools can point it at a fixture.
 * @returns {Profile[]}
 */
export function loadProfiles(filePath = DEFAULT_FILE) {
  let text
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`cannot read profile database ${filePath}: ${error.message}`, { cause: error })
  }

  let database
  try {
    database = JSON.parse(text)
  } catch (error) {
    throw new Error(`profile database ${filePath} is not valid JSON: ${error.message}`, {
      cause: error,
    })
  }

  if (typeof database !== 'object' || database === null || Array.isArray(database)) {
    invalid(filePath, 'must contain a JSON object with "version" and "profiles"')
  }
  if (!Number.isInteger(database.version) || database.version < 1) {
    invalid(filePath, '"version" must be a positive integer')
  }
  if (!Array.isArray(database.profiles)) {
    invalid(filePath, '"profiles" must be an array')
  }

  /** @type {Map<string, string>} */
  const seen = new Map()
  return database.profiles.map((profile, index) => {
    const source = `${filePath}: profiles[${index}]`
    validateProfile(profile, source)
    if (seen.has(profile.id)) {
      invalid(source, `duplicate id "${profile.id}" (already defined at ${seen.get(profile.id)})`)
    }
    seen.set(profile.id, source)
    return profile
  })
}

const DEFAULT_PROFILES = loadProfiles()

/**
 * List profiles, optionally filtered by category.
 *
 * @param {{ category?: 'phone'|'tablet'|'foldable' }} [options]
 * @param {Profile[]} [profiles]
 * @returns {Profile[]}
 */
export function list({ category } = {}, profiles = DEFAULT_PROFILES) {
  if (category === undefined) return profiles.slice()
  if (!PROFILE_CATEGORIES.includes(category)) {
    throw new RangeError(
      `unknown profile category "${category}" (expected one of ${PROFILE_CATEGORIES.join(', ')})`,
    )
  }
  return profiles.filter(profile => profile.category === category)
}

/**
 * Look up a profile by exact id (case-insensitive fallback).
 *
 * @param {string} id
 * @param {Profile[]} [profiles]
 * @returns {Profile|undefined}
 */
export function get(id, profiles = DEFAULT_PROFILES) {
  if (typeof id !== 'string') return undefined
  const needle = id.trim().toLowerCase()
  if (needle === '') return undefined
  return (
    profiles.find(profile => profile.id === id) ??
    profiles.find(profile => profile.id.toLowerCase() === needle)
  )
}

/**
 * Resolve a user-supplied name to a profile in three states:
 *
 * - `hit` — exactly one profile matched (exact id first, then exact label, then
 *   a unique substring match over id / label / platform / category);
 * - `ambiguous` — several profiles matched; `matches` lists the candidates and
 *   `match` stays `null` so callers cannot silently pick one;
 * - `miss` — nothing matched.
 *
 * `resolve('iphone')` is the canonical ambiguous case: four iPhones match,
 * including `phone-390x844`.
 *
 * @param {string} name
 * @param {Profile[]} [profiles]
 * @returns {ResolveResult}
 */
export function resolve(name, profiles = DEFAULT_PROFILES) {
  const query = typeof name === 'string' ? name.trim() : ''
  const needle = query.toLowerCase()

  const result = (status, matches) => ({
    query,
    status,
    match: status === 'hit' ? matches[0] : null,
    matches,
  })

  if (needle === '') return result('miss', [])

  const exactId = profiles.filter(profile => profile.id.toLowerCase() === needle)
  if (exactId.length === 1) return result('hit', exactId)

  const exactLabel = profiles.filter(profile => profile.label.toLowerCase() === needle)
  if (exactLabel.length === 1) return result('hit', exactLabel)
  if (exactLabel.length > 1) return result('ambiguous', exactLabel)

  const matches = profiles.filter(profile =>
    [profile.id, profile.label, profile.platform, profile.category].some(value =>
      value.toLowerCase().includes(needle),
    ),
  )
  if (matches.length === 0) return result('miss', [])
  if (matches.length === 1) return result('hit', matches)
  return result('ambiguous', matches)
}
