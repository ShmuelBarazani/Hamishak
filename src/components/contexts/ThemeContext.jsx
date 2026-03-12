import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────
// THEME DEFINITIONS
// ─────────────────────────────────────────────────────
export const THEMES = {
  ocean: {
    id: 'ocean',
    name: '🌊 אוקיינוס',
    primary:   '#06b6d4',
    dark:      '#0891b2',
    r: 6, g: 182, b: 212,
    bg1: '#0a0f1e',
    bg2: '#111827',
    bg3: '#1e293b',
    sidebar: '#0d1324',
    scrollbar: '#38bdf8',
  },
  emerald: {
    id: 'emerald',
    name: '💚 אמרלד',
    primary:   '#10b981',
    dark:      '#059669',
    r: 16, g: 185, b: 129,
    bg1: '#020e08',
    bg2: '#071a0f',
    bg3: '#0e2b1a',
    sidebar: '#050f08',
    scrollbar: '#34d399',
  },
  gold: {
    id: 'gold',
    name: '⭐ זהב',
    primary:   '#f59e0b',
    dark:      '#d97706',
    r: 245, g: 158, b: 11,
    bg1: '#0c0800',
    bg2: '#1a1200',
    bg3: '#261b00',
    sidebar: '#0a0700',
    scrollbar: '#fbbf24',
  },
  violet: {
    id: 'violet',
    name: '🔮 סגול',
    primary:   '#a78bfa',
    dark:      '#7c3aed',
    r: 167, g: 139, b: 250,
    bg1: '#0d0a1e',
    bg2: '#130f2e',
    bg3: '#1e1640',
    sidebar: '#0a0818',
    scrollbar: '#c4b5fd',
  },
  rose: {
    id: 'rose',
    name: '🌸 ורוד',
    primary:   '#f472b6',
    dark:      '#db2777',
    r: 244, g: 114, b: 182,
    bg1: '#1a0812',
    bg2: '#270e1c',
    bg3: '#381628',
    sidebar: '#140610',
    scrollbar: '#f9a8d4',
  },
};

// ─────────────────────────────────────────────────────
// CSS VARIABLES INJECTION
// ─────────────────────────────────────────────────────
export function injectThemeCSSVars(theme) {
  const { primary, dark, r, g, b, bg1, bg2, bg3, sidebar, scrollbar } = theme;
  const a = (alpha) => `rgba(${r},${g},${b},${alpha})`;

  const css = `
    :root {
      --tp:      ${primary};
      --tp-dark: ${dark};
      --tp-05:   ${a(0.05)};
      --tp-08:   ${a(0.08)};
      --tp-10:   ${a(0.10)};
      --tp-12:   ${a(0.12)};
      --tp-15:   ${a(0.15)};
      --tp-20:   ${a(0.20)};
      --tp-25:   ${a(0.25)};
      --tp-30:   ${a(0.30)};
      --tp-35:   ${a(0.35)};
      --tp-40:   ${a(0.40)};
      --tp-50:   ${a(0.50)};
      --tp-glow: 0 0 10px ${a(0.45)};
      --tp-glow-sm: 0 2px 10px ${a(0.44)};
      --bg1:     ${bg1};
      --bg2:     ${bg2};
      --bg3:     ${bg3};
      --bg3-60:  ${bg3}99;
      --sidebar: ${sidebar};
    }
    ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, ${scrollbar}, ${primary}); border-radius: 3px; }
    ::-webkit-scrollbar-track { background: ${bg2}; }
    html, body { background: ${bg1}; }
  `;

  let el = document.getElementById('hamishak-theme-vars');
  if (!el) {
    el = document.createElement('style');
    el.id = 'hamishak-theme-vars';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

// ─────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    try { return localStorage.getItem('hamishak-theme') || 'ocean'; } catch { return 'ocean'; }
  });

  const theme = THEMES[themeId] || THEMES.ocean;

  useEffect(() => {
    injectThemeCSSVars(theme);
    try { localStorage.setItem('hamishak-theme', themeId); } catch {}
  }, [themeId, theme]);

  const setTheme = useCallback((id) => {
    if (THEMES[id]) setThemeId(id);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themeId, setTheme, allThemes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // fallback אם ThemeProvider לא קיים עדיין
    return { theme: THEMES.ocean, themeId: 'ocean', setTheme: () => {}, allThemes: THEMES };
  }
  return ctx;
}

// ─────────────────────────────────────────────────────
// SHARED STAGE COLOR MAP  (זהה בכל המסכים)
// ─────────────────────────────────────────────────────
export const STAGE_COLORS = {
  playoff:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',   border: 'rgba(59,130,246,0.30)',   activeBg: '#2563eb',       activeShadow: '0 2px 10px rgba(59,130,246,0.44)'    },
  league:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',   border: 'rgba(59,130,246,0.30)',   activeBg: '#2563eb',       activeShadow: '0 2px 10px rgba(59,130,246,0.44)'    },
  groups:     { color: 'var(--tp)', bg: 'var(--tp-10)', border: 'var(--tp-30)', activeBg: 'var(--tp-dark)', activeShadow: 'var(--tp-glow-sm)' },
  rounds:     { color: 'var(--tp)', bg: 'var(--tp-10)', border: 'var(--tp-30)', activeBg: 'var(--tp-dark)', activeShadow: 'var(--tp-glow-sm)' },
  special:    { color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',  border: 'rgba(139,92,246,0.30)',  activeBg: '#7c3aed',       activeShadow: '0 2px 10px rgba(139,92,246,0.44)'    },
  qualifiers: { color: '#f97316', bg: 'rgba(249,115,22,0.10)',   border: 'rgba(249,115,22,0.30)',   activeBg: '#ea580c',       activeShadow: '0 2px 10px rgba(249,115,22,0.44)'    },
  other:      { color: '#64748b', bg: 'rgba(100,116,139,0.08)',  border: 'rgba(100,116,139,0.20)',  activeBg: '#475569',       activeShadow: '0 2px 8px rgba(100,116,139,0.30)'    },
};

// HEADER CARD COLORS (for section headers in content area — same across screens)
export const STAGE_CARD_COLORS = {
  playoff:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)'  },
  league:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)'  },
  groups:     { color: 'var(--tp)', bg: 'var(--tp-12)',  border: 'var(--tp-35)'  },
  rounds:     { color: 'var(--tp)', bg: 'var(--tp-12)',  border: 'var(--tp-35)'  },
  special:    { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)' },
  qualifiers: { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.35)'  },
  other:      { color: '#64748b', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)' },
};
