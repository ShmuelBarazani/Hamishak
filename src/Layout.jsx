import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Trophy, Users, FileText, BarChart3, Database, Award, PieChart,
  LogOut, Shield, Edit, Menu, X, Upload, Lock
} from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import * as db from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { UploadStatusProvider } from '@/components/contexts/UploadStatusContext';
import { GameProvider, useGame } from '@/components/contexts/GameContext';
import { ThemeProvider, useTheme, injectThemeCSSVars, THEMES } from '@/components/contexts/ThemeContext';
import UploadStatusIndicator from '@/components/layout/UploadStatusIndicator';
import { useToast } from "@/components/ui/use-toast";

// ─── הגדרת הרשאות לכל נתיב ────────────────────────────────────────────────
const ROUTE_ACCESS = {
  // ציבורי — קישור בלבד מספיק
  LeaderboardNew:         'public',
  ViewSubmissions:        'public',
  AdminResults:           'public',
  Statistics:             'public',
  // מחייב התחברות
  PredictionForm:         'user',
  JoinGame:               'user',
  // מנהל בלבד
  AdminImport:            'admin',
  ManageGameParticipants: 'admin',
  UserManagement:         'admin',
  FormBuilder:            'admin',
  SystemOverview:         'admin',
  CreateGame:             'admin',
};

function getPageNameFromPath(pathname) {
  // createPageUrl יוצר נתיב כמו /leaderboard-new → LeaderboardNew
  // נחפש לפי חלק מהנתיב
  const map = {
    'leaderboard':           'LeaderboardNew',
    'view-submissions':      'ViewSubmissions',
    'admin-results':         'AdminResults',
    'statistics':            'Statistics',
    'prediction-form':       'PredictionForm',
    'join-game':             'JoinGame',
    'admin-import':          'AdminImport',
    'manage-game':           'ManageGameParticipants',
    'user-management':       'UserManagement',
    'form-builder':          'FormBuilder',
    'system-overview':       'SystemOverview',
    'create-game':           'CreateGame',
  };
  const lower = pathname.toLowerCase();
  for (const [key, page] of Object.entries(map)) {
    if (lower.includes(key)) return page;
  }
  return null;
}

