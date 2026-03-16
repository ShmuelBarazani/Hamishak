import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Users, FileText, BarChart3, Database, Award, PieChart,
  LogOut, Shield, Edit, Upload, Lock, X
} from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { UploadStatusProvider } from '@/components/contexts/UploadStatusContext';
import { GameProvider, useGame } from '@/components/contexts/GameContext';
import { ThemeProvider, useTheme } from '@/components/contexts/ThemeContext';
import UploadStatusIndicator from '@/components/layout/UploadStatusIndicator';
import { useToast } from "@/components/ui/use-toast";

// ─── הגדרת הרשאות לכל נתיב ───────────────────────────────────────────────
const ROUTE_ACCESS = {
  LeaderboardNew:         'public',
  ViewSubmissions:        'public',
  AdminResults:           'public',
  Statistics:             'public',
  PredictionForm:         'user',
  JoinGame:               'user',
  AdminImport:            'admin',
  ManageGameParticipants: 'admin',
  UserManagement:         'admin',
  FormBuilder:            'admin',
  SystemOverview:         'admin',
  CreateGame:             'admin',
};

function getPageNameFromPath(pathname) {
  const map = {
    'leaderboard':       'LeaderboardNew',
    'view-submissions':  'ViewSubmissions',
    'admin-results':     'AdminResults',
    'statistics':        'Statistics',
    'prediction-form':   'PredictionForm',
    'join-game':         'JoinGame',
    'admin-import':      'AdminImport',
    'manage-game':       'ManageGameParticipants',
    'user-management':   'UserManagement',
    'form-builder':      'FormBuilder',
    'system-overview':   'SystemOverview',
    'create-game':       'CreateGame',
  };
  const lower = pathname.toLowerCase();
  for (const [key, page] of Object.entries(map)) {
    if (lower.includes(key)) return page;
  }
  return null;
}

// ─── Route Guard ─────────────────────────────────────────────────────────────
function RouteGuard({ children, currentUser, isAdmin, loading }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (loading) return;
    const pageName = getPageNameFromPath(location.pathname);
    if (!pageName) return;
    const required = ROUTE_ACCESS[pageName] || 'public';
    if (required === 'admin' && !isAdmin) {
      toast({ title: "אין הרשאה", description: "דף זה מיועד למנהלים בלבד.", variant: "destructive", duration: 3000 });
      navigate(createPageUrl("LeaderboardNew"), { replace: true });
    } else if (required === 'user' && !currentUser) {
      toast({ title: "נדרשת התחברות", description: "יש להתחבר כדי לגשת לדף זה.", variant: "destructive", duration: 3000 });
      navigate('/login', { replace: true });
    }
  }, [location.pathname, currentUser, isAdmin, loading]);

  return <>{children}</>;
}

