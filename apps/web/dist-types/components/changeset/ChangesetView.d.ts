interface Props {
    repoId: string;
    from: string;
    to: string;
    labels: {
        left: string;
        right: string;
    };
    /** Path to select on mount, if any. */
    initialPath?: string;
    revision: number;
    /** Extra content shown above the file list, e.g. commit metadata. */
    header?: React.ReactNode;
    onSelectPath?: (path: string) => void;
}
/**
 * Every change between two points, in one place: the file list on the left, the
 * selected file's diff on the right, and the totals in between. Live updates
 * arrive through `revision`, so a changeset that includes the working copy
 * refreshes as you edit without losing your place.
 */
export declare function ChangesetView({ repoId, from, to, labels, initialPath, revision, header, onSelectPath, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=ChangesetView.d.ts.map