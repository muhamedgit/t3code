# SentinelDev beta review — 2026-11-26 (server 0.1.12)

Scope: scrum board tools, the web pairing screen (`http://127.0.0.1:3774/pair`) and the desktop window
(screenshot only). Not reviewed: the board UI, settings, the PR panel, desktop light mode. Those need a paired
web session.

Branding: only the **front-facing logo and icon** are in scope. Internal names (`t3-thread://`,
`/.well-known/t3/`, `t3-code` tool names, "T3 Code" in activity rows) are deliberately left as they are.

Screenshots are kept on the dev machine, not in git: `devscreen/2026-11-26-beta/` at the repo root (ignored via `.gitignore`).

Priority: **P1** = bug or data integrity, **P2** = visible UI problem, **P3** = polish.

---

## A. Board tools (backend)

### A1 [P1] Records created before the validation fixes are still invalid

PR #5 stops new bad references, but data written before it is still on disk. Example from the
`sentineldev-scratch` project:

| Ticket | Problem                                                                            |
| ------ | ---------------------------------------------------------------------------------- |
| SENT-4 | `sprintId: "sprint_doesnotexist"`                                                  |
| SENT-5 | `sprintId` is a sprint on another project's board (`sprint_41a9c797…`)             |
| SENT-2 | `links.threads: ["thread-does-not-exist"]`, `links.pullRequests` #99999 and #88888 |

Tickets with a dangling `sprintId` show up in no sprint and not in the backlog.

Expected: a one-off migration, or a check when the board projection loads, that

- sets `sprintId` to null (backlog) when the sprint is missing or belongs to another board
- removes thread links whose thread doesn't exist.

### A2 [P2] Closing a sprint doesn't offer the next planned sprint

- Repro: one active sprint with unfinished tickets and a second sprint in `planned`. Close the active one.
- Actual: unfinished tickets always go to the backlog (`sprintId: null`).
- Expected: the UI "Complete sprint" dialog offers "Move N open tickets to: [next planned sprint ▾ | Backlog]"
  and starts the chosen sprint. In the tool: `update_sprint({state:"closed", moveOpenTicketsTo: <sprintId> | "backlog"})`,
  defaulting to `"backlog"`.

### A3 [P3] Reopening a sprint doesn't bring back its carried-over tickets

Reopening is intended (plan §2, "Reverse states"). It keeps `startsAt` and clears `endsAt` correctly. But the
tickets that went to the backlog on close stay there, so reopening doesn't fully undo closing.

- Suggestion: when closing, record which tickets were carried out (for example in the `sprint.closed` event).
  On reopen, offer to move those tickets back if they are still in the backlog and still open.

### A4 [P3] PR links are stored without a check

