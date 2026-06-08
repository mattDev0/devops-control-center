import { Terminal as TerminalIcon } from 'lucide-react';

export default function Terminal({ terminalRef }) {
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 lg:col-span-2 shadow-xl flex flex-col">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-slate-200">
        <TerminalIcon className="text-emerald-400" /> Remote Execution
      </h2>
      <div 
        ref={terminalRef} 
        className="w-full rounded bg-[#0f172a] p-2 border border-slate-900 overflow-hidden flex-grow min-h-[300px]"
      ></div>
    </div>
  );
}
