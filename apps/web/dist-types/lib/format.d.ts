/** Small formatting helpers shared across views. */
export declare function relativeTime(iso: string): string;
export declare function absoluteTime(iso: string): string;
export declare function fileName(path: string): string;
export declare function directoryName(path: string): string;
export declare function fileExtension(path: string): string;
export declare function formatBytes(bytes: number): string;
/** `Ada Lovelace` → `AL`, for the commit author badge. */
export declare function initials(name: string): string;
/** Stable colour index for an author, so the same person keeps the same badge. */
export declare function hashIndex(text: string, buckets: number): number;
//# sourceMappingURL=format.d.ts.map