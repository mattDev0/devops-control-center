import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SpotifyDashboard, { SPOTIFY_TIMEOUT_MS } from '../components/spotify/SpotifyDashboard';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: { fetchSpotify: vi.fn() },
}));

const OVERVIEW_DATA = {
  tracked_since: '2026-01-01T00:00:00Z',
  total_plays: 42,
  total_minutes: 120,
  distinct_tracks: 30,
  distinct_artists: 15,
};

const GENRES_DATA = [
  { genre: 'indie', count: 20 },
  { genre: 'rock', count: 10 },
];

const HOURLY_DATA = Array.from({ length: 24 }, (_, i) => ({
  label: `${i}:00`,
  plays: i === 12 ? 10 : 1,
  minutes: 5,
}));

const WEEKDAY_DATA = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
  label: day,
  plays: 5,
  minutes: 15,
}));

const DISCOVERY_DATA = {
  distinct_tracks: 30,
  total_plays: 42,
  repeat_plays: 12,
  discovery_ratio: 0.71,
};

const TRACKS_DATA = [
  { id: '1', name: 'Karma Police', artist: 'Radiohead', popularity: 80 },
];

describe('SpotifyDashboard resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handles partial failure: top/artists and top/tracks reject while other endpoints resolve', async () => {
    api.fetchSpotify.mockImplementation((endpoint) => {
      if (endpoint.startsWith('top/artists')) {
        return Promise.reject(new Error('Spotify API rate limit'));
      }
      if (endpoint.startsWith('top/tracks')) {
        return Promise.reject(new Error('Spotify API rate limit'));
      }
      if (endpoint === 'overview') return Promise.resolve(OVERVIEW_DATA);
      if (endpoint === 'genres') return Promise.resolve(GENRES_DATA);
      if (endpoint === 'history/hourly') return Promise.resolve(HOURLY_DATA);
      if (endpoint === 'history/weekday') return Promise.resolve(WEEKDAY_DATA);
      if (endpoint === 'discovery') return Promise.resolve(DISCOVERY_DATA);
      return Promise.reject(new Error('unknown endpoint'));
    });

    render(<SpotifyDashboard token="test-token" />);

    await act(async () => {});

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('71%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /plays by/i })).toBeInTheDocument();

    expect(screen.getByText('Spotify API rate limit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Genres' }));
    expect(screen.getByText('indie')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('rock')).toBeInTheDocument();
  });

  it('aborts hung top/artists request after SPOTIFY_TIMEOUT_MS, shows friendly timeout message, and recovers on retry', async () => {
    vi.useFakeTimers();
    let failArtists = true;

    api.fetchSpotify.mockImplementation((endpoint, token, signal) => {
      if (endpoint.startsWith('top/artists')) {
        if (failArtists) {
          return new Promise((_, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new DOMException('signal is aborted without reason', 'AbortError'));
              });
            }
          });
        }
        return Promise.resolve([{ id: 'a1', name: 'Radiohead', genres: ['alt rock'], popularity: 85 }]);
      }
      if (endpoint.startsWith('top/tracks')) return Promise.resolve(TRACKS_DATA);
      if (endpoint === 'overview') return Promise.resolve(OVERVIEW_DATA);
      if (endpoint === 'genres') return Promise.resolve(GENRES_DATA);
      if (endpoint === 'history/hourly') return Promise.resolve(HOURLY_DATA);
      if (endpoint === 'history/weekday') return Promise.resolve(WEEKDAY_DATA);
      if (endpoint === 'discovery') return Promise.resolve(DISCOVERY_DATA);
      return Promise.reject(new Error('unknown endpoint'));
    });

    render(<SpotifyDashboard token="test-token" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPOTIFY_TIMEOUT_MS);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Spotify took too long to respond.')).toBeInTheDocument();
    expect(screen.queryByText(/signal is aborted without reason/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AbortError/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tracks' }));
    expect(screen.getByText('Karma Police')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Artists' }));
    failArtists = false;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.queryByText('Spotify took too long to respond.')).not.toBeInTheDocument();
  });

  it('shows friendly timeout message in the full alert card when all requests abort', async () => {
    api.fetchSpotify.mockRejectedValue(
      new DOMException('signal is aborted without reason', 'AbortError'),
    );

    render(<SpotifyDashboard token="test-token" />);

    await act(async () => {});

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Spotify took too long to respond.');
    expect(alert).not.toHaveTextContent(/signal is aborted without reason/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows the full role="alert" card with Retry when all 7 requests reject', async () => {
    api.fetchSpotify.mockRejectedValue(new Error('Network error'));

    render(<SpotifyDashboard token="test-token" />);

    await act(async () => {});

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Network error/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
