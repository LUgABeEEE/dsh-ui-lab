# Surfaces

`dsh-ui-lab` can open two different things. The difference matters: they have
different authentication, different failure modes and different CSS.

| | `mobile` | `web` |
| --- | --- | --- |
| What it opens | The dedicated mobile page served by the dsh-mobile gateway | The stock DSH web UI at the profile viewport |
| Default address | Discovered from the admin status API, fallback `https://<lan-ip>:3443` | `http://127.0.0.1:3080` |
| Authentication | One-time device pairing, cached in `.cache/` | The DSH web launch token |
| What it exercises | Real mobile boot graph, `mobile-layout.js`, `.dshm-shell`, extension runtime | Desktop shell squeezed into a phone/tablet width; responsive rules, overflow, tap targets |
| Typical command | `dsh-ui-lab shot --surface mobile --profile phone-390x844` | `dsh-ui-lab shot --surface web --profile phone-390x844` |

## `dsh-mobile` surface

### Gateway discovery

The gateway origin is **not hard-coded**. The CLI asks the loopback admin API:

```text
GET http://127.0.0.1:3080/api/mobile-access/status
→ { "gateway": { "origin": "https://<gateway-host>:3443" }, ... }
```

Resolution order:

1. `--url <gateway-origin>` (for the `mobile` surface, `--url` means the gateway,
   not the admin API);
2. `DSH_UI_LAB_MOBILE_GATEWAY`;
3. `gateway.origin` from the status call;
4. last resort: `https://<lan-ip>:3443`, where `<lan-ip>` is the first
   non-internal IPv4 address of the machine.

The admin base is separate and defaults to `DSH_UI_LAB_URL`
(`http://127.0.0.1:3080`). Override it with `--admin-url` or
`DSH_UI_LAB_ADMIN_URL` when DSH is not on the default loopback port.

### Pairing

The first `mobile` run performs the same exchange a phone does:

1. `POST <admin>/api/mobile-access/pairing/open` opens a one-time window
   (the request carries the same-origin admin headers DSH expects);
2. the browser opens `<gateway>/mobile-access/pair`;
3. the CLI fills `#pair-token` and `#device-label` (default label:
   `dsh-ui-lab`) and submits the form;
4. it asks for a device-scoped module selection,
   `{ "excludedClientModules": [] }`, using the CSRF cookie DSH just issued;
5. it writes the browser storage state to
   `.cache/mobile-state.json` (mode `0600`) and reloads the gateway root.

Later runs load that state and skip pairing. `--fresh` discards it for the run
and pairs again; in a matrix run the re-pairing happens once and the remaining
profiles reuse the new state.

The only persistent change on the DSH side is one paired-device record (plus its
device-scoped settings). Revoke it from the desktop UI:
**Mobile access → Devices**.

### Stock frontend through the gateway

With an existing device session, the gateway can also serve the stock frontend
at `?frontend=stock`. That path is useful for manual checks but is not automated
by this tool; use the `web` surface for repeated capture.

## Stock DSH web surface

### Authentication

A fresh browser has no DSH web cookie, so `http://127.0.0.1:3080/` answers
`401 dsh web authentication required`. This is DSH's design: `dsh web` prints a
root URL carrying a one-time, per-process launch token; opening it mints a
signed cookie and redirects to the clean URL.

Supply that token in one of three ways (highest precedence first):

1. inside `--url` as the `token` query parameter;
2. `DSH_UI_LAB_WEB_TOKEN`;
3. `DSH_UI_LAB_WEB_TOKEN_FILE`, a regular file that **must be mode `600`**.
   Any other mode is rejected before capture.

The token is exchanged once per browser context; the run then continues on the
clean URL. The token is never printed, written to a report or used in a
screenshot filename.

No token is needed for a local fixture or a `file://` page, which is how the
test suite verifies the web surface without DSH.

### Overflow is build/entry dependent

Do not assume the stock UI overflows at a phone width. Two measurements from
this project:

| Entry | At a 390×844 viewport | `overflowX` |
| --- | --- | --- |
| `test/fixtures/desktop.html` (960px min-width shell) | `scrollWidth 961`, `body.clientWidth 960`, `layoutViewport 961×2078` | `true` |
| A real stock DSH web instance (same `--profile web`, alternate port) | `scrollWidth 390`, `body.clientWidth 390`, `layoutViewport 390` | `false` |

`dsh-ui-lab` reports whichever is true instead of hiding it:

- `metrics.overflowX` — `documentElement.scrollWidth > clientWidth`;
- `metrics.documentElement.scrollWidth` — the laid-out width;
- `metrics.body.clientWidth` — the body's width (can exceed the viewport);
- `metrics.viewport` — the emulated CSS viewport (e.g. 390×844);
- `metrics.layoutViewport` — what `window.innerWidth` reports. Under mobile
  emulation an overflowing page enlarges this, so it is **not** the device
  width; `visualViewport` is.

A responsive page reports `overflowX: false`; that is not forced either way.
See [`troubleshooting.md`](troubleshooting.md#horizontal-overflow) for how to
read the numbers.

## Defaults and overrides

Every default lives in `src/defaults.mjs`; flags win over environment variables,
which win over the defaults.

| Setting | Flag | Environment | Default |
| --- | --- | --- | --- |
| DSH web / admin base | `--url` (web) / `--admin-url` | `DSH_UI_LAB_URL`, `DSH_UI_LAB_ADMIN_URL` | `http://127.0.0.1:3080` |
| dsh-mobile gateway | `--url` (mobile) | `DSH_UI_LAB_MOBILE_GATEWAY` | status API, then LAN fallback |
| Web token | token in `--url` | `DSH_UI_LAB_WEB_TOKEN` | — |
| Web token file | — | `DSH_UI_LAB_WEB_TOKEN_FILE` | — (unset; mode `600`) |
| Pairing cache | — | `DSH_UI_LAB_STATE_DIR` | `./.cache` |
| Output | `--out` | `DSH_UI_LAB_SHOTS_DIR` | `./.shots` |
| Settle time | `--wait` | `DSH_UI_LAB_WAIT_MS` | `2000` ms |
| Timeout | — | `DSH_UI_LAB_TIMEOUT_MS` | `45000` ms |
| Device label | — | `DSH_UI_LAB_DEVICE_LABEL` | `dsh-ui-lab` |
| Playwright module | `--playwright` | `DSH_UI_LAB_PLAYWRIGHT` | package-local, then `$DSH_HOME/profiles/{web,desktop}` |

## Real devices

The two surfaces above are Chromium, at a profile viewport. A real phone differs
in DPR, viewport height, WebView build, safe-area resolution and soft-keyboard
behaviour. Measured deltas and the method for taking real-device numbers are in
[Real devices](real-devices.md); keep real-device baselines separate from lab
baselines.

## Credential discipline

- `.cache/mobile-state.json` is a bearer credential for the paired device. It
  is git-ignored and written with mode `0600`; never commit, paste or share it.
- Token files must be mode `600`. Pass them by path through
  `DSH_UI_LAB_WEB_TOKEN_FILE`; do not put token contents in shell history where
  you can avoid it.
- Reports, screenshots, stdout/stderr and filenames never contain tokens, CSRF
  cookies or storage state. Error messages are scrubbed before printing.
- `.shots/` is git-ignored as well: a real `mobile` screenshot can contain
  session titles and account images.
- Next to secrets: [`SECURITY.md`](../SECURITY.md).
