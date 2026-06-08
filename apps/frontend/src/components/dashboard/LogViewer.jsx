import { FileText } from 'lucide-react';

export default function LogViewer({ logs, logsContainerRef }) {
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-slate-200">
        <FileText className="text-blue-400" /> Live System Logs
      </h2>
      <div 
        ref={logsContainerRef}
        className="bg-[#0f172a] border border-slate-900 rounded p-4 overflow-y-auto font-mono text-sm text-slate-300 h-44"
      >
        {logs.length === 0 ? (
          <p className="text-slate-500 italic">Waiting for log stream...</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="py-1 border-b border-slate-800/50">
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
