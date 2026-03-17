import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Users, FileText, BarChart3, Database, Award, PieChart,
  LogOut, Shield, Edit, Upload, Lock, X, Sun, Moon,
} from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { UploadStatusProvider } from '@/components/contexts/UploadStatusContext';
import { GameProvider, useGame } from '@/components/contexts/GameContext';
import { ThemeProvider, useTheme, THEMES } from '@/components/contexts/ThemeContext';
import UploadStatusIndicator from '@/components/layout/UploadStatusIndicator';
import { useToast } from "@/components/ui/use-toast";

// ─── Route access ─────────────────────────────────────────────────────────────
const ROUTE_ACCESS = {
  LeaderboardNew: 'public', ViewSubmissions: 'public',
  AdminResults: 'public',   Statistics: 'public',
  PredictionForm: 'user',   JoinGame: 'user',
  AdminImport: 'admin', ManageGameParticipants: 'admin',
  UserManagement: 'admin',  FormBuilder: 'admin',
  SystemOverview: 'admin',  CreateGame: 'admin',
};

function getPageName(pathname) {
  const map = {
    'leaderboard':'LeaderboardNew','view-submissions':'ViewSubmissions',
    'admin-results':'AdminResults','statistics':'Statistics',
    'prediction-form':'PredictionForm','join-game':'JoinGame',
    'admin-import':'AdminImport','manage-game':'ManageGameParticipants',
    'user-management':'UserManagement','form-builder':'FormBuilder',
    'system-overview':'SystemOverview','create-game':'CreateGame',
  };
  const lower = pathname.toLowerCase();
  for (const [k,v] of Object.entries(map)) if (lower.includes(k)) return v;
  return null;
}

function RouteGuard({ children, currentUser, isAdmin, loading }) {
  const location = useLocation(), navigate = useNavigate();
  const { toast } = useToast();
  useEffect(() => {
    if (loading) return;
    const page = getPageName(location.pathname);
    if (!page) return;
    const req = ROUTE_ACCESS[page] || 'public';
    if (req === 'admin' && !isAdmin) {
      toast({ title:"אין הרשאה", description:"דף זה מיועד למנהלים בלבד.", variant:"destructive", duration:3000 });
      navigate(createPageUrl("LeaderboardNew"), { replace:true });
    } else if (req === 'user' && !currentUser) {
      toast({ title:"נדרשת התחברות", description:"יש להתחבר כדי לגשת לדף זה.", variant:"destructive", duration:3000 });
      navigate('/login', { replace:true });
    }
  }, [location.pathname, currentUser, isAdmin, loading]);
  return <>{children}</>;
}

