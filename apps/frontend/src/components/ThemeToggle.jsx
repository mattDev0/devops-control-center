import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const NEXT = { system: 'light', light: 'dark', dark: 'system' };
const ICONS = { light: Sun, dark: Moon, system: Monitor };

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = ICONS[theme];

  return (
    <button
      onClick={() => setTheme(NEXT[theme])}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--fg-muted)] hover:text-[var(--fg-default)] hover:border-[var(--border-emphasis)] transition-colors cursor-pointer"
      aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}.`}
      title={theme === 'system' ? `Theme: system (${resolvedTheme})` : `Theme: ${theme}`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}
