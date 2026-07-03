import { RotateCw, FileText, Play, Square, Layers, AlertTriangle } from 'lucide-react';

export default function DeploymentsTable({
  deployments,
  role,
  fetchDeployments,
  handleDeploymentAction,
  onViewLogs
}) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <Layers className="w-4 h-4 text-[var(--accent-primary)]" /> Kubernetes Deployments
        </h2>
        <button 
          onClick={fetchDeployments}
          className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors"
          title="Refresh Deployments"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-400">
          <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3">Deployment ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deployments.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-4 py-4 text-center text-slate-500 italic">No deployments found.</td>
              </tr>
            ) : (
              deployments.map((deployment) => (
                <tr key={deployment.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{deployment.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-300">{deployment.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span 
                        className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-help ${
                          deployment.state === 'running' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : deployment.state === 'failed'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-slate-500/10 text-slate-400'
                        }`}
                        title={deployment.state === 'failed' ? deployment.error_message || 'Deployment rollout failed' : undefined}
                      >
                        {deployment.state === 'failed' && <AlertTriangle className="w-3.5 h-3.5 text-red-400 animate-pulse" />}
                        {deployment.state}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                    {deployment.updated_at ? new Date(deployment.updated_at).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button 
                      onClick={() => onViewLogs(deployment)}
                      className="p-1 rounded bg-slate-700/50 hover:bg-slate-700/80 text-slate-300 transition-all border border-slate-600/50"
                      title="View Logs"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    {deployment.state !== 'running' && (
                      <button 
                        onClick={() => handleDeploymentAction(deployment.id, 'start')} 
                        disabled={role === 'ROLE_GUEST'}
                        className={`p-1 rounded transition-all ${role === 'ROLE_GUEST' ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-40' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40'}`} 
                        title={role === 'ROLE_GUEST' ? "Requires Admin" : "Start"}
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {deployment.state === 'running' && (
                      <>
                        <button 
                          onClick={() => handleDeploymentAction(deployment.id, 'stop')} 
                          disabled={role === 'ROLE_GUEST'}
                          className={`p-1 rounded transition-all ${role === 'ROLE_GUEST' ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-40' : 'bg-red-500/20 text-red-400 hover:bg-red-500/40'}`}
                          title={role === 'ROLE_GUEST' ? "Requires Admin" : "Stop"}
                        >
                          <Square className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeploymentAction(deployment.id, 'restart')} 
                          disabled={role === 'ROLE_GUEST'}
                          className={`p-1 rounded transition-all ${role === 'ROLE_GUEST' ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-40' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/40'}`}
                          title={role === 'ROLE_GUEST' ? "Requires Admin" : "Restart"}
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>
                      </>
                    )}
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
