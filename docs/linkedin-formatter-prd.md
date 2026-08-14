# LinkedIn Formatter - Product Requirements

Version 3.0 of this document. Sections S1-S12 and appendices A/E describe v1,
which has shipped (marketplace v1.0.2). Section S7.4 and milestone M4 describe
v2 (two-way preview editing), shipped as marketplace v1.1.0 on 2026-08-06.
Section S7.5 and milestone M5 describe v3, the agent surface (CLI and MCP
server): built on branch `feat/cli` (GitHub issue #3), not yet rebased, merged
or published.

**Provenance.** The original PRD file was lost. S1-S12 and the appendices were
reconstructed on 2026-08-05 from `.claude/project-profile.md` (generated from
PRD v1.2 and citing these section numbers), `README.md`,
`README.marketplace.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and the shipped
source in `src/`. Every enumeration in the appendices was transcribed from the
shipped code, which 534 passing tests assert against, so the appendices are
authoritative rather than remembered. Prose intent was reconstructed and may
differ in wording from the original.

---

## S1. Problem and context

LinkedIn's composer has no formatting controls. Every bold or italic LinkedIn
post is a Unicode substitution: the characters are different code points from
the Mathematical Alphanumeric Symbols block and neighbours, not styled ASCII.

This is invisible to most writers, and tedious for the ones who know. The
common workflow is to ask an AI CLI to produce the post, then re-prompt it
repeatedly to adjust styling ("make that word bold", "no, the other one",
"undo that"). Each adjustment is a round trip through a language model to
achieve a mechanical character substitution.

The writer cannot see the result until it is pasted into LinkedIn, so styling
is done blind and verified by trial.

## S2. Goals

- A writer can see exactly what their post will look like on LinkedIn while
  writing it, and styling is applied by direct manipulation rather than by
  re-prompting.
- What is seen in the preview is character-identical to what LinkedIn renders.
  No export step, no separate "styled" artifact.
- A human and an AI agent can work on the same post with no synchronisation
  layer between them.
- Nothing about the user's post leaves their machine.

## S3. Non-goals

These are deliberately excluded. They are not backlog items unless promoted by
a later PRD revision.

- No AI, LLM or API calls in the product. Conversion is deterministic mapping.
  (The v3 MCP server is called BY a model; it never calls one.)
- No superscript or subscript. Unicode lacks code points for several letters,
  so coverage would be partial and the failure mode confusing.
- No JetBrains, Sublime or browser version.
- No standalone web app.
- No accounts, saved drafts, sync or paid tier. The file is the storage.
- No posting to LinkedIn. Output is clipboard only.
- No Markdown rendering. `**bold**` is literal text.
- No free-text typing in the right pane. Prose is typed in the left editor.
  Cursor sync from right to left IS in scope.

## S4. Users

- **The developer who posts.** Writes in an editor, often with an AI CLI in the
  same window. Wants the post to look right without leaving the editor.
- **The AI agent.** Reads and writes the same file. Needs the styling to be in
  the text itself, because it has no access to a UI layer. As of v3 it styles
  text through MCP tool calls instead of emitting code points from memory, and
  hands the result to the human by saving a `.linkedin` file and opening it in
  VS Code, where the extension's preview appears automatically (S7.5.3).

## S5. Functional requirements

### S5.1 File type and activation

A file ending `.linkedin` is the unit of work. The language id is `linkedin`.
Opening one activates the extension and, by default, opens the preview beside
it. Activation is scoped: `onLanguage:linkedin` and
`onWebviewPanel:linkedinFormatter.preview`, never `*`.

### S5.2 Preview card

A webview beside the editor renders the document as a LinkedIn post card:
header (avatar, name, headline, time), body, reaction cluster, and a
Like/Comment/Repost/Send action bar. The card re-renders on every document
change, including edits made by an external process.

Card width is fixed at 555px to match LinkedIn's feed column.

**The preview follows the active `.linkedin` tab (v3.1).** With several
`.linkedin` files open, the single panel retargets to whichever one is the
active editor; selection and caret state never carry across files, and a
retarget rebuilds the page so the webview's restore state names the right
file. Closing the panel suppresses auto-open for THAT FILE only, for the
rest of the session - viewing a different `.linkedin` file still auto-opens,
which is what keeps the agent workflow (S7.5.3) reliable after a user has
closed an earlier file's card. An explicit `LinkedIn: Open Preview` clears
all suppression. Focusing a non-`.linkedin` editor leaves the panel alone.

### S5.3 Styling from the preview

Selecting text in the rendered card and using the toolbar applies real Unicode
characters to the underlying document.

**S5.3.1 Toolbar model: family plus modifier.** A family dropdown (11 families,
appendix E) plus Bold and Italic axis toggles, plus Strikethrough and Underline
marks, plus emoji insert and clear formatting.

- With a selection, choosing a family CONVERTS the selection, preserving
  whichever axes the target family supports.
- Without a selection, choosing a family sets the active family for subsequent
  keyboard shortcuts.
- An axis button is disabled only when the selection, or the active family
  absent a selection, provably lacks that axis in Unicode.
- A selection spanning several families shows a synthetic "Mixed" dropdown
  entry and disables nothing; toggles then apply per character.

**S5.3.2 Toggle semantics.** Applying a style twice returns the original
characters. Applying a different style replaces rather than layers. Combining
marks layer on top of letterform styles.

### S5.4 Selection persistence

Selection is restored after a style-triggered re-render, best effort via the
offset map, so toggling off does not require re-dragging. It is dropped on a
concurrent external edit. Metadata-only document events, such as auto-save, are
ignored.

### S5.5 Cursor sync

Clicking in the preview card places the caret at the corresponding offset in
the editor. The caret mirror shows only while the editor is focused.

### S5.6 Character counter

Counts against LinkedIn's 3,000-character limit. The counting unit is UTF-16
code units by default, which is what LinkedIn's composer counts (verified
empirically 2026-07-30: 3,000 astral characters pasted produced an overage of
exactly -3,000). A `codepoints` mode remains as an escape hatch.

A warning state appears at a configurable percentage of the limit.

### S5.7 Truncation markers

Optional markers at approximately 210 characters (desktop "see more") and 140
(mobile). Off by default, because the cutoff is approximate.

### S5.8 Keyboard shortcuts

Active only in `.linkedin` files. Family-aware: they toggle axes within the
active family, which is the preview dropdown's state when a panel is open, else
`linkedinFormatter.defaultFamily`.

- `Ctrl+B` / `Cmd+B` - bold axis
- `Ctrl+I` / `Cmd+I` - italic axis
- `Ctrl+Shift+B` / `Cmd+Shift+B` - both axes
- `Alt+Shift+5` - strikethrough

### S5.9 Commands

- `LinkedIn: Open Preview`
- `LinkedIn: Copy Formatted Post` - whole document to clipboard
- `LinkedIn: Clear Formatting` - selection, or whole document if no selection
- Four toggle commands backing the keybindings above

### S5.10 Emoji picker

A curated set of roughly 200 emoji, grouped, with name search. Inserts at the
caret.

### S5.11 Card appearance and identity

Four palettes via `linkedinFormatter.cardTheme`: `daylight`, `midnight`, `dim`,
`editor`. Default `editor`, which inherits the active VS Code theme.

Card identity resolves from `linkedinFormatter.profileName` /
`profileHeadline`, falling back to the name and email in `~/.gitconfig`,
falling back to neutral placeholders. The avatar shows initials.

## S6. Architecture and technical approach

**Stack.** TypeScript, bundled with esbuild. No runtime dependencies.

**The core/host split is the load-bearing decision.** `src/lib/**` contains the
entire conversion core and imports `vscode` nowhere. It is pure data and pure
functions over strings. `src/webview/**` and `src/commands/**` are the VS Code
host layer.

Two consequences follow, and both are requirements:

1. The core's test suite runs headless in plain Node in under a second, so it
   can gate an unattended pipeline run. Extension-host tests need a real VS Code
   window and cannot.
2. The core can be lifted into another host without modification. This is what
   made the v3 agent surface (S7.5) an integration task rather than a rewrite.
   Three hosts now sit over the one core: the extension, the CLI (`src/cli/`)
   and the MCP server (`src/mcp/`), with no duplicated conversion logic.

**The webview is a hardened boundary.** Strict CSP, a per-render nonce,
stylesheet and script inlined into every render rather than fetched from
`vscode-resource` URIs. Inlining is a requirement, not an optimisation: a
separate fetch can lag or fail during rapid re-renders and leave the pane
unstyled.

## S7. Scope by version

### S7.1 v1 - shipped

Everything in S5. Ships as a `.vsix` on the VS Code Marketplace under publisher
`kaushiknaru`. Released as 1.0.0 (2026-08-04), 1.0.1 and 1.0.2 (2026-08-05).

### S7.2 MCP server and CLI - REJECTED (2026-08-05), REVERSED (2026-08-06)

An MCP server and a CLI over the conversion core were scoped as v2, rejected,
and then reinstated as v3 by owner decision after v2 shipped. Both the
rejection and the reversal are recorded so neither is silently revisited.

**What they would have solved.** Language models cannot reliably emit these
code points. Script capital B is U+212C, in Letterlike Symbols, not one past
script A, because the Mathematical Alphanumeric block has holes (appendix A.2).
A model working from memory gets this subtly wrong. The same applies to the
UTF-16 counting rule (S5.6), which no model knows.

**Why rejected anyway.**

1. It solves a problem the owner does not have. The working loop is: the AI
   writes plain prose, the human selects in the card and clicks. No code-point
   guessing happens anywhere in that loop.
2. It contributes nothing to two-way editing (S7.4), which is the feature that
   actually completes the product. The two are entirely orthogonal: one is a
   text transformer, the other is a webview input problem.
3. Handing style selection to an agent weakens the product's premise. The
   value is that a human decides how the post looks.
4. An MCP server would add `@modelcontextprotocol/sdk`, the project's first
   runtime dependency.

**If revisited**, build the CLI first and the MCP server as a thin wrapper over
it. The CLI needs no SDK, no transport, and no per-client configuration
documentation. Do not build the MCP server alone.

**Why reversed (2026-08-06).** The owner reopened the decision after v2
shipped, and each rejection reason has an answer now:

1. Two-way editing (S7.4) shipped as 1.1.0, so this work no longer displaces
   the feature that completed the product.
2. The automatic-preview workflow (S7.5.3) resolves the "weakens the premise"
   objection: the agent styles text, but the result lands in the extension's
   preview card where the human reviews and adjusts by hand. Style authority
   stays with the human; what the agent stops doing is guessing code points.
3. It was built exactly as this section prescribed: CLI first, MCP server as a
   thin wrapper over the same core. The SDK dependency is confined to the
   `mcp` package; the extension still has zero runtime dependencies.

Scope lives in S7.5.

### S7.3 Still deferred

- Nothing further. S7.4 shipped as v2; the agent surface is v3 (S7.5).

### S7.4 v2 - two-way preview editing (SHIPPED as 1.1.0, 2026-08-06)

**Problem.** The preview is currently a one-way render plus a styling surface.
Prose must be typed in the left editor. A user who wants to add a sentence
while looking at the rendered card has to move to the other pane, find the
position, and type there.

**Goal.** Type directly into the rendered card. Text entered on the right
appears in the document on the left, in real Unicode, with the active family
applied.

**In scope for v2:**

- Text entry in the preview card at the caret, including multi-line.
- Deletion and selection replacement from the card.
- Newly typed text takes the active family and axes from the toolbar, so
  typing inside a bold run continues bold.
- Undo and redo integrate with VS Code's undo stack, so `Ctrl+Z` in either
  pane unwinds the same history.
- Paste into the card inserts plain text, converted to the active family.

**Out of scope for v2:** everything in S3. Rich paste (retaining formatting
from the clipboard source) is out; paste is plain.

**v2 acceptance:**

- A character typed in the card appears in the document within one render
  cycle, at the correct offset, in the correct family.
- The caret does not jump on re-render. This is the failure mode that makes an
  editing surface unusable.
- An external edit (an AI CLI writing to the file) while the user is typing
  does not corrupt the document or silently discard either party's input.
- Every existing v1 acceptance criterion in S11 still holds.
- The webview message contract still validates and clamps every offset (S9).
  Typing produces far more messages than styling did; the boundary does not
  get looser because it is busier.

### S7.5 v3 - agent surface: CLI and MCP server (BUILT on `feat/cli`, UNMERGED)

**Problem.** Language models cannot reliably emit these code points (script
capital B is U+212C in Letterlike Symbols, not one past script A, because the
Mathematical Alphanumeric block has holes - appendix A.2), and no model knows
the UTF-16 counting rule (S5.6). An agent asked to style a post from memory
gets it subtly wrong, and the failure renders as an empty box on someone's
phone.

**Goal.** An agent styles a post by calling deterministic tools instead of
guessing, and the human reviews the result in the extension's preview card,
which opens automatically. One prompt takes a draft from plain prose to a
rendered LinkedIn card beside the editor.

State of the work: built on branch `feat/cli` (issue #3), spec-reviewed, 579
tests green on that branch. The branch predates the entire v2 line of work on
`main`; M5.1 (rebase, rerun green) is a hard precondition for everything else.

#### S7.5.1 CLI - `linkedin-fmt`

A single-file, zero-dependency Node CLI (Node >= 18) over the conversion core.
Text comes from the argument or from stdin, so files work by redirection and
commands compose in pipes.

| Command | What it does |
|---|---|
| `style <text>` | Apply a font family, optionally bold and/or italic |
| `mark <text>` | Layer a combining mark (strikethrough, underline) |
| `strip <text>` | Convert styled text back to plain ASCII |
| `count <text>` | Count against LinkedIn's 3,000 limit |
| `families` | List the 11 families and the axes each supports |
| `styles` | List every letterform style and combining mark id |

Flags: `-f/--family <id>` (default `serif`), `-b/--bold`, `-i/--italic`,
`-m/--mark <id>`, `-u/--unit utf16|codepoints` (default `utf16`). Family ids,
style ids and mark ids are exactly the enumerations in appendices A and E -
the CLI invents no new vocabulary.

#### S7.5.2 MCP server - `linkedin-formatter-mcp`

A stdio MCP server over the same core, built on the official
`@modelcontextprotocol/sdk`. Seven tools:

| Tool | Purpose |
|---|---|
| `apply_family` | Style text as a family with optional bold/italic. The main one. |
| `apply_style` | Style text by exact style id |
| `apply_mark` | Layer strikethrough or underline |
| `strip_formatting` | Styled text back to plain ASCII |
| `count_characters` | Count against the 3,000 limit in UTF-16 units |
| `list_families` | The 11 families and their axes |
| `list_styles` | Every letterform style and combining mark id |

The following are requirements, not implementation notes. They follow the MCP
specification and Anthropic's published server conventions, and the tests
assert them:

- **Transport is stdio only.** No HTTP, no listening socket, even on
  localhost (S9). stdout carries nothing but JSON-RPC; diagnostics go to
  stderr, because anything non-protocol on stdout corrupts the stream.
- **Tool names are snake_case verb phrases** and stable across releases.
- **Tool descriptions are the discovery surface.** They are injected into the
  model's context at session start and are the only way an assistant learns
  the `.linkedin` convention, so each one says WHEN to call the tool, not just
  what it does. A vague description makes the tool effectively undiscoverable.
- **Annotations are accurate and complete** on every tool: `readOnlyHint:
  true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint:
  false`. All seven tools are pure functions over strings, and the hints say
  so, so clients never prompt a user to confirm a call that cannot alter
  anything. An inaccurate hint is a bug of the same severity as a wrong code
  point.
- **The tool list is static** and declared in a fixed order, and
  `capabilities.tools.listChanged` is `false` - the server never emits a
  list-changed notification, and declaring otherwise would be a promise it
  does not keep. Fixed order keeps client-side prompt caching intact.
- **The `instructions` field carries the workflow** (S7.5.3). It is the
  second, tool-independent route by which the convention reaches the model.
- **The `instructions` field also carries styling judgment.** The realistic
  prompt is "write me a post, make it look good", not a styling spec, and a
  third-party agent has only these instructions to go on. One or two
  sentences of taste: style for emphasis, not decoration - bold the hook and
  the few load-bearing phrases, keep body text plain, one family per post,
  and never style an entire paragraph. Enough that an unprompted agent
  produces something a human would post, not a ransom note.
- **Families carry roles, not just axes.** `list_families` and the guidance
  give each family a one-line WHEN: serif bold/italic for emphasis in body
  text (the default workhorse), sans-serif bold for the hook and headers,
  monospace for versions, commands and code, script as a sparing flourish or
  sign-off. The remaining families (fraktur, double-struck, circled, squared,
  negative-squared, fullwidth, parenthesized) are marked as human-choice
  novelties an agent uses only on explicit request. They stay in the tool
  surface regardless: `strip_formatting` must reverse anything a person
  pastes in, and the extension dropdown offers all 11 to the human.
- **Error semantics follow the spec's split.** An unknown tool name is a
  protocol error (`McpError`, `InvalidParams`) because the model cannot fix it
  by retrying with different arguments. Bad arguments to a known tool return
  `isError: true` in a normal result with a readable message, so the model
  reads it and corrects itself. The server never crashes on bad input.
- **The first content block is pure data** a model can pipe onward.
  Commentary (dropped axes, warnings) rides in a separate `note:` block.
- **Results are honest.** Unicode is sparse: monospace has no bold, script no
  italic. A requested-but-unavailable axis is dropped AND stated in the
  response, so the model never reports bold text that is not bold.

#### S7.5.3 Automatic preview - the workflow contract

This is the piece that connects the agent surface back to the product. Steps 1
and 3-5 are stated in the server's `instructions` as two UNCONDITIONAL RULES,
not as stages of a workflow: ask before styling, and finish at the preview.
Both bind on a single styled line as much as on a whole post, because an agent
that reads them as workflow steps skips them for anything smaller. The order
below is what a whole post looks like:

1. Draft the prose, then OFFER THREE STYLING TIERS before applying anything:
   **minimal** (plain text, bold hook only), **balanced** (bold hook,
   sans-serif-bold headers, sparing serif-bold emphasis - the default), and
   **pizzazz** (a deliberate mixture: script flourish, monospace details,
   marks). Present them through the client's native option picker where one
   exists, else as a plain numbered list in chat. The tier is a starting
   point, not a commitment - the human restyles by hand in the card either
   way. The tiers are described in plain words and shown as rendered sample
   lines, never as bare family names - a tier name means nothing to a user who
   has not seen it. The real purpose is discovery: every user learns the font
   options exist, even the one who always picks minimal.
2. Apply the chosen tier with the tools and check `count_characters`.
3. Save the result to a file ending `.linkedin`.
4. Open that file in VS Code (for example `code draft.linkedin`). The
   extension activates on the language id and, with `autoOpenPreview`
   defaulting to true (S8.4), the LinkedIn card renders beside the editor
   with no further action. The agent gives the user the preview, not just
   raw styled text. Styled text returned into the conversation is not a
   preview and the agent never describes it as one; it reports a preview only
   when it actually wrote the file and opened it.
5. If the preview does not appear, the extension is not installed. The agent
   OFFERS `code --install-extension kaushiknaru.linkedin-formatter` and lets
   the human decide. An agent never installs anything without asking.

Two boundaries keep this clean:

- The workflow is carried as instructions the AGENT executes with its own
  tools. The MCP server itself never opens a file, spawns a process or touches
  the filesystem; it stays a pure text transformer (S9).
- The `.linkedin` file is shared ground. Instructions tell agents to re-read
  the file before writing, because the human may have edited it in the card
  since the agent last looked.

#### S7.5.4 Packaging

- Two npm packages, each a single bundled file plus README: `cli/` publishing
  `linkedin-fmt`, `mcp/` publishing `linkedin-formatter-mcp`, both currently
  `private: true` (Q7). Built by `cli-build.js` / `mcp-build.js`; Node >= 18;
  MIT.
- `@modelcontextprotocol/sdk` is the project's first runtime dependency and is
  confined to the MCP bundle. The extension's manifest is untouched and keeps
  zero runtime dependencies.
- Neither package ships inside the `.vsix`. This leak actually happened and
  was caught by the pre-publish security review at 1.1.0; `vsce ls` before
  every package remains mandatory (S9).

#### v3 acceptance

- All seven tools respond over stdio to a real MCP client
  (`mcp/e2e-check.js` passes).
- Round trip through the server is lossless: `apply_family` then
  `strip_formatting` returns the input, for the complete `A-Za-z0-9` string,
  for every family.
- An unavailable axis is dropped and reported in the response text.
- `count_characters` agrees with the S5.6 UTF-16 rule.
- **The one-prompt demo runs.** From a single user prompt, an agent registered
  with the server produces a styled `.linkedin` file and the preview opens in
  VS Code. Run by the owner and observed, not just claimed. This has never
  been run and is the acceptance risk (M5.2).
- The tools are covered headless without starting a server
  (`test/unit/mcp.test.ts`, `test/unit/cli.test.ts`), and the unit suite
  stays in plain Node at roughly a second.
- The server opens no socket, reads no file, writes no file, spawns no
  process.

## S8. Data model

No database. No persisted state beyond the file itself.

**Entities:** the post buffer (a `TextDocument` string), style, combining mark,
selection range.

**Style shape:**

```
{
  id: string,
  label: string,
  upperBase: number | null,
  lowerBase: number | null,
  digitBase: number | null,
  exceptions: Map<char, codepoint>,
  coverage: 'full' | 'upperOnly' | 'lowerOnly'
}
```

**Combining mark shape:** `{ id, label, codepoint }`

**Family slots shape:** `{ regular, bold, italic, boldItalic }`, where each
value is a style id, `'plain'`, or `null` when Unicode has no such variant.

**S8.3 Decomposition map.** The style-id to (family, bold, italic) map is built
at load time by inverting `FAMILY_MATRIX`, never maintained by hand.

**S8.4 Settings.**

| Setting | Type | Default |
|---|---|---|
| `linkedinFormatter.countingUnit` | `codepoints` \| `utf16` | `utf16` |
| `linkedinFormatter.warnAtPercent` | number 0-100 | 90 |
| `linkedinFormatter.showTruncationMarkers` | boolean | false |
| `linkedinFormatter.autoOpenPreview` | boolean | true |
| `linkedinFormatter.cardTheme` | daylight \| midnight \| dim \| editor | `editor` |
| `linkedinFormatter.profileName` | string | `""` |
| `linkedinFormatter.profileHeadline` | string | `""` |
| `linkedinFormatter.defaultFamily` | one of the 11 family ids | `serif` |

## S9. Security and privacy

**Egress. Nothing leaves the machine.** No HTTP of any kind, no telemetry, no
analytics, no update checks, no font CDNs. This is enforced by tests and by a
nonce-locked CSP, not by intent. A future feature needing a network call is a
PRD decision, not an implementation detail.

**File access** is limited to: the `TextDocument` the user opened, the
extension's own `media/` files (inlined into the webview), and one read of
`~/.gitconfig` for the card's display identity. That read is a fixed path in
the home directory, wrapped in try/catch, display-only, HTML-escaped, and
disclosed in the README. No workspace scanning, no directory walking.

**Trust boundaries.**

- **Webview `postMessage`.** Carries style requests with document offsets.
  Validate message shape, validate offsets fall within the document, clamp
  before building a `WorkspaceEdit`. A malformed offset is rejected, never
  applied.
- **Post content rendered into webview HTML.** Escaped. A post containing
  `<script>` is ordinary user text and renders as text.
- **Workspace.** No workspace configuration is read and nothing from the
  workspace is executed, so `capabilities.untrustedWorkspaces.supported` is
  `true`. That property must stay honest.

**Fail closed.** A character with no Unicode equivalent is left unchanged.
Never substitute a visually similar guess.

**Cost surfaces: none.** There are no paid calls anywhere in this project. A
task that appears to introduce one is a non-goal violation.

**v3 surfaces (S7.5) inherit the egress rule.** The CLI reads argv/stdin and
writes stdout. The MCP server speaks JSON-RPC over stdio and nothing else: no
listening socket (HTTP was deliberately not implemented - even localhost would
need its own threat model), no telemetry, no filesystem access, including the
`.linkedin` files its instructions mention. Opening the preview is the agent's
action, never the server's. Untrusted input enters as tool arguments: validate
shape, return bad arguments as `isError: true` results rather than crashing,
and never pass them to a shell. `@modelcontextprotocol/sdk` is the only
runtime dependency and lives only in the MCP bundle.

**Packaging.** `.gitignore` and `.vscodeignore` are separate lists and must
both be checked. A file excluded from git can still ship inside the `.vsix`.
Run `vsce ls` before publishing and read the output.

## S10. Success metrics

No numeric targets are set. The project is a personal tool published publicly;
install counts are observed, not targeted.

The one behavioural check that matters: a post authored in the extension pastes
into LinkedIn's composer and renders identically to the preview. If that breaks,
nothing else matters.

## S11. Acceptance

- **Round trip is lossless.** `plain -> styled -> plain == plain`, asserted over
  the complete `A-Za-z0-9` string for every style, not a sample word.
- **Toggle is exact.** Applying a style twice returns the original characters.
- **Paste fidelity.** A post pastes into LinkedIn and renders identically to the
  right pane.
- **Fail closed.** Unmappable characters pass through unchanged.
- **The core suite runs headless** in plain Node in under a second.
- **The agent surface is honest (v3).** A tool call requesting an unavailable
  axis drops it and says so in the response.
- **One prompt to preview (v3).** A single agent prompt yields a styled
  `.linkedin` file whose card renders in VS Code (S7.5.3).

## S12. Milestones

M0-M3 shipped as v1. M4 shipped as v2 (1.1.0, 2026-08-06).

- **M0.** Conversion core: style tables, exception tables, round-trip suite.
- **M1.** Preview render: language contribution, hardened webview, card layout.
- **M2.** Style application: message contract, toolbar, mark layering, cursor sync.
- **M3.** Counter, truncation markers, emoji picker.
- **M4 (v2, shipped 1.1.0).** Two-way preview editing (S7.4).

  Sequenced to de-risk the caret, which is the hard part. In order:

  - **M4.1 - one character.** A single printable character typed in the card
    reaches the document at the right offset. No families, no deletion, no
    selection. This proves the input path and the offset mapping.
  - **M4.2 - caret stability.** The caret survives the re-render that its own
    keystroke triggered. This is the make-or-break slice: if the caret jumps,
    the feature is unusable no matter what else works. Worth building the
    throwaway test harness here rather than discovering it in M4.4.
  - **M4.3 - deletion and selection replacement.** Backspace, delete, and
    typing over a selection.
  - **M4.4 - family inheritance.** Typed text takes the toolbar's active
    family and axes; typing inside a bold run continues bold.
  - **M4.5 - undo integration and concurrent external edits.** `Ctrl+Z` in
    either pane unwinds one shared history; an AI CLI writing to the file
    mid-keystroke corrupts nothing.

  M4.2 is the risk. If caret stability cannot be made reliable, the honest
  outcome is to stop and keep the preview one-way, rather than ship an editing
  surface that fights the user.

- **M5 (v3, built on `feat/cli`, unmerged).** Agent surface: CLI and MCP
  server (S7.5). The code exists; the milestone is integration, proof and
  publish, sequenced so the never-run end-to-end check comes before any
  irreversible step.

  - **M5.1 - rebase and green.** Rebase `feat/cli` onto `main`, which moved
    through the entire 1.1.0 release since the branch was cut. Rerun the full
    suite on the rebased branch. Nothing else happens before this passes.
  - **M5.2 - one-prompt demo.** Register the server with a real client, ask
    an agent for a styled post, watch the `.linkedin` file appear and the
    preview open. This is the acceptance risk: it has never been run.
  - **M5.3 - merge.** Security review (the pre-publish gate has caught a
    packaging leak both times it ran), then `--no-ff` into `main`.
  - **M5.4 - publish.** Resolve Q7 and Q8, flip `private`, npm publish both
    packages, Open VSX for the extension if Q8 says yes. Close issue #3.

## S13. Open questions

Each has a recommendation. None may be silently resolved by an implementer.

**Q1. How is text entry captured in the webview?**
The two candidates are a `contenteditable` body, or a hidden input/textarea
overlaid on the card with the visible text rendered beneath it.
Recommendation: hidden input. `contenteditable` gives the browser authority
over the DOM, and this card's DOM is generated per render from offset spans;
letting the browser mutate it puts two writers on the same structure. A hidden
input keeps rendering one-way and treats keystrokes as pure intent.

**Q2. Does typing re-render the whole card on every keystroke?**
Today every document change rebuilds the card HTML. At typing speed that is a
full rebuild per character. Recommendation: measure before optimising, but
expect to need incremental update of the affected span only. Note this
interacts with Q1: a hidden input makes targeted updates easier.

**Q3. What happens when an external edit lands mid-keystroke?**
An AI CLI writing to the file while the user types is an ordinary situation for
this product, not an edge case. Recommendation: the document is the single
source of truth and external edits win; the pending keystroke is re-applied
against the new text if its offset still resolves, and dropped if it does not.
Never merge silently in a way that reorders the user's characters.

**Q4. Does typed text inherit the family, or arrive plain?**
Recommendation: inherit the toolbar's active family and axes. Typing inside a
bold run and getting plain text would be surprising. This does mean the active
family becomes load-bearing state rather than a convenience.

**Q5. Should `docs/` remain gitignored? RESOLVED.**
Resolved as recommended: `docs/linkedin-formatter-prd.md` is tracked on `main`.

**Q7. npm package names and publish timing.**
Both packages are `private: true` under the names `linkedin-fmt` and
`linkedin-formatter-mcp`. Recommendation: keep both names (confirm
availability on the registry at publish time, since it cannot be verified from
here), and publish the two together in the same session right after M5.2 and
the security review pass - each README references the other, so a solo publish
ships dangling links. Owner decision.

**Q8. Publish the extension to Open VSX?**
The extension is Marketplace-only today, but Cursor and Windsurf users - the
likeliest audience for an MCP-driven workflow - install extensions from Open
VSX, so for them S7.5.3 step 4 currently dead-ends. Recommendation: yes,
publish to Open VSX as part of M5.4. Owner decision.

**Q6. IME and composed input.**
Dead keys, IME candidate windows, and emoji pickers all produce composition
events rather than plain keystrokes. Recommendation: handle `compositionstart`
/ `compositionend` and only commit to the document on composition end.
Untested assumption: that this is sufficient. Worth proving in M4.1 rather than
discovering in M4.4.

---

## Appendix A - Unicode tables

**Transcribed from the shipped source. Copy verbatim. Do not derive, infer, or
reconstruct any code point.**

Totals: **18 letterform styles** (13 in A.1, 5 in A.3) and **2 combining
marks** (A.4).

### A.1 Mathematical alphanumeric styles (13)

| id | label | upperBase | lowerBase | digitBase | coverage |
|---|---|---|---|---|---|
| `bold` | Bold | 0x1D400 | 0x1D41A | 0x1D7CE | full |
| `italic` | Italic | 0x1D434 | 0x1D44E | null | full |
| `bold-italic` | Bold Italic | 0x1D468 | 0x1D482 | null | full |
| `script` | Script | 0x1D49C | 0x1D4B6 | null | full |
| `bold-script` | Bold Script | 0x1D4D0 | 0x1D4EA | null | full |
| `fraktur` | Fraktur | 0x1D504 | 0x1D51E | null | full |
| `double-struck` | Double-struck | 0x1D538 | 0x1D552 | 0x1D7D8 | full |
| `bold-fraktur` | Bold Fraktur | 0x1D56C | 0x1D586 | null | full |
| `sans-serif` | Sans-serif | 0x1D5A0 | 0x1D5BA | 0x1D7E2 | full |
| `sans-serif-bold` | Sans-serif Bold | 0x1D5D4 | 0x1D5EE | 0x1D7EC | full |
| `sans-serif-italic` | Sans-serif Italic | 0x1D608 | 0x1D622 | null | full |
| `sans-serif-bold-italic` | Sans-serif Bold Italic | 0x1D63C | 0x1D656 | null | full |
| `monospace` | Monospace | 0x1D670 | 0x1D68A | 0x1D7F6 | full |

### A.2 Exception tables

Four styles have unassigned gaps in their contiguous range and need exception
tables. These are letters that live outside the block, in Letterlike Symbols.

**italic:** `h` -> 0x210E

**script (11):** `B` 0x212C, `E` 0x2130, `F` 0x2131, `H` 0x210B, `I` 0x2110,
`L` 0x2112, `M` 0x2133, `R` 0x211B, `e` 0x212F, `g` 0x210A, `o` 0x2134

**fraktur (5):** `C` 0x212D, `H` 0x210C, `I` 0x2111, `R` 0x211C, `Z` 0x2128

**double-struck (7):** `C` 0x2102, `H` 0x210D, `N` 0x2115, `P` 0x2119,
`Q` 0x211A, `R` 0x211D, `Z` 0x2124

### A.3 Non-math palettes (5)

| id | label | upperBase | lowerBase | digitBase | coverage |
|---|---|---|---|---|---|
| `circled` | Circled | 0x24B6 | 0x24D0 | null | full |
| `squared` | Squared | 0x1F130 | null | null | upperOnly |
| `negative-squared` | Negative Squared | 0x1F170 | null | null | upperOnly |
| `fullwidth` | Fullwidth | 0xFF21 | 0xFF41 | 0xFF10 | full |
| `parenthesized` | Parenthesized | null | 0x249C | null | lowerOnly |

**circled digits are an exception table, not an offset.** Circled digits start
at circled ONE (0x2460), and circled zero (0x24EA) is out of sequence:
`0` 0x24EA, `1` 0x2460, `2` 0x2461, `3` 0x2462, `4` 0x2463, `5` 0x2464,
`6` 0x2465, `7` 0x2466, `8` 0x2467, `9` 0x2468

**parenthesized digits (no zero exists):** `1` 0x2474, `2` 0x2475, `3` 0x2476,
`4` 0x2477, `5` 0x2478, `6` 0x2479, `7` 0x247A, `8` 0x247B, `9` 0x247C

**Coverage limits are correct, not fallbacks.** Squared and negative squared
are uppercase only. Parenthesized is lowercase only with no zero. A style with
no digit row leaves digits as plain ASCII.

### A.4 Combining marks (2)

| id | label | codepoint |
|---|---|---|
| `strikethrough` | Strikethrough | 0x0336 |
| `underline` | Underline | 0x0332 |

The mark is inserted after each non-whitespace, non-combining-mark character.
Iteration is by code point so surrogate pairs survive.

---

## Appendix E - Family and axis matrix

The 11 families, in dropdown order, and the style id each (family, bold,
italic) combination resolves to. `null` means Unicode has no such variant and
the axis button is disabled.

| family | label | regular | bold | italic | boldItalic |
|---|---|---|---|---|---|
| `serif` | Serif | `plain` | `bold` | `italic` | `bold-italic` |
| `sans-serif` | Sans-serif | `sans-serif` | `sans-serif-bold` | `sans-serif-italic` | `sans-serif-bold-italic` |
| `script` | Script | `script` | `bold-script` | null | null |
| `fraktur` | Fraktur | `fraktur` | `bold-fraktur` | null | null |
| `monospace` | Monospace | `monospace` | null | null | null |
| `double-struck` | Double-struck | `double-struck` | null | null | null |
| `circled` | Circled | `circled` | null | null | null |
| `squared` | Squared | `squared` | null | null | null |
| `negative-squared` | Negative squared | `negative-squared` | null | null | null |
| `fullwidth` | Fullwidth | `fullwidth` | null | null | null |
| `parenthesized` | Parenthesized | `parenthesized` | null | null | null |

The `serif` regular slot is `plain`: unstyled ASCII IS the serif regular face.
There is no separate code point range for it.
