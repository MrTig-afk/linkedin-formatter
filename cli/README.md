# linkedin-fmt

Style LinkedIn posts with real Unicode from the command line.

LinkedIn's composer has no formatting controls. Every "bold" LinkedIn post is a
Unicode substitution: those are different code points, not styled ASCII.
Markdown does nothing, because `**bold**` pastes in as literal asterisks.

This converts text to the characters that actually survive the paste.

```
$ linkedin-fmt style "Shipped v1.0.2" --family script
𝒮𝒽𝒾𝓅𝓅ℯ𝒹 𝓋1.0.2

$ linkedin-fmt style "Shipped" --bold
𝐒𝐡𝐢𝐩𝐩𝐞𝐝

$ linkedin-fmt mark "Wrong" --mark strikethrough
W̶r̶o̶n̶g̶
```

## Install

```bash
npm install -g linkedin-fmt
```

Or run it without installing:

```bash
npx -y linkedin-fmt --help
```

Node 18 or newer. No dependencies, one file, nothing to configure.

## Commands

| Command | What it does |
|---|---|
| `style <text>` | Apply a font family, optionally bold and/or italic |
| `mark <text>` | Layer a combining mark (strikethrough, underline) |
| `strip <text>` | Convert styled text back to plain ASCII |
| `count <text>` | Count against LinkedIn's 3,000 character limit |
| `families` | List the 11 families and the axes each supports |
| `styles` | List every letterform style and combining mark |

### Options

| Flag | For | Meaning |
|---|---|---|
| `-f, --family <id>` | `style` | Font family (default `serif`) |
| `-b, --bold` | `style` | Bold axis, where the family has one |
| `-i, --italic` | `style` | Italic axis, where the family has one |
| `-m, --mark <id>` | `mark` | `strikethrough` or `underline` |
| `-u, --unit <unit>` | `count` | `utf16` (default) or `codepoints` |

## Input

Text comes from the argument, or from stdin when the argument is omitted, so
files work by redirection and commands compose:

```
$ linkedin-fmt strip < post.linkedin
$ cat post.linkedin | linkedin-fmt count
$ linkedin-fmt style "Hello" --family fraktur | linkedin-fmt strip
Hello
```

## Counting

LinkedIn counts **UTF-16 code units**, not characters. A styled character costs
two, so a naive character count will tell you a post fits when it does not:

```
$ linkedin-fmt count "Hello"
5 / 3000  [utf16, normal]

$ linkedin-fmt style "Hello" --bold | linkedin-fmt count
10 / 3000  [utf16, normal]
```

`count` exits non-zero when over the limit, so a publishing script can gate on
it:

```
linkedin-fmt count < post.linkedin || { echo "too long"; exit 1; }
```

## Behaviour worth knowing

**Fail closed.** A character with no equivalent in the target style is left
unchanged, never swapped for a visual lookalike. Families with no digit row
leave digits as plain ASCII. That is correct rather than a fallback.

**Unicode is sparse.** Monospace has no bold; script has no italic. Asking for
an axis a family does not have drops it, reports that on **stderr**, and leaves
**stdout** clean so pipelines keep working:

```
$ linkedin-fmt style "Hi" --family monospace --bold
𝙷𝚒
note: monospace has no bold in Unicode; dropped.
```

**Lossless round trip.** `strip` reverses `style` exactly, for every family,
asserted over the full `A-Za-z0-9` range.

**No network.** Nothing is sent anywhere. There is no telemetry and no update
check.

## Related

- **VS Code extension** - the same core with a live LinkedIn card preview:
  `code --install-extension kaushiknaru.linkedin-formatter`
- **MCP server** - the same core as tools for AI assistants:
  `claude mcp add -s user linkedin-formatter -- npx -y linkedin-formatter-mcp`,
  or `npx -y linkedin-formatter-mcp` from any other client's config

All three share one conversion core with no duplicated logic.

## Licence

MIT
