# Troubleshooting

Start with the command's own output: capture failures name the surface, profile
and URL, and scrubbed credentials are never echoed. Exit codes are:

| Code | Meaning |
| --- | --- |
| `0` | Success (a matrix with zero failed profiles) |
| `1` | Runtime or capture failure (navigation, pairing, auth, browser, matrix with failures) |
| `2` | Usage error (unknown command/flag, bad value, missing/ambiguous profile) |

## `DSH web … requires authentication`

A fresh browser has no DSH web cookie, so `http://127.0.0.1:3080/` answers
`401 dsh web authentication required`. Supply the launch token from the URL
`dsh web` printed at startup:

- pass the URL with its `token` query parameter as `--url`;
- or export `DSH_UI_LAB_WEB_TOKEN`;
- or put the token alone in a file, `chmod 600` it, and point
  `DSH_UI_LAB_WEB_TOKEN_FILE` at it.

### Where the token comes from

`dsh web` generates a new random token for **each process** and prints one
startup line of the shape:

```text
dsh web: http://<host>:<port>/?token=<per-process-token>
```

It is not a stable file. A `.web-token` file written by a launcher wrapper can
be stale after a restart; do not assume it is current.

If the startup output was redirected to a log, take the **last** `dsh web:` line
from that log. Keep the log mode `600` while it contains the token, and delete
or rotate it after use — never commit it or paste the line into an issue.
Otherwise restart `dsh web` to get a fresh line, or pass the token through
`--url`, `DSH_UI_LAB_WEB_TOKEN` or a mode-`600` token file.

