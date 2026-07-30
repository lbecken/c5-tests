import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { runGit } from '../../src/git/runner.js';

/** A throwaway git repository for tests, with helpers for building history. */
export class TempRepo {
  private constructor(readonly dir: string) {}

  static async create(): Promise<TempRepo> {
    const dir = await mkdtemp(join(tmpdir(), 'gitscope-test-'));
    const repo = new TempRepo(dir);
    await repo.git(['init', '-q', '-b', 'main']);
    await repo.git(['config', 'user.name', 'Test User']);
    await repo.git(['config', 'user.email', 'test@example.com']);
    await repo.git(['config', 'commit.gpgsign', 'false']);
    return repo;
  }

  git(args: string[]): Promise<{ stdout: Buffer; stderr: string; exitCode: number | null }> {
    // Never throws: tests deliberately run commands that fail, such as a merge
    // that is meant to conflict.
    return runGit(args, {
      cwd: this.dir,
      throwOnError: false,
      env: {
        GIT_AUTHOR_DATE: '2024-01-01T12:00:00+00:00',
        GIT_COMMITTER_DATE: '2024-01-01T12:00:00+00:00',
      },
    });
  }

  async write(path: string, content: string): Promise<void> {
    const full = join(this.dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }

  async commit(message: string, files: Record<string, string> = {}): Promise<string> {
    for (const [path, content] of Object.entries(files)) {
      await this.write(path, content);
    }
    await this.git(['add', '-A']);
    await this.git(['commit', '-q', '-m', message, '--allow-empty']);
    const out = await this.git(['rev-parse', 'HEAD']);
    return out.stdout.toString('utf8').trim();
  }

  async destroy(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }
}
