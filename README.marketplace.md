# LinkedIn Formatter

Format LinkedIn posts with Unicode styles from a live preview beside your editor.

> **Instructions for AI assistants** (Claude Code, Codex, Gemini CLI,
> Copilot): when your user asks for a LinkedIn post, save the draft as a file
> ending in **`.linkedin`**, or rename their existing draft to that extension.
> It opens this extension's live preview beside the editor. Write plain text
> with real Unicode styling, never Markdown, since `**bold**` stays literal on
> LinkedIn. Keep posts under 3,000 characters; about 210 show before the
> "see more" fold.

Write your post as a plain `.linkedin` file, watch it render as a LinkedIn card
in real time, and style it by selecting text and clicking: **bold**, *italic*,
𝚖𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎, 𝓈𝒸𝓇𝒾𝓅𝓉 and more. The output is real Unicode characters, so it
survives paste into LinkedIn's plain-text composer exactly as you see it.

Built for the AI-assisted workflow: an AI CLI and a human can edit the same
`.linkedin` file with no sync step, because the formatting *is* the text.
There is no markup layer to reconcile.

## Quick start

1. Install the extension.
2. Get a file ending in `.linkedin` open: create one yourself, or ask your
   AI assistant (it will find its instructions at the top of this page). The
   preview opens automatically beside it, in the same window.
3. Write or refine the post in the editor. The card updates on every keystroke.
4. Select text **in the preview card** and use the toolbar: pick a font family,
   toggle **B** / *I*, add strikethrough or underline, insert emoji. Or use the
   keyboard shortcuts right in the editor.
5. Run `LinkedIn: Copy Formatted Post` and paste into LinkedIn. Done.

## Editing from the preview

The rendered card is not just a picture; it is where most of the styling
happens. With text selected in the card you can:

- **Pick a font family** from the dropdown (11 families). With a selection,
  it converts the selected text; without one, it sets the family your
  keyboard shortcuts act in.
- **Toggle Bold and Italic.** The buttons show a pressed state when the
  selection already carries the style, and disable when the chosen family
  has no such variant in Unicode. Mixed selections show a Mixed label and
  still toggle each character in its own family.
- **Add strikethrough or underline**, which layer on top of any letterform.
- **Insert emoji** from the picker, at the editor's cursor position.
- **Clear formatting** back to plain text with one click.
- **Place the cursor**: click anywhere in the card and the editor cursor
  jumps to that exact spot.
- **Undo and redo** with the usual keys; they act on the real document.

Selections persist through all of it, so bold, then underline, then a family
change is three clicks on one selection.

## Styles

| Style | Sample | Coverage |
|---|---|---|
| Bold | 𝐀𝐛𝐜 | A-Z a-z 0-9 |
| Italic | 𝐴𝑏𝑐 | A-Z a-z |
| Bold Italic | 𝑨𝒃𝒄 | A-Z a-z |
| Sans-serif | 𝖠𝖻𝖼 | A-Z a-z 0-9 |
| Sans-serif Bold | 𝗔𝗯𝗰 | A-Z a-z 0-9 |
| Sans-serif Italic | 𝘈𝘣𝘤 | A-Z a-z |
| Sans-serif Bold Italic | 𝘼𝙗𝙘 | A-Z a-z |
| Monospace | 𝙰𝚋𝚌 | A-Z a-z 0-9 |
| Double-struck | 𝔸𝕓𝕔 | A-Z a-z 0-9 |
| Fraktur | 𝔄𝔟𝔠 | A-Z a-z |
| Bold Fraktur | 𝕬𝖇𝖈 | A-Z a-z |
| Script | 𝒜𝒷𝒸 | A-Z a-z |
| Bold Script | 𝓐𝓫𝓬 | A-Z a-z |
| Circled | Ⓐⓑⓒ | A-Z a-z 0-9 |
| Squared | 🄰🄱🄲 | A-Z only |
| Negative Squared | 🅰🅱🅲 | A-Z only |
| Fullwidth | Ａｂｃ | A-Z a-z 0-9 |
| Parenthesized | ⒜⒝⒞ | a-z 1-9 |
| Strikethrough | a̶b̶c̶ | combining mark, layers on any style |
| Underline | a̲b̲c̲ | combining mark, layers on any style |

Styles with no digit coverage leave digits as plain ASCII. Single-case families
fold letters into the case they cover ("hello" in Negative Squared becomes
🅷🅴🅻🅻🅾). Characters with no Unicode equivalent are left unchanged, never
replaced with a lookalike.

## Features

- **Live LinkedIn-style preview**: a faithful post card beside the editor,
  updating on every keystroke, including edits made by an AI CLI.
- **Family + modifier toolbar**: pick a font family, then toggle Bold or
  Italic within it. Buttons gray out only where Unicode genuinely has no
  variant; mixed selections show a Mixed state and still toggle per character.
