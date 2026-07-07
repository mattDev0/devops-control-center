import { User, Lock, Loader2, LayoutDashboard as TerminalIcon } from 'lucide-react';

export default function Login({
  username,
  setUsername,
  password,
  setPassword,
  authError,
  authLoading,
  handleLogin,
  handleGuestLogin
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4 relative overflow-hidden font-sans">
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-xl)] p-8 shadow-[var(--shadow-modal)] relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="p-4 bg-[var(--accent-primary-muted)] rounded-[var(--radius-xl)] border border-[var(--accent-primary)]/10 mb-3 text-[var(--accent-primary)]">
            <TerminalIcon className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-[var(--fg-default)]">DevOps Control Center</h1>
          <p className="text-[var(--fg-muted)] text-xs mt-1">Authenticate to access infrastructure</p>
        </div>

        {authError && (
          <div className="mb-6 p-3 bg-[var(--status-error-muted)] border border-[var(--status-error)]/25 text-[var(--status-error)] rounded-[var(--radius-md)] text-xs text-center font-medium">
            {authError}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[var(--fg-muted)] text-xs font-semibold mb-2" htmlFor="username">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[var(--fg-subtle)]">
                <User className="w-4 h-4" />
              </span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--focus-ring)] text-[var(--fg-default)] rounded-[var(--radius-md)] pl-10 pr-4 py-2.5 outline-none transition-colors font-mono text-xs"
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[var(--fg-muted)] text-xs font-semibold mb-2" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[var(--fg-subtle)]">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--focus-ring)] text-[var(--fg-default)] rounded-[var(--radius-md)] pl-10 pr-4 py-2.5 outline-none transition-colors font-mono text-xs"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={authLoading}
            className="w-full mt-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-bold py-2.5 px-4 rounded-[var(--radius-md)] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {authLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
              </>
            ) : (
              'Sign In'
            )}
          </button>

          <div className="flex items-center my-4">
            <hr className="w-full border-[var(--border-default)]" />
            <span className="px-3 text-[var(--fg-subtle)] text-[10px] uppercase font-semibold">or</span>
            <hr className="w-full border-[var(--border-default)]" />
          </div>

          <button
            type="button"
            onClick={handleGuestLogin}
            disabled={authLoading}
            className="w-full bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)]/80 text-[var(--fg-default)] font-semibold py-2.5 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] hover:border-[var(--border-emphasis)] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            View as Guest (Read-Only)
          </button>
        </form>
      </div>
    </div>
  );
}
