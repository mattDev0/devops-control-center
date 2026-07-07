import { useState, useEffect, useCallback } from 'react';

export default function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('workspace-theme') || 'system';
    } catch {
      return 'system';
    }
  });

  const [systemDark, setSystemDark] = useState(() => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return true; // default fallback
    }
  });

  // Listen for OS preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Side effect to update the HTML element data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => {
      let nextTheme;
      if (prevTheme === 'light') {
        nextTheme = 'dark';
      } else if (prevTheme === 'dark') {
        nextTheme = 'system';
      } else {
        nextTheme = 'light';
      }

      try {
        localStorage.setItem('workspace-theme', nextTheme);
      } catch {
        // ignore
      }

      return nextTheme;
    });
  }, []);

  return {
    theme,
    resolvedTheme,
    toggleTheme
  };
}
