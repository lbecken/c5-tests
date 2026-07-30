interface Props {
    repoId: string;
    path: string;
    revision: number;
}
/**
 * Every revision of one file, with any two of them comparable.
 *
 * Clicking a revision compares it against the revision immediately older in
 * this list, which is what you want nine times out of ten. Pinning one revision
 * and clicking another compares exactly those two — including across renames,
 * because each entry carries the path the file had at that commit.
 */
export declare function FileHistoryView({ repoId, path, revision }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=FileHistoryView.d.ts.map