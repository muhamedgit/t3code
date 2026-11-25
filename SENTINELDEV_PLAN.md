# SentinelDev — build plan (personalized T3 Code fork)

> **Audience:** the Claude (or dev) who will implement this inside this repo.
> **Status:** plan only — nothing below is built yet. Author: repo owner (`muhamedgit`).
> **Source:** fork of [`pingdotgg/t3code`](https://github.com/pingdotgg/t3code) (MIT) → `muhamedgit/t3code`.
> Clone is already down at `C:\Users\Muhamed\t3code`; the `muhamedgit` fork exists.

This plan is grounded in the real codebase (explored 2026-11-25). Paths and module names
below are actual, not guesses. Read **AGENTS.md**, **CONTRIBUTING.md**,
`docs/operations/00_development.md`, and `docs/internals/01_architecture.md` before writing code.

---

## 1. Locked spec (what the owner decided)

| Area                  | Decision                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Product name**      | **SentinelDev** (rebrand required by trademark policy — see §3)                                                                       |
| **Scrum scope**       | Kanban (Todo / Doing / Done / Blocked) **+ sprints + backlog**. **No story points.**                                                  |
| **Ticket fields**     | title, description, status/column, sprint-or-backlog, priority, labels, linked thread(s) + PR(s)                                      |
| **Agent integration** | Full **CRUD via MCP tools** (create / edit / move / link) — agent "communicates through" tickets                                      |
| **Storage / sync**    | Ride T3's **existing event-sourced backend** → projections + contract subscriptions = auto cross-device sync (desktop / web / mobile) |
| **UI placement**      | Fits T3's layout: **full board view (route)** + **compact board pane (right panel)**; mobile gets its own layout                      |
| **Theme**             | Keep Nightly dark base, add a **VS Code–style blue accent**                                                                           |
| **Defaults**          | New threads default to **Claude — Opus**; **project templates**; **auto-create a board per new project**; sensible first-run presets  |
| **Delivery**          | Feature branches → PRs into `muhamedgit/t3code`. Unofficial fork, clearly marked.                                                     |

---

## 2. Ground rules (from AGENTS.md — non-negotiable)

- **Effect-TS throughout.** Schemas via `effect/Schema`; server logic as Effect services; MCP tools
  via `effect/ai/Tool` + `effect/ai/Toolkit`. Match the existing `issues`/`pullRequests` toolkits.
- **Hit every surface.** A feature isn't done until it works on **web + desktop + mobile**, and
  through the right **entry points** (board view, command palette, keybindings, settings). Shared
  client logic lives in `packages/client-runtime`, wire types in `packages/contracts`.
- **Agent-triggerable = service method.** Anything the agent can do must be a **service method
  reachable by MCP tools and scheduled tasks**, never inline handler code.
- **Reverse states.** Every way in needs a way out and a way to see it (archive/unarchive a ticket,
  close/reopen a sprint, move back a column). A one-way door is a bug.
- **Performance is a feature.** Subscriptions send only the state a client needs. Don't flood the
  websocket; don't animate in a way that spikes the GPU. Keep board lists cheap to render.
- **YAGNI (Theo's note).** Smallest model that makes correct behavior unsurprising. No story
  points, no burndown, no velocity until asked. Fight scope creep.
- **Don't hurt the live install.** Never `pkill -f` / kill-by-pattern. Never start a server against
  or open read-write `~/.t3/userdata` (the owner's real DB). Never bake `VITE_HTTP_URL`/`VITE_WS_URL`.
- **i18n.** User-facing copy goes in `apps/{web,mobile}/src/i18n/translations` (+ `vp run i18n:check`).

### Gates (run before every PR)

```bash
pnpm tc            # typecheck (vp run -r typecheck)
pnpm lint          # vp lint
pnpm build         # vp run --filter './apps/*' build
pnpm knip          # dead-code / unused deps
pnpm vitest        # (per-package) unit tests — pattern: *.test.ts beside source
vp run i18n:check  # translations complete
```

Seed a dev DB with `vp run migrate-dev-db`; run the app with `pnpm dev` (web+server) or
`pnpm dev:desktop`. See `docs/operations/00_development.md` and `docs/internals/15_testing.md`.

---

## 3. Rebrand to SentinelDev (Phase 0 — do first)

The MIT license covers **source only**, not T3's name/wordmark/logos/icons. A public fork **must**
rebrand and be marked unofficial (README §Trademarks, `TRADEMARK.md`). Branding is injected, so this
is mostly config, not a global string-replace:

- **Display name.** `apps/web/src/branding.ts` resolves `APP_BASE_NAME` from injected
  `DesktopAppBranding` (contract `packages/contracts/*` — find `DesktopAppBranding`), defaulting to
  `"T3 Code"`. Set the injected branding (desktop bridge `getAppBranding()`) + the web default to
  **"SentinelDev"**. Also `apps/desktop/src/app/DesktopEnvironment.ts` (`APP_BASE_NAME`) and
  `apps/desktop/package.json` (`productName: "T3 Code (Beta)"` → `"SentinelDev"`, and `name`).
- **User-facing strings.** ~dozens of `"T3 Code"` literals in `apps/desktop/src/app/*` (startup/CLI
  messages). Grep `grep -rn "T3 Code" apps packages --include=*.ts --include=*.tsx` and replace the
  **user-visible** ones; leave internal pkg names (`@t3tools/*`) alone.
- **Icons.** `assets/prod/*`, `assets/dev/*`; regenerate with `scripts/export-brand-icons.ts`
  (`pnpm icons:export`, verify `pnpm icons:check`) and `export-android-icons.ts`. Supply SentinelDev
  app icons (keep the current silhouette if you like, new mark/colors).
- **Marketing/app-store identifiers** (`apps/marketing`, `apps/mobile` bundle ids) — only if you
  publish; for personal use, leave bundle ids but change display names.
- **"Unofficial" notice** in the fork README + About screen.

**Theme / VS Code blue accent.** T3 already imports VS Code themes
(`apps/web/src/vscodeThemeImport.ts`, `openVsxThemes.ts`) and defines palettes in
`packages/shared/src/themePalettes.ts` + `themeCss.ts` (web mirror: `apps/web/src/themePalette.ts`,
`themeCss.ts`, `themeBackground.ts`). Add a **"SentinelDev Dark"** palette = current Nightly dark
base with accent swapped to VS Code blue (`#007ACC` family; active/hover `#1177BB`/`#0E639C`). Set it
as the default theme in first-run presets (Phase 5). Keep it a selectable theme, not a hard override.

_Acceptance:_ app launches titled **SentinelDev**, taskbar/tab icon is the new mark, default theme is
the blue-accent dark, no visible "T3 Code" strings, README marks it unofficial. `pnpm icons:check` green.

---

## 4. Repo map (where things live)

```
apps/
  server/    ← owns providers, git, DURABLE STATE. Event-sourced orchestration.
    src/orchestration-v2/   Orchestrator (decides events, no I/O), EventSink (commits
                            events+projections+outbox in one tx), EffectWorker (side effects),
                            EventStore, ThreadIssueService, *Reactor.ts, *Service.ts
    src/issue/IssueService.ts         existing issue service (read-mostly, external trackers)
    src/mcp/McpHttpServer.ts          ← registers MCP toolkits
    src/mcp/toolkits/{issues,pullRequests,project,thread,...}/{tools.ts,handlers.ts}
    src/project/ProjectService.ts
  web/       ← Vite/React renderer (desktop reuses it). routes/, components/, state/,
             rightPanelStore.ts + rightPanelLayout.ts (RIGHT PANEL), command palette,
             modelSelection.ts, providerModels.ts, branding.ts, theme*.ts
  desktop/   ← Electron shell (bundles server). branding + packaging.
  mobile/    ← React Native (own layout/nav; docs/internals/11,12).
  marketing/
packages/
  contracts/ ← TYPED WIRE BOUNDARY (server↔clients). Already has: issue.ts, milestones.ts,
             threadTags.ts, threadPullRequest.ts, threadMetadataMcp.ts, project.ts,
             orchestrationV2.ts, orchestratorMcp.ts, settings.ts, model*.ts, sourceControl.ts
  client-runtime/ ← shared domain state across web/desktop/mobile (subscriptions, reconnect)
  shared/    ← themePalettes.ts, themeCss.ts, t3McpToolPresentation.ts
  issue-tracker-linear/ ← pattern for an EXTERNAL tracker driver (reference only)
```

**Key insight:** the existing `issue.ts` contract + `issues` MCP toolkit are oriented to _external_
trackers (Linear etc.), keyed by URL/number, read-mostly. SentinelDev's board is a **new, native,
writable** domain. **Do not overload the external-issue model.** Add a parallel **`board`** domain,
reusing the thread/PR-link patterns (`threadPullRequest.ts`, `ThreadIssueLinkSource`) for linking.

---

## 5. Data model (new contract: `packages/contracts/board.ts`)

Effect Schema. Keep it minimal (YAGNI):

```ts
BoardId, SprintId, TicketId            // branded ids (follow baseSchemas.ts)
TicketStatus = "todo" | "doing" | "done" | "blocked"
TicketPriority = "none" | "low" | "medium" | "high" | "urgent"

Sprint   { id, boardId, name, startsAt?, endsAt?, state: "planned"|"active"|"closed", order }
Ticket   { id, boardId, key (e.g. SENT-12), title, description?, status, priority,
           labels: string[], sprintId: SprintId | null (null = backlog),
           order (within column/backlog), links: { threads: ThreadId[], pullRequests: PrRef[] },
           createdAt, updatedAt, archivedAt? }
Board    { id, projectId, name, nextKeySeq }
BoardState (projection a client subscribes to): board + sprints + tickets, trimmed per view
```

- One board **per project** (`projectId`), matching "auto-create a board per project".
- `key` is a human handle (`SENT-1`, `SENT-2`…) from `nextKeySeq` for agent/UI reference.
- Linking reuses existing thread/PR link plumbing; a ticket records thread ids + PR refs, and the
  reverse (thread → its tickets) is derivable for the thread surface.

---

## 6. Phased implementation

Each phase is shippable and crosses all required surfaces for what it introduces.

### Phase 1 — Backend domain + sync (no UI yet)

- `packages/contracts/board.ts` — schemas above + RPC/subscription definitions (mirror how
  `issue.ts`/`milestones.ts` expose state + the `orchestrationV2.ts` command/event shapes).
- `apps/server/src/orchestration-v2/` — add a **Board aggregate**: events
  (`BoardCreated`, `TicketCreated`, `TicketUpdated`, `TicketMoved`, `TicketLinked`,
  `TicketArchived`, `SprintCreated`, `SprintStateChanged`), a projection, and a `BoardService`
  with methods for every operation. Decide events with **no I/O** in the Orchestrator; persist via
  **EventSink**; any side effects go through the **EffectWorker/outbox**. Add a DB migration for the
  projection table(s) (`apps/server/scripts` / existing migration mechanism).
- Subscriptions send trimmed `BoardState` (don't ship the whole backlog to a pane that shows a
  sprint). Respect the event replay-window note in `01_architecture.md` — keep events decodable.
- **Tests:** aggregate decision tests (events in → events out), projection tests, a round-trip
  through EventSink like `EventSink.test.ts` / existing `*.test.ts` siblings.
- _Acceptance:_ create board + tickets + sprint via a test/dev RPC; second connected client sees the
  change live; restart replays projection.

### Phase 2 — Agent MCP toolkit (`apps/server/src/mcp/toolkits/board/`)

- `tools.ts` + `handlers.ts` modeled on `toolkits/issues/` (which depends on `IssueService`,
  `Orchestrator`, `ProjectService`, `ThreadIssueService`). Tools (all backed by `BoardService`):
  `board_list` (current project or named), `ticket_create`, `ticket_update`, `ticket_move`
  (status/sprint/order), `ticket_link` (thread/PR), `ticket_archive`, `sprint_create`,
  `sprint_set_state`. Default target = the caller's thread's project (same ergonomics as
  `IssueTargetInput`).
- Register the toolkit in `apps/server/src/mcp/McpHttpServer.ts` alongside the others.
- Presentation entries in `packages/shared/src/t3McpToolPresentation.ts`.
- **Tests:** `handlers.test.ts` mirroring `toolkits/issues/handlers.test.ts`.
- _Acceptance:_ an agent thread can create/move/link a ticket; it appears on all clients instantly.

### Phase 3 — Web UI (desktop inherits)

- **Full board view:** new route under `apps/web/src/routes` (regenerate `routeTree.gen.ts` via the
  router codegen). Columns Todo/Doing/Done/Blocked; sprint switcher + Backlog; drag to move
  (cheap DnD — mind perf); filter by priority/label; ticket card shows key, title, priority,
  labels, linked-thread/PR chips. Click a chip → open that thread/PR (reuse `linkedThreadSurface.ts`,
  `sourceControlPresentation.tsx`).
- **Compact pane:** a right-panel entry via `rightPanelStore.ts`/`rightPanelLayout.ts` showing the
  active project's current-sprint board beside a thread. Open/close is a reverse-state pair.
- **Entry points:** command-palette actions (`commandPaletteStore.ts`) + a keybinding
  (`keybindings.ts`) to open the board / create a ticket.
- Domain state + subscription wiring in `packages/client-runtime` so web/desktop/mobile share it.
- **Tests:** logic tests (`*.test.ts`) for board store/filtering/DnD ordering; a browser test where
  the repo already uses `*.browser.test.ts`.
- _Acceptance:_ owner can run the full board + pane on desktop, drag tickets, filter, open links.

### Phase 4 — Mobile UI

- React Native board in `apps/mobile` following `docs/internals/11_mobile-layout.md` +
  `12_mobile-navigation.md`: a scrollable column/segment view + ticket detail; create/move via the
  same client-runtime domain + contracts. Approve-from-phone parity is the point.
- _Acceptance:_ board visible and editable on the mobile app connected to the server.

### Phase 5 — Workflow defaults

- **Default agent/model = Claude Opus.** Set in the default model selection / settings presets
  (`packages/contracts/settings.ts` + `modelSelection.ts`; web `modelSelection.ts`,
  `modelOrdering.ts`, `providerModels.ts`). First-run default, overridable per thread.
- **Auto-create a board per project.** Reactor in `orchestration-v2` on project creation emits
  `BoardCreated` (idempotent; also backfill existing projects on first run).
- **Project templates.** Extend the project file (`packages/contracts/t3ProjectFile.ts`) /
  project-create flow so a new project can scaffold a starter board (default sprints + label set).
- **First-run presets.** Default theme = "SentinelDev Dark" (blue accent), board pane preference.
- _Acceptance:_ a brand-new project opens with a board already there, Opus selected by default,
  blue-accent dark theme on.

### Phase 6 — Polish & close-out

- i18n all new copy; `vp run i18n:check`. Docs: add `docs/user/scrum.md` and note the feature where
  relevant; update `AGENTS.md`/README fork notes. Reverse states audited. Perf pass on the board
  subscription + list render. `pnpm tc && pnpm lint && pnpm build && pnpm knip` green. Dead external
  `issue-tracker-linear` left untouched.

---

## 7. Branch / PR strategy

- Branch per phase off `main` of `muhamedgit/t3code`: `feat/sentineldev-rebrand`,
  `feat/board-backend`, `feat/board-mcp`, `feat/board-web`, `feat/board-mobile`,
  `feat/workflow-defaults`. PR each into the fork's `main`. Keep diffs focused (CONTRIBUTING.md:
  small, focused changes). Do **not** try to upstream — this is a personal fork.
- Rebase onto upstream periodically to stay current (`git remote add upstream
  https://github.com/pingdotgg/t3code && git fetch upstream`).

## 8. Decisions still open for the owner

1. **Ticket key prefix** — `SENT-` proposed. OK, or per-project prefix?
2. **One board per project** (assumed) vs a cross-project board. Per-project matches T3's model.
3. **Labels** — free-form strings (assumed) vs a fixed set per board.
4. **Mobile depth** — full edit parity (Phase 4 as written) vs read + move only to start.
5. **Backfill** existing projects with a board on upgrade — yes (assumed)?
6. **New app icon art** — provide a mark, or recolor the current silhouette with the blue accent?

## 9. First steps for the implementer

1. `git remote -v` (confirm origin = `muhamedgit/t3code`), create `feat/sentineldev-rebrand`.
2. Read AGENTS.md fully + `docs/operations/00_development.md`; get `pnpm dev` running once.
3. Do Phase 0 (rebrand + theme) — small, validating the build/toolchain end to end.
4. Then Phase 1. Write the contract first, then the aggregate, then tests, then wire subscriptions.
