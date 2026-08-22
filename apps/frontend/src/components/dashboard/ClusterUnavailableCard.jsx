import { Layers, Info } from 'lucide-react';

/**
 * Shown in place of the Kubernetes panels when the agent reports no reachable
 * cluster. This deployment runs on Docker Compose, where cluster features do
 * not apply - saying so is more useful than rendering empty tables or errors.
 */
export default function ClusterUnavailableCard({ title, description }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <Layers className="w-4 h-4 text-[var(--fg-muted)]" /> {title}
        </h2>
        <span className="text-[10px] font-semibold text-[var(--fg-muted)] bg-[var(--interactive-hover)] border border-[var(--border-muted)] px-2 py-0.5 rounded">
          Unavailable
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center text-center px-4 py-6">
        <div className="max-w-sm">
          <Info className="w-5 h-5 text-[var(--fg-muted)] mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-[var(--fg-default)] mb-1">No Kubernetes cluster connected</p>
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}
