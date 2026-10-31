/**
 * Baseline comparison: "did this proportion look different than last time?"
 *
 * Screenshot bytes are not a useful answer on their own — a single antialiased
 * pixel flips the hash and hides the real question ("did anything move?"). So the
 * comparison decodes both PNGs in the browser we already have and counts pixels
 * that differ beyond a small per-channel tolerance.
 *
 * It runs inside the page because Node has no canvas: the two files travel as
 * data URLs, get painted into an OffscreenCanvas, and their ImageData is compared
 * (alpha included, so a widget appearing or disappearing counts).
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/** Per-channel tolerance; JPEG-style noise is not a concern here (PNG is lossless). */
export const CHANNEL_TOLERANCE = 8

/**
 * A change is "real" only when this share of pixels moved.
 *
 * Not zero: a live DSH page has moving parts on purpose — relative timestamps
 * ("1 h ago"), a blinking caret, a spinner. On a 390×844@3x shot those are a few
 * thousand pixels (≈0.1–0.6%). Below this threshold the run counts as unchanged;
 * raise it with `--diff-threshold` for pages with a clock, lower it to ±0.1%.
 */
export const DIFF_THRESHOLD_PCT = 1

export function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * @param {string} outDir      where this run wrote its screenshots
 * @param {string} baselineDir where the reference screenshots live
 * @param {string} surface
 * @param {string} profileId
 */
export function baselinePaths(outDir, baselineDir, surface, profileId) {
  const name = `${surface}__${profileId}.png`
  return { name, current: join(outDir, name), reference: join(baselineDir, name) }
}

/**
 * Compare two screenshots inside an open page.
 *
 * @param {import('playwright').Page} page
 * @param {{ current: string, reference: string }} paths
 * @returns {Promise<{ status: 'same' | 'changed', diffPct: number, diffPixels: number, totalPixels: number }>}
 */
export async function compareScreenshots(page, paths, { thresholdPct = DIFF_THRESHOLD_PCT } = {}) {
  const currentHash = hashFile(paths.current)
  const referenceHash = hashFile(paths.reference)
  if (currentHash === referenceHash) {
    return { status: 'same', diffPct: 0, diffPixels: 0, totalPixels: 0 }
  }

  const current = readFileSync(paths.current).toString('base64')
  const reference = readFileSync(paths.reference).toString('base64')
  const result = await page.evaluate(
    async ({ a, b, tolerance }) => {
      const load = data =>
        new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('cannot decode screenshot'))
          image.src = `data:image/png;base64,${data}`
        })
      const [left, right] = await Promise.all([load(a), load(b)])
      const width = Math.min(left.naturalWidth, right.naturalWidth)
      const height = Math.min(left.naturalHeight, right.naturalHeight)
      if (width === 0 || height === 0) throw new Error('empty screenshot')
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(left, 0, 0)
      const leftData = context.getImageData(0, 0, width, height).data
      context.clearRect(0, 0, width, height)
      context.drawImage(right, 0, 0)
      const rightData = context.getImageData(0, 0, width, height).data
      let diffPixels = 0
      for (let index = 0; index < leftData.length; index += 4) {
        if (
          Math.abs(leftData[index] - rightData[index]) > tolerance ||
          Math.abs(leftData[index + 1] - rightData[index + 1]) > tolerance ||
          Math.abs(leftData[index + 2] - rightData[index + 2]) > tolerance ||
          Math.abs(leftData[index + 3] - rightData[index + 3]) > tolerance
        ) {
          diffPixels += 1
        }
      }
      // A size change is a change even when the overlapping area matches.
      const sizeChanged = left.naturalWidth !== right.naturalWidth || left.naturalHeight !== right.naturalHeight
      return { diffPixels, totalPixels: width * height, sizeChanged }
    },
    { a: current, b: reference, tolerance: CHANNEL_TOLERANCE },
  )

  const diffPct = result.totalPixels === 0 ? 0 : (result.diffPixels / result.totalPixels) * 100
  const changed = result.sizeChanged === true || diffPct > thresholdPct
  return {
    status: changed ? 'changed' : 'same',
    diffPct: Math.round(diffPct * 100) / 100,
    diffPixels: result.diffPixels,
    totalPixels: result.totalPixels,
  }
}

/**
 * Copy the current screenshots into the baseline directory and write a manifest.
 *
 * @param {{ entries: { name: string, current: string }[], baselineDir: string, surface: string, generatedAt?: string }} options
 */
export function writeBaseline({ entries, baselineDir, surface, generatedAt = new Date().toISOString() }) {
  mkdirSync(baselineDir, { recursive: true })
  const files = []
  for (const entry of entries) {
    if (entry.current === null || !existsSync(entry.current)) continue
    const target = join(baselineDir, entry.name)
    copyFileSync(entry.current, target)
    files.push({ name: entry.name, sha256: hashFile(target) })
  }
  const manifest = {
    version: 1,
    createdAt: generatedAt,
    surface,
    files,
  }
  writeFileSync(join(baselineDir, 'baseline.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { manifest, path: join(baselineDir, 'baseline.json') }
}

/**
 * Read a baseline manifest when one exists. A directory of PNGs without a
 * manifest still works — the comparison only needs the file names.
 */
export function readBaselineManifest(baselineDir) {
  const path = join(baselineDir, 'baseline.json')
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed?.version === 1 ? parsed : null
  } catch {
    return null
  }
}

export function baselineName(path) {
  return basename(path)
}
