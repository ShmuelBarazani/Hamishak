/**
 * ThemeContext.jsx — מערכת ערכות נושא מלאה
 *
 * 5 ערכות נושא עם גופן ייחודי + dark/light לכל ערכה.
 * מחליף את ה-ThemeContext הקיים — שמור על אותו API:
 *   useTheme() → { themeId, setTheme, allThemes, isDark, setIsDark }
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─── Font URLs ───────────────────────────────────────────────────────────────
const FONT_URLS = {
  champions: 'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800;900&family=Heebo:wght@300;400;500;700;900&display=swap',
  inferno:   'https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=Cairo:wght@400;500;600;700&display=swap',
  forest:    'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800;900&display=swap',
  royal:     'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Raleway:wght@300;400;500;600;700&display=swap',
  minimal:   'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Mono:wght@300;400;500&display=swap',
};

// ─── Theme Definitions ────────────────────────────────────────────────────────
export const THEMES = {

  // ── 1. Champions (default) ─────────────────────────────────────────────────
  champions: {
    id:     'champions',
    nameHe: 'ליגת האלופות',
    emoji:  '🏆',
    font:   "'Rubik', 'Heebo', sans-serif",
    previewColors: ['#06b6d4', '#070d1a', '#0d1929'],
    dark: {
      bg1:         '#070d1a',
      bg2:         '#0d1929',
      bg3:         '#0a1422',
      sidebar:     'rgba(5,8,16,0.99)',
      sidebarBdr:  'rgba(6,182,212,0.10)',
      tp:          '#06b6d4',
      tpDark:      '#0891b2',
      r: 6, g: 182, b: 212,
      text:        '#e2e8f0',
      textMuted:   '#64748b',
      textSub:     '#475569',
      cardBg:      'rgba(13,25,41,0.95)',
      cardBorder:  'rgba(6,182,212,0.10)',
      gold:        '#f59e0b',
    },
    light: {
      bg1:         '#edf7fb',
      bg2:         '#ffffff',
      bg3:         '#f0f9fc',
      sidebar:     'rgba(4,12,28,0.98)',
      sidebarBdr:  'rgba(6,182,212,0.15)',
      tp:          '#0891b2',
      tpDark:      '#0e7490',
      r: 8, g: 145, b: 178,
      text:        '#0f172a',
      textMuted:   '#475569',
      textSub:     '#64748b',
      cardBg:      '#ffffff',
      cardBorder:  'rgba(8,145,178,0.15)',
      gold:        '#d97706',
    },
  },

  // ── 2. Inferno ──────────────────────────────────────────────────────────────
  inferno: {
    id:     'inferno',
    nameHe: 'אינפרנו',
    emoji:  '🔥',
    font:   "'Oswald', 'Cairo', sans-serif",
    previewColors: ['#f97316', '#0d0500', '#200a00'],
    dark: {
      bg1:         '#0d0500',
      bg2:         '#1a0800',
      bg3:         '#120600',
      sidebar:     'rgba(8,3,0,0.99)',
      sidebarBdr:  'rgba(249,115,22,0.12)',
      tp:          '#f97316',
      tpDark:      '#ea580c',
      r: 249, g: 115, b: 22,
      text:        '#fef3e8',
      textMuted:   '#92400e',
      textSub:     '#78350f',
      cardBg:      'rgba(26,8,0,0.95)',
      cardBorder:  'rgba(249,115,22,0.10)',
      gold:        '#fbbf24',
    },
    light: {
      bg1:         '#fff8f0',
      bg2:         '#ffffff',
      bg3:         '#fef3e8',
      sidebar:     'rgba(20,6,0,0.99)',
      sidebarBdr:  'rgba(249,115,22,0.20)',
      tp:          '#ea580c',
      tpDark:      '#c2410c',
      r: 234, g: 88, b: 12,
      text:        '#1c0a00',
      textMuted:   '#78350f',
      textSub:     '#92400e',
      cardBg:      '#ffffff',
      cardBorder:  'rgba(234,88,12,0.15)',
      gold:        '#d97706',
    },
  },

  // ── 3. Forest ───────────────────────────────────────────────────────────────
  forest: {
    id:     'forest',
    nameHe: 'יַעַר',
    emoji:  '🌿',
    font:   "'Nunito', sans-serif",
    previewColors: ['#10b981', '#040f07', '#071510'],
    dark: {
      bg1:         '#040f07',
      bg2:         '#071510',
      bg3:         '#060f09',
      sidebar:     'rgba(2,8,4,0.99)',
      sidebarBdr:  'rgba(16,185,129,0.10)',
      tp:          '#10b981',
      tpDark:      '#059669',
      r: 16, g: 185, b: 129,
      text:        '#d1fae5',
      textMuted:   '#4d7c6f',
      textSub:     '#3d6b5e',
      cardBg:      'rgba(7,21,16,0.95)',
      cardBorder:  'rgba(16,185,129,0.10)',
      gold:        '#fbbf24',
    },
    light: {
      bg1:         '#f0fdf6',
      bg2:         '#ffffff',
      bg3:         '#ecfdf5',
      sidebar:     'rgba(3,34,18,0.98)',
      sidebarBdr:  'rgba(16,185,129,0.20)',
      tp:          '#059669',
      tpDark:      '#047857',
      r: 5, g: 150, b: 105,
      text:        '#052e16',
      textMuted:   '#4d7c6f',
      textSub:     '#6b7280',
      cardBg:      '#ffffff',
      cardBorder:  'rgba(5,150,105,0.15)',
      gold:        '#d97706',
    },
  },

  // ── 4. Royal ────────────────────────────────────────────────────────────────
  royal: {
    id:     'royal',
    nameHe: 'מַלְכוּת',
    emoji:  '👑',
    font:   "'Cinzel', 'Raleway', serif",
    previewColors: ['#a855f7', '#080412', '#100820'],
    dark: {
      bg1:         '#080412',
      bg2:         '#100820',
      bg3:         '#0c0618',
      sidebar:     'rgba(5,2,10,0.99)',
      sidebarBdr:  'rgba(168,85,247,0.10)',
      tp:          '#a855f7',
      tpDark:      '#9333ea',
      r: 168, g: 85, b: 247,
      text:        '#ede9fe',
      textMuted:   '#6d28d9',
      textSub:     '#5b21b6',
      cardBg:      'rgba(16,8,32,0.95)',
      cardBorder:  'rgba(168,85,247,0.10)',
      gold:        '#f59e0b',
    },
    light: {
      bg1:         '#faf5ff',
      bg2:         '#ffffff',
      bg3:         '#f5f0fe',
      sidebar:     'rgba(18,6,36,0.98)',
      sidebarBdr:  'rgba(168,85,247,0.20)',
      tp:          '#9333ea',
      tpDark:      '#7e22ce',
      r: 147, g: 51, b: 234,
      text:        '#2e1065',
      textMuted:   '#6d28d9',
      textSub:     '#7c3aed',
      cardBg:      '#ffffff',
      cardBorder:  'rgba(147,51,234,0.15)',
      gold:        '#d97706',
    },
  },

  // ── 5. Minimal ──────────────────────────────────────────────────────────────
  minimal: {
    id:     'minimal',
    nameHe: 'מינימל',
    emoji:  '⚡',
    font:   "'DM Sans', sans-serif",
    previewColors: ['#3b82f6', '#000000', '#0a0a0a'],
    dark: {
      bg1:         '#000000',
      bg2:         '#0d0d0d',
      bg3:         '#080808',
      sidebar:     'rgba(0,0,0,1)',
      sidebarBdr:  'rgba(59,130,246,0.12)',
      tp:          '#3b82f6',
      tpDark:      '#2563eb',
      r: 59, g: 130, b: 246,
      text:        '#f8fafc',
      textMuted:   '#475569',
      textSub:     '#334155',
      cardBg:      '#0d0d0d',
      cardBorder:  'rgba(59,130,246,0.10)',
      gold:        '#f59e0b',
    },
    light: {
      bg1:         '#f8fafc',
      bg2:         '#ffffff',
      bg3:         '#f1f5f9',
      sidebar:     'rgba(0,0,0,0.99)',
      sidebarBdr:  'rgba(59,130,246,0.15)',
      tp:          '#2563eb',
      tpDark:      '#1d4ed8',
      r: 37, g: 99, b: 235,
      text:        '#0f172a',
      textMuted:   '#475569',
      textSub:     '#64748b',
      cardBg:      '#ffffff',
      cardBorder:  'rgba(37,99,235,0.12)',
      gold:        '#d97706',
    },
  },
};

// ─── CSS Variable Injection ───────────────────────────────────────────────────
function injectTheme(themeId, isDark) {
  const theme = THEMES[themeId] || THEMES.champions;
  const p     = isDark ? theme.dark : theme.light;
  const { r, g, b } = p;
  const root  = document.documentElement;

  const set = (k, v) => root.style.setProperty(k, v);

  // Backgrounds
  set('--bg1',    p.bg1);
  set('--bg2',    p.bg2);
  set('--bg3',    p.bg3);
  set('--sidebar', p.sidebar);

  // Primary
  set('--tp',      p.tp);
  set('--tp-dark', p.tpDark || p.tp);

  // Primary with opacity (used everywhere)
  const a = (o) => `rgba(${r},${g},${b},${o})`;
  set('--tp-03', a(0.03));
  set('--tp-04', a(0.04));
  set('--tp-05', a(0.05));
  set('--tp-08', a(0.08));
  set('--tp-10', a(0.10));
  set('--tp-12', a(0.12));
  set('--tp-15', a(0.15));
  set('--tp-18', a(0.18));
  set('--tp-20', a(0.20));
  set('--tp-22', a(0.22));
  set('--tp-25', a(0.25));
  set('--tp-30', a(0.30));
  set('--tp-40', a(0.40));
  set('--tp-50', a(0.50));
  set('--tp-glow', `0 0 20px ${a(0.30)}`);

  // Sidebar border
  set('--sidebar-bdr', p.sidebarBdr);

  // Text
  set('--text',      p.text);
  set('--text-muted', p.textMuted);
  set('--text-sub',   p.textSub);

  // Cards
  set('--card-bg',     p.cardBg);
  set('--card-border', p.cardBorder);

  // Gold
  set('--gold', p.gold);

  // Font — applies to everything via * selector in Layout
  set('--font-main', theme.font);

  // Dark/light classes on <html>
  root.classList.toggle('hm-dark',  isDark);
  root.classList.toggle('hm-light', !isDark);
}

// ─── Font loader ──────────────────────────────────────────────────────────────
const loadedFonts = new Set();
function loadFont(themeId) {
  if (loadedFonts.has(themeId)) return;
  loadedFonts.add(themeId);
  const url = FONT_URLS[themeId];
  if (!url) return;
  if (document.querySelector(`link[data-hm-font="${themeId}"]`)) return;
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = url;
  link.setAttribute('data-hm-font', themeId);
  document.head.appendChild(link);
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ThemeCtx = createContext({
  themeId:   'champions',
  setTheme:  () => {},
  allThemes: THEMES,
  isDark:    true,
  setIsDark: () => {},
});

export function useTheme() { return useContext(ThemeCtx); }

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    try { return localStorage.getItem('hm-theme') || 'champions'; }
    catch { return 'champions'; }
  });

  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('hm-dark') !== 'false'; }
    catch { return true; }
  });

  // Load initial font before first paint
  useEffect(() => { loadFont(themeId); }, []);

  // Apply theme on any change
  useEffect(() => {
    loadFont(themeId);
    injectTheme(themeId, isDark);
    try {
      localStorage.setItem('hm-theme', themeId);
      localStorage.setItem('hm-dark',  String(isDark));
    } catch {}
  }, [themeId, isDark]);

  const setTheme = useCallback((id) => {
    if (THEMES[id]) setThemeId(id);
  }, []);

  // Legacy compat: allThemes maps to THEMES for ThemePicker
  const value = {
    themeId,
    setTheme,
    allThemes: THEMES,
    isDark,
    setIsDark,
    // Legacy: some pages reference themeId as 'primary' color via r/g/b
    currentPalette: isDark ? THEMES[themeId]?.dark : THEMES[themeId]?.light,
  };

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

// Legacy export that older pages might import
export const injectThemeCSSVars = injectTheme;
