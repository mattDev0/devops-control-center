import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDockerContainerLogs } from '../hooks/useLogs';

const CONTAINER = { id: 'abc' };

describe('useDockerContainerLogs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stops retrying on 403 and shows admin access message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useDockerContainerLogs('t', CONTAINER, true)
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual(['⚠️ Log access needs an admin session.']);
  });

  it('retries on 500 error and displays reconnecting message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, unmount } = renderHook(() =>
      useDockerContainerLogs('t', CONTAINER, true)
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.current[0]).toBe('⚠️ Log stream disconnected. Retrying...');

    unmount();
  });
});
