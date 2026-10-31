# dsh-ui-lab

**A UI validation tool built for DSH.** Lay the same DeepSeek Harness surface
across a wall of real device proportions and see exactly where it starts to
break — on Linux or Windows, without picking up a phone.

A DSH interface has to survive a 360 px Android phone, a 430 px iPhone, a
768 px tablet and everything between. Checking each one by hand is slow and
unrepeatable. `dsh-ui-lab` puts a real CSS viewport, device pixel ratio, touch
flag and user agent behind each proportion, loads the actual DSH surface, then
writes a screenshot plus layout measurements — and a matrix report across many
proportions at once, so a UI change can be diffed instead of eyeballed.

It is an instrument, not a production test runner: point it at a DSH instance
running on this machine or your own LAN.

> Early development. The CLI and JSON shape are usable; expect small changes
> before a 1.0.

## Proportions

The point of the tool. Ten proportions ship today, each with its own viewport,
DPR, touch flag and user agent:

| Category | Profiles |
| --- | --- |
| Phone (6) | `360×800` Android · `375×667` iPhone SE · `390×844` iPhone 13/14/15 · `393×852` iPhone 15 Pro · `412×915` Pixel 7 · `430×932` iPhone 15 Pro Max |
| Tablet (4) | `768×1024` iPad mini · `800×1280` Galaxy Tab · `820×1180` iPad Air 11 · `834×1194` iPad Pro 11 |
| Foldable | **Not shipped yet** — the category is reserved, no sizes are invented |

Add your own by editing [`profiles/profiles.json`](profiles/profiles.json); the
schema, UA provenance and reader API are in [`docs/profiles.md`](docs/profiles.md).
Foldables are the next milestone: an unfolded inner screen is a different
problem from a tablet (posture, hinge, split view), so it gets its own treatment
rather than a guessed viewport.


## Panels, not just the welcome screen

Most of the interesting UI lives behind a sidebar entry — a plugin's own panel.
`--open` clicks that row first, then measures and captures what it opened:

```bash
dsh-ui-lab shot   --surface mobile --profile phone-390x844 --open Todos
dsh-ui-lab matrix --surface mobile --class tablet --open Todos --out .shots/todos
```

The capture then also reports the panel box (`width`, `left`…`right`, whether the
return bar rendered) and the touch targets inside it (how many, the smallest one,
how many are under 44 px). Those columns land in `report.html` and `summary.json`,
so a matrix answers "which proportions does this panel break at" directly.

A collapsed drawer hides its rows; the tool opens it the way a person would and,
if the label still does not match, prints the labels that *do* exist instead of
failing silently.

## Two surfaces

DSH exposes two different things to a phone-sized screen. `dsh-ui-lab` can open
either one:

| | `dsh-mobile` | stock DSH web |
| --- | --- | --- |
| What it is | The dedicated mobile page served by the dsh-mobile gateway | The stock DSH web UI at a phone/tablet viewport |
| Auth | One-time device pairing, cached under `.cache/` | DSH web launch token |
| What it exercises | The real mobile boot graph, `.dshm-shell`, `mobile-layout.js`, the extension runtime | The desktop shell squeezed into a narrow viewport: reflow, overflow, tap targets, drawers |
| Finding it highlights | Whether the dedicated page mounted | Horizontal overflow — **build/entry dependent** (960px fixture: 961/960 at 390; one real stock instance: 390/390) |
| Command | `--surface mobile` | `--surface web` (default) |

Overflow is **build/entry dependent**, not a universal property of DSH. The
local 960px fixture reports `scrollWidth 961` / `body.clientWidth 960` at a
390 viewport; a real stock DSH web instance (same `--profile web`, alternate
port) measured 390/390 with `overflowX: false` at the same width. The tool
reports whichever is true — judge by the numbers, not by an assumption. See
[`docs/surfaces.md`](docs/surfaces.md) for the mechanics.

## Requirements

