/**
 * `dsh-ui-lab doctor` — answer "why did my first capture fail" before it fails.
 *
 * Every check is read-only and independent; a missing Playwright is not allowed
 * to hide an unreachable DSH instance. Exit code is 0 when nothing is broken,
 * 1 when a hard requirement is missing (Node, Playwright, or the CLI itself).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDefaults } from './defaults.mjs'
import { resolvePlaywright } from './playwright.mjs'
import { list } from './profiles.mjs'

function check(id, label, status, detail) {
  return { id, label, status, detail }
}

function nodeCheck() {
  const major = Number(process.versions.node.split('.')[0])
  if (Number.isFinite(major) && major >= 20) {
    return check('node', 'Node.js', 'ok', `v${process.versions.node}`)
  }
  return check('node', 'Node.js', 'fail', `v${process.versions.node} — 需要 Node.js 20 或更高`)
}

function playwrightCheck(options) {
  let module
  try {
    module = resolvePlaywright(options)
  } catch (error) {
    return {
      checks: [check('playwright', 'Playwright', 'fail', error instanceof Error ? error.message : String(error))],
    }
  }
  const checks = [check('playwright', 'Playwright', 'ok', '模块可解析')]
  let executable = null
  try {
    executable = module.chromium?.executablePath?.() ?? null
  } catch {
    executable = null
  }
  if (executable === null) {
    checks.push(check('chromium', 'Chromium', 'warn', '无法确定 Chromium 路径；首次截图时才会暴露'))
  } else if (existsSync(executable)) {
    checks.push(check('chromium', 'Chromium', 'ok', executable))
  } else {
    checks.push(check('chromium', 'Chromium', 'fail', `未安装：${executable}（运行 npx playwright install chromium）`))
  }
  return { checks }
}

function profilesCheck() {
  try {
    const all = list()
    const count = all.length
    const categories = [...new Set(all.map((profile) => profile.category))].join(' / ')
    return check('profiles', '机型表', count > 0 ? 'ok' : 'fail', `${count} 个机型（${categories}）`)
  } catch (error) {
    return check('profiles', '机型表', 'fail', error instanceof Error ? error.message : String(error))
  }
}

async function dshCheck(defaults, timeoutMs) {
  const url = defaults.baseUrl
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal })
    // 401/403 is the launch-token gate: reachable, just not authenticated yet.
    if (response.status === 401 || response.status === 403) {
      return check('dsh', 'DSH web', 'warn', `${url} 可达（HTTP ${response.status}，需要 launch token）`)
    }
    if (response.ok) {
      return check('dsh', 'DSH web', 'ok', `${url} 可达（HTTP ${response.status}）`)
    }
    return check('dsh', 'DSH web', 'warn', `${url} 返回 HTTP ${response.status}`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return check('dsh', 'DSH web', 'warn', `${url} 不可达：${reason}（只有 --surface web 需要它）`)
  } finally {
    clearTimeout(timer)
  }
}

function stateCheck(defaults) {
  const dir = defaults.stateDir
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.doctor-${process.pid}`)
    writeFileSync(probe, 'ok')
    rmSync(probe, { force: true })
    return check('state', '配对缓存目录', 'ok', dir)
  } catch (error) {
    return check('state', '配对缓存目录', 'warn', `${dir} 不可写：${error instanceof Error ? error.message : String(error)}`)
  }
}

const ICON = { ok: '✓', warn: '!', fail: '✗' }

/** Collect every check without printing — the testable half of `doctor`. */
export async function collectDoctorChecks({ dshHome = null, explicitPlaywright = null } = {}) {
  const defaults = getDefaults({}, process.cwd(), dshHome ?? undefined)
  const playwright = playwrightCheck({ explicit: explicitPlaywright, dshHome })
  return [
    nodeCheck(),
    ...playwright.checks,
    profilesCheck(),
    stateCheck(defaults),
    await dshCheck(defaults, 4000),
  ]
}

/**
 * @param {{ json?: boolean, dshHome?: string|null, explicitPlaywright?: string|null }} context
 */
export async function doctor({ json = false, dshHome = null, explicitPlaywright = null } = {}) {
  const checks = await collectDoctorChecks({ dshHome, explicitPlaywright })

  if (json) {
    const ok = checks.every((entry) => entry.status !== 'fail')
    process.stdout.write(`${JSON.stringify({ ok, checks }, null, 2)}\n`)
    return ok ? 0 : 1
  }

  process.stdout.write(`dsh-ui-lab doctor\n\n`)
  for (const entry of checks) {
    process.stdout.write(`  ${ICON[entry.status] ?? '?'} ${entry.label.padEnd(14)} ${entry.detail}\n`)
  }
  const failed = checks.filter((entry) => entry.status === 'fail')
  const warned = checks.filter((entry) => entry.status === 'warn')
  process.stdout.write('\n')
  if (failed.length > 0) {
    process.stdout.write(`${failed.length} 项必须修掉：${failed.map((entry) => entry.label).join('、')}\n`)
    return 1
  }
  process.stdout.write(warned.length > 0 ? `没有硬性缺失；${warned.length} 项提示可以忽略或按需处理。\n` : '全部就绪。\n')
  return 0
}
