import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Users, FileText, BarChart3, Database, Award, PieChart, Trophy,
  LogOut, Shield, Edit, Upload, Lock, X, Sun, Moon, Pencil, Check, Wand2
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
  YossiCup: 'public',  Simulator: 'public',
};

function getPageName(pathname) {
  const map = {
    'leaderboard':'LeaderboardNew','view-submissions':'ViewSubmissions',
    'admin-results':'AdminResults','statistics':'Statistics',
    'prediction-form':'PredictionForm','join-game':'JoinGame',
    'admin-import':'AdminImport','manage-game':'ManageGameParticipants',
    'user-management':'UserManagement','form-builder':'FormBuilder',
    'system-overview':'SystemOverview','create-game':'CreateGame',
    'yossi-cup':'YossiCup','simulator':'Simulator',
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
      <button className="lm-darkmode-btn" onClick={() => setIsDark(!isDark)} title={isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה'}>
        <span className="lm-darkmode-track">
          <span className={`lm-darkmode-knob${isDark ? '' : ' light'}`}>
            {isDark ? <Moon size={11}/> : <Sun size={11}/>}
          </span>
        </span>
        <span className="lm-darkmode-label">{isDark ? 'מצב כהה' : 'מצב בהיר'}</span>
      </button>
      <button className="lm-theme-trigger" onClick={() => setOpen(o => !o)}>
        <div className="lm-theme-dots">
          {allThemes[themeId]?.previewColors?.map((c, i) => (
            <span key={i} style={{ background: c, width:10, height:10, borderRadius:'50%', display:'inline-block' }}/>
          ))}
        </div>
        <span className="lm-theme-name-current">{allThemes[themeId]?.emoji} {allThemes[themeId]?.nameHe}</span>
        <span className="lm-theme-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="lm-theme-panel">
          {Object.values(allThemes).map(t => {
            const active = themeId === t.id;
            const palette = isDark ? t.dark : t.light;
            return (
              <button key={t.id} onClick={() => { setTheme(t.id); setOpen(false); }}
                className={`lm-theme-card${active ? ' active' : ''}`}
                style={active ? { border: `1px solid ${palette?.tp || 'var(--tp)'}`, background: `rgba(${palette?.r||0},${palette?.g||0},${palette?.b||0},0.12)` } : {}}>
                <div className="lm-theme-strip">
                  {t.previewColors?.map((c, i) => <span key={i} style={{ flex:1, background:c, height:'100%' }}/>)}
                </div>
                <div className="lm-theme-card-info">
                  <span className="lm-theme-card-emoji">{t.emoji}</span>
                  <span className="lm-theme-card-name" style={{ fontFamily: t.font }}>{t.nameHe}</span>
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
  // ✅ עריכת שם משתמש
  const [editingName,     setEditingName    ] = useState(false);
  const [newName,         setNewName        ] = useState('');

  const { toast } = useToast();
  const location  = useLocation();

  const { currentGame, games, selectGame, loading: gamesLoading, currentUser: gameContextUser, currentParticipant } = useGame();

  const g = currentGame ? `?gameId=${currentGame.id}` : '';

  const publicItems = [
    { title:"טבלת דירוג",     short:"דירוג",   url:createPageUrl("LeaderboardNew")  + g, icon:Award,    group:"main" },
    { title:"🏆 גביע יוסי",   short:"גביע יוסי",url:createPageUrl("YossiCup")       + g, icon:Trophy,   group:"main" },
    { title:"צפייה בניחושים", short:"ניחושים", url:createPageUrl("ViewSubmissions") + g, icon:Users,    group:"main" },
    { title:"תוצאות אמת",     short:"תוצאות",  url:createPageUrl("AdminResults")    + g, icon:BarChart3,group:"main" },
    { title:"סטטיסטיקות",     short:"סטטיסטיקה",url:createPageUrl("Statistics")      + g, icon:PieChart, group:"main" },
    { title:"🎮 סימולטור",     short:"סימולטור", url:createPageUrl("Simulator")       + g, icon:Wand2,    group:"main" },
  ];
  const userItems = [
    { title:"מילוי ניחושים",  short:"מילוי",   url:createPageUrl("PredictionForm")  + g, icon:FileText, group:"main" },
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

  // ✅ שמירת שם משתמש חדש
  const handleSaveName = async () => {
    if (!newName.trim()) return;
    try {
      await supabase.auth.updateUser({ data: { full_name: newName.trim() } });
      if (currentUser?.email) {
        await supabase.from('game_participants')
          .update({ participant_name: newName.trim() })
          .eq('user_email', currentUser.email);
      }
      toast({ title: "השם עודכן!", className: "bg-green-900/30 border-green-500 text-green-200", duration: 2000 });
      setEditingName(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast({ title: "שגיאה", description: "עדכון השם נכשל", variant: "destructive" });
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
          if (item.disabled) {
            e.preventDefault();
            toast({ title:"בחר משחק", description:"נא לבחור משחק תחילה", variant:"destructive", duration:2000 });
          }
          if (onClick) onClick();
        }}
        className={`lm-nav-item${active?' active':''}${item.disabled?' disabled':''}`}
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      >
        <span className="lm-nav-icon"><item.icon size={20}/></span>
        <span className="lm-nav-label">{item.title}</span>
        {active && <span className="lm-nav-bar"/>}
      </Link>
    );
  };

  const SidebarInner = ({ onItemClick }) => (
    <div className="lm-sidebar-inner">
      {/* ── Logo ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'14px', padding:'20px 16px 14px' }}>
        {currentGame?.game_icon ? (
          <div style={{position:'relative', flexShrink:0}}>
            <img src={currentGame.game_icon} alt={currentGame.game_name}
              style={{ width:'130px', height:'130px', objectFit:'contain', borderRadius:'16px', border:'1px solid var(--tp-20)', display:'block' }}/>
            <div style={{ position:'absolute', inset:'-10px', borderRadius:'24px', background:'radial-gradient(circle, var(--tp-18) 0%, transparent 70%)', pointerEvents:'none' }}/>
          </div>
        ) : (
          <div style={{ width:'130px', height:'130px', borderRadius:'16px', flexShrink:0, border:'1px dashed var(--tp-25)', background:'var(--tp-05)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'48px' }}>⚽</div>
        )}
        <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:'6px'}}>
          {currentGame ? (
            <>
              <div style={{ fontSize:'1.05rem', fontWeight:900, color:'var(--text)', lineHeight:1.3, wordBreak:'break-word' }}>{currentGame.game_name}</div>
              {currentGame.game_subtitle && (
                <div style={{ fontSize:'1rem', fontWeight:800, color:'var(--tp)', lineHeight:1.2, wordBreak:'break-word' }}>{currentGame.game_subtitle}</div>
              )}
            </>
          ) : (
            <div style={{fontSize:'1rem', fontWeight:500, color:'var(--text-muted)'}}>בחר משחק</div>
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
        <Select value={currentGame?.id || ''} onValueChange={gameId => { const gx=games.find(x=>x.id===gameId); if(gx) selectGame(gx); }} disabled={gamesLoading || games.length===0}>
          <SelectTrigger className="lm-select-trigger">
            <SelectValue placeholder="בחר משחק">
              {currentGame ? (
                <div style={{textAlign:'right',lineHeight:'1.2'}}>
                  <div style={{fontWeight:700,fontSize:'0.82rem'}}>{currentGame.game_name}</div>
                  {currentGame.game_subtitle && <div style={{fontSize:'0.7rem',color:'var(--tp)',opacity:0.85,marginTop:'1px'}}>{currentGame.game_subtitle}</div>}
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
        {isAdmin && (
          <Link to={createPageUrl("CreateGame")} className="lm-edit-game">
            <Edit size={13}/> ערוך / הוסף משחק
          </Link>
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
              {(currentParticipant?.participant_name || effectiveUser.user_metadata?.full_name || effectiveUser.email || '?')[0].toUpperCase()}
            </div>
            {/* ✅ שם + עריכה */}
            <div className="lm-user-info-block" style={{flex:1,minWidth:0}}>
              {editingName ? (
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')handleSaveName();if(e.key==='Escape')setEditingName(false);}}
                    style={{background:'rgba(0,0,0,0.4)',border:'1px solid var(--tp-50)',borderRadius:6,padding:'2px 6px',color:'#f8fafc',fontSize:'0.78rem',width:'100%',outline:'none'}}
                  />
                  <button onClick={handleSaveName} style={{color:'#10b981',background:'none',border:'none',cursor:'pointer',padding:2,flexShrink:0}}><Check size={14}/></button>
                  <button onClick={()=>setEditingName(false)} style={{color:'#ef4444',background:'none',border:'none',cursor:'pointer',padding:2,flexShrink:0}}><X size={14}/></button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <div className="lm-user-name" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentParticipant?.participant_name || effectiveUser.user_metadata?.full_name || effectiveUser.email}</div>
                  <button onClick={()=>{setNewName(effectiveUser.user_metadata?.full_name||'');setEditingName(true);}} style={{color:'#475569',background:'none',border:'none',cursor:'pointer',padding:2,flexShrink:0}} title="ערוך שם"><Pencil size={12}/></button>
                </div>
              )}
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
      {/* ── Desktop sidebar ── */}
      <aside className="lm-sidebar desktop-sidebar"><SidebarInner onItemClick={null}/></aside>

      {/* ── Mobile overlay ── */}
      <div className={`lm-overlay${sidebarOpen?' visible':''}`} onClick={()=>setSidebarOpen(false)} aria-hidden="true"/>

      {/* ── Mobile drawer ── */}
      <aside className={`lm-sidebar lm-sidebar--mobile mobile-sidebar${sidebarOpen?' open':''}`}>
        <button onClick={()=>setSidebarOpen(false)} className="lm-close-btn"><X size={22}/></button>
        <div style={{padding:'60px 12px 16px'}}>
          {/* Game info */}
          {currentGame && (
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 8px',marginBottom:16,background:'var(--tp-10)',borderRadius:12,border:'1px solid var(--tp-20)'}}>
              {currentGame.game_icon && <img src={currentGame.game_icon} alt="" style={{width:48,height:48,borderRadius:10,objectFit:'contain'}}/>}
              <div>
                <div style={{fontWeight:800,fontSize:'0.95rem',color:'var(--text)'}}>{currentGame.game_name}</div>
                {currentGame.game_subtitle && <div style={{fontSize:'0.82rem',color:'var(--tp)',fontWeight:700}}>{currentGame.game_subtitle}</div>}
              </div>
            </div>
          )}
          {/* Game switcher */}
          {games.length > 1 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:'0.7rem',fontWeight:700,color:'#475569',marginBottom:6,letterSpacing:'0.08em'}}>החלפת משחק</div>
              {games.map(game=>(
                <button key={game.id} onClick={()=>{selectGame(game);setSidebarOpen(false);}} style={{
                  display:'flex',alignItems:'center',gap:10,width:'100%',
                  padding:'10px 12px',borderRadius:10,marginBottom:4,cursor:'pointer',
                  background:currentGame?.id===game.id?'var(--tp-15)':'rgba(30,41,59,0.5)',
                  border:`1px solid ${currentGame?.id===game.id?'var(--tp)':'rgba(71,85,105,0.3)'}`,
                  color:currentGame?.id===game.id?'var(--tp)':'var(--text)',
                  fontFamily:'Rubik,Heebo,sans-serif',textAlign:'right',
                }}>
                  {game.game_icon && <img src={game.game_icon} alt="" style={{width:32,height:32,borderRadius:8,objectFit:'contain',flexShrink:0}}/>}
                  <div style={{flex:1,textAlign:'right'}}>
                    <div style={{fontWeight:700,fontSize:'0.85rem'}}>{game.game_name}</div>
                    {game.game_subtitle && <div style={{fontSize:'0.75rem',opacity:0.8}}>{game.game_subtitle}</div>}
                  </div>
                  {currentGame?.id===game.id && <span style={{color:'var(--tp)',fontSize:'1rem'}}>✓</span>}
                </button>
              ))}
            </div>
          )}
          {/* Admin items */}
          {isAdmin && (
            <div>
              <div style={{fontSize:'0.7rem',fontWeight:700,color:'#475569',marginBottom:6,letterSpacing:'0.08em'}}>ניהול</div>
              {adminNav.map(item=>(
                <NavItem key={item.title} item={item} onClick={()=>setSidebarOpen(false)}/>
              ))}
            </div>
          )}
          {/* ✅ Login / logout + name edit */}
          <div style={{marginTop:16,borderTop:'1px solid var(--tp-10)',paddingTop:16}}>
            {effectiveUser ? (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {/* כרטיס משתמש עם עריכת שם */}
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--tp-08)',borderRadius:10,border:'1px solid var(--tp-15)'}}>
                  <div style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,var(--tp),#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color:'white',fontSize:'0.9rem',flexShrink:0}}>
                    {(currentParticipant?.participant_name||effectiveUser.user_metadata?.full_name||effectiveUser.email||'?')[0].toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    {editingName ? (
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter'){handleSaveName();setSidebarOpen(false);}if(e.key==='Escape')setEditingName(false);}}
                          style={{background:'rgba(0,0,0,0.4)',border:'1px solid var(--tp-50)',borderRadius:6,padding:'4px 8px',color:'#f8fafc',fontSize:'0.9rem',width:'100%',outline:'none',minHeight:'unset'}}
                        />
                        <button onClick={()=>{handleSaveName();setSidebarOpen(false);}} style={{color:'#10b981',background:'none',border:'none',cursor:'pointer',flexShrink:0}}><Check size={16}/></button>
                        <button onClick={()=>setEditingName(false)} style={{color:'#ef4444',background:'none',border:'none',cursor:'pointer',flexShrink:0}}><X size={16}/></button>
                      </div>
                    ) : (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontWeight:600,fontSize:'0.9rem',color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {currentParticipant?.participant_name||effectiveUser.user_metadata?.full_name||effectiveUser.email}
                        </span>
                        <button onClick={()=>{setNewName(effectiveUser.user_metadata?.full_name||'');setEditingName(true);}}
                          style={{color:'#475569',background:'none',border:'none',cursor:'pointer',flexShrink:0,padding:2}} title="ערוך שם">
                          <Pencil size={14}/>
                        </button>
                      </div>
                    )}
                    <div style={{fontSize:'0.72rem',color:isAdmin?'var(--tp)':'#64748b',marginTop:2}}>
                      {isAdmin?'👑 מנהל':'✅ משתתף'}
                    </div>
                  </div>
                </div>
                <button onClick={handleLogout} style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'12px',borderRadius:10,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',color:'#ef4444',cursor:'pointer',fontFamily:'Rubik,Heebo,sans-serif',fontSize:'0.9rem'}}>
                  <LogOut size={18}/> התנתקות
                </button>
              </div>
            ) : (
              /* ✅ כניסה רגילה — לא רק מנהל */
              <button onClick={()=>{window.location.href='/login';setSidebarOpen(false);}} style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'12px',borderRadius:10,background:'var(--tp-10)',border:'1px solid var(--tp-25)',color:'var(--tp)',cursor:'pointer',fontFamily:'Rubik,Heebo,sans-serif',fontSize:'0.9rem'}}>
                <Shield size={18}/> התחבר / הירשם
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="lm-main" key={currentGame?.id || 'no-game'}>
        {/* ── Mobile top bar ── */}
        <header className="lm-topbar mobile-topbar">
          <button onClick={()=>setSidebarOpen(s=>!s)} style={{
            display:'flex', alignItems:'center', gap:14, flex:1,
            background:'none', border:'none', cursor:'pointer',
            padding:'0', height:'100%', textAlign:'right',
            WebkitTapHighlightColor:'transparent', touchAction:'manipulation',
          }}>
            {currentGame?.game_icon ? (
              <img src={currentGame.game_icon} alt="" style={{ width:58, height:58, borderRadius:12, objectFit:'contain', flexShrink:0, border:'2px solid var(--tp-30)' }}/>
            ) : (
              <div style={{ width:58, height:58, borderRadius:12, flexShrink:0, background:'var(--tp-10)', border:'2px dashed var(--tp-25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem' }}>⚽</div>
            )}
            <div style={{flex:1, minWidth:0, textAlign:'right'}}>
              <div style={{ fontWeight:900, fontSize:'1.25rem', color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.2 }}>
                {currentGame?.game_name || 'המישק'}
              </div>
              {currentGame?.game_subtitle && (
                <div style={{fontSize:'1rem', fontWeight:700, color:'var(--tp)', marginTop:2}}>{currentGame.game_subtitle}</div>
              )}
            </div>
            <div style={{ flexShrink:0, width:46, height:46, borderRadius:10, background:'var(--tp-12)', border:'1px solid var(--tp-25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="22" height="16" viewBox="0 0 22 16" fill="currentColor" style={{color:'var(--tp)'}}>
                <rect x="0" y="0"  width="22" height="2.5" rx="1.25"/>
                <rect x="0" y="6.75" width="16" height="2.5" rx="1.25"/>
                <rect x="0" y="13.5" width="22" height="2.5" rx="1.25"/>
              </svg>
            </div>
          </button>
        </header>

        <RouteGuard currentUser={effectiveUser} isAdmin={isAdmin} loading={loading||gamesLoading}>
          <main className="lm-page lm-page--mobile-padded">{children}</main>
        </RouteGuard>

        {/* ── Mobile bottom navigation bar ── */}
        <nav className="lm-bottom-nav">
          {mainNav.slice(0,5).map(item => {
            const active = isActive(item.url);
            return (
              <Link key={item.title} to={item.disabled ? '#' : item.url}
                onClick={e => { if (item.disabled) { e.preventDefault(); toast({title:"בחר משחק",description:"נא לבחור משחק",variant:"destructive",duration:2000}); } }}
                style={{
                  display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                  flex:1,gap:3,padding:'4px 2px',textDecoration:'none',
                  color: active ? 'var(--tp)' : (item.disabled ? '#334155' : '#94a3b8'),
                  background: active ? 'var(--tp-12)' : 'transparent',
                  borderTop: active ? '3px solid var(--tp)' : '3px solid transparent',
                  transition:'all 0.15s', WebkitTapHighlightColor:'transparent', touchAction:'manipulation',
                  cursor: item.disabled ? 'not-allowed' : 'pointer', minWidth:0,
                }}>
                <item.icon size={22}/>
                <span style={{fontSize:'0.7rem',fontWeight:active?700:500,whiteSpace:'nowrap',fontFamily:'Rubik,Heebo,sans-serif',lineHeight:1.1,overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{item.short || item.title}</span>
              </Link>
            );
          })}
          <button onClick={()=>setSidebarOpen(s=>!s)} style={{
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            flex:1,gap:3,padding:'4px 2px',background:'none',border:'none',
            color: sidebarOpen ? 'var(--tp)' : '#94a3b8',
            borderTop: sidebarOpen ? '3px solid var(--tp)' : '3px solid transparent',
            cursor:'pointer',WebkitTapHighlightColor:'transparent',touchAction:'manipulation',
            fontFamily:'Rubik,Heebo,sans-serif',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
            </svg>
            <span style={{fontSize:'0.7rem',fontWeight:500,whiteSpace:'nowrap',lineHeight:1.1}}>עוד</span>
          </button>
        </nav>
      </div>

      <UploadStatusIndicator/>

      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent className="lm-admin-dialog" dir="rtl"
          style={{ position:'fixed', top:'8%', left:'4%', right:'4%', bottom:'auto', width:'92vw', maxWidth:'92vw', height:'auto', maxHeight:'none', borderRadius:'16px', transform:'none', margin:0, zIndex:100 }}>
          <DialogHeader>
            <DialogTitle style={{color:'var(--tp)',display:'flex',alignItems:'center',gap:8,fontSize:'1.2rem'}}>
              <Shield size={22}/> התחברות מנהל
            </DialogTitle>
          </DialogHeader>
          <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:8}}>
            <Input type="password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleAdminLogin()} placeholder="סיסמה..."
              autoComplete="current-password" style={{fontSize:'16px',height:'48px',borderRadius:'10px'}}/>
            <button onClick={handleAdminLogin} className="btn btn-primary"
              style={{ width:'100%', height:'52px', fontSize:'1.05rem', fontWeight:700, borderRadius:'10px', marginBottom:'4px' }}>
              🔐 התחבר כמנהל
            </button>
            <button onClick={()=>{setShowAdminDialog(false);setAdminPassword("");}} className="btn btn-ghost"
              style={{width:'100%',height:'44px',fontSize:'0.95rem'}}>
              ביטול
            </button>
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
const GLOBAL_STYLES = `
  :root {
    --bg1:#070d1a;--bg2:#0d1929;--bg3:#0a1422;
    --sidebar:rgba(5,8,16,0.99);--sidebar-bdr:rgba(6,182,212,0.10);
    --tp:#06b6d4;--tp-dark:#0891b2;
    --tp-03:rgba(6,182,212,0.03);--tp-05:rgba(6,182,212,0.05);--tp-08:rgba(6,182,212,0.08);
    --tp-10:rgba(6,182,212,0.10);--tp-12:rgba(6,182,212,0.12);--tp-15:rgba(6,182,212,0.15);
    --tp-18:rgba(6,182,212,0.18);--tp-20:rgba(6,182,212,0.20);--tp-25:rgba(6,182,212,0.25);
    --tp-30:rgba(6,182,212,0.30);--tp-40:rgba(6,182,212,0.40);--tp-50:rgba(6,182,212,0.50);
    --tp-glow:0 0 20px rgba(6,182,212,0.30);
    --text:#e2e8f0;--text-muted:#64748b;--text-sub:#475569;
    --card-bg:rgba(13,25,41,0.95);--card-border:rgba(6,182,212,0.10);
    --gold:#f59e0b;--font-main:'Rubik','Heebo',sans-serif;
  }
  *,*::before,*::after{box-sizing:border-box;}
  html,body{margin:0;padding:0;width:100%;height:100%;transition:background 0.4s ease,color 0.3s ease;}
  #root{height:100%;}
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:var(--tp-25);border-radius:3px;}
  ::-webkit-scrollbar-thumb:hover{background:var(--tp-40);}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 18px;border-radius:8px;font-family:var(--font-main)!important;font-size:0.88rem;font-weight:600;line-height:1;cursor:pointer;border:1px solid transparent;text-decoration:none;white-space:nowrap;user-select:none;-webkit-tap-highlight-color:transparent;transition:background 0.18s,border-color 0.18s,box-shadow 0.18s,transform 0.12s,opacity 0.18s,filter 0.18s;}
  .btn:active:not(:disabled):not([disabled]){transform:scale(0.97);}
  .btn:disabled,.btn[disabled]{opacity:0.4;cursor:not-allowed;pointer-events:none;}
  .btn-primary{background:var(--tp);color:#fff;border-color:transparent;}
  .btn-primary:hover:not(:disabled){filter:brightness(1.12);box-shadow:0 4px 20px var(--tp-30);}
  .btn-secondary{background:var(--tp-10);color:var(--tp);border-color:var(--tp-30);}
  .btn-secondary:hover:not(:disabled){background:var(--tp-20);border-color:var(--tp-50);box-shadow:0 0 14px var(--tp-20);}
  .btn-ghost{background:transparent;color:var(--text-muted);border-color:rgba(148,163,184,0.20);}
  .btn-ghost:hover:not(:disabled){background:rgba(148,163,184,0.08);color:var(--text);}
  .btn-danger{background:rgba(239,68,68,0.08);color:#ef4444;border-color:rgba(239,68,68,0.22);}
  .btn-danger:hover:not(:disabled){background:rgba(239,68,68,0.16);border-color:rgba(239,68,68,0.45);}
  .btn-success{background:rgba(34,197,94,0.10);color:#22c55e;border-color:rgba(34,197,94,0.25);}
  .btn-warning{background:rgba(245,158,11,0.10);color:#f59e0b;border-color:rgba(245,158,11,0.25);}
  .btn-sm{padding:5px 12px;font-size:0.78rem;border-radius:7px;gap:5px;}
  .btn-lg{padding:12px 26px;font-size:0.95rem;border-radius:10px;gap:9px;}
  .btn-icon{padding:8px;aspect-ratio:1;}
  .btn-icon.btn-sm{padding:6px;}
  .btn-wide{width:100%;}
  .card{background:var(--card-bg,var(--bg2));border:1px solid var(--card-border,var(--tp-10));border-radius:12px;padding:20px 24px;transition:border-color 0.2s,box-shadow 0.2s;}
  .card:hover{border-color:var(--tp-20);}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;letter-spacing:0.03em;border:1px solid transparent;}
  .badge-primary{background:var(--tp-12);color:var(--tp);border-color:var(--tp-25);}
  .badge-success{background:rgba(34,197,94,0.10);color:#22c55e;border-color:rgba(34,197,94,0.25);}
  .badge-danger{background:rgba(239,68,68,0.10);color:#ef4444;border-color:rgba(239,68,68,0.25);}
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select,textarea{background:var(--bg1)!important;border:1px solid var(--tp-20)!important;color:var(--text)!important;border-radius:8px!important;font-family:var(--font-main)!important;transition:border-color 0.2s,box-shadow 0.2s!important;}
  input:focus,select:focus,textarea:focus{border-color:var(--tp-50)!important;box-shadow:0 0 0 3px var(--tp-12)!important;outline:none!important;}
  .lm-root{display:flex;height:100dvh;overflow:hidden;background:var(--bg1);transition:background 0.4s ease;}
  .lm-sidebar{width:300px!important;flex-shrink:0;height:100dvh;display:flex;flex-direction:column;background:var(--sidebar);border-left:1px solid var(--sidebar-bdr,var(--tp-10));overflow:hidden;z-index:40;position:relative;transition:background 0.4s ease;}
  .lm-sidebar::before{content:'';position:absolute;top:-90px;right:-90px;width:280px;height:280px;background:radial-gradient(circle,var(--tp-12) 0%,transparent 70%);pointer-events:none;z-index:0;transition:background 0.4s;}
  .lm-sidebar::after{content:'';position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,transparent,transparent 27px,var(--tp-03) 28px),repeating-linear-gradient(90deg,transparent,transparent 27px,var(--tp-03) 28px);pointer-events:none;z-index:0;}
  .lm-sidebar-inner{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;overflow-y:auto;scrollbar-width:none;}
  .lm-sidebar-inner::-webkit-scrollbar{display:none;}
  .lm-sidebar--mobile{position:fixed;top:0;right:-310px;height:100dvh;z-index:50;transition:right 0.30s cubic-bezier(0.4,0,0.2,1),box-shadow 0.30s ease;}
  .lm-sidebar--mobile.open{right:0;box-shadow:-12px 0 60px rgba(0,0,0,0.65);}
  .lm-close-btn{position:absolute;top:12px;left:12px;background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:5px;z-index:2;border-radius:6px;transition:color 0.15s,background 0.15s;}
  .lm-close-btn:hover{color:var(--text);background:var(--tp-08);}
  .lm-overlay{display:none;position:fixed;inset:0;z-index:49;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);opacity:0;transition:opacity 0.30s ease;pointer-events:none;}
  .lm-overlay.visible{opacity:1;pointer-events:all;}
  .lm-stars{display:flex;justify-content:center;gap:6px;padding:0 18px 12px;position:relative;}
  .lm-stars::after{content:'';position:absolute;bottom:0;left:18px;right:18px;height:1px;background:linear-gradient(90deg,transparent,var(--tp-30),transparent);}
  .lm-star{font-size:11px;color:var(--gold);opacity:0;filter:drop-shadow(0 0 5px var(--gold));animation:lm-star-in 0.5s ease forwards;animation-delay:calc(var(--i)*0.08s + 0.4s);}
  @keyframes lm-star-in{to{opacity:0.9;}}
  .lm-game-selector{padding:10px 14px;border-bottom:1px solid var(--tp-08);background:var(--tp-03);}
  .lm-sec-label{font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-sub);padding:0 4px 7px;}
  .lm-sec-label--primary{color:var(--tp);opacity:1;font-size:0.72rem;}
  .lm-sec-label--admin{color:var(--gold);opacity:0.9;margin-top:16px;font-size:0.7rem;}
  .lm-select-trigger{background:var(--bg1)!important;border:1px solid var(--tp-20)!important;color:var(--text)!important;font-size:0.84rem!important;font-weight:600!important;height:38px!important;border-radius:8px!important;}
  .lm-select-content{background:var(--bg2)!important;border:1px solid var(--tp-30)!important;color:var(--text)!important;z-index:9999!important;border-radius:10px!important;overflow:hidden!important;}
  .lm-edit-game{display:flex;align-items:center;gap:6px;margin-top:8px;padding:7px 12px;font-size:0.8rem;font-weight:600;color:var(--tp);text-decoration:none;background:var(--tp-10);border:1px solid var(--tp-25);border-radius:8px;transition:all 0.15s;width:100%;justify-content:center;}
  .lm-edit-game:hover{background:var(--tp-20);border-color:var(--tp-50);}
  .lm-nav{flex:1;padding:12px 10px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;scrollbar-width:none;}
  .lm-nav::-webkit-scrollbar{display:none;}
  .lm-nav-item{position:relative;display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:10px;text-decoration:none;font-size:0.96rem;font-weight:500;color:var(--text-muted);transition:background 0.18s,color 0.18s,transform 0.14s;cursor:pointer;}
  .lm-nav-item:hover:not(.disabled){background:var(--tp-08);color:var(--text);transform:translateX(-3px);}
  .lm-nav-item.active{background:var(--tp-12);color:var(--tp);font-weight:700;}
  .lm-nav-item.disabled{opacity:0.35;cursor:not-allowed;}
  .lm-nav-icon{width:20px;height:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .lm-nav-label{flex:1;}
  .lm-nav-bar{position:absolute;right:0;top:50%;transform:translateY(-50%);width:3px;height:60%;border-radius:2px 0 0 2px;background:var(--tp);box-shadow:0 0 12px var(--tp-40);animation:lm-bar-in 0.22s ease;}
  @keyframes lm-bar-in{from{transform:translateY(-50%) scaleY(0);}to{transform:translateY(-50%) scaleY(1);}}
  .lm-login-prompt{display:flex;align-items:center;gap:10px;width:100%;padding:10px 13px;border-radius:10px;background:var(--tp-05);border:1px dashed var(--tp-20);color:var(--text-muted);font-size:0.92rem;font-weight:500;font-family:var(--font-main)!important;cursor:pointer;text-align:right;transition:background 0.15s,color 0.15s;}
  .lm-login-prompt:hover{background:var(--tp-10);color:var(--text);}
  .lm-login-badge{font-size:0.62rem;font-weight:700;margin-right:auto;background:var(--tp-15);color:var(--tp);padding:2px 8px;border-radius:20px;letter-spacing:0.05em;}
  .lm-theme-section{padding:10px 12px;border-top:1px solid var(--tp-08);display:flex;flex-direction:column;gap:6px;}
  .lm-darkmode-btn{display:flex;align-items:center;gap:10px;width:100%;background:transparent;border:none;cursor:pointer;font-family:var(--font-main)!important;padding:6px 4px;border-radius:8px;transition:background 0.15s;}
  .lm-darkmode-btn:hover{background:var(--tp-05);}
  .lm-darkmode-track{position:relative;width:36px;height:20px;background:var(--tp-20);border:1px solid var(--tp-30);border-radius:10px;flex-shrink:0;}
  .lm-darkmode-knob{position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:var(--tp);color:#fff;display:flex;align-items:center;justify-content:center;transition:transform 0.25s cubic-bezier(0.4,0,0.2,1),background 0.25s;box-shadow:0 1px 4px rgba(0,0,0,0.4);}
  .lm-darkmode-knob.light{transform:translateX(-16px);background:var(--gold);}
  .lm-darkmode-label{font-size:0.75rem;font-weight:600;color:var(--text-muted);}
  .lm-theme-trigger{display:flex;align-items:center;gap:8px;width:100%;background:var(--tp-05);border:1px solid var(--tp-15);border-radius:9px;padding:8px 10px;cursor:pointer;font-family:var(--font-main)!important;transition:background 0.15s,border-color 0.15s;}
  .lm-theme-trigger:hover{background:var(--tp-10);border-color:var(--tp-25);}
  .lm-theme-dots{display:flex;gap:3px;align-items:center;}
  .lm-theme-name-current{flex:1;font-size:0.82rem;font-weight:600;color:var(--text);text-align:right;}
  .lm-theme-chevron{font-size:0.6rem;color:var(--text-muted);}
  .lm-theme-panel{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;animation:lm-panel-in 0.18s ease;}
  @keyframes lm-panel-in{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
  .lm-theme-card{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;background:var(--tp-05);border:1px solid var(--tp-10);cursor:pointer;transition:background 0.15s,border-color 0.15s,transform 0.12s;font-family:var(--font-main)!important;}
  .lm-theme-card:hover{background:var(--tp-10);transform:scale(1.03);}
  .lm-theme-card.active{transform:scale(1.02);}
  .lm-theme-strip{width:100%;height:20px;border-radius:6px;overflow:hidden;display:flex;border:1px solid rgba(255,255,255,0.06);}
  .lm-theme-card-info{display:flex;align-items:center;gap:5px;}
  .lm-theme-card-emoji{font-size:14px;}
  .lm-theme-card-name{font-size:0.75rem;font-weight:700;color:var(--text);flex:1;}
  .lm-theme-check{font-size:0.8rem;font-weight:700;}
  .lm-user-footer{padding:12px 14px 16px;border-top:1px solid var(--tp-10);}
  .lm-user-row{display:flex;align-items:center;gap:10px;}
  .lm-avatar{width:36px;height:36px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,var(--tp),#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:0.82rem;font-weight:800;color:white;box-shadow:0 0 14px var(--tp-25);}
  .lm-user-info-block{flex:1;min-width:0;}
  .lm-user-name{font-size:0.82rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .lm-user-role{font-size:0.68rem;margin-top:1px;}
  .lm-logout-btn{flex-shrink:0;}
  .lm-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100dvh;gap:16px;color:var(--text-muted);font-size:0.9rem;background:var(--bg1);}
  .lm-loading-spinner{width:38px;height:38px;border:3px solid var(--tp-15);border-top-color:var(--tp);border-radius:50%;animation:lm-spin 0.8s linear infinite;}
  @keyframes lm-spin{to{transform:rotate(360deg);}}
  .lm-main{flex:1;display:flex;flex-direction:column;height:100dvh;overflow:hidden;min-width:0;background:var(--bg1);transition:background 0.4s;}
  .lm-page{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;background:var(--bg1);transition:background 0.4s;}
  .lm-bottom-nav{display:none;}
  .lm-topbar{display:none;align-items:center;justify-content:space-between;padding:0 14px;height:62px;flex-shrink:0;background:var(--sidebar);border-bottom:1px solid var(--tp-10);position:sticky;top:0;z-index:30;transition:background 0.4s;}
  .lm-admin-dialog{background:linear-gradient(135deg,var(--bg3) 0%,var(--bg1) 100%)!important;border:1px solid var(--tp-30)!important;border-radius:14px!important;}
  @media(max-width:768px){
    .desktop-sidebar{display:none!important;}
    .mobile-topbar{display:flex!important;}
    .lm-overlay{display:block!important;}
    html{font-size:18px!important;-webkit-text-size-adjust:100%;}
    body{font-size:18px!important;line-height:1.5!important;overflow-x:hidden!important;}
    .lm-root,.lm-main,.lm-page{overflow-x:hidden!important;}
    .lm-topbar{height:82px!important;padding:0 16px!important;}
    .lm-bottom-nav{position:fixed!important;bottom:0!important;left:0!important;right:0!important;height:68px!important;display:flex!important;align-items:stretch!important;background:var(--sidebar)!important;border-top:2px solid var(--tp-25)!important;z-index:9999!important;box-shadow:0 -6px 30px rgba(0,0,0,0.6)!important;padding-bottom:env(safe-area-inset-bottom,0px)!important;}
    .lm-page--mobile-padded,.lm-page{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px))!important;}
    .lm-sidebar--mobile{position:fixed!important;top:0!important;right:-105vw!important;width:88vw!important;height:100dvh!important;z-index:50!important;overflow-y:auto!important;transition:right 0.28s cubic-bezier(0.4,0,0.2,1)!important;}
    .lm-sidebar--mobile.open{right:0!important;box-shadow:-12px 0 60px rgba(0,0,0,0.7)!important;}
    h1{font-size:1.6rem!important;font-weight:800!important;}
    h2{font-size:1.3rem!important;font-weight:700!important;}
    h3{font-size:1.1rem!important;}
    .lm-nav-item{font-size:1.15rem!important;padding:16px 20px!important;min-height:56px!important;}
    .lm-nav-icon{width:26px!important;height:26px!important;}
    .lm-sec-label{font-size:0.85rem!important;}
    button,[role="button"]{min-height:48px;font-size:1rem!important;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
    [class*="badge"],[class*="Badge"]{min-height:unset!important;font-size:0.85rem!important;padding:3px 9px!important;}
    input,select,textarea{font-size:16px!important;min-height:48px!important;}
    [class*="SelectTrigger"]{min-height:48px!important;font-size:1rem!important;}
    [role="dialog"]:not([class*="lm-admin"]){max-width:100vw!important;width:100vw!important;max-height:94dvh!important;margin:0!important;border-radius:20px 20px 0 0!important;position:fixed!important;bottom:0!important;top:auto!important;left:0!important;right:0!important;transform:none!important;overflow-y:auto!important;}
    .lm-admin-dialog,.lm-admin-dialog[role="dialog"]{width:92vw!important;max-width:92vw!important;max-height:80dvh!important;height:auto!important;top:8%!important;bottom:auto!important;left:4%!important;right:4%!important;border-radius:16px!important;transform:none!important;position:fixed!important;}
    .p-6{padding:16px!important;}.p-4{padding:12px!important;}.p-3{padding:10px!important;}
    .gap-6{gap:12px!important;}.gap-4{gap:10px!important;}.mb-8{margin-bottom:20px!important;}
    aside[style*="215px"],aside[style*="width: 215"],.vs-sidebar-desktop{display:none!important;}
  }
  @media(max-width:380px){
    html{font-size:16px!important;}
    .lm-topbar{height:64px!important;}
    .lm-bottom-nav{height:62px!important;}
  }
  @media(min-width:769px){
    .mobile-sidebar{display:none!important;}
    .mobile-topbar{display:none!important;}
  }
  thead tr th,thead tr td{background:var(--bg2)!important;}
  [data-radix-select-viewport],[data-radix-popper-content-wrapper]>div{background:var(--bg2)!important;border:1px solid var(--tp-25)!important;}
  [role="option"]:hover,[data-highlighted]{background:var(--tp-15)!important;color:var(--text)!important;}
  .bg-card{background:var(--card-bg)!important;}
  .text-cyan-400{color:var(--tp)!important;}
  .border-cyan-400{border-color:var(--tp)!important;}
  .hover\\:bg-cyan-900\\/20:hover{background:var(--tp-10)!important;}
  .hm-light .lm-page,.hm-light .lm-main{background:var(--bg1);}
  .hm-light input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),.hm-light select,.hm-light textarea{background:#ffffff!important;}
`;
