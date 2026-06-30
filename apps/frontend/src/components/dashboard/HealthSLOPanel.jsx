import { ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, Layers } from 'lucide-react';

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
  const sloTarget = 99.9;
  
  // Calculate a simulated consumed budget for visual SLO value
  // Consumed budget increases with crashed/failed/pending pods
  const unhealthCount = aggregate.failed + aggregate.crash_loop + (aggregate.pending * 0.5);
  const budgetConsumedPercent = aggregate.total > 0 
    ? Math.min(100, Math.max(0, (unhealthCount / aggregate.total) * 100 * 10)) 
    : 0;
  const budgetRemainingPercent = 100 - budgetConsumedPercent;

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-200">
            <Layers className="text-emerald-400" /> K8s Cluster Health & SLO
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> SLA Compliant
            </span>
            <button 
              onClick={fetchPodHealth}
              disabled={loading}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh Health"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && !podHealth ? (
          <div className="space-y-4 py-4 animate-pulse">
            <div className="h-4 bg-slate-700 rounded w-full"></div>
            <div className="h-4 bg-slate-700 rounded w-5/6"></div>
            <div className="h-4 bg-slate-700 rounded w-4/5"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Namespace cards */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Monitored Namespaces</h3>
              {podHealth && podHealth.map((ns) => (
                <div key={ns.namespace} className="bg-slate-900/60 border border-slate-750 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-slate-200">ns/{ns.namespace}</span>
                    <span className={`w-2 h-2 rounded-full ${ns.failed > 0 || ns.crash_loop > 0 ? 'bg-red-500 animate-pulse' : ns.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-slate-800/40 p-2 rounded">
                      <div className="text-emerald-400 font-mono text-lg font-bold">{ns.running}</div>
                      <div className="text-[10px] text-slate-500">Run</div>
                    </div>
                    <div className="bg-slate-800/40 p-2 rounded">
                      <div className="text-amber-400 font-mono text-lg font-bold">{ns.pending}</div>
                      <div className="text-[10px] text-slate-500">Pend</div>
                    </div>
                    <div className="bg-slate-800/40 p-2 rounded">
                      <div className="text-red-500 font-mono text-lg font-bold">{ns.failed}</div>
                      <div className="text-[10px] text-slate-500">Fail</div>
                    </div>
                    <div className="bg-slate-800/40 p-2 rounded">
                      <div className={`font-mono text-lg font-bold ${ns.crash_loop > 0 ? 'text-orange-500 animate-pulse' : 'text-slate-400'}`}>
                        {ns.crash_loop}
                      </div>
                      <div className="text-[10px] text-slate-500">Crash</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* SLO and Error Budget status */}
            <div className="space-y-5">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Service Level Objectives (SLO)</h3>
              
              {/* SLI Gauge block */}
              <div className="flex items-center gap-4 bg-slate-900/60 border border-slate-750 p-4 rounded-xl">
                <div className="relative flex items-center justify-center w-16 h-16">
                  {/* Outer circle track */}
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="32" cy="32" r="26" strokeWidth="4" stroke="#1e293b" fill="transparent" />
                    <circle 
                      cx="32" 
                      cy="32" 
                      r="26" 
                      strokeWidth="4" 
                      stroke={availabilitySLI < 90 ? '#ef4444' : availabilitySLI < 100 ? '#f59e0b' : '#10b981'} 
                      fill="transparent" 
                      strokeDasharray={2 * Math.PI * 26}
                      strokeDashoffset={2 * Math.PI * 26 * (1 - availabilitySLI / 100)}
                    />
                  </svg>
                  <span className="absolute font-mono text-xs font-bold text-slate-100">{availabilitySLI.toFixed(0)}%</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200">Availability SLI</div>
                  <div className="text-xs text-slate-400 mt-0.5">Target: &gt;={sloTarget}% availability</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {availabilitySLI >= sloTarget ? (
                      <span className="inline-flex items-center text-[10px] font-semibold text-emerald-400 gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Meeting Target
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] font-semibold text-red-400 gap-0.5 animate-pulse">
                        <AlertTriangle className="w-3 h-3" /> SLO Breached
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Budget block */}
              <div className="bg-slate-900/60 border border-slate-750 p-4 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-200">Error Budget Remaining</span>
                  <span className={`font-mono font-bold ${budgetRemainingPercent < 20 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {budgetRemainingPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${budgetRemainingPercent < 20 ? 'bg-red-500' : budgetRemainingPercent < 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${budgetRemainingPercent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Remaining: {budgetRemainingPercent.toFixed(1)}%</span>
                  <span>Consumed: {budgetConsumedPercent.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
