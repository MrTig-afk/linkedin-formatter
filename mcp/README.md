# linkedin-formatter-mcp

An MCP server that lets an AI assistant style LinkedIn posts with real Unicode.

## The problem it solves

LinkedIn has no formatting controls. Every "bold" post is a Unicode
substitution, and Markdown does nothing: `**bold**` pastes in as literal
asterisks.

Models are unreliable at this. Script capital B is `U+212C`, in Letterlike
Symbols, **not** one past script A, because the Mathematical Alphanumeric block
has holes where Unicode had already assigned those letters decades earlier.
Four ranges need exception tables. A model working from memory gets this subtly
wrong, and the failure renders as an empty box on someone's phone.

Models also cannot count LinkedIn posts correctly, because LinkedIn counts
UTF-16 code units and a styled character costs two.

This server replaces guessing with a function call.

## Setup

Add it to your client's MCP configuration:

```json
{
  "mcpServers": {
    "linkedin-formatter": {
      "command": "npx",
      "args": ["-y", "linkedin-formatter-mcp"]
    }
  }
}
```

Per client (Node 18 or newer):

- **Claude Code**: `claude mcp add -s user linkedin-formatter -- npx -y linkedin-formatter-mcp`
- **Claude Desktop**: the JSON above in `claude_desktop_config.json`
  (Settings → Developer → Edit Config)
- **Cursor**: the JSON above in `~/.cursor/mcp.json`
- **Windsurf**: the JSON above in `~/.codeium/windsurf/mcp_config.json`
- **Codex**: an `[mcp_servers.linkedin-formatter]` block with
  `command = "npx"` and `args = ["-y", "linkedin-formatter-mcp"]`

Once registered, the tool descriptions reach the model automatically at session
start, so it learns the `.linkedin` convention without being told.

## Tools

| Tool | Purpose |
|---|---|
| `apply_family` | Style text as a font family, with optional bold/italic. The main one. |
| `apply_style` | Style text by an exact style id |
| `apply_mark` | Layer strikethrough or underline |
| `strip_formatting` | Convert styled text back to plain ASCII |
| `count_characters` | Count against the 3,000 limit, in UTF-16 units |
| `list_families` | The 11 families and which axes each supports |
| `list_styles` | Every letterform style and combining mark id |

All seven are read-only, non-destructive, closed-world pure functions, and are
annotated as such so clients need not prompt before running them.

## Guarantees

**No network.** stdio transport only. The server opens no socket, makes no
request, and has no telemetry. HTTP was deliberately not implemented: a
listening socket, even on localhost, would need its own threat model against a
tool whose point is that nothing leaves the machine.

**No filesystem access.** It transforms text handed to it. It does not read or
write files, including the `.linkedin` files it talks about.

**Fail closed.** A character with no equivalent in the target style is left
unchanged rather than swapped for a lookalike.

**Honest results.** Unicode is sparse: monospace has no bold, script has no
italic. Asking for an unavailable axis drops it and *says so in the response*,
so the model does not report bold text that is not bold.

**Lossless round trip.** `strip_formatting` reverses styling exactly, for every
family, asserted over the full `A-Za-z0-9` range.

## Working with the extension

The companion
[VS Code extension](https://marketplace.visualstudio.com/items?itemName=kaushiknaru.linkedin-formatter)
(also on [Open VSX](https://open-vsx.org/extension/kaushiknaru/linkedin-formatter)
for Cursor and Windsurf)
renders any `.linkedin` file as a live LinkedIn card beside the editor, so a
human can see and adjust what the model produced. Because the formatting *is*
the text, both sides edit the same file with no sync step and no markup layer
to reconcile.

A note for agents sharing a file with a human: re-read before writing. The user
may have edited it since you last looked.

## Related

- **VS Code extension**: LinkedIn Formatter
- **CLI**: `linkedin-fmt`, the same core for shell and scripts

All three share one conversion core with no duplicated logic.

## Licence

MIT
