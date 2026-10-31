/**
 * Playwright resolution.
 *
 * Order: an explicit module/path (flag or `DSH_UI_LAB_PLAYWRIGHT`), then the
 * package's own dependency, then the DSH web/desktop profiles. Never assume a
 * machine-specific location; everything is derived from the package root or
 * `DSH_HOME`.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RuntimeError } from './errors.mjs'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function requireFrom(anchor, specifier) {
  return createRequire(anchor)(specifier)
}

/**
 * @param {{ explicit?: string|null, dshHome?: string|null }} [options]
 * @returns {typeof import('playwright')}
 */
export function resolvePlaywright({ explicit = null, dshHome = null } = {}) {
  const tried = []

  if (explicit) {
    tried.push(explicit)
    try {
      return requireFrom(join(PACKAGE_ROOT, 'package.json'), explicit)
    } catch {
      // A directory or module entry path rather than a bare specifier.
    }
    try {
      const absolute = resolve(explicit)
      if (existsSync(join(absolute, 'package.json'))) {
        return requireFrom(join(absolute, 'package.json'), 'playwright')
      }
      return requireFrom(join(PACKAGE_ROOT, 'package.json'), absolute)
    } catch {
      // Fall through to the standard anchors.
    }
  }

  const anchors = [join(PACKAGE_ROOT, 'package.json')]
  if (dshHome) {
    anchors.push(join(dshHome, 'profiles', 'web', 'package.json'))
    anchors.push(join(dshHome, 'profiles', 'desktop', 'package.json'))
  }

  for (const anchor of anchors) {
    tried.push(anchor)
    if (!existsSync(anchor)) continue
    try {
      return requireFrom(anchor, 'playwright')
    } catch {
      // Try the next anchor.
    }
  }

  throw new RuntimeError(
    'Playwright is not installed where this CLI can find it. Project install: `npm install -D playwright`. ' +
      'Global CLI: `npm install -g playwright` (normally resolved automatically), or set ' +
      'DSH_UI_LAB_PLAYWRIGHT="$(npm root -g)/playwright"; a DSH profile under $DSH_HOME/profiles/web also works. ' +
      'Finally run `npx playwright install chromium`. ' +
      'Tried: ' +
      tried.join(', '),
  )
}
