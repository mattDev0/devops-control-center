import { useState, useEffect } from 'react';
import { RotateCw, FileText, Play, Square, HardDrive, Activity } from 'lucide-react';
import { api } from '../../services/api';

export default function DockerContainersTable({
  token,
  role,
  containers,
  loading,
  fetchContainers,
  handleContainerAction,
  onViewLogs
}) {
  const [confirmAction, setConfirmAction] = useState(null); // { id, type }
  const [stats, setStats] = useState({}); // { [id]: { cpu_percent, memory_percent, memory_usage_bytes, memory_limit_bytes } }

  // Periodic stats polling for running containers
  useEffect(() => {
    if (!containers || containers.length === 0 || !token) return;

    const fetchStats = async () => {
      const runningContainers = containers.filter(c => c.state === 'running');
      for (const container of runningContainers) {
        try {
          const containerStats = await api.fetchDockerContainerStats(container.id, token);
          setStats(prev => ({
            ...prev,
            [container.id]: containerStats
          }));
        } catch (err) {
          console.error(`Failed to fetch stats for ${container.id}`, err);
        }
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 6000);
    return () => clearInterval(interval);
  }, [containers, token]);

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

      <div className="overflow-x-auto relative flex-grow max-h-[380px]">
        <table className="w-full text-left text-xs text-[var(--fg-muted)]">
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
                    <h3 className="text-xs font-semibold text-[var(--fg-muted)]">No Containers Found</h3>
                    <p className="text-[10px] text-[var(--fg-subtle)] max-w-xs mt-1">
                      No active containers detected on the host socket.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              containers.map((container) => {
                const containerStats = stats[container.id];
                const isRunning = container.state === 'running';

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
                        <div className="flex flex-col gap-1 w-32 font-mono text-[9px] text-[var(--fg-subtle)]">
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
                              className="h-full bg-emerald-500" 
                              style={{ width: `${Math.min(100, containerStats.memory_percent)}%` }}
                            ></div>
                          </div>
                        </div>
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
                                handleContainerAction(confirmAction.id, confirmAction.type);
                                setConfirmAction(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-[var(--status-error)] hover:bg-[var(--status-error)]/85 text-white text-[9px] font-bold cursor-pointer"
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
                                onClick={() => handleContainerAction(container.id, 'restart')}
                                disabled={role === 'viewer'}
                                className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--interactive-hover)] transition-colors disabled:opacity-50"
                                title="Restart Container"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => onViewLogs(container)}
                              className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-default)] hover:bg-[var(--interactive-hover)] transition-colors"
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