- **Linux or Windows** (macOS should work, but is not covered by CI).
- Node.js >= 20.
- Playwright and its Chromium (`npx playwright install chromium`; on a bare
  Debian/Ubuntu box `npx playwright install --with-deps chromium` also installs
  the shared libraries Chromium needs).
- A DSH instance:
  - stock web: the DSH web UI, by default `http://127.0.0.1:3080`. DSH protects
    it with a per-process launch token; see [Authentication](#authentication).
  - dsh-mobile: **Mobile access → LAN** enabled in the desktop UI. The gateway
    origin is discovered from the admin status API.

### Windows

Nothing Linux-specific is required: Playwright's Windows Chromium build carries
its own runtime, so plain `npx playwright install chromium` is enough.

- Playwright is resolved in the same order as on Linux:
  `--playwright` / `DSH_UI_LAB_PLAYWRIGHT` → the package's own `node_modules` →
  `$DSH_HOME\profiles\web` → `$DSH_HOME\profiles\desktop`. A DSH desktop install
  usually already ships it, so no separate global install is needed.
- `DSH_UI_LAB_WEB_TOKEN_FILE`: the `mode 600` check is POSIX-only and is skipped
  on Windows, where file permissions come from ACLs instead. Keep the token file
  under your user profile (for example `%USERPROFILE%\.dsh\web-token`) and treat
  it as a secret; there is no `chmod` to run.
- Paths use native Windows syntax. In PowerShell, quote paths that contain
  spaces: `--out "$env:USERPROFILE\dsh-shots"`. Relative paths are resolved from
  the current directory on every platform.
- `npm test` and `npm run lint` run unchanged. The browser-level fixture tests
  skip when Chromium is not installed.

## Install

> Published on the npm registry as [`dsh-ui-lab`](https://www.npmjs.com/package/dsh-ui-lab).

```bash
npm install -g dsh-ui-lab
npx playwright install chromium
```

A global install does **not** pull in the optional Playwright peer. Either let
the CLI reuse the Playwright under `$DSH_HOME/profiles/web` (usual on a DSH
machine), or install it globally next to the CLI:

```bash
npm install -g playwright
npx playwright install chromium
# normally the global CLI resolves the sibling package; if not:
export DSH_UI_LAB_PLAYWRIGHT="$(npm root -g)/playwright"
```

See [Troubleshooting](docs/troubleshooting.md#playwright-or-chromium-is-missing)
for both global recipes.

Without a global install:

```bash
npx dsh-ui-lab list
npx playwright install chromium   # once
```

From a checkout:

```bash
npm ci
npx playwright install chromium
npm link          # puts `dsh-ui-lab` on PATH
```

Playwright is an optional peer dependency. `list`, `--help` and the unit tests
work without it; capture commands do not.

## Quick start

```bash
# 1. See the device profiles
dsh-ui-lab list
dsh-ui-lab list --class phone --json

# 2. Capture one profile (stock web is the default surface)
dsh-ui-lab shot --surface web --profile phone-390x844 --out .shots --json

# 3. Capture the dedicated mobile page (pairs once, then reuses the device)
dsh-ui-lab shot --surface mobile --profile phone-390x844 --out .shots/mobile

# 4. Run a matrix and open the report
dsh-ui-lab matrix --surface web --class phone --out .shots/web-phone
# → .shots/web-phone/report.html + summary.json
```

`--profile` accepts a fuzzy name: `--profile iphone` reports the ambiguity and
lists the candidates; `--profile "iphone se"` resolves to `phone-375x667`.

The stock-web examples assume the DSH web token is available (see
[Authentication](#authentication)); use `--surface mobile` for the paired page,
or the local fixture below to try the tool with no DSH at all.

A matrix can also be narrowed by ids or categories:

```bash
dsh-ui-lab matrix --surface mobile \
  --profiles phone-390x844,tablet-768x1024 \
  --out .shots/mobile-matrix --fresh
```

To measure without writing a screenshot:

```bash
dsh-ui-lab measure --surface web --profile phone-390x844 --json
```

Options worth knowing:

| Option | Effect |
| --- | --- |
| `--fresh` | Discard the cached mobile pairing and pair again |
| `--wait <ms>` | Extra settle time after load (default 2000) |
| `--inject <path>` | Inject a CSS file or a dsh-mobile pack directory before capturing |
| `--open <label>` | Click the sidebar row whose label matches (e.g. a plugin entry) and capture that panel instead of the welcome screen |
| `--admin-url <url>` | Mobile pairing admin base when DSH is not on the default loopback port |
| `--playwright <module>` | Use a specific Playwright install |

### Try it without DSH

The repository ships a local fixture that reproduces the desktop shell, so the
web surface can be exercised end to end with no server and no credentials:

```bash
dsh-ui-lab shot --surface web --profile phone-390x844 \
  --url "file://$PWD/test/fixtures/desktop.html" --out .shots/fixture --json
```

It reports `overflowX: true` at phone and tablet widths. The same fixture is
served over `node:http` by the browser tests (`npm test`).

## Baselines: did this proportion change?

A matrix answers "what does it look like now". A baseline answers "did it move".
Save one run, then compare later runs against it — the comparison counts pixels
that changed beyond a small tolerance, so a single antialiased edge does not make
every run red:

```bash
# 1. Save the reference (do this once, from a run you trust)
dsh-ui-lab matrix --surface mobile --class phone --open Todos \
  --out .shots/run --save-baseline .baselines/todos

# 2. Later: compare, and let the exit code decide
dsh-ui-lab matrix --surface mobile --class phone --open Todos \
  --out .shots/run --baseline .baselines/todos
# exit 0 = identical within the threshold, exit 1 = something changed
```

| Option | Effect |
| --- | --- |
| `--baseline <dir>` | Compare each screenshot with `<dir>/<surface>__<profile>.png`; exit 1 when one changed or has no reference |
| `--save-baseline <dir>` | Copy this run's screenshots into `<dir>` and write `baseline.json` (also works for a single `shot`) |
| `--diff-threshold <pct>` | Share of pixels that counts as a change; default **1%** |

The default threshold is not zero on purpose: a live DSH page has deliberate
motion — relative timestamps ("1 h ago"), a blinking caret, a spinner. On a
390×844@3x shot that is a few thousand pixels (≈0.1–0.6%). Raise the threshold for
pages with a clock, lower it (`--diff-threshold 0.1`) to catch small shifts.

### In CI

```yaml
- run: npx dsh-ui-lab matrix --surface mobile --class phone --open Todos --out .shots --baseline .baselines/todos
```

A non-zero exit fails the job. Re-save the baseline (`--save-baseline`) only after
looking at the diff — that is the whole gate.

## Authentication

A fresh browser has no DSH web cookie: `http://127.0.0.1:3080/` answers `401 dsh
web authentication required`. `dsh web` prints a root URL carrying a one-time,
per-process launch token. Give that token to the tool in one of three ways
(highest precedence first):

1. put the URL with its token in `--url`;
2. export `DSH_UI_LAB_WEB_TOKEN`;
3. put the token alone in a file with mode `600` (POSIX; on Windows the mode
   check is skipped and ACLs apply) and set `DSH_UI_LAB_WEB_TOKEN_FILE` to its
   path.

The tool exchanges the token for the signed cookie and continues on the clean
URL. Tokens, CSRF cookies and storage state never appear in output, reports or
screenshot names. The dsh-mobile surface does not use this token; it pairs a
device instead.

## Screenshots

The examples below are produced from the repository fixture
(`test/fixtures/desktop.html`) so no operator session data is published. Both
use `--surface web`; the desktop shell is wider than the viewport, so the main
column is clipped — that is the overflow being surfaced.

| `phone-390x844` · 390×844 @3× | `tablet-768x1024` · 768×1024 @2× |
| --- | --- |
| <img src="docs/assets/web-fixture-390x844.png" width="320" alt="Desktop shell clipped at phone width"> | <img src="docs/assets/web-fixture-768x1024.png" width="320" alt="Desktop shell clipped at tablet width"> |

Real `dsh-mobile` captures contain session titles and account images, so they
are generated locally into `.shots/` (git-ignored) rather than committed. See
[`docs/assets/README.md`](docs/assets/README.md) for the regeneration commands.

## Output and metrics

For each capture:

- `<out>/<surface>__<profile>.png` — screenshot at the profile's viewport and
  device scale factor (`measure` skips the PNG);
- stdout — human summary, or JSON with `--json`.

The JSON result contains:

```text
profile      { id, label, category }
surface      "web" | "mobile"
url          sanitized URL (query credentials removed)
metrics      viewport, layoutViewport, visualViewport, devicePixelRatio, title,
             documentElement { clientWidth, scrollWidth, clientHeight, scrollHeight },
             body { clientWidth, scrollWidth },
             overflowX, shell, dedicatedMobileFrontend
screenshot   absolute path or null
injection    injected CSS/pack metadata or null
consoleErrors  scrubbed console/page errors
durationMs   wall-clock capture time
```

`metrics.viewport` is the emulated CSS viewport (390×844), while
`layoutViewport` is what `window.innerWidth` reports; under mobile emulation an
overflowing page enlarges the latter, so use `viewport`/`visualViewport` as the
device width.

A matrix additionally writes:

- `<out>/report.html` — self-contained, inline CSS, thumbnails referenced by
  local file name (no external resources);
- `<out>/summary.json` — one row per profile: id, label, viewport, DPR,
  `scrollWidth`, `body.clientWidth`, `overflowX`, `shell`, duration, status,
  screenshot name and a scrubbed error.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (matrix: zero failed profiles) |
| `1` | Runtime or capture failure (navigation, pairing, auth, browser, failed matrix rows) |
| `2` | Usage error (unknown command/flag, bad value, missing or ambiguous profile) |

A matrix keeps going after a failed profile, reports every failure, writes the
report, and exits `1` if any row failed.

## Limitations

These are properties of the environment, not bugs to file:

- **Safe areas are zero.** `env(safe-area-inset-*)` resolves to `0px` in
  Chromium, so notches, rounded corners and home indicators cannot be validated.
- **No WebView.** Android System WebView and iOS WKWebView differ from Chromium
  in UA, CSS support, caching and viewport behaviour. A page that works here is
  not automatically proven inside an app.
- **No real-device feel.** Thumb reach, tap-target comfort, scroll inertia,
  pinch zoom, haptics and soft-keyboard interaction are out of scope; the
  `visualViewport` does not shrink like a device keyboard.
- **dsh-mobile 0.8.0 is untested.** The tool was validated against the installed
  dsh-mobile **0.7.1**; 0.8.0 is released but not exercised here.
- **TLS is not under test.** The dsh-mobile gateway uses a self-signed
  certificate and the harness ignores certificate errors on purpose.
- **Foldables are not done.** `category: "foldable"` is reserved, with zero
  entries and no invented dimensions; see
  [`docs/profiles.md`](docs/profiles.md#foldables-not-done).
- **One page, one viewport.** Device synchronisation, rotation mid-flight and
  multi-window states are not emulated.
- **Stock DSH web needs its launch token.** A bare `:3080` returns 401 by
  design; supply the token as above.

## Documentation

- [Surfaces](docs/surfaces.md) — gateway discovery, pairing, tokens, overflow.
- [Profiles](docs/profiles.md) — the device table, reader API, adding one.
- [Troubleshooting](docs/troubleshooting.md) — auth, pairing, overflow, TLS,
  Playwright.
- [Contributing](CONTRIBUTING.md) — setup, tests, commit style, secrets.
- [Changelog](CHANGELOG.md).

## License

MIT © 2026 LUgABeEEE. See [LICENSE](LICENSE).
