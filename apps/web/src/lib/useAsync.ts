import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncResult<T> {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
}

/**
 * Minimal data-fetching hook.
 *
 * Requests are sequenced so a slow response can never overwrite a newer one —
 * clicking quickly down a file list otherwise leaves you looking at a diff you
 * already navigated away from.
 */
export function useAsync<T>(
  run: () => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean; keepPreviousData?: boolean } = {},
): AsyncResult<T> {
  const { enabled = true, keepPreviousData = false } = options;
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(0);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const ticket = ++sequence.current;
    setLoading(true);
    setError(undefined);
    if (!keepPreviousData) setData(undefined);

    runRef
      .current()
      .then((result) => {
        if (ticket !== sequence.current) return;
        setData(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (ticket !== sequence.current) return;
        setError((cause as Error).message);
        setLoading(false);
      });

    return () => {
      // Invalidate this request so a late resolution is ignored.
      if (ticket === sequence.current) sequence.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading, reload };
}
