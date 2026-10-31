import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseArgs } from '../src/args.mjs'
import { collectDoctorChecks } from '../src/doctor.mjs'
import { UsageError } from '../src/errors.mjs'

test('doctor is a command that only accepts --json and --playwright', () => {
  assert.equal(parseArgs(['doctor']).command, 'doctor')
  assert.equal(parseArgs(['doctor', '--json']).options.json, true)
  assert.equal(parseArgs(['doctor', '--playwright', './pw']).options.playwright, './pw')
  assert.throws(() => parseArgs(['doctor', '--profile', 'phone-390x844']), UsageError)
  assert.throws(() => parseArgs(['doctor', '--out', '.shots']), UsageError)
})

test('doctor collects one entry per environment dimension', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-doctor-'))
  const previousUrl = process.env.DSH_UI_LAB_URL
  const previousState = process.env.DSH_UI_LAB_STATE_DIR
  process.env.DSH_UI_LAB_URL = 'http://127.0.0.1:1'
  process.env.DSH_UI_LAB_STATE_DIR = stateDir
  try {
    const checks = await collectDoctorChecks()
    assert.deepEqual(
      checks.map(entry => entry.id),
      ['node', 'playwright', 'chromium', 'profiles', 'state', 'dsh'],
    )
    for (const entry of checks) {
      assert.ok(['ok', 'warn', 'fail'].includes(entry.status), `${entry.id} has a known status`)
      assert.equal(typeof entry.detail, 'string')
      assert.ok(entry.detail.length > 0, `${entry.id} explains itself`)
    }
    // The unreachable URL must degrade to a warning, not a hard failure.
    assert.notEqual(checks.find(entry => entry.id === 'dsh').status, 'fail')
  } finally {
    if (previousUrl === undefined) delete process.env.DSH_UI_LAB_URL
    else process.env.DSH_UI_LAB_URL = previousUrl
    if (previousState === undefined) delete process.env.DSH_UI_LAB_STATE_DIR
    else process.env.DSH_UI_LAB_STATE_DIR = previousState
    rmSync(stateDir, { recursive: true, force: true })
  }
})
