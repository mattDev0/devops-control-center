import { Server, Activity, Clock, LineChart } from 'lucide-react';

export default function MetricsCards({
  health,
  loading,
  fetchHealth,
  token
}) {
  const formatUptime = (seconds) => {
    if (!seconds) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <>
      {/* Production Agent status */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 h-fit">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Server className="text-blue-400" /> Production Agent
          </h2>
          <div className={`w-3 h-3 rounded-full ${health?.os_name === 'Error' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
        </div>

        {loading ? (
          <div className="animate-pulse flex flex-col gap-4">
            <div className="h-4 bg-slate-700 rounded w-3/4"></div>
            <div className="h-4 bg-slate-700 rounded w-1/2"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
              <span className="text-slate-400 flex items-center gap-2"><Activity className="w-4 h-4" /> OS</span>
              <span className="font-mono text-sm bg-slate-900 px-2 py-1 rounded text-emerald-400">
                {health?.os_name} {health?.os_version}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
              <span className="text-slate-400 flex items-center gap-2"><Clock className="w-4 h-4" /> Uptime</span>
              <span className="font-mono text-sm bg-slate-900 px-2 py-1 rounded text-emerald-400">
                {formatUptime(health?.uptime_seconds)}
              </span>
            </div>
          </div>
        )}
        
        <button 
          onClick={fetchHealth}
          className="w-full mt-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded transition-colors"
        >
          Refresh Status
        </button>
      </div>

      {/* Grafana embedded metrics panels */}
      <div className="mt-6 bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl md:col-span-2 lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-200">
            <LineChart className="text-pink-400" /> System Metrics (Grafana)
          </h2>
          <span className="text-xs font-semibold text-pink-400 bg-pink-500/10 px-2 py-1 rounded">Live via Prometheus</span>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Visualizing real-time telemetry from the Rust Agent node_exporter.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#0f172a] border border-slate-900 rounded p-1 h-64 relative overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none z-0">
              <LineChart className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">CPU Usage Panel</p>
              <p className="text-xs opacity-50 text-center px-4 mt-1">Dashboards proxied via /grafana/</p>
            </div>
            {token && (
              <iframe 
                src="grafana/d-solo/rYdddlPWk/node-exporter-full?orgId=1&timezone=browser&var-ds_prometheus=cfmh94yfqwjcwd&var-job=node&var-nodename=ac1f709ef5f4&var-node=node-exporter:9100&refresh=1m&panelId=77" 
                width="100%" 
                height="100%" 
                frameBorder="0" 
                className="relative z-10"
                title="CPU Usage"
              ></iframe>
            )}
          </div>

          <div className="bg-[#0f172a] border border-slate-900 rounded p-1 h-64 relative overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none z-0">
              <Activity className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Memory Usage Panel</p>
              <p className="text-xs opacity-50 text-center px-4 mt-1">Dashboards proxied via /grafana/</p>
            </div>
            {token && (
              <iframe 
                src="grafana/d-solo/rYdddlPWk/node-exporter-full?orgId=1&timezone=browser&var-ds_prometheus=cfmh94yfqwjcwd&var-job=node&var-nodename=ac1f709ef5f4&var-node=node-exporter:9100&refresh=1m&panelId=78" 
                width="100%" 
                height="100%" 
                frameBorder="0" 
                className="relative z-10"
                title="Memory Usage"
              ></iframe>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
