import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(undefined);
const THEMES = ['light', 'dark', 'system'];

function readStoredTheme() {
  try {
    const stored = localStorage.getItem('theme');
    if (THEMES.includes(stored)) return stored;
  } catch {
    // Storage blocked (private mode, sandboxed frame): fall back to system.
  }
  return 'system';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState(
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      document.documentElement.classList.toggle('dark', isDark);
      setResolvedTheme(isDark ? 'dark' : 'light');
    };

    apply();
    if (theme !== 'system') return undefined;

    mediaQuery.addEventListener('change', apply);
    return () => mediaQuery.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = (next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Preference just won't persist across reloads.
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
