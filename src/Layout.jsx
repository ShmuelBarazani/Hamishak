/**
 * ThemeContext.jsx
 *
 * שינוי מהותי: במקום CSS variables בלבד,
 * מזריק <style> tag ל-<head> עם כל ה-CSS על html, body, *.
 * זה מבטיח שגופנים ורקעים ישתנו בכל המסך, בכל דף.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// ─── Font URLs ───────────────────────────────────────────────────────────────
const FONT_URLS = {
  champions: 'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800;900&family=Heebo:wght@300;400;500;700;900&display=swap',
  inferno:   'https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=Cairo:wght@400;500;600;700&display=swap',
  forest:    'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800;900&display=swap',
  royal:     'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Raleway:wght@300;400;500;600;700&display=swap',
  minimal:   'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@300;400;500&display=swap',
};

// ─── Themes ──────────────────────────────────────────────────────────────────
export const THEMES = {
  champions: {
    id: 'champions', nameHe: 'ליגת האלופות', emoji: '🏆',
    fontFace: "'Rubik', 'Heebo', sans-serif",
    previewColors: ['#06b6d4', '#070d1a', '#0d1929'],
    dark: {
      bg1:'#070d1a', bg2:'#0d1929', bg3:'#0a1422',
      sidebar:'rgba(5,8,16,0.99)', sidebarBdr:'rgba(6,182,212,0.10)',
      tp:'#06b6d4', tpDark:'#0891b2', r:6,g:182,b:212,
      text:'#e2e8f0', textMuted:'#64748b', textSub:'#475569',
      cardBg:'rgba(13,25,41,0.95)', cardBdr:'rgba(6,182,212,0.10)',
      gold:'#f59e0b',
    },
    light: {
      bg1:'#edf7fb', bg2:'#f8fcff', bg3:'#e8f4f9',
      sidebar:'rgba(4,12,28,0.98)', sidebarBdr:'rgba(6,182,212,0.15)',
      tp:'#0891b2', tpDark:'#0e7490', r:8,g:145,b:178,
      text:'#0f172a', textMuted:'#475569', textSub:'#64748b',
      cardBg:'#ffffff', cardBdr:'rgba(8,145,178,0.15)',
      gold:'#d97706',
    },
  },
  inferno: {
    id: 'inferno', nameHe: 'אינפרנו', emoji: '🔥',
    fontFace: "'Oswald', 'Cairo', sans-serif",
    previewColors: ['#f97316', '#0d0500', '#200a00'],
    dark: {
      bg1:'#0d0500', bg2:'#1a0800', bg3:'#120600',
      sidebar:'rgba(8,3,0,0.99)', sidebarBdr:'rgba(249,115,22,0.12)',
      tp:'#f97316', tpDark:'#ea580c', r:249,g:115,b:22,
      text:'#fef3e8', textMuted:'#92400e', textSub:'#78350f',
      cardBg:'rgba(26,8,0,0.95)', cardBdr:'rgba(249,115,22,0.10)',
      gold:'#fbbf24',
    },
    light: {
      bg1:'#fff8f0', bg2:'#fffaf5', bg3:'#fef3e8',
      sidebar:'rgba(20,6,0,0.99)', sidebarBdr:'rgba(249,115,22,0.20)',
      tp:'#ea580c', tpDark:'#c2410c', r:234,g:88,b:12,
      text:'#1c0a00', textMuted:'#78350f', textSub:'#92400e',
      cardBg:'#ffffff', cardBdr:'rgba(234,88,12,0.15)',
      gold:'#d97706',
    },
  },
  forest: {
    id: 'forest', nameHe: 'יַעַר', emoji: '🌿',
    fontFace: "'Nunito', sans-serif",
    previewColors: ['#10b981', '#040f07', '#071510'],
    dark: {
      bg1:'#040f07', bg2:'#071510', bg3:'#060f09',
      sidebar:'rgba(2,8,4,0.99)', sidebarBdr:'rgba(16,185,129,0.10)',
      tp:'#10b981', tpDark:'#059669', r:16,g:185,b:129,
      text:'#d1fae5', textMuted:'#4d7c6f', textSub:'#3d6b5e',
      cardBg:'rgba(7,21,16,0.95)', cardBdr:'rgba(16,185,129,0.10)',
      gold:'#fbbf24',
    },
    light: {
      bg1:'#f0fdf6', bg2:'#f6fef9', bg3:'#ecfdf5',
      sidebar:'rgba(3,34,18,0.98)', sidebarBdr:'rgba(16,185,129,0.20)',
      tp:'#059669', tpDark:'#047857', r:5,g:150,b:105,
      text:'#052e16', textMuted:'#4d7c6f', textSub:'#6b7280',
      cardBg:'#ffffff', cardBdr:'rgba(5,150,105,0.15)',
      gold:'#d97706',
    },
  },
  royal: {
    id: 'royal', nameHe: 'מַלְכוּת', emoji: '👑',
    fontFace: "'Cinzel', 'Raleway', serif",
    previewColors: ['#a855f7', '#080412', '#100820'],
    dark: {
      bg1:'#080412', bg2:'#100820', bg3:'#0c0618',
      sidebar:'rgba(5,2,10,0.99)', sidebarBdr:'rgba(168,85,247,0.10)',
      tp:'#a855f7', tpDark:'#9333ea', r:168,g:85,b:247,
      text:'#ede9fe', textMuted:'#7c3aed', textSub:'#6d28d9',
      cardBg:'rgba(16,8,32,0.95)', cardBdr:'rgba(168,85,247,0.10)',
      gold:'#f59e0b',
    },
    light: {
      bg1:'#faf5ff', bg2:'#fdf8ff', bg3:'#f5f0fe',
      sidebar:'rgba(18,6,36,0.98)', sidebarBdr:'rgba(168,85,247,0.20)',
      tp:'#9333ea', tpDark:'#7e22ce', r:147,g:51,b:234,
      text:'#2e1065', textMuted:'#7c3aed', textSub:'#6d28d9',
      cardBg:'#ffffff', cardBdr:'rgba(147,51,234,0.15)',
      gold:'#d97706',
    },
  },
  minimal: {
    id: 'minimal', nameHe: 'מינימל', emoji: '⚡',
    fontFace: "'DM Sans', sans-serif",
    previewColors: ['#3b82f6', '#000000', '#0a0a0a'],
    dark: {
      bg1:'#000000', bg2:'#0d0d0d', bg3:'#080808',
      sidebar:'rgba(0,0,0,1)', sidebarBdr:'rgba(59,130,246,0.12)',
      tp:'#3b82f6', tpDark:'#2563eb', r:59,g:130,b:246,
      text:'#f8fafc', textMuted:'#64748b', textSub:'#475569',
      cardBg:'#0d0d0d', cardBdr:'rgba(59,130,246,0.10)',
      gold:'#f59e0b',
    },
    light: {
      bg1:'#f8fafc', bg2:'#ffffff', bg3:'#f1f5f9',
      sidebar:'rgba(0,0,0,0.99)', sidebarBdr:'rgba(59,130,246,0.15)',
      tp:'#2563eb', tpDark:'#1d4ed8', r:37,g:99,b:235,
      text:'#0f172a', textMuted:'#475569', textSub:'#64748b',
      cardBg:'#ffffff', cardBdr:'rgba(37,99,235,0.12)',
      gold:'#d97706',
    },
  },
};

// ─── Build full CSS for a given theme+mode ───────────────────────────────────
function buildThemeCSS(themeId, isDark) {
  const theme = THEMES[themeId] || THEMES.champions;
  const p     = isDark ? theme.dark : theme.light;
  const { r, g, b } = p;
  const a = (o) => `rgba(${r},${g},${b},${o})`;
  const font = theme.fontFace;

  return `
    /* ═══ HAMISHAK THEME: ${theme.nameHe} / ${isDark?'dark':'light'} ═══ */

    /* 1. Inject CSS vars on :root AND html */
    :root, html {
      --bg1: ${p.bg1};
      --bg2: ${p.bg2};
      --bg3: ${p.bg3};
      --sidebar: ${p.sidebar};
      --sidebar-bdr: ${p.sidebarBdr};
      --tp: ${p.tp};
      --tp-dark: ${p.tpDark};
      --tp-03: ${a(0.03)}; --tp-04: ${a(0.04)}; --tp-05: ${a(0.05)};
      --tp-08: ${a(0.08)}; --tp-10: ${a(0.10)}; --tp-12: ${a(0.12)};
      --tp-15: ${a(0.15)}; --tp-18: ${a(0.18)}; --tp-20: ${a(0.20)};
      --tp-22: ${a(0.22)}; --tp-25: ${a(0.25)}; --tp-30: ${a(0.30)};
      --tp-40: ${a(0.40)}; --tp-50: ${a(0.50)};
      --tp-glow: 0 0 20px ${a(0.30)};
      --text: ${p.text};
      --text-muted: ${p.textMuted};
      --text-sub: ${p.textSub};
      --card-bg: ${p.cardBg};
      --card-border: ${p.cardBdr};
      --gold: ${p.gold};
      --font-main: ${font};
    }

    /* 2. Force font on EVERYTHING — no exceptions */
    *, *::before, *::after,
    html, body, input, select, textarea, button,
    h1,h2,h3,h4,h5,h6, p, span, div, a, li {
      font-family: ${font} !important;
    }

    /* 3. Full-page background & text color */
    html, body {
      background-color: ${p.bg1} !important;
      color: ${p.text} !important;
    }
    #root {
      background-color: ${p.bg1} !important;
      color: ${p.text} !important;
      min-height: 100vh;
    }

    /* 4. All major surfaces use theme vars */
    .card, [class*="card"],
    [class*="Card"] {
      background-color: ${p.cardBg} !important;
      border-color: ${p.cardBdr} !important;
      color: ${p.text} !important;
    }

    /* 5. All inputs */
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
    select, textarea {
      background-color: ${isDark ? p.bg1 : '#ffffff'} !important;
      border-color: ${a(0.22)} !important;
      color: ${p.text} !important;
    }

    /* 6. Tables */
    table { color: ${p.text} !important; }
    thead tr th, thead tr td {
      background-color: ${p.bg2} !important;
      color: ${p.text} !important;
    }
    tbody tr td { color: ${p.text} !important; }
    tbody tr:hover td { background-color: ${a(0.06)} !important; }

    /* 7. Theme color utility classes (cyan overrides) */
    .text-cyan-400, .text-cyan-300, .text-cyan-200 { color: ${p.tp} !important; }
    .border-cyan-400 { border-color: ${p.tp} !important; }
    .bg-cyan-900\\/20, [class*="cyan"] { --tw-bg-opacity: 1; }

    /* 8. Radix Select dropdowns */
    [data-radix-select-viewport],
    [data-radix-popper-content-wrapper] > div {
      background-color: ${p.bg2} !important;
      border-color: ${a(0.25)} !important;
      color: ${p.text} !important;
    }
    [role="option"]:hover, [data-highlighted] {
      background-color: ${a(0.15)} !important;
      color: ${p.text} !important;
    }

    /* 9. Badges from shadcn / Tailwind */
    .badge, [class*="badge"] { color: ${p.text}; }

    /* 10. Light mode: white content area */
    ${!isDark ? `
      .lm-page, .lm-main { background-color: ${p.bg1} !important; }
      .card, [class*="card"], [class*="Card"] {
        box-shadow: 0 2px 12px rgba(0,0,0,0.07) !important;
      }
      input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
      select, textarea {
        background-color: #ffffff !important;
      }
    ` : ''}
  `;
}

// ─── Load Google Font link ────────────────────────────────────────────────────
const loadedFonts = new Set();
function loadFont(themeId) {
  if (loadedFonts.has(themeId)) return;
  loadedFonts.add(themeId);
  const url = FONT_URLS[themeId];
  if (!url || document.querySelector(`link[data-hm-font="${themeId}"]`)) return;
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = url;
  link.setAttribute('data-hm-font', themeId);
  document.head.appendChild(link);
}

// ─── Inject/update <style> in <head> ─────────────────────────────────────────
const STYLE_ID = 'hamishak-theme-vars';

function applyTheme(themeId, isDark) {
  loadFont(themeId);

  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildThemeCSS(themeId, isDark);

  // Also set data attributes on html for easy targeting in other CSS
  document.documentElement.setAttribute('data-theme', themeId);
  document.documentElement.setAttribute('data-mode', isDark ? 'dark' : 'light');
  document.documentElement.classList.toggle('hm-dark',  isDark);
  document.documentElement.classList.toggle('hm-light', !isDark);
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ThemeCtx = createContext({
  themeId:  'champions',
  setTheme: () => {},
  allThemes: THEMES,
  isDark:   true,
  setIsDark: () => {},
  currentPalette: THEMES.champions.dark,
});

export function useTheme() { return useContext(ThemeCtx); }

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    try { return localStorage.getItem('hm-theme') || 'champions'; }
    catch { return 'champions'; }
  });

  const [isDark, setIsDarkState] = useState(() => {
    try { return localStorage.getItem('hm-dark') !== 'false'; }
    catch { return true; }
  });

  // Apply immediately on first render (sync, before paint)
  useEffect(() => {
    applyTheme(themeId, isDark);
  }, []);

  useEffect(() => {
    applyTheme(themeId, isDark);
    try {
      localStorage.setItem('hm-theme', themeId);
      localStorage.setItem('hm-dark',  String(isDark));
    } catch {}
  }, [themeId, isDark]);

  const setTheme = useCallback((id) => {
    if (THEMES[id]) setThemeId(id);
  }, []);

  const setIsDark = useCallback((val) => {
    setIsDarkState(val);
  }, []);

  const value = {
    themeId,
    setTheme,
    allThemes: THEMES,
    isDark,
    setIsDark,
    currentPalette: isDark ? (THEMES[themeId]?.dark) : (THEMES[themeId]?.light),
  };

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

// Legacy exports
export const injectThemeCSSVars = applyTheme;
