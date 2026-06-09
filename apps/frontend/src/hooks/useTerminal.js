import { useEffect, useRef } from 'react';

export function useTerminal(token, role, handleLogout) {
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);

  useEffect(() => {
    if (!token || !terminalRef.current) return;
    let isMounted = true;
    let ws = null;

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
          cursorBlink: role !== 'ROLE_GUEST',
          disableStdin: role === 'ROLE_GUEST',
          rows: 15,
        });
        
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();
        xtermInstance.current = term;

        term.writeln('\x1b[1;32mDevOps Control Center Terminal\x1b[0m');
        
        if (role === 'ROLE_GUEST') {
          term.writeln('\x1b[1;33mGuest Mode: Remote terminal execution is read-only.\x1b[0m');
          term.writeln('Please log in as an administrator to run commands.');
          term.write('\r\n$ ');
        } else {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`;
          
          ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            const dims = fitAddon.proposeDimensions();
            if (dims && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: 'resize', cols: dims.cols, rows: dims.rows }));
            }
          };

          ws.onmessage = (event) => {
            if (isMounted) term.write(event.data);
          };

          ws.onclose = (event) => {
            if (isMounted) {
              if (event.code === 4003 || event.code === 4001 || event.status === 401) {
                term.writeln('\r\n\x1b[31mSession expired. Please log in again.\x1b[0m');
                handleLogout();
              } else {
                term.writeln('\r\n\x1b[31mTerminal connection closed.\x1b[0m');
              }
            }
          };

          ws.onerror = () => {
            if (isMounted) term.writeln('\r\n\x1b[31mTerminal connection error.\x1b[0m');
          };

          term.onData((data) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(data);
            }
          });

          const handleResize = () => {
            if (!isMounted || !xtermInstance.current) return;
            try {
              fitAddon.fit();
              const dims = fitAddon.proposeDimensions();
              if (dims && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ event: 'resize', cols: dims.cols, rows: dims.rows }));
              }
            } catch (e) {
              console.warn("Terminal resize error ignored during unmount:", e);
            }
          };

          window.addEventListener('resize', handleResize);
          term._resizeHandler = handleResize;
        }
      } catch (err) {
        console.error("Failed to load terminal modules", err);
      }
    };

    initTerminal();

    return () => {
      isMounted = false;
      if (ws) {
        ws.close();
      }
      if (xtermInstance.current) {
        const handler = xtermInstance.current._resizeHandler;
        if (handler) {
          window.removeEventListener('resize', handler);
        }
        xtermInstance.current.dispose();
        xtermInstance.current = null;
      }
    };
  }, [token, role, handleLogout]);

  return terminalRef;
}
