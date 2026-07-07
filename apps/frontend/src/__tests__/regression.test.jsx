import { describe, test, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Login from '../components/auth/Login';
import DeploymentsTable from '../components/dashboard/DeploymentsTable';
import WorkflowsTable from '../components/dashboard/WorkflowsTable';
import ThemeToggle from '../components/ui/ThemeToggle';

// Mock matchMedia for JSDOM theme environment
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('Login Component', () => {
  test('renders form with username and password fields', () => {
    render(
      <Login
        username=""
        setUsername={vi.fn()}
        password=""
        setPassword={vi.fn()}
        authError=""
        authLoading={false}
        handleLogin={vi.fn()}
        handleGuestLogin={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view as guest/i })).toBeInTheDocument();
  });

  test('displays error when authError is set', () => {
    render(
      <Login
        username=""
        setUsername={vi.fn()}
        password=""
        setPassword={vi.fn()}
        authError="Invalid credentials"
        authLoading={false}
        handleLogin={vi.fn()}
        handleGuestLogin={vi.fn()}
      />
    );

    const errorMessage = screen.getByText('Invalid credentials');
    expect(errorMessage).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toHaveAttribute('aria-describedby', 'auth-error-message');
  });
});

describe('DeploymentsTable Component', () => {
  test('renders skeleton loader when loading', () => {
    const { container } = render(
      <DeploymentsTable
        deployments={[]}
        loading={true}
        role="ROLE_ADMIN"
        fetchDeployments={vi.fn()}
        handleDeploymentAction={vi.fn()}
        onViewLogs={vi.fn()}
      />
    );

    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test('renders empty state when no deployments', () => {
    render(
      <DeploymentsTable
        deployments={[]}
        loading={false}
        role="ROLE_ADMIN"
        fetchDeployments={vi.fn()}
        handleDeploymentAction={vi.fn()}
        onViewLogs={vi.fn()}
      />
    );

    expect(screen.getByText(/no deployments found/i)).toBeInTheDocument();
  });
});

describe('WorkflowsTable Component', () => {
  test('renders workflow rows', () => {
    const workflows = [
      {
        id: 'wf-1',
        name: 'Build and Deploy Rust Microservice',
        status: 'completed',
        conclusion: 'success',
        branch: 'main',
        commitMsg: 'feat: add metrics tracking',
      }
    ];

    render(
      <WorkflowsTable
        workflows={workflows}
        loadingWorkflows={false}
        role="ROLE_ADMIN"
        fetchWorkflows={vi.fn()}
        triggerWorkflow={vi.fn()}
      />
    );

    expect(screen.getByText('Build and Deploy Rust Microservice')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });
});

describe('ThemeToggle Component', () => {
  test('toggles theme when clicked', () => {
    render(<ThemeToggle />);
    const toggleButton = screen.getByRole('button');
    expect(toggleButton).toBeInTheDocument();

    // Click trigger and inspect active label toggles
    const initialLabel = toggleButton.getAttribute('aria-label');
    fireEvent.click(toggleButton);
    const nextLabel = toggleButton.getAttribute('aria-label');
    expect(initialLabel).not.toBe(nextLabel);
  });
});
