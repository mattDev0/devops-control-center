import { Globe, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { usePortfolioStatus } from '../../hooks/useDashboardResources';

function formatRelativeTime(isoString) {
  if (!isoString) return 'never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function Sparkline({ history }) {
  if (!history || history.length < 2) return null;
  const width = 56;
  const height = 16;
  const padding = 2;
  const latencies = history.map((h) => h.latencyMs || 0);
  const maxLat = Math.max(...latencies, 1);
  const minLat = Math.min(...latencies, 0);
  const range = maxLat - minLat || 1;

  const points = history.map((sample, i) => {
    const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
    const y = height - padding - (((sample.latencyMs || 0) - minLat) / range) * (height - 2 * padding);
    return { x, y, up: sample.up };
  });

  const pathD = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');

  return (
    <svg width={width} height={height} className="overflow-visible inline-block shrink-0" aria-hidden="true">
      <path d={pathD} fill="none" stroke="var(--fg-subtle)" strokeWidth="1" strokeOpacity="0.4" />
      {points.map((p, i) =>
        !p.up ? (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--status-error)" />
        ) : null
      )}
    </svg>
  );
}

function Shell({ children, onRefresh, refreshing }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--fg-default)]">Portfolio</h3>
          <a
            href="https://mattdev0.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--fg-subtle)] hover:text-[var(--accent-primary)] flex items-center gap-1 transition-colors"
            title="Open mattdev0.tech"
            aria-label="Open portfolio website"
          >
            <span className="hidden sm:inline">mattdev0.tech</span>
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors disabled:opacity-50 cursor-pointer"
          title="Refresh"
          aria-label="Refresh portfolio status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default function PortfolioStatusPanel({
  data: propData,
  loading: propLoading,
  error: propError,
  onRefresh: propOnRefresh,
  token,
  onUnauthorized,
}) {
  const hookResult = usePortfolioStatus(propData === undefined ? token : null, onUnauthorized);
  const data = propData !== undefined ? propData : hookResult.data;
  const loading = propLoading !== undefined ? propLoading : hookResult.loading;
  const onRefresh = propOnRefresh !== undefined ? propOnRefresh : hookResult.refresh;
  const error = propError || '';

  if (error) {
    return (
      <Shell onRefresh={onRefresh} refreshing={loading}>
        <div className="flex flex-col items-center justify-center py-6 text-center" role="alert">
          <AlertTriangle className="w-4 h-4 text-[var(--status-error)] mb-2" aria-hidden="true" />
          <p className="text-xs text-[var(--fg-muted)]">{error}</p>
        </div>
      </Shell>
    );
  }

  if (loading && !data) {
    return (
      <Shell onRefresh={onRefresh} refreshing={loading}>
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-[var(--bg-elevated)] rounded" />
          <div className="h-10 bg-[var(--bg-elevated)] rounded" />
          <div className="h-10 bg-[var(--bg-elevated)] rounded" />
        </div>
      </Shell>
    );
  }

  const targets = data?.targets || [];

  return (
    <Shell onRefresh={onRefresh} refreshing={loading}>
      {targets.length === 0 ? (
        <div className="text-center py-4 text-xs text-[var(--fg-muted)]">
          No portfolio targets configured.
        </div>
      ) : (
        <div className="space-y-2.5">
          {targets.map((target) => (
            <div
              key={target.key}
              className="bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      target.up === true
                        ? 'bg-[var(--status-success)]'
                        : target.up === false
                        ? 'bg-[var(--status-error)] animate-pulse'
                        : 'bg-[var(--status-neutral)]'
                    }`}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-xs font-medium ${
                      target.up === true
                        ? 'text-[var(--status-success)]'
                        : target.up === false
                        ? 'text-[var(--status-error)]'
                        : 'text-[var(--fg-subtle)]'
                    }`}
                  >
                    {target.up === true ? 'Up' : target.up === false ? 'Down' : 'Pending'}
                  </span>
                  <span className="font-medium text-sm text-[var(--fg-default)] truncate">
                    {target.label}
                  </span>
                  {target.statusCode != null && (
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--fg-muted)]">
                      HTTP {target.statusCode}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs shrink-0">
                  {target.latencyMs != null && (
                    <span className="font-mono text-[var(--fg-muted)]">
                      {target.latencyMs} ms
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--fg-subtle)] text-[11px]">1h:</span>
                    <span className="font-mono text-[var(--fg-default)]">
                      {target.uptimePercent != null ? `${target.uptimePercent.toFixed(1)}%` : '–'}
                    </span>
                  </div>
                  <Sparkline history={target.history} />
                  <span className="text-[11px] text-[var(--fg-subtle)]">
                    {formatRelativeTime(target.checkedAt)}
                  </span>
                </div>
              </div>

              {target.up === false && target.error && (
                <div className="text-xs font-mono text-[var(--status-error)] bg-[var(--status-error-muted)] px-2.5 py-1 rounded">
                  {target.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