function RouteGuard({ children, currentUser, isAdmin, loading }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (loading) return; // עדיין טוען

    const pageName = getPageNameFromPath(location.pathname);
    if (!pageName) return; // נתיב לא מוכר — נותנים לעבור

    const required = ROUTE_ACCESS[pageName] || 'public';

    if (required === 'admin' && !isAdmin) {
      toast({
        title: "אין הרשאה",
        description: "דף זה מיועד למנהלים בלבד.",
        variant: "destructive",
        duration: 3000,
      });
      navigate(createPageUrl("LeaderboardNew"), { replace: true });
      return;
    }

    if (required === 'user' && !currentUser) {
      toast({
        title: "נדרשת התחברות",
        description: "יש להתחבר כדי לגשת לדף זה.",
        variant: "destructive",
        duration: 3000,
      });
      navigate('/login', { replace: true });
      return;
    }
  }, [location.pathname, currentUser, isAdmin, loading]);

  return <>{children}</>;
}

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();

  const { currentGame, games, selectGame, loading: gamesLoading, currentParticipant, currentUser: gameContextUser } = useGame();

  // ─── ניווט ────────────────────────────────────────────────────────────────
  const publicItems = [
    { title: "טבלת דירוג",     url: createPageUrl("LeaderboardNew")   + (currentGame ? `?gameId=${currentGame.id}` : ''), icon: Award,    group: "main" },
    { title: "צפייה בניחושים", url: createPageUrl("ViewSubmissions")  + (currentGame ? `?gameId=${currentGame.id}` : ''), icon: Users,    group: "main" },
    { title: "תוצאות אמת",     url: createPageUrl("AdminResults")     + (currentGame ? `?gameId=${currentGame.id}` : ''), icon: BarChart3,group: "main" },
    { title: "סטטיסטיקות",     url: createPageUrl("Statistics")       + (currentGame ? `?gameId=${currentGame.id}` : ''), icon: PieChart, group: "main" },
  ];

  const userItems = [
    { title: "מילוי ניחושים", url: createPageUrl("PredictionForm") + (currentGame ? `?gameId=${currentGame.id}` : ''), icon: FileText, group: "main" },
  ];

  const adminItems = [
    { title: "ניהול משתתפים", url: createPageUrl("ManageGameParticipants"), icon: Users,     group: "admin" },
    { title: "ייבוא ניחושים",  url: createPageUrl("AdminImport"),           icon: Upload,    group: "admin" },
    { title: "ניהול משתמשים", url: createPageUrl("UserManagement"),         icon: Shield,    group: "admin" },
    { title: "בניית שאלון",   url: createPageUrl("FormBuilder") + (currentGame ? `?gameId=${currentGame.id}` : ''), icon: FileText, group: "admin" },
    { title: "סקירת מערכת",   url: createPageUrl("SystemOverview"),         icon: Database,  group: "admin" },
  ];

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data.user);
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }
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

  const effectiveUser = gameContextUser || currentUser;
  const supabaseRole = effectiveUser?.role || effectiveUser?.user_metadata?.role || null;
  const isAdmin = supabaseRole === "admin";

  // בנה רשימת ניווט לפי הרשאות
  const navigationItems = [
    ...publicItems.map(i => ({ ...i, disabled: !currentGame })),
    ...(effectiveUser ? userItems.map(i => ({ ...i, disabled: !currentGame })) : []),
    ...(isAdmin ? adminItems.map(i => ({ ...i, disabled: i.group === 'admin' && !currentGame && i.title !== 'ניהול משתמשים' && i.title !== 'סקירת מערכת' })) : []),
  ];

  const mainNav  = navigationItems.filter(i => i.group === "main");
  const adminNav = navigationItems.filter(i => i.group === "admin");

  const isActive = (url) => window.location.pathname.includes(url.split('?')[0]);

  const NavItem = ({ item, onClick }) => {
    const active = isActive(item.url);
    return (
      <Link
        to={item.disabled ? '#' : item.url}
        onClick={(e) => {
          if (item.disabled) {
            e.preventDefault();
            toast({ title: "בחר משחק", description: "נא לבחור משחק תחילה", variant: "destructive", duration: 2000 });
          }
          if (onClick) onClick();
        }}
        className="nav-item"
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 14px', borderRadius: '10px',
          fontSize: '1rem', fontWeight: active ? '700' : '500',
          color: item.disabled ? '#475569' : active ? 'var(--tp)' : '#94a3b8',
          background: active ? 'var(--tp-10)' : 'transparent',
          borderRight: active ? '3px solid var(--tp)' : '3px solid transparent',
          textDecoration: 'none', transition: 'all 0.15s',
          cursor: item.disabled ? 'not-allowed' : 'pointer',
          opacity: item.disabled ? 0.5 : 1, marginBottom: '2px',
        }}
      >
        <item.icon style={{ width: '17px', height: '17px', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{item.title}</span>
      </Link>
    );
  };

  const SidebarContent = ({ onItemClick }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* לוגו */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--tp-15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={currentGame?.game_icon || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909e559d350b14a5fc224bb/755e92965_2025-11-06120813.png"}
            alt="logo"
            style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '10px' }}
          />
          <div>
            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#f1f5f9', lineHeight: 1.25 }}>טוטו ליגת אלופות</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--tp)', fontWeight: '600' }}>2025-2026</div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>שלב הנוק-אאוט</div>
          </div>
        </div>
      </div>

      {/* בחירת משחק */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--tp-10)', background: 'var(--tp-05)' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tp)', marginBottom: '6px' }}>
          🎮 משחק פעיל
        </div>
        <Select
          value={currentGame?.id || ''}
          onValueChange={(gameId) => { const g = games.find(x => x.id === gameId); if (g) selectGame(g); }}
          disabled={gamesLoading || games.length === 0}
        >
          <SelectTrigger style={{
            background: 'rgba(15,23,42,0.6)', border: '1px solid var(--tp-20)',
            color: '#f1f5f9', fontSize: '0.85rem', fontWeight: '600', height: '36px', borderRadius: '8px',
          }}>
            <SelectValue placeholder="בחר משחק">
              {currentGame ? currentGame.game_name : "בחר משחק"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent style={{ background: 'var(--bg2)', border: '1px solid var(--tp-30)', color: '#f1f5f9', zIndex: 9999 }}>
            {games.map(game => (
              <SelectItem key={game.id} value={game.id} style={{ color: '#f1f5f9' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>{game.game_name}</div>
                  {game.game_subtitle && <div style={{ fontSize: '0.7rem', color: 'var(--tp)' }}>{game.game_subtitle}</div>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && currentGame && (
          <Link to={createPageUrl("CreateGame")} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.7rem', color: '#64748b', textDecoration: 'none' }}>
            <Edit style={{ width: '10px', height: '10px' }} /> ערוך משחק
          </Link>
        )}
      </div>

      {/* ניווט */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {mainNav.length > 0 && (
          <>
            <div style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569', padding: '0 8px', marginBottom: '6px' }}>
              ראשי
            </div>
            {mainNav.map(item => <NavItem key={item.title} item={item} onClick={onItemClick} />)}
          </>
        )}

        {/* מילוי ניחושים — רק למשתמש מחובר */}
        {!effectiveUser && (
          <div style={{ margin: '8px 4px 0', padding: '10px 14px', borderRadius: '10px', background: 'var(--tp-05)', border: '1px dashed var(--tp-20)' }}>
            <button
              onClick={() => window.location.href = '/login'}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1rem', fontWeight: '500', fontFamily: 'inherit' }}
            >
              <Lock style={{ width: '17px', height: '17px' }} />
              <span>מילוי ניחושים</span>
              <span style={{ fontSize: '0.65rem', marginRight: 'auto', color: '#475569' }}>התחבר</span>
            </button>
          </div>
        )}

        {adminNav.length > 0 && (
          <>
            <div style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569', padding: '0 8px', marginTop: '16px', marginBottom: '6px' }}>
              ניהול
            </div>
            {adminNav.map(item => <NavItem key={item.title} item={item} onClick={onItemClick} />)}
          </>
        )}
      </div>

      {/* ── בוחר THEME ── גלוי לכולם */}
      <ThemePicker />

      {/* משתמש */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--tp-15)' }}>
        {effectiveUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--tp), #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: '800', color: 'white'
            }}>
              {(effectiveUser.user_metadata?.full_name || effectiveUser.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {effectiveUser.user_metadata?.full_name || effectiveUser.email}
              </div>
              <div style={{ fontSize: '0.7rem', color: isAdmin ? 'var(--tp)' : '#64748b' }}>
                {isAdmin ? '👑 מנהל' : '✅ משתתף'}
              </div>
            </div>
            <button onClick={handleLogout} title="התנתק" style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              cursor: 'pointer', color: '#ef4444', padding: '5px 10px', borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', fontFamily: 'inherit'
            }}>
              <LogOut style={{ width: '13px', height: '13px' }} /> התנתק
            </button>
          </div>
        ) : (
          <button
            onClick={() => window.location.href = '/login'}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: '8px',
              background: 'var(--tp-10)', border: '1px solid var(--tp-30)',
              color: 'var(--tp)', fontSize: '0.9rem', fontWeight: '600',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              fontFamily: 'inherit'
            }}
          >
            <Shield style={{ width: '15px', height: '15px' }} /> התחבר / הירשם
          </button>
        )}
      </div>
    </div>
  );

  if (loading || gamesLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8', fontFamily: 'Rubik, Heebo, sans-serif' }}>טוען...</div>;
  }

  return (
    <div dir="rtl" style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)', fontFamily: "'Rubik', 'Heebo', sans-serif" }}>

      {/* DESKTOP SIDEBAR */}
      <div style={{
        width: '230px', flexShrink: 0,
        background: 'var(--sidebar, rgba(10,12,26,0.98))',
        borderLeft: '1px solid var(--tp-15)',
        position: 'sticky', top: 0, height: '100vh',
        overflowY: 'auto', display: 'flex', flexDirection: 'column', zIndex: 40,
      }} className="desktop-sidebar">
        <SidebarContent onItemClick={null} />
      </div>

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 49, backdropFilter: 'blur(2px)'
        }} />
      )}

      {/* MOBILE SIDEBAR */}
      <div style={{
        position: 'fixed', top: 0,
        right: sidebarOpen ? 0 : '-250px',
        width: '250px', height: '100vh',
        background: 'var(--sidebar, rgba(10,12,26,0.99))',
        borderLeft: '1px solid var(--tp-20)',
        zIndex: 50, transition: 'right 0.25s ease',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }} className="mobile-sidebar">
        <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '12px 12px 0' }}>
          <button onClick={() => setSidebarOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>
        <SidebarContent onItemClick={() => setSidebarOpen(false)} />
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Mobile topbar */}
        <div style={{
          display: 'none', padding: '10px 16px',
          background: 'var(--sidebar, rgba(10,12,26,0.98))',
          borderBottom: '1px solid var(--tp-15)',
          alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 30,
        }} className="mobile-topbar">
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
            <Menu style={{ width: '22px', height: '22px' }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src={currentGame?.game_icon || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909e559d350b14a5fc224bb/755e92965_2025-11-06120813.png"}
              alt="logo" style={{ width: '38px', height: '38px', objectFit: 'contain', borderRadius: '6px' }}
            />
            <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#f1f5f9' }}>
              {currentGame?.game_name || 'טוטו ליגת אלופות'}
            </span>
          </div>
          <div style={{ width: '30px' }} />
        </div>

        {/* Route guard + תוכן */}
        <RouteGuard currentUser={effectiveUser} isAdmin={isAdmin} loading={loading || gamesLoading}>
          <main style={{ flex: 1 }}>
            {children}
          </main>
        </RouteGuard>
      </div>

      <UploadStatusIndicator />

      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent style={{ background: 'linear-gradient(135deg, var(--bg3) 0%, var(--bg1) 100%)', border: '1px solid var(--tp-30)' }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--tp)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield style={{ width: '20px', height: '20px' }} /> התחברות מנהל
            </DialogTitle>
            <DialogDescription style={{ color: '#94a3b8' }}>הזן את סיסמת המנהל</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAdminLogin()} placeholder="סיסמה..."
              style={{ background: 'var(--bg1)', borderColor: 'var(--tp-30)', color: '#f8fafc' }} />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => { setShowAdminDialog(false); setAdminPassword(""); }}
                style={{ borderColor: 'var(--tp-30)', color: '#94a3b8', background: 'transparent' }}>ביטול</Button>
              <Button onClick={handleAdminLogin} style={{ background: 'linear-gradient(135deg, var(--tp), var(--tp))', color: 'white' }}>התחבר כמנהל</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── בוחר THEME ───────────────────────────────────────────────────────────────
