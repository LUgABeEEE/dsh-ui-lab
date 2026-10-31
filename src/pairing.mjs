/**
 * Device pairing for the `dsh-mobile` surface.
 *
 * The DSH desktop UI exposes a loopback admin API. We open a one-time pairing
 * window, exchange its token through the same form a phone uses, ask for a
 * device-scoped client-module override, and persist the resulting storage state
 * under the (git-ignored) cache directory. The pairing token and the resulting
 * cookies are credentials: they never enter logs, reports or screenshot names.
 */
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { RuntimeError, scrub } from './errors.mjs'

export const PAIRING_HINT =
  'Open the DSH desktop UI → Mobile access → LAN, make sure the gateway is running, then retry. ' +
  'If the device was revoked, run with --fresh.'

/**
 * @param {string} stateDir
 * @returns {string}
 */
export function pairingStatePath(stateDir) {
  return join(stateDir, 'mobile-state.json')
}

/**
 * URL safe for terminals/reports: credentials and token-like query parameters
 * are removed.
 *
 * @param {string|URL} value
 * @returns {string}
 */
export function redactUrl(value) {
  try {
    const url = new URL(String(value))
    url.username = ''
    url.password = ''
    for (const key of ['token', 'csrf', 'code', 'state']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '<redacted>')
    }
    return url.href
  } catch {
    return scrub(value)
  }
}

/**
 * Read the dsh-mobile gateway origin from the loopback admin API.
 *
 * @param {{ adminUrl: string, timeoutMs: number }} options
 * @returns {Promise<string>}
 */
export async function fetchGatewayOrigin({ adminUrl, timeoutMs }) {
  const statusUrl = new URL('/api/mobile-access/status', adminUrl).href
  let response
  try {
    response = await fetch(statusUrl, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw new RuntimeError(
      `cannot reach the DSH admin API at ${redactUrl(adminUrl)} (${scrub(error.message)}). ${PAIRING_HINT}`,
      { cause: error },
    )
  }
  if (!response.ok) {
    throw new RuntimeError(
      `mobile-access status returned HTTP ${response.status} at ${redactUrl(adminUrl)}. ${PAIRING_HINT}`,
    )
  }
  const status = await response.json().catch(error => {
    throw new RuntimeError(`mobile-access status is not valid JSON (${scrub(error.message)}). ${PAIRING_HINT}`, {
      cause: error,
    })
  })
  const origin = status?.gateway?.origin
  if (typeof origin !== 'string' || origin.trim() === '') {
    throw new RuntimeError(`the dsh-mobile gateway is not running. ${PAIRING_HINT}`)
  }
  return origin.replace(/\/+$/u, '')
}

/**
 * Open a one-time pairing window. The returned object contains the token; call
 * it, feed it to the pairing form, then drop it. Never log or persist it.
 *
 * @param {{ adminUrl: string, timeoutMs: number }} options
 * @returns {Promise<{ token: string }>}
 */
export async function openPairingWindow({ adminUrl, timeoutMs }) {
  const origin = new URL(adminUrl).origin
  let response
  try {
    response = await fetch(new URL('/api/mobile-access/pairing/open', adminUrl), {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-dsh-mobile-web-admin': 'same-origin-json',
        'sec-fetch-site': 'same-origin',
      },
      body: '{}',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new RuntimeError(
      `cannot open a pairing window at ${redactUrl(adminUrl)} (${scrub(error.message)}). ${PAIRING_HINT}`,
      { cause: error },
    )
  }
  if (response.status !== 200 && response.status !== 201) {
    throw new RuntimeError(`the pairing window request failed (HTTP ${response.status}). ${PAIRING_HINT}`)
  }
  const opened = await response.json().catch(error => {
    throw new RuntimeError(`the pairing window response is not valid JSON (${scrub(error.message)}). ${PAIRING_HINT}`, {
      cause: error,
    })
  })
  if (typeof opened?.token !== 'string' || opened.token === '') {
    throw new RuntimeError(`the pairing window returned no token. ${PAIRING_HINT}`)
  }
  return { token: opened.token }
}

/**
 * Persist a browser context's cookies, mode 0600.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {string} statePath
 */
export async function saveStorageState(context, statePath) {
  mkdirSync(dirname(statePath), { recursive: true })
  await context.storageState({ path: statePath })
  try {
    chmodSync(statePath, 0o600)
  } catch {
    // Best effort: some filesystems do not support chmod.
  }
}
