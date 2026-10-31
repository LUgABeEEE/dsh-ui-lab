# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-31

### Added

- `dsh-ui-lab doctor`: one read-only command that answers "why did my first
  capture fail" — Node.js version, Playwright resolution, the exact Chromium
  binary and whether it exists, the device table, the pairing-cache directory,
  and whether the DSH web URL answers (401 counts as reachable, it is the
  launch-token gate). `--json` for scripts; exit 1 only for hard requirements.
- Two tests pin the command contract and the check list.

## [Unreleased]

## [0.2.1] - 2026-11-01

### CI

- Releases no longer carry a long-lived npm token: the package is bound to this
  repository through npm **trusted publishing**, so `publish.yml` exchanges a
  GitHub OIDC identity for a short-lived credential (`npx npm@12 publish
  --provenance`). The `NPM_TOKEN` secret can be removed.
- `scripts/check-package.mjs` installs the packed tarball and runs the CLI from
  it, in CI and in `prepublishOnly`.

### CI

- `scripts/check-package.mjs`: pack the package, install the tarball into a
  throwaway prefix and run the CLI from it (`--version`, `list`), plus a check
  that the `files` allowlist still ships every module. Runs in CI (node 22) and
  in `prepublishOnly`, so a broken allowlist cannot reach the registry.

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
- Windows support: CI runs lint plus `node --test` on `ubuntu-latest` and
  `windows-latest` (Node.js 20 and 22), and the docs describe the Windows
  requirements — Playwright resolution through `$DSH_HOME\profiles\web` /
  `desktop`, Chromium installation, native path syntax and the ACL-based
  `DSH_UI_LAB_WEB_TOKEN_FILE` semantics.

### Fixed

- The test suite now passes on Windows. Path assertions are built with
  `node:path` instead of hard-coded POSIX roots, and the two `mode 600`
  token-file tests skip on Windows, where permissions are ACL-based and
  `src/token.mjs` already skips the mode check. The POSIX assertions still run on
  Linux CI, so the POSIX behaviour stays covered.

## [0.1.0] - 2026-10-30

First packaged snapshot, published to the npm registry as `dsh-ui-lab@0.1.0`.

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
