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
