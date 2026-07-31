interface Props {
    repoId: string;
    path?: string;
    revision: number;
}
/**
 * The working copy as a staging area: what is staged, what is not, and a
 * commit box — with every file still opening in the same diff view used
 * everywhere else.
 */
export declare function WorkingCopyView({ repoId, path, revision }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=WorkingCopyView.d.ts.map