# Contributing

Thanks for looking at LinkedIn Formatter. The extension is deliberately small:
TypeScript, an esbuild bundle, and zero runtime dependencies. Everything you
need to build and test it is in this repository.

Interested? Fork the repository, make your change on a branch, and send a
pull request. For small fixes, no issue needed first; for bigger changes,
open an issue so we can talk it through before you invest the time.

## Setup

```bash
git clone https://github.com/MrTig-afk/linkedin-formatter
cd linkedin-formatter
npm install
```

Requires Node.js 18+ and VS Code 1.96+.

## Development loop

| Command | What it does |
|---|---|
| `npm run build` | Bundle the extension to `dist/` |
| `npm run test:unit` | Headless unit tests (plain Node, no display needed) |
| `npm run lint` | ESLint over `src` and `test` |
| `npm run test:integration` | Integration tests (launches a real VS Code window) |
| F5 in VS Code | Launch the Extension Development Host with the extension loaded |

For a quick manual check: press F5, create a file with the `.linkedin`
extension, and the preview opens beside it.

## Before opening a pull request

1. `npm run test:unit`, `npm run lint`, and `npm run build` must all pass.
   Run `npm run test:integration` too if your change touches the preview,
   commands, or activation.
2. New behaviour needs a test. Follow the style of `test/unit/html.test.ts`:
   plain `node:test`, one focused assertion set per test, no test framework
   dependencies.
3. Keep diffs minimal and follow the existing style. No new dependencies,
   runtime or dev, without discussing it in an issue first.
4. One logical change per PR, with a short imperative title.

## Invariants, please do not break these

- **Zero network egress.** The extension makes no HTTP request of any kind,
  and the webview's Content Security Policy allows none. Tests enforce this;
  they are not suggestions.
- **The webview is a trust boundary.** Every message from the preview is
  validated in `src/lib/validateMessage.ts` before use. New message types
  need a contract entry, validation, and tests.
- **Conversion is fail-closed.** Characters with no Unicode equivalent in the
  target style stay unchanged. Never emit unassigned code points.
- **`src/lib/` stays free of `vscode` imports.** The conversion core is plain
  TypeScript so it can be reused and tested headlessly.

## Style data

The style tables in `src/lib/styles.ts` and `src/lib/palettes.ts`, and the
family matrix in `src/lib/family.ts`, encode Unicode ranges and their
exceptions. Changes there need a source (the Unicode charts) cited in the PR
description, and the round-trip suite (`test/unit/roundtrip.test.ts`) must
stay green.

## Reporting bugs

Open an issue with: what you typed or clicked, what you expected, what
happened instead, and, if visual, a screenshot of the preview pane. The
extension has no telemetry, so your report is the only way we learn.
