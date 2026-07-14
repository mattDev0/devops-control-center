import { useEffect, useRef } from 'react';
import { FileText, Loader2, X } from 'lucide-react';

export default function DockerLogsModal({
  activeLogContainer,
  activeContainerLogs,
  containerLogsRef,
  onClose
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-overlay)] backdrop-blur-xs transition-opacity duration-300"
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-xl)] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[var(--shadow-modal)] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <FileText className="text-[var(--accent-primary)] w-5 h-5" />
            <div>
              <h3 id="modal-title" className="font-semibold text-[var(--fg-default)] text-sm">
                Live Container Logs: {activeLogContainer.name}
              </h3>
              <p className="text-[10px] text-[var(--fg-subtle)] font-mono mt-0.5">
                Container ID: {activeLogContainer.id} ({activeLogContainer.image})
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="text-[var(--fg-muted)] hover:text-[var(--fg-default)] p-1.5 rounded hover:bg-[var(--interactive-hover)] transition-colors"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-grow p-6 overflow-hidden flex flex-col">
          <div 
            ref={containerLogsRef}
            className="flex-grow overflow-y-auto bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-4 font-mono text-xs text-[var(--fg-default)] leading-relaxed shadow-inner max-h-[50vh] min-h-[30vh] scrollbar-thin"
          >
            {activeContainerLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--fg-subtle)] italic gap-2 py-8">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" /> Connecting to stream...
              </div>
            ) : (
              activeContainerLogs.map((log, index) => (
                <div key={index} className="flex gap-4 py-0.5 border-l-2 border-transparent hover:border-[var(--accent-primary)]/50 hover:bg-[var(--interactive-hover)] transition-colors pl-3">
                  <span className="text-[var(--fg-subtle)] select-none text-right w-8 shrink-0">{(index + 1).toString().padStart(3, '0')}</span>
                  <span className="whitespace-pre-wrap break-all">{log}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-default)] bg-[var(--bg-surface)] flex justify-between items-center">
          <span className="text-[10px] text-[var(--fg-subtle)] flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)] animate-pulse"></span> Streaming logs in real-time
          </span>
          <button
            onClick={onClose}
            className="bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-semibold text-xs py-2 px-4 rounded-[var(--radius-md)] transition-colors cursor-pointer"
          >
            Close Logs
          </button>
        </div>
      </div>
    </div>
  );
}
