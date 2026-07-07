import { ShieldAlert, CheckCircle2, RefreshCw, Layers } from 'lucide-react';

export default function HealthSLOPanel({ podHealth, loading, fetchPodHealth }) {
  // Aggregate stats across all namespaces
  const aggregate = podHealth ? podHealth.reduce((acc, current) => {
    acc.running += current.running;
    acc.pending += current.pending;
    acc.failed += current.failed;
    acc.crash_loop += current.crash_loop;
    acc.total += current.total;
    return acc;
  }, { running: 0, pending: 0, failed: 0, crash_loop: 0, total: 0 }) : { running: 0, pending: 0, failed: 0, crash_loop: 0, total: 0 };

  const availabilitySLI = aggregate.total > 0 ? (aggregate.running / aggregate.total) * 100 : 100;
  const targetThreshold = 99.0;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
            <Layers className="w-4 h-4 text-[var(--accent-primary)]" /> Pod Health Overview
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchPodHealth}
              disabled={loading}
              className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors disabled:opacity-50"
              title="Refresh Health"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && !podHealth ? (
          <div className="space-y-4 py-4">
            <div className="h-6 bg-[var(--bg-elevated)] skeleton w-full"></div>
            <div className="h-6 bg-[var(--bg-elevated)] skeleton w-5/6"></div>
            <div className="h-6 bg-[var(--bg-elevated)] skeleton w-4/5"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Namespace Table Area */}
            <div className="lg:col-span-8 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase text-[var(--fg-muted)] tracking-wider">Namespace Allocation</h3>
                <span className="text-[10px] text-[var(--fg-subtle)] italic">Derived from active pod statuses</span>
              </div>
              <div className="overflow-x-auto border border-[var(--border-default)] rounded-[var(--radius-md)] bg-[var(--bg-inset)]">
                <table className="min-w-full divide-y divide-[var(--border-default)] text-xs text-left">
                  <thead className="bg-[var(--bg-surface)] text-[var(--fg-muted)] font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Namespace</th>
                      <th className="px-3 py-2 text-right">Running</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                      <th className="px-3 py-2 text-right">Failed</th>
                      <th className="px-3 py-2 text-right">CrashLoop</th>
                      <th className="px-3 py-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-muted)] font-mono text-[var(--fg-default)]">
                    {podHealth && podHealth.map((ns) => {
                      return (
                        <tr key={ns.namespace} className="hover:bg-[var(--interactive-hover)]">
                          <td className="px-3 py-2 font-semibold text-[var(--fg-default)]">ns/{ns.namespace}</td>
                          <td className="px-3 py-2 text-right text-[var(--status-success)]">{ns.running}</td>
                          <td className={`px-3 py-2 text-right ${ns.pending > 0 ? 'text-[var(--status-warning)]' : 'text-[var(--fg-subtle)]'}`}>{ns.pending}</td>
                          <td className={`px-3 py-2 text-right ${ns.failed > 0 ? 'text-[var(--status-error)]' : 'text-[var(--fg-subtle)]'}`}>{ns.failed}</td>
                          <td className={`px-3 py-2 text-right ${ns.crash_loop > 0 ? 'text-[var(--status-error)]' : 'text-[var(--fg-subtle)]'}`}>{ns.crash_loop}</td>
                          <td className="px-3 py-2 text-right font-bold">{ns.total}</td>
                        </tr>
                      );
                    })}
                    {(!podHealth || podHealth.length === 0) && (
                      <tr>
                        <td colSpan="6" className="px-3 py-6 text-center text-[var(--fg-subtle)] italic font-sans">
                          No namespace data active
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visual Gauge Area */}
            <div className="lg:col-span-4 flex flex-col justify-center space-y-4">
              <h3 className="text-xs font-bold uppercase text-[var(--fg-muted)] tracking-wider">Metrics Estimate</h3>
              
              <div className="flex flex-col items-center justify-center bg-[var(--bg-inset)] border border-[var(--border-default)] p-4 rounded-[var(--radius-md)] text-center">
                <div className="relative flex items-center justify-center w-20 h-20 mb-3">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="40" cy="40" r="32" strokeWidth="5" stroke="var(--border-default)" fill="transparent" />
                    <circle 
                      cx="40" 
                      cy="40" 
                      r="32" 
                      strokeWidth="5" 
                      stroke={availabilitySLI < targetThreshold ? 'var(--status-error)' : 'var(--status-success)'} 
                      fill="transparent" 
                      strokeDasharray={2 * Math.PI * 32}
                      strokeDashoffset={2 * Math.PI * 32 * (1 - availabilitySLI / 100)}
                    />
                  </svg>
                  <span className="absolute font-mono text-sm font-bold text-[var(--fg-default)]">{availabilitySLI.toFixed(1)}%</span>
                </div>
                <div>
                  <div className="text-xs font-bold text-[var(--fg-default)]">Estimated Pod Availability</div>
                  <p className="text-[10px] text-[var(--fg-subtle)] mt-1">
                    Calculated ratio of running pods vs total allocated pods.
                  </p>
                  <div className="mt-2 flex items-center justify-center gap-1.5">
                    {availabilitySLI >= targetThreshold ? (
                      <span className="inline-flex items-center text-[10px] font-semibold text-[var(--status-success)] gap-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)]" /> Status Healthy
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] font-semibold text-[var(--status-error)] gap-0.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-[var(--status-error)] animate-pulse" /> Degradation Detected
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
