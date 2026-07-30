import type { ChangeStatus, Commit, Signature } from './types.js';

/**
 * Field separator for our `--format` strings. Commit messages can contain any
 * printable text and any control character except NUL, which makes NUL the only
 * separator that cannot be forged by repository content.
 */
export const FS = '%x00';

export const COMMIT_FORMAT = [
  '%H',
  '%h',
  '%P',
  '%an',
  '%ae',
  '%aI',
  '%cn',
  '%ce',
  '%cI',
  '%s',
  '%B',
].join(FS);

/** Number of NUL-separated fields produced by COMMIT_FORMAT. */
export const COMMIT_FIELDS = 11;

function signature(name: string, email: string, date: string): Signature {
  return { name, email, date };
}

/**
 * Build a commit from a run of NUL-separated fields. `git log --format=format:`
 * joins records with a newline, so the first field of every record after the
 * first carries a leading newline that has to be trimmed.
 */
export function commitFromFields(fields: string[], offset: number): Commit {
  const at = (i: number): string => fields[offset + i] ?? '';
  const oid = at(0).replace(/^\n+/, '');
  const parents = at(2).length > 0 ? at(2).split(' ') : [];
  const body = at(10);
  const subject = at(9);
  // %B is the raw message; the body is everything after the subject line.
  const trailing = body.startsWith(subject) ? body.slice(subject.length) : body;
  return {
    oid,
    shortOid: at(1),
    parents,
    author: signature(at(3), at(4), at(5)),
    committer: signature(at(6), at(7), at(8)),
    subject,
    body: trailing.replace(/^\n+/, '').replace(/\s+$/, ''),
  };
}

/** Parse the output of `git log --format=format:<COMMIT_FORMAT>`. */
export function parseCommits(stdout: string): Commit[] {
  if (stdout.length === 0) return [];
  const fields = stdout.split('\0');
  const commits: Commit[] = [];
  for (let i = 0; i + COMMIT_FIELDS <= fields.length; i += COMMIT_FIELDS) {
    const oid = (fields[i] ?? '').replace(/^\n+/, '');
    if (oid.length === 0) break;
    commits.push(commitFromFields(fields, i));
  }
  return commits;
}

const RAW_STATUS: Record<string, ChangeStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange',
  U: 'unmerged',
  X: 'modified',
};

export function rawStatusOf(code: string): ChangeStatus {
  return RAW_STATUS[code[0] ?? 'M'] ?? 'modified';
}

/** Status letters used by `git status --porcelain=v2`. */
const PORCELAIN_STATUS: Record<string, ChangeStatus> = {
  M: 'modified',
  T: 'typechange',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
};

export function porcelainStatusOf(code: string): ChangeStatus | 'unchanged' {
  if (code === '.' || code === ' ') return 'unchanged';
  return PORCELAIN_STATUS[code] ?? 'modified';
}

/** `[ahead 3, behind 1]` → `{ ahead: 3, behind: 1 }`. */
export function parseTrack(track: string): { ahead?: number; behind?: number } {
  const result: { ahead?: number; behind?: number } = {};
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  if (ahead) result.ahead = Number(ahead[1]);
  if (behind) result.behind = Number(behind[1]);
  if (/gone/.test(track)) {
    result.ahead = result.ahead ?? 0;
    result.behind = result.behind ?? 0;
  }
  return result;
}

/** Heuristic git itself uses: a NUL byte in the first 8000 bytes means binary. */
export function looksBinary(data: Buffer): boolean {
  const limit = Math.min(data.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (data[i] === 0) return true;
  }
  return false;
}

export interface DecodedBlob {
  text?: string;
  isBinary: boolean;
  encoding: string;
  noFinalNewline: boolean;
}

/**
 * Decode blob bytes for display. UTF-8 is assumed unless a BOM says otherwise
 * or the bytes fail to round-trip, in which case we fall back to Latin-1 so the
 * file is still viewable rather than replaced by a wall of replacement
 * characters.
 */
export function decodeBlob(data: Buffer): DecodedBlob {
  if (looksBinary(data)) {
    return { isBinary: true, encoding: 'binary', noFinalNewline: false };
  }

  let encoding = 'utf-8';
  let body = data;
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    body = data.subarray(3);
    encoding = 'utf-8-bom';
  } else if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return {
      text: data.subarray(2).toString('utf16le'),
      isBinary: false,
      encoding: 'utf-16le',
      noFinalNewline: !data.subarray(2).toString('utf16le').endsWith('\n'),
    };
  }

  let text = body.toString('utf8');
  if (text.includes('�') && !body.includes(Buffer.from([0xef, 0xbf, 0xbd]))) {
    text = body.toString('latin1');
    encoding = 'latin-1';
  }
  return {
    text,
    isBinary: false,
    encoding,
    noFinalNewline: text.length > 0 && !text.endsWith('\n'),
  };
}