function ThemePicker() {
  const { themeId, setTheme, allThemes } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          padding: '6px 6px', borderRadius: '8px',
        }}
      >
        <span style={{ fontSize: '0.72rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>🎨 ערכת נושא</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--tp)' }}>{allThemes[themeId]?.name}</span>
      </button>

      {open && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {Object.values(allThemes).map(t => (
            <button
              key={t.id}
              onClick={() => { setTheme(t.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '7px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: themeId === t.id ? `rgba(${t.r},${t.g},${t.b},0.15)` : 'transparent',
                outline: themeId === t.id ? `1px solid rgba(${t.r},${t.g},${t.b},0.5)` : 'none',
                fontFamily: 'inherit', transition: 'all 0.12s',
              }}
            >
              <span style={{
                width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
                background: t.primary, boxShadow: `0 0 6px ${t.primary}`,
              }} />
              <span style={{ fontSize: '0.85rem', color: themeId === t.id ? t.primary : '#94a3b8', fontWeight: themeId === t.id ? '700' : '400' }}>
                {t.name}
              </span>
              {themeId === t.id && <span style={{ marginRight: 'auto', fontSize: '0.75rem', color: t.primary }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider>
      <UploadStatusProvider>
        <GameProvider>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800;900&family=Heebo:wght@300;400;500;700;900&display=swap');
            *, *::before, *::after { font-family: 'Rubik', 'Heebo', sans-serif !important; }

            /* ── Reset ──────────────────────────────────────────── */
            html, body { margin: 0; padding: 0; width: 100%; min-height: 100vh; }
            html, body, #root {
              background: var(--bg1, #0a0f1e) !important;
              color: #f1f5f9;
              transition: background 0.35s ease;
            }
            #root { min-height: 100vh; }

            /* ── Scrollbar ──────────────────────────────────────── */
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: var(--bg2, #111827); }
            ::-webkit-scrollbar-thumb {
              background: linear-gradient(180deg, var(--tp, #06b6d4), var(--tp-dark, #0891b2));
              border-radius: 3px;
            }

            /* ── Responsive sidebar ─────────────────────────────── */
            @media (max-width: 768px) {
              .desktop-sidebar { display: none !important; }
              .mobile-topbar   { display: flex !important; }
            }
            @media (min-width: 769px) {
              .mobile-sidebar  { display: none !important; }
              .mobile-topbar   { display: none !important; }
            }

            /* ── Navigation ─────────────────────────────────────── */
            .nav-item:hover { background: var(--tp-10) !important; color: #e2e8f0 !important; }
            .neon-border { border: 1px solid var(--tp-30); box-shadow: var(--tp-glow); }

            /* ── Table headers ──────────────────────────────────── */
            thead tr th, thead tr td { background: var(--bg2, #111827) !important; }

            /* ── Inputs / Selects ───────────────────────────────── */
            input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
            select, textarea {
              background: rgba(var(--bg1-rgb, 10,15,30), 0.85) !important;
              border-color: var(--tp-22, var(--tp-20)) !important;
              color: #f1f5f9 !important;
              transition: background 0.35s, border-color 0.35s;
            }
            input:focus, select:focus, textarea:focus {
              border-color: var(--tp-50) !important;
              box-shadow: 0 0 0 2px var(--tp-15) !important;
              outline: none !important;
            }

            /* ── Radix Select dropdown ──────────────────────────── */
            [data-radix-select-viewport],
            [data-radix-popper-content-wrapper] > div {
              background: var(--bg2, #111827) !important;
              border: 1px solid var(--tp-25) !important;
            }
            [role="option"]:hover,
            [data-highlighted] {
              background: var(--tp-15) !important;
              color: #fff !important;
            }

            /* ── shadcn Card override ───────────────────────────── */
            /* shadcn Card uses bg-card class → --card CSS var */
            /* We override --card in ThemeContext, so this is a safety net */
            .bg-card { background: hsl(var(--card)) !important; }
            .border-border { border-color: hsl(var(--border)) !important; }

            /* ── Hover tints ────────────────────────────────────── */
            .hover\\:bg-cyan-900\\/20:hover,
            .hover\\:bg-cyan-500\\/10:hover { background: var(--tp-10) !important; }
            .hover\\:border-cyan-700\\/50:hover { border-color: var(--tp-50) !important; }

            /* ── text-cyan-* utility override ──────────────────── */
            .text-cyan-400 { color: var(--tp) !important; }
            .text-cyan-300 { color: var(--tp) !important; opacity: 0.85; }
            .text-cyan-200 { color: var(--tp) !important; opacity: 0.70; }
            .border-cyan-400 { border-color: var(--tp) !important; }
            .border-cyan-700\\/50 { border-color: var(--tp-50) !important; }

            /* ── Badge border-cyan ──────────────────────────────── */
            .border-cyan-400.text-cyan-200 {
              border-color: var(--tp-50) !important;
              color: var(--tp) !important;
            }
          `}</style>
          <LayoutContent currentPageName={currentPageName}>
            {children}
          </LayoutContent>
        </GameProvider>
      </UploadStatusProvider>
    </ThemeProvider>
  );
}
