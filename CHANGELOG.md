# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `--open <label>`: click a sidebar row (usually a plugin entry) before capturing,
  so a matrix measures the panel itself instead of the welcome screen. A collapsed
  drawer is opened first; an unmatched label lists the labels that do exist.
- Baselines: `--save-baseline <dir>` writes the current screenshots plus
  `baseline.json`; `--baseline <dir>` compares later runs pixel by pixel (canvas
  diff inside the browser we already run, default 1% tolerance) and exits 1 on a
  real change. `--diff-threshold <pct>` tunes the tolerance. Works for `matrix`
  and for a single `shot`.
- Panel and touch-target metrics: `metrics.panel` (width / left / right /
  `panelNav`) and `metrics.touchTargets` (count / smallest / how many under 44 px),
  carried into `summary.json` and two new `report.html` columns.

## [0.1.0] - 2026-10-30

First packaged snapshot. The repository is private and the package is not
published to the npm registry yet; until it is, install from a checkout or from
an `npm pack` tarball.

### Added — P0 capability set

- Installable `dsh-ui-lab` CLI (`bin` → `src/cli.mjs`) with four commands:
  `list`, `shot`, `measure`, `matrix`, plus `--help` and `--version`.
- Both DSH surfaces: the dedicated **dsh-mobile** page (gateway discovery,
  one-time device pairing, cached storage state) and the **stock DSH web** UI at
  a phone/tablet viewport.
- Ten device profiles (six phones, four tablets) with CSS viewport, DPR, touch
  flags, platform and user agent, validated on load; `foldable` is reserved with
  zero entries and no invented data.
- Profile reader API `list({ category })`, `get(id)` and `resolve(name)` with
  three-state resolution: hit, ambiguous with every candidate, miss.
- Capture pipeline: per-profile Playwright context, optional CSS/pack injection,
  screenshot, and metrics for viewport, layout viewport, visual viewport,
  `documentElement`/`body` widths, horizontal overflow, `.dshm-shell`,
  `window.__DSH_MOBILE_FRONTEND__`, console errors and duration.
- Matrix mode: one row per profile with thumbnail, viewport, overflow and
  duration; self-contained `report.html` (inline CSS, local thumbnails) plus
  `summary.json`; continues after failures and exits `1` if any row failed.
- DSH web launch-token support from `--url` (`token` query), `DSH_UI_LAB_WEB_TOKEN`
  or `DSH_UI_LAB_WEB_TOKEN_FILE` (regular file, mode `600` enforced).
- Local web fixture (`test/fixtures/desktop.html`, a three-column desktop shell)
  and browser tests that serve it over `node:http` and cover HTTP-root,
  `file://`, all three token sources, a wrong-mode token file and a matrix run —
  no DSH instance required. They skip when Chromium is unavailable.
- Centralized defaults in `src/defaults.mjs`; every value overridable by a
  `DSH_UI_LAB_*` environment variable or a CLI flag (`--url`, `--admin-url`,
  `--out`, `--playwright`, `--wait`, `--inject`, `--fresh`, `--json`).
- Exit-code contract: `0` success, `1` runtime/assertion failure, `2` usage
  error.
- Continuous integration on Node.js 20 and 22: `npm ci`, full-tree
  `node --check`, `node --test`, without downloading a browser; the browser
  fixture tests are a separate manually triggered job.
- Bilingual README plus `docs/surfaces.md`, `docs/profiles.md`,
  `docs/troubleshooting.md`, `CONTRIBUTING.md`, `SECURITY.md` and sample
  fixture screenshots under `docs/assets/`.

### Changed

- The scaffold's placeholder CLI has been replaced by the real commands.
- `metrics.viewport` reports the emulated CSS/visual viewport; the enlarged
  mobile layout viewport is available separately as `layoutViewport`, so
  overflow is reported honestly rather than confused with the device width.

### Security

- Tokens, CSRF values and storage state are scrubbed from errors, warnings,
  console output, reports and filenames.
- Mobile pairing state is written to `.cache/` with mode `0600`; web token files
  must be mode `600` and are never echoed.
