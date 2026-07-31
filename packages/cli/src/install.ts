import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

/**
 * Register `gsc` with git as the difftool and mergetool.
 *
 * Written as explicit `git config` calls rather than by editing the config
 * file, so git's own quoting rules apply and an existing configuration is
 * updated rather than replaced.
 */
export function installGitIntegration(global: boolean): number {
  const executable = resolveSelf();
  const scope = global ? '--global' : '--local';

  const settings: Array<[string, string]> = [
    ['diff.tool', 'gitscope'],
    ['difftool.gitscope.cmd', `${executable} difftool "$LOCAL" "$REMOTE"`],
    ['difftool.prompt', 'false'],
    ['merge.tool', 'gitscope'],
    ['mergetool.gitscope.cmd', `${executable} merge "$BASE" "$LOCAL" "$REMOTE" "$MERGED"`],
    ['mergetool.gitscope.trustExitCode', 'true'],
    // git's own backup of the conflicted file is noise once the tool has
    // written a resolution it is happy with.
    ['mergetool.keepBackup', 'false'],
    ['mergetool.prompt', 'false'],
  ];

  for (const [key, value] of settings) {
    const result = spawnSync('git', ['config', scope, key, value], { stdio: 'inherit' });
    if (result.status !== 0) {
      process.stderr.write(`gsc: failed to set ${key}\n`);
      return 1;
    }
  }

  process.stdout.write(
    [
      `Registered gitscope with git (${global ? 'global' : 'this repository'}).`,
      '',
      '  git difftool            review changes',
      '  git mergetool           resolve conflicts',
      '',
    ].join('\n'),
  );
  return 0;
}

/** Absolute path to this executable, following symlinks so `npx` links work. */
function resolveSelf(): string {
  const entry = process.argv[1];
  if (!entry) return 'gsc';
  try {
    return realpathSync(entry);
  } catch {
    return entry;
  }
}
