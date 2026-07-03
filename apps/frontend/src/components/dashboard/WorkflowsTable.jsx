import { RotateCw, GitPullRequest, GitBranch, PlayCircle, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react';

const renderWorkflowStatus = (status, conclusion) => {
  if (status === 'in_progress') return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
  if (conclusion === 'success') return <CheckCircle className="w-5 h-5 text-emerald-400" />;
  if (conclusion === 'failure') return <XCircle className="w-5 h-5 text-red-400" />;
  return <Clock className="w-5 h-5 text-slate-400" />;
};

export default function WorkflowsTable({
  workflows,
  loadingWorkflows,
  role,
  fetchWorkflows,
  triggerWorkflow
}) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <GitPullRequest className="w-4 h-4 text-[var(--accent-primary)]" /> CI/CD Pipelines
        </h2>
        <button 
          onClick={fetchWorkflows}
          className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors"
          title="Refresh Pipelines"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loadingWorkflows ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="overflow-x-auto flex-grow">
        <table className="w-full text-left text-sm text-slate-400">
          <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Workflow Name</th>
              <th className="px-4 py-3">Branch / Commit</th>
              <th className="px-4 py-3 text-right">Deploy</th>
            </tr>
          </thead>
          <tbody>
            {workflows.length === 0 && !loadingWorkflows ? (
              <tr>
                <td colSpan="4" className="px-4 py-4 text-center text-slate-500 italic">No workflows found.</td>
              </tr>
            ) : (
              workflows.map((wf) => (
                <tr key={wf.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3">
                    {renderWorkflowStatus(wf.status, wf.conclusion)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-300">{wf.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-xs">
                      <GitBranch className="w-3 h-3 text-slate-500" /> {wf.branch}
                    </div>
                    <div className="text-xs text-slate-500 truncate max-w-[150px]">{wf.commitMsg}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => triggerWorkflow(wf.id)} 
                      disabled={role === 'ROLE_GUEST'}
                      className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 ml-auto transition-colors ${role === 'ROLE_GUEST' ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-40' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/40'}`}
                      title={role === 'ROLE_GUEST' ? "Requires Admin" : "Run"}
                    >
                      <PlayCircle className="w-4 h-4" /> Run
                    </button>
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
