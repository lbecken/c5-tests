interface Props {
    repoId?: string;
    left?: string;
    right?: string;
}
/**
 * Compare any two pieces of text: pasted content, or any path at any revision.
 *
 * Pasted text is diffed in the browser with the same engine the server uses, so
 * there is no round trip and nothing leaves the machine; revisions are fetched
 * and then diffed the same way, which keeps both halves of this view identical
 * below the input controls.
 */
export declare function TextCompareView({ repoId, left, right }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=TextCompareView.d.ts.map