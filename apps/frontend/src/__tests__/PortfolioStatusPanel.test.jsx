import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PortfolioStatusPanel from '../components/portfolio/PortfolioStatusPanel';

describe('PortfolioStatusPanel', () => {
  const mockTargets = [
    {
      key: 'frontend',
      label: 'Frontend',
      url: 'https://mattdev0.tech/',
      up: true,
      statusCode: 200,
      latencyMs: 145,
      checkedAt: new Date(Date.now() - 30000).toISOString(),
      lastSuccessAt: new Date(Date.now() - 30000).toISOString(),
      error: null,
      uptimePercent: 100.0,
      history: [
        { checkedAt: new Date().toISOString(), up: true, latencyMs: 145 },
        { checkedAt: new Date().toISOString(), up: true, latencyMs: 150 },
      ],
    },
    {
      key: 'rust-api',
      label: 'Rust API',
      url: 'https://portfolio-rust-api.run.app/health',
      up: false,
      statusCode: 503,
      latencyMs: 742,
      checkedAt: new Date(Date.now() - 10000).toISOString(),
      lastSuccessAt: new Date(Date.now() - 70000).toISOString(),
      error: 'HTTP 503',
      uptimePercent: 50.0,
      history: [
        { checkedAt: new Date().toISOString(), up: true, latencyMs: 200 },
        { checkedAt: new Date().toISOString(), up: false, latencyMs: 742 },
      ],
    },
    {
      key: 'java-api',
      label: 'Java API',
      url: 'https://portfolio-java-api.run.app/actuator/health',
      up: null,
      statusCode: null,
      latencyMs: null,
      checkedAt: null,
      lastSuccessAt: null,
      error: null,
      uptimePercent: null,
      history: [],
    },
  ];

  it('renders loading state when loading without data', () => {
    const { container } = render(
      <PortfolioStatusPanel data={null} loading={true} />
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders error state when an error is provided', () => {
    render(
      <PortfolioStatusPanel data={null} loading={false} error="Could not reach orchestrator" />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Could not reach orchestrator')).toBeInTheDocument();
  });

  it('renders up, down and pending target states with correct labels', () => {
    render(
      <PortfolioStatusPanel
        data={{ intervalSeconds: 60, targets: mockTargets }}
        loading={false}
      />
    );

    // Header & link
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /portfolio website/i });
    expect(link).toHaveAttribute('href', 'https://mattdev0.tech');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    // Frontend (up)
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Up')).toBeInTheDocument();
    expect(screen.getByText('145 ms')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();

    // Rust API (down)
    expect(screen.getByText('Rust API')).toBeInTheDocument();
    expect(screen.getByText('Down')).toBeInTheDocument();
    expect(screen.getAllByText('HTTP 503').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('50.0%')).toBeInTheDocument();

    // Java API (pending)
    expect(screen.getByText('Java API')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('renders timeout error text when target is down with a timeout', () => {
    const timeoutTargets = [
      {
        key: 'rust-api',
        label: 'Rust API',
        url: 'https://portfolio-rust-api.run.app/health',
        up: false,
        statusCode: null,
        latencyMs: 10005,
        checkedAt: new Date().toISOString(),
        lastSuccessAt: null,
        error: 'timeout after 10000 ms',
        uptimePercent: 0.0,
        history: [],
      },
    ];

    render(
      <PortfolioStatusPanel
        data={{ intervalSeconds: 60, targets: timeoutTargets }}
        loading={false}
      />
    );

    expect(screen.getByText('timeout after 10000 ms')).toBeInTheDocument();
  });

  it('calls onRefresh when refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(
      <PortfolioStatusPanel
        data={{ intervalSeconds: 60, targets: mockTargets }}
        loading={false}
        onRefresh={onRefresh}
      />
    );

    const refreshButton = screen.getByRole('button', { name: /refresh portfolio status/i });
    fireEvent.click(refreshButton);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
