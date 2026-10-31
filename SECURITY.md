# Security policy

## Scope

`dsh-ui-lab` is a local developer tool. It launches a headless Chromium against
a DeepSeek Harness (DSH) instance that you run and control, on the same machine
or on your own LAN. It ships no server, has no telemetry and sends nothing to
third parties.

## Credentials

Two kinds of credential can be involved:

- **dsh-mobile pairing state.** The first `mobile` capture pairs a synthetic
  device and writes its cookies to `.cache/mobile-state.json`, relative to the
  working directory, with mode `0600`. Only `DSH_UI_LAB_STATE_DIR` changes that
  directory. `--out` controls screenshots and reports only; it never stores
  device state. Never commit, paste or copy the state file; revoke a leaked
  pairing from the desktop UI: **Mobile access → Devices**.
- **DSH web launch token.** A per-process token printed by `dsh web`. Pass it
  through `--url`, `DSH_UI_LAB_WEB_TOKEN` or `DSH_UI_LAB_WEB_TOKEN_FILE` (mode
  `600`). Do not put token values in issues, reports, screenshots or commits.
  The token changes when DSH web restarts.

The tool does not edit `$DSH_HOME` configuration. The only persistent change on
the DSH side is one paired-device record (plus its device-scoped settings),
which the same Devices panel can remove. Tokens, CSRF values and storage state
are scrubbed from stdout, stderr and reports.

## Reporting a vulnerability

Please report privately — do not open a public issue containing pairing cookies,
tokens or exploit details.

Use this repository's **Security → Report a vulnerability** entry once the
repository is published:

```text
https://github.com/<owner>/dsh-ui-lab/security/advisories/new
```

Until that exists, contact the maintainer listed in `package.json` privately.
Do not include credentials in the first message; describe the impact and a
minimal reproduction first.

Only the latest release line (currently `0.1.x`) receives fixes.
