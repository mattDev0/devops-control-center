import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import WorkspaceStatusPanel from '../components/workspace/WorkspaceStatusPanel';

describe('WorkspaceStatusPanel', () => {
  const populatedData = {
    vm: {
      state: 'ok',
      label: 'dev-workspace',
      status: 'running',
      region: 'gb-lon',
      checkedAt: new Date(Date.now() - 30000).toISOString(),
      error: null,
    },
    credit: {
      state: 'ok',
      remainingUsd: 98.50,
      uninvoicedUsd: 12.30,
      expiresAt: '2027-01-01T04:59:59Z',
      daysLeft: 62,
      checkedAt: new Date(Date.now() - 30000).toISOString(),
      error: null,
    },
    sync: {
      state: 'ok',
      checkedAt: new Date(Date.now() - 30000).toISOString(),
      error: null,
      hosts: [
        { host: 'matt-PC', label: 'Laptop (WSL)', lastChangeAt: null },
        {
          host: 'dev-workspace',
          label: 'Workspace VM',
          lastChangeAt: new Date(Date.now() - 7200000).toISOString(), // 2h ago
        },
      ],
    },
  };

  it('renders loading state when loading without data', () => {
    const { container } = render(<WorkspaceStatusPanel data={null} loading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders overall error sentinel', () => {
    render(<WorkspaceStatusPanel data={{ error: 'Workspace status is unavailable.' }} loading={false} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Workspace status is unavailable.')).toBeInTheDocument();
  });

  it('renders all three rows populated with expected format', () => {
    render(<WorkspaceStatusPanel data={populatedData} loading={false} />);

    // Shell title
    expect(screen.getByRole('heading', { name: 'Dev workspace' })).toBeInTheDocument();

    // VM row
    expect(screen.getByText('dev-workspace')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('gb-lon')).toBeInTheDocument();

    // Credit row
    expect(screen.getByText('$98.50 left')).toBeInTheDocument();
    expect(screen.getByText('$12.30 this month')).toBeInTheDocument();
    expect(screen.getByText(/expires Jan 1, 2027 \(62 days\)/i)).toBeInTheDocument();

    // Memory sync row
    expect(screen.getByText('Laptop (WSL)')).toBeInTheDocument();
    expect(screen.getByText('No recent changes')).toBeInTheDocument();
    expect(screen.getByText('Workspace VM')).toBeInTheDocument();
    expect(screen.getByText(/Last change synced 2h ago/i)).toBeInTheDocument();
  });

  it('renders unconfigured state for all three rows', () => {
    const unconfiguredData = {
      vm: { state: 'unconfigured', label: null, status: null, region: null, checkedAt: null, error: null },
      credit: { state: 'unconfigured', remainingUsd: null, uninvoicedUsd: null, expiresAt: null, daysLeft: null, checkedAt: null, error: null },
      sync: { state: 'unconfigured', checkedAt: null, error: null, hosts: [] },
    };

    render(<WorkspaceStatusPanel data={unconfiguredData} loading={false} />);

    const notConfiguredElements = screen.getAllByText('Not configured');
    expect(notConfiguredElements.length).toBe(3);
  });

  it('renders error row state while preserving last good values', () => {
    const errorWithValues = {
      vm: {
        state: 'error',
        label: 'dev-workspace',
        status: 'running',
        region: 'gb-lon',
        checkedAt: new Date(Date.now() - 30000).toISOString(),
        error: 'Linode API unavailable',
      },
      credit: {
        state: 'error',
        remainingUsd: 98.50,
        uninvoicedUsd: 12.30,
        expiresAt: '2027-01-01T04:59:59Z',
        daysLeft: 62,
        checkedAt: new Date(Date.now() - 30000).toISOString(),
        error: 'Linode API unavailable',
      },
      sync: {
        state: 'error',
        checkedAt: new Date(Date.now() - 30000).toISOString(),
        error: 'GitHub API unavailable',
        hosts: [
          {
            host: 'dev-workspace',
            label: 'Workspace VM',
            lastChangeAt: new Date(Date.now() - 7200000).toISOString(),
          },
        ],
      },
    };

    render(<WorkspaceStatusPanel data={errorWithValues} loading={false} />);

    // Preserved values
    expect(screen.getByText('dev-workspace')).toBeInTheDocument();
    expect(screen.getByText('$98.50 left')).toBeInTheDocument();
    expect(screen.getByText('Workspace VM')).toBeInTheDocument();

    // Fixed error texts
    const linodeErrors = screen.getAllByText('Linode API unavailable');
    expect(linodeErrors.length).toBe(2);
    expect(screen.getByText('GitHub API unavailable')).toBeInTheDocument();
  });

  it('displays credit expiry in red when daysLeft is 14 or less', () => {
    const expiringSoon = {
      ...populatedData,
      credit: {
        ...populatedData.credit,
        daysLeft: 14,
        expiresAt: '2026-11-14T04:59:59Z',
      },
    };

    const { rerender } = render(<WorkspaceStatusPanel data={expiringSoon} loading={false} />);
    const soonElem = screen.getByText(/expires Nov 14, 2026 \(14 days\)/i);
    expect(soonElem.className).toContain('text-[var(--status-error)]');

    // Not expiring soon (15 days)
    const notSoon = {
      ...populatedData,
      credit: {
        ...populatedData.credit,
        daysLeft: 15,
        expiresAt: '2026-11-15T04:59:59Z',
      },
    };
    rerender(<WorkspaceStatusPanel data={notSoon} loading={false} />);
    const notSoonElem = screen.getByText(/expires Nov 15, 2026 \(15 days\)/i);
    expect(notSoonElem.className).not.toContain('text-[var(--status-error)]');
  });

  it('does not display red for an old memory sync date', () => {
    const oldSync = {
      ...populatedData,
      sync: {
        state: 'ok',
        checkedAt: new Date(Date.now() - 30000).toISOString(),
        error: null,
        hosts: [
          {
            host: 'dev-workspace',
            label: 'Workspace VM',
            lastChangeAt: new Date(Date.now() - 45 * 86400 * 1000).toISOString(), // 45 days ago
          },
        ],
      },
    };

    render(<WorkspaceStatusPanel data={oldSync} loading={false} />);
    const textElem = screen.getByText(/Last change synced 45d ago/i);
    expect(textElem).toBeInTheDocument();
    expect(textElem.className).not.toContain('text-[var(--status-error)]');
    expect(textElem.className).not.toContain('bg-[var(--status-error)]');
  });

  it('renders "No active credit" when expiresAt is null', () => {
    const noPromoData = {
      ...populatedData,
      credit: {
        state: 'ok',
        remainingUsd: 0,
        uninvoicedUsd: 0,
        expiresAt: null,
        daysLeft: null,
        checkedAt: new Date().toISOString(),
        error: null,
      },
    };

    render(<WorkspaceStatusPanel data={noPromoData} loading={false} />);
    expect(screen.getByText('No active credit')).toBeInTheDocument();
  });
});
