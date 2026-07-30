export interface AsyncResult<T> {
    data?: T;
    error?: string;
    loading: boolean;
    reload: () => void;
}
/**
 * Minimal data-fetching hook.
 *
 * Requests are sequenced so a slow response can never overwrite a newer one —
 * clicking quickly down a file list otherwise leaves you looking at a diff you
 * already navigated away from.
 */
export declare function useAsync<T>(run: () => Promise<T>, deps: readonly unknown[], options?: {
    enabled?: boolean;
    keepPreviousData?: boolean;
}): AsyncResult<T>;
//# sourceMappingURL=useAsync.d.ts.map