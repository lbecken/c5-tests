# Gitscope

A free, local-first diff and merge tool with deep Git integration — file history, changeset
review, three-way merge, text and directory comparison, and a visual branch graph.

No subscription, no account, no telemetry. See [PLAN.md](./PLAN.md) for the design and the
milestone plan.

## Status

| Milestone | State |
|-----------|-------|
| M0 Scaffold | done |
| M1 Core diff/merge/graph engine | done |
| M2 Server + API + live watching | in progress |
| M3 Changeset review + File History UI | |
| M4 Text Compare | |
| M5 Commit graph | |
| M6 3-way merge + `git mergetool` | |
| M7 Directory compare | |
| M8 Full git client operations | |
| M9 Electron shell, CLI, packaging | |

## The engine

`packages/core` is a dependency-free TypeScript library:

- **Line diff** — a port of git's histogram algorithm, its change-compaction pass and its
  indent heuristic. `packages/core/test/diffVsGit.test.ts` checks the output against the real
  `git diff --histogram` binary over randomised inputs and requires an exact hunk-for-hunk
  match, so what you see here is what `git diff` would have told you.
- **Character-level refinement** — changed regions are diffed at word granularity and then
  narrowed to individual characters, so a renamed identifier highlights the identifier rather
  than the whole line.
- **Row alignment** — when a block of lines is rewritten, lines are paired by similarity
  instead of by position, so a rewritten line sits opposite the line it came from.
- **Three-way merge** — diff3 over two diffs against the common base, agreeing with
  `git merge-file` on what is clean and what conflicts.
- **Git layer** — typed access to log, refs, status, trees, blobs and diffs via git's plumbing
  commands, with a long-lived `cat-file --batch` process for bulk blob reads.
- **Graph layout** — lane assignment for the commit DAG, stable under scrolling and incremental
  loading.

## Developing

```sh
pnpm install
pnpm test        # vitest, includes differential tests against the git binary
pnpm typecheck
```

Requires Node 20+ and `git` on `PATH`.
