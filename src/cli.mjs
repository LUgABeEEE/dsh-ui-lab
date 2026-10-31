#!/usr/bin/env node
/**
 * dsh-ui-lab — debug the DeepSeek Harness UI on Linux, headless.
 *
 * Commands: list, shot, measure, matrix. Capture commands load Playwright lazily
 * so `list`, `--help` and the test suite never need a browser.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './args.mjs'
import { getDefaults } from './defaults.mjs'
import { UsageError, scrub } from './errors.mjs'
import { list } from './profiles.mjs'
import { expandMatrix, selectOne } from './selection.mjs'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'))

const USAGE = `dsh-ui-lab ${pkg.version} — headless DSH UI debugging on Linux

Usage:
  dsh-ui-lab list    [--class <phone|tablet|foldable>] [--json]
  dsh-ui-lab shot    --profile <id|name> [options]
  dsh-ui-lab measure --profile <id|name> [options]
  dsh-ui-lab matrix  [--class <category>] [--profiles <ids|names>] [options]

Options (shot / measure / matrix):
  --surface <web|mobile>   Surface to open (default: web)
  --profile <id|name>      One device profile; fuzzy names are resolved
  --profiles <ids|names>   Matrix selection, comma separated; categories work
  --class <category>       phone | tablet | foldable
  --out <dir>              Output directory (default: ./.shots)
  --url <url>              Web: DSH web URL (may carry ?token=…)
                           Mobile: gateway origin override
  --admin-url <url>        Mobile: DSH admin API base (default: DSH_UI_LAB_URL)
  --wait <ms>              Extra settle time after load (default: 2000)
  --inject <css|pack>      Inject a CSS file or a dsh-mobile pack directory
  --open <label>           Click the sidebar row whose label matches, then capture that panel
  --baseline <dir>         Compare each screenshot with <dir>/<surface>__<profile>.png (exit 1 on a real change)
  --save-baseline <dir>    Copy this run's screenshots into <dir> as the new baseline
  --diff-threshold <pct>   Share of pixels that counts as a change (default 1)
  --fresh                  Ignore the cached mobile pairing and pair again
  --json                   Machine-readable stdout
  --playwright <module>    Playwright module/path override

Global:
  -h, --help               Show this help
  -v, --version            Print the version

Environment:
  DSH_UI_LAB_URL           Base DSH web URL (default http://127.0.0.1:3080)
  DSH_UI_LAB_ADMIN_URL     Mobile pairing admin base (default: DSH_UI_LAB_URL)
  DSH_UI_LAB_MOBILE_GATEWAY  dsh-mobile gateway origin override
  DSH_UI_LAB_WEB_TOKEN     DSH web launch token (when the URL is bare)
  DSH_UI_LAB_WEB_TOKEN_FILE  File containing the token; must be mode 600
  DSH_UI_LAB_STATE_DIR     Pairing cache directory (default ./.cache)
  DSH_UI_LAB_SHOTS_DIR     Default output directory (default ./.shots)
  DSH_UI_LAB_WAIT_MS       Default --wait
  DSH_UI_LAB_TIMEOUT_MS    Navigation and pairing timeout
  DSH_UI_LAB_DEVICE_LABEL  Device label used when pairing
  DSH_UI_LAB_PLAYWRIGHT    Playwright module/path override
  DSH_HOME                 DSH home used to locate a Playwright profile

Exit codes: 0 success · 1 runtime/assertion failure · 2 usage error.
`

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function displayPath(path) {
  const rel = relative(process.cwd(), path)
  return rel === '' || rel.startsWith('..') ? path : rel
}

function onWarning(message) {
  process.stderr.write(`warning: ${scrub(message)}\n`)
}

function effectiveDefaults(options) {
  const defaults = getDefaults()
  if (typeof options.playwright === 'string' && options.playwright.trim() !== '') {
    defaults.playwrightModule = options.playwright.trim()
  }
  if (typeof options['admin-url'] === 'string' && options['admin-url'].trim() !== '') {
    defaults.adminUrl = options['admin-url'].trim()
  }
  if (typeof options.wait === 'number') defaults.waitMs = options.wait
  return defaults
}

function profileTable(profiles) {
  const groups = new Map()
  for (const profile of profiles) {
    if (!groups.has(profile.category)) groups.set(profile.category, [])
    groups.get(profile.category).push(profile)
  }
  const lines = [`dsh-ui-lab · ${profiles.length} profile(s)`, '']
  for (const [category, entries] of groups) {
    lines.push(`${category} (${entries.length})`)
    for (const profile of entries) {
      const size = `${profile.viewport.width}×${profile.viewport.height} @${profile.deviceScaleFactor}x`
      lines.push(`  ${profile.id.padEnd(24)} ${profile.label.padEnd(34)} ${size}`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function shotText(result) {
  const metrics = result.metrics
  const doc = metrics.documentElement
  const body = metrics.body
  const lines = [
    `${result.surface} · ${result.profile.label} (${result.profile.id})`,
    `  url          ${result.url}`,
    `  viewport     ${metrics.viewport.width}×${metrics.viewport.height} @${metrics.devicePixelRatio}x`,
    `  scrollWidth  ${doc.scrollWidth}` + (body === null ? '' : ` (body.clientWidth ${body.clientWidth})`),
    `  overflow-x   ${metrics.overflowX ? 'yes' : 'no'}`,
    `  shell        ${metrics.shell ? 'yes' : 'no'}`,
    `  duration     ${result.durationMs} ms`,
  ]
  if (result.screenshot !== null) lines.push(`  screenshot   ${displayPath(result.screenshot)}`)
  if (result.baseline !== null && result.baseline !== undefined) {
    lines.push(`  baseline     ${baselineLabel(result)}`)
  }
  if (result.opened !== null && result.opened !== undefined) {
    lines.push(`  opened       ${result.opened.label}`)
  }
  if (result.metrics.panel !== null && result.metrics.panel !== undefined) {
    const { width, left, right } = result.metrics.panel
    lines.push(`  panel        ${width}px wide, x ${left}…${right}`)
  }
  if (result.metrics.touchTargets !== null && result.metrics.touchTargets !== undefined) {
    const { count, min, under44 } = result.metrics.touchTargets
    lines.push(`  touch        ${count} control(s), smallest ${min}px, ${under44} under 44px`)
  }
  if (result.injection !== null) {
    const { kind, id, cssBytes, jsBytes } = result.injection
    lines.push(`  injected     ${kind}${id === null ? '' : ` ${id}`} (css ${cssBytes} B, js ${jsBytes} B)`)
  }
  if (result.consoleErrors.length > 0) lines.push(`  console      ${result.consoleErrors.length} error(s)`)
  return `${lines.join('\n')}\n`
}

function baselineLabel(row) {
  const baseline = row.baseline
  if (baseline === null || baseline === undefined) return '—'
  if (baseline.status === 'same') return 'same'
  if (baseline.status === 'changed') return `CHANGED ${baseline.diffPct}%`
  if (baseline.status === 'missing') return 'no-ref'
  return baseline.status
}

function matrixText(summary, htmlPath, jsonPath) {
  const lines = [`${summary.surface} matrix · ${summary.totals.profiles} profile(s)`, '']
  for (const row of summary.results) {
    const size = row.viewport === null ? '—' : `${row.viewport.width}×${row.viewport.height}`
    const state = row.ok ? 'ok  ' : 'FAIL'
    lines.push(
      `  ${state} ${row.id.padEnd(24)} ${size.padEnd(9)} overflow=${row.overflowX ? 'yes' : 'no '} ` +
        `baseline=${baselineLabel(row)} ${String(row.durationMs).padStart(5)} ms`,
    )
    if (row.error !== null) lines.push(`       ${row.error.split('\n')[0]}`)
  }
  lines.push('', `report   ${displayPath(htmlPath)}`, `summary  ${displayPath(jsonPath)}`)
  lines.push(
    '',
    `${summary.totals.ok} captured, ${summary.totals.failed} failed, ${summary.totals.overflow} overflowing horizontally.` +
      (summary.totals.compared > 0
        ? `\n${summary.totals.unchanged} unchanged, ${summary.totals.changed} changed, ${summary.totals.missing} missing against the baseline.`
        : ''),
  )
  return `${lines.join('\n')}\n`
}

async function commandList(options) {
  const profiles = options.class === undefined ? list() : list({ category: options.class })
  if (options.json) {
    writeJson(profiles)
    return 0
  }
  process.stdout.write(profileTable(profiles))
  return 0
}

async function commandCapture(command, options) {
  const defaults = effectiveDefaults(options)
  const profile = selectOne(list(), options.profile)
  const outDir = resolve(options.out ?? defaults.shotsDir)
  const surface = options.surface ?? 'web'
  const { openCaptureSession } = await import('./capture.mjs')

  const session = await openCaptureSession({ defaults, onWarning })
  try {
    const result = await session.capture({
      profile,
      surface,
      outDir,
      url: options.url ?? null,
      waitMs: defaults.waitMs,
      timeoutMs: defaults.timeoutMs,
      fresh: options.fresh === true,
      inject: options.inject ?? null,
      open: options.open ?? null,
      baselineDir: options.baseline === undefined ? null : resolve(options.baseline),
      diffThreshold: options['diff-threshold'],
      screenshot: command === 'shot',
    })
    let baselinePath = null
    if (options['save-baseline'] !== undefined && result.screenshot !== null) {
      const { writeBaseline } = await import('./baseline.mjs')
      const written = writeBaseline({
        entries: [{ name: `${result.surface}__${result.profile.id}.png`, current: result.screenshot }],
        baselineDir: resolve(options['save-baseline']),
        surface: result.surface,
      })
      baselinePath = written.path
    }
    if (options.json) writeJson({ ...result, baselineManifest: baselinePath })
    else {
      process.stdout.write(shotText(result))
      if (baselinePath !== null) process.stdout.write(`baseline ${displayPath(baselinePath)}\n`)
    }
    if (result.baseline?.status === 'changed' || result.baseline?.status === 'missing') return 1
    return 0
  } finally {
    await session.close()
  }
}

async function commandMatrix(options) {
  const defaults = effectiveDefaults(options)
  const names =
    typeof options.profiles === 'string'
      ? options.profiles
          .split(',')
          .map(name => name.trim())
          .filter(name => name !== '')
      : []
  const profiles = expandMatrix(list(), { category: options.class, names })
  const outDir = resolve(options.out ?? defaults.shotsDir)
  const surface = options.surface ?? 'web'
  const { openCaptureSession } = await import('./capture.mjs')

  const session = await openCaptureSession({ defaults, onWarning })
  const results = []
  let first = true
  try {
    for (const profile of profiles) {
      // --fresh discards the cached pairing once; later profiles reuse the state
      // that the first pairing just wrote.
      const fresh = options.fresh === true && first
      first = false
      try {
        const result = await session.capture({
          profile,
          surface,
          outDir,
          url: options.url ?? null,
          waitMs: defaults.waitMs,
          timeoutMs: defaults.timeoutMs,
          fresh,
          inject: options.inject ?? null,
          open: options.open ?? null,
          baselineDir: options.baseline === undefined ? null : resolve(options.baseline),
          diffThreshold: options['diff-threshold'],
          screenshot: true,
        })
        results.push(result)
        process.stderr.write(`ok ${profile.id} (${result.durationMs} ms)\n`)
      } catch (error) {
        const message = scrub(error?.message ?? error)
        results.push({
          profile: { id: profile.id, label: profile.label, category: profile.category },
          surface,
          ok: false,
          error: message,
          durationMs: 0,
          screenshot: null,
          metrics: {},
        })
        process.stderr.write(`failed ${profile.id}: ${message}\n`)
      }
    }
  } finally {
    await session.close()
  }

  let baselinePath = null
  if (options['save-baseline'] !== undefined) {
    const { writeBaseline } = await import('./baseline.mjs')
    const written = writeBaseline({
      entries: results.map(result => ({
        name: `${surface}__${result.profile.id}.png`,
        current: result.screenshot,
      })),
      baselineDir: resolve(options['save-baseline']),
      surface,
    })
    baselinePath = written.path
  }

  const { writeReport } = await import('./report.mjs')
  const { summary, htmlPath, jsonPath } = writeReport({ outDir, surface, results })
  if (options.json) {
    writeJson({ ...summary, reportHtml: htmlPath, summaryJson: jsonPath, baselineManifest: baselinePath })
  } else {
    process.stdout.write(matrixText(summary, htmlPath, jsonPath))
    if (baselinePath !== null) process.stdout.write(`baseline ${displayPath(baselinePath)}\n`)
  }
  if (summary.totals.failed > 0) return 1
  // A baseline run is a gate: a real change means "look, then re-save".
  if (summary.totals.changed > 0 || summary.totals.missing > 0) return 1
  return 0
}

async function main(argv) {
  const parsed = parseArgs(argv)
  if (parsed.help) {
    process.stdout.write(USAGE)
    return 0
  }
  if (parsed.version) {
    process.stdout.write(`${pkg.version}\n`)
    return 0
  }

  switch (parsed.command) {
    case 'list':
      return commandList(parsed.options)
    case 'shot':
    case 'measure':
      return commandCapture(parsed.command, parsed.options)
    case 'matrix':
      return commandMatrix(parsed.options)
    default:
      throw new UsageError(`unknown command "${parsed.command}"`)
  }
}

main(process.argv.slice(2)).then(
  code => {
    process.exitCode = code
  },
  error => {
    const message = scrub(error?.message ?? error)
    process.stderr.write(`dsh-ui-lab: ${message}\n`)
    if (error instanceof UsageError) {
      process.stderr.write('Run `dsh-ui-lab --help` for usage.\n')
      process.exitCode = 2
    } else {
      process.exitCode = 1
    }
  },
)
