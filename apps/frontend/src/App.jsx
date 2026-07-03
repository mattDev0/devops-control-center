import { useState, useEffect, useRef } from 'react';
import { LogOut, LayoutDashboard, ChevronLeft, ChevronRight, Menu, Layers, GitPullRequest, FileText, Globe, LineChart } from 'lucide-react';


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

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [podHealth, setPodHealth] = useState(null);
  const [loadingPodHealth, setLoadingPodHealth] = useState(false);

  // Sidebar Layout State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    <div className="min-h-screen flex bg-[var(--bg-canvas)] text-[var(--fg-default)] font-sans">
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div 
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      {/* Persistent/Collapsible Left Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--bg-surface)] border-r border-[var(--border-default)] transition-all duration-300 md:sticky md:block shrink-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
      >
        {/* Sidebar Header */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-[var(--border-muted)]">
          {!sidebarCollapsed ? (
            <span className="font-bold text-sm tracking-wider uppercase text-[var(--accent-primary)] flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5" />
              Control Center
            </span>
          ) : (
            <div className="mx-auto text-[var(--accent-primary)]">
              <LayoutDashboard className="w-5 h-5" />
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors"
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Sidebar Navigation Links */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          <button
            onClick={() => {
              document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' });
              setMobileOpen(false);
            }}
            className="flex items-center w-full gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors"
            title="Overview"
          >
            <LayoutDashboard className="w-5 h-5 shrink-0 text-[var(--fg-subtle)]" />
            {!sidebarCollapsed && <span>Overview</span>}
          </button>
          
          <button
            onClick={() => {
              document.getElementById('deployments')?.scrollIntoView({ behavior: 'smooth' });
              setMobileOpen(false);
            }}
            className="flex items-center w-full gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors"
            title="Deployments"
          >
            <Layers className="w-5 h-5 shrink-0 text-[var(--fg-subtle)]" />
            {!sidebarCollapsed && <span>Deployments</span>}
          </button>

          <button
            onClick={() => {
              document.getElementById('pipelines')?.scrollIntoView({ behavior: 'smooth' });
              setMobileOpen(false);
            }}
            className="flex items-center w-full gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors"
            title="Pipelines"
          >
            <GitPullRequest className="w-5 h-5 shrink-0 text-[var(--fg-subtle)]" />
            {!sidebarCollapsed && <span>Pipelines</span>}
          </button>

          <button
            onClick={() => {
              document.getElementById('logs')?.scrollIntoView({ behavior: 'smooth' });
              setMobileOpen(false);
            }}
            className="flex items-center w-full gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors"
            title="System Logs"
          >
            <FileText className="w-5 h-5 shrink-0 text-[var(--fg-subtle)]" />
            {!sidebarCollapsed && <span>System Logs</span>}
          </button>

          <button
            onClick={() => {
              document.getElementById('metrics')?.scrollIntoView({ behavior: 'smooth' });
              setMobileOpen(false);
            }}
            className="flex items-center w-full gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors"
            title="System Metrics"
          >
            <LineChart className="w-5 h-5 shrink-0 text-[var(--fg-subtle)]" />
            {!sidebarCollapsed && <span>System Metrics</span>}
          </button>
        </nav>

        {/* Scope Context Box */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-[var(--border-muted)] bg-[var(--bg-canvas)]/30 m-2 rounded-lg">
            <div className="text-[10px] uppercase font-bold text-[var(--fg-subtle)] tracking-wider">Scope Context</div>
            <div className="text-xs font-semibold mt-1 flex items-center gap-1.5 text-[var(--accent-primary)]">
              <Globe className="w-3.5 h-3.5" />
              Production / K3s
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Sticky Top Nav Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-default)] px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-1.5 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] md:hidden transition-colors"
              title="Toggle Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <h1 className="text-base font-bold tracking-tight text-[var(--fg-default)] flex items-center gap-2">
              DevOps Control Center
            </h1>
            
            {role === 'ROLE_GUEST' && (
              <span className="text-[10px] font-mono font-medium bg-[var(--bg-elevated)] border border-[var(--border-muted)] text-[var(--fg-muted)] px-2 py-0.5 rounded">
                🔒 Guest Mode
              </span>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:bg-red-500/10 hover:text-red-400 border border-[var(--border-default)] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </header>

        {/* Scrollable Panel Container */}
        <main className="flex-grow p-6 overflow-y-auto space-y-6 max-w-7xl w-full mx-auto">
          {/* Row 1: Health & Overview */}
          <div id="overview" className="scroll-mt-20 grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          {/* Row 1.5: System Metrics */}
          <div id="metrics" className="scroll-mt-20">
            <ErrorBoundary>
              <SystemMetricsPanel token={token} />
            </ErrorBoundary>
          </div>

          {/* Row 2: Deployments & CI/CD */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div id="deployments" className="scroll-mt-20">
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
            </div>
            
            <div id="pipelines" className="scroll-mt-20">
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
          </div>

          {/* Row 3: Logs */}
          <div id="logs" className="scroll-mt-20 grid grid-cols-1">
            <ErrorBoundary>
              <LogViewer logs={logs} logsContainerRef={logsContainerRef} />
            </ErrorBoundary>
          </div>
        </main>
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
