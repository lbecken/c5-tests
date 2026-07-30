import { copyFile, mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import type { DirectoryCompareResponse, TreeCompareEntry } from './protocol.js';

/**
 * Recursive folder comparison.
 *
 * Files of different sizes differ, full stop. Files of the same size are
 * compared byte for byte with an early exit, which is the only answer that is
 * always right — see `contentsDiffer` for why the tempting timestamp shortcut
 * is only available on request.
 */

const DEFAULT_IGNORES = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
  '.svn',
  '.hg',
  '__pycache__',
  '.venv',
]);

/** Files larger than this fall back to size and timestamp. */
const MAX_COMPARE_BYTES = 512 * 1024 * 1024;

interface Entry {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

async function listDirectory(path: string, ignores: Set<string>): Promise<Map<string, Entry>> {
  const result = new Map<string, Entry>();
  let dirents;
  try {
    dirents = await readdir(path, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const dirent of dirents) {
    if (ignores.has(dirent.name)) continue;
    const full = join(path, dirent.name);
    try {
      const info = await stat(full);
      result.set(dirent.name, {
        name: dirent.name,
        isDirectory: info.isDirectory(),
        size: info.size,
        mtime: info.mtimeMs,
      });
    } catch {
      // A symlink to nowhere, or a file that vanished mid-scan.
    }
  }
  return result;
}

const CHUNK = 64 * 1024;

/**
 * Compare two same-sized files byte for byte, stopping at the first difference.
 *
 * Deliberately not a size-and-timestamp shortcut: `cp -p`, archive extraction
 * and checkouts all reproduce timestamps, so two files can differ while
 * agreeing on both — and a comparison tool that reports those as identical is
 * worse than no tool at all. Reading stops at the first differing byte, so the
 * common case costs one chunk.
 */
async function contentsDiffer(leftPath: string, rightPath: string, size: number): Promise<boolean> {
  if (size === 0) return false;
  const [left, right] = await Promise.all([open(leftPath, 'r'), open(rightPath, 'r')]);
  try {
    const a = Buffer.allocUnsafe(CHUNK);
    const b = Buffer.allocUnsafe(CHUNK);
    let offset = 0;
    while (offset < size) {
      const [readA, readB] = await Promise.all([
        left.read(a, 0, CHUNK, offset),
        right.read(b, 0, CHUNK, offset),
      ]);
      if (readA.bytesRead !== readB.bytesRead) return true;
      if (readA.bytesRead === 0) break;
      if (Buffer.compare(a.subarray(0, readA.bytesRead), b.subarray(0, readB.bytesRead)) !== 0) {
        return true;
      }
      offset += readA.bytesRead;
    }
    return false;
  } finally {
    await Promise.all([left.close(), right.close()]);
  }
}

async function filesDiffer(
  leftPath: string,
  rightPath: string,
  left: Entry,
  right: Entry,
  quick: boolean,
): Promise<boolean> {
  if (left.size !== right.size) return true;
  // Opt-in fast path for large trees where the user accepts the risk.
  if (quick) return Math.abs(left.mtime - right.mtime) >= 1;
  if (left.size > MAX_COMPARE_BYTES) return Math.abs(left.mtime - right.mtime) >= 1;
  try {
    return await contentsDiffer(leftPath, rightPath, left.size);
  } catch {
    return true;
  }
}

async function compareLevel(
  leftRoot: string,
  rightRoot: string,
  relativePath: string,
  ignores: Set<string>,
  totals: DirectoryCompareResponse['totals'],
  depth: number,
  quick: boolean,
): Promise<TreeCompareEntry[]> {
  if (depth > 40) return [];
  const leftPath = join(leftRoot, relativePath);
  const rightPath = join(rightRoot, relativePath);
  const [left, right] = await Promise.all([
    listDirectory(leftPath, ignores),
    listDirectory(rightPath, ignores),
  ]);

  const names = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  const entries: TreeCompareEntry[] = [];

  for (const name of names) {
    const l = left.get(name);
    const r = right.get(name);
    const childPath = relativePath.length > 0 ? `${relativePath}/${name}` : name;

    if (l && r && l.isDirectory !== r.isDirectory) {
      totals.modified++;
      entries.push({
        path: childPath,
        name,
        type: 'blob',
        status: 'typechange',
        leftSize: l.size,
        rightSize: r.size,
      });
      continue;
    }

    const isDirectory = l?.isDirectory ?? r?.isDirectory ?? false;
    if (isDirectory) {
      const children = await compareLevel(
        leftRoot,
        rightRoot,
        childPath,
        ignores,
        totals,
        depth + 1,
        quick,
      );
      const status: TreeCompareEntry['status'] = !l
        ? 'added'
        : !r
          ? 'removed'
          : children.some((child) => child.status !== 'same')
            ? 'modified'
            : 'same';
      entries.push({ path: childPath, name, type: 'tree', status, children });
      continue;
    }

    if (l && !r) {
      totals.removed++;
      entries.push({
        path: childPath,
        name,
        type: 'blob',
        status: 'removed',
        leftSize: l.size,
        leftMtime: l.mtime,
      });
    } else if (!l && r) {
      totals.added++;
      entries.push({
        path: childPath,
        name,
        type: 'blob',
        status: 'added',
        rightSize: r.size,
        rightMtime: r.mtime,
      });
    } else if (l && r) {
      const differs = await filesDiffer(join(leftPath, name), join(rightPath, name), l, r, quick);
      if (differs) totals.modified++;
      else totals.same++;
      entries.push({
        path: childPath,
        name,
        type: 'blob',
        status: differs ? 'modified' : 'same',
        leftSize: l.size,
        rightSize: r.size,
        leftMtime: l.mtime,
        rightMtime: r.mtime,
      });
    }
  }

  return entries;
}

export async function compareDirectories(
  left: string,
  right: string,
  options: { ignore?: string[]; quick?: boolean } = {},
): Promise<DirectoryCompareResponse> {
  const ignores = new Set([...DEFAULT_IGNORES, ...(options.ignore ?? [])]);
  const totals = { added: 0, removed: 0, modified: 0, same: 0 };
  const leftRoot = resolve(left);
  const rightRoot = resolve(right);
  const entries = await compareLevel(
    leftRoot,
    rightRoot,
    '',
    ignores,
    totals,
    0,
    options.quick === true,
  );
  return { left: leftRoot, right: rightRoot, entries, totals };
}

/**
 * Copy one entry from one side to the other. Both paths are re-derived from the
 * two roots and checked to still be inside them, so a crafted relative path
 * cannot write outside the compared trees.
 */
export async function copyEntry(
  leftRoot: string,
  rightRoot: string,
  relativePath: string,
  direction: 'to-right' | 'to-left',
): Promise<{ ok: boolean; message: string }> {
  const from = direction === 'to-right' ? resolve(leftRoot) : resolve(rightRoot);
  const to = direction === 'to-right' ? resolve(rightRoot) : resolve(leftRoot);
  const source = resolve(from, relativePath);
  const target = resolve(to, relativePath);

  if (!isInside(source, from) || !isInside(target, to)) {
    return { ok: false, message: 'refusing to copy outside the compared folders' };
  }

  try {
    const info = await stat(source);
    if (info.isDirectory()) {
      await copyTree(source, target);
    } else {
      await mkdir(resolve(target, '..'), { recursive: true });
      await copyFile(source, target);
    }
    return { ok: true, message: `copied ${relativePath}` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function deleteEntry(
  root: string,
  relativePath: string,
): Promise<{ ok: boolean; message: string }> {
  const base = resolve(root);
  const target = resolve(base, relativePath);
  if (!isInside(target, base) || target === base) {
    return { ok: false, message: 'refusing to delete outside the compared folder' };
  }
  try {
    await rm(target, { recursive: true, force: true });
    return { ok: true, message: `deleted ${relativePath}` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

function isInside(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel.length > 0 && !rel.startsWith('..') && !rel.startsWith(`..${sep}`);
}

async function copyTree(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const dirents = await readdir(source, { withFileTypes: true });
  for (const dirent of dirents) {
    const from = join(source, dirent.name);
    const to = join(target, dirent.name);
    if (dirent.isDirectory()) await copyTree(from, to);
    else await copyFile(from, to);
  }
}
