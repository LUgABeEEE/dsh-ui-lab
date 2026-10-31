import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildSummary, renderReportHtml, writeReport } from '../src/report.mjs'

const okResult = {
  profile: { id: 'phone-390x844', label: 'iPhone 13 / 14 / 15', category: 'phone' },
  surface: 'web',
  url: 'http://127.0.0.1:3080/',
  metrics: {
    viewport: { width: 390, height: 844 },
    devicePixelRatio: 3,
    documentElement: { scrollWidth: 980, clientWidth: 390 },
    body: { clientWidth: 964, scrollWidth: 980 },
    overflowX: true,
    shell: false,
  },
  screenshot: '/tmp/out/web__phone-390x844.png',
  durationMs: 1234,
  ok: true,
}

const failedResult = {
  profile: { id: 'tablet-768x1024', label: 'iPad mini', category: 'tablet' },
  surface: 'web',
  ok: false,
  error: 'navigation timed out',
  durationMs: 50,
  screenshot: null,
  metrics: {},
}

test('summary captures per-profile metrics for machines', () => {
  const summary = buildSummary({ surface: 'web', results: [okResult, failedResult], generatedAt: '2026-10-30T00:00:00.000Z' })
  assert.equal(summary.version, 1)
  assert.equal(summary.surface, 'web')
  assert.deepEqual(summary.totals, { profiles: 2, ok: 1, failed: 1, overflow: 1, panels: 0, under44: 0, compared: 0, changed: 0, unchanged: 0, missing: 0 })
  assert.equal(summary.results[0].scrollWidth, 980)
  assert.equal(summary.results[0].bodyClientWidth, 964)
  assert.equal(summary.results[0].overflowX, true)
  assert.equal(summary.results[0].screenshot, 'web__phone-390x844.png')
  assert.equal(summary.results[1].ok, false)
  assert.equal(summary.results[1].error, 'navigation timed out')
  assert.equal(summary.results[0].panel, null)
  assert.equal(summary.results[0].touchTargets, null)
  assert.equal(summary.results[0].opened, null)
  assert.equal(summary.results[0].baseline, null)
})

test('baseline statuses flow into totals and the HTML', () => {
  const same = { ...okResult, baseline: { status: 'same', diffPct: 0, diffPixels: 0, totalPixels: 10 } }
  const changed = {
    ...okResult,
    profile: { id: 'phone-360x800', label: 'Android', category: 'phone' },
    baseline: { status: 'changed', diffPct: 1.5, diffPixels: 15, totalPixels: 1000 },
  }
  const missing = {
    ...okResult,
    profile: { id: 'phone-375x667', label: 'iPhone SE', category: 'phone' },
    baseline: { status: 'missing', diffPct: null, diffPixels: null, totalPixels: null },
  }
  const summary = buildSummary({ surface: 'mobile', results: [same, changed, missing], generatedAt: '2026-10-30T00:00:00.000Z' })
  assert.equal(summary.totals.compared, 3)
  assert.equal(summary.totals.unchanged, 1)
  assert.equal(summary.totals.changed, 1)
  assert.equal(summary.totals.missing, 1)
  const html = renderReportHtml(summary)
  assert.match(html, /changed 1\.5%/)
  assert.match(html, /no reference/)
})

test('panel and touch-target columns flow into the summary and the HTML', () => {
  const withPanel = {
    ...okResult,
    opened: { label: 'Todos' },
    metrics: {
      ...okResult.metrics,
      panel: { width: 390, left: 0, right: 390, panelNav: true },
      touchTargets: { count: 335, min: 44, under44: 0 },
    },
  }
  const small = {
    ...okResult,
    profile: { id: 'phone-360x800', label: 'Android', category: 'phone' },
    opened: { label: 'Todos' },
    metrics: {
      ...okResult.metrics,
      panel: { width: 360, left: 56, right: 390, panelNav: true },
      touchTargets: { count: 12, min: 28, under44: 5 },
    },
  }
  const summary = buildSummary({ surface: 'mobile', results: [withPanel, small], generatedAt: '2026-10-30T00:00:00.000Z' })
  assert.equal(summary.totals.panels, 2)
  assert.equal(summary.totals.under44, 1)
  assert.deepEqual(summary.results[0].panel, { width: 390, left: 0, right: 390, panelNav: true })
  assert.equal(summary.results[0].opened, 'Todos')
  const html = renderReportHtml(summary)
  assert.match(html, /Todos/)
  assert.match(html, /335 control\(s\)/)
  assert.match(html, /5 under 44/)
})

test('report HTML is self-contained and escapes text', () => {
  const summary = buildSummary({
    surface: 'web',
    results: [{ ...okResult, profile: { ...okResult.profile, label: '<script>alert(1)</script>' } }],
    generatedAt: '2026-10-30T00:00:00.000Z',
  })
  const html = renderReportHtml(summary)
  assert.match(html, /<style>/)
  assert.match(html, /web__phone-390x844\.png/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<link\b/)
  assert.doesNotMatch(html, /<script\b/)
  assert.doesNotMatch(html, /src="https?:/)
})

test('writeReport writes summary.json and report.html into the output directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-report-'))
  try {
    const { summary, htmlPath, jsonPath } = writeReport({
      outDir: directory,
      surface: 'web',
      results: [okResult, failedResult],
      generatedAt: '2026-10-30T00:00:00.000Z',
    })
    assert.equal(summary.totals.profiles, 2)

    const onDisk = JSON.parse(readFileSync(jsonPath, 'utf8'))
    assert.equal(onDisk.results.length, 2)
    assert.equal(onDisk.results[0].overflowX, true)
    assert.equal(onDisk.results[0].durationMs, 1234)

    const html = readFileSync(htmlPath, 'utf8')
    assert.match(html, /phone-390x844/)
    assert.match(html, /tablet-768x1024/)
    assert.match(html, /navigation timed out/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
