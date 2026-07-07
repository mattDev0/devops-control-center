import useTheme from '../../hooks/useTheme';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  const getNextThemeLabel = () => {
    if (theme === 'light') return 'Switch to dark theme';
    if (theme === 'dark') return 'Switch to system theme';
    return 'Switch to light theme';
  };

  return (
    <button
      onClick={toggleTheme}
      aria-label={getNextThemeLabel()}
      title={getNextThemeLabel()}
      className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] hover:bg-[var(--bg-elevated)] border border-transparent hover:border-[var(--border-default)] transition-colors focus-visible:outline-none cursor-pointer"
    >
      {resolvedTheme === 'dark' ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Sun className="w-4 h-4" />
      )}
    </button>
  );
}
