import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';

const GIB = 1024 ** 3;

/** Days until the credit renews, or null when the exporter has not said. */
function daysUntil(epochSeconds) {
  if (!epochSeconds) return null;
  const ms = epochSeconds * 1000 - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}

function Shell({ children, onRefresh, refreshing }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 h-full flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-[var(--fg-default)]">
          <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)]" aria-hidden="true" />
          VPN egress
        </h3>
        <button onClick={onRefresh} disabled={refreshing}
                className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors disabled:opacity-50 cursor-pointer"
                title="Refresh" aria-label="Refresh VPN usage">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default function VpnUsagePanel({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      setData(await api.fetchVpnUsage(token));
    } catch (e) {
      setError(e.message === 'UNAUTHORIZED' ? 'Not authorized.' : e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return (
      <Shell onRefresh={load} refreshing={loading}>
        <div className="flex flex-col items-center justify-center h-full text-center py-4" role="alert">
          <AlertTriangle className="w-4 h-4 text-[var(--status-error)] mb-2" aria-hidden="true" />
          <p className="text-xs text-[var(--fg-muted)]">{error}</p>
        </div>
      </Shell>
    );
  }

  if (loading && !data) {
    return (
      <Shell onRefresh={load} refreshing={loading}>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-[var(--bg-elevated)] rounded w-1/2" />
          <div className="h-2 bg-[var(--bg-elevated)] rounded" />
          <div className="h-3 bg-[var(--bg-elevated)] rounded w-2/3" />
        </div>
      </Shell>
    );
  }

  if (!data?.reachable) {
    return (
      <Shell onRefresh={load} refreshing={loading}>
        <div className="flex flex-col items-center justify-center h-full text-center py-4">
          <p className="text-sm text-[var(--fg-default)] mb-1">VPN not reporting</p>
          <p className="text-xs text-[var(--fg-muted)]">
            No recent scrape. The figures below would be stale, so none are shown.
          </p>
        </div>
      </Shell>
    );
  }

  const credit = data.creditUsd ?? 10;
  const cost = data.costUsd ?? 0;
  const pct = credit > 0 ? Math.min((cost / credit) * 100, 100) : 0;
  const remaining = Math.max(credit - cost, 0);
  const days = daysUntil(data.cycleEnd);
  const usedGiB = data.usedBytes != null ? data.usedBytes / GIB : null;
  const burnGiB = data.burnBytesPerDay != null ? data.burnBytesPerDay / GIB : null;

  // Status colour is reserved for state, and here the state is "will this
  // overspend". Below 80% of the credit there is nothing to report.
  const barColor =
    pct >= 95 ? 'var(--status-error)' : pct >= 80 ? 'var(--status-warning)' : 'var(--accent-primary)';

  return (
    <Shell onRefresh={load} refreshing={loading}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-bold text-[var(--fg-default)] tabular-nums leading-none">
          {data.costEstimated ? '~' : ''}${cost.toFixed(2)}
        </span>
        <span className="text-sm text-[var(--fg-muted)]">of ${credit.toFixed(0)}</span>
        {data.costEstimated && (
          <span className="text-[10px] text-[var(--fg-subtle)] border border-[var(--border-emphasis)] rounded px-1.5 py-0.5">
            estimated
          </span>
        )}
      </div>
      <p className="text-[11px] text-[var(--fg-muted)] mb-4">
        ${remaining.toFixed(2)} left{days != null ? ` · renews in ${days} day${days === 1 ? '' : 's'}` : ''}
      </p>

      <div className="h-2 rounded-full bg-[var(--bg-inset)] overflow-hidden mb-4">
        <div className="h-full rounded-full transition-all"
             style={{ width: `${Math.max(pct, cost > 0 ? 1.5 : 0)}%`, background: barColor }}
             role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
             aria-label="Credit consumed" />
      </div>

      <dl className="grid grid-cols-2 gap-y-2.5 text-[11px]">
        <dt className="text-[var(--fg-muted)]">Egress used</dt>
        <dd className="text-right text-[var(--fg-default)] tabular-nums">
          {usedGiB != null ? `${usedGiB.toFixed(2)} GiB` : '—'}
        </dd>

        <dt className="text-[var(--fg-muted)]">Current rate</dt>
        <dd className="text-right text-[var(--fg-default)] tabular-nums">
          {burnGiB != null ? `${burnGiB.toFixed(3)} GiB/day` : '—'}
        </dd>

        <dt className="text-[var(--fg-muted)]">Tunnels</dt>
        <dd className="text-right tabular-nums">
          <span className={data.tunnelsUp === data.tunnelsTotal
            ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}>
            {data.tunnelsUp ?? '—'}/{data.tunnelsTotal ?? '—'} up
          </span>
        </dd>

        <dt className="text-[var(--fg-muted)]">Auto-shutdown</dt>
        <dd className="text-right">
          <span className={data.autostopArmed
            ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}>
            {data.autostopArmed == null ? '—' : data.autostopArmed ? 'Armed' : 'Disarmed'}
          </span>
        </dd>
      </dl>

      {(data.calendarMonthFallback || data.dataComplete === false || data.costEstimated) && (
        <ul className="text-[10px] text-[var(--fg-subtle)] mt-4 space-y-1 leading-relaxed">
          {data.calendarMonthFallback && (
            <li>Measured over the calendar month, not your 16th-to-16th credit cycle.</li>
          )}
          {data.dataComplete === false && (
            <li>
              Part of this cycle has no recorded data, so egress and cost are a
              floor, not a total. Complete from the cycle beginning 16 Sep.
            </li>
          )}
          {data.costEstimated && (
            <li>
              Cost is calculated from published rates, not your actual bill.
              Check Billing &rarr; Credits for the real figure.
            </li>
          )}
        </ul>
      )}
    </Shell>
  );
}
