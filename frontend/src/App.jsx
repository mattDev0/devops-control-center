import { useState, useEffect, useRef } from 'react';
import { Server, Activity, Clock, Terminal as TerminalIcon, FileText } from 'lucide-react';

export default function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const currentLine = useRef('');
  const logsContainerRef = useRef(null);

  // Fetch Server Health
  const fetchHealth = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/servers/health');
      const data = await response.json();
      setHealth(data);
    } catch (error) {
      console.error("Failed to fetch health", error);
      setHealth({ os_name: "Error", os_version: "N/A", uptime_seconds: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  // Initialize xterm.js dynamically to avoid bundler resolution errors
  useEffect(() => {
    if (!terminalRef.current) return;
    let isMounted = true;

    const initTerminal = async () => {
      try {
        const { Terminal } = await import('xterm');
        const { FitAddon } = await import('xterm-addon-fit');
        await import('xterm/css/xterm.css');

        // Abort if the component unmounted while we were fetching the dynamic imports
        if (!isMounted) return;

        // Clear any stray elements in case StrictMode double-mounted before the import finished
        terminalRef.current.innerHTML = '';

        const term = new Terminal({
          theme: { background: '#0f172a', foreground: '#f8fafc', cursor: '#10b981' },
          fontFamily: 'monospace',
          cursorBlink: true,
          rows: 15,
        });
        
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();
        xtermInstance.current = term;

        term.writeln('\x1b[1;32mDevOps Control Center Terminal\x1b[0m');
        term.writeln('Secure remote execution initialized. Allowed commands: ls, pwd, whoami, echo, uptime, date');
        term.write('\r\n$ ');

        term.onKey(({ key, domEvent }) => {
          const printable = !domEvent.altKey && !domEvent.altGraphKey && !domEvent.ctrlKey && !domEvent.metaKey;

          if (domEvent.key === 'Enter') {
            term.writeln('');
            executeCommand(currentLine.current);
            currentLine.current = '';
          } else if (domEvent.key === 'Backspace') {
            if (currentLine.current.length > 0) {
              currentLine.current = currentLine.current.slice(0, -1);
              term.write('\b \b');
            }
          } else if (printable) {
            currentLine.current += key;
            term.write(key);
          }
        });
      } catch (err) {
        console.error("Failed to load terminal modules", err);
      }
    };

    initTerminal();

    return () => {
      isMounted = false;
      if (xtermInstance.current) {
        xtermInstance.current.dispose();
        xtermInstance.current = null;
      }
    };
  }, []);

  // Subscribe to SSE Logs
  useEffect(() => {
    const eventSource = new EventSource('/api/servers/logs');
    
    eventSource.onmessage = (event) => {
      setLogs((prevLogs) => {
        const newLogs = [...prevLogs, event.data];
        // Keep only the last 50 lines to prevent memory bloat
        return newLogs.slice(-50);
      });
    };

    eventSource.onerror = () => {
      console.error("SSE connection lost. Reconnecting...");
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Auto-scroll logs to bottom (isolated to the container instead of the whole page)
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Execute Command via Java Backend
  const executeCommand = async (cmdStr) => {
    const term = xtermInstance.current;
    if (!term) return;

    if (!cmdStr.trim()) {
      term.write('$ ');
      return;
    }

    const parts = cmdStr.trim().split(' ').filter(p => p);
    const command = parts[0];
    const args = parts.slice(1);

    try {
      const res = await fetch('/api/servers/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args })
      });
      
      const data = await res.json();
      
      if (data.stdout) term.write(data.stdout.replace(/\n/g, '\r\n'));
      if (data.stderr) term.writeln(`\x1b[31m${data.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
      if (data.exit_code !== 0 && data.exit_code !== -1) {
        term.writeln(`\x1b[31mProcess exited with code: ${data.exit_code}\x1b[0m`);
      }
    } catch (e) {
      term.writeln(`\x1b[31mNetwork Error: Failed to reach Orchestrator\x1b[0m`);
    }
    
    if (!data?.stdout?.endsWith('\n')) term.write('\r\n');
    term.write('$ ');
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-emerald-400 flex items-center gap-3">
          <TerminalIcon className="w-8 h-8" />
          DevOps Control Center
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Server Health Card */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 h-fit">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Server className="text-blue-400" /> Local WSL Agent
            </h2>
            <div className={`w-3 h-3 rounded-full ${health?.os_name === 'Error' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
          </div>

          {loading ? (
            <div className="animate-pulse flex flex-col gap-4">
              <div className="h-4 bg-slate-700 rounded w-3/4"></div>
              <div className="h-4 bg-slate-700 rounded w-1/2"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                <span className="text-slate-400 flex items-center gap-2"><Activity className="w-4 h-4" /> OS</span>
                <span className="font-mono text-sm bg-slate-900 px-2 py-1 rounded text-emerald-400">
                  {health?.os_name} {health?.os_version}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                <span className="text-slate-400 flex items-center gap-2"><Clock className="w-4 h-4" /> Uptime</span>
                <span className="font-mono text-sm bg-slate-900 px-2 py-1 rounded text-emerald-400">
                  {formatUptime(health?.uptime_seconds)}
                </span>
              </div>
            </div>
          )}
          
          <button 
            onClick={fetchHealth}
            className="w-full mt-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded transition-colors"
          >
            Refresh Status
          </button>
        </div>

        {/* Remote Terminal Card */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 lg:col-span-2 shadow-xl flex flex-col">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-slate-200">
            <TerminalIcon className="text-emerald-400" /> Remote Execution
          </h2>
          <div 
            ref={terminalRef} 
            className="w-full rounded bg-[#0f172a] p-2 border border-slate-900 overflow-hidden flex-grow min-h-[300px]"
          ></div>
        </div>
      </div>

      {/* NEW: Live Log Stream Card */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-slate-200">
          <FileText className="text-blue-400" /> Live System Logs
        </h2>
        <div 
          ref={logsContainerRef}
          className="bg-[#0f172a] border border-slate-900 rounded p-4 h-64 overflow-y-auto font-mono text-sm text-slate-300"
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

    </div>
  );
}