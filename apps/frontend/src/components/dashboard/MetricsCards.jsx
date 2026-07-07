import { Server, Activity, Clock, LineChart, RefreshCw, AlertTriangle } from 'lucide-react';

export default function MetricsCards({
  health,
  loading,
  fetchHealth
}) {
  const formatUptime = (seconds) => {
    if (!seconds) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const isErrorState = !health || health.os_name === 'Error';

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col justify-between h-full">
      <div>
        {/* Unified Card Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
            <Server className="w-4 h-4 text-[var(--accent-primary)]" />
            Production Agent
          </h2>
          <div className="flex items-center gap-2">
            <span 
              className={`w-2 h-2 rounded-full ${isErrorState ? 'bg-[var(--status-error)]' : 'bg-[var(--status-success)]'}`}
              title={isErrorState ? 'Offline' : 'Online'}
            ></span>
            <button 
              onClick={fetchHealth}
              disabled={loading}
              className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors disabled:opacity-50"
              title="Refresh Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 py-2">
            <div className="h-6 bg-[var(--bg-elevated)] skeleton w-full"></div>
            <div className="h-6 bg-[var(--bg-elevated)] skeleton w-5/6"></div>
          </div>
        ) : isErrorState ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-[var(--status-error)] gap-2">
            <AlertTriangle className="w-8 h-8 text-[var(--status-error)]" />
            <div className="text-xs font-bold">Agent Offline</div>
            <p className="text-[10px] text-[var(--fg-subtle)] max-w-[200px]">
              Connection to systems agent endpoints failed or is unauthorized.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center py-1.5 border-b border-[var(--border-muted)]/50">
              <span className="text-[var(--fg-muted)] text-xs flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-[var(--fg-subtle)]" /> OS Version
              </span>
              <span className="font-mono text-xs bg-[var(--bg-inset)] px-2 py-0.5 rounded border border-[var(--border-default)] text-[var(--fg-default)] font-medium">
                {health.os_name} {health.os_version}
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-[var(--border-muted)]/50">
              <span className="text-[var(--fg-muted)] text-xs flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[var(--fg-subtle)]" /> Uptime
              </span>
              <span className="font-mono text-xs bg-[var(--bg-inset)] px-2 py-0.5 rounded border border-[var(--border-default)] text-[var(--fg-default)] font-medium">
                {formatUptime(health.uptime_seconds)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SystemMetricsPanel({ token }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col">
      {/* Unified Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <LineChart className="w-4 h-4 text-[var(--accent-secondary)]" />
          System Metrics (Grafana)
        </h2>
        <span className="text-[10px] font-semibold text-[var(--accent-secondary)] bg-[var(--accent-primary-muted)] border border-[var(--accent-secondary)]/20 px-2 py-0.5 rounded">
          Live via Prometheus
        </span>
      </div>
      
      <p className="text-xs text-[var(--fg-muted)] mb-4 leading-normal">
        Visualizing real-time telemetry from the Rust Agent node_exporter nodes.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-1 h-56 relative overflow-hidden flex items-center justify-center">
          {token ? (
            <iframe 
              src="grafana/d-solo/rYdddlPWk/node-exporter-full?orgId=1&timezone=browser&var-ds_prometheus=cfmh94yfqwjcwd&var-job=node&var-nodename=ac1f709ef5f4&var-node=node-exporter:9100&refresh=1m&panelId=77" 
              width="100%" 
              height="100%" 
              frameBorder="0" 
              className="relative z-10"
              title="Grafana CPU Usage Metrics"
            ></iframe>
          ) : (
            <div className="w-full h-full bg-[var(--bg-inset)] flex items-center justify-center p-2">
              <div className="skeleton w-full h-full rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--fg-subtle)] text-xs">
                <span>Loading CPU Metrics...</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-1 h-56 relative overflow-hidden flex items-center justify-center">
          {token ? (
            <iframe 
              src="grafana/d-solo/rYdddlPWk/node-exporter-full?orgId=1&timezone=browser&var-ds_prometheus=cfmh94yfqwjcwd&var-job=node&var-nodename=ac1f709ef5f4&var-node=node-exporter:9100&refresh=1m&panelId=78" 
              width="100%" 
              height="100%" 
              frameBorder="0" 
              className="relative z-10"
              title="Grafana Memory Usage Metrics"
            ></iframe>
          ) : (
            <div className="w-full h-full bg-[var(--bg-inset)] flex items-center justify-center p-2">
              <div className="skeleton w-full h-full rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--fg-subtle)] text-xs">
                <span>Loading Memory Metrics...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
