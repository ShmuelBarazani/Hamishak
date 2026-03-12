import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────
// THEME DEFINITIONS
// ─────────────────────────────────────────────────────
export const THEMES = {
  ocean: {
    id: 'ocean', name: '🌊 אוקיינוס',
    primary: '#06b6d4', dark: '#0891b2', r: 6,   g: 182, b: 212,
    bg1: '#0a0f1e', bg2: '#111827', bg3: '#1e293b',
    sidebar: '#0d1324', scrollbar: '#38bdf8',
    // HSL equivalents for shadcn override
    hBg:     '222 47% 8%',
    hCard:   '217 33% 14%',
    hBorder: '189 100% 42% / 0.18',
    hPrimary:'189 100% 42%',
    hInput:  '222 47% 11%',
    hMuted:  '217 33% 17%',
  },
  emerald: {
    id: 'emerald', name: '💚 אמרלד',
    primary: '#10b981', dark: '#059669', r: 16,  g: 185, b: 129,
    bg1: '#020e08', bg2: '#071a0f', bg3: '#0e2b1a',
    sidebar: '#050f08', scrollbar: '#34d399',
    hBg:     '150 79% 4%',
    hCard:   '150 51% 11%',
    hBorder: '161 94% 37% / 0.20',
    hPrimary:'161 94% 37%',
    hInput:  '150 79% 7%',
    hMuted:  '150 51% 14%',
  },
  gold: {
    id: 'gold', name: '⭐ זהב',
    primary: '#f59e0b', dark: '#d97706', r: 245, g: 158, b: 11,
    bg1: '#0c0800', bg2: '#1a1200', bg3: '#261b00',
    sidebar: '#0a0700', scrollbar: '#fbbf24',
    hBg:     '39 100% 4%',
    hCard:   '39 100% 8%',
    hBorder: '38 100% 50% / 0.22',
    hPrimary:'38 100% 50%',
    hInput:  '39 100% 6%',
    hMuted:  '39 100% 10%',
  },
  violet: {
    id: 'violet', name: '🔮 סגול',
    primary: '#a78bfa', dark: '#7c3aed', r: 167, g: 139, b: 250,
    bg1: '#0d0a1e', bg2: '#130f2e', bg3: '#1e1640',
    sidebar: '#0a0818', scrollbar: '#c4b5fd',
    hBg:     '250 47% 9%',
    hCard:   '250 45% 17%',
    hBorder: '258 94% 76% / 0.20',
    hPrimary:'258 94% 76%',
    hInput:  '250 47% 12%',
    hMuted:  '250 45% 20%',
  },
  rose: {
    id: 'rose', name: '🌸 ורוד',
    primary: '#f472b6', dark: '#db2777', r: 244, g: 114, b: 182,
    bg1: '#1a0812', bg2: '#270e1c', bg3: '#381628',
    sidebar: '#140610', scrollbar: '#f9a8d4',
    hBg:     '323 74% 8%',
    hCard:   '323 55% 15%',
    hBorder: '322 100% 71% / 0.22',
    hPrimary:'322 100% 71%',
    hInput:  '323 74% 11%',
    hMuted:  '323 55% 18%',
  },
};

