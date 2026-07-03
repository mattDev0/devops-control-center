import { RotateCw, FileText, Play, Square, Layers, AlertTriangle, Cloud } from 'lucide-react';

export default function DeploymentsTable({
  deployments,
  loading,
  role,
  fetchDeployments,
  handleDeploymentAction,
  onViewLogs
}) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <Layers className="w-4 h-4 text-[var(--accent-primary)]" /> Kubernetes Deployments
        </h2>
        <button 
          onClick={fetchDeployments}
          disabled={loading}
          className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors disabled:opacity-50"
          title="Refresh Deployments"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      <div className="overflow-x-auto relative flex-grow max-h-[360px]">
        <table className="w-full text-left text-xs text-[var(--fg-muted)]">
          <thead className="text-[10px] uppercase bg-[var(--bg-canvas)] text-[var(--fg-subtle)] border-b border-[var(--border-default)] sticky top-0 z-10 font-semibold tracking-wider">
            <tr>
              <th className="px-3 py-2.5">Deployment ID</th>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Last Updated</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-muted)]/50">
            {loading && deployments.length === 0 ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-16"></div></td>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-24"></div></td>
                  <td className="px-3 py-3"><div className="h-5 skeleton w-16"></div></td>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-28"></div></td>
                  <td className="px-3 py-3 text-right"><div className="h-6 skeleton w-14 ml-auto"></div></td>
                </tr>
              ))
            ) : deployments.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-3 py-10 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Cloud className="w-8 h-8 text-[var(--fg-subtle)] mb-2 opacity-50" />
                    <h3 className="text-xs font-semibold text-[var(--fg-muted)]">No Deployments Found</h3>
                    <p className="text-[10px] text-[var(--fg-subtle)] max-w-xs mt-1">
                      Active deployments in monitored namespaces will appear here.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              deployments.map((deployment) => (
                <tr key={deployment.id} className="hover:bg-[var(--interactive-hover)] transition-colors">
                  <td className="px-3 py-2.5 font-mono text-[10px] text-[var(--fg-subtle)]">{deployment.id}</td>
                  <td className="px-3 py-2.5 font-medium text-[var(--fg-default)]">{deployment.name}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span 
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                          deployment.state === 'running' 
                            ? 'bg-[var(--status-success-muted)] text-[var(--status-success)] border-[var(--status-success)]/10' 
                            : deployment.state === 'failed'
                            ? 'bg-[var(--status-error-muted)] text-[var(--status-error)] border-[var(--status-error)]/20'
                            : 'bg-[var(--status-neutral-muted)] text-[var(--fg-muted)] border-[var(--border-default)]'
                        }`}
                        title={deployment.state === 'failed' ? deployment.error_message || 'Deployment rollout failed' : undefined}
                      >
                        {deployment.state === 'failed' && <AlertTriangle className="w-3 h-3 text-[var(--status-error)] animate-pulse" />}
                        {deployment.state}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-[var(--fg-subtle)] font-mono">
                    {deployment.updated_at ? new Date(deployment.updated_at).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => onViewLogs(deployment)}
                        className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors border border-[var(--border-default)] bg-[var(--bg-canvas)]"
                        title="View Logs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      
                      {deployment.state !== 'running' && (
                        <button 
                          onClick={() => handleDeploymentAction(deployment.id, 'start')} 
                          disabled={role === 'ROLE_GUEST'}
                          className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--status-success)] hover:border-[var(--status-success)]/20 transition-colors border border-[var(--border-default)] bg-[var(--bg-canvas)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          title={role === 'ROLE_GUEST' ? "Requires Admin" : "Start"}
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      
                      {deployment.state === 'running' && (
                        <>
                          <button 
                            onClick={() => handleDeploymentAction(deployment.id, 'stop')} 
                            disabled={role === 'ROLE_GUEST'}
                            className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--status-error)] hover:border-[var(--status-error)]/20 transition-colors border border-[var(--border-default)] bg-[var(--bg-canvas)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            title={role === 'ROLE_GUEST' ? "Requires Admin" : "Stop"}
                          >
                            <Square className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeploymentAction(deployment.id, 'restart')} 
                            disabled={role === 'ROLE_GUEST'}
                            className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--status-info)] hover:border-[var(--status-info)]/20 transition-colors border border-[var(--border-default)] bg-[var(--bg-canvas)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            title={role === 'ROLE_GUEST' ? "Requires Admin" : "Restart"}
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
