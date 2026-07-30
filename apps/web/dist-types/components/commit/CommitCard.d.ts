import type { Commit, Ref } from '@gitscope/core';
interface Props {
    commit: Commit;
    refs?: readonly Ref[];
    compact?: boolean;
    onSelectParent?: (oid: string) => void;
}
/**
 * The context that turns a hash into a decision: who changed it, when, why, and
 * what it descends from. Shown beside every changeset and every revision in a
 * file's history.
 */
export declare function CommitCard({ commit, refs, compact, onSelectParent }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=CommitCard.d.ts.map