import { Terminal, RefreshCw, AlertTriangle } from 'lucide-react';
import { useWorkspaceStatus } from '../../hooks/useDashboardResources';

function formatSyncRelativeTime(isoString) {
  if (!isoString) return 'never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatCreditExpiry(isoString, daysLeft) {
  if (!isoString) return 'No active credit';
  const d = new Date(isoString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const daysStr = daysLeft != null ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'})` : '';
  return `expires ${month} ${day}, ${year}${daysStr}`;
}

function Shell({ children, onRefresh, refreshing }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-muted)] mb-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--fg-default)]">Dev workspace</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors disabled:opacity-50 cursor-pointer"
          title="Refresh"
          aria-label="Refresh workspace status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default function WorkspaceStatusPanel({
  data: propData,
  loading: propLoading,
  error: propError,
  onRefresh: propOnRefresh,
  token,
  onUnauthorized,
}) {
  const hookResult = useWorkspaceStatus(propData === undefined ? token : null, onUnauthorized);
  const data = propData !== undefined ? propData : hookResult.data;
  const loading = propLoading !== undefined ? propLoading : hookResult.loading;
  const onRefresh = propOnRefresh !== undefined ? propOnRefresh : hookResult.refresh;
  const error = propError || data?.error || '';

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

  const vm = data?.vm;
  const credit = data?.credit;
  const sync = data?.sync;

  const isCreditExpiringSoon = credit?.daysLeft != null && credit.daysLeft <= 14;
  // A section that has never succeeded has no values to show, only its error.
  const creditNeverLoaded = credit?.state === 'error' && credit?.checkedAt == null;
  const syncNeverLoaded = sync?.state === 'error' && sync?.checkedAt == null;

  return (
    <Shell onRefresh={onRefresh} refreshing={loading}>
      <div className="space-y-2.5">
        {/* Row 1: VM */}
        <div className="bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                VM
              </span>
              {vm?.state === 'unconfigured' ? (
                <span className="text-xs text-[var(--fg-muted)]">Not configured</span>
              ) : vm?.state === 'pending' ? (
                <span className="text-xs text-[var(--fg-muted)]">Checking…</span>
              ) : (
                <>
                  {vm?.status && (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        vm.status === 'running'
                          ? 'bg-[var(--status-success)]'
                          : 'bg-[var(--status-error)]'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  {vm?.status && (
                    <span
                      className={`text-xs font-medium ${
                        vm.status === 'running'
                          ? 'text-[var(--status-success)]'
                          : 'text-[var(--status-error)]'
                      }`}
                    >
                      {vm.status}
                    </span>
                  )}
                  {vm?.label && (
                    <span className="font-medium text-sm text-[var(--fg-default)] truncate">
                      {vm.label}
                    </span>
                  )}
                  {vm?.region && (
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--fg-muted)]">
                      {vm.region}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          {vm?.state === 'error' && vm?.error && (
            <div className="text-xs font-mono text-[var(--status-error)] bg-[var(--status-error-muted)] px-2.5 py-1 rounded">
              {vm.error}
            </div>
          )}
        </div>

        {/* Row 2: Credit */}
        <div className="bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                Credit
              </span>
              {credit?.state === 'unconfigured' ? (
                <span className="text-xs text-[var(--fg-muted)]">Not configured</span>
              ) : credit?.state === 'pending' ? (
                <span className="text-xs text-[var(--fg-muted)]">Checking…</span>
              ) : creditNeverLoaded ? null : credit?.expiresAt == null ? (
                <span className="text-xs text-[var(--fg-muted)]">No active credit</span>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-mono text-[var(--fg-default)]">
                    ${Number(credit.remainingUsd || 0).toFixed(2)} left
                  </span>
                  <span className="font-mono text-[var(--fg-muted)]">
                    ${Number(credit.uninvoicedUsd || 0).toFixed(2)} this month
                  </span>
                  <span
                    className={`text-[11px] ${
                      isCreditExpiringSoon
                        ? 'text-[var(--status-error)] font-medium'
                        : 'text-[var(--fg-subtle)]'
                    }`}
                  >
                    {formatCreditExpiry(credit.expiresAt, credit.daysLeft)}
                  </span>
                </div>
              )}
            </div>
          </div>
          {credit?.state === 'error' && credit?.error && (
            <div className="text-xs font-mono text-[var(--status-error)] bg-[var(--status-error-muted)] px-2.5 py-1 rounded">
              {credit.error}
            </div>
          )}
        </div>

        {/* Row 3: Memory sync */}
        <div className="bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
              Memory sync
            </span>
          </div>

          {sync?.state === 'unconfigured' ? (
            <div className="text-xs text-[var(--fg-muted)]">Not configured</div>
          ) : sync?.state === 'pending' ? (
            <div className="text-xs text-[var(--fg-muted)]">Checking…</div>
          ) : syncNeverLoaded ? null : (
            <div className="space-y-1.5">
              {(sync?.hosts || []).map((h) => (
                <div key={h.host} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--fg-default)] truncate">
                    {h.label || h.host}
                  </span>
                  <span className="text-[11px] text-[var(--fg-muted)]">
                    {h.lastChangeAt
                      ? `Last change synced ${formatSyncRelativeTime(h.lastChangeAt)}`
                      : 'No recent changes'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {sync?.state === 'error' && sync?.error && (
            <div className="text-xs font-mono text-[var(--status-error)] bg-[var(--status-error-muted)] px-2.5 py-1 rounded">
              {sync.error}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
