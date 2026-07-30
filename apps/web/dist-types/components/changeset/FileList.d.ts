import type { FileChange } from '@gitscope/core';
interface Props {
    changes: readonly FileChange[];
    selected?: string;
    onSelect: (change: FileChange) => void;
    onOpenHistory?: (path: string) => void;
}
/**
 * The file list for a changeset, with the three filters that actually get used:
 * what kind of change it was, what type of file it is, and a name search.
 * Filtering happens here rather than server-side so it stays instant.
 */
export declare const FileList: import("react").NamedExoticComponent<Props>;
export {};
//# sourceMappingURL=FileList.d.ts.map