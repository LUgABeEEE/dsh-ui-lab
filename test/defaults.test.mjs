import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fallbackMobileOrigin, getDefaults } from '../src/defaults.mjs'

test('defaults are derived from cwd and home, never machine-specific', () => {
  const defaults = getDefaults({}, '/tmp/work', '/tmp/fake-home')
  assert.equal(defaults.baseUrl, 'http://127.0.0.1:3080')
  assert.equal(defaults.adminUrl, 'http://127.0.0.1:3080')
  assert.equal(defaults.dshHome, '/tmp/fake-home/.dsh')
  assert.equal(defaults.stateDir, '/tmp/work/.cache')
  assert.equal(defaults.shotsDir, '/tmp/work/.shots')
  assert.equal(defaults.waitMs, 2000)
  assert.equal(defaults.timeoutMs, 45_000)
  assert.equal(defaults.deviceLabel, 'dsh-ui-lab')
  assert.equal(defaults.mobileGateway, null)
  assert.equal(defaults.playwrightModule, null)
  assert.equal(defaults.webToken, null)
  assert.equal(defaults.webTokenFile, null)
})

test('DSH_UI_LAB_* environment variables override defaults', () => {
  const defaults = getDefaults(
    {
      DSH_HOME: '/srv/dsh',
      DSH_UI_LAB_URL: 'http://192.0.2.10:3080',
      DSH_UI_LAB_ADMIN_URL: 'http://192.0.2.11:3080',
      DSH_UI_LAB_MOBILE_GATEWAY: 'https://192.0.2.10:3443',
      DSH_UI_LAB_STATE_DIR: '.state',
      DSH_UI_LAB_SHOTS_DIR: '/var/tmp/shots',
      DSH_UI_LAB_WAIT_MS: '250',
      DSH_UI_LAB_TIMEOUT_MS: '5000',
      DSH_UI_LAB_DEVICE_LABEL: 'ci-box',
      DSH_UI_LAB_PLAYWRIGHT: '/opt/pw',
      DSH_UI_LAB_WEB_TOKEN: 'secret-token',
      DSH_UI_LAB_WEB_TOKEN_FILE: '/tmp/secret-token-file',
    },
    '/tmp/work',
  )
  assert.equal(defaults.dshHome, '/srv/dsh')
  assert.equal(defaults.baseUrl, 'http://192.0.2.10:3080')
  assert.equal(defaults.adminUrl, 'http://192.0.2.11:3080')
  assert.equal(defaults.mobileGateway, 'https://192.0.2.10:3443')
  assert.equal(defaults.stateDir, '/tmp/work/.state')
  assert.equal(defaults.shotsDir, '/var/tmp/shots')
  assert.equal(defaults.waitMs, 250)
  assert.equal(defaults.timeoutMs, 5000)
  assert.equal(defaults.deviceLabel, 'ci-box')
  assert.equal(defaults.playwrightModule, '/opt/pw')
  assert.equal(defaults.webToken, 'secret-token')
  assert.equal(defaults.webTokenFile, '/tmp/secret-token-file')
})

test('invalid numeric environment values fail loudly', () => {
  assert.throws(() => getDefaults({ DSH_UI_LAB_WAIT_MS: 'soon' }, '/tmp/work', '/tmp/fake-home'), RangeError)
  assert.throws(() => getDefaults({ DSH_UI_LAB_TIMEOUT_MS: '-1' }, '/tmp/work', '/tmp/fake-home'), RangeError)
})

test('the LAN fallback is an https origin or null', () => {
  const fallback = fallbackMobileOrigin()
  if (fallback !== null) assert.match(fallback, /^https:\/\/\d{1,3}(?:\.\d{1,3}){3}:3443$/)
})
