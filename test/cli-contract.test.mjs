/**
 * CLI contract tests that never launch a browser or contact DSH.
 *
 * They pin the process-level behaviour the docs promise: usage errors exit 2,
 * `--json` is parseable, and `measure` never writes a PNG. The measure case uses
 * a tiny fake Playwright module through `--playwright`, so it also exercises the
 * real capture orchestration without a Chromium download.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = pathToFileURL(join(ROOT, 'test', 'fixtures', 'desktop.html')).href

const BASE_ENV = {
  DSH_UI_LAB_URL: '',
  DSH_UI_LAB_WEB_TOKEN: '',
  DSH_UI_LAB_WEB_TOKEN_FILE: '',
  DSH_UI_LAB_WAIT_MS: '0',
}

function runCli(args, extraEnv = {}) {
  return spawnSync(process.execPath, ['src/cli.mjs', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...BASE_ENV, ...extraEnv },
  })
}

function withTempDirectory(prefix, run) {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  try {
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function writeFakePlaywright(directory) {
  const file = join(directory, 'fake-playwright.cjs')
  writeFileSync(
    file,
    `module.exports = {
  chromium: {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          on() {},
          goto: async () => ({ status: () => 200 }),
          waitForTimeout: async () => {},
          url: () => 'file:///fake',
          evaluate: async () => ({
            viewport: { width: 390, height: 844 },
            layoutViewport: { width: 390, height: 844 },
            visualViewport: { width: 390, height: 844, scale: 1 },
            devicePixelRatio: 3,
            title: 'fake',
            documentElement: { clientWidth: 390, scrollWidth: 390, clientHeight: 844, scrollHeight: 844 },
            body: { clientWidth: 390, scrollWidth: 390 },
            overflowX: false,
            shell: false,
            dedicatedMobileFrontend: null,
          }),
          screenshot: async () => { throw new Error('measure must not take a screenshot') },
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  },
}
`,
  )
  return file
}

test('usage errors exit 2 without launching a browser', () => {
  const cases = [
    { args: ['shot'], pattern: /requires --profile/ },
    { args: ['measure'], pattern: /requires --profile/ },
    { args: ['list', '--surface', 'web'], pattern: /not used by list/ },
    { args: ['matrix', '--wait', 'soon'], pattern: /--wait/ },
    { args: ['frobnicate'], pattern: /unknown command/ },
    { args: ['shot', '--profile', 'nope'], pattern: /no profile matches/ },
    { args: ['matrix', '--class', 'foldable'], pattern: /no profiles in category/ },
  ]
  for (const { args, pattern } of cases) {
    const result = runCli(args)
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`)
    assert.match(result.stderr, pattern)
  }
})

test('list --json is parseable', () => {
  const result = runCli(['list', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const profiles = JSON.parse(result.stdout)
  assert.equal(profiles.length, 10)
  assert.ok(profiles.every(profile => typeof profile.id === 'string' && profile.viewport.width > 0))
})

test('measure writes metrics but no PNG (fake Playwright, no browser)', () => {
  withTempDirectory('dsh-ui-lab-contract-', directory => {
    const fakePlaywright = writeFakePlaywright(directory)
    const out = join(directory, 'out')
    const result = runCli([
      'measure',
      '--surface',
      'web',
      '--profile',
      'phone-390x844',
      '--url',
      FIXTURE,
      '--out',
      out,
      '--playwright',
      fakePlaywright,
      '--json',
    ])
    assert.equal(result.status, 0, result.stderr)

    const payload = JSON.parse(result.stdout)
    assert.equal(payload.surface, 'web')
    assert.equal(payload.screenshot, null)
    assert.deepEqual(payload.metrics.viewport, { width: 390, height: 844 })
    if (existsSync(out)) {
      assert.ok(!readdirSync(out).some(name => name.endsWith('.png')), 'measure wrote a PNG')
    }
  })
})

test('the resolver error explains global and project Playwright installs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-resolver-'))
  try {
    mkdirSync(join(directory, 'src'))
    copyFileSync(join(ROOT, 'src', 'playwright.mjs'), join(directory, 'src', 'playwright.mjs'))
    copyFileSync(join(ROOT, 'src', 'errors.mjs'), join(directory, 'src', 'errors.mjs'))

    const module = await import(pathToFileURL(join(directory, 'src', 'playwright.mjs')).href)
    assert.throws(
      () => module.resolvePlaywright({ dshHome: join(directory, 'empty-dsh') }),
      error => {
        assert.match(error.message, /Global CLI/)
        assert.match(error.message, /DSH_UI_LAB_PLAYWRIGHT/)
        assert.match(error.message, /npm install -D playwright/)
        return true
      },
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the changelog and package agree on the version', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
  assert.match(changelog, new RegExp(`## \\[${pkg.version.replaceAll('.', '\\.')}\\]`))
})
