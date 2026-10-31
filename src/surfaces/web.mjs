/**
 * `web` surface: the stock DSH web UI opened at a phone-width viewport.
 *
 * Authentication: a real DSH web root requires the per-process launch token
 * that `dsh web` prints at startup. The token can arrive in `--url` (as
 * `?token=…`), through `DSH_UI_LAB_WEB_TOKEN`, or through
 * `DSH_UI_LAB_WEB_TOKEN_FILE` (mode 600, never logged). It is exchanged for the
 * signed cookie once, then the run continues on the clean URL. A device session
 * on the dsh-mobile gateway can instead open the stock frontend with
 * `?frontend=stock`; that path is documented for manual use and is not
 * required by this surface.
 *
 * The surface itself is auth-agnostic: a local fixture server or a `file://`
 * page works with no token at all, which is how the test suite proves the
 * capture path without depending on DSH.
 */
import { RuntimeError, scrub } from '../errors.mjs'
import { redactUrl } from '../pairing.mjs'

export const name = 'web'

/**
 * @param {{ url?: string|null, defaults: { baseUrl: string } }} options
 */
export function resolveWebUrl({ url, defaults }) {
  return typeof url === 'string' && url.trim() !== '' ? url.trim() : defaults.baseUrl
}

/**
 * Open the stock web UI.
 *
 * @param {import('playwright').Page} page
 * @param {{ baseUrl: string, token?: string|null, waitMs: number, timeoutMs: number }} options
 */
export async function openWebSurface(page, { baseUrl, token = null, waitMs, timeoutMs }) {
  let target
  try {
    target = new URL(baseUrl)
  } catch {
    throw new RuntimeError(`--url is not a valid URL: ${baseUrl}`)
  }

  const effectiveToken = token ?? target.searchParams.get('token')

  let response
  try {
    const navigationUrl = new URL(baseUrl)
    if (effectiveToken !== null && effectiveToken !== '') navigationUrl.searchParams.set('token', effectiveToken)
    response = await page.goto(navigationUrl.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  } catch (error) {
    throw new RuntimeError(`cannot open DSH web at ${redactUrl(baseUrl)} (${scrub(error.message)})`, { cause: error })
  }

  const status = response?.status() ?? 0
  if (status === 401) {
    throw new RuntimeError(
      `DSH web at ${redactUrl(baseUrl)} requires authentication. Start \`dsh web\` and copy the root URL it prints ` +
        '(it carries a one-time token), then pass it with --url or set DSH_UI_LAB_URL / DSH_UI_LAB_WEB_TOKEN. ' +
        'The token is a credential: do not commit it.',
    )
  }
  if (status >= 400) {
    throw new RuntimeError(`DSH web returned HTTP ${status} at ${redactUrl(baseUrl)}`)
  }

  // A successful token exchange redirects to the clean URL; if a proxy kept the
  // token in the address bar, reload without it so later logs stay clean.
  if (effectiveToken !== null && effectiveToken !== '') {
    const current = new URL(page.url())
    if (current.searchParams.has('token')) {
      current.searchParams.delete('token')
      await page.goto(current.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {})
    }
  }

  await page.waitForTimeout(waitMs)
  return { url: redactUrl(page.url()), authenticated: effectiveToken !== null && effectiveToken !== '' }
}
