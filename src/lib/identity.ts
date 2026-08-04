/**
 * Resolve the card's profile identity from the developer's own machine.
 * There is no public API for the VS Code account, so the best local
 * signal is git config (the same name that signs their commits).
 * Pure parsing lives here; file reading stays in the caller.
 */

export interface GitIdentity {
  readonly name: string | null;
  readonly email: string | null;
}

/**
 * Parse `[user] name/email` out of gitconfig text. Only the [user]
 * section is read; later sections with the same keys are ignored once
 * both values are found. Malformed input yields nulls, never throws.
 */
export function parseGitConfig(text: string): GitIdentity {
  let name: string | null = null;
  let email: string | null = null;
  let inUser = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = line.match(/^\[([^\]]+)\]/);
    if (section) {
      inUser = section[1].trim().toLowerCase() === 'user';
      continue;
    }
    if (!inUser) { continue; }
    const kv = line.match(/^(name|email)\s*=\s*(.+)$/i);
    if (!kv) { continue; }
    const value = kv[2].trim();
    if (value.length === 0) { continue; }
    if (kv[1].toLowerCase() === 'name' && name === null) { name = value; }
    if (kv[1].toLowerCase() === 'email' && email === null) { email = value; }
  }
  return { name, email };
}

/**
 * Avatar initials: first letter of the first two words, uppercased.
 * Code-point aware so non-ASCII names do not split surrogate pairs.
 */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(w => w.length > 0)
    .slice(0, 2)
    .map(w => Array.from(w)[0].toUpperCase())
    .join('');
}
