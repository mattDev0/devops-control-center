import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StaleNotice from '../components/dashboard/StaleNotice';
import { formatAge } from '../utils/formatAge';

describe('StaleNotice', () => {
  it('renders nothing when neither flag is set', () => {
    const { container } = render(
      <StaleNotice stale={false} unavailable={false} lastUpdated={Date.now()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders "Data unavailable" when unavailable is true', () => {
    render(<StaleNotice stale={false} unavailable={true} lastUpdated={null} />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Data unavailable');
  });

  it('renders stale notice with formatted age when stale is true', () => {
    const now = 1000000;
    const lastUpdated = now - 45000;
    render(
      <StaleNotice stale={true} unavailable={false} lastUpdated={lastUpdated} now={now} />
    );
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Stale data · last updated 45s ago');
  });
});

describe('formatAge', () => {
  it('formats various millisecond durations properly', () => {
    expect(formatAge(0)).toBe('0s ago');
    expect(formatAge(59000)).toBe('59s ago');
    expect(formatAge(60000)).toBe('1m ago');
    expect(formatAge(3600000)).toBe('1h ago');
    expect(formatAge(-5)).toBe('0s ago');
  });
});
