/**
 * Defaults for every tunable value. Nothing machine-specific is baked in: the
 * DSH home comes from `DSH_HOME` (falling back to `~/.dsh`), directories come
 * from the current working directory, and each value has a `DSH_UI_LAB_*`
 * environment override. CLI flags take precedence over both.
 */
import { homedir, networkInterfaces } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

function stringEnv(env, name) {
  const value = env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function integerEnv(env, name, fallback) {
  const raw = stringEnv(env, name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer (got "${raw}")`)
  }
  return value
}

function dirEnv(env, name, cwd, fallback) {
  const raw = stringEnv(env, name)
  if (raw === undefined) return fallback
  return isAbsolute(raw) ? raw : resolve(cwd, raw)
}

/**
 * Build the effective defaults.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [cwd]
 * @param {string} [home]
 */
export function getDefaults(env = process.env, cwd = process.cwd(), home = homedir()) {
  const dshHome = dirEnv(env, 'DSH_HOME', home, join(home, '.dsh'))
  return {
    baseUrl: stringEnv(env, 'DSH_UI_LAB_URL') ?? 'http://127.0.0.1:3080',
    adminUrl: stringEnv(env, 'DSH_UI_LAB_ADMIN_URL') ?? stringEnv(env, 'DSH_UI_LAB_URL') ?? 'http://127.0.0.1:3080',
    mobileGateway: stringEnv(env, 'DSH_UI_LAB_MOBILE_GATEWAY') ?? null,
    dshHome,
    stateDir: dirEnv(env, 'DSH_UI_LAB_STATE_DIR', cwd, join(cwd, '.cache')),
    shotsDir: dirEnv(env, 'DSH_UI_LAB_SHOTS_DIR', cwd, join(cwd, '.shots')),
    waitMs: integerEnv(env, 'DSH_UI_LAB_WAIT_MS', 2000),
    timeoutMs: integerEnv(env, 'DSH_UI_LAB_TIMEOUT_MS', 45_000),
    deviceLabel: stringEnv(env, 'DSH_UI_LAB_DEVICE_LABEL') ?? 'dsh-ui-lab',
    playwrightModule: stringEnv(env, 'DSH_UI_LAB_PLAYWRIGHT') ?? null,
    webToken: stringEnv(env, 'DSH_UI_LAB_WEB_TOKEN') ?? null,
    webTokenFile: stringEnv(env, 'DSH_UI_LAB_WEB_TOKEN_FILE') ?? null,
  }
}

/**
 * First non-internal IPv4 address, used only as the last-resort fallback for a
 * dsh-mobile gateway that the status API would not reveal.
 *
 * @returns {string|null}
 */
export function lanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && entry.internal === false) return entry.address
    }
  }
  return null
}

/**
 * The fallback gateway origin: `https://<LAN IPv4>:3443`.
 *
 * @returns {string|null}
 */
export function fallbackMobileOrigin() {
  const address = lanAddress()
  return address === null ? null : `https://${address}:3443`
}
