import type { FileChange } from '@gitscope/core';
interface Props {
    repoId: string;
    from: string;
    to: string;
    change?: FileChange;
    labels: {
        left: string;
        right: string;
    };
    /** Bumped by the caller when the repository changes, to refetch. */
    revision: number;
    onOpenHistory?: (path: string) => void;
}
/**
 * The diff for one file, with the toolbar that governs how it is displayed.
 * Kept separate from the changeset so switching files re-renders only this
 * side of the split.
 */
export declare function FilePane({ repoId, from, to, change, labels, revision, onOpenHistory }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=FilePane.d.ts.map