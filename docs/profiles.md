# Device profiles

Profiles are data, not code. They live in
[`profiles/profiles.json`](../profiles/profiles.json) and are validated every
time the CLI or the test suite loads them.

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
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) …",
      "notes": "Optional, free-form."
    }
  ]
}
```

## Fields

| Field | Rules |
| --- | --- |
| `id` | Stable kebab-case identifier used by `--profile`; must be unique and is never reused |
| `label` | Human-readable device name, also searched by `resolve()` |
| `category` | `phone`, `tablet` or `foldable` |
| `viewport` | CSS pixels: the size `window.visualViewport` reports on the device |
| `deviceScaleFactor` | Physical pixels per CSS pixel; fractional values are allowed (Pixel 7: `2.625`) |
| `isMobile` / `hasTouch` | Forwarded to the Playwright browser context |
| `platform` | `ios`, `android`, … |
| `userAgent` | Representative browser UA for that platform |
| `notes` | Optional, free-form; not searched by `resolve()` |

## The bundled set

| id | label | CSS viewport | DPR | Platform | UA family |
| --- | --- | --- | --- | --- | --- |
| `phone-360x800` | Android 360×800 | 360×800 | 3 | android | Chrome 141 |
| `phone-375x667` | iPhone SE (2nd / 3rd generation) | 375×667 | 2 | ios | Safari 18.5 |
| `phone-390x844` | iPhone 13 / 14 / 15 | 390×844 | 3 | ios | Safari 18.5 |
| `phone-393x852` | iPhone 15 Pro | 393×852 | 3 | ios | Safari 18.5 |
| `phone-412x915` | Pixel 7 | 412×915 | 2.625 | android | Chrome 141 |
| `phone-430x932` | iPhone 15 Pro Max | 430×932 | 3 | ios | Safari 18.5 |
| `tablet-768x1024` | iPad mini | 768×1024 | 2 | ios | Safari 18.5 |
| `tablet-800x1280` | Galaxy Tab | 800×1280 | 2 | android | Chrome 141 |
| `tablet-820x1180` | iPad Air 11 | 820×1180 | 2 | ios | Safari 18.5 |
| `tablet-834x1194` | iPad Pro 11 | 834×1194 | 2 | ios | Safari 18.5 |

**UA source.** User agents are hand-maintained representative strings, not a
copy of Playwright's bundled device descriptors: descriptors change with every
Playwright release and would silently change the tests. iOS entries use a
Safari 18.5 UA, Android entries a Chrome 141 UA; they identify the browser
family and version used for layout, not the operator's actual build. Dimensions
are CSS viewports from published device specifications; cite the source when
adding one.

**One label nuance.** `phone-390x844` is labelled for the iPhone 13/14/15
family; the `notes` field records that iPhone 15 and 15 Pro report 393×852 in
Safari. Use `phone-393x852` when exact metrics matter.

## Reader API

`src/profiles.mjs` validates the whole file on load and exports:

```js
import { list, get, resolve } from '../src/profiles.mjs'

list()                          // 10 profiles, file order
list({ category: 'tablet' })    // 4 tablets; an unknown category throws RangeError
get('phone-390x844')            // exact id, case-insensitive fallback, else undefined

resolve('phone-390x844')        // { status: 'hit', match: <profile>, matches: [<profile>] }
resolve('nokia 3310')           // { status: 'miss', match: null, matches: [] }
resolve('iphone')               // { status: 'ambiguous', match: null, matches: [4 iPhones] }
```

`resolve()` searches id, label, platform and category. Exact id beats exact
label, which beats a unique substring. An ambiguous result lists every candidate
so the CLI can print them instead of silently choosing one. `iphone` matches
`phone-375x667`, `phone-390x844`, `phone-393x852` and `phone-430x932`.

`loadProfiles(filePath)` and `validateProfile(profile)` are exported for
fixtures and tooling.

## Adding a profile

1. Add one object to `profiles/profiles.json` (keep `version: 1`).
2. Follow the field rules above: CSS pixels, kebab-case unique id, correct
   platform UA, category.
3. Update the pinned expectations in `test/profiles.test.mjs` (the `EXPECTED`
   table) and run `npm test`.
4. Cite the viewport source in the pull request — a vendor specification or a
   browser-devtools preset. Guessed or rounded dimensions are rejected.
5. Do not rename an existing id: screenshots, reports and user scripts use it.
6. Do not use Playwright's device descriptors as the only source. The tests
   pin this file's dimensions and check that widths stay in a sane range per
   category.

More in [`CONTRIBUTING.md`](../CONTRIBUTING.md#adding-a-device-profile).

## Foldables: not done

Foldables are **not implemented** in this milestone.

- `category: "foldable"` is reserved so the schema and reader are ready.
- There are currently **zero** foldable entries. `list({ category: 'foldable' })`
  returns an empty array.
- No guessed dimensions are committed. A foldable has at least two real states
  (folded/unfolded, inner/outer screen); the capture path and the matrix report
  do not model multiple states per device yet.
- The milestone needs sourced CSS viewports per state and a report that compares
  states instead of treating them as unrelated devices. Until then, a foldable
  request stays a placeholder, not data.

See [`profiles/README.md`](../profiles/README.md#foldables-later-milestone) for
the same contract from the data file's point of view.
