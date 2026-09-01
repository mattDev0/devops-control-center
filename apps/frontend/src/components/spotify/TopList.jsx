/**
 * Ranked list. These rows are identities, not magnitudes to compare, so the
 * artwork and name carry the meaning and the bar is only a subtle scale cue.
 */
export default function TopList({ items, loading, emptyMessage, renderMeta }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-9 h-9 rounded bg-[var(--bg-elevated)]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 bg-[var(--bg-elevated)] rounded w-1/2" />
              <div className="h-2 bg-[var(--bg-elevated)] rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return <div className="text-xs text-[var(--fg-muted)] py-6 text-center">{emptyMessage}</div>;
  }

  return (
    <ol className="space-y-1">
      {items.map((item, i) => (
        <li key={item.id}
            className="flex items-center gap-3 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--interactive-hover)] transition-colors">
          <span className="w-4 text-[11px] tabular-nums text-[var(--fg-subtle)] text-right shrink-0">
            {i + 1}
          </span>
          {item.image || item.album_art ? (
            <img src={item.image || item.album_art} alt=""
                 className="w-9 h-9 rounded object-cover shrink-0" loading="lazy" />
          ) : (
            <div className="w-9 h-9 rounded bg-[var(--bg-elevated)] shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-[var(--fg-default)] truncate">{item.name}</div>
            <div className="text-[11px] text-[var(--fg-muted)] truncate">{renderMeta(item)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
