/**
 * Matrix reporting: `summary.json` for machines, a self-contained `report.html`
 * for humans. The HTML has no external resources — inline CSS only and local
 * screenshots referenced by file name — so it opens from disk, in a review
 * bundle, or on an air-gapped machine.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

function text(value) {
  return value === null || value === undefined ? '' : String(value)
}

function escapeHtml(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function rowFromResult(result) {
  const metrics = result.metrics ?? {}
  const documentElement = metrics.documentElement ?? {}
  const body = metrics.body ?? {}
  const failed = result.ok === false || result.error !== undefined

  return {
    id: result.profile?.id ?? 'unknown',
    label: result.profile?.label ?? 'unknown profile',
    category: result.profile?.category ?? 'unknown',
    viewport: metrics.viewport ?? null,
    devicePixelRatio: metrics.devicePixelRatio ?? null,
    scrollWidth: documentElement.scrollWidth ?? null,
    bodyClientWidth: body.clientWidth ?? null,
    overflowX: metrics.overflowX === true,
    shell: metrics.shell === true,
    opened: result.opened?.label ?? null,
    baseline: result.baseline ?? null,
    panel: metrics.panel ?? null,
    touchTargets: metrics.touchTargets ?? null,
    durationMs: result.durationMs ?? null,
    ok: !failed,
    screenshot: result.screenshot ? basename(result.screenshot) : null,
    error: failed ? text(result.error ?? 'capture failed') : null,
  }
}

/**
 * @param {{ surface: string, results: object[], generatedAt?: string }} options
 */
export function buildSummary({ surface, results, generatedAt = new Date().toISOString() }) {
  const rows = results.map(rowFromResult)
  return {
    version: 1,
    generatedAt,
    surface,
    totals: {
      profiles: rows.length,
      ok: rows.filter(row => row.ok).length,
      failed: rows.filter(row => !row.ok).length,
      overflow: rows.filter(row => row.overflowX).length,
      panels: rows.filter(row => row.panel !== null).length,
      under44: rows.filter(row => (row.touchTargets?.under44 ?? 0) > 0).length,
      compared: rows.filter(row => row.baseline !== null && row.baseline !== undefined).length,
      changed: rows.filter(row => row.baseline?.status === 'changed').length,
      unchanged: rows.filter(row => row.baseline?.status === 'same').length,
      missing: rows.filter(row => row.baseline?.status === 'missing').length,
    },
    results: rows,
  }
}

function panelCell(row) {
  if (row.panel === null || row.panel === undefined) return '—'
  const { width, left, right } = row.panel
  const note = row.opened === null ? '' : `<div class="muted">${escapeHtml(row.opened)}</div>`
  return `${escapeHtml(width)} px<div class="muted">x ${escapeHtml(left)}…${escapeHtml(right)}</div>${note}`
}

function touchCell(row) {
  const targets = row.touchTargets
  if (targets === null || targets === undefined) return '—'
  const under = targets.under44 > 0
  return `${escapeHtml(targets.count)} control(s)<div class="${under ? 'warn' : 'muted'}">smallest ${escapeHtml(targets.min)} px` +
    `${under ? ` · ${escapeHtml(targets.under44)} under 44` : ''}</div>`
}

function baselineCell(row) {
  const baseline = row.baseline
  if (baseline === null || baseline === undefined) return '—'
  if (baseline.status === 'same') return '<span class="ok">same</span>'
  if (baseline.status === 'changed') return `<span class="bad">changed ${escapeHtml(baseline.diffPct)}%</span>`
  if (baseline.status === 'missing') return '<span class="warn">no reference</span>'
  return escapeHtml(baseline.status)
}

function badge(ok) {
  return ok ? '<span class="ok">ok</span>' : '<span class="bad">failed</span>'
}

/**
 * @param {ReturnType<typeof buildSummary>} summary
 * @returns {string}
 */