// ─── Theme Picker ─────────────────────────────────────────────────────────────
function ThemePicker() {
  const { themeId, setTheme, allThemes } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="lm-theme-picker">
      <button className="lm-theme-trigger" onClick={() => setOpen(o => !o)}>
        <span className="lm-theme-trigger-label">🎨 ערכת נושא</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--tp)' }}>
          {allThemes[themeId]?.name}
        </span>
      </button>
      {open && (
        <div className="lm-theme-options">
          {Object.values(allThemes).map(t => (
            <button
              key={t.id}
              onClick={() => { setTheme(t.id); setOpen(false); }}
              className={`lm-theme-option ${themeId === t.id ? 'active' : ''}`}
              style={themeId === t.id ? {
                background: `rgba(${t.r},${t.g},${t.b},0.12)`,
                outline: `1px solid rgba(${t.r},${t.g},${t.b},0.4)`
              } : {}}
            >
              <span className="lm-theme-dot" style={{ background: t.primary, boxShadow: `0 0 8px ${t.primary}` }} />
              <span style={{ color: themeId === t.id ? t.primary : '#64748b', fontWeight: themeId === t.id ? 700 : 400, fontSize: '0.84rem' }}>
                {t.name}
              </span>
              {themeId === t.id && <span style={{ marginRight: 'auto', fontSize: '0.74rem', color: t.primary }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Layout Content ───────────────────────────────────────────────────────────
function LayoutContent({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading,     setLoading    ] = useState(true);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [adminPassword,   setAdminPassword  ] = useState("");
  const [sidebarOpen,     setSidebarOpen    ] = useState(false);
  const { toast }      = useToast();
  const location       = useLocation();

  const {
    currentGame, games, selectGame,
    loading: gamesLoading,
    currentUser: gameContextUser,
  } = useGame();

  // ── Nav definitions ──
  const g = currentGame ? `?gameId=${currentGame.id}` : '';

  const publicItems = [
    { title: "טבלת דירוג",     url: createPageUrl("LeaderboardNew")  + g, icon: Award,    group: "main" },
    { title: "צפייה בניחושים", url: createPageUrl("ViewSubmissions") + g, icon: Users,    group: "main" },
    { title: "תוצאות אמת",     url: createPageUrl("AdminResults")    + g, icon: BarChart3,group: "main" },
    { title: "סטטיסטיקות",     url: createPageUrl("Statistics")      + g, icon: PieChart, group: "main" },
  ];
  const userItems = [
    { title: "מילוי ניחושים", url: createPageUrl("PredictionForm")       + g, icon: FileText, group: "main" },
  ];
  const adminItems = [
    { title: "ניהול משתתפים", url: createPageUrl("ManageGameParticipants"),  icon: Users,    group: "admin" },
    { title: "ייבוא ניחושים",  url: createPageUrl("AdminImport"),            icon: Upload,   group: "admin" },
    { title: "ניהול משתמשים", url: createPageUrl("UserManagement"),          icon: Shield,   group: "admin" },
    { title: "בניית שאלון",   url: createPageUrl("FormBuilder") + g,         icon: FileText, group: "admin" },
    { title: "סקירת מערכת",   url: createPageUrl("SystemOverview"),          icon: Database, group: "admin" },
  ];

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try { setCurrentUser(await supabase.auth.getUser().then(r => r.data.user)); }
    catch { setCurrentUser(null); }
    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setCurrentUser(null);
      window.location.href = createPageUrl("LeaderboardNew");
    } catch (e) { console.error("Logout error:", e); }
  };

  const handleAdminLogin = async () => {
    if (adminPassword === "champ11") {
      try {
        if (!currentUser) { window.location.href = '/login'; return; }
        await supabase.auth.updateUser({ role: "admin" });
        const updatedUser = await supabase.auth.getUser().then(r => r.data.user);
        setCurrentUser(updatedUser);
        setShowAdminDialog(false);
        setAdminPassword("");
        toast({ title: "התחברת כמנהל!", className: "bg-green-100 text-green-800", duration: 2000 });
      } catch {
        toast({ title: "שגיאה", description: "לא ניתן לעדכן הרשאות", variant: "destructive", duration: 2000 });
      }
    } else {
      toast({ title: "סיסמה שגויה", variant: "destructive", duration: 2000 });
      setAdminPassword("");
    }
  };

  const effectiveUser  = gameContextUser || currentUser;
  const supabaseRole   = effectiveUser?.role || effectiveUser?.user_metadata?.role || null;
  const isAdmin        = supabaseRole === "admin";

  const allNavItems = [
    ...publicItems.map(i => ({ ...i, disabled: !currentGame })),
    ...(effectiveUser ? userItems.map(i => ({ ...i, disabled: !currentGame })) : []),
    ...(isAdmin ? adminItems.map(i => ({
      ...i,
      disabled: i.group === 'admin' && !currentGame
             && i.title !== 'ניהול משתמשים'
             && i.title !== 'סקירת מערכת',
    })) : []),
  ];
  const mainNav  = allNavItems.filter(i => i.group === "main");
  const adminNav = allNavItems.filter(i => i.group === "admin");

  const isActive = (url) => window.location.pathname.includes(url.split('?')[0]);

  // Close sidebar on navigate (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Lock body scroll when sidebar open on mobile
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  // ── NavItem component ──
  const NavItem = ({ item, onClick }) => {
    const active = isActive(item.url);
    return (
      <Link
        to={item.disabled ? '#' : item.url}
        onClick={e => {
          if (item.disabled) {
            e.preventDefault();
            toast({ title: "בחר משחק", description: "נא לבחור משחק תחילה", variant: "destructive", duration: 2000 });
          }
          if (onClick) onClick();
        }}
        className={`lm-nav-item${active ? ' active' : ''}${item.disabled ? ' disabled' : ''}`}
      >
        <span className="lm-nav-icon"><item.icon size={16} /></span>
        <span className="lm-nav-label">{item.title}</span>
        {active && <span className="lm-nav-bar" />}
      </Link>
    );
  };

  // ── Sidebar inner content ──
  const SidebarInner = ({ onItemClick }) => (
    <div className="lm-sidebar-inner">

      {/* ── Logo ── */}
      <div className="lm-logo-area">
        <div className="lm-logo-img-wrap">
          <img
            src={currentGame?.game_icon || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909e559d350b14a5fc224bb/755e92965_2025-11-06120813.png"}
            alt="logo"
            className="lm-logo-img"
          />
          <div className="lm-logo-glow" />
        </div>
        <div className="lm-logo-text">
          <div className="lm-logo-title">טוטו ליגת אלופות</div>
          <div className="lm-logo-season">2025–2026</div>
          <div className="lm-logo-stage">שלב הנוק-אאוט</div>
        </div>
      </div>

      {/* ── Stars ── */}
      <div className="lm-stars" aria-hidden="true">
        {[0,1,2,3,4].map(i => (
          <span key={i} className="lm-star" style={{ '--i': i }}>★</span>
        ))}
      </div>

      {/* ── Game selector ── */}
      <div className="lm-game-selector">
        <div className="lm-sec-label lm-sec-label--primary">🎮 משחק פעיל</div>
        <Select
          value={currentGame?.id || ''}
          onValueChange={gameId => { const gx = games.find(x => x.id === gameId); if (gx) selectGame(gx); }}
          disabled={gamesLoading || games.length === 0}
        >
          <SelectTrigger className="lm-select-trigger">
            <SelectValue placeholder="בחר משחק">
              {currentGame ? currentGame.game_name : "בחר משחק"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="lm-select-content">
            {games.map(game => (
              <SelectItem key={game.id} value={game.id}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{game.game_name}</div>
                  {game.game_subtitle && <div style={{ fontSize: '0.7rem', color: 'var(--tp)', opacity: 0.8 }}>{game.game_subtitle}</div>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && currentGame && (
          <Link to={createPageUrl("CreateGame")} className="lm-edit-game">
            <Edit size={10} /> ערוך משחק
          </Link>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="lm-nav">
        {mainNav.length > 0 && (
          <>
            <div className="lm-sec-label">ראשי</div>
            {mainNav.map(item => <NavItem key={item.title} item={item} onClick={onItemClick} />)}
          </>
        )}
        {!effectiveUser && (
          <button className="lm-login-prompt" onClick={() => window.location.href = '/login'}>
            <Lock size={15} />
            <span>מילוי ניחושים</span>
            <span className="lm-login-badge">התחבר</span>
          </button>
        )}
        {adminNav.length > 0 && (
          <>
            <div className="lm-sec-label lm-sec-label--admin">ניהול</div>
            {adminNav.map(item => <NavItem key={item.title} item={item} onClick={onItemClick} />)}
          </>
        )}
      </nav>

      {/* ── Theme picker ── */}
      <ThemePicker />

      {/* ── User footer ── */}
      <div className="lm-user-footer">
        {effectiveUser ? (
          <div className="lm-user-row">
            <div className="lm-avatar">
              {(effectiveUser.user_metadata?.full_name || effectiveUser.email || '?')[0].toUpperCase()}
            </div>
            <div className="lm-user-info-block">
              <div className="lm-user-name">
                {effectiveUser.user_metadata?.full_name || effectiveUser.email}
              </div>
              <div className="lm-user-role" style={{ color: isAdmin ? 'var(--tp)' : '#64748b' }}>
                {isAdmin ? '👑 מנהל' : '✅ משתתף'}
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-danger btn-icon lm-logout-btn" title="התנתק">
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => window.location.href = '/login'} className="btn btn-secondary btn-wide">
            <Shield size={15} /> התחבר / הירשם
          </button>
        )}
      </div>
    </div>
  );

  if (loading || gamesLoading) {
    return (
      <div className="lm-loading">
        <div className="lm-loading-spinner" />
        <span>טוען...</span>
      </div>
    );
  }

  return (
    <div dir="rtl" className="lm-root">

      {/* ── Desktop sidebar ── */}
      <aside className="lm-sidebar desktop-sidebar">
        <SidebarInner onItemClick={null} />
      </aside>

      {/* ── Mobile overlay ── */}
      <div
        className={`lm-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ── Mobile sidebar ── */}
      <aside className={`lm-sidebar lm-sidebar--mobile mobile-sidebar${sidebarOpen ? ' open' : ''}`}>
        <button onClick={() => setSidebarOpen(false)} className="lm-close-btn">
          <X size={18} />
        </button>
        <SidebarInner onItemClick={() => setSidebarOpen(false)} />
      </aside>

      {/* ── Main ── */}
      <div className="lm-main">

        {/* Mobile topbar */}
        <header className="lm-topbar mobile-topbar">
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className={`lm-hamburger${sidebarOpen ? ' open' : ''}`}
            aria-label={sidebarOpen ? 'סגור תפריט' : 'פתח תפריט'}
          >
            <span /><span /><span />
          </button>
          <div className="lm-topbar-brand">
            <img
              src={currentGame?.game_icon || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909e559d350b14a5fc224bb/755e92965_2025-11-06120813.png"}
              alt="logo"
              className="lm-topbar-img"
            />
            <span>{currentGame?.game_name || 'טוטו ליגת אלופות'}</span>
          </div>
          <div style={{ width: 30 }} />
        </header>

        {/* Page content — ONLY THIS SCROLLS */}
        <RouteGuard currentUser={effectiveUser} isAdmin={isAdmin} loading={loading || gamesLoading}>
          <main className="lm-page">{children}</main>
        </RouteGuard>
      </div>

      <UploadStatusIndicator />

      {/* Admin dialog */}
      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent className="lm-admin-dialog" dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--tp)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={20} /> התחברות מנהל
            </DialogTitle>
            <DialogDescription style={{ color: '#94a3b8' }}>הזן את סיסמת המנהל</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAdminLogin()}
              placeholder="סיסמה..."
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowAdminDialog(false); setAdminPassword(""); }}
                className="btn btn-ghost"
              >ביטול</button>
              <button onClick={handleAdminLogin} className="btn btn-primary">
                התחבר כמנהל
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider>
      <UploadStatusProvider>
        <GameProvider>
          <style>{GLOBAL_STYLES}</style>
          <LayoutContent currentPageName={currentPageName}>
            {children}
          </LayoutContent>
        </GameProvider>
      </UploadStatusProvider>
    </ThemeProvider>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  GLOBAL STYLES
//  ↳ כל המחלקות כאן זמינות בכל דף באפליקציה
// ═════════════════════════════════════════════════════════════════════════════
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800;900&family=Heebo:wght@300;400;500;700;900&display=swap');

  /* ── Base reset ─────────────────────────────── */
  *, *::before, *::after {
    box-sizing: border-box;
    font-family: 'Rubik', 'Heebo', sans-serif !important;
  }
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    background: var(--bg1, #0a0f1e) !important;
    color: #f1f5f9;
    transition: background 0.35s ease, color 0.35s ease;
  }
  #root { height: 100%; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--tp-25, rgba(6,182,212,0.25)); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--tp-40, rgba(6,182,212,0.4)); }

  /* ══════════════════════════════════════════════
     BUTTON SYSTEM — שימוש ב: className="btn btn-primary"
     זמין בכל דף, תואם לכל ערכות הנושא
  ══════════════════════════════════════════════ */

  /* Base */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 9px 18px;
    border-radius: 8px;
    font-family: 'Rubik', 'Heebo', sans-serif !important;
    font-size: 0.88rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    border: 1px solid transparent;
    text-decoration: none;
    white-space: nowrap;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background   0.18s ease,
      border-color 0.18s ease,
      box-shadow   0.18s ease,
      transform    0.12s ease,
      opacity      0.18s ease,
      filter       0.18s ease;
  }
  .btn:active:not(:disabled):not([disabled]) {
    transform: scale(0.97);
  }
  .btn:disabled,
  .btn[disabled] {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Primary — filled */
  .btn-primary {
    background: var(--tp);
    color: #fff;
    border-color: transparent;
  }
  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.12);
    box-shadow: 0 4px 20px var(--tp-30, rgba(6,182,212,0.3));
  }
  .btn-primary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--tp-30);
  }

  /* Secondary — outlined with theme color */
  .btn-secondary {
    background: var(--tp-10, rgba(6,182,212,0.1));
    color: var(--tp);
    border-color: var(--tp-30, rgba(6,182,212,0.3));
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--tp-20, rgba(6,182,212,0.2));
    border-color: var(--tp-50, rgba(6,182,212,0.5));
    box-shadow: 0 0 14px var(--tp-20);
  }
  .btn-secondary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--tp-20);
  }

  /* Ghost — subtle, gray */
  .btn-ghost {
    background: transparent;
    color: #94a3b8;
    border-color: rgba(148, 163, 184, 0.2);
  }
  .btn-ghost:hover:not(:disabled) {
    background: rgba(148, 163, 184, 0.08);
    color: #cbd5e1;
    border-color: rgba(148, 163, 184, 0.35);
  }

  /* Danger — red */
  .btn-danger {
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.22);
  }
  .btn-danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.16);
    border-color: rgba(239, 68, 68, 0.45);
    box-shadow: 0 4px 16px rgba(239, 68, 68, 0.18);
  }

  /* Success — green */
  .btn-success {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.25);
  }
  .btn-success:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.18);
    border-color: rgba(34, 197, 94, 0.45);
    box-shadow: 0 4px 16px rgba(34, 197, 94, 0.18);
  }

  /* Warning — amber */
  .btn-warning {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.25);
  }
  .btn-warning:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.18);
    border-color: rgba(245, 158, 11, 0.45);
  }

  /* Sizes */
  .btn-sm   { padding: 5px 12px;  font-size: 0.78rem; border-radius: 7px;  gap: 5px; }
  .btn-lg   { padding: 12px 26px; font-size: 0.95rem; border-radius: 10px; gap: 9px; }
  .btn-icon { padding: 9px;       aspect-ratio: 1; }
  .btn-icon.btn-sm { padding: 6px; }
  .btn-wide { width: 100%; }

  /* ══════════════════════════════════════════════
     CARD SYSTEM — className="card"
  ══════════════════════════════════════════════ */
  .card {
    background: var(--bg2, rgba(17,24,39,0.98));
    border: 1px solid var(--tp-10, rgba(6,182,212,0.10));
    border-radius: 12px;
    padding: 20px 24px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .card:hover { border-color: var(--tp-20); }
  .card-sm { padding: 14px 18px; border-radius: 10px; }
  .card-elevated {
    box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  }

  /* ══════════════════════════════════════════════
     BADGE / PILL SYSTEM
  ══════════════════════════════════════════════ */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    border: 1px solid transparent;
  }
  .badge-primary { background: var(--tp-12); color: var(--tp); border-color: var(--tp-25); }
  .badge-success { background: rgba(34,197,94,0.1); color: #22c55e; border-color: rgba(34,197,94,0.25); }
  .badge-danger  { background: rgba(239,68,68,0.1); color: #ef4444; border-color: rgba(239,68,68,0.25); }
  .badge-warning { background: rgba(245,158,11,0.1); color: #f59e0b; border-color: rgba(245,158,11,0.25); }
  .badge-gray    { background: rgba(148,163,184,0.1); color: #94a3b8; border-color: rgba(148,163,184,0.2); }

  /* ══════════════════════════════════════════════
     INPUT / FORM SYSTEM
  ══════════════════════════════════════════════ */
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  select,
  textarea {
    background: var(--bg1, rgba(10,15,30,0.9)) !important;
    border: 1px solid var(--tp-20, rgba(6,182,212,0.2)) !important;
    color: #f1f5f9 !important;
    border-radius: 8px !important;
    font-family: 'Rubik', 'Heebo', sans-serif !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
  }
  input:focus, select:focus, textarea:focus {
    border-color: var(--tp-50, rgba(6,182,212,0.5)) !important;
    box-shadow: 0 0 0 3px var(--tp-12, rgba(6,182,212,0.12)) !important;
    outline: none !important;
  }

  /* ── Layout shell ────────────────────────────── */
  /*
   * KEY FIX: height:100dvh + overflow:hidden on root
   * means ONLY .lm-page can scroll.
   * Sidebar never participates in page scroll.
   */
  .lm-root {
    display: flex;
    height: 100dvh;
    overflow: hidden;
    background: linear-gradient(
      135deg,
      var(--bg1, #0a0f1e) 0%,
      var(--bg2, #111827) 50%,
      var(--bg1, #0a0f1e) 100%
    );
  }

  /* ── Sidebar ─────────────────────────────────── */
  .lm-sidebar {
    width: 260px;
    flex-shrink: 0;
    height: 100dvh;          /* exact viewport height */
    display: flex;
    flex-direction: column;
    background: var(--sidebar, rgba(8,11,22,0.99));
    border-left: 1px solid var(--tp-10, rgba(6,182,212,0.10));
    overflow: hidden;
    z-index: 40;
    position: relative;      /* for ::before/::after */
  }

  /* top glow orb */
  .lm-sidebar::before {
    content: '';
    position: absolute;
    top: -90px; right: -90px;
    width: 280px; height: 280px;
    background: radial-gradient(circle, var(--tp-12, rgba(6,182,212,0.12)) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
  /* grid texture */
  .lm-sidebar::after {
    content: '';
    position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(0deg,  transparent, transparent 27px, var(--tp-03, rgba(6,182,212,0.03)) 28px),
      repeating-linear-gradient(90deg, transparent, transparent 27px, var(--tp-03, rgba(6,182,212,0.03)) 28px);
    pointer-events: none;
    z-index: 0;
  }

  .lm-sidebar-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;        /* sidebar nav can scroll if very long */
    scrollbar-width: none;
  }
  .lm-sidebar-inner::-webkit-scrollbar { display: none; }

  /* Mobile variant */
  .lm-sidebar--mobile {
    position: fixed;
    top: 0; right: -270px;
    height: 100dvh;
    z-index: 50;
    transition: right 0.30s cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 0.30s ease;
  }
  .lm-sidebar--mobile.open {
    right: 0;
    box-shadow: -12px 0 60px rgba(0, 0, 0, 0.65);
  }

  .lm-close-btn {
    position: absolute;
    top: 12px; left: 12px;
    background: transparent; border: none;
    color: #64748b; cursor: pointer; padding: 5px;
    z-index: 2; border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }
  .lm-close-btn:hover { color: #94a3b8; background: rgba(255,255,255,0.05); }

  /* ── Overlay ─────────────────────────────────── */
  .lm-overlay {
    display: none;
    position: fixed; inset: 0;
    z-index: 49;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    opacity: 0;
    transition: opacity 0.30s ease;
    pointer-events: none;
  }
  .lm-overlay.visible { opacity: 1; pointer-events: all; }

  /* ── Logo ────────────────────────────────────── */
  .lm-logo-area {
    display: flex; align-items: center; gap: 12px;
    padding: 20px 18px 12px;
  }
  .lm-logo-img-wrap { position: relative; flex-shrink: 0; }
  .lm-logo-img {
    width: 58px; height: 58px;
    object-fit: contain; border-radius: 13px;
    border: 1px solid var(--tp-20);
    display: block;
  }
  .lm-logo-glow {
    position: absolute; inset: -6px; border-radius: 17px;
    background: radial-gradient(circle, var(--tp-15) 0%, transparent 70%);
    pointer-events: none;
    animation: lm-pulse 3.5s ease-in-out infinite;
  }
  @keyframes lm-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50%       { opacity: 0.9; transform: scale(1.08); }
  }
  .lm-logo-text { flex: 1; min-width: 0; }
  .lm-logo-title {
    font-size: 0.96rem; font-weight: 900; color: #f1f5f9;
    line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lm-logo-season { font-size: 0.72rem; font-weight: 700; color: var(--tp); margin-top: 2px; }
  .lm-logo-stage  { font-size: 0.65rem; color: #64748b; margin-top: 1px; }

  /* ── Stars ───────────────────────────────────── */
  .lm-stars {
    display: flex; justify-content: center; gap: 6px;
    padding: 0 18px 12px;
    position: relative;
  }
  .lm-stars::after {
    content: '';
    position: absolute; bottom: 0; left: 18px; right: 18px; height: 1px;
    background: linear-gradient(90deg, transparent, var(--tp-30), transparent);
  }
  .lm-star {
    font-size: 11px; color: #f59e0b; opacity: 0;
    filter: drop-shadow(0 0 5px rgba(245,158,11,0.7));
    animation: lm-star-in 0.5s ease forwards;
    animation-delay: calc(var(--i) * 0.08s + 0.4s);
  }
  @keyframes lm-star-in { to { opacity: 0.9; } }

  /* ── Game selector ───────────────────────────── */
  .lm-game-selector {
    padding: 10px 14px;
    border-bottom: 1px solid var(--tp-08, rgba(6,182,212,0.08));
    background: var(--tp-03, rgba(6,182,212,0.03));
  }

  /* Section labels */
  .lm-sec-label {
    font-size: 0.6rem; font-weight: 700;
    letter-spacing: 0.15em; text-transform: uppercase;
    color: #475569; padding: 0 2px 6px;
  }
  .lm-sec-label--primary { color: var(--tp); opacity: 0.9; }
  .lm-sec-label--admin   { color: #f59e0b; opacity: 0.8; margin-top: 14px; }

  /* Select overrides */
  .lm-select-trigger {
    background: rgba(15,23,42,0.75) !important;
    border: 1px solid var(--tp-20) !important;
    color: #f1f5f9 !important;
    font-size: 0.84rem !important; font-weight: 600 !important;
    height: 38px !important; border-radius: 8px !important;
    transition: border-color 0.2s, box-shadow 0.2s !important;
  }
  .lm-select-trigger:focus {
    border-color: var(--tp-50) !important;
    box-shadow: 0 0 0 3px var(--tp-10) !important;
  }
  .lm-select-content {
    background: var(--bg2, #111827) !important;
    border: 1px solid var(--tp-30) !important;
    color: #f1f5f9 !important;
    z-index: 9999 !important;
    border-radius: 10px !important;
    overflow: hidden !important;
  }

  .lm-edit-game {
    display: inline-flex; align-items: center; gap: 4px;
    margin-top: 6px; font-size: 0.68rem; color: #64748b;
    text-decoration: none; transition: color 0.15s;
  }
  .lm-edit-game:hover { color: var(--tp); }

  /* ── Navigation ──────────────────────────────── */
  .lm-nav {
    flex: 1; padding: 12px 10px;
    display: flex; flex-direction: column; gap: 2px;
    overflow-y: auto; scrollbar-width: none;
  }
  .lm-nav::-webkit-scrollbar { display: none; }

  .lm-nav-item {
    position: relative;
    display: flex; align-items: center; gap: 10px;
    padding: 10px 13px; border-radius: 10px;
    text-decoration: none;
    font-size: 0.92rem; font-weight: 500; color: #64748b;
    transition:
      background  0.18s ease,
      color       0.18s ease,
      transform   0.14s ease;
    cursor: pointer;
  }
  .lm-nav-item:hover:not(.disabled) {
    background: var(--tp-08, rgba(6,182,212,0.08));
    color: #cbd5e1;
    transform: translateX(-3px);
  }
  .lm-nav-item.active {
    background: var(--tp-12, rgba(6,182,212,0.12));
    color: var(--tp);
    font-weight: 700;
  }
  .lm-nav-item.disabled { opacity: 0.35; cursor: not-allowed; }

  .lm-nav-icon {
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .lm-nav-label { flex: 1; }

  /* Active bar */
  .lm-nav-bar {
    position: absolute; right: 0; top: 50%;
    transform: translateY(-50%);
    width: 3px; height: 60%;
    border-radius: 2px 0 0 2px;
    background: var(--tp);
    box-shadow: 0 0 12px var(--tp-40, rgba(6,182,212,0.4));
    animation: lm-bar-in 0.22s ease;
  }
  @keyframes lm-bar-in {
    from { transform: translateY(-50%) scaleY(0); }
    to   { transform: translateY(-50%) scaleY(1); }
  }

  /* Login prompt */
  .lm-login-prompt {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 10px 13px;
    border-radius: 10px;
    background: var(--tp-05, rgba(6,182,212,0.05));
    border: 1px dashed var(--tp-20);
    color: #475569; font-size: 0.92rem; font-weight: 500;
    font-family: inherit; cursor: pointer; text-align: right;
    transition: background 0.15s, color 0.15s;
  }
  .lm-login-prompt:hover { background: var(--tp-10); color: #94a3b8; }

  .lm-login-badge {
    font-size: 0.62rem; font-weight: 700; margin-right: auto;
    background: var(--tp-15); color: var(--tp);
    padding: 2px 8px; border-radius: 20px; letter-spacing: 0.05em;
  }

  /* ── Theme picker ────────────────────────────── */
  .lm-theme-picker { padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.05); }
  .lm-theme-trigger {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    background: transparent; border: none; cursor: pointer; font-family: inherit;
    padding: 6px 4px; border-radius: 8px; transition: background 0.15s;
  }
  .lm-theme-trigger:hover { background: rgba(255,255,255,0.03); }
  .lm-theme-trigger-label {
    font-size: 0.62rem; font-weight: 700; color: #475569;
    text-transform: uppercase; letter-spacing: 0.12em;
  }
  .lm-theme-options { margin-top: 5px; display: flex; flex-direction: column; gap: 2px; }
  .lm-theme-option {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 10px; border-radius: 8px; border: none;
    cursor: pointer; background: transparent; font-family: inherit;
    width: 100%; text-align: right; transition: background 0.12s;
  }
  .lm-theme-option:hover { background: rgba(255,255,255,0.04); }
  .lm-theme-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

  /* ── User footer ─────────────────────────────── */
  .lm-user-footer { padding: 12px 14px 16px; border-top: 1px solid var(--tp-10); }
  .lm-user-row { display: flex; align-items: center; gap: 10px; }
  .lm-avatar {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, var(--tp), #8b5cf6);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.82rem; font-weight: 800; color: white;
    box-shadow: 0 0 14px var(--tp-25);
  }
  .lm-user-info-block { flex: 1; min-width: 0; }
  .lm-user-name {
    font-size: 0.82rem; font-weight: 600; color: #e2e8f0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lm-user-role { font-size: 0.68rem; margin-top: 1px; }
  .lm-logout-btn { flex-shrink: 0; }

  /* ── Loading ─────────────────────────────────── */
  .lm-loading {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100dvh; gap: 16px;
    color: #64748b; font-size: 0.9rem;
    background: var(--bg1, #0a0f1e);
  }
  .lm-loading-spinner {
    width: 38px; height: 38px;
    border: 3px solid var(--tp-15);
    border-top-color: var(--tp);
    border-radius: 50%;
    animation: lm-spin 0.8s linear infinite;
  }
  @keyframes lm-spin { to { transform: rotate(360deg); } }

  /* ── Main content ────────────────────────────── */
  .lm-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100dvh;     /* ← locks height, enables child overflow */
    overflow: hidden;
    min-width: 0;
  }

  /* ONLY THIS ELEMENT SCROLLS */
  .lm-page {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }

  /* ── Mobile topbar ───────────────────────────── */
  .lm-topbar {
    display: none;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 56px;
    flex-shrink: 0;  /* ← never grows, takes fixed 56px */
    background: var(--sidebar, rgba(8,11,22,0.99));
    border-bottom: 1px solid var(--tp-10);
    position: sticky; top: 0; z-index: 30;
  }
  .lm-topbar-brand {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.9rem; font-weight: 800; color: #f1f5f9;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 60vw;
  }
  .lm-topbar-img {
    width: 34px; height: 34px;
    object-fit: contain; border-radius: 8px; flex-shrink: 0;
  }

  /* ── Hamburger ───────────────────────────────── */
  .lm-hamburger {
    display: flex; flex-direction: column;
    justify-content: center; gap: 5.5px;
    width: 38px; height: 38px; padding: 7px;
    background: transparent; border: none; border-radius: 8px;
    cursor: pointer; flex-shrink: 0;
    transition: background 0.15s;
  }
  .lm-hamburger:hover { background: var(--tp-08); }
  .lm-hamburger span {
    display: block; height: 2px; background: #94a3b8; border-radius: 2px;
    transition: transform 0.28s ease, opacity 0.28s ease, width 0.28s ease;
    transform-origin: center;
  }
  .lm-hamburger span:nth-child(1) { width: 20px; }
  .lm-hamburger span:nth-child(2) { width: 14px; }
  .lm-hamburger span:nth-child(3) { width: 20px; }
  .lm-hamburger.open span:nth-child(1) { transform: translateY(7.5px) rotate(45deg); width: 20px; }
  .lm-hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .lm-hamburger.open span:nth-child(3) { transform: translateY(-7.5px) rotate(-45deg); width: 20px; }

  /* ── Admin dialog ────────────────────────────── */
  .lm-admin-dialog {
    background: linear-gradient(
      135deg,
      var(--bg3, #0f172a) 0%,
      var(--bg1, #0a0f1e) 100%
    ) !important;
    border: 1px solid var(--tp-30) !important;
    border-radius: 14px !important;
  }

  /* ── Responsive ──────────────────────────────── */
  @media (max-width: 768px) {
    .desktop-sidebar { display: none !important; }
    .mobile-topbar   { display: flex !important; }
    .lm-overlay      { display: block !important; }
  }
  @media (min-width: 769px) {
    .mobile-sidebar { display: none !important; }
    .mobile-topbar  { display: none !important; }
  }

  /* ── Global table / Radix / shadcn overrides ─── */
  thead tr th,
  thead tr td { background: var(--bg2, #111827) !important; }

  [data-radix-select-viewport],
  [data-radix-popper-content-wrapper] > div {
    background: var(--bg2, #111827) !important;
    border: 1px solid var(--tp-25) !important;
  }
  [role="option"]:hover,
  [data-highlighted] { background: var(--tp-15) !important; color: #fff !important; }

  .bg-card   { background: hsl(var(--card)) !important; }
  .border-border { border-color: hsl(var(--border)) !important; }
  .nav-item:hover { background: var(--tp-10) !important; color: #e2e8f0 !important; }

  /* theme color overrides for cyan classes */
  .text-cyan-400 { color: var(--tp) !important; }
  .text-cyan-300 { color: var(--tp) !important; opacity: 0.85; }
  .border-cyan-400 { border-color: var(--tp) !important; }
  .border-cyan-700\\/50 { border-color: var(--tp-50) !important; }
  .border-cyan-400.text-cyan-200 { border-color: var(--tp-50) !important; color: var(--tp) !important; }
  .hover\\:bg-cyan-900\\/20:hover { background: var(--tp-10) !important; }
  .hover\\:border-cyan-700\\/50:hover { border-color: var(--tp-50) !important; }
`;
