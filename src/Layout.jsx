import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Trophy,
  Users,
  FileText,
  BarChart3,
  Database,
  Award,
  PieChart,
  LogOut,
  User as UserIcon,
  Shield,
  Edit,
  Menu,
  X,
  ChevronDown,
  Layers
} from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import * as db from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { UploadStatusProvider } from '@/components/contexts/UploadStatusContext';
import { GameProvider, useGame } from '@/components/contexts/GameContext';
import UploadStatusIndicator from '@/components/layout/UploadStatusIndicator';
import { useToast } from "@/components/ui/use-toast";

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();

  const { currentGame, games, selectGame, loading: gamesLoading, currentParticipant, currentUser: gameContextUser } = useGame();

  const guestNavigationItems = [
    {
      title: "טבלת דירוג",
      url: createPageUrl("LeaderboardNew") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: Award,
      roles: ["guest"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "צפייה בניחושים",
      url: createPageUrl("ViewSubmissions") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: Users,
      roles: ["guest"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "תוצאות אמת",
      url: createPageUrl("AdminResults") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: BarChart3,
      roles: ["guest"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "סטטיסטיקות",
      url: createPageUrl("Statistics") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: PieChart,
      roles: ["guest"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "מילוי ניחושים",
      url: createPageUrl("PredictionForm") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: FileText,
      roles: ["guest"],
      disabled: !currentGame,
      requireAuth: true,
      group: "main"
    }
  ];

  const allNavigationItems = [
    {
      title: "טבלת דירוג",
      url: createPageUrl("LeaderboardNew") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: Award,
      roles: ["admin", "predictor", "viewer"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "מילוי ניחושים",
      url: createPageUrl("PredictionForm") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: FileText,
      roles: ["admin", "predictor"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "צפייה בניחושים",
      url: createPageUrl("ViewSubmissions") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: Users,
      roles: ["admin", "predictor", "viewer"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "תוצאות אמת",
      url: createPageUrl("AdminResults") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: BarChart3,
      roles: ["admin", "predictor", "viewer"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "סטטיסטיקות",
      url: createPageUrl("Statistics") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: PieChart,
      roles: ["admin", "predictor", "viewer"],
      disabled: !currentGame,
      group: "main"
    },
    {
      title: "ניהול משתתפים",
      url: createPageUrl("ManageGameParticipants"),
      icon: Users,
      roles: ["admin"],
      disabled: !currentGame,
      group: "admin"
    },
    {
      title: "ניהול משתמשים",
      url: createPageUrl("UserManagement"),
      icon: Shield,
      roles: ["admin"],
      group: "admin"
    },
    {
      title: "בניית שאלון",
      url: createPageUrl("FormBuilder") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: FileText,
      roles: ["admin"],
      disabled: !currentGame,
      group: "admin"
    },
    {
      title: "סקירת מערכת",
      url: createPageUrl("SystemOverview"),
      icon: Database,
      roles: ["admin"],
      group: "admin"
    },
  ];

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data.user);
      setCurrentUser(user);
    } catch (error) {
      setCurrentUser(null);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setCurrentUser(null);
      window.location.href = createPageUrl("LeaderboardNew");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleAdminLogin = async () => {
    if (adminPassword === "champ11") {
      try {
        if (!currentUser) {
          window.location.href = '/login';
          return;
        }
        await supabase.auth.updateUser({ role: "admin" });
        const updatedUser = await supabase.auth.getUser().then(r => r.data.user);
        setCurrentUser(updatedUser);
        setShowAdminDialog(false);
        setAdminPassword("");
        toast({ title: "התחברת כמנהל!", description: "כעת יש לך גישה מלאה למערכת", className: "bg-green-100 text-green-800", duration: 2000 });
      } catch (error) {
        toast({ title: "שגיאה", description: "לא ניתן לעדכן הרשאות", variant: "destructive", duration: 2000 });
      }
    } else {
      toast({ title: "סיסמה שגויה", description: "אנא נסה שוב", variant: "destructive", duration: 2000 });
      setAdminPassword("");
    }
  };

  const effectiveUser = gameContextUser || currentUser;
  const supabaseRole = effectiveUser?.role || effectiveUser?.user_metadata?.role || null;
  let userRole = supabaseRole || (effectiveUser ? "predictor" : "guest");
  if (effectiveUser && supabaseRole !== "admin" && currentParticipant) {
    userRole = currentParticipant.role_in_game;
  }
  const isAdmin = supabaseRole === "admin";
  const navigationItems = effectiveUser
    ? allNavigationItems.filter(item => item.roles.includes(userRole))
    : guestNavigationItems;

  const mainItems = navigationItems.filter(i => i.group === "main");
  const adminItems = navigationItems.filter(i => i.group === "admin");

  const isActive = (url) => {
    const path = url.split('?')[0];
    return window.location.pathname.includes(path);
  };

  const NavItem = ({ item, onClick }) => {
    const active = isActive(item.url);
    return (
      <Link
        to={item.disabled ? '#' : item.url}
        onClick={(e) => {
          if (item.disabled) {
            e.preventDefault();
            toast({ title: "בחר משחק", description: "נא לבחור משחק תחילה", variant: "destructive", duration: 2000 });
          } else if (item.requireAuth && !currentUser) {
            e.preventDefault();
            window.location.href = '/login';
          }
          if (onClick) onClick();
        }}
        className="nav-item"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '9px 12px',
          borderRadius: '10px',
          fontSize: '0.875rem',
          fontWeight: active ? '600' : '400',
          color: item.disabled ? '#475569' : active ? '#38bdf8' : '#94a3b8',
          background: active ? 'rgba(56,189,248,0.1)' : 'transparent',
          borderRight: active ? '3px solid #38bdf8' : '3px solid transparent',
          textDecoration: 'none',
          transition: 'all 0.15s',
          cursor: item.disabled ? 'not-allowed' : 'pointer',
          opacity: item.disabled ? 0.5 : 1,
          marginBottom: '2px',
        }}
      >
        <item.icon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{item.title}</span>
      </Link>
    );
  };

  const SidebarContent = ({ onItemClick }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(56,189,248,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={currentGame?.game_icon || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909e559d350b14a5fc224bb/755e92965_2025-11-06120813.png"}
            alt="logo"
            style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '8px' }}
          />
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#f1f5f9', lineHeight: 1.2 }}>
              טוטו ל"א
            </div>
            <div style={{ fontSize: '0.65rem', color: '#38bdf8' }}>2025-2026</div>
          </div>
        </div>
      </div>

      {/* Game selector */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(56,189,248,0.1)', background: 'rgba(56,189,248,0.04)' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#38bdf8', marginBottom: '6px' }}>
          🎮 משחק פעיל
        </div>
        <Select
          value={currentGame?.id || ''}
          onValueChange={(gameId) => {
            const game = games.find(g => g.id === gameId);
            if (game) selectGame(game);
          }}
          disabled={gamesLoading || games.length === 0}
        >
          <SelectTrigger style={{
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(56,189,248,0.2)',
            color: '#f1f5f9',
            fontSize: '0.8rem',
            fontWeight: '600',
            height: '34px',
            borderRadius: '8px',
          }}>
            <SelectValue placeholder="בחר משחק">
              {currentGame ? currentGame.game_name : "בחר משחק"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent style={{ background: '#1e293b', border: '1px solid rgba(56,189,248,0.3)', color: '#f1f5f9', zIndex: 9999 }}>
            {games.map(game => (
              <SelectItem key={game.id} value={game.id} style={{ color: '#f1f5f9' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.82rem' }}>{game.game_name}</div>
                  {game.game_subtitle && <div style={{ fontSize: '0.65rem', color: '#38bdf8' }}>{game.game_subtitle}</div>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && currentGame && (
          <Link to={createPageUrl("CreateGame")} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.65rem', color: '#64748b', textDecoration: 'none' }}>
            <Edit style={{ width: '10px', height: '10px' }} /> ערוך משחק
          </Link>
        )}
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {mainItems.length > 0 && (
          <>
            <div style={{ fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569', padding: '0 8px', marginBottom: '6px' }}>
              ראשי
            </div>
            {mainItems.map(item => <NavItem key={item.title} item={item} onClick={onItemClick} />)}
          </>
        )}
        {adminItems.length > 0 && (
          <>
            <div style={{ fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569', padding: '0 8px', marginTop: '16px', marginBottom: '6px' }}>
              ניהול
            </div>
            {adminItems.map(item => <NavItem key={item.title} item={item} onClick={onItemClick} />)}
          </>
        )}
      </div>

      {/* User */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(56,189,248,0.15)' }}>
        {effectiveUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: '800', color: 'white'
            }}>
              {(effectiveUser.user_metadata?.full_name || effectiveUser.email || '?')[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {effectiveUser.user_metadata?.full_name || effectiveUser.email}
              </div>
              <div style={{ fontSize: '0.65rem', color: isAdmin ? '#38bdf8' : '#64748b' }}>
                {isAdmin ? '👑 מנהל' : 'משתתף'}
              </div>
            </div>
            <button onClick={handleLogout} title="התנתק" style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#475569', padding: '4px', borderRadius: '6px'
            }}>
              <LogOut style={{ width: '14px', height: '14px' }} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => window.location.href = '/login'}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)',
              color: '#38bdf8', fontSize: '0.8rem', fontWeight: '600',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              fontFamily: 'inherit'
            }}
          >
            <Shield style={{ width: '14px', height: '14px' }} />
            התחבר / הירשם
          </button>
        )}
      </div>
    </div>
  );

  if (loading || gamesLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8', fontFamily: 'Rubik, Heebo, sans-serif' }}>טוען...</div>;
  }

  return (
    <div dir="rtl" style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(135deg, #0a0f1e 0%, #111827 50%, #0a0f1e 100%)', fontFamily: "'Rubik', 'Heebo', sans-serif" }}>

      {/* ===== DESKTOP SIDEBAR ===== */}
      <div style={{
        width: '220px',
        flexShrink: 0,
        background: 'rgba(17, 24, 39, 0.98)',
        borderLeft: '1px solid rgba(56,189,248,0.15)',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
      }} className="desktop-sidebar">
        <SidebarContent onItemClick={null} />
      </div>

      {/* ===== MOBILE OVERLAY ===== */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 49, backdropFilter: 'blur(2px)'
          }}
        />
      )}

      {/* ===== MOBILE SIDEBAR ===== */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: sidebarOpen ? 0 : '-240px',
        width: '240px',
        height: '100vh',
        background: 'rgba(17, 24, 39, 0.99)',
        borderLeft: '1px solid rgba(56,189,248,0.2)',
        zIndex: 50,
        transition: 'right 0.25s ease',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }} className="mobile-sidebar">
        <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '12px 12px 0' }}>
          <button onClick={() => setSidebarOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>
        <SidebarContent onItemClick={() => setSidebarOpen(false)} />
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Mobile topbar */}
        <div style={{
          display: 'none',
          padding: '10px 16px',
          background: 'rgba(17,24,39,0.98)',
          borderBottom: '1px solid rgba(56,189,248,0.15)',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }} className="mobile-topbar">
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
            <Menu style={{ width: '22px', height: '22px' }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src={currentGame?.game_icon || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909e559d350b14a5fc224bb/755e92965_2025-11-06120813.png"}
              alt="logo"
              style={{ width: '28px', height: '28px', objectFit: 'contain' }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#f1f5f9' }}>
              {currentGame?.game_name || 'טוטו ל"א'}
            </span>
          </div>
          <div style={{ width: '30px' }} />
        </div>

        {/* Page content */}
        <main style={{ flex: 1 }}>
          {children}
        </main>
      </div>

      <UploadStatusIndicator />

      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(6,182,212,0.3)' }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield style={{ width: '20px', height: '20px' }} /> התחברות מנהל
            </DialogTitle>
            <DialogDescription style={{ color: '#94a3b8' }}>הזן את סיסמת המנהל</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()} placeholder="סיסמה..." style={{ background: '#0f172a', borderColor: 'rgba(6,182,212,0.3)', color: '#f8fafc' }} />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => { setShowAdminDialog(false); setAdminPassword(""); }} style={{ borderColor: 'rgba(6,182,212,0.3)', color: '#94a3b8', background: 'transparent' }}>ביטול</Button>
              <Button onClick={handleAdminLogin} style={{ background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: 'white' }}>התחבר כמנהל</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <UploadStatusProvider>
      <GameProvider>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800;900&family=Heebo:wght@300;400;500;700;900&display=swap');

          *, *::before, *::after {
            font-family: 'Rubik', 'Heebo', sans-serif !important;
          }

          :root {
            --primary-bg: #0a0f1e;
            --secondary-bg: #111827;
            --card-bg: #1a2236;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --accent-cyan: #38bdf8;
            --accent-blue: #3b82f6;
            --accent-purple: #8b5cf6;
            --border-color: rgba(56,189,248,0.15);
          }

          html, body {
            margin: 0; padding: 0; width: 100%; min-height: 100vh;
            background: #0a0f1e; color: var(--text-primary);
          }

          #root { width: 100%; min-height: 100vh; }

          /* Scrollbar */
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: #111827; }
          ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #38bdf8, #3b82f6); border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: #38bdf8; }

          /* Sidebar responsive */
          @media (max-width: 768px) {
            .desktop-sidebar { display: none !important; }
            .mobile-topbar { display: flex !important; }
          }
          @media (min-width: 769px) {
            .mobile-sidebar { display: none !important; }
            .mobile-topbar { display: none !important; }
          }

          /* Nav item hover */
          .nav-item:hover {
            background: rgba(56,189,248,0.07) !important;
            color: #e2e8f0 !important;
          }

          .neon-border { border: 1px solid rgba(56,189,248,0.3); box-shadow: 0 0 10px rgba(56,189,248,0.15); }
          .crypto-card { background: linear-gradient(135deg, #1a2236 0%, #0a0f1e 100%); border: 1px solid rgba(56,189,248,0.15); border-radius: 8px; }
        `}</style>
        <LayoutContent currentPageName={currentPageName}>
          {children}
        </LayoutContent>
      </GameProvider>
    </UploadStatusProvider>
  );
}
