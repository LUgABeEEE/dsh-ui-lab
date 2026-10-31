/**
 * `mobile` surface: the dedicated dsh-mobile page served by the gateway.
 *
 * The gateway origin is discovered from the loopback admin status API, with the
 * LAN `https://<ip>:3443` form as a last-resort fallback. Pairing follows the
 * phone flow: open a one-time window, submit the token form, set a device-scoped
 * `{ excludedClientModules: [] }`, cache the storage state under `.cache/`.
 * Credentials are never logged.
 */
import { RuntimeError, scrub } from '../errors.mjs'
import { fallbackMobileOrigin } from '../defaults.mjs'
import { fetchGatewayOrigin, openPairingWindow, redactUrl, saveStorageState } from '../pairing.mjs'

export const name = 'mobile'

/**
 * @param {{ url?: string|null, defaults: { baseUrl: string, mobileGateway: string|null }, timeoutMs: number, onWarning?: (message: string) => void }} options
 * @returns {Promise<string>}
 */
export async function resolveGatewayOrigin({ url, defaults, timeoutMs, onWarning }) {
  if (typeof url === 'string' && url.trim() !== '') return url.trim().replace(/\/+$/u, '')
  if (typeof defaults.mobileGateway === 'string' && defaults.mobileGateway !== '') {
    return defaults.mobileGateway.replace(/\/+$/u, '')
  }
  try {
    return await fetchGatewayOrigin({ adminUrl: defaults.adminUrl ?? defaults.baseUrl, timeoutMs })
  } catch (error) {
    const fallback = fallbackMobileOrigin()
    if (fallback === null) throw error
    onWarning?.(`${scrub(error.message)} Falling back to ${fallback}.`)
    return fallback
  }
}

async function needsPairing(page) {
  if (page.url().includes('/mobile-access/pair')) return true
  return !(await page
    .evaluate(() => document.querySelector('.dshm-shell') !== null)
    .catch(() => false))
}

async function setClientModules(page) {
  return page.evaluate(async () => {
    const csrf = document.cookie
      .split(';')
      .map(part => part.trim())
      .filter(part => part.startsWith('__Host-dsh_ma_csrf=') || part.startsWith('dsh_ma_csrf='))
      .map(part => part.slice(part.indexOf('=') + 1))[0]
    if (csrf === undefined) return 'no-csrf'
    const response = await fetch('/mobile-access/client-modules', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-dsh-mobile-csrf': csrf },
      body: JSON.stringify({ excludedClientModules: [] }),
    })
    return `client-modules ${response.status}`
  })
}

/**
 * Run the pairing form once and persist the resulting cookies.
 *
 * @param {{ page: import('playwright').Page, context: import('playwright').BrowserContext, adminUrl: string, gatewayOrigin: string, deviceLabel: string, statePath: string, timeoutMs: number }} options
 */
export async function pairDevice({ page, context, adminUrl, gatewayOrigin, deviceLabel, statePath, timeoutMs }) {
  const opened = await openPairingWindow({ adminUrl, timeoutMs })
  try {
    const pairUrl = new URL('/mobile-access/pair', gatewayOrigin).href
    await page.goto(pairUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    await page.fill('#pair-token', opened.token)
    await page.fill('#device-label', deviceLabel)
    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => {}),
      page.click('button[type=submit]'),
    ])
    await page.waitForTimeout(1_200)

    const selection = await setClientModules(page).catch(error => `client-modules failed: ${scrub(error.message)}`)
    await saveStorageState(context, statePath)
    await page.goto(new URL('/', gatewayOrigin).href, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    return { selection }
  } catch (error) {
    throw new RuntimeError(
      `dsh-mobile pairing did not complete (${scrub(error.message)}). Open the DSH desktop UI → Mobile access → LAN, ` +
        'make sure the gateway is running, then retry. If the device was revoked, use --fresh.',
      { cause: error },
    )
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').BrowserContext} context
 * @param {{ gatewayOrigin: string, adminUrl: string, defaults: { deviceLabel: string }, statePath: string, fresh: boolean, waitMs: number, timeoutMs: number }} options
 */
export async function openMobileSurface(
  page,
  context,
  { gatewayOrigin, adminUrl, defaults, statePath, fresh, waitMs, timeoutMs },
) {
  const target = new URL('/', gatewayOrigin).href
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  } catch (error) {
    throw new RuntimeError(
      `cannot open the dsh-mobile gateway at ${redactUrl(target)} (${error.message}). ` +
        'Open the DSH desktop UI → Mobile access → LAN and make sure the gateway is running, then retry.',
      { cause: error },
    )
  }

  await page.waitForTimeout(1_000)
  let paired = false
  let deviceModules = null

  if (fresh || (await needsPairing(page))) {
    const result = await pairDevice({
      page,
      context,
      adminUrl,
      gatewayOrigin,
      deviceLabel: defaults.deviceLabel,
      statePath,
      timeoutMs,
    })
    paired = true
    deviceModules = result.selection
  }

  await page.waitForSelector('.dshm-shell', { timeout: Math.min(timeoutMs, 30_000) }).catch(() => {})
  const shell = await page
    .evaluate(() => document.querySelector('.dshm-shell') !== null)
    .catch(() => false)
  await page.waitForTimeout(waitMs)

  if (!shell) {
    throw new RuntimeError(
      `the dedicated dsh-mobile shell did not mount at ${redactUrl(target)}. Check that Mobile access → LAN is ` +
        'enabled and that this device has a valid module selection; try --fresh to pair again.',
    )
  }

  return { url: redactUrl(page.url()), shell, paired, deviceModules }
}
