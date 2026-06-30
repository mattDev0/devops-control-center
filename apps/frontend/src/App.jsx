import { useState, useEffect, useRef } from 'react';
import { LogOut, LayoutDashboard } from 'lucide-react';

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
import MetricsCards from './components/dashboard/MetricsCards';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);

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

    // Periodic refresh for health and deployments every 30 seconds
    const interval = setInterval(() => {
      fetchHealth(token);
      fetchDeployments(token);
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
    <div className="min-h-screen p-8 max-w-6xl mx-auto font-sans">
      <header className="mb-8 flex justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold text-emerald-400 flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8" />
            DevOps Control Center
          </h1>
          {role === 'ROLE_GUEST' && (
            <span className="text-xs text-slate-400 font-mono mt-1 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50 w-fit">
              🔒 Read-Only Guest Mode
            </span>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-slate-400 border border-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02]"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </header>

      {/* Row 1: Health & Overview */}
      <div className="grid grid-cols-1 gap-6 mb-6">
        <ErrorBoundary>
          <MetricsCards
            health={health}
            loading={loading}
            fetchHealth={() => fetchHealth()}
            token={token}
          />
        </ErrorBoundary>
      </div>

      {/* Row 2: Deployments & CI/CD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ErrorBoundary>
          <DeploymentsTable
            deployments={deployments}
            role={role}
            fetchDeployments={() => fetchDeployments()}
            handleDeploymentAction={handleDeploymentAction}
            onViewLogs={(deployment) => {
              setActiveLogDeployment(deployment);
              setShowLogsModal(true);
            }}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <WorkflowsTable
            workflows={workflows}
            loadingWorkflows={loadingWorkflows}
            role={role}
            fetchWorkflows={() => fetchWorkflows()}
            triggerWorkflow={triggerWorkflow}
          />
        </ErrorBoundary>
      </div>

      {/* Row 3: Logs */}
      <div className="grid grid-cols-1 gap-6 mb-6">
        <ErrorBoundary>
          <LogViewer logs={logs} logsContainerRef={logsContainerRef} />
        </ErrorBoundary>
      </div>

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
    </div>
  );
}
