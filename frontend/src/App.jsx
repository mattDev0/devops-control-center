import { useState, useEffect, useRef } from 'react';
import { Server, Activity, Clock, Terminal as TerminalIcon, FileText, Box, Play, Square, RotateCw, GitPullRequest, GitBranch, PlayCircle, CheckCircle, XCircle, Loader2, Layers, LineChart } from 'lucide-react';

export default function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [containers, setContainers] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  
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

  // Fetch Docker Containers
  const fetchContainers = async () => {
    try {
      const response = await fetch('/api/servers/containers');
      const data = await response.json();
      setContainers(data);
    } catch (error) {
      console.error("Failed to fetch containers", error);
    }
  };

  // Perform Container Action
  const handleContainerAction = async (id, action) => {
    try {
      await fetch(`/api/servers/containers/${id}/${action}`, { method: 'POST' });
      fetchContainers(); // Refresh list after action
    } catch (error) {
      console.error(`Failed to ${action} container ${id}`, error);
    }
  };

  // Fetch GitHub Workflows
  const fetchWorkflows = async () => {
    setLoadingWorkflows(true);
    try {
      const response = await fetch('/api/ci/workflows');
      const data = await response.json();
      setWorkflows(data);
    } catch (error) {
      console.error("Failed to fetch workflows", error);
    } finally {
      setLoadingWorkflows(false);
    }
  };

  // Trigger GitHub Workflow
  const triggerWorkflow = async (id) => {
    try {
      await fetch(`/api/ci/workflows/${id}/dispatch`, { method: 'POST' });
      // Refresh the workflow list shortly after triggering
      setTimeout(fetchWorkflows, 1500);
    } catch (error) {
      console.error(`Failed to trigger workflow ${id}`, error);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchContainers();
    fetchWorkflows();
  }, []);

  // Initialize xterm.js dynamically
  useEffect(() => {
    if (!terminalRef.current) return;
    let isMounted = true;

    const initTerminal = async () => {
      try {
        const { Terminal } = await import('xterm');
        const { FitAddon } = await import('xterm-addon-fit');
        await import('xterm/css/xterm.css');

        if (!isMounted) return;

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
        term.writeln('Secure remote execution initialized. Allowed commands: ls, pwd, whoami, echo, uptime, date, terraform');
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

  // Auto-scroll logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Execute Command via Java Backend
  const executeCommand = async (cmdStr) => {
    const term = xtermInstance.current;
    if (!term) return;

    // Sanitize input: remove control characters and trim
    const cleanCmd = cmdStr.replace(/[\x00-\x1F\x7F]/g, "").trim();

    if (!cleanCmd) {
      term.write('$ ');
      return;
    }

    const parts = cleanCmd.split(' ').filter(p => p);
    const command = parts[0];
    const args = parts.slice(1);

    try {
      console.log(`Sending command: ${command}`, args);
      const res = await fetch('/api/servers/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args })
      });
      
      const text = await res.text();
      console.log(`Received raw response: ${text}`);
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        term.writeln(`\x1b[31mError: Orchestrator returned invalid JSON: ${text.substring(0, 100)}\x1b[0m`);
        term.write('$ ');
        return;
      }
      
      if (data.stdout) term.write(data.stdout.replace(/\n/g, '\r\n'));
      if (data.stderr) term.writeln(`\x1b[31m${data.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
      
      if (data.exit_code !== 0 && data.exit_code !== undefined) {
        // Only show exit code if it's non-zero and not just a default value
        if (data.exit_code !== -1 || data.stderr) {
            term.writeln(`\x1b[31mProcess exited with code: ${data.exit_code}\x1b[0m`);
        }
      }
      
      if (data.stdout && !data.stdout.endsWith('\n')) term.write('\r\n');
    } catch (e) {
      console.error("Fetch error", e);
      term.writeln(`\x1b[31mNetwork Error: Failed to reach Orchestrator\x1b[0m`);
    }
    
    term.write('$ ');
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const renderWorkflowStatus = (status, conclusion) => {
    if (status === 'in_progress') return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
    if (conclusion === 'success') return <CheckCircle className="w-5 h-5 text-emerald-400" />;
    if (conclusion === 'failure') return <XCircle className="w-5 h-5 text-red-400" />;
    return <Clock className="w-5 h-5 text-slate-400" />;
  };

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-emerald-400 flex items-center gap-3">
          <TerminalIcon className="w-8 h-8" />
          DevOps Control Center
        </h1>
      </header>

      {/* Row 1: Health & Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
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

      {/* Row 2: Docker & CI/CD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-200">
              <Box className="text-purple-400" /> Docker Containers
            </h2>
            <button 
              onClick={fetchContainers}
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm py-1 px-3 rounded transition-colors flex items-center gap-1"
            >
              <RotateCw className="w-4 h-4" /> Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3">Container ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {containers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-4 text-center text-slate-500 italic">No containers found.</td>
                  </tr>
                ) : (
                  containers.map((container) => (
                    <tr key={container.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{container.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-300">{container.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${container.state === 'running' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                          {container.state}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        {container.state !== 'running' && (
                          <button onClick={() => handleContainerAction(container.id, 'start')} className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40" title="Start">
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {container.state === 'running' && (
                          <>
                            <button onClick={() => handleContainerAction(container.id, 'stop')} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40" title="Stop">
                              <Square className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleContainerAction(container.id, 'restart')} className="p-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/40" title="Restart">
                              <RotateCw className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-200">
              <GitPullRequest className="text-white" /> CI/CD Pipelines
            </h2>
            <button 
              onClick={fetchWorkflows}
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm py-1 px-3 rounded transition-colors flex items-center gap-1"
            >
              <RotateCw className={`w-4 h-4 ${loadingWorkflows ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          <div className="overflow-x-auto flex-grow">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Workflow Name</th>
                  <th className="px-4 py-3">Branch / Commit</th>
                  <th className="px-4 py-3 text-right">Deploy</th>
                </tr>
              </thead>
              <tbody>
                {workflows.length === 0 && !loadingWorkflows ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-4 text-center text-slate-500 italic">No workflows found.</td>
                  </tr>
                ) : (
                  workflows.map((wf) => (
                    <tr key={wf.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3">
                        {renderWorkflowStatus(wf.status, wf.conclusion)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-300">{wf.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs">
                          <GitBranch className="w-3 h-3 text-slate-500" /> {wf.branch}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[150px]">{wf.commitMsg}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button 
                          onClick={() => triggerWorkflow(wf.id)} 
                          className="px-3 py-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 text-xs font-semibold flex items-center gap-1 ml-auto transition-colors"
                        >
                          <PlayCircle className="w-4 h-4" /> Run
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 3: Terraform & Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-200">
              <Layers className="text-amber-400" /> Infrastructure (Terraform)
            </h2>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Execute local Terraform configurations directly through the secure agent tunnel. Output streams to the terminal above.
            </p>
            <div className="flex gap-3 mt-4">
              <button 
                onClick={() => executeCommand('terraform init')}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-4 h-4" /> Init
              </button>
              <button 
                onClick={() => executeCommand('terraform apply -auto-approve')}
                className="flex-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 py-2 px-4 rounded text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-4 h-4" /> Apply
              </button>
              <button 
                onClick={() => executeCommand('terraform destroy -auto-approve')}
                className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 py-2 px-4 rounded text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Destroy
              </button>
            </div>
          </div>
        </div>

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
      </div>

      {/* Row 4: Monitoring (Grafana embedded iframes) */}
      <div className="mt-6 bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-200">
            <LineChart className="text-pink-400" /> System Metrics (Grafana)
          </h2>
          <span className="text-xs font-semibold text-pink-400 bg-pink-500/10 px-2 py-1 rounded">Live via Prometheus</span>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Visualizing real-time telemetry from the Rust Agent node_exporter.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CPU Usage Iframe Container */}
          <div className="bg-[#0f172a] border border-slate-900 rounded p-1 h-64 relative overflow-hidden flex items-center justify-center">
            {/* Fallback text hidden behind iframe once loaded */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none z-0">
              <LineChart className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">CPU Usage Panel</p>
              <p className="text-xs opacity-50 text-center px-4 mt-1">Requires Grafana running on http://localhost:3000</p>
            </div>
            {/* The iframe connects to local Grafana dashboard panel */}
            <iframe 
              src="http://localhost:3000/d-solo/rYdddlPWk/node-exporter-full?orgId=1&timezone=browser&var-ds_prometheus=cfmh94yfqwjcwd&var-job=node&var-nodename=ac1f709ef5f4&var-node=node-exporter:9100&refresh=1m&panelId=panel-77" 
              width="100%" 
              height="100%" 
              frameBorder="0" 
              className="relative z-10"
              title="CPU Usage"
            ></iframe>
          </div>

          {/* Memory Usage Iframe Container */}
          <div className="bg-[#0f172a] border border-slate-900 rounded p-1 h-64 relative overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none z-0">
              <Activity className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Memory Usage Panel</p>
              <p className="text-xs opacity-50 text-center px-4 mt-1">Requires Grafana running on http://localhost:3000</p>
            </div>
            <iframe 
              src="http://localhost:3000/d-solo/rYdddlPWk/node-exporter-full?orgId=1&timezone=browser&var-ds_prometheus=cfmh94yfqwjcwd&var-job=node&var-nodename=ac1f709ef5f4&var-node=node-exporter:9100&refresh=1m&panelId=panel-78" 
              width="100%" 
              height="100%" 
              frameBorder="0" 
              className="relative z-10"
              title="Memory Usage"
            ></iframe>
          </div>
        </div>
      </div>

    </div>
  );
}
