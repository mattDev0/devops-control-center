import { useState } from 'react';

/**
 * Single-series bar chart. One hue throughout: the bars encode magnitude, not
 * identity, so there is nothing for a second colour to mean and no legend to
 * draw. The tallest bar is the only one directly labelled.
 */
export default function BarChart({ data, valueKey = 'plays', unit = 'plays', height = 140 }) {
  const [hover, setHover] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-[var(--fg-muted)]" style={{ height }}>
        No plays recorded yet
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const peakIndex = data.reduce((best, d, i) => (d[valueKey] > data[best][valueKey] ? i : best), 0);
  const allZero = data.every((d) => d[valueKey] === 0);

  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height }} role="img"
           aria-label={`${unit} by ${data.length === 24 ? 'hour' : 'period'}`}>
        {data.map((d, i) => {
          const ratio = d[valueKey] / max;
          const isPeak = i === peakIndex && !allZero;
          return (
            <div
              key={d.label}
              className="flex-1 flex flex-col justify-end h-full cursor-default"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                style={{
                  height: `${Math.max(ratio * 100, d[valueKey] > 0 ? 3 : 0)}%`,
                  background: isPeak ? 'var(--accent-primary-hover)' : 'var(--accent-primary)',
                  opacity: hover === null || hover === i ? 1 : 0.45,
                  borderRadius: '4px 4px 0 0',
                  transition: 'opacity 120ms ease',
                  minHeight: d[valueKey] > 0 ? 3 : 0,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-[2px] mt-1.5">
        {data.map((d, i) => (
          <div key={d.label}
               className="flex-1 text-center text-[9px] tabular-nums text-[var(--fg-subtle)] truncate">
            {data.length > 12 ? (i % 3 === 0 ? d.label : '') : d.label}
          </div>
        ))}
      </div>

      {hover !== null && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-10
                        bg-[var(--bg-elevated)] border border-[var(--border-emphasis)] rounded-[var(--radius-md)]
                        px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg">
          <span className="text-[var(--fg-default)] font-semibold">{data[hover].label}</span>
          <span className="text-[var(--fg-muted)]"> · {data[hover][valueKey]} {unit}</span>
          {data[hover].minutes > 0 && (
            <span className="text-[var(--fg-subtle)]"> · {Math.round(data[hover].minutes)} min</span>
          )}
        </div>
      )}
    </div>
  );
}
