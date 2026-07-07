import { useState } from 'react';
import { Menu, LogOut, Lock } from 'lucide-react';
import PrimaryNavigation from './PrimaryNavigation';
import ThemeToggle from '../ui/ThemeToggle';

export default function AppShell({
  role,
  handleLogout,
  activeHash,
  children
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-[var(--bg-canvas)] text-[var(--fg-default)] font-sans">
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden transition-opacity"
        />
      )}

      {/* Persistent Left Sidebar Wrapper for Mobile */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <PrimaryNavigation
          activeHash={activeHash}
          onNavigate={() => setMobileOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Sticky Top Nav Bar */}
        <header
          role="banner"
          className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-default)] px-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-1.5 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] md:hidden transition-colors focus-visible:outline-none"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
              title="Toggle Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <h1 className="text-base font-bold tracking-tight text-[var(--fg-default)] flex items-center gap-2">
              DevOps Control Center
            </h1>

            {role === 'ROLE_GUEST' && (
              <span
                className="text-[10px] font-mono font-medium bg-[var(--bg-elevated)] border border-[var(--border-muted)] text-[var(--fg-muted)] px-2 py-0.5 rounded flex items-center gap-1"
                aria-label="Read-only mode enabled"
              >
                <Lock className="w-3 h-3 text-[var(--fg-subtle)]" /> Guest Mode
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:bg-red-500/10 hover:text-red-400 border border-[var(--border-default)] px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </header>

        {/* Scrollable View Panel Container */}
        <main className="flex-grow p-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
