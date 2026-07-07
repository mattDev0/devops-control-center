import { useState, useEffect, useRef } from 'react';
// Import Services
import { api } from './services/api';

// Import Hooks
import { useSystemLogs, useDeploymentLogs } from './hooks/useLogs';

// Import Components
import Login from './components/auth/Login';
import LogViewer from './components/dashboard/LogViewer';
import DeploymentsTable from './components/dashboard/DeploymentsTable';
import LogsModal from './components/dashboard/LogsModal';
import WorkflowsTable from './components/dashboard/WorkflowsTable';
import MetricsCards, { SystemMetricsPanel } from './components/dashboard/MetricsCards';
import HealthSLOPanel from './components/dashboard/HealthSLOPanel';
import ErrorBoundary from './components/ErrorBoundary';
import AppShell from './components/layout/AppShell';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState([]);
  const [loadingDeployments, setLoadingDeployments] = useState(true);
  const [workflows, setWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [podHealth, setPodHealth] = useState(null);
  const [loadingPodHealth, setLoadingPodHealth] = useState(false);

  // Active Navigation View State
  const [activeSection, setActiveSection] = useState(() => {
    try {
      return window.location.hash || '#overview';
    } catch {
      return '#overview';
    }
  });

  useEffect(() => {
    const handleHashChange = () => {
      setActiveSection(window.location.hash || '#overview');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Deployment Logs Modal State
  const [activeLogDeployment, setActiveLogDeployment] = useState(null);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // Authentication UI State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Refs
  const logsContainerRef = useRef(null);
  const deploymentLogsRef = useRef(null);

  // Custom Hooks
  const logs = useSystemLogs(token);
  const activeDeploymentLogs = useDeploymentLogs(token, activeLogDeployment, showLogsModal);

  // Auto-scroll system logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Auto-scroll deployment logs
  useEffect(() => {
    if (deploymentLogsRef.current) {
      deploymentLogsRef.current.scrollTop = deploymentLogsRef.current.scrollHeight;
    }
  }, [activeDeploymentLogs]);

  // Handle User Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const data = await api.login(username, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      setToken(data.token);
      setRole(data.role);
    } catch (error) {
      console.error("Login failure", error);
      setAuthError(error.message || 'Connection to authorization service failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Guest Login
  const handleGuestLogin = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const data = await api.guestLogin();
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      setToken(data.token);
      setRole(data.role);
    } catch (error) {
      console.error("Guest login failure", error);
      setAuthError(error.message || 'Connection to authorization service failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Logout
  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setToken('');
    setRole('');
    setHealth(null);
    setPodHealth(null);
    setDeployments([]);
    setWorkflows([]);
    setUsername('');
    setPassword('');
  }

  // Fetch Server Health
  const fetchHealth = async (activeToken = token) => {
    if (!activeToken) return;
    setLoading(true);
    try {
      const data = await api.fetchHealth(activeToken);
      setHealth(data);
    } catch (error) {
      console.error("Failed to fetch health", error);
      if (error.message === 'UNAUTHORIZED') {
        handleLogout();
      } else {
        setHealth({ os_name: "Error", os_version: "N/A", uptime_seconds: 0 });
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch Kubernetes Deployments
  const fetchDeployments = async (activeToken = token) => {
    if (!activeToken) return;
    setLoadingDeployments(true);
    try {
      const data = await api.fetchDeployments(activeToken);
      if (Array.isArray(data)) {
        setDeployments(data);
      }
    } catch (error) {
      console.error("Failed to fetch deployments", error);
      if (error.message === 'UNAUTHORIZED') {
        handleLogout();
      }
    } finally {
      setLoadingDeployments(false);
    }
  };

  // Fetch Kubernetes Pod Health
  const fetchPodHealth = async (activeToken = token) => {
    if (!activeToken) return;
    setLoadingPodHealth(true);
    try {
      const data = await api.fetchPodHealth(activeToken);
      if (Array.isArray(data)) {
        setPodHealth(data);
      }
    } catch (error) {
      console.error("Failed to fetch pod health", error);
      if (error.message === 'UNAUTHORIZED') {
        handleLogout();
      }
    } finally {
      setLoadingPodHealth(false);
    }
  };

  // Perform Deployment Action
  const handleDeploymentAction = async (id, action) => {
    if (!token || role === 'ROLE_GUEST') return;
    try {
      await api.executeDeploymentAction(id, action, token);
      fetchDeployments(); // Refresh list after action
    } catch (error) {
      console.error(`Failed to ${action} deployment ${id}`, error);
      if (error.message === 'UNAUTHORIZED') {
        handleLogout();
      }
      throw error;
    }
  };

  // Fetch GitHub Workflows
  const fetchWorkflows = async (activeToken = token) => {
    if (!activeToken) return;
    setLoadingWorkflows(true);
    try {
      const data = await api.fetchWorkflows(activeToken);
      if (Array.isArray(data)) {
        setWorkflows(data);
      }
    } catch (error) {
      console.error("Failed to fetch workflows", error);
      if (error.message === 'UNAUTHORIZED') {
        handleLogout();
      }
    } finally {
      setLoadingWorkflows(false);
    }
  };

  // Trigger GitHub Workflow
  const triggerWorkflow = async (id) => {
    if (!token || role === 'ROLE_GUEST') return;
    try {
      await api.triggerWorkflow(id, token);
      setTimeout(fetchWorkflows, 1500); // Refresh the workflow list shortly after triggering
    } catch (error) {
      console.error(`Failed to trigger workflow ${id}`, error);
      if (error.message === 'UNAUTHORIZED') {
        handleLogout();
      }
    }
  };

  // Initialize and periodically refresh data when Authenticated
  useEffect(() => {
    if (!token) return;

    // Initial fetch
    fetchHealth(token);
    fetchDeployments(token);
    fetchWorkflows(token);
    fetchPodHealth(token);

    // Periodic refresh for health and deployments every 30 seconds
    const interval = setInterval(() => {
      fetchHealth(token);
      fetchDeployments(token);
      fetchPodHealth(token);
    }, 30000);

    return () => clearInterval(interval);
  }, [token]);

  // Render Login overlay if token is not available
  if (!token) {
    return (
      <Login
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        authError={authError}
        authLoading={authLoading}
        handleLogin={handleLogin}
        handleGuestLogin={handleGuestLogin}
      />
    );
  }

  // Dashboard Main View
  return (
    <AppShell
      role={role}
      handleLogout={handleLogout}
      activeHash={activeSection}
    >
      {activeSection === '#overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ErrorBoundary>
              <MetricsCards
                health={health}
                loading={loading}
                fetchHealth={() => fetchHealth()}
              />
            </ErrorBoundary>
            <div className="lg:col-span-2">
              <ErrorBoundary>
                <HealthSLOPanel
                  podHealth={podHealth}
                  loading={loadingPodHealth}
                  fetchPodHealth={() => fetchPodHealth()}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {activeSection === '#deployments' && (
        <ErrorBoundary>
          <DeploymentsTable
            deployments={deployments}
            loading={loadingDeployments}
            role={role}
            fetchDeployments={() => fetchDeployments()}
            handleDeploymentAction={handleDeploymentAction}
            onViewLogs={(deployment) => {
              setActiveLogDeployment(deployment);
              setShowLogsModal(true);
            }}
          />
        </ErrorBoundary>
      )}

      {activeSection === '#pipelines' && (
        <ErrorBoundary>
          <WorkflowsTable
            workflows={workflows}
            loadingWorkflows={loadingWorkflows}
            role={role}
            fetchWorkflows={() => fetchWorkflows()}
            triggerWorkflow={triggerWorkflow}
          />
        </ErrorBoundary>
      )}

      {activeSection === '#observability' && (
        <div className="space-y-6">
          <ErrorBoundary>
            <SystemMetricsPanel token={token} />
          </ErrorBoundary>
          <ErrorBoundary>
            <LogViewer logs={logs} logsContainerRef={logsContainerRef} />
          </ErrorBoundary>
        </div>
      )}

      {/* Deployment Logs Modal */}
      {showLogsModal && activeLogDeployment && (
        <LogsModal
          activeLogDeployment={activeLogDeployment}
          activeDeploymentLogs={activeDeploymentLogs}
          deploymentLogsRef={deploymentLogsRef}
          onClose={() => {
            setShowLogsModal(false);
            setActiveLogDeployment(null);
          }}
        />
      )}
    </AppShell>
  );
}
