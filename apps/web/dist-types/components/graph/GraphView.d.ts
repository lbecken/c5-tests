interface Props {
    repoId: string;
    selected?: string;
    revision: number;
}
/**
 * The commit graph as the navigation surface: lanes on the left, refs and
 * subject in the middle, and the selected commit's full changeset below.
 */
export declare function GraphView({ repoId, selected, revision }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=GraphView.d.ts.map