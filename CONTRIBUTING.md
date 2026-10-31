# Contributing to dsh-ui-lab

Thanks for helping. The project debugs the DeepSeek Harness UI from a headless
Chromium, so most contributions are **data** (device profiles), **capture
logic**, **tests** or **documentation**.

## Development setup

Requirements: Linux or Windows, Node.js >= 20 and npm >= 10.

```bash
npm ci                              # installs the optional Playwright dev dependency
npx playwright install chromium     # one-time browser download (~150 MB)
npm link                            # optional: run `dsh-ui-lab` from PATH
```

On a bare Linux box, `npx playwright install --with-deps chromium` also installs
the shared libraries Chromium needs (it asks for sudo). On Windows the plain
`npx playwright install chromium` is enough: the Windows build carries its own
runtime, and no system package is needed.

The browser tests skip when Playwright or its Chromium is unavailable, so a
browser-free environment can still run the suite. Install Chromium to actually
exercise the capture path.

Windows notes:

- `npm test` and `npm run lint` are platform-neutral. Two tests pin the POSIX
  `mode 600` contract of `DSH_UI_LAB_WEB_TOKEN_FILE`; they skip on Windows
  because file permissions there are ACL-based and `src/token.mjs` deliberately
  skips the mode check (`process.platform !== 'win32'`). The same tests still run
  on Linux CI, so the POSIX branch stays covered.
- Use native paths (`C:\Users\me\shots`); quote paths with spaces in PowerShell.
- There is no `chmod` step for the token file; keep it under `%USERPROFILE%`.

## Running the checks

```bash
npm test        # node --test: unit tests + local-fixture browser tests
npm run lint    # node --check over every module + JSON parsing
```

`npm test` and `npm run lint` run in the default CI matrix on Node.js 20 and 22,
on both `ubuntu-latest` and `windows-latest`. That job does not download a
browser; the browser-level tests in `test/web-fixture.test.mjs` start a local
`node:http` server against `test/fixtures/desktop.html` and skip cleanly without
Chromium. The two POSIX `mode 600` tests skip on the Windows leg (see the Windows
notes above) and still run on the Ubuntu leg.

The browser tests also have a **separate manual CI job** (Actions → CI → Run
workflow → job "browser fixture (manual)"), which installs Chromium and runs
`npm run test:browser`. Run the same command locally after
`npx playwright install chromium` before sending a capture change.

Manual checks:

```bash
node src/cli.mjs list
node src/cli.mjs shot --surface web --profile phone-390x844 \
  --url "file://$PWD/test/fixtures/desktop.html" --out .shots/review --json
```

Never point the test suite at a real DSH instance or a real token; tests use the
fixture so they stay reproducible and credential-free.

## Adding a device profile

Profiles live in **one** file, [`profiles/profiles.json`](profiles/profiles.json)
(`version: 1`, a `profiles` array). They are data, not code; adding a device must
not touch the capture path.

```json
{
  "id": "phone-393x852",
  "label": "iPhone 15 Pro",
  "category": "phone",
  "viewport": { "width": 393, "height": 852 },
  "deviceScaleFactor": 3,
  "isMobile": true,
  "hasTouch": true,
  "platform": "ios",
  "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) …",
  "notes": "Optional, free-form context."
}
```

Rules:

- **CSS pixels, not physical pixels.** `viewport` is the size
  `window.visualViewport` reports; the panel resolution goes into
  `deviceScaleFactor`. Fractional DPRs are valid (Pixel 7: `2.625`).
- **Stable kebab-case `id`**, unique across the file. Never rename or reuse an
  existing id: reports, screenshots and user scripts depend on it.
- **Cite the source** in the pull request: a vendor specification or a
  browser-devtools preset. Guessed or rounded dimensions are rejected.
- **The UA must match the platform.** Do not reuse a desktop UA. The strings
  here are maintained by hand; Playwright's bundled device descriptors are not
  the source of truth because they drift between releases.
- **Update the pinned tests.** Add the id, viewport and DPR to the `EXPECTED`
  table in `test/profiles.test.mjs`; the suite also checks positive integer
  viewports, unique ids, field types and sane width ranges per category.
- **Foldables are not accepted yet.** The `foldable` category is reserved with
  zero entries because the capture/report model has no folded/unfolded states.
  See [`docs/profiles.md`](docs/profiles.md#foldables-not-done).

Full details: [`docs/profiles.md`](docs/profiles.md).

## Changing a surface or capture path

- Web token handling lives in `src/token.mjs` and `src/surfaces/web.mjs`; token
  precedence is `--url` parameter, then `DSH_UI_LAB_WEB_TOKEN`, then
  `DSH_UI_LAB_WEB_TOKEN_FILE` (mode `600`). Never log, persist or report the
  token.
- Mobile pairing lives in `src/pairing.mjs` and `src/surfaces/mobile.mjs`;
  storage state stays in `.cache/mobile-state.json` with mode `0600`.
- Keep every default in `src/defaults.mjs` and every default overridable through
  a `DSH_UI_LAB_*` environment variable or a CLI flag. Do not hard-code absolute
  paths or a developer machine's IP.
- Exit codes are part of the interface: `0` success, `1` runtime/assertion
  failure, `2` usage error.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(cli): add matrix command
fix(web): accept a token from a mode-600 file
docs: document the dsh-mobile pairing flow
test(profiles): reject duplicate ids
chore(ci): cache npm downloads
```

The subject is imperative, lowercase and at most 72 characters. Explain *why* in
the body. One logical change per commit; keep formatting-only churn out of
functional commits.

## Developer Certificate of Origin

**No DCO sign-off is required.** We do not ask for `Signed-off-by:` lines. By
submitting a contribution you agree that it is licensed under the project's MIT
license.

## Secrets and local state

Never commit:

- `.cache/` — including `mobile-state.json`, which is a bearer credential for a
  paired device;
- `.shots/` — screenshots can contain session titles and account images;
- token files, `.env` files, cookies or CSRF values.

Token files must be mode `600`; the tool refuses anything else. If a pairing
cookie leaks, revoke the device in the desktop UI (**Mobile access → Devices**)
and rotate anything else the file contained. No credential should ever appear in
a report, a screenshot filename, stdout/stderr or a test fixture.

See [`SECURITY.md`](SECURITY.md).

## Code style

- ES modules only; Node.js built-ins first.
- Load Playwright lazily (only in the capture path) so `list`, `--help` and the
  unit tests run without it.
- 2-space indent, LF, single quotes, no semicolons; the whole tree must pass
  `node --check` (`npm run lint`).
- Keep failure messages actionable: name the profile, the surface and the URL
  (sanitized), and never echo credentials.

## Reporting bugs

Open an issue with the exact command, profile id, surface, DSH/dsh-mobile
version, the console errors printed by the tool and (if safe) the screenshot
from `.shots/`. Redact cookies, tokens and session titles first. Security issues
go through [`SECURITY.md`](SECURITY.md), not a public issue.
