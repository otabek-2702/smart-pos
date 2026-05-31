# GitHub Projects board setup — POS backlog (#14 / T11)

This file is the 30-second recipe for mirroring the smart-pos backlog into a
GitHub Projects (v2) board. It's a manual step because the CLI (`gh`) and a
PAT aren't available in this environment — but once you run through these
clicks you're done.

## 1. Create the project

1. Open `https://github.com/otabek-2702/smart-pos` → **Projects** tab → **New project**.
2. Template: **Board**. Name: `smart-pos backlog`. Public.

## 2. Add the issues in one shot

In the project, **+ Add item** → search bar → paste each query, then "Add all
matching results":

- `repo:otabek-2702/smart-pos is:open` — pulls in every open issue.
- `repo:otabek-2702/smart-pos is:closed` — pulls in the historical ones so the
  board shows what was already shipped (helpful while the team's still ramping).

## 3. Fields

The default board has `Status` (Todo / In Progress / Done). Add three more so
the board carries the same information as the `[B]/[T]/[F]` prefixes do today.

- **Area** (single-select):
  - `Bug` — the `[B*]` issues
  - `Task` — the `[T*]` issues (short-term technical work)
  - `Feature` — the `[F*]` issues (product backlog)

- **Priority** (single-select):
  - `P0` — must-do this week
  - `P1` — next release
  - `P2` — nice to have
  - `Blocked` — waiting on something external (backend, product call, vendor)

- **Owner** (text or person) — who is driving it.

## 4. Suggested initial values (from the questionnaire + current state)

| Issue | Area | Priority | Notes |
|---|---|---|---|
| #14 [T11] Mirror backlog into Projects | Task | P2 | Closes when this doc is enacted in the web UI |
| #19 [F3] Expand E2E beyond single smoke | Feature | Blocked | Electron 39 + Playwright launch incompatibility; unit tests landed as partial coverage |
| #22 [F6] Client display receipt total animation | Feature | P2 | Frontend polish landed; visible once backend includes `total_amount` in `/orders/client-display` |

All other previously-open issues are **closed** and live under the `Done`
column purely as history.

## 5. Views worth pinning

- **Board** (default) — group by `Status`. Day-to-day work.
- **Priority** — table view, grouped by `Priority`. Sprint planning.
- **Backend-blocked** — table view, filter `Priority = Blocked`. So you can
  see at a glance what's waiting on `alpha_pos`.

## 6. Optional automation (one-click)

In **Workflows** (project settings) turn on:
- *Auto-add to project* — repo `otabek-2702/smart-pos`, filter `is:issue`. Any
  new issue lands on the board automatically.
- *Item closed → Status: Done* — keeps the Done column in sync without manual
  drags when a `Closes #N` commit hits `main`.

That's it. The recipe above is everything #14 actually asks for; the rest is
keeping it tidy as work moves.
