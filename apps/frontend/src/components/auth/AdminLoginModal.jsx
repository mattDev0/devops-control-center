import { useState, useEffect } from 'react';
import { User, Lock, Loader2, X, LayoutDashboard as TerminalIcon } from 'lucide-react';
import { api } from '../../services/api';

export default function AdminLoginModal({ onClose, onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const data = await api.login(username, password);
      onLoginSuccess({ token: data.token, role: data.role });
    } catch (error) {
      console.error('Admin login failure', error);
      setAuthError(error.message || 'Connection to authorization service failed');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-auth-title"
    >
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-xl)] p-8 shadow-[var(--shadow-modal)] relative z-10">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--fg-subtle)] hover:text-[var(--fg-default)] hover:bg-[var(--interactive-hover)] transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 bg-[var(--accent-primary-muted)] rounded-[var(--radius-xl)] border border-[var(--accent-primary)]/10 mb-3 text-[var(--accent-primary)]">
            <TerminalIcon className="w-7 h-7" />
          </div>
          <h2 id="admin-auth-title" className="text-lg font-bold text-[var(--fg-default)]">
            Admin Authentication
          </h2>
          <p className="text-[var(--fg-muted)] text-xs mt-1">
            Enter admin credentials to unlock write access
          </p>
        </div>

        {/* Error Message */}
        {authError && (
          <div className="mb-4 p-3 bg-[var(--status-error-muted)] border border-[var(--status-error)]/25 text-[var(--status-error)] rounded-[var(--radius-md)] text-xs text-center font-medium">
            {authError}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[var(--fg-muted)] text-xs font-semibold mb-2" htmlFor="admin-username">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[var(--fg-subtle)]">
                <User className="w-4 h-4" />
              </span>
              <input
                id="admin-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--focus-ring)] text-[var(--fg-default)] rounded-[var(--radius-md)] pl-10 pr-4 py-2.5 outline-none transition-colors font-mono text-xs"
                placeholder="Enter username"
                autoFocus
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[var(--fg-muted)] text-xs font-semibold mb-2" htmlFor="admin-password">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[var(--fg-subtle)]">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--focus-ring)] text-[var(--fg-default)] rounded-[var(--radius-md)] pl-10 pr-4 py-2.5 outline-none transition-colors font-mono text-xs"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)]/80 text-[var(--fg-default)] font-semibold py-2.5 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] hover:border-[var(--border-emphasis)] transition-colors text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={authLoading}
              className="flex-1 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-bold py-2.5 px-4 rounded-[var(--radius-md)] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-xs cursor-pointer"
            >
              {authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
