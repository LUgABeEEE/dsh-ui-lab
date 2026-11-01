# Real devices

The lab opens a page in a Playwright Chromium at a device **profile**: a
viewport, a DPR and a `pointer` mode. That is enough to reproduce layout and
geometry, and it is the reason a baseline is comparable across machines. It is
not a phone.

This page records a measured real-device round against dsh-mobile, so the gap
between "the lab says so" and "a phone says so" is written down instead of
assumed.

> Scope: one device, one session, 2026-11-01 — Redmi 2604FRK1EC (K90 Max),
> Android 17 (SDK 37), 1280×2772 @520dpi (DPR **3.25**, CSS 394×853), official
> dsh-mobile Android App **0.7.1**, WebView **Chrome/135.0.7049.79**
> (MiuiBrowser 20.8.390923), gateway dsh-mobile **0.8.0**.
> The lab run in the same session used Playwright **1.64 / Chromium 156**
> (`npx playwright --version`; `node -e "console.log(require('playwright/package.json').version)"`).
> Full method and screenshots are in the adaptation repository, PR
> [LUgABeEEE/dsh-adapt-packs#11](https://github.com/LUgABeEEE/dsh-adapt-packs/pull/11)
> (`docs/真机验证.md`, Chinese). Once that PR merges, the stable link is
> `https://github.com/LUgABeEEE/dsh-adapt-packs/blob/main/docs/真机验证.md`.

## What the lab can and cannot prove

| Question | Lab (profile) | Real device |
| --- | --- | --- |
| Is the layout the same at a given CSS viewport/DPR? | **Yes**, reproducibly, and baseline-gated | Yes, but the numbers are device-specific |
| Does the tap target have the intended CSS size? | **Yes** (`getBoundingClientRect`, media queries, `pointer: coarse`) | Yes — and edge probing can tell whether an invisible `::after` extension exists |
| Is `env(safe-area-inset-*)` non-zero? | **No** — Chromium resolves it to `0px` | Depends on the host: a browser consumed the insets in chrome; a non-edge-to-edge App also reported `0` for a different reason |
| Does the soft keyboard change the viewport? | **No** — `visualViewport` does not shrink for a device keyboard | Yes, and the mechanism differs (see below) |
| Is the WebView the same as the bundled Chromium? | **No** — Chromium 156 here, Chrome 135 WebView there | It is whatever the host ships |
| Thumb reach, scroll inertia, haptics? | **No** | Still not measurable by this lab; needs a person |

## Measured differences (same session, same content)

| Property | Lab profile `phone-390x844` | Real Android browser | Real Android App |
| --- | --- | --- | --- |
| DPR | 3.0 | **3.25** | **3.25** |
| CSS viewport | 390×844 | **394×733** | **394×786** |
| `env(safe-area-inset-*)` | 0 (Chromium limitation) | **0** (browser chrome takes the insets) | **0** (App WebView is inset by the system bars, not edge-to-edge) |
| Soft keyboard | not emulated | `innerHeight` 733 → 465 (**−268**) | 786 → 472 (**−314**) |
| Web engine | Chromium 156 | Chrome 135 WebView | Chrome 135 WebView |

Two consequences worth stating plainly:

- do not carry lab pixel numbers across to a phone as a pass/fail threshold —
  record the device, OS, WebView version, DPR and viewport with the numbers;
- the keyboard is a **layout** change on Android (`adjustResize` shrinks the
  layout viewport), not only a `visualViewport` shrink. A lab run that asserts
  keyboard behaviour would be proving the wrong model.

## How to take real-device numbers

### Android Chrome or a debuggable WebView

```bash
adb devices -l
adb forward tcp:9333 localabstract:chrome_devtools_remote   # or *_devtools_remote_<pid> of the app
curl http://127.0.0.1:9333/json                             # page targets
```

Engine versions were read from the device (`/json/version` reports `Browser`) and
from the lab (`npx playwright --version`); record both, because they are not the
same renderer.

Then `chromium.connectOverCDP('http://127.0.0.1:9333')` and run the same
measurement expression used in the lab (control counting, `getBoundingClientRect`,
`visualViewport`, `env()` probe). Screenshots come from the device, not from a
profile. This is the closest a script can get to "the lab, on a phone".

### An App WebView with debugging disabled

Release builds usually do not expose a devtools socket (`/proc/net/unix` has no
`webview_devtools_remote`). If the host supports a custom page script — as
dsh-mobile does through `$DSH_HOME/mobile-access/mobile.js` — inject a read-only
overlay that prints the same metrics, then read them from an `adb` screenshot.
The counting rules must match the lab/`check-pack`, otherwise the numbers are
not comparable.

### Pairing a phone whose Wi-Fi isolates clients

A phone can be on the same subnet and still be unable to reach the computer
(client isolation). In that case the round above used a **test rig**, not a
product path:

```text
phone 127.0.0.1:3443 --adb reverse--> computer 127.0.0.1:3443
  --TLS-terminating proxy (certificate signed by the gateway CA, SAN 127.0.0.1;
    Host/Origin rewritten to the gateway origin)--> gateway https://<lan-ip>:3443
```

Pairing used a self-refreshing QR page because the gateway's pairing window is
short-lived (~2 min by default). On a normal LAN, scan the gateway's own QR and
skip all of it.

## Reporting rules

- Put the device line in the artifact: model, OS/WebView version, DPR, viewport,
  app version; a number without that line is not reusable.
- Keep a separate baseline per surface (`stock web` emulation, real browser,
  App WebView) — the lab's `--baseline` compares pixels, and these surfaces are
  not the same renderer.
- Virtualized lists change their rendered item count with viewport height. Two
  runs that differ by one control are usually this, not a regression.
- The lab remains the reproducibility gate; real-device numbers are evidence,
  not a gate.

## What remains unverified

- iOS / WKWebView (no device in this round).
- Thumb-reach feel and pseudo-element "invisible" hit areas on a person.
- Edge-to-edge App versions, where `env(safe-area-inset-*)` would be non-zero.
- Other Android vendors and WebView versions.

If you have a device that produces a different number than the table above, add
it here with the same fields — that is the point of this page.
