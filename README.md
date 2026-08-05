# LinkedIn Formatter

Format LinkedIn posts with Unicode styles from a live preview beside your editor.

[![Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-install-0A66C2?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=kaushiknaru.linkedin-formatter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Zero egress](https://img.shields.io/badge/network%20calls-zero-success)

## The problem

LinkedIn has no bold button. Every "𝐛𝐨𝐥𝐝" post you have ever seen is a
Unicode trick: those are different characters, not styled ones. So when an
AI CLI drafts your post, you end up prompting it again and again. Make that
word bold. No, the other one. Now undo it. A round trip through a language
model, for one word.

This extension ends that loop. The post lives in a plain `.linkedin` file.
A faithful LinkedIn card renders beside the editor and updates on every
keystroke, whether you typed it or your AI did. Select text in the card,
click bold, and the file now contains the real Unicode characters. Copy,
paste into LinkedIn, done. What you saw is exactly what ships.

## Why a file

Because a file is the one interface humans and AI agents already share.
There is no export step and no sync problem: the Unicode styling IS the
text. Your AI edits the same file you click around in, and the marketplace
listing carries instructions the AI reads so it knows to create `.linkedin`
files on its own.

## What it does

- Live preview card that mirrors LinkedIn's feed, palette-matched to your
  editor theme, with your name pulled from git config
- Full styling from the rendered card itself: select text in the preview,
  pick one of eleven font families, toggle bold or italic, add strikethrough
  or underline, insert emoji, clear formatting, place the cursor with a
  click, undo with the usual keys
- Type directly in the card, like a word processor: styles continue as you
  type, a family or bold picked at the caret latches for the next run,
  Enter carries formatting into the new paragraph, arrows and Home/End
  navigate the wrapped card, Ctrl+Z takes back whole words, and typing over
  a selection replaces it - every keystroke landing in the file as real
  Unicode
- 18 Unicode letterform styles plus two combining marks, with toggles that
  know what Unicode can and cannot do: buttons disable only where no variant
  exists, and selections survive every edit
- A character counter that counts UTF-16 units, because that is how LinkedIn
  actually counts, verified against the real composer
- Zero network egress: no telemetry, no analytics, no requests of any kind,
  enforced by tests and a nonce-locked Content Security Policy

The full user guide (styles table, shortcuts, settings) lives on the
[marketplace listing](https://marketplace.visualstudio.com/items?itemName=kaushiknaru.linkedin-formatter).

## Install

Search **LinkedIn Formatter** in the VS Code Extensions view, or grab it
from the [marketplace](https://marketplace.visualstudio.com/items?itemName=kaushiknaru.linkedin-formatter).
Then create any file ending in `.linkedin` and the preview opens by itself.

## Roadmap

- **A CLI and an MCP server.** The same conversion core exposed to scripts
  and AI agents directly, so an agent connected over MCP can style a post
  and open the preview without ever being taught the file convention.

## Under the hood

The conversion core (`src/lib/`) is pure TypeScript with zero `vscode`
imports: style tables transcribed from the Unicode charts with their
exception tables, an 11-family bold/italic matrix, lossless round-trip
conversion, and fail-closed mapping (a character with no Unicode equivalent
stays unchanged, never a lookalike). It runs headless, which is why the
589-test suite finishes in under a second.

The preview is a hardened webview: strict CSP, per-render nonce, every
message validated at the trust boundary, CSS and JS inlined so a render can
never appear unstyled.

## Contributing

```bash
git clone https://github.com/MrTig-afk/linkedin-formatter
cd linkedin-formatter
npm install
npm run test:unit && npm run lint && npm run build
```

F5 launches the Extension Development Host. Packaging uses the
marketplace-specific readme:

```bash
npx @vscode/vsce package --readme-path README.marketplace.md
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the test gates and the invariants
(zero egress, fail-closed conversion, validated webview messages) that pull
requests must keep intact.

## Connect

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Kaushik-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/kaushikn2002/)
[![Email](https://img.shields.io/badge/Email-kaushiknaru2002%40gmail.com-EA4335?logo=gmail&logoColor=white)](mailto:kaushiknaru2002@gmail.com)

## License

[MIT](LICENSE)
