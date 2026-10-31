import assert from 'node:assert/strict'
import { test } from 'node:test'
import { UsageError } from '../src/errors.mjs'
import { list } from '../src/profiles.mjs'
import { expandMatrix, selectOne } from '../src/selection.mjs'

const profiles = list()

test('expands a category into every profile of that category', () => {
  assert.equal(expandMatrix(profiles, { category: 'phone' }).length, 6)
  assert.equal(expandMatrix(profiles, { category: 'tablet' }).length, 4)
  assert.equal(expandMatrix(profiles).length, 10)
})

test('expands comma-separated ids in file order', () => {
  const selected = expandMatrix(profiles, { names: ['tablet-768x1024', 'phone-390x844'] })
  assert.deepEqual(
    selected.map(profile => profile.id),
    ['phone-390x844', 'tablet-768x1024'],
  )
})

test('accepts fuzzy names and category names inside --profiles', () => {
  assert.deepEqual(
    expandMatrix(profiles, { names: ['iphone se'] }).map(profile => profile.id),
    ['phone-375x667'],
  )
  assert.equal(expandMatrix(profiles, { names: ['phone'] }).length, 6)
  assert.equal(expandMatrix(profiles, { category: 'phone', names: ['iphone se'] }).length, 1)
})

test('deduplicates names that resolve to the same profile', () => {
  const selected = expandMatrix(profiles, { names: ['phone-390x844', 'iPhone 13 / 14 / 15'] })
  assert.deepEqual(selected.map(profile => profile.id), ['phone-390x844'])
})

test('reports ambiguous and unknown matrix names as usage errors', () => {
  assert.throws(() => expandMatrix(profiles, { names: ['iphone'] }), error => {
    assert.ok(error instanceof UsageError)
    assert.match(error.message, /ambiguous/)
    assert.match(error.message, /phone-390x844/)
    return true
  })
  assert.throws(() => expandMatrix(profiles, { names: ['nokia'] }), UsageError)
})

test('rejects an empty category', () => {
  assert.throws(() => expandMatrix(profiles, { category: 'foldable' }), UsageError)
})

test('selectOne resolves a single profile or explains the ambiguity', () => {
  assert.equal(selectOne(profiles, 'phone-390x844').id, 'phone-390x844')
  assert.equal(selectOne(profiles, 'iPhone 15 Pro').id, 'phone-393x852')

  assert.throws(() => selectOne(profiles, 'iphone'), error => {
    assert.ok(error instanceof UsageError)
    assert.match(error.message, /ambiguous/)
    for (const id of ['phone-375x667', 'phone-390x844', 'phone-393x852', 'phone-430x932']) {
      assert.ok(error.message.includes(id), `missing candidate ${id}`)
    }
    return true
  })
  assert.throws(() => selectOne(profiles, 'nokia'), UsageError)
})
