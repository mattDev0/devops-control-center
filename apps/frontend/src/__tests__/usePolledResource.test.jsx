import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePolledResource } from '../hooks/usePolledResource';
import {
  useServerHealth,
  useDeployments,
  usePodHealth,
  useWorkflows,
  useDockerContainers,
} from '../hooks/useDashboardResources';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    fetchHealth: vi.fn(),
    fetchDeployments: vi.fn(),
    fetchPodHealth: vi.fn(),
    fetchWorkflows: vi.fn(),
    fetchDockerContainers: vi.fn(),
  },
}));

// Stable references required by usePolledResource's effect dependency array.
const EMPTY_ITEMS = [];
const ERROR_FALLBACK = { status: 'offline' };

describe('usePolledResource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not fetch when token is missing or enabled is false', () => {
    const fetcher = vi.fn();
    const onUnauthorized = vi.fn();

    const { result, rerender } = renderHook(
      ({ token, enabled }) =>
        usePolledResource({
          token,
          enabled,
          fetcher,
          initialData: EMPTY_ITEMS,
          onUnauthorized,
          label: 'test',
        }),
      { initialProps: { token: '', enabled: true } }
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(EMPTY_ITEMS);
    expect(fetcher).not.toHaveBeenCalled();

    rerender({ token: 'jwt-token', enabled: false });
    expect(result.current.loading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches immediately on mount and polls on the configured interval', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(['first'])
      .mockResolvedValueOnce(['second']);
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: EMPTY_ITEMS,
        onUnauthorized,
        interval: 10000,
        label: 'items',
      })
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('jwt-token', expect.any(AbortSignal));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(['first']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(['second']);
  });

  it('deduplicates concurrent in-flight requests and supports delayed refresh', async () => {
    let resolveFetch;
    const fetcher = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: null,
        onUnauthorized,
        interval: 0,
        label: 'manual',
      })
    );

    expect(fetcher).toHaveBeenCalledTimes(1);

    // Calling refresh while initial request is still pending reuses the in-flight promise
    act(() => {
      result.current.refresh();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true });
      await Promise.resolve();
    });
    expect(result.current.data).toEqual({ ok: true });

    fetcher.mockResolvedValueOnce({ ok: 'delayed' });
    act(() => {
      result.current.refresh(1500);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ ok: 'delayed' });
  });

  it('calls onUnauthorized on UNAUTHORIZED error and uses errorData on other errors', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('UNAUTHORIZED'))
      .mockRejectedValueOnce(new Error('Network failure'));
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: null,
        errorData: ERROR_FALLBACK,
        onUnauthorized,
        interval: 0,
        label: 'health',
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBeNull();

    await act(async () => {
      await result.current.refresh();
    });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(ERROR_FALLBACK);
  });

  it('aborts in-flight requests on token change so a retired session cannot overwrite state', async () => {
    const resolvers = [];
    const fetcher = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          resolvers.push({ resolve, reject });
        })
    );
    const onUnauthorized = vi.fn();

    const { result, rerender } = renderHook(
      ({ token }) =>
        usePolledResource({
          token,
          fetcher,
          initialData: 'initial',
          onUnauthorized,
          interval: 0,
          label: 'session-test',
        }),
      { initialProps: { token: 'old-token' } }
    );

    const firstSignal = fetcher.mock.calls[0][1];
    expect(firstSignal.aborted).toBe(false);

    // Rotate token before the first request settles
    rerender({ token: 'new-token' });
    expect(firstSignal.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Late resolution or UNAUTHORIZED from the retired session is ignored
    await act(async () => {
      resolvers[0].reject(new Error('UNAUTHORIZED'));
      resolvers[1].resolve('fresh-data');
      await Promise.resolve();
    });

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(result.current.data).toBe('fresh-data');
  });

  it('hung request times out and polling resumes', async () => {
    const fetcher = vi.fn(
      (_token, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        )
    );
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: EMPTY_ITEMS,
        onUnauthorized,
        interval: 5000,
        timeoutMs: 1000,
        label: 'hung-test',
      })
    );

    expect(result.current.loading).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/timed out/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('marks data stale after two failures and recovers on success', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(['a'])
      .mockRejectedValueOnce(new Error('Failure 1'))
      .mockRejectedValueOnce(new Error('Failure 2'))
      .mockResolvedValueOnce(['b']);
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: EMPTY_ITEMS,
        onUnauthorized,
        interval: 1000,
        label: 'stale-test',
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toEqual(['a']);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();

    // First failure
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.data).toEqual(['a']);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBe('Failure 1');

    // Second failure
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.data).toEqual(['a']);
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toBe('Failure 2');

    // Recovery success
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.data).toEqual(['b']);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('one failure is not marked stale', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(['initial'])
      .mockRejectedValueOnce(new Error('Temporary glitch'));
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: EMPTY_ITEMS,
        onUnauthorized,
        interval: 1000,
        label: 'one-fail-test',
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.data).toEqual(['initial']);
    expect(result.current.stale).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBe('Temporary glitch');
    expect(result.current.data).toEqual(['initial']);
  });

  it('never succeeded is not marked stale', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('Initial error 1'))
      .mockRejectedValueOnce(new Error('Initial error 2'));
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: EMPTY_ITEMS,
        onUnauthorized,
        interval: 1000,
        label: 'never-succeeded-test',
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.stale).toBe(false);
    expect(result.current.lastUpdated).toBeNull();
    expect(result.current.error).toBe('Initial error 1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.stale).toBe(false);
    expect(result.current.lastUpdated).toBeNull();
    expect(result.current.error).toBe('Initial error 2');
  });

  it('accept rejection counts as a failure', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: EMPTY_ITEMS,
        accept: Array.isArray,
        onUnauthorized,
        interval: 1000,
        label: 'accept-test',
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();

    // First rejected response
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBe('Unexpected response');

    // Second rejected response
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toBe('Unexpected response');
  });

  it('unmount aborts the in-flight request without an error', async () => {
    let capturedSignal;
    const fetcher = vi.fn(
      (_token, signal) => {
        capturedSignal = signal;
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        );
      }
    );
    const onUnauthorized = vi.fn();

    const { unmount } = renderHook(() =>
      usePolledResource({
        token: 'jwt-token',
        fetcher,
        initialData: EMPTY_ITEMS,
        onUnauthorized,
        interval: 5000,
        timeoutMs: 1000,
        label: 'unmount-test',
      })
    );

    expect(capturedSignal.aborted).toBe(false);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(capturedSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useDashboardResources hooks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('useServerHealth falls back to HEALTH_ERROR when fetchHealth fails', async () => {
    api.fetchHealth.mockRejectedValueOnce(new Error('Agent unreachable'));
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() => useServerHealth('jwt-token', onUnauthorized));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toEqual({
      os_name: 'Error',
      os_version: 'N/A',
      uptime_seconds: 0,
    });
  });

  it('useDeployments and usePodHealth wait for kubernetesAvailable and validate array responses', async () => {
    api.fetchDeployments
      .mockResolvedValueOnce({ invalid: true })
      .mockResolvedValueOnce([{ id: 'dep-1' }]);
    api.fetchPodHealth.mockResolvedValueOnce([{ namespace: 'devops' }]);
    const onUnauthorized = vi.fn();

    const { result: depResult, rerender } = renderHook(
      ({ enabled }) => useDeployments('jwt-token', enabled, onUnauthorized),
      { initialProps: { enabled: false } }
    );
    const { result: podResult } = renderHook(() =>
      usePodHealth('jwt-token', false, onUnauthorized)
    );

    expect(api.fetchDeployments).not.toHaveBeenCalled();
    expect(api.fetchPodHealth).not.toHaveBeenCalled();
    expect(depResult.current.data).toEqual([]);
    expect(podResult.current.data).toBeNull();

    // Enable Kubernetes polling; non-array response should be rejected by accept: Array.isArray
    rerender({ enabled: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(depResult.current.data).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(depResult.current.data).toEqual([{ id: 'dep-1' }]);
  });

  it('useWorkflows fetches once without interval timer and useDockerContainers polls every 30s', async () => {
    api.fetchWorkflows.mockResolvedValue([{ id: 1, name: 'CI' }]);
    api.fetchDockerContainers.mockResolvedValue([{ id: 'c1', name: 'caddy-proxy' }]);
    const onUnauthorized = vi.fn();

    const { result: wfResult } = renderHook(() => useWorkflows('jwt-token', onUnauthorized));
    const { result: dockerResult } = renderHook(() =>
      useDockerContainers('jwt-token', onUnauthorized)
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(wfResult.current.data).toEqual([{ id: 1, name: 'CI' }]);
    expect(dockerResult.current.data).toEqual([{ id: 'c1', name: 'caddy-proxy' }]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    // Workflows has interval: 0 so it only ran once on mount; Docker containers polled twice more
    expect(api.fetchWorkflows).toHaveBeenCalledTimes(1);
    expect(api.fetchDockerContainers).toHaveBeenCalledTimes(3);
  });
});
