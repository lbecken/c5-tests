# Gitscope — Plan

A free, local-first diff & merge tool with deep Git integration. Feature-parity target:
Kaleidoscope (diff/merge/review) + GitKraken (graph/client), no subscription, no telemetry,
no account.

## Research summary

**What Kaleidoscope gets right** (and we must match): file history that lets you browse and
compare *any* two revisions with commit context inline; a "changeset" that puts every change
between two points in one scrollable place with live working-copy updates; character-level
diffs so a renamed variable does not read as a rewritten line; collapsed unchanged regions so
the eye goes straight to what changed; a 3-way merge that shows *why* the conflict exists
(the commits on each side, their messages, base-vs-side diffs) rather than just three columns
of text; directory comparison with per-entry status and copy-across.

**What GitKraken gets right**: the commit DAG as a navigation surface — lanes, refs, and
click-through from a commit to its changeset — plus full client operations (stage, commit,
branch, stash, rebase) so you never leave for the terminal.

**Where existing free tools fall short**: Meld/WinMerge/Diffuse are excellent 2/3-way text
diffs but have no git model (no history browsing, no graph, no changesets). Difftastic is a
great structural differ but is a CLI printer, not a workspace. `git-gui`/`gitk` have the git
model but a 1990s UI and no char-level diff. Nothing free combines both halves — that is the
gap this fills.

**Key technical choices**
- **Shell out to `git`** rather than reimplement (isomorphic-git) or bind (nodegit).
  Correctness and full feature coverage for free; `git` is already on every dev machine.
  Plumbing commands (`cat-file --batch`, `diff-tree -z`, `status --porcelain=v2`) are stable,
  fast, and scriptable.
- **Own diff engine in TypeScript**, not a library. We need histogram-quality line diffs *and*
  word/character refinement *and* stable hunk models for a UI that aligns three panes. Existing
  npm diffs (`diff`, `jsdiff`) are plain Myers with no histogram, no linear-space guard, and no
  alignment model.
- **Electron + React + TypeScript**, one UI shared between the desktop app and `gsc serve`.
- Everything verified headlessly here: vitest for the engine, Playwright for the UI.

## Architecture

```
packages/core     pure TS, no DOM, no node-server deps
  diff/           tokenizer, Myers (linear space), histogram, hunks, char-level refinement
  merge/          diff3 three-way merge + conflict model
  git/            process runner + Repository facade (log, status, blobs, refs, ops)
  graph/          commit DAG -> lanes/edges layout
apps/server       HTTP + WebSocket over core; repo sessions; fs watching for live updates
apps/web          React + Vite UI (the product)
apps/desktop      Electron shell: native menus, shortcuts, window management
packages/cli      `gsc` — open, diff, merge; git difftool/mergetool integration
```

Data flows one way: `git` → core (typed models) → server (JSON/WS) → UI store → virtualized
views. The working copy is watched; changesets that include the working tree re-render live.

## Milestones

| # | Milestone | Contents |
|---|-----------|----------|
| M0 | Scaffold | workspaces, strict TS, vitest, CI-able scripts |
| M1 | Core engine | line/char diff, hunks, diff3 merge, git layer, graph layout — all unit-tested |
| M2 | Server | REST + WS, sessions, watcher, blob cache |
| M3 | Changeset + File History | the daily loop: review all changes between two points; browse a file's revisions |
| M4 | Text Compare | any two files/revisions/pasted text |
| M5 | Commit graph | virtualized DAG, lanes, refs, search |
| M6 | 3-way merge | conflict resolution with commit context, `git mergetool` |
| M7 | Directory compare | recursive tree diff, copy across, preview |
| M8 | Full client | stage/discard by hunk, commit, branch, stash, cherry-pick, revert, push/pull, rebase |
| M9 | Desktop + CLI | Electron shell, `gsc`, packaging, docs |

Each milestone ends with tests green and a commit pushed to `claude/git-diff-merge-tool-hdruen`.

## Non-goals (for now)

Image/pixel diffing, PDF diff, remote-hosting integrations (PR review against GitHub), and
plugin APIs. All are additive later; none block daily use.
