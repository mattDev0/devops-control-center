import { useState, useEffect } from 'react';

export function useSystemLogs(token) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!token) {
      setLogs([]);
      return;
    }
    const eventSource = new EventSource(`api/servers/logs?token=${encodeURIComponent(token)}`);
    
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
    const eventSource = new EventSource(`api/servers/logs?id=${encodeURIComponent(activeLogDeployment.id)}&token=${encodeURIComponent(token)}`);

    eventSource.onmessage = (event) => {
      setActiveDeploymentLogs((prevLogs) => {
        const newLogs = [...prevLogs, event.data];
        return newLogs.slice(-150); // limit to 150 lines
      });
    };

    eventSource.onerror = (err) => {
      console.error("Deployment log stream error:", err);
      setActiveDeploymentLogs((prevLogs) => [...prevLogs, "⚠️ Log stream disconnected. Retrying..."]);
    };

    return () => {
      eventSource.close();
    };
  }, [showLogsModal, activeLogDeployment, token]);

  return activeDeploymentLogs;
}
