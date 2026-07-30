interface Props {
    orientation: 'horizontal' | 'vertical';
    /** Current size of the leading pane, in pixels. */
    size: number;
    onResize: (size: number) => void;
    min?: number;
    max?: number;
}
/**
 * Drag handle between two panes. Pointer capture keeps the drag alive when the
 * cursor outruns the 5px handle, which is the difference between a splitter
 * that feels solid and one that keeps slipping.
 */
export declare function Splitter({ orientation, size, onResize, min, max }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=Splitter.d.ts.map