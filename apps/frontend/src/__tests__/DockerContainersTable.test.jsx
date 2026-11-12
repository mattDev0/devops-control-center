import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DockerContainersTable from '../components/dashboard/DockerContainersTable';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: { fetchDockerContainerStats: vi.fn() },
}));

const CONTAINERS = [{ id: 'abc123', name: 'web', state: 'running', ports: '' }];
const STATS = { cpu_percent: 12.5, memory_percent: 40, memory_usage_bytes: 1048576, memory_limit_bytes: 4194304 };

function renderTable(props = {}) {
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
      {...props}
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

describe('DockerContainersTable logs button', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchDockerContainerStats.mockReset();
    api.fetchDockerContainerStats.mockResolvedValue(STATS);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function renderWithRole(role) {
    let result;
    await act(async () => {
      result = render(
        <DockerContainersTable
          token="t"
          role={role}
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
    });
    return result;
  }

  it('disables View Container Logs button for viewer', async () => {
    await renderWithRole('viewer');
    const button = screen.getByTitle('View Container Logs');
    expect(button).toBeDisabled();
  });

  it('enables View Container Logs button for admin', async () => {
    await renderWithRole('admin');
    const button = screen.getByTitle('View Container Logs');
    expect(button).not.toBeDisabled();
  });
});

describe('DockerContainersTable loop stability and reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchDockerContainerStats.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-rendering with a fresh containers array containing the same running ID does not abort or re-run stats poll early', async () => {
    api.fetchDockerContainerStats.mockResolvedValue(STATS);

    const { rerender } = renderTable({
      containers: [{ id: 'c1', name: 'web', state: 'running', ports: '' }],
    });
    await act(async () => {});
    expect(api.fetchDockerContainerStats).toHaveBeenCalledTimes(1);

    // Advance halfway through interval (3s of 6s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.fetchDockerContainerStats).toHaveBeenCalledTimes(1);

    // Re-render with new array reference but same running ID
    rerender(
      <DockerContainersTable
        token="t"
        role="admin"
        containers={[{ id: 'c1', name: 'web', state: 'running', ports: '' }]}
        loading={false}
        fetchContainers={() => {}}
        handleContainerAction={() => {}}
        onViewLogs={() => {}}
        stale={false}
        unavailable={false}
        lastUpdated={Date.now()}
      />
    );
    await act(async () => {});
    expect(api.fetchDockerContainerStats).toHaveBeenCalledTimes(1);

    // Advance the remaining 3s to reach the original 6s interval deadline
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.fetchDockerContainerStats).toHaveBeenCalledTimes(2);
  });

  it('invokes onUnauthorized when fetchDockerContainerStats rejects with UNAUTHORIZED', async () => {
    const onUnauthorized = vi.fn();
    api.fetchDockerContainerStats.mockRejectedValue(new Error('UNAUTHORIZED'));

    renderTable({
      onUnauthorized,
      containers: [{ id: 'c1', name: 'web', state: 'running', ports: '' }],
    });
    await act(async () => {});

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Stats stale')).toBeNull();
  });

  it('clears stats when transitioning from running to exited and back to running, showing Loading stats...', async () => {
    api.fetchDockerContainerStats.mockResolvedValue(STATS);

    const { rerender } = renderTable({
      containers: [{ id: 'c1', name: 'web', state: 'running', ports: '' }],
    });
    await act(async () => {});
    expect(screen.getByText('12.5%')).toBeInTheDocument();

    // Transition container to exited
    rerender(
      <DockerContainersTable
        token="t"
        role="admin"
        containers={[{ id: 'c1', name: 'web', state: 'exited', ports: '' }]}
        loading={false}
        fetchContainers={() => {}}
        handleContainerAction={() => {}}
        onViewLogs={() => {}}
        stale={false}
        unavailable={false}
        lastUpdated={Date.now()}
      />
    );
    await act(async () => {});
    expect(screen.queryByText('12.5%')).toBeNull();

    // Container stats will hang/not resolve immediately when transitioning back to running
    api.fetchDockerContainerStats.mockImplementation(() => new Promise(() => {}));

    rerender(
      <DockerContainersTable
        token="t"
        role="admin"
        containers={[{ id: 'c1', name: 'web', state: 'running', ports: '' }]}
        loading={false}
        fetchContainers={() => {}}
        handleContainerAction={() => {}}
        onViewLogs={() => {}}
        stale={false}
        unavailable={false}
        lastUpdated={Date.now()}
      />
    );
    await act(async () => {});
    expect(screen.getByText('Loading stats...')).toBeInTheDocument();
    expect(screen.queryByText('12.5%')).toBeNull();
  });
});
