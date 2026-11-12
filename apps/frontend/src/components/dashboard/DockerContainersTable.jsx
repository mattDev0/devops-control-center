import { useState, useEffect } from 'react';
import { RotateCw, FileText, Play, Square, HardDrive, Activity } from 'lucide-react';
import { api } from '../../services/api';
import StaleNotice from './StaleNotice';

// Consecutive failed stats polls before a container's CPU/MEM is flagged.
export const STATS_STALE_AFTER_FAILURES = 2;

export default function DockerContainersTable({
  token,
  role,
  containers,
  loading,
  fetchContainers,
  handleContainerAction,
  onViewLogs,
  onUnauthorized,
  stale,
  unavailable,
  lastUpdated,
}) {
  const [confirmAction, setConfirmAction] = useState(null); // { id, type }
  const [stats, setStats] = useState({}); // { [id]: { cpu_percent, memory_percent, memory_usage_bytes, memory_limit_bytes } }
  const [statsFailures, setStatsFailures] = useState({}); // { [id]: consecutive failed polls }

  const runningIdsKey = (containers || [])
    .filter((c) => c.state === 'running')
    .map((c) => c.id)
    .sort()
    .join(',');

  useEffect(() => {
    setStats({});
    setStatsFailures({});
  }, [token]);

  useEffect(() => {
    const runningIds = new Set(runningIdsKey ? runningIdsKey.split(',') : []);
    setStats((prev) => {
      const next = {};
      for (const [id, val] of Object.entries(prev)) {
        if (runningIds.has(id)) next[id] = val;
      }
      return next;
    });
    setStatsFailures((prev) => {
      const next = {};
      for (const [id, val] of Object.entries(prev)) {
        if (runningIds.has(id)) next[id] = val;
      }
      return next;
    });
  }, [runningIdsKey]);

  const clearContainerStats = (id) => {
    setStats((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setStatsFailures((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Periodic stats polling for running containers
  useEffect(() => {
    if (!runningIdsKey || !token) return;

    const controller = new AbortController();
    let inFlight = false;

    const fetchStats = async () => {
      if (controller.signal.aborted || inFlight) return;
      const runningIds = runningIdsKey.split(',').filter(Boolean);
      if (runningIds.length === 0) return;

      inFlight = true;
      try {
        const promises = runningIds.map(async (id) => {
          const request = new AbortController();
          const deadline = setTimeout(() => request.abort(), 5000);
          const abortRequest = () => request.abort();
          controller.signal.addEventListener('abort', abortRequest, { once: true });
          try {
            const containerStats = await api.fetchDockerContainerStats(id, token, request.signal);
            return { id, stats: containerStats };
          } finally {
            clearTimeout(deadline);
            controller.signal.removeEventListener('abort', abortRequest);
          }
        });

        const results = await Promise.allSettled(promises);
        if (controller.signal.aborted) return;

        const unauthorized = results.some(
          (res) => res.status === 'rejected' && res.reason?.message === 'UNAUTHORIZED'
        );
        if (unauthorized) {
          onUnauthorized?.();
          return;
        }

        const updates = {};
        const failed = [];
        for (let i = 0; i < results.length; i++) {
          const res = results[i];
          if (res.status === 'fulfilled') {
            updates[res.value.id] = res.value.stats;
          } else {
            failed.push(runningIds[i]);
            console.error(`Failed to fetch stats for ${runningIds[i]}`, res.reason);
          }
        }
        if (Object.keys(updates).length > 0) {
          setStats((prev) => ({
            ...prev,
            ...updates,
          }));
        }
        setStatsFailures((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(updates)) next[id] = 0;
          for (const id of failed) next[id] = (prev[id] || 0) + 1;
          return next;
        });
      } finally {
        inFlight = false;
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 6000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [runningIdsKey, token, onUnauthorized]);

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <HardDrive className="w-4 h-4 text-[var(--accent-primary)]" /> Host Docker Containers
        </h2>
        <button 
          onClick={fetchContainers}
          disabled={loading}
          className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors disabled:opacity-50"
          title="Refresh Containers"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <StaleNotice stale={stale} unavailable={unavailable} lastUpdated={lastUpdated} />

      <div className="overflow-x-auto relative flex-grow max-h-[380px]">
        <table className={`w-full text-left text-xs text-[var(--fg-muted)] ${stale ? 'opacity-60' : ''}`}>
          <thead className="text-[10px] uppercase bg-[var(--bg-canvas)] text-[var(--fg-subtle)] border-b border-[var(--border-default)] sticky top-0 z-10 font-semibold tracking-wider">
            <tr>
              <th className="px-3 py-2.5">Container ID</th>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Telemetry (CPU / MEM)</th>
              <th className="px-3 py-2.5">Ports</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-muted)]/50">
            {loading && containers.length === 0 ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-16"></div></td>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-24"></div></td>
                  <td className="px-3 py-3"><div className="h-5 skeleton w-16"></div></td>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-32"></div></td>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-16"></div></td>
                  <td className="px-3 py-3 text-right"><div className="h-6 skeleton w-14 ml-auto"></div></td>
                </tr>
              ))
            ) : containers.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-3 py-10 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Activity className="w-8 h-8 text-[var(--fg-subtle)] mb-2 opacity-50" />
                    <h3 className="text-xs font-semibold text-[var(--fg-muted)]">
                      {unavailable ? 'Container list unavailable' : 'No Containers Found'}
                    </h3>
                    <p className="text-[10px] text-[var(--fg-subtle)] max-w-xs mt-1">
                      {unavailable
                        ? 'The Docker host did not respond.'
                        : 'No active containers detected on the host socket.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              containers.map((container) => {
                const containerStats = stats[container.id];
                const isRunning = container.state === 'running';
                const statsFailing = (statsFailures[container.id] || 0) >= STATS_STALE_AFTER_FAILURES;

                return (
                  <tr key={container.id} className="hover:bg-[var(--interactive-hover)] transition-colors">
                    <td className="px-3 py-2.5 font-mono text-[10px] text-[var(--fg-subtle)]">{container.id}</td>
                    <td className="px-3 py-2.5 font-medium text-[var(--fg-default)]">{container.name}</td>
                    <td className="px-3 py-2.5">
                      <span 
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                          isRunning 
                            ? 'bg-[var(--status-success-muted)] text-[var(--status-success)] border-[var(--status-success)]/10' 
                            : container.state === 'paused'
                            ? 'bg-[var(--status-warning-muted)] text-[var(--status-warning)] border-[var(--status-warning)]/20'
                            : 'bg-[var(--status-neutral-muted)] text-[var(--fg-muted)] border-[var(--border-default)]'
                        }`}
                      >
                        {container.state}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {isRunning && containerStats ? (
                        <div
                          className={`flex flex-col gap-1 w-32 font-mono text-[9px] text-[var(--fg-subtle)] ${statsFailing ? 'opacity-60' : ''}`}
                          title={statsFailing ? 'Stats stale: recent polls failed' : undefined}
                        >
                          {statsFailing && (
                            <span className="text-[var(--status-warning)] uppercase font-semibold">Stats stale</span>
                          )}
                          <div className="flex justify-between items-center">
                            <span>CPU</span>
                            <span>{containerStats.cpu_percent.toFixed(1)}%</span>
                          </div>
                          <div className="w-full h-1 bg-[var(--bg-inset)] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[var(--accent-primary)]" 
                              style={{ width: `${Math.min(100, containerStats.cpu_percent)}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between items-center mt-0.5">
                            <span>MEM</span>
                            <span>{formatBytes(containerStats.memory_usage_bytes)}</span>
                          </div>
                          <div className="w-full h-1 bg-[var(--bg-inset)] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[var(--status-success)]" 
                              style={{ width: `${Math.min(100, containerStats.memory_percent)}%` }}
                            ></div>
                          </div>
                        </div>
                      ) : isRunning && statsFailing ? (
                        <div className="text-[10px] text-[var(--fg-subtle)] italic">Stats unavailable</div>
                      ) : isRunning ? (
                        <div className="text-[10px] text-[var(--fg-subtle)] italic animate-pulse">Loading stats...</div>
                      ) : (
                        <span className="text-[10px] text-[var(--fg-subtle)] font-mono">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-[var(--fg-subtle)] font-mono truncate max-w-[120px]">
                      {container.ports || 'None'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {confirmAction && confirmAction.id === container.id ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[9px] text-[var(--status-warning)] font-semibold uppercase animate-pulse">
                              Confirm {confirmAction.type}?
                            </span>
                            <button 
                              onClick={() => {
                                if (confirmAction.type === 'stop') {
                                  clearContainerStats(confirmAction.id);
                                }
                                handleContainerAction(confirmAction.id, confirmAction.type);
                                setConfirmAction(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-[var(--status-error)] hover:bg-[var(--status-error)]/85 text-[var(--fg-on-emphasis)] text-[9px] font-bold cursor-pointer"
                            >
                              Yes
                            </button>
                            <button 
                              onClick={() => setConfirmAction(null)}
                              className="px-1.5 py-0.5 rounded bg-[var(--interactive-hover)] text-[var(--fg-default)] text-[9px] font-medium cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            {isRunning ? (
                              <button
                                onClick={() => setConfirmAction({ id: container.id, type: 'stop' })}
                                disabled={role === 'viewer'}
                                className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-muted)] transition-colors disabled:opacity-50"
                                title="Stop Container"
                              >
                                <Square className="w-3.5 h-3.5 fill-current" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleContainerAction(container.id, 'start')}
                                disabled={role === 'viewer'}
                                className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--status-success)] hover:bg-[var(--status-success-muted)] transition-colors disabled:opacity-50"
                                title="Start Container"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>
                            )}
                            {isRunning && (
                              <button
                                onClick={() => {
                                  clearContainerStats(container.id);
                                  handleContainerAction(container.id, 'restart');
                                }}
                                disabled={role === 'viewer'}
                                className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--interactive-hover)] transition-colors disabled:opacity-50"
                                title="Restart Container"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => onViewLogs(container)}
                              disabled={role === 'viewer'}
                              className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-default)] hover:bg-[var(--interactive-hover)] transition-colors disabled:opacity-50"
                              title="View Container Logs"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