export function renderReportHtml(summary) {
  const rows = summary.results
    .map(row => {
      const thumbnail =
        row.screenshot === null
          ? '<div class="missing">no screenshot</div>'
          : `<img src="${escapeHtml(row.screenshot)}" alt="${escapeHtml(row.label)} screenshot">`
      const viewport =
        row.viewport === null
          ? '—'
          : `${escapeHtml(row.viewport.width)}×${escapeHtml(row.viewport.height)}` +
            (row.devicePixelRatio === null ? '' : ` @${escapeHtml(row.devicePixelRatio)}x`)
      return `<tr>
      <td class="shot">${thumbnail}</td>
      <td><strong>${escapeHtml(row.label)}</strong><br><code>${escapeHtml(row.id)}</code><br><span class="muted">${escapeHtml(row.category)}</span></td>
      <td>${viewport}</td>
      <td>${row.scrollWidth === null ? '—' : escapeHtml(row.scrollWidth)} / ${row.bodyClientWidth === null ? '—' : escapeHtml(row.bodyClientWidth)}</td>
      <td>${row.overflowX ? '<span class="warn">yes</span>' : 'no'}</td>
      <td>${panelCell(row)}</td>
      <td>${touchCell(row)}</td>
      <td>${baselineCell(row)}</td>
      <td>${row.durationMs === null ? '—' : `${escapeHtml(row.durationMs)} ms`}</td>
      <td>${badge(row.ok)}${row.error === null ? '' : `<div class="error">${escapeHtml(row.error)}</div>`}</td>
    </tr>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh-ui-lab · ${escapeHtml(summary.surface)} matrix</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2rem; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { margin: 0 0 .25rem; font-size: 1.4rem; }
  .meta { margin: 0 0 1.5rem; color: #666; }
  .totals { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .totals div { padding: .5rem .75rem; border: 1px solid #8884; border-radius: .5rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; vertical-align: top; padding: .6rem .7rem; border-bottom: 1px solid #8884; }
  th { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: #666; }
  .shot img { display: block; width: 160px; max-height: 340px; object-fit: contain; border: 1px solid #8884; border-radius: .4rem; background: #8881; }
  .missing { width: 160px; padding: 1rem .5rem; text-align: center; border: 1px dashed #8886; border-radius: .4rem; color: #888; }
  code { font-size: .85em; }
  .muted { color: #777; font-size: .85em; }
  .ok { color: #157f3b; font-weight: 600; }
  .bad { color: #b3261e; font-weight: 600; }
  .warn { color: #9a5b00; font-weight: 600; }
  .error { margin-top: .25rem; color: #b3261e; font-size: .85em; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>dsh-ui-lab · ${escapeHtml(summary.surface)} matrix</h1>
<p class="meta">Generated ${escapeHtml(summary.generatedAt)} · ${escapeHtml(summary.totals.profiles)} profile(s)</p>
<div class="totals">
  <div><strong>${escapeHtml(summary.totals.ok)}</strong> captured</div>
  <div><strong>${escapeHtml(summary.totals.failed)}</strong> failed</div>
  <div><strong>${escapeHtml(summary.totals.overflow)}</strong> horizontally overflowing</div>
  <div><strong>${escapeHtml(summary.totals.panels)}</strong> with a panel</div>
  <div><strong>${escapeHtml(summary.totals.under44)}</strong> with controls under 44px</div>
  <div><strong>${escapeHtml(summary.totals.changed)}</strong> changed vs baseline</div>
</div>
<table>
  <thead><tr><th>Screenshot</th><th>Profile</th><th>Viewport</th><th>scrollWidth / body.clientWidth</th><th>Overflow</th><th>Panel</th><th>Touch targets</th><th>Baseline</th><th>Duration</th><th>Status</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</body>
</html>
`
}

/**
 * @param {{ outDir: string, surface: string, results: object[], generatedAt?: string }} options
 */
export function writeReport({ outDir, surface, results, generatedAt = new Date().toISOString() }) {
  mkdirSync(outDir, { recursive: true })
  const summary = buildSummary({ surface, results, generatedAt })
  const htmlPath = join(outDir, 'report.html')
  const jsonPath = join(outDir, 'summary.json')
  writeFileSync(htmlPath, renderReportHtml(summary), 'utf8')
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  return { summary, htmlPath, jsonPath }
}
