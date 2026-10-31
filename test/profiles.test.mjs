import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  get,
  list,
  loadProfiles,
  PROFILE_CATEGORIES,
  resolve,
  validateProfile,
} from '../src/profiles.mjs'

// The dimensions below come from the agreed device set, not from Playwright's
// device descriptors (those drift between Playwright releases). They are the
// contract the CLI and reports rely on.
const EXPECTED = [
  ['phone-360x800', 360, 800, 3],
  ['phone-375x667', 375, 667, 2],
  ['phone-390x844', 390, 844, 3],
  ['phone-393x852', 393, 852, 3],
  ['phone-412x915', 412, 915, 2.625],
  ['phone-430x932', 430, 932, 3],
  ['tablet-768x1024', 768, 1024, 2],
  ['tablet-800x1280', 800, 1280, 2],
  ['tablet-820x1180', 820, 1180, 2],
  ['tablet-834x1194', 834, 1194, 2],
]

const sample = overrides => ({
  id: 'phone-390x844',
  label: 'Sample phone',
  category: 'phone',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  platform: 'ios',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)',
  ...overrides,
})

/** Write a one-profile database to a temp file and hand its path to `run`. */
function withDatabase(profiles, run) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-profiles-'))
  try {
    const file = join(directory, 'profiles.json')
    writeFileSync(file, JSON.stringify({ version: 1, profiles }))
    run(file)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('the bundled database matches the agreed device set', () => {
  assert.equal(list().length, EXPECTED.length)
  assert.equal(list({ category: 'phone' }).length, 6)
  assert.equal(list({ category: 'tablet' }).length, 4)
  assert.equal(list({ category: 'foldable' }).length, 0)

  for (const [id, width, height, deviceScaleFactor] of EXPECTED) {
    const profile = get(id)
    assert.ok(profile, `${id} is missing`)
    assert.equal(profile.viewport.width, width, `${id} width`)
    assert.equal(profile.viewport.height, height, `${id} height`)
    assert.equal(profile.deviceScaleFactor, deviceScaleFactor, `${id} deviceScaleFactor`)
    assert.equal(profile.category, id.startsWith('tablet-') ? 'tablet' : 'phone')
  }
})

test('ids are unique and kebab-case', () => {
  const ids = list().map(profile => profile.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate profile id')
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
})

test('every profile has complete, well-typed fields', () => {
  for (const profile of list()) {
    assert.equal(typeof profile.label, 'string')
    assert.ok(profile.label.trim().length > 0, `${profile.id}: empty label`)
    assert.ok(PROFILE_CATEGORIES.includes(profile.category), `${profile.id}: bad category`)

    assert.ok(Number.isInteger(profile.viewport.width) && profile.viewport.width > 0)
    assert.ok(Number.isInteger(profile.viewport.height) && profile.viewport.height > 0)
    assert.ok(Number.isFinite(profile.deviceScaleFactor) && profile.deviceScaleFactor > 0)

    assert.equal(typeof profile.isMobile, 'boolean')
    assert.equal(typeof profile.hasTouch, 'boolean')
    assert.equal(profile.hasTouch, true, `${profile.id}: a touch profile must have hasTouch`)

    assert.equal(typeof profile.userAgent, 'string')
    assert.match(profile.userAgent, /^Mozilla\/5\.0 /)
    assert.equal(typeof profile.platform, 'string')
    assert.ok(profile.platform.length > 0)
    if (profile.notes !== undefined) {
      assert.equal(typeof profile.notes, 'string')
      assert.ok(profile.notes.trim().length > 0)
    }

    // Validate through the public validator too: it must accept its own data.
    assert.equal(validateProfile(profile), profile)
  }
})

test('viewport widths stay in a sane range per category', () => {
  const ranges = {
    phone: { minWidth: 320, maxWidth: 480, minHeight: 600, maxHeight: 1000 },
    tablet: { minWidth: 600, maxWidth: 1400, minHeight: 800, maxHeight: 1400 },
  }
  for (const profile of list()) {
    const range = ranges[profile.category]
    if (range === undefined) continue
    assert.ok(profile.viewport.width >= range.minWidth && profile.viewport.width <= range.maxWidth)
    assert.ok(profile.viewport.height >= range.minHeight && profile.viewport.height <= range.maxHeight)
  }
})

test('get resolves an exact id and reports unknown ids as undefined', () => {
  assert.equal(get('phone-390x844').label, 'iPhone 13 / 14 / 15')
  assert.equal(get('PHONE-390X844').id, 'phone-390x844')
  assert.equal(get('phone-000x000'), undefined)
  assert.equal(get(''), undefined)
  assert.equal(get(undefined), undefined)
})

test('list rejects an unknown category', () => {
  assert.throws(() => list({ category: 'watch' }), RangeError)
})

test('resolve returns a hit for an exact id', () => {
  const result = resolve('phone-390x844')
  assert.equal(result.status, 'hit')
  assert.equal(result.matches.length, 1)
  assert.equal(result.match.id, 'phone-390x844')
})

test('resolve is case-insensitive and accepts exact labels', () => {
  assert.equal(resolve('PIXEL 7').status, 'hit')
  assert.equal(resolve('PIXEL 7').match.id, 'phone-412x915')
  assert.equal(resolve('  ipad air 11  ').match.id, 'tablet-820x1180')
})

test('resolve returns a hit for a unique fuzzy term', () => {
  assert.equal(resolve('360').status, 'hit')
  assert.equal(resolve('360').match.id, 'phone-360x800')
})

test('resolve reports ambiguity with candidates for a family name', () => {
  const result = resolve('iphone')
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.match, null)
  assert.deepEqual(
    result.matches.map(profile => profile.id),
    ['phone-375x667', 'phone-390x844', 'phone-393x852', 'phone-430x932'],
  )
  assert.ok(result.matches.some(profile => profile.id === 'phone-390x844'))
})

test('resolve returns a miss when nothing matches', () => {
  const result = resolve('nokia 3310')
  assert.equal(result.status, 'miss')
  assert.equal(result.match, null)
  assert.deepEqual(result.matches, [])
  assert.equal(resolve('').status, 'miss')
})

test('loadProfiles rejects a non-integer viewport', () => {
  withDatabase([sample({ viewport: { width: 390.5, height: 844 } })], file => {
    assert.throws(() => loadProfiles(file), /viewport\.width must be a positive integer/)
  })
})

test('loadProfiles rejects a non-positive device pixel ratio', () => {
  withDatabase([sample({ deviceScaleFactor: 0 })], file => {
    assert.throws(() => loadProfiles(file), /deviceScaleFactor must be a positive number/)
  })
})

test('loadProfiles rejects duplicate ids', () => {
  withDatabase([sample(), sample()], file => {
    assert.throws(() => loadProfiles(file), /duplicate id "phone-390x844"/)
  })
})

test('loadProfiles rejects an unknown category', () => {
  withDatabase([sample({ category: 'television' })], file => {
    assert.throws(() => loadProfiles(file), /category must be one of/)
  })
})
