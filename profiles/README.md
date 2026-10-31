# Device profiles

`profiles.json` is the single source of truth for the device ratios the CLI can
open. It is data, not code, so adding a device never touches the capture path.

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "phone-390x844",
      "label": "iPhone 13 / 14 / 15",
      "category": "phone",
      "viewport": { "width": 390, "height": 844 },
      "deviceScaleFactor": 3,
      "isMobile": true,
      "hasTouch": true,
      "platform": "ios",
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ...",
      "notes": "Optional, free-form."
    }
  ]
}
```

The bundled set has **six phones** and **four tablets**. The `foldable` category
is reserved and has **zero entries** — see [Foldables](#foldables-later-milestone).

## Fields

- `id` — stable kebab-case identifier used by `--profile`; never reuse one.
- `label` — human-readable device name; used by `resolve()` for fuzzy lookups.
- `category` — `phone`, `tablet` or `foldable`.
- `viewport` — the device's CSS viewport (`visualViewport.width` / `height`).
  Do not use `window.innerWidth` as the profile width: under mobile emulation an
  overflowing page enlarges the layout viewport, and the CLI reports that
  separately as `metrics.layoutViewport`.
- `deviceScaleFactor` — physical pixels per CSS pixel (2.625 for the Pixel 7).
- `isMobile` / `hasTouch` — forwarded to the Playwright browser context.
- `platform` — `ios`, `android`, …; used by `resolve()` and reports.
- `userAgent` — must match the device platform, not a desktop browser.
- `notes` — optional, free-form context; not searched by `resolve()`.

## Reader API

`src/profiles.mjs` validates the whole database on load and exposes:

```js
import { list, get, resolve } from './src/profiles.mjs'

list()                          // all profiles, in file order
list({ category: 'tablet' })    // 4 tablets; unknown category throws RangeError
get('phone-390x844')            // exact id, case-insensitive fallback, else undefined

resolve('phone-390x844')        // { status: 'hit', match: <profile>, matches: [<profile>] }
resolve('nokia 3310')           // { status: 'miss', match: null, matches: [] }
resolve('iphone')               // { status: 'ambiguous', match: null, matches: [ ... ] }
```

`resolve()` searches id, label, platform and category, in that order of
precision: exact id → exact label → unique substring. The ambiguous result lists
every candidate (for `iphone`: `phone-375x667`, `phone-390x844`,
`phone-393x852`, `phone-430x932`) so the CLI can show a choice instead of
silently picking one. `loadProfiles(filePath)` and `validateProfile(profile)` are
exported for fixtures and tooling.

## Device set

| id | viewport | DPR |
| --- | --- | --- |
| `phone-360x800` | 360×800 | 3 |
| `phone-375x667` | 375×667 | 2 |
| `phone-390x844` | 390×844 | 3 |
| `phone-393x852` | 393×852 | 3 |
| `phone-412x915` | 412×915 | 2.625 |
| `phone-430x932` | 430×932 | 3 |
| `tablet-768x1024` | 768×1024 | 2 |
| `tablet-800x1280` | 800×1280 | 2 |
| `tablet-820x1180` | 820×1180 | 2 |
| `tablet-834x1194` | 834×1194 | 2 |

## Foldables: later milestone

Foldables are deliberately **not** in the first milestone. There is no
`foldables.json` and no guessed data: a foldable has two or more real viewport
states (folded / unfolded, inner / outer screen), and the capture path and
reports cannot represent that yet. The `foldable` category exists so the schema
and the CLI are ready when the milestone starts; until then it must stay empty.
That milestone also needs sourced CSS viewports per state and a report that
compares states instead of treating them as two unrelated devices.

## Adding a profile

- **CSS pixels, not physical pixels.** Put the device's CSS width/height (the
  visual viewport) into `viewport`; the panel resolution is `deviceScaleFactor`.
  `window.innerWidth` can grow when the page overflows, so it is not the profile
  width — the CLI records it separately as `metrics.layoutViewport`.
- **Cite the source.** Link the specification or the browser-devtools preset the
  numbers came from. Guessed dimensions are rejected.
- **The user agent must match the platform** (mobile Safari for iOS, Chrome for
  Android). Do not reuse a desktop UA.
- **Never rename an existing id.** Reports and screenshot filenames use it.

Do not use Playwright's bundled device descriptors as the only source: they
drift between releases. The unit tests pin this file's dimensions and check that
widths stay in a sane range per category.

Run `npm test` after editing. Then see
[CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-device-profile) for the review
expectations.
