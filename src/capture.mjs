/**
 * Browser capture: one profile × one surface → screenshot + measurements.
 *
 * A session owns a single Chromium instance so `matrix` pays the launch cost
 * once. Each profile gets a fresh, isolated browser context with its own
 * viewport, DPR, touch flags and user agent. For `mobile`, the cached pairing
 * state is loaded unless `--fresh` is set (which also forces a new pairing).
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { RuntimeError, UsageError, scrub } from './errors.mjs'
import { applyInjection, resolveInjection } from './inject.mjs'
import { baselinePaths, compareScreenshots } from './baseline.mjs'
import { pairingStatePath } from './pairing.mjs'
import { resolvePlaywright } from './playwright.mjs'
import { resolveWebToken } from './token.mjs'
import { openMobileSurface, resolveGatewayOrigin } from './surfaces/mobile.mjs'
import { openWebSurface, resolveWebUrl } from './surfaces/web.mjs'

/**
 * @param {{ defaults: object, onWarning?: (message: string) => void }} options
 */
export async function openCaptureSession({ defaults, onWarning }) {
  const playwright = resolvePlaywright({
    explicit: defaults.playwrightModule,
    dshHome: defaults.dshHome,
  })

  let browser
  try {
    browser = await playwright.chromium.launch()
  } catch (error) {
    throw new RuntimeError(
      `cannot launch Chromium (${scrub(error.message)}). Install it with \`npx playwright install chromium\` ` +
        'or point PLAYWRIGHT_BROWSERS_PATH at an existing download.',
      { cause: error },
    )
  }

  return {
    /**
     * @param {{ profile: import('./profiles.mjs').Profile, surface: string, outDir: string, url?: string|null, waitMs: number, timeoutMs: number, fresh: boolean, inject?: string|null, screenshot?: boolean }} options
     */
    async capture(options) {
      return captureOne(browser, { ...options, defaults, onWarning })
    },
    async close() {
      await browser.close().catch(() => {})
    },
  }
}

async function captureOne(
  browser,
  {
    profile,
    surface,
    defaults,
    outDir,
    url = null,
    waitMs,
    timeoutMs,
    fresh,
    inject = null,
    open = null,
    baselineDir = null,
    diffThreshold = undefined,
    screenshot = true,
    onWarning,
  },
) {
  const startedAt = Date.now()
  const statePath = pairingStatePath(defaults.stateDir)
  const reuseState = surface === 'mobile' && fresh !== true && existsSync(statePath)

  const contextOptions = {
    viewport: { width: profile.viewport.width, height: profile.viewport.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    userAgent: profile.userAgent,
    ignoreHTTPSErrors: true,
  }
  if (reuseState) contextOptions.storageState = statePath

  let context
  try {
    context = await browser.newContext(contextOptions)
  } catch (error) {
    const hint = reuseState ? ' The cached pairing state may be stale; retry with --fresh.' : ''
    throw new RuntimeError(`cannot create the browser context for ${profile.id} (${scrub(error.message)}).${hint}`, {
      cause: error,
    })
  }

  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(scrub(message.text()).slice(0, 500))
  })
  page.on('pageerror', error => {
    consoleErrors.push(scrub(error.message).slice(0, 500))
  })

  try {
    let surfaceInfo
    if (surface === 'web') {
      const baseUrl = resolveWebUrl({ url, defaults })
      let urlToken = null
      try {
        urlToken = new URL(baseUrl).searchParams.get('token')
      } catch {
        throw new UsageError(`--url is not a valid URL: ${baseUrl}`)
      }
      const { token } = resolveWebToken({
        urlToken,
        envToken: defaults.webToken,
        tokenFile: defaults.webTokenFile,
      })
      surfaceInfo = await openWebSurface(page, {
        baseUrl,
        token,
        waitMs,
        timeoutMs,
      })
    } else if (surface === 'mobile') {
      const gatewayOrigin = await resolveGatewayOrigin({ url, defaults, timeoutMs, onWarning })
      surfaceInfo = await openMobileSurface(page, context, {
        gatewayOrigin,
        adminUrl: defaults.adminUrl,
        defaults,
        statePath,
        fresh: fresh === true,
        waitMs,
        timeoutMs,
      })
    } else {
      throw new UsageError(`unknown surface "${surface}"`)
    }

    let opened = null
    if (open !== null && open !== undefined) {
      opened = await openPanel(page, open, timeoutMs)
    }

    let injection = null
    if (inject !== null) {
      injection = await applyInjection(page, resolveInjection(inject))
      await page.waitForTimeout(500)
    }

    const metrics = await measurePage(page)

    let screenshotPath = null
    if (screenshot !== false) {
      mkdirSync(outDir, { recursive: true })
      screenshotPath = join(outDir, `${surface}__${profile.id}.png`)
      await page.screenshot({ path: screenshotPath })
    }

    let baseline = null
    if (baselineDir !== null && screenshotPath !== null) {
      const paths = baselinePaths(outDir, baselineDir, surface, profile.id)
      if (existsSync(paths.reference) === false) {
        baseline = { status: 'missing', diffPct: null, diffPixels: null, totalPixels: null }
      } else {
        baseline = await compareScreenshots(page, paths, { thresholdPct: diffThreshold })
      }
    }

    return {
      profile: { id: profile.id, label: profile.label, category: profile.category },
      surface,
      url: surfaceInfo.url,
      metrics,
      screenshot: screenshotPath,
      injection,
      opened,
      baseline,
      consoleErrors,
      durationMs: Date.now() - startedAt,
      ok: true,
    }
  } catch (error) {
    if (error instanceof RuntimeError || error instanceof UsageError) throw error
    throw new RuntimeError(scrub(error.message), { cause: error })
  } finally {
    await context.close().catch(() => {})
  }
}

