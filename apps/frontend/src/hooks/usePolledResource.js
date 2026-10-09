import { useCallback, useEffect, useRef, useState } from 'react';

// Own the request, timer and cleanup together. A retired session must never
// overwrite current data or log out the user after a new login.
export function usePolledResource({ token, enabled = true, fetcher, initialData,
  onUnauthorized, interval = 30000, accept, errorData, label }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(Boolean(token && enabled));
  const refreshRef = useRef(null);

  useEffect(() => {
    setData(initialData);
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
        try {
          const result = await fetcher(token, controller.signal);
          if (!controller.signal.aborted && (!accept || accept(result))) setData(result);
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error(`Failed to fetch ${label}`, error);
          if (error.message === 'UNAUTHORIZED') onUnauthorized();
          else if (errorData !== undefined) setData(errorData);
        } finally {
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
  }, [token, enabled, fetcher, initialData, onUnauthorized, interval, accept, errorData, label]);

  const refresh = useCallback((delay = 0) => refreshRef.current?.(delay), []);
  return { data, loading, refresh };
}
