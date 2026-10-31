/**
 * Browser-level tests for the `web` surface that do not need DSH at all:
 * a local node:http server serves test/fixtures/desktop.html, which reproduces
 * the three-column desktop shell (min-width 960px) and therefore overflows a
 * phone viewport exactly like the stock UI can.
 *
 * Chromium is optional here: when Playwright or its browser is unavailable the
 * tests skip, so CI can stay browser-free while local verification runs them.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(ROOT, 'test', 'fixtures', 'desktop.html')
const TOKEN = 'fixture-token-123'
const PNG_SIGNATURE = '89504e470d0a1a0a'

const BASE_ENV = {
  DSH_UI_LAB_URL: '',
  DSH_UI_LAB_WEB_TOKEN: '',
  DSH_UI_LAB_WEB_TOKEN_FILE: '',
  DSH_UI_LAB_WAIT_MS: '0',
}

function hasCookie(header, expected) {
  return (header ?? '')
    .split(';')
    .map(part => part.trim())
    .includes(expected)
}

function unauthorized(response) {
  response.writeHead(401, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  response.end('fixture authentication required\n')
}

/**
 * Serve the single fixture page. With `token`, mimic DSH's launch-token flow:
 * `/?token=…` mints a cookie and redirects to the clean URL.
 */
function startFixtureServer({ token = null } = {}) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.invalid')

    if (token !== null) {
      const supplied = url.searchParams.get('token')
      if (supplied !== null) {
        if (supplied !== token) {
          unauthorized(response)
          return
        }
        response.writeHead(303, {
          location: './',
          'cache-control': 'no-store',
          'set-cookie': 'fixture-auth=yes; Path=/; HttpOnly; SameSite=Lax',
        })
        response.end()
        return
      }
      if (!hasCookie(request.headers.cookie, 'fixture-auth=yes')) {
        unauthorized(response)
        return
      }
    }

    if (url.pathname !== '/' && url.pathname !== '/desktop.html' && url.pathname !== '/index.html') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('not found\n')
      return
    }
    try {
      const body = await readFileSync(FIXTURE)
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      response.end(body)
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(`fixture error: ${error.message}\n`)
    }
  })

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const origin = `http://127.0.0.1:${address.port}`
      resolvePromise({
        origin,
        url: `${origin}/`,
        close: () => new Promise((resolveClose, rejectClose) => {
          server.closeAllConnections?.()
          server.close(error => (error ? rejectClose(error) : resolveClose()))
        }),
      })
    })
  })
}

/** Async on purpose: the fixture HTTP server lives in this process, so a
 * synchronous spawn would block its event loop and every page load would time
 * out. */
function runCli(args, extraEnv = {}) {
  return new Promise(resolvePromise => {
    const child = spawn(process.execPath, ['src/cli.mjs', ...args], {
      cwd: ROOT,
      env: { ...process.env, ...BASE_ENV, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    child.on('error', error => {
      clearTimeout(timer)
      resolvePromise({ status: -1, signal: null, stdout, stderr: `${stderr}\n${error.message}` })
    })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      resolvePromise({ status, signal, stdout, stderr })
    })
  })
}

const BROWSER_MISSING =
  /Playwright is not installed|cannot launch Chromium|Executable doesn't exist|browserType\.launch|Failed to launch/i

function skipIfBrowserMissing(t, result) {
  if (result.status !== 0 && BROWSER_MISSING.test(`${result.stderr ?? ''}\n${result.stdout ?? ''}`)) {
    t.skip('Playwright/Chromium is not available here')
    return true
  }
  return false
}

function assertPng(path) {
  assert.ok(existsSync(path), `missing screenshot ${path}`)
  const buffer = readFileSync(path)
  assert.equal(buffer.subarray(0, 8).toString('hex'), PNG_SIGNATURE, 'not a PNG')
  assert.ok(statSync(path).size > 1_000, 'screenshot is suspiciously small')
}

function assertOverflow(payload) {
  assert.equal(payload.surface, 'web')
  assert.deepEqual(payload.metrics.viewport, { width: 390, height: 844 })
  assert.equal(payload.metrics.overflowX, true)
  assert.ok(payload.metrics.documentElement.scrollWidth >= 960)
  assert.ok(payload.metrics.body.clientWidth >= 960)
}

test('web surface captures the local fixture over HTTP with no DSH', { timeout: 120_000 }, async t => {
  const server = await startFixtureServer()
  const out = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-fixture-'))
  try {
    const result = await runCli([
      'shot',
      '--surface',
      'web',
      '--profile',
      'phone-390x844',
      '--url',
      server.url,
      '--out',
      out,
      '--json',
    ])
    if (skipIfBrowserMissing(t, result)) return
    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout)
    assertOverflow(payload)
    assert.equal(payload.url, server.url)
    assertPng(payload.screenshot)
  } finally {
    await server.close()
    rmSync(out, { recursive: true, force: true })
  }
})

