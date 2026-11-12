import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import BarChart from './BarChart';
import TopList from './TopList';

// Spotify's shortest window, roughly the last four weeks. The six-month and
// all-time rankings barely moved week to week, so they earned no space here.
const RANGE = 'short_term';
export const SPOTIFY_TIMEOUT_MS = 10000;

const KEYS = [
  { key: 'overview', endpoint: 'overview' },
  { key: 'artists', endpoint: `top/artists?range=${RANGE}&limit=5` },
  { key: 'tracks', endpoint: `top/tracks?range=${RANGE}&limit=5` },
  { key: 'genres', endpoint: 'genres' },
  { key: 'hourly', endpoint: 'history/hourly' },
  { key: 'weekday', endpoint: 'history/weekday' },
  { key: 'discovery', endpoint: 'discovery' },
];

function Tabs({ options, value, onChange, ariaLabel }) {
  return (
    <div className="flex gap-1" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
            value === o.id
              ? 'bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
              : 'text-[var(--fg-muted)] hover:bg-[var(--interactive-hover)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, actions, children }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col h-full">
      <div className="flex items-start justify-between pb-3 border-b border-[var(--border-muted)] mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--fg-default)]">{title}</h3>
          {subtitle && <p className="text-[10px] text-[var(--fg-muted)] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function InlineError({ onRetry, message }) {
  return (
    <div className="py-6 text-center">
      <AlertTriangle className="w-4 h-4 text-[var(--status-error)] mx-auto mb-2" aria-hidden="true" />
      <p className="text-xs text-[var(--fg-muted)] mb-3">{message || 'Failed to load'}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent-primary-hover)] hover:underline cursor-pointer"
      >
        <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
      </button>
    </div>
  );
}

export default function SpotifyDashboard({ token }) {
  const [tab, setTab] = useState('artists');
  const [period, setPeriod] = useState('hourly');
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const abortControllerRef = useRef(null);

  const load = useCallback(async () => {
    if (!token) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);

    const promises = KEYS.map(async (item) => {
      const request = new AbortController();
      const deadline = setTimeout(() => request.abort(), SPOTIFY_TIMEOUT_MS);
      const abortRequest = () => request.abort();
      controller.signal.addEventListener('abort', abortRequest, { once: true });
      try {
        const res = await api.fetchSpotify(item.endpoint, token, request.signal);
        return { key: item.key, data: res };
      } finally {
        clearTimeout(deadline);
        controller.signal.removeEventListener('abort', abortRequest);
      }
    });

    const results = await Promise.allSettled(promises);
    if (controller.signal.aborted) return;

    const nextData = {};
    const nextErrors = {};
    let unauthorized = false;

    results.forEach((res, i) => {
      const key = KEYS[i].key;
      if (res.status === 'fulfilled') {
        nextData[key] = res.value.data;
      } else {
        nextErrors[key] = res.reason;
        if (res.reason?.message === 'UNAUTHORIZED') {
          unauthorized = true;
        }
      }
    });

    const allFailed = results.length > 0 && results.every((r) => r.status === 'rejected');
    if (unauthorized) {
      setError('Not authorized to read listening data.');
    } else if (allFailed) {
      const msg = results.find((r) => r.reason?.message)?.reason?.message;
      setError(msg || 'Failed to load listening data.');
    } else {
      setError('');
    }

    setData(nextData);
    setErrors(nextErrors);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [load]);

  const allFailed = Object.keys(errors).length === 7 && Object.keys(data).length === 0;

  if (error || allFailed) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-6 text-center" role="alert">
        <AlertTriangle className="w-4 h-4 text-[var(--status-error)] mx-auto mb-2" aria-hidden="true" />
        <p className="text-xs text-[var(--fg-muted)] mb-3">{error || 'Failed to load listening data.'}</p>
        <button onClick={load}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent-primary-hover)] hover:underline cursor-pointer">
          <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  const o = data.overview || {};
  const d = data.discovery || {};
  const hours = o.total_minutes ? Math.round(o.total_minutes / 60) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Panel
        title="Top listening"
        subtitle="Last 4 weeks"
        actions={
          <Tabs ariaLabel="Category" value={tab} onChange={setTab}
                options={[{ id: 'artists', label: 'Artists' }, { id: 'tracks', label: 'Tracks' }, { id: 'genres', label: 'Genres' }]} />
        }
      >
        {tab === 'artists' && (
          errors.artists && !data.artists ? (
            <InlineError onRetry={load} message={errors.artists.message || 'Failed to load artists'} />
          ) : (
            <TopList items={data.artists} loading={loading} emptyMessage="No ranking yet"
                     renderMeta={(a) => a.genres?.slice(0, 2).join(' · ')} />
          )
        )}
        {tab === 'tracks' && (
          errors.tracks && !data.tracks ? (
            <InlineError onRetry={load} message={errors.tracks.message || 'Failed to load tracks'} />
          ) : (
            <TopList items={data.tracks} loading={loading} emptyMessage="No ranking yet"
                     renderMeta={(t) => t.artist} />
          )
        )}
        {tab === 'genres' && (
          errors.genres && !data.genres ? (
            <InlineError onRetry={load} message={errors.genres.message || 'Failed to load genres'} />
          ) : data.genres?.length ? (
            <ul className="space-y-2.5 pt-1">
              {data.genres.slice(0, 5).map((g) => (
                <li key={g.genre}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-[var(--fg-default)] truncate pr-2">{g.genre}</span>
                    <span className="text-[var(--fg-muted)] tabular-nums shrink-0">{g.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--bg-inset)] overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${(g.count / (data.genres[0].count || 1)) * 100}%`,
                                  background: 'var(--accent-primary)' }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-[var(--fg-muted)] py-6 text-center">Genres appear as plays are recorded</div>
          )
        )}
      </Panel>

      <Panel
        title="Listening patterns"
        actions={
          <Tabs ariaLabel="Grouping" value={period} onChange={setPeriod}
                options={[{ id: 'hourly', label: 'Hour' }, { id: 'weekday', label: 'Day' }]} />
        }
      >
        <div className="flex items-baseline gap-4 mb-4 text-[11px] text-[var(--fg-muted)]">
          <span><span className="text-[var(--fg-default)] font-semibold tabular-nums text-sm">{o.total_plays ?? '—'}</span> plays</span>
          <span><span className="text-[var(--fg-default)] font-semibold tabular-nums text-sm">{hours || '—'}</span>h listened</span>
          <span><span className="text-[var(--fg-default)] font-semibold tabular-nums text-sm">{d.total_plays ? `${Math.round(d.discovery_ratio * 100)}%` : '—'}</span> new</span>
        </div>
        {errors[period] && !data[period] ? (
          <InlineError onRetry={load} message={errors[period].message || `Failed to load ${period} patterns`} />
        ) : (
          <BarChart data={period === 'hourly' ? data.hourly : data.weekday} unit="plays" height={110} />
        )}
        <p className="text-[10px] text-[var(--fg-subtle)] mt-3 leading-relaxed">
          Spotify exposes only the last 50 plays, so this history accumulates from when tracking started.
        </p>
      </Panel>
    </div>
  );
}
