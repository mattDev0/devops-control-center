import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowsTable from '../components/dashboard/WorkflowsTable';

const WORKFLOWS = [
  {
    id: 1,
    name: '[devops-control-center] Production Deployment (Docker Compose)',
    status: 'completed',
    conclusion: 'success',
    branch: 'main',
    commitMsg: 'Merge pull request #109',
  },
];

function renderWorkflows(role) {
  return render(
    <WorkflowsTable
      workflows={WORKFLOWS}
      loadingWorkflows={false}
      role={role}
      fetchWorkflows={vi.fn()}
      triggerWorkflow={vi.fn()}
    />
  );
}

describe('WorkflowsTable', () => {
  it('hides the Deploy column and Run button for ROLE_GUEST', () => {
    renderWorkflows('ROLE_GUEST');

    expect(screen.queryByText('Deploy')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Run')).not.toBeInTheDocument();
  });

  it('shows the Deploy column and enabled Run button for ROLE_ADMIN', () => {
    renderWorkflows('ROLE_ADMIN');

    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getByTitle('Run')).not.toBeDisabled();
  });

  it('splits the repo prefix from the workflow name', () => {
    renderWorkflows('ROLE_GUEST');

    expect(screen.getByText('Production Deployment (Docker Compose)')).toBeInTheDocument();
    expect(screen.getByText('devops-control-center')).toBeInTheDocument();
    expect(
      screen.queryByText('[devops-control-center] Production Deployment (Docker Compose)')
    ).not.toBeInTheDocument();
  });
});
