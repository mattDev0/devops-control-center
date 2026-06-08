import { RotateCw, FileText, Play, Square, Layers } from 'lucide-react';

export default function DeploymentsTable({
  deployments,
  role,
  fetchDeployments,
  handleDeploymentAction,
  onViewLogs
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-200">
          <Layers className="text-purple-400" /> Kubernetes Deployments
        </h2>
        <button 
          onClick={fetchDeployments}
          className="bg-slate-700 hover:bg-slate-600 text-white text-sm py-1 px-3 rounded transition-colors flex items-center gap-1"
        >
          <RotateCw className="w-4 h-4" /> Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-400">
          <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3">Deployment ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deployments.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-4 py-4 text-center text-slate-500 italic">No deployments found.</td>
              </tr>
            ) : (
              deployments.map((deployment) => (
                <tr key={deployment.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{deployment.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-300">{deployment.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${deployment.state === 'running' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                      {deployment.state}
                    </span>
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
