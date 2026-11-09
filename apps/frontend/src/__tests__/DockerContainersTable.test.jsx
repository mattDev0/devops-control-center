import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DockerContainersTable from '../components/dashboard/DockerContainersTable';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: { fetchDockerContainerStats: vi.fn() },
}));

const CONTAINERS = [{ id: 'abc123', name: 'web', state: 'running', ports: '' }];
const STATS = { cpu_percent: 12.5, memory_percent: 40, memory_usage_bytes: 1048576, memory_limit_bytes: 4194304 };

function renderTable() {
  return render(
    <DockerContainersTable
      token="t"
      role="admin"
      containers={CONTAINERS}
      loading={false}
      fetchContainers={() => {}}
      handleContainerAction={() => {}}
      onViewLogs={() => {}}
      stale={false}
      unavailable={false}
      lastUpdated={Date.now()}
    />
  );
}

// Runs one 6 s poll cycle and lets the settled promises update state.
async function nextPoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
}

describe('DockerContainersTable stats freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchDockerContainerStats.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows live stats, keeps them through one failure, and flags them stale after two', async () => {
    api.fetchDockerContainerStats
      .mockResolvedValueOnce(STATS)
      .mockRejectedValue(new Error('boom'));
    renderTable();
    await act(async () => {});
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.queryByText('Stats stale')).toBeNull();

    await nextPoll();
    expect(screen.queryByText('Stats stale')).toBeNull();

    await nextPoll();
    expect(screen.getByText('Stats stale')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
  });

  it('clears the stale flag when a poll succeeds again', async () => {
    api.fetchDockerContainerStats
      .mockResolvedValueOnce(STATS)
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ ...STATS, cpu_percent: 3 });
    renderTable();
    await act(async () => {});
    await nextPoll();
    await nextPoll();
    expect(screen.getByText('Stats stale')).toBeInTheDocument();

    await nextPoll();
    expect(screen.queryByText('Stats stale')).toBeNull();
    expect(screen.getByText('3.0%')).toBeInTheDocument();
  });

  it('shows "Stats unavailable" instead of loading forever when stats never arrive', async () => {
    api.fetchDockerContainerStats.mockRejectedValue(new Error('boom'));
    renderTable();
    await act(async () => {});
    expect(screen.getByText('Loading stats...')).toBeInTheDocument();

    await nextPoll();
    expect(screen.getByText('Stats unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Loading stats...')).toBeNull();
  });

  it('treats a hung stats request as a failure via the 5 s deadline', async () => {
    api.fetchDockerContainerStats.mockImplementation((_id, _token, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      })
    );
    renderTable();
    await nextPoll();
    await nextPoll();
    expect(screen.getByText('Stats unavailable')).toBeInTheDocument();
  });
});
