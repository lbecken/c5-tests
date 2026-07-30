interface Props {
    repoId: string;
    path?: string;
    revision: number;
}
/**
 * Three-way merge.
 *
 * The three stages are shown side by side, but the part that actually resolves
 * a conflict is the context above them: which commits each side contributed
 * since the merge base, and what each side did to the *same* base text. A
 * conflict is a disagreement between two intentions, and you cannot pick a
 * winner without seeing both.
 */
export declare function MergeView({ repoId, path, revision }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=MergeView.d.ts.map