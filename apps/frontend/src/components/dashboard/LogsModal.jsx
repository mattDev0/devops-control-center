import { FileText, Loader2 } from 'lucide-react';

export default function LogsModal({
  activeLogDeployment,
  activeDeploymentLogs,
  deploymentLogsRef,
  onClose
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs transition-opacity duration-300">
      <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden glassmorphism">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/80 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <FileText className="text-purple-400 w-5 h-5" />
            <div>
              <h3 className="font-semibold text-slate-200">
                Live Deployment Logs: {activeLogDeployment.name}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                ID: {activeLogDeployment.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors text-xl font-bold"
          >
            &times;
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-grow p-6 overflow-hidden flex flex-col">
          <div 
            ref={deploymentLogsRef}
            className="flex-grow overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 leading-relaxed shadow-inner max-h-[50vh] min-h-[30vh]"
          >
            {activeDeploymentLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500 italic gap-2 py-8">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> Connecting to stream...
              </div>
            ) : (
              activeDeploymentLogs.map((log, index) => (
                <div key={index} className="whitespace-pre-wrap border-l-2 border-slate-800 hover:border-purple-500/50 pl-3 py-0.5 hover:bg-slate-900/30 transition-colors">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-700/80 bg-slate-900/50 flex justify-between items-center">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span> Streaming logs in real-time
          </span>
          <button
            onClick={onClose}
            className="bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm py-2 px-5 rounded-lg shadow-lg shadow-purple-600/20 transition-all duration-300 transform active:scale-95"
          >
            Close Logs
          </button>
        </div>
      </div>
    </div>
  );
}
