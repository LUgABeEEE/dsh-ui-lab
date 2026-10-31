/** Exit-code-bearing errors shared by the CLI and the capture pipeline. */

/** A user mistake: bad flags, unknown profile, missing input. Exit code 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
    this.exitCode = 2
  }
}

/** A runtime failure: browser, network, pairing, assertion. Exit code 1. */
export class RuntimeError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'RuntimeError'
    this.exitCode = 1
  }
}

/**
 * Remove credential-looking query parameters and cookie values from text that
 * is about to reach a terminal, a report or a log. DSH's launch token travels as
 * `?token=…`; it must never be echoed back.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function scrub(value) {
  return String(value)
    .replace(/([?&](?:token|csrf|code|state)=)[^&\s"'`]+/giu, '$1<redacted>')
    .replace(/\btoken=[^\s"'`&]+/giu, 'token=<redacted>')
    .replace(/\b(csrf|authorization|cookie)\s*[:=]\s*\S+/giu, '$1=<redacted>')
}