// ─── Theme Picker ─────────────────────────────────────────────────────────────
function ThemePicker() {
  const { themeId, setTheme, allThemes, isDark, setIsDark } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="lm-theme-section">

      {/* Dark / Light toggle */}
      <button
        className="lm-darkmode-btn"
        onClick={() => setIsDark(!isDark)}
        title={isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
      >
        <span className="lm-darkmode-track">
          <span className={`lm-darkmode-knob${isDark ? '' : ' light'}`}>
            {isDark ? <Moon size={11}/> : <Sun size={11}/>}
          </span>
        </span>
        <span className="lm-darkmode-label">
          {isDark ? 'מצב כהה' : 'מצב בהיר'}
        </span>
      </button>

      {/* Theme trigger */}
      <button className="lm-theme-trigger" onClick={() => setOpen(o => !o)}>
        <div className="lm-theme-dots">
          {allThemes[themeId]?.previewColors?.map((c, i) => (
            <span key={i} style={{ background: c, width:10, height:10, borderRadius:'50%', display:'inline-block' }}/>
          ))}
        </div>
        <span className="lm-theme-name-current">
          {allThemes[themeId]?.emoji} {allThemes[themeId]?.nameHe}
        </span>
        <span className="lm-theme-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {/* Theme panel */}
      {open && (
        <div className="lm-theme-panel">
          {Object.values(allThemes).map(t => {
            const active = themeId === t.id;
            const palette = isDark ? t.dark : t.light;
            return (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setOpen(false); }}
                className={`lm-theme-card${active ? ' active' : ''}`}
                style={active ? {
                  border: `1px solid ${palette?.tp || 'var(--tp)'}`,
                  background: `rgba(${palette?.r||0},${palette?.g||0},${palette?.b||0},0.12)`,
                } : {}}
              >
                {/* Color preview strip */}
                <div className="lm-theme-strip">
                  {t.previewColors?.map((c, i) => (
                    <span key={i} style={{ flex:1, background:c, height:'100%' }}/>
                  ))}
                </div>
                {/* Info */}
                <div className="lm-theme-card-info">
                  <span className="lm-theme-card-emoji">{t.emoji}</span>
                  <span className="lm-theme-card-name" style={{ fontFamily: t.font }}>
                    {t.nameHe}
                  </span>
                  {active && <span className="lm-theme-check" style={{ color: palette?.tp || 'var(--tp)' }}>✓</span>}
                </div>
              </button>
            );
          })}
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
  const { toast } = useToast();
  const location  = useLocation();

  const {
    currentGame, games, selectGame,
    loading: gamesLoading,
    currentUser: gameContextUser,
  } = useGame();

  const g = currentGame ? `?gameId=${currentGame.id}` : '';

  const publicItems = [
    { title:"טבלת דירוג",     url:createPageUrl("LeaderboardNew")  + g, icon:Award,    group:"main" },
    { title:"צפייה בניחושים", url:createPageUrl("ViewSubmissions") + g, icon:Users,    group:"main" },
    { title:"תוצאות אמת",     url:createPageUrl("AdminResults")    + g, icon:BarChart3,group:"main" },
    { title:"סטטיסטיקות",     url:createPageUrl("Statistics")      + g, icon:PieChart, group:"main" },
  ];
  const userItems = [
    { title:"מילוי ניחושים",  url:createPageUrl("PredictionForm")  + g, icon:FileText, group:"main" },
  ];
  const adminItems = [
    { title:"ניהול משתתפים", url:createPageUrl("ManageGameParticipants"), icon:Users,    group:"admin" },
    { title:"ייבוא ניחושים",  url:createPageUrl("AdminImport"),           icon:Upload,   group:"admin" },
    { title:"ניהול משתמשים", url:createPageUrl("UserManagement"),         icon:Shield,   group:"admin" },
    { title:"בניית שאלון",   url:createPageUrl("FormBuilder") + g,        icon:FileText, group:"admin" },
    { title:"סקירת מערכת",   url:createPageUrl("SystemOverview"),         icon:Database, group:"admin" },
  ];

  useEffect(() => { loadUser(); }, []);
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const loadUser = async () => {
    try { setCurrentUser(await supabase.auth.getUser().then(r => r.data.user)); }
    catch { setCurrentUser(null); }
    setLoading(false);
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); setCurrentUser(null); window.location.href = createPageUrl("LeaderboardNew"); }
    catch (e) { console.error(e); }
  };

  const handleAdminLogin = async () => {
    if (adminPassword === "champ11") {
      try {
        if (!currentUser) { window.location.href = '/login'; return; }
        await supabase.auth.updateUser({ role:"admin" });
        const u = await supabase.auth.getUser().then(r => r.data.user);
        setCurrentUser(u); setShowAdminDialog(false); setAdminPassword("");
        toast({ title:"התחברת כמנהל!", className:"bg-green-100 text-green-800", duration:2000 });
      } catch {
        toast({ title:"שגיאה", description:"לא ניתן לעדכן הרשאות", variant:"destructive", duration:2000 });
      }
    } else {
      toast({ title:"סיסמה שגויה", variant:"destructive", duration:2000 });
      setAdminPassword("");
    }
  };

  const effectiveUser = gameContextUser || currentUser;
  const supabaseRole  = effectiveUser?.role || effectiveUser?.user_metadata?.role || null;
  const isAdmin       = supabaseRole === "admin";

  const allNavItems = [
    ...publicItems.map(i => ({ ...i, disabled: !currentGame })),
    ...(effectiveUser ? userItems.map(i => ({ ...i, disabled: !currentGame })) : []),
    ...(isAdmin ? adminItems.map(i => ({
      ...i,
      disabled: i.group==='admin' && !currentGame && i.title!=='ניהול משתמשים' && i.title!=='סקירת מערכת',
    })) : []),
  ];
  const mainNav  = allNavItems.filter(i => i.group==="main");
  const adminNav = allNavItems.filter(i => i.group==="admin");
  const isActive = (url) => window.location.pathname.includes(url.split('?')[0]);

  const NavItem = ({ item, onClick }) => {
    const active = isActive(item.url);
    return (
      <Link
        to={item.disabled ? '#' : item.url}
        onClick={e => {
          if (item.disabled) { e.preventDefault(); toast({ title:"בחר משחק", description:"נא לבחור משחק תחילה", variant:"destructive", duration:2000 }); }
          if (onClick) onClick();
        }}
        className={`lm-nav-item${active?' active':''}${item.disabled?' disabled':''}`}
      >
        <span className="lm-nav-icon"><item.icon size={16}/></span>
        <span className="lm-nav-label">{item.title}</span>
        {active && <span className="lm-nav-bar"/>}
      </Link>
    );
  };

  const SidebarInner = ({ onItemClick }) => (
    <div className="lm-sidebar-inner">

      {/* ── Logo ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:'14px',
        padding:'20px 16px 14px', flexDirection:'row-reverse', justifyContent:'flex-end'
      }}>
        {/* לוגו — inline style מבטיח גודל נכון */}
        {currentGame?.game_icon ? (
          <div style={{position:'relative', flexShrink:0}}>
            <img
              src={currentGame.game_icon}
              alt={currentGame.game_name}
              style={{
                width:'130px', height:'130px',
                objectFit:'contain', borderRadius:'16px',
                border:'1px solid var(--tp-20)', display:'block',
              }}
            />
            <div style={{
              position:'absolute', inset:'-10px', borderRadius:'24px',
              background:'radial-gradient(circle, var(--tp-18) 0%, transparent 70%)',
              pointerEvents:'none',
            }}/>
          </div>
        ) : (
          <div style={{
            width:'130px', height:'130px', borderRadius:'16px', flexShrink:0,
            border:'1px dashed var(--tp-25)', background:'var(--tp-05)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'48px',
          }}>⚽</div>
        )}

        {/* טקסט — שתי שורות ברורות */}
        <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:'6px'}}>
          {currentGame ? (
            <>
              <div style={{
                fontSize:'1.05rem', fontWeight:900, color:'var(--text)',
                lineHeight:1.3, wordBreak:'break-word',
              }}>
                {currentGame.game_name}
              </div>
              {currentGame.game_subtitle && (
                <div style={{
                  fontSize:'1rem', fontWeight:800, color:'var(--tp)',
                  lineHeight:1.2, wordBreak:'break-word',
                }}>
                  {currentGame.game_subtitle}
                </div>
              )}
            </>
          ) : (
            <div style={{fontSize:'1rem', fontWeight:500, color:'var(--text-muted)'}}>
              בחר משחק
            </div>
          )}
        </div>
      </div>

      {/* ── Stars ── */}
      <div className="lm-stars" aria-hidden="true">
        {[0,1,2,3,4].map(i=><span key={i} className="lm-star" style={{'--i':i}}>★</span>)}
      </div>

      {/* ── Game selector ── */}
      <div className="lm-game-selector">
        <div className="lm-sec-label lm-sec-label--primary">🎮 משחק פעיל</div>
        <Select
          value={currentGame?.id || ''}
          onValueChange={gameId => { const gx=games.find(x=>x.id===gameId); if(gx) selectGame(gx); }}
          disabled={gamesLoading || games.length===0}
        >
          <SelectTrigger className="lm-select-trigger">
            <SelectValue placeholder="בחר משחק">
              {currentGame ? (
                <div style={{textAlign:'right',lineHeight:'1.2'}}>
                  <div style={{fontWeight:700,fontSize:'0.82rem'}}>{currentGame.game_name}</div>
                  {currentGame.game_subtitle && (
                    <div style={{fontSize:'0.7rem',color:'var(--tp)',opacity:0.85,marginTop:'1px'}}>{currentGame.game_subtitle}</div>
                  )}
                </div>
              ) : "בחר משחק"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="lm-select-content">
            {games.map(game=>(
              <SelectItem key={game.id} value={game.id}>
                <div>
                  <div style={{fontWeight:700,fontSize:'0.85rem'}}>{game.game_name}</div>
                  {game.game_subtitle && <div style={{fontSize:'0.7rem',color:'var(--tp)',opacity:0.8}}>{game.game_subtitle}</div>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && currentGame && (
          <Link to={createPageUrl("CreateGame")} className="lm-edit-game"><Edit size={10}/> ערוך משחק</Link>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="lm-nav">
        {mainNav.length > 0 && (
          <><div className="lm-sec-label">ראשי</div>
          {mainNav.map(item=><NavItem key={item.title} item={item} onClick={onItemClick}/>)}</>
        )}
        {!effectiveUser && (
          <button className="lm-login-prompt" onClick={()=>window.location.href='/login'}>
            <Lock size={15}/><span>מילוי ניחושים</span><span className="lm-login-badge">התחבר</span>
          </button>
        )}
        {adminNav.length > 0 && (
          <><div className="lm-sec-label lm-sec-label--admin">ניהול</div>
          {adminNav.map(item=><NavItem key={item.title} item={item} onClick={onItemClick}/>)}</>
        )}
      </nav>

      {/* ── Theme picker ── */}
      <ThemePicker/>

      {/* ── User footer ── */}
      <div className="lm-user-footer">
        {effectiveUser ? (
          <div className="lm-user-row">
            <div className="lm-avatar">
              {(effectiveUser.user_metadata?.full_name || effectiveUser.email || '?')[0].toUpperCase()}
            </div>
            <div className="lm-user-info-block">
              <div className="lm-user-name">{effectiveUser.user_metadata?.full_name || effectiveUser.email}</div>
              <div className="lm-user-role" style={{color:isAdmin?'var(--tp)':'#64748b'}}>
                {isAdmin ? '👑 מנהל' : '✅ משתתף'}
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-danger btn-icon btn-sm lm-logout-btn" title="התנתק">
              <LogOut size={14}/>
            </button>
          </div>
        ) : (
          <button onClick={()=>window.location.href='/login'} className="btn btn-secondary btn-wide">
            <Shield size={15}/> התחבר / הירשם
          </button>
        )}
      </div>
    </div>
  );

  if (loading || gamesLoading) {
    return (
      <div className="lm-loading">
        <div className="lm-loading-spinner"/>
        <span>טוען...</span>
      </div>
    );
  }

  return (
    <div dir="rtl" className="lm-root">
      <aside className="lm-sidebar desktop-sidebar"><SidebarInner onItemClick={null}/></aside>
      <div className={`lm-overlay${sidebarOpen?' visible':''}`} onClick={()=>setSidebarOpen(false)} aria-hidden="true"/>
      <aside className={`lm-sidebar lm-sidebar--mobile mobile-sidebar${sidebarOpen?' open':''}`}>
        <button onClick={()=>setSidebarOpen(false)} className="lm-close-btn"><X size={18}/></button>
        <SidebarInner onItemClick={()=>setSidebarOpen(false)}/>
      </aside>

      <div className="lm-main">
        <header className="lm-topbar mobile-topbar">
          <button onClick={()=>setSidebarOpen(s=>!s)} className={`lm-hamburger${sidebarOpen?' open':''}`}>
            <span/><span/><span/>
          </button>
          <div className="lm-topbar-brand">
            {currentGame?.game_icon && <img src={currentGame.game_icon} alt="logo" className="lm-topbar-img"/>}
            <span style={{lineHeight:'1.2',textAlign:'right'}}>
              <span style={{display:'block',fontWeight:700}}>{currentGame?.game_name || 'בחר משחק'}</span>
              {currentGame?.game_subtitle && <span style={{display:'block',fontSize:'0.65rem',opacity:0.75,color:'var(--tp)'}}>{currentGame.game_subtitle}</span>}
            </span>
          </div>
          <div style={{width:30}}/>
        </header>
        <RouteGuard currentUser={effectiveUser} isAdmin={isAdmin} loading={loading||gamesLoading}>
          <main className="lm-page">{children}</main>
        </RouteGuard>
      </div>

      <UploadStatusIndicator/>

      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent className="lm-admin-dialog" dir="rtl">
          <DialogHeader>
            <DialogTitle style={{color:'var(--tp)',display:'flex',alignItems:'center',gap:8}}>
              <Shield size={20}/> התחברות מנהל
            </DialogTitle>
            <DialogDescription style={{color:'var(--text-muted)'}}>הזן את סיסמת המנהל</DialogDescription>
          </DialogHeader>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <Input type="password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)}
              onKeyPress={e=>e.key==='Enter'&&handleAdminLogin()} placeholder="סיסמה..."/>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>{setShowAdminDialog(false);setAdminPassword("");}} className="btn btn-ghost">ביטול</button>
              <button onClick={handleAdminLogin} className="btn btn-primary">התחבר כמנהל</button>
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
          <LayoutContent currentPageName={currentPageName}>{children}</LayoutContent>
        </GameProvider>
      </UploadStatusProvider>
    </ThemeProvider>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  GLOBAL STYLES — כל CSS גלובלי כולל btn system, cards, ו-theme variables
// ═════════════════════════════════════════════════════════════════════════════
const GLOBAL_STYLES = `
  /* ThemeContext מטפל ב-font injection + רקעים + CSS vars.
     כאן רק layout, components, ו-utilities. */

  /* ══════════════════════════════════════════════════
     CSS VARIABLES — כל הערכים מגיעים מ-ThemeContext
     =====================================================
     --bg1, --bg2, --bg3        : רקעים
     --sidebar                  : רקע סיידבר
     --tp                       : צבע ראשי
     --tp-03 ... --tp-50        : ראשי + שקיפות
     --text, --text-muted       : טקסט
     --card-bg, --card-border   : כרטיסים
     --font-main                : גופן
  ══════════════════════════════════════════════════ */

  /* Default values (overridden at runtime by ThemeContext) */
  :root {
    --bg1:         #070d1a;
    --bg2:         #0d1929;
    --bg3:         #0a1422;
    --sidebar:     rgba(5,8,16,0.99);
    --sidebar-bdr: rgba(6,182,212,0.10);
    --tp:          #06b6d4;
    --tp-dark:     #0891b2;
    --tp-03:       rgba(6,182,212,0.03);
    --tp-05:       rgba(6,182,212,0.05);
    --tp-08:       rgba(6,182,212,0.08);
    --tp-10:       rgba(6,182,212,0.10);
    --tp-12:       rgba(6,182,212,0.12);
    --tp-15:       rgba(6,182,212,0.15);
    --tp-18:       rgba(6,182,212,0.18);
    --tp-20:       rgba(6,182,212,0.20);
    --tp-25:       rgba(6,182,212,0.25);
    --tp-30:       rgba(6,182,212,0.30);
    --tp-40:       rgba(6,182,212,0.40);
    --tp-50:       rgba(6,182,212,0.50);
    --tp-glow:     0 0 20px rgba(6,182,212,0.30);
    --text:        #e2e8f0;
    --text-muted:  #64748b;
    --text-sub:    #475569;
    --card-bg:     rgba(13,25,41,0.95);
    --card-border: rgba(6,182,212,0.10);
    --gold:        #f59e0b;
    --font-main:   'Rubik', 'Heebo', sans-serif;
  }

  /* ── Reset ─────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    transition: background 0.4s ease, color 0.3s ease;
  }
  #root { height: 100%; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--tp-25); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--tp-40); }

  /* ══════════════════════════════════════════════════
     BUTTON SYSTEM
     className="btn btn-primary"
     className="btn btn-secondary btn-sm"
     className="btn btn-danger btn-icon"
     className="btn btn-ghost btn-wide"
  ══════════════════════════════════════════════════ */
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 7px; padding: 9px 18px; border-radius: 8px;
    font-family: var(--font-main) !important;
    font-size: 0.88rem; font-weight: 600; line-height: 1;
    cursor: pointer; border: 1px solid transparent;
    text-decoration: none; white-space: nowrap; user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.18s, border-color 0.18s, box-shadow 0.18s, transform 0.12s, opacity 0.18s, filter 0.18s;
  }
  .btn:active:not(:disabled):not([disabled]) { transform: scale(0.97); }
  .btn:disabled, .btn[disabled] { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

  .btn-primary   { background: var(--tp); color: #fff; border-color: transparent; }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.12); box-shadow: 0 4px 20px var(--tp-30); }

  .btn-secondary { background: var(--tp-10); color: var(--tp); border-color: var(--tp-30); }
  .btn-secondary:hover:not(:disabled) { background: var(--tp-20); border-color: var(--tp-50); box-shadow: 0 0 14px var(--tp-20); }

  .btn-ghost { background: transparent; color: var(--text-muted); border-color: rgba(148,163,184,0.20); }
  .btn-ghost:hover:not(:disabled) { background: rgba(148,163,184,0.08); color: var(--text); }

  .btn-danger { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.22); }
  .btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.16); border-color: rgba(239,68,68,0.45); }

  .btn-success { background: rgba(34,197,94,0.10); color: #22c55e; border-color: rgba(34,197,94,0.25); }
  .btn-success:hover:not(:disabled) { background: rgba(34,197,94,0.18); border-color: rgba(34,197,94,0.45); }

  .btn-warning { background: rgba(245,158,11,0.10); color: #f59e0b; border-color: rgba(245,158,11,0.25); }
  .btn-warning:hover:not(:disabled) { background: rgba(245,158,11,0.18); }

  .btn-sm   { padding: 5px 12px; font-size: 0.78rem; border-radius: 7px; gap: 5px; }
  .btn-lg   { padding: 12px 26px; font-size: 0.95rem; border-radius: 10px; gap: 9px; }
  .btn-icon { padding: 8px; aspect-ratio: 1; }
  .btn-icon.btn-sm { padding: 6px; }
  .btn-wide { width: 100%; }

  /* ══════════════════════════════════════════════════
     CARD SYSTEM
     className="card"
  ══════════════════════════════════════════════════ */
  .card {
    background: var(--card-bg, var(--bg2));
    border: 1px solid var(--card-border, var(--tp-10));
    border-radius: 12px; padding: 20px 24px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .card:hover { border-color: var(--tp-20); }
  .card-sm { padding: 14px 18px; border-radius: 10px; }
  .card-elevated { box-shadow: 0 4px 24px rgba(0,0,0,0.35); }

  /* ══════════════════════════════════════════════════
     BADGE SYSTEM
  ══════════════════════════════════════════════════ */
  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 10px; border-radius: 20px;
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em; border: 1px solid transparent;
  }
  .badge-primary { background: var(--tp-12); color: var(--tp); border-color: var(--tp-25); }
  .badge-success { background: rgba(34,197,94,0.10); color: #22c55e; border-color: rgba(34,197,94,0.25); }
  .badge-danger  { background: rgba(239,68,68,0.10); color: #ef4444; border-color: rgba(239,68,68,0.25); }
  .badge-warning { background: rgba(245,158,11,0.10); color: #f59e0b; border-color: rgba(245,158,11,0.25); }
  .badge-gray    { background: rgba(148,163,184,0.10); color: #94a3b8; border-color: rgba(148,163,184,0.20); }

  /* ══════════════════════════════════════════════════
     INPUT SYSTEM
  ══════════════════════════════════════════════════ */
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  select, textarea {
    background: var(--bg1) !important;
    border: 1px solid var(--tp-20) !important;
    color: var(--text) !important;
    border-radius: 8px !important;
    font-family: var(--font-main) !important;
    transition: border-color 0.2s, box-shadow 0.2s !important;
  }
  input:focus, select:focus, textarea:focus {
    border-color: var(--tp-50) !important;
    box-shadow: 0 0 0 3px var(--tp-12) !important;
    outline: none !important;
  }

  /* ── Layout shell ─────────────────────────────── */
  .lm-root {
    display: flex;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg1);
    transition: background 0.4s ease;
  }

  /* ── Sidebar ──────────────────────────────────── */
  .lm-sidebar {
    width: 300px !important; flex-shrink: 0;
    height: 100dvh;
    display: flex; flex-direction: column;
    background: var(--sidebar);
    border-left: 1px solid var(--sidebar-bdr, var(--tp-10));
    overflow: hidden; z-index: 40; position: relative;
    transition: background 0.4s ease;
  }
  .lm-sidebar::before {
    content: '';
    position: absolute; top: -90px; right: -90px;
    width: 280px; height: 280px;
    background: radial-gradient(circle, var(--tp-12) 0%, transparent 70%);
    pointer-events: none; z-index: 0;
    transition: background 0.4s;
  }
  .lm-sidebar::after {
    content: '';
    position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(0deg,  transparent, transparent 27px, var(--tp-03) 28px),
      repeating-linear-gradient(90deg, transparent, transparent 27px, var(--tp-03) 28px);
    pointer-events: none; z-index: 0;
  }
  .lm-sidebar-inner {
    position: relative; z-index: 1;
    display: flex; flex-direction: column; height: 100%;
    overflow-y: auto; scrollbar-width: none;
  }
  .lm-sidebar-inner::-webkit-scrollbar { display: none; }

  .lm-sidebar--mobile {
    position: fixed; top: 0; right: -310px;
    height: 100dvh; z-index: 50;
    transition: right 0.30s cubic-bezier(0.4,0,0.2,1), box-shadow 0.30s ease;
  }
  .lm-sidebar--mobile.open { right: 0; box-shadow: -12px 0 60px rgba(0,0,0,0.65); }

  .lm-close-btn {
    position: absolute; top: 12px; left: 12px;
    background: transparent; border: none; color: var(--text-muted);
    cursor: pointer; padding: 5px; z-index: 2; border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }
  .lm-close-btn:hover { color: var(--text); background: var(--tp-08); }

  /* ── Overlay ──────────────────────────────────── */
  .lm-overlay {
    display: none; position: fixed; inset: 0; z-index: 49;
    background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
    opacity: 0; transition: opacity 0.30s ease; pointer-events: none;
  }
  .lm-overlay.visible { opacity: 1; pointer-events: all; }

  /* ── Logo (96px) ──────────────────────────────── */
  .lm-logo-area {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px 16px 14px;
  }
  .lm-logo-img-wrap { position: relative; flex-shrink: 0; }
  .lm-logo-img {
    width: 130px; height: 130px;
    object-fit: contain; border-radius: 16px;
    border: 1px solid var(--tp-20); display: block;
  }
  .lm-logo-glow {
    position: absolute; inset: -10px; border-radius: 24px;
    background: radial-gradient(circle, var(--tp-18) 0%, transparent 70%);
    pointer-events: none; animation: lm-pulse 3.5s ease-in-out infinite;
    transition: background 0.4s;
  }
  @keyframes lm-pulse {
    0%,100% { opacity: 0.4; transform: scale(1); }
    50%      { opacity: 1.0; transform: scale(1.08); }
  }
  .lm-logo-placeholder {
    width: 130px; height: 130px; border-radius: 16px; flex-shrink: 0;
    border: 1px dashed var(--tp-25); background: var(--tp-05);
    display: flex; align-items: center; justify-content: center; font-size: 48px;
  }
  .lm-logo-text {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; gap: 6px;
  }
  .lm-logo-title {
    font-size: 1.05rem;
    font-weight: 900;
    color: var(--text);
    line-height: 1.25;
    word-break: break-word;
    overflow-wrap: break-word;
    /* לא חוצים ל-3 שורות — מציגים הכל */
    transition: color 0.3s;
  }
  .lm-logo-title--dim { color: var(--text-muted); font-weight: 500; }
  .lm-logo-season {
    font-size: 1rem;
    font-weight: 800;
    color: var(--tp);
    line-height: 1.2;
    word-break: break-word;
    transition: color 0.3s;
  }

  /* ── Stars ────────────────────────────────────── */
  .lm-stars {
    display: flex; justify-content: center; gap: 6px;
    padding: 0 18px 12px; position: relative;
  }
  .lm-stars::after {
    content: ''; position: absolute; bottom: 0; left: 18px; right: 18px; height: 1px;
    background: linear-gradient(90deg, transparent, var(--tp-30), transparent);
  }
  .lm-star {
    font-size: 11px; color: var(--gold); opacity: 0;
    filter: drop-shadow(0 0 5px var(--gold));
    animation: lm-star-in 0.5s ease forwards;
    animation-delay: calc(var(--i) * 0.08s + 0.4s);
    transition: color 0.3s;
  }
  @keyframes lm-star-in { to { opacity: 0.9; } }

  /* ── Game selector ────────────────────────────── */
  .lm-game-selector {
    padding: 10px 14px;
    border-bottom: 1px solid var(--tp-08);
    background: var(--tp-03);
  }
  .lm-sec-label {
    font-size: 0.7rem; font-weight: 800; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--text-sub); padding: 0 4px 7px;
  }
  .lm-sec-label--primary { color: var(--tp); opacity: 1; font-size: 0.72rem; }
  .lm-sec-label--admin   { color: var(--gold); opacity: 0.9; margin-top: 16px; font-size: 0.7rem; }

  .lm-select-trigger {
    background: var(--bg1) !important; border: 1px solid var(--tp-20) !important;
    color: var(--text) !important; font-size: 0.84rem !important; font-weight: 600 !important;
    height: 38px !important; border-radius: 8px !important;
    transition: border-color 0.2s, box-shadow 0.2s !important;
  }
  .lm-select-content {
    background: var(--bg2) !important; border: 1px solid var(--tp-30) !important;
    color: var(--text) !important; z-index: 9999 !important;
    border-radius: 10px !important; overflow: hidden !important;
  }
  .lm-edit-game {
    display: inline-flex; align-items: center; gap: 4px;
    margin-top: 6px; font-size: 0.68rem; color: var(--text-muted);
    text-decoration: none; transition: color 0.15s;
  }
  .lm-edit-game:hover { color: var(--tp); }

  /* ── Navigation ───────────────────────────────── */
  .lm-nav {
    flex: 1; padding: 12px 10px;
    display: flex; flex-direction: column; gap: 2px;
    overflow-y: auto; scrollbar-width: none;
  }
  .lm-nav::-webkit-scrollbar { display: none; }

  .lm-nav-item {
    position: relative; display: flex; align-items: center; gap: 10px;
    padding: 10px 13px; border-radius: 10px; text-decoration: none;
    font-size: 0.96rem; font-weight: 500; color: var(--text-muted);
    transition: background 0.18s, color 0.18s, transform 0.14s;
    cursor: pointer;
  }
  .lm-nav-item:hover:not(.disabled) { background: var(--tp-08); color: var(--text); transform: translateX(-3px); }
  .lm-nav-item.active { background: var(--tp-12); color: var(--tp); font-weight: 700; }
  .lm-nav-item.disabled { opacity: 0.35; cursor: not-allowed; }
  .lm-nav-icon { width:20px; height:20px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .lm-nav-label { flex: 1; }
  .lm-nav-bar {
    position: absolute; right: 0; top: 50%; transform: translateY(-50%);
    width: 3px; height: 60%; border-radius: 2px 0 0 2px;
    background: var(--tp); box-shadow: 0 0 12px var(--tp-40);
    animation: lm-bar-in 0.22s ease;
  }
  @keyframes lm-bar-in {
    from { transform: translateY(-50%) scaleY(0); }
    to   { transform: translateY(-50%) scaleY(1); }
  }

  .lm-login-prompt {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 10px 13px; border-radius: 10px;
    background: var(--tp-05); border: 1px dashed var(--tp-20);
    color: var(--text-muted); font-size: 0.92rem; font-weight: 500;
    font-family: var(--font-main) !important; cursor: pointer; text-align: right;
    transition: background 0.15s, color 0.15s;
  }
  .lm-login-prompt:hover { background: var(--tp-10); color: var(--text); }
  .lm-login-badge {
    font-size: 0.62rem; font-weight: 700; margin-right: auto;
    background: var(--tp-15); color: var(--tp);
    padding: 2px 8px; border-radius: 20px; letter-spacing: 0.05em;
  }

  /* ══════════════════════════════════════════════════
     THEME SECTION (replaces old ThemePicker)
  ══════════════════════════════════════════════════ */
  .lm-theme-section {
    padding: 10px 12px;
    border-top: 1px solid var(--tp-08);
    display: flex; flex-direction: column; gap: 6px;
  }

  /* Dark/light toggle */
  .lm-darkmode-btn {
    display: flex; align-items: center; gap: 10px;
    width: 100%; background: transparent; border: none;
    cursor: pointer; font-family: var(--font-main) !important;
    padding: 6px 4px; border-radius: 8px; transition: background 0.15s;
  }
  .lm-darkmode-btn:hover { background: var(--tp-05); }
  .lm-darkmode-track {
    position: relative; width: 36px; height: 20px;
    background: var(--tp-20); border: 1px solid var(--tp-30);
    border-radius: 10px; flex-shrink: 0;
    transition: background 0.25s;
  }
  .lm-darkmode-knob {
    position: absolute; top: 2px; right: 2px;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--tp); color: #fff;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), background 0.25s;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  }
  .lm-darkmode-knob.light { transform: translateX(-16px); background: var(--gold); }
  .lm-darkmode-label { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }

  /* Theme selector trigger */
  .lm-theme-trigger {
    display: flex; align-items: center; gap: 8px;
    width: 100%; background: var(--tp-05);
    border: 1px solid var(--tp-15); border-radius: 9px;
    padding: 8px 10px; cursor: pointer;
    font-family: var(--font-main) !important;
    transition: background 0.15s, border-color 0.15s;
  }
  .lm-theme-trigger:hover { background: var(--tp-10); border-color: var(--tp-25); }
  .lm-theme-dots { display: flex; gap: 3px; align-items: center; }
  .lm-theme-name-current { flex: 1; font-size: 0.82rem; font-weight: 600; color: var(--text); text-align: right; }
  .lm-theme-chevron { font-size: 0.6rem; color: var(--text-muted); }

  /* Theme panel */
  .lm-theme-panel {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 6px; margin-top: 4px;
    animation: lm-panel-in 0.18s ease;
  }
  @keyframes lm-panel-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .lm-theme-card {
    display: flex; flex-direction: column; gap: 6px;
    padding: 8px; border-radius: 10px;
    background: var(--tp-05); border: 1px solid var(--tp-10);
    cursor: pointer; transition: background 0.15s, border-color 0.15s, transform 0.12s;
    font-family: var(--font-main) !important;
  }
  .lm-theme-card:hover { background: var(--tp-10); transform: scale(1.03); }
  .lm-theme-card.active { transform: scale(1.02); }

  /* Color strip */
  .lm-theme-strip {
    width: 100%; height: 20px; border-radius: 6px; overflow: hidden;
    display: flex; border: 1px solid rgba(255,255,255,0.06);
  }

  .lm-theme-card-info {
    display: flex; align-items: center; gap: 5px;
  }
  .lm-theme-card-emoji { font-size: 14px; }
  .lm-theme-card-name  { font-size: 0.75rem; font-weight: 700; color: var(--text); flex: 1; }
  .lm-theme-check      { font-size: 0.8rem; font-weight: 700; }

  /* ── User footer ──────────────────────────────── */
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
    font-size: 0.82rem; font-weight: 600; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lm-user-role { font-size: 0.68rem; margin-top: 1px; }
  .lm-logout-btn { flex-shrink: 0; }

  /* ── Loading ──────────────────────────────────── */
  .lm-loading {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100dvh; gap: 16px;
    color: var(--text-muted); font-size: 0.9rem;
    background: var(--bg1);
  }
  .lm-loading-spinner {
    width: 38px; height: 38px;
    border: 3px solid var(--tp-15); border-top-color: var(--tp);
    border-radius: 50%; animation: lm-spin 0.8s linear infinite;
  }
  @keyframes lm-spin { to { transform: rotate(360deg); } }

  /* ── Main content ─────────────────────────────── */
  .lm-main {
    flex: 1; display: flex; flex-direction: column;
    height: 100dvh; overflow: hidden; min-width: 0;
    background: var(--bg1); transition: background 0.4s;
  }
  .lm-page {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    background: var(--bg1); transition: background 0.4s;
  }

  /* ── Mobile topbar ────────────────────────────── */
  .lm-topbar {
    display: none; align-items: center; justify-content: space-between;
    padding: 0 16px; height: 56px; flex-shrink: 0;
    background: var(--sidebar);
    border-bottom: 1px solid var(--tp-10);
    position: sticky; top: 0; z-index: 30;
    transition: background 0.4s;
  }
  .lm-topbar-brand {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.9rem; font-weight: 800; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60vw;
  }
  .lm-topbar-img { width: 34px; height: 34px; object-fit: contain; border-radius: 8px; flex-shrink: 0; }

  /* ── Hamburger ────────────────────────────────── */
  .lm-hamburger {
    display: flex; flex-direction: column; justify-content: center; gap: 5.5px;
    width: 38px; height: 38px; padding: 7px;
    background: transparent; border: none; border-radius: 8px;
    cursor: pointer; flex-shrink: 0; transition: background 0.15s;
  }
  .lm-hamburger:hover { background: var(--tp-08); }
  .lm-hamburger span {
    display: block; height: 2px; background: var(--text-muted); border-radius: 2px;
    transition: transform 0.28s ease, opacity 0.28s ease, width 0.28s ease;
    transform-origin: center;
  }
  .lm-hamburger span:nth-child(1) { width: 20px; }
  .lm-hamburger span:nth-child(2) { width: 14px; }
  .lm-hamburger span:nth-child(3) { width: 20px; }
  .lm-hamburger.open span:nth-child(1) { transform: translateY(7.5px) rotate(45deg); width: 20px; }
  .lm-hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .lm-hamburger.open span:nth-child(3) { transform: translateY(-7.5px) rotate(-45deg); width: 20px; }

  /* ── Admin dialog ─────────────────────────────── */
  .lm-admin-dialog {
    background: linear-gradient(135deg, var(--bg3) 0%, var(--bg1) 100%) !important;
    border: 1px solid var(--tp-30) !important; border-radius: 14px !important;
  }

  /* ── Responsive ───────────────────────────────── */
  @media (max-width: 768px) {
    .desktop-sidebar { display: none !important; }
    .mobile-topbar   { display: flex !important; }
    .lm-overlay      { display: block !important; }
  }
  @media (min-width: 769px) {
    .mobile-sidebar { display: none !important; }
    .mobile-topbar  { display: none !important; }
  }

  /* ═══════════════════════════════════════════════════
     MOBILE GLOBAL FIXES
     מניעת גלילת רוחב + הגדלת פונטים בסלולאר
  ═══════════════════════════════════════════════════ */
  @media (max-width: 768px) {

    /* ── מניעת גלילת רוחב מוחלטת ── */
    html, body, #root { overflow-x: hidden !important; max-width: 100vw !important; }

    .lm-root, .lm-main, .lm-page {
      overflow-x: hidden !important;
      max-width: 100vw !important;
    }

    /* ── גדלי פונטים גדולים יותר ── */
    body, * { font-size: 14px; }

    h1 { font-size: 1.4rem !important; }
    h2 { font-size: 1.2rem !important; }
    h3 { font-size: 1.05rem !important; }

    /* כרטיסים ו-badge */
    .card, [class*="card"], [class*="Card"] {
      border-radius: 10px !important;
    }

    /* ── טבלאות: גלול לרוחב בתוך wrapper בלבד ── */
    table {
      font-size: 0.85rem !important;
    }
    th, td {
      font-size: 0.82rem !important;
      padding: 6px 4px !important;
    }

    /* ── Grid רשתות בשאלות: מובייל-first ── */
    /* שאלות בודדות — הפוך ל-flex column */
    .vs-question-row {
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
      padding: 10px !important;
    }

    /* ── טבלת דירוג ── */
    .leaderboard-table th,
    .leaderboard-table td {
      font-size: 0.8rem !important;
      padding: 5px 3px !important;
    }

    /* ── Select triggers ── */
    [class*="SelectTrigger"],
    .lm-select-trigger {
      font-size: 0.9rem !important;
      height: 40px !important;
    }

    /* ── Badge ── */
    [class*="badge"], .badge {
      font-size: 0.75rem !important;
      padding: 3px 8px !important;
    }

    /* ── Buttons ── */
    .btn { font-size: 0.85rem !important; padding: 8px 14px !important; }
    .btn-sm { font-size: 0.78rem !important; }

    /* ── ViewSubmissions chips ── */
    .vs-mobile-chips button {
      font-size: 0.82rem !important;
      padding: 6px 14px !important;
    }

    /* ── Sidebar nav ── */
    .lm-nav-item { font-size: 1rem !important; padding: 11px 14px !important; }
    .lm-sec-label { font-size: 0.72rem !important; }

    /* ── אזורי תוכן ── */
    .min-h-screen { padding: 8px !important; }
    .p-3 { padding: 8px !important; }
    .p-6 { padding: 12px !important; }
    .gap-4 { gap: 8px !important; }
    .gap-6 { gap: 10px !important; }
    .mb-8 { margin-bottom: 16px !important; }

    /* ── Dialog: מלא מסך במובייל ── */
    [role="dialog"] {
      max-width: 96vw !important;
      width: 96vw !important;
      max-height: 88vh !important;
      margin: 0 auto !important;
      border-radius: 12px !important;
    }
  }

  /* ── Extra small (phones < 480px) ── */
  @media (max-width: 480px) {
    body, * { font-size: 13px; }
    h1 { font-size: 1.2rem !important; }
    .lm-topbar { height: 50px !important; }
    .lm-topbar-brand { font-size: 0.85rem !important; }
    .lm-topbar-img { width: 28px !important; height: 28px !important; }
  }

  /* ── Global overrides (Radix, shadcn, Tailwind) ─ */
  thead tr th, thead tr td { background: var(--bg2) !important; }

  [data-radix-select-viewport],
  [data-radix-popper-content-wrapper] > div {
    background: var(--bg2) !important; border: 1px solid var(--tp-25) !important;
  }
  [role="option"]:hover, [data-highlighted] { background: var(--tp-15) !important; color: var(--text) !important; }

  .bg-card   { background: var(--card-bg) !important; }
  .border-border { border-color: var(--card-border) !important; }
  .nav-item:hover { background: var(--tp-10) !important; color: var(--text) !important; }

  .text-cyan-400  { color: var(--tp) !important; }
  .text-cyan-300  { color: var(--tp) !important; opacity: 0.85; }
  .border-cyan-400 { border-color: var(--tp) !important; }
  .border-cyan-700\\/50 { border-color: var(--tp-50) !important; }
  .hover\\:bg-cyan-900\\/20:hover { background: var(--tp-10) !important; }
  .hover\\:border-cyan-700\\/50:hover { border-color: var(--tp-50) !important; }

  /* ── Light mode adjustments for main content ─── */
  .hm-light .lm-page,
  .hm-light .lm-main {
    background: var(--bg1);
  }
  .hm-light .card {
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .hm-light input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  .hm-light select,
  .hm-light textarea {
    background: #ffffff !important;
  }
`;
