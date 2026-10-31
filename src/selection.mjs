/** Profile selection helpers shared by `shot`, `measure` and `matrix`. */
import { UsageError } from './errors.mjs'
import { PROFILE_CATEGORIES, resolve } from './profiles.mjs'

/**
 * Resolve exactly one profile from a user-supplied name.
 *
 * @param {import('./profiles.mjs').Profile[]} profiles
 * @param {string} name
 * @returns {import('./profiles.mjs').Profile}
 */
export function selectOne(profiles, name) {
  const result = resolve(name, profiles)
  if (result.status === 'miss') {
    throw new UsageError(`no profile matches "${name}". Run \`dsh-ui-lab list\` to see ids.`)
  }
  if (result.status === 'ambiguous') {
    throw new UsageError(
      `profile "${name}" is ambiguous; pick one of: ${result.matches.map(profile => profile.id).join(', ')}`,
    )
  }
  return result.match
}

/**
 * Expand a matrix selection. `category` comes from `--class`; `names` from
 * `--profiles` and may contain profile ids, fuzzy names or category names.
 * Unknown / ambiguous names are usage errors so a typo never silently shrinks
 * the matrix.
 *
 * @param {import('./profiles.mjs').Profile[]} profiles
 * @param {{ category?: string, names?: string[] }} [selection]
 * @returns {import('./profiles.mjs').Profile[]}
 */
export function expandMatrix(profiles, { category, names = [] } = {}) {
  let selected = category === undefined ? profiles.slice() : profiles.filter(profile => profile.category === category)

  if (names.length > 0) {
    const wanted = new Set()
    for (const raw of names) {
      const name = raw.trim()
      if (name === '') continue
      if (PROFILE_CATEGORIES.includes(name)) {
        for (const profile of profiles) if (profile.category === name) wanted.add(profile.id)
        continue
      }
      const result = resolve(name, profiles)
      if (result.status === 'miss') {
        throw new UsageError(`no profile matches "${name}". Run \`dsh-ui-lab list\` to see ids.`)
      }
      if (result.status === 'ambiguous') {
        throw new UsageError(
          `profile "${name}" is ambiguous; pick one of: ${result.matches.map(profile => profile.id).join(', ')}`,
        )
      }
      wanted.add(result.match.id)
    }
    selected = selected.filter(profile => wanted.has(profile.id))
  }

  if (selected.length === 0) {
    throw new UsageError(category === undefined ? 'no profiles matched' : `no profiles in category "${category}"`)
  }
  return selected
}
