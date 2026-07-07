import { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

export default function LogViewer({ logs, logStatus, logsContainerRef }) {
  const [autoScroll, setAutoScroll] = useState(true);
  const internalRef = useRef(null);
  const activeRef = logsContainerRef || internalRef;

  useEffect(() => {
    if (autoScroll && activeRef.current) {
      activeRef.current.scrollTop = activeRef.current.scrollHeight;
    }
  }, [logs, autoScroll, activeRef]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <FileText className="w-4 h-4 text-[var(--accent-primary)]" /> Live System Logs
        </h2>
        <div className="flex items-center gap-3">
          {/* Auto-scroll Toggle Button */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer focus-visible:outline-none ${
              autoScroll
                ? 'bg-[var(--accent-primary-muted)] text-[var(--accent-primary)] border-[var(--accent-primary)]/20'
                : 'bg-[var(--bg-elevated)] text-[var(--fg-muted)] border-[var(--border-default)]'
            }`}
            aria-label={autoScroll ? "Pause autoscroll" : "Resume autoscroll"}
          >
            {autoScroll ? "Autoscroll On" : "Autoscroll Paused"}
          </button>

          {/* Connection Status Indicator */}
          {logStatus === 'connecting' && (
            <span className="text-[10px] font-semibold text-[var(--fg-subtle)] uppercase">
              Connecting...
            </span>
          )}
          {logStatus === 'connected' && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--status-success)] uppercase">
              <span className="w-2 h-2 rounded-full bg-[var(--status-success)] shrink-0"></span>
              Streaming Live
            </span>
          )}
          {logStatus === 'disconnected' && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--status-error)] uppercase animate-pulse">
              <span className="w-2 h-2 rounded-full bg-[var(--status-error)] shrink-0"></span>
              Reconnecting...
            </span>
          )}
        </div>
      </div>
      <div 
        ref={activeRef}
        className="bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-4 overflow-y-auto font-mono text-xs text-[var(--fg-default)] h-[480px] leading-relaxed scrollbar-thin"
      >
        {logStatus === 'connecting' ? (
          <div className="space-y-3 py-2">
            <div className="h-4 bg-[var(--bg-elevated)] skeleton w-full"></div>
            <div className="h-4 bg-[var(--bg-elevated)] skeleton w-5/6"></div>
            <div className="h-4 bg-[var(--bg-elevated)] skeleton w-4/5"></div>
          </div>
        ) : logStatus === 'disconnected' && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--status-error)] italic py-10 gap-2">
            <span>Connection lost. Reconnecting...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--fg-subtle)] italic py-10">
            Waiting for log output...
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
