import type { InlineSpan } from '@gitscope/core';
import { type Token } from '../../lib/highlight';
interface Props {
    text: string;
    tokens?: Token[];
    spans?: InlineSpan[];
    /** Which side of the diff this line belongs to, for the highlight colour. */
    side: 'a' | 'b';
    showWhitespace?: boolean;
}
export declare const LineText: import("react").NamedExoticComponent<Props>;
export {};
//# sourceMappingURL=LineText.d.ts.map