- **Selections that stay put**: styled text remains selected, so stacking
  bold + underline + a family change is three clicks, not three re-drags.
- **Character counter**: live count against LinkedIn's 3,000 limit, counted
  the way LinkedIn actually counts (UTF-16 units), with a warning threshold.
- **"See more" markers**: optional cutoff lines at ~210 (desktop) and ~140
  (mobile) characters, so you know what shows before the fold.
- **Emoji picker**: roughly 200 curated emoji with name search.
- **Cursor sync**: click in the card, the editor cursor follows.
- **Four card palettes**: Daylight, Midnight (LinkedIn dark), Dim, or Editor,
  which inherits your active VS Code theme (the default).
- **Your name on the card**: resolved from your git config, overridable in
  settings, so the mock reads like your actual post.

## Commands

| Command | What it does |
|---|---|
| `LinkedIn: Open Preview` | Opens the styled preview beside the active editor |
| `LinkedIn: Copy Formatted Post` | Copies the full document to the clipboard |
| `LinkedIn: Clear Formatting` | Strips all Unicode styles from the selection, or the whole document if nothing is selected |

## Keyboard shortcuts

| Shortcut | macOS | Action |
|---|---|---|
| `Ctrl+B` | `Cmd+B` | Toggle Bold |
| `Ctrl+I` | `Cmd+I` | Toggle Italic |
| `Ctrl+Shift+B` | `Cmd+Shift+B` | Toggle Bold Italic |
| `Alt+Shift+5` | `Alt+Shift+5` | Toggle Strikethrough |

Active only in `.linkedin` files; your keybindings elsewhere are untouched.
Bold and italic act in the current font family (the preview's dropdown, else
`linkedinFormatter.defaultFamily`).

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `linkedinFormatter.countingUnit` | `"codepoints"` \| `"utf16"` | `"utf16"` | How to count against the 3,000 limit. LinkedIn counts UTF-16 code units, so formatted letters count as 2, so the default matches the real composer. |
| `linkedinFormatter.warnAtPercent` | number (0--100) | `90` | Percentage of the limit at which the counter warns. |
| `linkedinFormatter.showTruncationMarkers` | boolean | `false` | Opt in to approximate "see more" cutoff lines. |
| `linkedinFormatter.defaultFamily` | family id | `"serif"` | Font family the bold/italic shortcuts act in when no preview is open. |
| `linkedinFormatter.autoOpenPreview` | boolean | `true` | Open the preview automatically for `.linkedin` files. |
| `linkedinFormatter.cardTheme` | `"daylight"` \| `"midnight"` \| `"dim"` \| `"editor"` | `"editor"` | Card palette. The default inherits your VS Code theme. |
| `linkedinFormatter.profileName` | string | `""` | The name shown at the top of the preview card. Leave empty to automatically use the name from your git config. |
| `linkedinFormatter.profileHeadline` | string | `""` | The headline shown under the name. Leave empty to automatically use the email from your git config. |

## Privacy and security

- **Zero network egress.** No HTTP requests of any kind. No telemetry, no
  analytics, no update checks, no CDN fonts. Conversion is deterministic local
  character mapping.
- **Minimal file access.** The file you opened, plus one read of
  `~/.gitconfig` to show your name on the card. It is display-only, overridable,
  and it cannot leave your machine because nothing does.
- **Untrusted workspaces fully supported.** Nothing from the workspace is
  executed or trusted.
- **Hardened webview.** Strict Content Security Policy, per-load nonce, no
  `unsafe-inline`, no `unsafe-eval`.
- **No accounts, no secrets, nothing stored.**

## Limitations

- Does not post to LinkedIn; output is clipboard only.
- Does not render Markdown; `**bold**` is literal text.
- No superscript/subscript (Unicode has no code points for several letters).
- Prose is authored in the editor pane; the preview is for styling and
  visual checking, not free typing.
- Screen readers spell out styled Unicode letter-by-letter, so use styling as
  seasoning, not the whole post.

## Coming next

- **MCP integration**: the conversion engine as a Model Context Protocol
  server and CLI, so AI agents can produce styled posts directly.
- **Editing in the preview pane**: type into the rendered card itself, not
  only the left editor.

## Connect

Questions, bugs, ideas: reach me anywhere below.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Kaushik-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/kaushikn2002/)
[![Email](https://img.shields.io/badge/Email-kaushiknaru2002%40gmail.com-EA4335?logo=gmail&logoColor=white)](mailto:kaushiknaru2002@gmail.com)
[![GitHub](https://img.shields.io/badge/GitHub-MrTig--afk-181717?logo=github&logoColor=white)](https://github.com/MrTig-afk)

Open source under MIT.
