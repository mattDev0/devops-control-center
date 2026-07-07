import { LayoutDashboard, Layers, GitPullRequest, Activity, ChevronLeft, ChevronRight } from 'lucide-react';

export default function PrimaryNavigation({
  activeHash,
  onNavigate,
  collapsed,
  onToggleCollapse
}) {
  const items = [
    { label: 'Overview', hash: '#overview', icon: LayoutDashboard },
    { label: 'Deployments', hash: '#deployments', icon: Layers },
    { label: 'Pipelines', hash: '#pipelines', icon: GitPullRequest },
    { label: 'Observability', hash: '#observability', icon: Activity }
  ];

  return (
    <aside
      role="complementary"
      aria-label="Sidebar Navigation"
      className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--bg-surface)] border-r border-[var(--border-default)] transition-all duration-200 md:sticky md:block shrink-0 h-screen ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Sidebar Header */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-[var(--border-muted)]">
        {!collapsed ? (
          <span className="font-bold text-sm tracking-wider uppercase text-[var(--accent-primary)] flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5" />
            Control Center
          </span>
        ) : (
          <div className="mx-auto text-[var(--accent-primary)]">
            <LayoutDashboard className="w-5 h-5" />
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex p-1 rounded hover:bg-[var(--interactive-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] transition-colors focus-visible:outline-none"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav role="navigation" aria-label="Main Navigation" className="flex-1 space-y-1 p-2 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeHash === item.hash;

          return (
            <a
              key={item.hash}
              href={item.hash}
              onClick={() => {
                // Let native hash navigation occur, but notify parent
                if (onNavigate) onNavigate();
              }}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all relative focus-visible:outline-none ${
                isActive
                  ? 'bg-[var(--bg-elevated)] text-[var(--fg-default)] border-l-2 border-[var(--accent-primary)]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg-default)] hover:bg-[var(--interactive-hover)] border-l-2 border-transparent'
              }`}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--fg-subtle)]'}`} />
              {!collapsed && <span>{item.label}</span>}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
