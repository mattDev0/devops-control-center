import { FileText } from 'lucide-react';

export default function LogViewer({ logs, logsContainerRef }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <FileText className="w-4 h-4 text-[var(--accent-primary)]" /> Live System Logs
        </h2>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--status-success)] uppercase">
          <span className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-pulse shrink-0"></span>
          Streaming Live
        </span>
      </div>
      <div 
        ref={logsContainerRef}
        className="bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-4 overflow-y-auto font-mono text-xs text-[var(--fg-default)] h-80 leading-relaxed scrollbar-thin"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--fg-subtle)] italic py-10">
            Waiting for log stream to begin...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex gap-4 py-0.5 border-b border-[var(--border-muted)]/30 hover:bg-[var(--interactive-hover)] transition-colors">
              <span className="text-[var(--fg-subtle)] select-none text-right w-8 shrink-0">{(index + 1).toString().padStart(2, '0')}</span>
              <span className="whitespace-pre-wrap break-all">{log}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