Do not forge a browser cookie by reading DSH's credential store; use the token
DSH actually issued. If the token is lost and you cannot restart DSH web, use
the gateway's `?frontend=stock` entry point with an existing device session (see
[`surfaces.md`](surfaces.md#stock-frontend-through-the-gateway)).

A token file with any mode other than `600` is refused with exit code 1 before
capture. If the error says the file cannot be read, check the path and owner;
the token itself is never printed.

## The `mobile` shell never appears

Symptom: the run exits 1 with "the dedicated dsh-mobile shell did not mount",
or `metrics.shell` is `false` in an old result.

1. Desktop UI → **Mobile access → LAN** must be enabled and the gateway running.
2. Confirm the admin status endpoint is reachable at the expected address
   (`http://127.0.0.1:3080` by default). If DSH uses another port or host, set
   `DSH_UI_LAB_URL` / `DSH_UI_LAB_ADMIN_URL`, or pass `--admin-url`.
3. Try `--fresh`: the cached device may have been revoked or its module
   selection may be stale.
4. If discovery fails, the tool falls back to `https://<lan-ip>:3443`; pass
   `--url <gateway-origin>` if that address is wrong.
5. Read the printed console errors. TLS and certificate failures are described
   below.

## Stuck on the pairing page

The page keeps returning to `/mobile-access/pair`.

- The cached cookies expired or the device was revoked. Run with `--fresh` to
  pair a new `dsh-ui-lab` device.
- The status API points at a different gateway than the URL you are opening
  (for example loopback vs LAN). Pass `--url` and/or `--admin-url` explicitly.
- The pairing window POST failed. The error includes the next action: enable
  **Mobile access → LAN** and retry; a revoked device needs a fresh pairing.
- If the pairing form itself errors, open the URL in a normal browser once to
  see DSH's own message; the CLI fills the same fields.

Old devices accumulate in **Mobile access → Devices**. Revoke stale
`dsh-ui-lab` entries there; the cached state lives in `.cache/mobile-state.json`
(mode `600`, git-ignored).

## Horizontal overflow

`metrics.overflowX` is `true` when
`documentElement.scrollWidth > documentElement.clientWidth`. The other numbers
explain where the width goes:

| Field | Meaning |
| --- | --- |
| `viewport` | Emulated CSS viewport, e.g. `390×844` |
| `layoutViewport` | `window.innerWidth/innerHeight`; under mobile emulation an overflowing page enlarges this, so it is not the device width |
| `visualViewport` | Visual viewport (width, height, scale) |
| `documentElement.scrollWidth` | Laid-out document width |
| `documentElement.clientWidth` | Viewport width used for the overflow comparison |
| `body.clientWidth` | Body width; can exceed the viewport when the shell has a min-width |

Overflow is **build/entry dependent**. Two measured examples:

- the repository fixture (`test/fixtures/desktop.html`, 960px min-width) at
  `phone-390x844` reports `viewport 390×844`, `scrollWidth 961`,
  `body.clientWidth 960`, `layoutViewport` ≈ `961×2078`, `overflowX true`;
- a real stock DSH web instance at the same width reported `scrollWidth 390`,
  `body.clientWidth 390`, `layoutViewport 390`, `overflowX false`.

Neither result is wrong. Do not assume the stock UI clips, and do not "fix" the
page from this tool; compare runs before and after a UI change.

If `overflowX` differs from what you expected, check which surface and URL was
opened (`--surface web` vs `mobile`), which build/entry served the page, and
that it had settled (`--wait`).

## TLS and certificate errors

The dsh-mobile gateway uses a self-signed certificate. The browser context sets
`ignoreHTTPSErrors` on purpose, because this is a local debugging tool. A
successful capture therefore says nothing about your production TLS setup.

If navigation still fails, check that the gateway is running, that the origin
matches the status API, and that a normal browser can open it. Do not disable
certificate validation anywhere outside this harness.

## Playwright or Chromium is missing

Symptoms: `Playwright is not installed where this CLI can find it` or
`cannot launch Chromium`.

For a **project install** (you are in the checkout or have a local
`node_modules`):

```bash
npm install -D playwright
npx playwright install chromium
```

For a **global install**, npm does not install the optional Playwright peer for
you. Pick one:

```bash
# 1. reuse the Playwright a DSH profile already ships (common on a DSH machine)
#    the resolver checks $DSH_HOME/profiles/web and .../desktop automatically

# 2. install Playwright globally next to the CLI
npm install -g playwright
npx playwright install chromium
# normally the sibling global package is found automatically; if not:
export DSH_UI_LAB_PLAYWRIGHT="$(npm root -g)/playwright"

# 3. run from a project instead
npx dsh-ui-lab list    # npm resolves the local playwright
```

The resolver tries, in order: `--playwright`, `DSH_UI_LAB_PLAYWRIGHT`, the
package's own dependency, then `$DSH_HOME/profiles/web` and
`$DSH_HOME/profiles/desktop`. Set `PLAYWRIGHT_BROWSERS_PATH` if the browser
download lives somewhere else.

On Windows, `npx playwright install chromium` is enough (the Windows build
carries its own runtime; there is no `--with-deps` step), and the same resolver
order applies with `$DSH_HOME\profiles\web` / `desktop` as the usual anchors.

Do not install a browser into a directory the CLI cannot see and then wonder why
`list` works but `shot` does not: `list` never needs Playwright, capture always
does.

Browser-level tests skip when Chromium is unavailable, so `npm test` can stay
green on a browser-free CI. Install Chromium locally to actually run the fixture
captures.

## Matrix completed but exited 1

One or more profiles failed. `summary.json` and `report.html` are still written;
failed rows carry the scrubbed error. Read the stderr progress lines, fix the
first failing profile, and rerun. `--json` prints the summary plus absolute
paths to both files.

## dsh-mobile 0.8.0 has not been tested

The tool was validated against the installed dsh-mobile **0.7.1** gateway.
dsh-mobile 0.8.0 is released but was not exercised here; selector or runtime
changes in 0.8.0 may need a follow-up. Treat a 0.8.0 failure as untested ground,
not a known-good path.

## Nothing in this page helps

Open an issue with: the exact command, profile id, surface, DSH/dsh-mobile
version, the console errors printed by the tool, and (if safe) the screenshot
from `.shots/`. Redact cookies, tokens and session titles first. Security issues
go through [`SECURITY.md`](../SECURITY.md), not a public issue.
