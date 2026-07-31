# Gitscope

A diff and merge tool with deep Git integration — file history, changeset review, three-way
merge, text and folder comparison, a visual branch graph, and a full Git client.

Free, local-first, no subscription, no account, no telemetry. Nothing leaves your machine.

## What it does

| | |
|---|---|
| **File history** | Every revision of a file, following it across renames. Click one revision to compare it with the previous; shift-click to pin one side and compare any two. Commit details sit beside the diff. |
| **Changeset review** | Every change between two points in one place — two commits, HEAD and your working copy, or anything in between. Filter by change type, file type or name; inline diffs; jump to a file's history. Working-copy changesets update live as you edit. |
| **Three-way merge** | Conflicts shown with the context that resolves them: the commits each side contributed since the merge base, their messages, and what each side did to the *same* base text. Take either side, both, the base, or hand-edit. |
| **Text compare** | Any two files, revisions, or pasted snippets. Character-level diffs, collapsed unchanged regions, next/previous change navigation. |
| **Folder compare** | Recursive tree comparison with per-entry status, filters, inline diffs, and copy-across in either direction. |
| **Commit graph** | Virtualized branch DAG with coloured lanes, refs and search. Selecting a commit shows its whole changeset below. |
| **Git client** | Stage, unstage, discard, commit, amend; branches, tags, checkout; stash, cherry-pick, revert; fetch, pull, push; merge and rebase with continue/abort. |

Plus `git difftool` and `git mergetool` integration, so `git mergetool` opens here and git
learns whether the merge succeeded.

## Installing

Requires Node 20+ and `git` on `PATH`.

```sh
pnpm install
pnpm build          # builds the UI, server, CLI and desktop app
pnpm app            # launches the desktop app
```

Register the command line tool and the git integration:

```sh
ln -s "$PWD/packages/cli/dist/gsc.mjs" /usr/local/bin/gsc
gsc install-git --global
```

## Using it

```sh
gsc                       # open the repository in the current directory
gsc ~/code/project        # open a specific repository
gsc diff old.ts new.ts    # compare two files or folders
gsc serve --port 7345     # run the server and use it from a browser
gsc status                # is an instance running?

git difftool              # review changes in Gitscope
git mergetool             # resolve conflicts in Gitscope
```

One instance serves everything: `gsc diff` opens in the window you already have rather than
starting a second copy.

### Keyboard

| | |
|---|---|
| `⌘1` … `⌘5` | Working copy · History · Conflicts · Text compare · Folder compare |
| `⌥↑` / `⌥↓` | Previous / next change |
| `⌘⏎` | Commit |
| `⌘O` | Open repository |

## How it is built

```
packages/core     the engine: diff, merge, git access, graph layout (no DOM, no server)
packages/cli      `gsc` — opens comparisons in a running instance; git difftool/mergetool
apps/server       HTTP + WebSocket over the engine; repository sessions; live file watching
apps/web          the UI (React + TypeScript) — identical in the browser and the desktop app
apps/desktop      Electron shell; runs the server in-process, adds native menus
```

Three decisions shape the rest:

**Shell out to `git`.** Correctness and complete feature coverage for free, on every repository
layout, including submodules, worktrees and LFS. Plumbing commands with NUL-delimited output
parse unambiguously.

**Own the diff engine.** `packages/core` is a port of git's histogram algorithm, its
change-compaction pass and its indent heuristic.
[`packages/core/test/diffVsGit.test.ts`](packages/core/test/diffVsGit.test.ts) runs the real
`git diff --histogram` over randomised inputs and requires an exact hunk-for-hunk match — so
the hunks you see are the hunks git would have shown you. On top of that sit word-level
intra-line diffs narrowed to characters, and similarity-based row pairing so a rewritten line
sits opposite the line it came from.

**One UI.** The desktop app runs the same server the browser build talks to, in-process, and
loads the same bundle. There is one implementation of every view, and it behaves identically
in both.

## Developing

```sh
pnpm typecheck
pnpm test           # 108 tests: unit, API, browser end-to-end, and the desktop app
pnpm test:unit      # engine and server only — fast
pnpm dev            # Vite dev server against `pnpm serve`
```

The UI tests drive the production build in real Chromium and assert on what is rendered, down
to which characters the inline highlight covers. `pnpm test:desktop` launches the actual
Electron app. Screenshots land in `apps/*/test-output/`.

## Status

Every milestone in [PLAN.md](./PLAN.md) is implemented. Known gaps, all additive:

- Interactive rebase is exposed as a command, not yet as a todo-list editor.
- Hunk-level staging exists on the server (`apply-patch`) but the UI stages whole files.
- Image and PDF comparison are not implemented.
- No syntax highlighting for languages outside the built-in lexer's set; it degrades to plain
  text rather than failing.
