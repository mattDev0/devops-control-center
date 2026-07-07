import { useState, useEffect } from 'react';

// Helper to read SSE streams using fetch and custom Authorization headers
async function readSseStream(url, token, onMessage, onError, signal) {
  let retryDelay = 2000;
  while (!signal.aborted) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // save incomplete line

        for (const line of lines) {
          if (signal.aborted) break;
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim();
            onMessage(data);
          }
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      onError(err);
    }
    // Wait before reconnecting if we haven't been aborted
    if (!signal.aborted) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

export function useSystemLogs(token) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!token) {
      setLogs([]);
      return;
    }

    const controller = new AbortController();
    
    readSseStream(
      'api/servers/logs',
      token,
      (data) => {
        setLogs((prevLogs) => {
          const newLogs = [...prevLogs, data];
          return newLogs.slice(-50);
        });
      },
      (err) => {
        console.error("System logs SSE connection lost. Reconnecting...", err);
      },
      controller.signal
    );

    return () => {
      controller.abort();
    };
  }, [token]);

  return logs;
}

export function useDeploymentLogs(token, activeLogDeployment, showLogsModal) {
  const [activeDeploymentLogs, setActiveDeploymentLogs] = useState([]);

  useEffect(() => {
    if (!showLogsModal || !activeLogDeployment || !token) {
      setActiveDeploymentLogs([]);
      return;
    }

    setActiveDeploymentLogs([]);
    const controller = new AbortController();

    readSseStream(
      `api/servers/logs?id=${encodeURIComponent(activeLogDeployment.id)}`,
      token,
      (data) => {
        setActiveDeploymentLogs((prevLogs) => {
          const newLogs = [...prevLogs, data];
          return newLogs.slice(-150); // limit to 150 lines
        });
      },
      (err) => {
        console.error("Deployment log stream error:", err);
        setActiveDeploymentLogs((prevLogs) => [...prevLogs, "⚠️ Log stream disconnected. Retrying..."]);
      },
      controller.signal
    );

    return () => {
      controller.abort();
    };
  }, [showLogsModal, activeLogDeployment, token]);

  return activeDeploymentLogs;
}
