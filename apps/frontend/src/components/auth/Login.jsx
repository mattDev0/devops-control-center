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
    <div className="min-h-screen flex items-center justify-center bg-[#090d16] p-4 relative overflow-hidden font-sans">
      {/* Premium Neon Glow Backgrounds */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-800 p-8 shadow-2xl relative z-10 transition-all duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 mb-3 text-emerald-400">
            <TerminalIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">DevOps Control Center</h1>
          <p className="text-slate-400 text-sm mt-1">Authenticate to access infrastructure</p>
        </div>

        {authError && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">
            {authError}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-2" htmlFor="username">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                <User className="w-4 h-4" />
              </span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-100 rounded-lg pl-10 pr-4 py-2.5 outline-none transition-all font-mono text-sm"
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-2" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-100 rounded-lg pl-10 pr-4 py-2.5 outline-none transition-all font-mono text-sm"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={authLoading}
            className="w-full mt-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-950 font-bold py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
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
            <hr className="w-full border-slate-800" />
            <span className="px-3 text-slate-500 text-xs uppercase font-semibold">or</span>
            <hr className="w-full border-slate-800" />
          </div>

          <button
            type="button"
            onClick={handleGuestLogin}
            disabled={authLoading}
            className="w-full bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold py-2.5 px-4 rounded-lg border border-slate-700/60 hover:border-slate-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
          >
            View as Guest (Read-Only)
          </button>
        </form>
      </div>
    </div>
  );
}
