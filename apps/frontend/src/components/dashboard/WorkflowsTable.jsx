import { RotateCw, GitPullRequest, GitBranch, PlayCircle, Loader2, Clock, CheckCircle, XCircle, Cloud } from 'lucide-react';

const renderWorkflowStatus = (status, conclusion) => {
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--status-info-muted)] text-[var(--status-info)] border border-[var(--status-info)]/10">
        <Loader2 className="w-3 h-3 animate-spin" /> Running
      </span>
    );
  }
  if (conclusion === 'success') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--status-success-muted)] text-[var(--status-success)] border border-[var(--status-success)]/10">
        <CheckCircle className="w-3 h-3" /> Passed
      </span>
    );
  }
  if (conclusion === 'failure') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--status-error-muted)] text-[var(--status-error)] border border-[var(--status-error)]/10">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--status-neutral-muted)] text-[var(--fg-muted)] border border-[var(--border-default)]">
      <Clock className="w-3 h-3" /> Queued
    </span>
  );
};

export default function WorkflowsTable({
  workflows,
  loadingWorkflows,
  role,
  fetchWorkflows,
  triggerWorkflow
}) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <GitPullRequest className="w-4 h-4 text-[var(--accent-primary)]" /> CI/CD Pipelines
        </h2>
        <button 
          onClick={fetchWorkflows}
          disabled={loadingWorkflows}
          className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors disabled:opacity-50"
          title="Refresh Pipelines"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loadingWorkflows ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      <div className="overflow-x-auto relative flex-grow max-h-[360px]">
        <table className="w-full text-left text-xs text-[var(--fg-muted)]">
          <thead className="text-[10px] uppercase bg-[var(--bg-canvas)] text-[var(--fg-subtle)] border-b border-[var(--border-default)] sticky top-0 z-10 font-semibold tracking-wider">
            <tr>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Workflow Name</th>
              <th className="px-3 py-2.5">Branch / Commit</th>
              <th className="px-3 py-2.5 text-right">Deploy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-muted)]/50">
            {loadingWorkflows && workflows.length === 0 ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-3"><div className="h-5 skeleton w-16"></div></td>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-24"></div></td>
                  <td className="px-3 py-3"><div className="h-4 skeleton w-28"></div></td>
                  <td className="px-3 py-3 text-right"><div className="h-6 skeleton w-12 ml-auto"></div></td>
                </tr>
              ))
            ) : workflows.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-3 py-10 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Cloud className="w-8 h-8 text-[var(--fg-subtle)] mb-2 opacity-50" />
                    <h3 className="text-xs font-semibold text-[var(--fg-muted)]">No Pipelines Found</h3>
                    <p className="text-[10px] text-[var(--fg-subtle)] max-w-xs mt-1">
                      GitHub Actions workflow runs will appear here.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              workflows.map((wf) => (
                <tr key={wf.id} className="hover:bg-[var(--interactive-hover)] transition-colors">
                  <td className="px-3 py-2.5">
                    {renderWorkflowStatus(wf.status, wf.conclusion)}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-[var(--fg-default)]">{wf.name}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]">
                      <GitBranch className="w-3 h-3 text-[var(--fg-subtle)]" /> {wf.branch}
                    </div>
                    <div className="text-[10px] text-[var(--fg-subtle)] truncate max-w-[150px]" title={wf.commitMsg}>
                      {wf.commitMsg}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button 
                      onClick={() => triggerWorkflow(wf.id)} 
                      disabled={role === 'ROLE_GUEST'}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border border-[var(--border-default)] bg-[var(--bg-canvas)] text-[var(--accent-primary)] hover:bg-[var(--interactive-hover)] hover:border-[var(--accent-primary)]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
                      title={role === 'ROLE_GUEST' ? "Requires Admin" : "Run"}
                    >
                      <PlayCircle className="w-3.5 h-3.5" /> Run
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
