import { FileText } from 'lucide-react';

export default function LogViewer({ logs, logsContainerRef }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <FileText className="w-4 h-4 text-[var(--accent-primary)]" /> Live System Logs
        </h2>
      </div>
      <div 
        ref={logsContainerRef}
        className="bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-4 overflow-y-auto font-mono text-sm text-[var(--fg-default)] h-44"
      >
        {logs.length === 0 ? (
          <p className="text-[var(--fg-subtle)] italic">Waiting for log stream...</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="py-1 border-b border-[var(--border-muted)]/50">
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
