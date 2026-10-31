/**
 * DSH web launch-token resolution.
 *
 * A real DSH web root mints a browser cookie only for the per-process token
 * that `dsh web` prints at startup. For headless capture that token can be
 * supplied three ways, in descending precedence:
 *
 *   1. inside `--url` as `?token=…`;
 *   2. `DSH_UI_LAB_WEB_TOKEN`;
 *   3. `DSH_UI_LAB_WEB_TOKEN_FILE`, which must be a regular file with mode 600.
 *
 * The token is a credential: it is never included in errors, logs, reports or
 * screenshot names. `readTokenFile` reports the offending path and mode, never
 * the file's contents.
 */
import { readFileSync, statSync } from 'node:fs'
import { RuntimeError } from './errors.mjs'

/**
 * Read a token from a file after enforcing that only the owner can read it.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function readTokenFile(filePath) {
  let stats
  try {
    stats = statSync(filePath)
  } catch (cause) {
    throw new RuntimeError(`DSH_UI_LAB_WEB_TOKEN_FILE cannot be read at ${filePath} (${cause.message})`, {
      cause,
    })
  }
  if (!stats.isFile()) {
    throw new RuntimeError(`DSH_UI_LAB_WEB_TOKEN_FILE is not a regular file: ${filePath}`)
  }
  if (process.platform !== 'win32') {
    const mode = stats.mode & 0o777
    if (mode !== 0o600) {
      throw new RuntimeError(
        `DSH_UI_LAB_WEB_TOKEN_FILE must have mode 600 (found ${mode.toString(8).padStart(3, '0')}); ` +
          `run \`chmod 600 ${filePath}\` and retry`,
      )
    }
  }

  let token
  try {
    token = readFileSync(filePath, 'utf8').trim()
  } catch (cause) {
    throw new RuntimeError(`DSH_UI_LAB_WEB_TOKEN_FILE cannot be read at ${filePath} (${cause.message})`, {
      cause,
    })
  }
  if (token === '') throw new RuntimeError(`DSH_UI_LAB_WEB_TOKEN_FILE is empty: ${filePath}`)
  return token
}

/**
 * Resolve the effective web token.
 *
 * @param {{ urlToken?: string|null, envToken?: string|null, tokenFile?: string|null }} [options]
 * @returns {{ token: string|null, source: 'url'|'env'|'file'|null }}
 */
export function resolveWebToken({ urlToken = null, envToken = null, tokenFile = null } = {}) {
  if (typeof urlToken === 'string' && urlToken !== '') return { token: urlToken, source: 'url' }
  if (typeof envToken === 'string' && envToken.trim() !== '') return { token: envToken.trim(), source: 'env' }
  if (typeof tokenFile === 'string' && tokenFile.trim() !== '') {
    return { token: readTokenFile(tokenFile.trim()), source: 'file' }
  }
  return { token: null, source: null }
}