test('web surface captures a file:// fixture with no server', { timeout: 120_000 }, async t => {
  const out = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-file-'))
  try {
    const result = await runCli([
      'shot',
      '--surface',
      'web',
      '--profile',
      'phone-390x844',
      '--url',
      pathToFileURL(FIXTURE).href,
      '--out',
      out,
      '--json',
    ])
    if (skipIfBrowserMissing(t, result)) return
    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout)
    assertOverflow(payload)
    assert.match(payload.url, /^file:\/\//)
    assertPng(payload.screenshot)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('a token in --url authenticates without leaking the token', { timeout: 120_000 }, async t => {
  const server = await startFixtureServer({ token: TOKEN })
  const out = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-url-token-'))
  try {
    const result = await runCli([
      'shot',
      '--surface',
      'web',
      '--profile',
      'phone-390x844',
      '--url',
      `${server.url}?token=${TOKEN}`,
      '--out',
      out,
      '--json',
    ])
    if (skipIfBrowserMissing(t, result)) return
    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout)
    assertOverflow(payload)
    assert.equal(payload.url, server.url)
    assert.ok(!result.stdout.includes(TOKEN), 'token leaked to stdout')
    assert.ok(!result.stderr.includes(TOKEN), 'token leaked to stderr')
    assertPng(payload.screenshot)
  } finally {
    await server.close()
    rmSync(out, { recursive: true, force: true })
  }
})

test('DSH_UI_LAB_WEB_TOKEN authenticates a bare URL', { timeout: 120_000 }, async t => {
  const server = await startFixtureServer({ token: TOKEN })
  const out = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-env-token-'))
  try {
    const result = await runCli(
      ['shot', '--surface', 'web', '--profile', 'phone-390x844', '--url', server.url, '--out', out, '--json'],
      { DSH_UI_LAB_WEB_TOKEN: TOKEN },
    )
    if (skipIfBrowserMissing(t, result)) return
    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout)
    assertOverflow(payload)
    assert.equal(payload.url, server.url)
    assert.ok(!result.stdout.includes(TOKEN))
    assert.ok(!result.stderr.includes(TOKEN))
    assertPng(payload.screenshot)
  } finally {
    await server.close()
    rmSync(out, { recursive: true, force: true })
  }
})

test('DSH_UI_LAB_WEB_TOKEN_FILE (mode 600) authenticates a bare URL', { timeout: 120_000 }, async t => {
  const server = await startFixtureServer({ token: TOKEN })
  const out = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-file-token-'))
  const secrets = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-secrets-'))
  try {
    const tokenFile = join(secrets, 'web-token')
    writeFileSync(tokenFile, `${TOKEN}\n`, { mode: 0o600 })
    const result = await runCli(
      ['shot', '--surface', 'web', '--profile', 'phone-390x844', '--url', server.url, '--out', out, '--json'],
      { DSH_UI_LAB_WEB_TOKEN_FILE: tokenFile },
    )
    if (skipIfBrowserMissing(t, result)) return
    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout)
    assertOverflow(payload)
    assert.equal(payload.url, server.url)
    assert.ok(!result.stdout.includes(TOKEN))
    assert.ok(!result.stderr.includes(TOKEN))
    assertPng(payload.screenshot)
  } finally {
    await server.close()
    rmSync(out, { recursive: true, force: true })
    rmSync(secrets, { recursive: true, force: true })
  }
})

test('a token file with the wrong mode fails before capture and never echoes the token', {
  timeout: 120_000,
  // `mode 600` is POSIX-only; src/token.mjs intentionally skips the check on
  // win32 (ACLs are the platform equivalent), so this CLI contract only exists
  // on POSIX hosts. The win32 semantics are covered by test/web-token.test.mjs.
  skip: process.platform === 'win32' ? 'POSIX mode bits are not enforced on Windows (ACLs are used)' : false,
}, async t => {
  const server = await startFixtureServer({ token: TOKEN })
  const out = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-bad-token-'))
  const secrets = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-secrets-bad-'))
  try {
    const tokenFile = join(secrets, 'web-token')
    writeFileSync(tokenFile, TOKEN, { mode: 0o644 })
    const result = await runCli(
      ['shot', '--surface', 'web', '--profile', 'phone-390x844', '--url', server.url, '--out', out, '--json'],
      { DSH_UI_LAB_WEB_TOKEN_FILE: tokenFile },
    )
    if (skipIfBrowserMissing(t, result)) return
    assert.equal(result.status, 1)
    assert.match(result.stderr, /mode 600/)
    assert.ok(!result.stdout.includes(TOKEN))
    assert.ok(!result.stderr.includes(TOKEN))
  } finally {
    await server.close()
    rmSync(out, { recursive: true, force: true })
    rmSync(secrets, { recursive: true, force: true })
  }
})

test('matrix over the local fixture writes a self-contained report without credentials', { timeout: 120_000 }, async t => {
  const server = await startFixtureServer({ token: TOKEN })
  const out = mkdtempSync(join(tmpdir(), 'dsh-ui-lab-matrix-'))
  try {
    const result = await runCli([
      'matrix',
      '--surface',
      'web',
      '--profiles',
      'phone-390x844,tablet-768x1024',
      '--url',
      `${server.url}?token=${TOKEN}`,
      '--out',
      out,
      '--json',
    ])
    if (skipIfBrowserMissing(t, result)) return
    assert.equal(result.status, 0, result.stderr)

    const summaryPath = join(out, 'summary.json')
    const reportPath = join(out, 'report.html')
    assert.ok(existsSync(summaryPath))
    assert.ok(existsSync(reportPath))

    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
    assert.equal(summary.totals.profiles, 2)
    assert.equal(summary.totals.failed, 0)
    assert.ok(summary.results.every(row => row.overflowX === true))
    assert.ok(summary.results.every(row => row.screenshot !== null))

    const report = readFileSync(reportPath, 'utf8')
    assert.match(report, /<style>/)
    assert.match(report, /web__phone-390x844\.png/)
    assert.match(report, /web__tablet-768x1024\.png/)
    for (const text of [report, readFileSync(summaryPath, 'utf8')]) {
      assert.doesNotMatch(text, /fixture-token|token=|csrf|dsh_ma_/i)
    }
    for (const row of summary.results) assertPng(join(out, row.screenshot))
  } finally {
    await server.close()
    rmSync(out, { recursive: true, force: true })
  }
})
