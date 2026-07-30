interface Props {
    repoId: string;
    path?: string;
    revision: number;
}
/**
 * What you have changed but not yet committed, as a changeset. The three scopes
 * map onto the three comparisons git can express, named the way people think
 * about them rather than the way the flags are spelled.
 */
export declare function WorkingCopyView({ repoId, path, revision }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=WorkingCopyView.d.ts.map