import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useSystemLogs } from '../hooks/useLogs';

const resources = vi.hoisted(() => ({ health: null }));

vi.mock('../hooks/useLogs', () => ({
  useSystemLogs: vi.fn(() => []),
  useDeploymentLogs: vi.fn(() => []),
  useDockerContainerLogs: vi.fn(() => []),
}));

vi.mock('../hooks/useDashboardResources', () => {
  const list = (data) => () => ({ data, loading: false, refresh: () => {} });
  return {
    useServerHealth: () => ({ data: resources.health, loading: false, refresh: () => {} }),
    useDeployments: list([]),
    usePodHealth: list([]),
    useWorkflows: list([]),
    useDockerContainers: list([{ state: 'running' }, { state: 'running' }, { state: 'exited' }]),
  };
});

vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/dashboard/MetricsCards', () => ({
  default: () => null,
  DockerContainersKpiCard: () => null,
  SystemMetricsPanel: () => null,
}));
vi.mock('../components/dashboard/DockerContainersTable', () => ({ default: () => null }));
vi.mock('../components/dashboard/WorkflowsTable', () => ({ default: () => null }));
vi.mock('../components/dashboard/DeploymentsTable', () => ({ default: () => <div>Deployments table</div> }));
vi.mock('../components/dashboard/HealthSLOPanel', () => ({ default: () => <div>Pod health</div> }));
vi.mock('../components/portfolio/PortfolioStatusPanel', () => ({ default: () => null }));
vi.mock('../components/spotify/SpotifyDashboard', () => ({ default: () => null }));
vi.mock('../components/workspace/WorkspaceStatusPanel', () => ({ default: () => null }));

function renderAs(role, k8s = false) {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('role', role);
  resources.health = { os_name: 'Debian', k8s };
  return render(<App />);
}

describe('App dashboard visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useSystemLogs).mockClear();
  });

  it('keeps admin sections and the log stream away from guests', () => {
    renderAs('ROLE_GUEST');

    expect(screen.queryByText('Live System Logs')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Navigate to System Logs')).not.toBeInTheDocument();
    expect(screen.queryByText('Dev workspace')).not.toBeInTheDocument();
    expect(useSystemLogs).not.toHaveBeenCalledWith('test-token');
  });

  it('shows admin sections and connects the log stream for admins', () => {
    renderAs('ROLE_ADMIN');

    expect(screen.getByText('Live System Logs')).toBeInTheDocument();
    expect(screen.getByLabelText('Navigate to System Logs')).toBeInTheDocument();
    expect(screen.getAllByText('Dev workspace').length).toBeGreaterThan(0);
    expect(useSystemLogs).toHaveBeenCalledWith('test-token');
  });

  it('describes a Compose host and hides cluster-only cards without a cluster', () => {
    renderAs('ROLE_GUEST');

    expect(screen.getByText('Production / Docker Compose')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 running')).toBeInTheDocument();
    expect(screen.queryByText('Availability SLI')).not.toBeInTheDocument();
    expect(screen.queryByText('Error Budget')).not.toBeInTheDocument();
    expect(screen.queryByText('Pod health')).not.toBeInTheDocument();
    expect(screen.queryByText('Deployments table')).not.toBeInTheDocument();
  });

  it('shows cluster-only cards when a cluster is connected', () => {
    renderAs('ROLE_GUEST', true);

    expect(screen.getByText('Production / K3s')).toBeInTheDocument();
    expect(screen.getByText('Availability SLI')).toBeInTheDocument();
    expect(screen.getByText('Error Budget')).toBeInTheDocument();
    expect(screen.getByText('Pod health')).toBeInTheDocument();
    expect(screen.getByText('Deployments table')).toBeInTheDocument();
  });
});
