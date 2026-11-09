import { formatAge } from '../../utils/formatAge';

// eslint-disable-next-line react-hooks/purity
export default function StaleNotice({ stale, unavailable, lastUpdated, now = Date.now() }) {
  if (unavailable) {
    return (
      <p role="status" className="text-[10px] font-mono text-[var(--status-warning)] mb-2">
        Data unavailable
      </p>
    );
  }
  if (stale) {
    return (
      <p role="status" className="text-[10px] font-mono text-[var(--status-warning)] mb-2">
        Stale data · last updated {formatAge(now - lastUpdated)}
      </p>
    );
  }
  return null;
}
