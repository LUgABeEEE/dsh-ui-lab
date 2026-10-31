/**
 * `--inject` support: a plain CSS file, or a pack directory with `extension.json`
 * (and optional `mobile.css` / `mobile.js`) in the dsh-mobile extension shape.
 * Resolution is pure file inspection; applying the injection needs a page.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { UsageError } from './errors.mjs'

/**
 * @param {string} input  Path from `--inject`.
 * @param {string} [cwd]
 * @returns {{ kind: 'css'|'pack', id: string|null, cssPath: string|null, jsPath: string|null }}
 */
export function resolveInjection(input, cwd = process.cwd()) {
  const target = isAbsolute(input) ? input : resolve(cwd, input)
  if (!existsSync(target)) throw new UsageError(`--inject path does not exist: ${input}`)

  const stat = statSync(target)
  if (stat.isDirectory()) {
    const manifestPath = join(target, 'extension.json')
    if (!existsSync(manifestPath)) {
      throw new UsageError(`--inject directory has no extension.json: ${input}`)
    }
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      throw new UsageError(`--inject extension.json is invalid JSON (${input}): ${error.message}`)
    }
    const cssPath = existsSync(join(target, 'mobile.css')) ? join(target, 'mobile.css') : null
    const jsPath = existsSync(join(target, 'mobile.js')) ? join(target, 'mobile.js') : null
    if (cssPath === null && jsPath === null) {
      throw new UsageError(`--inject pack has neither mobile.css nor mobile.js: ${input}`)
    }
    const id = typeof manifest.id === 'string' && manifest.id.trim() !== '' ? manifest.id : 'pack'
    return { kind: 'pack', id, cssPath, jsPath }
  }

  if (!target.endsWith('.css')) {
    throw new UsageError('--inject expects a .css file or a pack directory with extension.json')
  }
  return { kind: 'css', id: null, cssPath: target, jsPath: null }
}

/**
 * Apply a resolved injection to a page.
 *
 * @param {import('playwright').Page} page
 * @param {{ kind: 'css'|'pack', id: string|null, cssPath: string|null, jsPath: string|null }} injection
 * @returns {Promise<{ kind: 'css'|'pack', id: string|null, cssBytes: number, jsBytes: number }>}
 */
export async function applyInjection(page, injection) {
  let cssBytes = 0
  let jsBytes = 0

  if (injection.cssPath !== null) {
    const css = readFileSync(injection.cssPath, 'utf8')
    const tag = await page.addStyleTag({ content: css })
    if (injection.id !== null) {
      await tag.evaluate((node, id) => {
        node.dataset.injectedPack = id
      }, injection.id)
    }
    cssBytes = Buffer.byteLength(css)
  }

  if (injection.jsPath !== null) {
    const source = readFileSync(injection.jsPath, 'utf8')
    await page.evaluate(script => {
      const element = document.createElement('script')
      element.textContent = `${script}\n//# sourceURL=dsh-ui-lab-injected.js`
      document.head.append(element)
      element.remove()
    }, source)
    jsBytes = Buffer.byteLength(source)
  }

  return { kind: injection.kind, id: injection.id, cssBytes, jsBytes }
}