// ─────────────────────────────────────────────────────
// CSS INJECTION — overrides BOTH our vars AND shadcn's
// ─────────────────────────────────────────────────────
export function injectThemeCSSVars(theme) {
  const { primary, dark, r, g, b, bg1, bg2, bg3, sidebar, scrollbar,
          hBg, hCard, hBorder, hPrimary, hInput, hMuted } = theme;
  const a = (alpha) => `rgba(${r},${g},${b},${alpha})`;
  const hex2rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `${(n>>16)&255}, ${(n>>8)&255}, ${n&255}`;
  };
  const bg1rgb = hex2rgb(bg1), bg2rgb = hex2rgb(bg2), bg3rgb = hex2rgb(bg3);

  const css = `
    /* ── Our theme vars ───────────────────────────────── */
    :root {
      --tp:         ${primary};
      --tp-dark:    ${dark};
      --tp-05:      ${a(0.05)};
      --tp-08:      ${a(0.08)};
      --tp-10:      ${a(0.10)};
      --tp-12:      ${a(0.12)};
      --tp-15:      ${a(0.15)};
      --tp-20:      ${a(0.20)};
      --tp-25:      ${a(0.25)};
      --tp-30:      ${a(0.30)};
      --tp-35:      ${a(0.35)};
      --tp-40:      ${a(0.40)};
      --tp-50:      ${a(0.50)};
      --tp-glow:    0 0 10px ${a(0.45)};
      --tp-glow-sm: 0 2px 10px ${a(0.44)};
      --bg1:        ${bg1};
      --bg2:        ${bg2};
      --bg3:        ${bg3};
      --bg1-rgb:    ${bg1rgb};
      --bg2-rgb:    ${bg2rgb};
      --bg3-rgb:    ${bg3rgb};
      --bg3-70:     rgba(${bg3rgb}, 0.70);
      --sidebar:    ${sidebar};
    }

    /* ── Override shadcn / Tailwind CSS vars ──────────── */
    :root {
      --background:         ${hBg};
      --foreground:         210 40% 95%;
      --card:               ${hCard};
      --card-foreground:    210 40% 95%;
      --popover:            ${hCard};
      --popover-foreground: 210 40% 95%;
      --primary:            ${hPrimary};
      --primary-foreground: 0 0% 5%;
      --secondary:          ${hMuted};
      --secondary-foreground: 210 40% 95%;
      --muted:              ${hMuted};
      --muted-foreground:   215 20% 60%;
      --accent:             ${hMuted};
      --accent-foreground:  210 40% 95%;
      --destructive:        0 84% 60%;
      --destructive-foreground: 0 0% 98%;
      --border:             ${hBorder};
      --input:              ${hInput};
      --ring:               ${hPrimary};
      --radius:             0.5rem;
    }

    /* ── Global backgrounds ───────────────────────────── */
    html, body {
      background: ${bg1} !important;
      color: #f1f5f9;
      transition: background 0.35s ease;
    }
    #root {
      background: ${bg1} !important;
      min-height: 100vh;
      transition: background 0.35s ease;
    }

    /* ── Scrollbar ────────────────────────────────────── */
    ::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, ${scrollbar}, ${primary});
      border-radius: 3px;
    }
    ::-webkit-scrollbar-track { background: ${bg2}; }

    /* ── Tailwind bg-slate / bg-gray overrides ────────── */
    .bg-slate-900, .bg-gray-900  { background-color: ${bg1} !important; }
    .bg-slate-800, .bg-gray-800  { background-color: ${bg2} !important; }
    .bg-slate-700, .bg-gray-700  { background-color: ${bg3} !important; }
    .bg-slate-600                { background-color: rgba(${bg3rgb}, 0.80) !important; }
    .bg-slate-700\\/20           { background-color: rgba(${bg3rgb}, 0.20) !important; }
    .bg-slate-700\\/50           { background-color: rgba(${bg3rgb}, 0.50) !important; }
    .bg-slate-800\\/40           { background-color: rgba(${bg2rgb}, 0.40) !important; }
    .bg-slate-500\\/20           { background-color: rgba(${bg3rgb}, 0.25) !important; }
    .border-slate-600\\/30       { border-color: ${a(0.18)} !important; }
    .border-slate-700            { border-color: ${a(0.22)} !important; }

    /* ── Input / Select ───────────────────────────────── */
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
    select, textarea {
      background: rgba(${bg1rgb}, 0.85) !important;
      border-color: ${a(0.22)} !important;
      color: #f1f5f9 !important;
      transition: background 0.35s, border-color 0.35s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: ${a(0.55)} !important;
      box-shadow: 0 0 0 2px ${a(0.18)} !important;
      outline: none !important;
    }

    /* ── Dropdown / Select content ────────────────────── */
    [role="listbox"], [role="option"],
    [data-radix-select-viewport],
    [data-radix-popper-content-wrapper] > div {
      background: ${bg2} !important;
      border-color: ${a(0.25)} !important;
      color: #f1f5f9 !important;
    }
    [role="option"]:hover, [data-highlighted] {
      background: ${a(0.15)} !important;
      color: #fff !important;
    }

    /* ── Badge ────────────────────────────────────────── */
    .badge-theme {
      border-color: ${a(0.50)};
      color: ${primary};
      background: ${a(0.10)};
    }

    /* ── Hover states ─────────────────────────────────── */
    .hover\\:bg-cyan-900\\/20:hover,
    .hover\\:bg-cyan-500\\/10:hover { background: ${a(0.10)} !important; }
    .hover\\:border-cyan-700\\/50:hover { border-color: ${a(0.50)} !important; }
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
  if (!ctx) return { theme: THEMES.ocean, themeId: 'ocean', setTheme: () => {}, allThemes: THEMES };
  return ctx;
}

// ─────────────────────────────────────────────────────
// SHARED STAGE COLORS  (זהה בכל המסכים)
// ─────────────────────────────────────────────────────
export const STAGE_COLORS = {
  playoff:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.28)', activeBg: '#2563eb', activeShadow: '0 2px 10px rgba(59,130,246,0.44)' },
  league:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.28)', activeBg: '#2563eb', activeShadow: '0 2px 10px rgba(59,130,246,0.44)' },
  groups:     { color: 'var(--tp)', bg: 'var(--tp-10)', border: 'var(--tp-28)', activeBg: 'var(--tp-dark)', activeShadow: 'var(--tp-glow-sm)' },
  rounds:     { color: 'var(--tp)', bg: 'var(--tp-10)', border: 'var(--tp-28)', activeBg: 'var(--tp-dark)', activeShadow: 'var(--tp-glow-sm)' },
  special:    { color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.28)', activeBg: '#7c3aed', activeShadow: '0 2px 10px rgba(139,92,246,0.44)' },
  qualifiers: { color: '#f97316', bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.28)', activeBg: '#ea580c', activeShadow: '0 2px 10px rgba(249,115,22,0.44)' },
  other:      { color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.20)', activeBg: '#475569', activeShadow: '0 2px 8px rgba(100,116,139,0.30)'  },
};

export const STAGE_CARD_COLORS = {
  playoff:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.30)' },
  league:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.30)' },
  groups:     { color: 'var(--tp)', bg: 'var(--tp-12)', border: 'var(--tp-30)' },
  rounds:     { color: 'var(--tp)', bg: 'var(--tp-12)', border: 'var(--tp-30)' },
  special:    { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.30)' },
  qualifiers: { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.30)' },
  other:      { color: '#64748b', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.22)' },
};