/**
 * Open a plugin panel by its sidebar label, the way a person would: find the row,
 * click it, wait for the panel to mount. A collapsed drawer hides its rows first,
 * so the toggle is used before giving up.
 *
 * @param {import('playwright').Page} page
 * @param {string} name  Case-insensitive substring of the row's label or text.
 * @param {number} timeoutMs
 * @returns {Promise<{ label: string }>}
 */
export async function openPanel(page, name, timeoutMs) {
  const findRow = needle =>
    page.evaluate(text => {
      const wanted = text.toLowerCase()
      const rows = [...document.querySelectorAll('[data-slot="sidebar"] :is(button, a, [role="button"])')]
      const labels = rows.map(element => (element.getAttribute('aria-label') || element.textContent || '').trim())
      const index = labels.findIndex(label => label.toLowerCase().includes(wanted))
      return { labels: labels.filter(Boolean).slice(0, 24), index }
    }, needle)

  let found = await findRow(name)
  if (found.index < 0) {
    // A collapsed drawer keeps its rows out of reach; open it like a user would.
    const toggled = await page.evaluate(() => {
      const toggle = [...document.querySelectorAll('button, [role="button"]')].find(element =>
        /open sidebar|展开|侧栏/i.test(element.getAttribute('aria-label') || ''))
      if (toggle === undefined) return false
      toggle.click()
      return true
    })
    if (toggled === true) {
      await page.waitForTimeout(400)
      found = await findRow(name)
    }
  }
  if (found.index < 0) {
    throw new RuntimeError(
      `--open "${name}" did not match any sidebar row. Visible rows: ${found.labels.length === 0 ? '(none)' : found.labels.join(', ')}`,
    )
  }

  const label = await page.evaluate(index => {
    const rows = [...document.querySelectorAll('[data-slot="sidebar"] :is(button, a, [role="button"])')]
    const row = rows[index]
    const text = (row.getAttribute('aria-label') || row.textContent || '').trim()
    row.click()
    return text
  }, found.index)

  await page
    .waitForFunction(() => document.querySelector('[data-slot="main"] > *') !== null, undefined, {
      timeout: Math.min(timeoutMs, 15_000),
    })
    .catch(() => undefined)
  await page.waitForTimeout(600)
  return { label }
}

/**
 * Measurements that matter for responsive debugging. `documentElement.scrollWidth`
 * and `body.clientWidth` are reported separately because the stock web UI can
 * overflow its viewport while its body still reports a large client width.
 *
 * @param {import('playwright').Page} page
 */
export async function measurePage(page) {
  return page.evaluate(() => {
    const documentElement = document.documentElement
    const body = document.body
    const visualViewport = window.visualViewport
    return {
      // The emulated CSS viewport. Under mobile emulation `window.innerWidth`
      // can report the enlarged layout viewport when content overflows, so the
      // visual viewport is the honest "device viewport" number.
      viewport: {
        width: visualViewport?.width ?? window.innerWidth,
        height: visualViewport?.height ?? window.innerHeight,
      },
      layoutViewport: { width: window.innerWidth, height: window.innerHeight },
      visualViewport:
        visualViewport === null || visualViewport === undefined
          ? null
          : { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale },
      devicePixelRatio: window.devicePixelRatio,
      title: document.title,
      documentElement: {
        clientWidth: documentElement.clientWidth,
        scrollWidth: documentElement.scrollWidth,
        clientHeight: documentElement.clientHeight,
        scrollHeight: documentElement.scrollHeight,
      },
      body:
        body === null
          ? null
          : {
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
            },
      overflowX: documentElement.scrollWidth > documentElement.clientWidth,
      shell: document.querySelector('.dshm-shell') !== null,
      panel: (() => {
        const node = document.querySelector('[data-slot="main"] > *')
        if (node === null) return null
        const box = node.getBoundingClientRect()
        return {
          width: Math.round(box.width * 10) / 10,
          left: Math.round(box.left * 10) / 10,
          right: Math.round(box.right * 10) / 10,
          panelNav: document.querySelector('.dshm-panelNav') !== null,
        }
      })(),
      touchTargets: (() => {
        const selector = '[data-slot="main"] :is(button, [role="button"], input, select, textarea)'
        const sizes = []
        for (const node of document.querySelectorAll(selector)) {
          const style = getComputedStyle(node)
          if (style.display === 'none' || style.visibility === 'hidden') continue
          const box = node.getBoundingClientRect()
          if (box.width === 0 && box.height === 0) continue
          sizes.push(Math.round(Math.min(box.width, box.height) * 10) / 10)
        }
        if (sizes.length === 0) return null
        return { count: sizes.length, min: Math.min(...sizes), under44: sizes.filter(size => size < 43.5).length }
      })(),
      dedicatedMobileFrontend: window.__DSH_MOBILE_FRONTEND__ ?? null,
    }
  })
}
