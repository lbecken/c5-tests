import { useCallback, useEffect, useRef, useState } from 'react';

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
export function Splitter({ orientation, size, onResize, min = 140, max = 2000 }: Props) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ position: 0, size: 0 });

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const position = orientation === 'horizontal' ? event.clientX : event.clientY;
      const next = origin.current.size + (position - origin.current.position);
      onResize(Math.max(min, Math.min(max, next)));
    },
    [orientation, onResize, min, max],
  );

  useEffect(() => {
    if (!dragging) return;
    const stop = (): void => setDragging(false);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stop);
    document.body.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, onPointerMove, orientation]);

  return (
    <div
      className="splitter"
      data-orientation={orientation}
      role="separator"
      aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
      onPointerDown={(event) => {
        origin.current = {
          position: orientation === 'horizontal' ? event.clientX : event.clientY,
          size,
        };
        setDragging(true);
      }}
      onDoubleClick={() => onResize(orientation === 'horizontal' ? 320 : 340)}
    />
  );
}
