import type { BlobResponse, ChangesetResponse, CommitDetail, ConflictResponse, DirectoryCompareResponse, FileDiffResponse, FileHistoryResponse, LogResponse, OpenRepoResponse, RepoSummary, ServerEvent, StatusResponse, TreeResponse } from '@gitscope/server/protocol';
import type { DiffOptions, Ref, Remote, RepoState } from '@gitscope/core';
/** Typed client for the local server. Every call goes through `request`. */
export declare class ApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
export declare const api: {
    health: () => Promise<{
        ok: boolean;
    }>;
    listRepos: () => Promise<RepoSummary[]>;
    openRepo: (path: string) => Promise<OpenRepoResponse>;
    closeRepo: (id: string) => Promise<{
        ok: true;
    }>;
    state: (id: string) => Promise<RepoState>;
    refs: (id: string) => Promise<Ref[]>;
    remotes: (id: string) => Promise<Remote[]>;
    status: (id: string) => Promise<StatusResponse>;
    log: (id: string, options?: {
        limit?: number;
        skip?: number;
        all?: boolean;
        rev?: string[];
        path?: string[];
        grep?: string;
        search?: string;
        author?: string;
        firstParent?: boolean;
    }) => Promise<LogResponse>;
    commit: (id: string, oid: string) => Promise<CommitDetail>;
    changeset: (id: string, from: string, to: string, paths?: string[], options?: DiffOptions) => Promise<ChangesetResponse>;
    diff: (id: string, params: {
        from: string;
        to: string;
        path: string;
        oldPath?: string;
        status?: string;
    }, options?: DiffOptions) => Promise<FileDiffResponse>;
    file: (id: string, rev: string, path: string) => Promise<BlobResponse>;
    history: (id: string, path: string, options?: {
        limit?: number;
        skip?: number;
    }) => Promise<FileHistoryResponse>;
    tree: (id: string, rev: string, path?: string) => Promise<TreeResponse>;
    conflict: (id: string, path: string) => Promise<ConflictResponse>;
    compareDirectories: (left: string, right: string, options?: {
        ignore?: string[];
    }) => Promise<DirectoryCompareResponse>;
    browse: (path?: string) => Promise<{
        path: string;
        parent: string;
        entries: Array<{
            name: string;
            path: string;
            isRepo: boolean;
        }>;
    }>;
};
/**
 * Subscribe to live repository events. Reconnects with backoff, because the
 * server restarting during development should not leave a dead UI.
 */
export declare function subscribeToEvents(repoIds: string[], onEvent: (event: ServerEvent) => void): () => void;
//# sourceMappingURL=client.d.ts.map