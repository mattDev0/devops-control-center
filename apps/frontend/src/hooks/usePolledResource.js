import { useCallback, useEffect, useRef, useState } from 'react';

export const STALE_AFTER_FAILURES = 2;

// Own the request, timer and cleanup together. A retired session must never
// overwrite current data or log out the user after a new login.
export function usePolledResource({ token, enabled = true, fetcher, initialData,
  onUnauthorized, interval = 30000, timeoutMs = 10000, accept, errorData, label }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(Boolean(token && enabled));
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [failures, setFailures] = useState(0);
  const refreshRef = useRef(null);

  useEffect(() => {
    setData(initialData);
    setError(null);
    setLastUpdated(null);
    setFailures(0);
    if (!token || !enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeouts = new Set();
    let pending = null;

    const fetchResource = () => {
      if (controller.signal.aborted) return;
      if (pending) return pending;
      setLoading(true);
      pending = (async () => {
        const request = new AbortController();
        let timedOut = false;
        const deadline = setTimeout(() => { timedOut = true; request.abort(); }, timeoutMs);
        const abortRequest = () => request.abort();
        controller.signal.addEventListener('abort', abortRequest, { once: true });
        try {
          const result = await fetcher(token, request.signal);
          if (controller.signal.aborted) return;
          if (!accept || accept(result)) {
            setData(result);
            setLastUpdated(Date.now());
            setFailures(0);
            setError(null);
          } else {
            setFailures(f => f + 1);
            setError('Unexpected response');
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error(`Failed to fetch ${label}`, err);
          if (err.message === 'UNAUTHORIZED') {
            onUnauthorized();
          } else {
            setFailures(f => f + 1);
            setError(timedOut ? `Request timed out after ${timeoutMs / 1000}s` : err.message);
            if (errorData !== undefined) setData(errorData);
          }
        } finally {
          clearTimeout(deadline);
          controller.signal.removeEventListener('abort', abortRequest);
          pending = null;
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
      return pending;
    };

    const refresh = (delay = 0) => {
      if (controller.signal.aborted) return;
      if (!delay) return fetchResource();
      const timeout = setTimeout(() => {
        timeouts.delete(timeout);
        fetchResource();
      }, delay);
      timeouts.add(timeout);
    };

    refreshRef.current = refresh;
    fetchResource();
    const timer = interval ? setInterval(fetchResource, interval) : null;
    return () => {
      controller.abort();
      clearInterval(timer);
      timeouts.forEach(clearTimeout);
      if (refreshRef.current === refresh) refreshRef.current = null;
    };
  }, [token, enabled, fetcher, initialData, onUnauthorized, interval, timeoutMs, accept, errorData, label]);

  const refresh = useCallback((delay = 0) => refreshRef.current?.(delay), []);
  const stale = lastUpdated !== null && failures >= STALE_AFTER_FAILURES;
  return { data, loading, refresh, error, lastUpdated, stale };
}