Known and intentional (PR #5: "checking one needs the git host"). `link_ticket` accepted #88888 and #99999 on
`muhamedgit/pwnpilot`, neither of which exists.

- Suggestion: check when the host is reachable. When it isn't, store the link but mark it `unverified` and show
  that in the ticket UI, so a typo doesn't look like a real PR.

---

## B. Web pairing screen (`/pair`)

Screenshot: `devscreen/2026-11-26-beta/pair-desktop.png`

### B1 [P2] The logo reads "Code"; it should be SentinelDev (the one branding fix) — fixed in #7

- Actual: the card header shows a white/grey eye plus the word **"Code"**. Its accessible name is `img "T3 Code"`.
- Expected: the same lockup as the desktop sidebar (see the top left of `devscreen/2026-11-26-beta/desktop-window.png`): the **blue**
  Sentinel eye plus "**Sentinel**Dev", with `alt="SentinelDev"`.
- Already correct, leave as is: `<title>SentinelDev (Beta)</title>`, the `manifest.webmanifest` name/short_name,
  `favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png` and the 192/512 icons all show the Sentinel eye.
- If the app icon is redesigned (separate thread), this logo should use the new mark too.

### B2 [P2] The page keeps trying to connect before pairing

While on `/pair` without credentials, the client retries every ~2–5 s:

- `ws://127.0.0.1:3774/ws?...` fails
- `GET /api/orchestration/shell?omitIdleSubagents=1&omitOlderSettled=1` returns **401**, then `net::ERR_ABORTED`
- The console fills with `WebSocket connection ... failed` and
  `WARN Could not load the environment shell snapshot over HTTP; using the socket snapshot instead. {cause: EnvironmentAuthInvalidError ...}`

Expected: when `/api/auth/session` says the client isn't paired, don't start the socket or the shell fetch.
Start them only after pairing succeeds. A 401 should stop the retry loop, not back off and repeat.

### B3 [P2] No light theme

- Repro: emulate `prefers-color-scheme: light` and load `/pair`.
- Actual: stays fully dark.
- Expected: follow the system or app theme like the main UI.

### B4 [P3] The help text uses jargon and doesn't say where to get a token

- Actual: "This environment is desktop-managed. Open it from the desktop app or paste a bootstrap credential if
  one was issued explicitly."
- Expected (for example): "Open SentinelDev on this computer, go to **Settings → Devices → Pair a device**, and
  paste the token here." Use the real menu path. Drop "bootstrap credential" and "issued explicitly".

### B5 [P3] The token placeholder is cut off at phone width

Screenshot: `devscreen/2026-11-26-beta/pair-phone-empty-token.png` (375px, after pressing Continue with no token)

- At 375px wide the placeholder reads "Paste a one-time token or pairing s".
- Expected: a shorter placeholder ("Paste pairing token"). The rest of the phone layout is fine, and the
  empty-token alert ("Enter a pairing token to continue.") works.

---

## C. Desktop app

Screenshot: `devscreen/2026-11-26-beta/desktop-window.png`

### C1 [P2] The sidebar is mostly empty space and has no project list

- Actual: under Search, roughly 70% of the sidebar height is blank. The thread groups ("Working 1", "Settled 0")
  sit at the bottom, just above the icon bar. No projects are listed, so a newly created project appears nowhere.
- Expected: thread groups start directly under Search, and a Projects section lists every project (with an
  empty state such as "No threads yet").

### C2 [P2] The sidebar bottom icons have no labels

- Actual: five icon-only buttons at the bottom left (settings, git, circle icon, board, chart).
- Expected: tooltips with the name and shortcut on hover, and `aria-label` on each. Consider text labels when
  the sidebar is wide. The board entry especially needs to be findable.

### C3 [P3] Project initials: pwnpilot shows "PT"

- See the header ("PT pwnpilot") and the sidebar thread row.
- Expected: one-word names use the first two letters ("PW") or one letter ("P").

### C4 [P3] "Changes vs origi…" is cut off in the right panel

- Actual: "Changes vs origi… +2,070 -120" while there's room to spare.
- Expected: show the full ref ("vs origin/main"), or cut the branch name before the diff stats instead.

### C5 [P3] Activity row grammar

- Actual: "Used T3 Code integration and used 1 tool" ("used" twice).
- Expected: "Used T3 Code integration · 1 tool" (or similar). Keep the name; only fix the wording.

---

## Follow-up (fix/beta-review)

- **A1** fixed: migration 120 sends tickets whose sprint is missing or on another board to the backlog.
  Stale thread links on old test tickets are left for `link_ticket` `removeThreads`.
- **A2** fixed: **Complete sprint** asks where open tickets go (another open sprint or the backlog) when
  there are open tickets and another open sprint. The tool already had `update_sprint` `carryOverTo`.
- **A3, A4** left as is: reopening can't know which tickets left (nothing records it), and checking PR
  links needs the git host on every link.
- **B2** left as is: the retry loop comes from app-wide startup subscriptions in the connection layer,
  and only a browser sitting on `/pair` sees it. The desktop app never shows that page.
- **B3** left as is: the pairing page is seen once.
- **B4, B5** fixed: the help text says where the token comes from (Settings → Connections → Create
  link), and the placeholder is "Paste pairing token".
- **C1** left as is: the sidebar layout is upstream T3 Code's.
- **C2** already fine: each sidebar footer icon has a tooltip and an `aria-label` (the circle is Issues).
- **C3** fixed: a one-word project takes its first two letters (`pwnpilot` → `PW`), and camelCase
  counts as two words (`OpenLess` → `OL`).
- **C4** fixed: the row shows `vs main` for `origin/main`; the tooltip keeps the full ref.
- **C5** fixed: a clause that repeats the first clause's verb drops it ("Used T3 Code integration and
  1 tool").

## Verified fixed (no action)

- `create_ticket` / `move_ticket` reject missing sprints ("No sprint …") and sprints from another board.
- `link_ticket` rejects missing threads ("No thread …").
- New boards get their key prefix from the project name (a project titled "Prefix Check" got `PREC`).
- `read_board({includeArchived:true})` returns archived tickets.
- Starting a sprint sets `startsAt`; closing sets `endsAt` and moves unfinished tickets to the backlog.
- Only one active sprint per board. Closing a sprint that was never started is allowed (intended).
- `archive_ticket({archived:false})` restores a ticket.
