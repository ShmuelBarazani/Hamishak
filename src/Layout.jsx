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
  ChevronDown,
  Edit
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

// קומפוננטת הניווט הפנימית שמשתמשת ב-GameContext
function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const { toast } = useToast();
  
  const { currentGame, games, selectGame, loading: gamesLoading, currentParticipant } = useGame();

  // פריטי ניווט למשתמשים לא מחוברים (אורחים)
  const guestNavigationItems = [
    {
      title: "צפייה בניחושים",
      url: createPageUrl("ViewSubmissions") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: Users,
      roles: ["guest"],
      disabled: !currentGame
    },
    {
      title: "תוצאות אמת",
      url: createPageUrl("AdminResults") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: BarChart3,
      roles: ["guest"],
      disabled: !currentGame
    },
    {
      title: "טבלת דירוג",
      url: createPageUrl("LeaderboardNew") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: Award,
      roles: ["guest"],
      disabled: !currentGame
    },
    {
      title: "סטטיסטיקות",
      url: createPageUrl("Statistics") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: PieChart,
      roles: ["guest"],
      disabled: !currentGame
    },
    {
      title: "מילוי ניחושים",
      url: createPageUrl("PredictionForm") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: FileText,
      roles: ["guest"],
      disabled: !currentGame,
      requireAuth: true // סימון שזה דורש התחברות
    }
  ];

  const allNavigationItems = [
    {
      title: "סקירת מערכת",
      url: createPageUrl("SystemOverview"),
      icon: Database,
      roles: ["admin"],
    },
    // The "יצירת / עריכת משחק" item is now a dedicated button in the header,
    // so it's removed from the main navigation items array to prevent duplication.
    {
      title: "בניית שאלון",
      url: createPageUrl("FormBuilder") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: FileText,
      roles: ["admin"],
      disabled: !currentGame
    },
    {
      title: "מילוי ניחושים",
      url: createPageUrl("PredictionForm") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: FileText,
      roles: ["admin", "predictor"],
      disabled: !currentGame
    },
    {
      title: "צפייה בניחושים",
      url: createPageUrl("ViewSubmissions") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: Users,
      roles: ["admin", "predictor", "viewer"],
      disabled: !currentGame
    },
    {
      title: "תוצאות אמת",
      url: createPageUrl("AdminResults") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: BarChart3,
      roles: ["admin", "predictor", "viewer"],
      disabled: !currentGame
    },
    {
      title: "טבלת דירוג",
      url: createPageUrl("LeaderboardNew") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: Award,
      roles: ["admin", "predictor", "viewer"],
      disabled: !currentGame
    },
    {
      title: "סטטיסטיקות",
      url: createPageUrl("Statistics") + (currentGame ? `?gameId=${currentGame.id}` : ''),
      icon: PieChart,
      roles: ["admin", "predictor", "viewer"],
      disabled: !currentGame
    },
    {
      title: "ניהול משתתפים",
      url: createPageUrl("ManageGameParticipants"),
      icon: Users,
      roles: ["admin"],
      disabled: !currentGame
    },
    {
      title: "ניהול משתמשים",
      url: createPageUrl("UserManagement"),
      icon: Shield,
      roles: ["admin"],
    }
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
      // Redirect to a default page after logout, possibly the leaderboard without a specific game
      window.location.href = createPageUrl("LeaderboardNew"); 
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleAdminLogin = async () => {
    if (adminPassword === "champ11") {
      try {
        if (!currentUser) {
          // If no current user, prompt for login first then update role
          // This path should ideally not be taken if the "connect as admin" button
          // is only shown to logged-in non-admin users.
          await window.location.href = '/login';
          return;
        }

        await supabase.auth.updateUser({ role: "admin" });
        const updatedUser = await supabase.auth.getUser().then(r => r.data.user);
        setCurrentUser(updatedUser);

        setShowAdminDialog(false);
        setAdminPassword("");
        toast({
          title: "התחברת כמנהל!",
          description: "כעת יש לך גישה מלאה למערכת",
          className: "bg-green-100 text-green-800",
          duration: 2000
        });
      } catch (error) {
        console.error("Admin login error:", error);
        toast({
          title: "שגיאה",
          description: "לא ניתן לעדכן הרשאות",
          variant: "destructive",
          duration: 2000
        });
      }
    } else {
      toast({
        title: "סיסמה שגויה",
        description: "אנא נסה שוב",
        variant: "destructive",
        duration: 2000
      });
      setAdminPassword("");
    }
  };

  // בחירת פריטי ניווט לפי סטטוס משתמש
  let userRole = currentUser?.role || "guest";
  
  // 🔍 לוג לבדיקה
  console.log('🔍 Layout Navigation Check:', {
    currentUser: currentUser?.email,
    currentUserRole: currentUser?.role,
    currentParticipant: currentParticipant,
    participantRole: currentParticipant?.role_in_game
  });
  
  // אם זה לא מנהל כללי ויש participant - השתמש בתפקיד מהמשחק
  if (currentUser && currentUser.role !== "admin" && currentParticipant) {
    userRole = currentParticipant.role_in_game;
    console.log('✅ מעדכן userRole מ-participant:', userRole);
  }
  
  console.log('📋 Final userRole:', userRole);
  
  const isAdmin = currentUser?.role === "admin";
  const navigationItems = currentUser 
    ? allNavigationItems.filter(item => item.roles.includes(userRole))
    : guestNavigationItems;
    
  console.log('📋 Navigation items count:', navigationItems.length);

  if (loading || gamesLoading) {
    return <div className="flex items-center justify-center h-screen">טוען...</div>;
  }

  return (
    <div className="app-container w-full min-h-screen" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }} dir="rtl">
      <header className="app-header" style={{ 
        background: 'rgba(15, 23, 42, 0.95)', 
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(6, 182, 212, 0.2)',
        boxShadow: '0 4px 24px 0 rgba(6, 182, 212, 0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-2 sm:py-3">
            {/* שם המערכת + בחירת משחק + כפתור עריכה */}
            <div className="flex items-center gap-2 sm:gap-3 mr-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center flex-shrink-0">
                <img 
                  src={currentGame?.game_icon || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909e559d350b14a5fc224bb/755e92965_2025-11-06120813.png"}
                  alt="Tournament Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col items-start">
                {/* רק שורה אחת - dropdown לבחירת משחק */}
                <div className="flex items-center gap-2">
                  <Select 
                    value={currentGame?.id || ''} 
                    onValueChange={(gameId) => {
                      const game = games.find(g => g.id === gameId);
                      if (game) selectGame(game);
                    }}
                    disabled={gamesLoading || games.length === 0}
                  >
                    <SelectTrigger 
                      className="border-0 bg-transparent text-base sm:text-xl font-bold p-0 h-auto"
                      style={{ 
                        color: '#f8fafc',
                        textShadow: '0 0 10px rgba(6, 182, 212, 0.3)',
                        minWidth: '250px'
                      }}
                    >
                      <SelectValue placeholder={games.length === 0 ? "אין משחקים" : "בחר משחק"}>
                        {currentGame ? currentGame.game_name : "בחר משחק"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-cyan-600 [&>div]:bg-slate-800" style={{
                      background: '#1e293b !important',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      color: '#f8fafc',
                      zIndex: 9999,
                      backgroundColor: '#1e293b'
                    }}>
                      {games.map(game => (
                        <SelectItem key={game.id} value={game.id} className="text-slate-200 hover:bg-cyan-700/20 focus:bg-cyan-700/20" style={{ 
                          color: '#f8fafc',
                          backgroundColor: 'transparent'
                        }}>
                          <div className="flex flex-col">
                            <span className="font-bold">{game.game_name}</span>
                            {game.game_subtitle && (
                              <span className="text-xs" style={{ color: '#06b6d4' }}>{game.game_subtitle}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* כפתור עריכת משחק */}
                  {isAdmin && currentGame && (
                    <Link to={createPageUrl("CreateGame")}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        style={{ color: '#06b6d4' }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </div>
                
                {/* שורה שנייה - subtitle בלבד */}
                {currentGame?.game_subtitle && (
                  <span className="text-xs sm:text-sm" style={{ color: '#06b6d4' }}>
                    {currentGame.game_subtitle}
                  </span>
                )}
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <nav className="flex items-center space-x-reverse space-x-3">
                {navigationItems.map((item) => {
                   const isActive = window.location.pathname.includes(item.url.split('?')[0]);
                   return (
                     <Link
                       key={item.title}
                       to={item.disabled ? '#' : item.url}
                       className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                         item.disabled ? 'opacity-50 cursor-not-allowed' : 
                         isActive ? 'text-white' : 'hover:text-white'
                       }`}
                       style={item.disabled ? { color: '#64748b' } : isActive ? {
                         background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(14, 165, 233, 0.3) 100%)',
                         borderLeft: '2px solid #06b6d4',
                         color: '#06b6d4',
                         boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)'
                       } : {
                         color: '#94a3b8'
                       }}
                        onClick={(e) => {
                          if (item.disabled) {
                            e.preventDefault();
                            toast({
                              title: "בחר משחק",
                              description: "נא לבחור משחק כדי להשתמש באפשרות זו",
                              variant: "destructive"
                            });
                          } else if (item.requireAuth && !currentUser) {
                            e.preventDefault();
                            window.location.href = '/login';
                          }
                        }}
                      >
                        <item.icon className="w-3.5 h-3.5" />
                        <span className="text-xs">{item.title}</span>
                      </Link>
                    );
                  })}
              </nav>
              
              <div className="flex flex-col items-center gap-1 pr-3" style={{ 
                borderRight: '1px solid rgba(6, 182, 212, 0.2)' 
              }}>
                {currentUser ? (
                  <>
                    <div className="flex items-center gap-1.5" style={{ color: '#94a3b8' }}>
                      <UserIcon className="w-3 h-3" />
                      <span className="text-xs">{currentUser.full_name}</span>
                      {currentUser.role === 'admin' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ 
                          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)',
                          color: '#06b6d4',
                          border: '1px solid rgba(6, 182, 212, 0.3)'
                        }}>
                          מנהל
                        </span>
                      )}
                    </div>
                    <Button 
                      onClick={handleLogout} 
                      variant="outline" 
                      size="sm"
                      className="h-6 px-2 text-xs hover:bg-cyan-500/10 hover:border-cyan-500"
                      style={{ 
                        borderColor: 'rgba(6, 182, 212, 0.3)',
                        color: '#94a3b8',
                        background: 'transparent'
                      }}
                    >
                      <LogOut className="w-3 h-3 ml-1" />
                      התנתק
                    </Button>
                  </>
                ) : (
                  <Button 
                    onClick={() => window.location.href = '/login'}
                    size="sm"
                    className="h-7 px-3 text-xs hover:bg-cyan-500/20"
                    style={{
                      background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%)',
                      borderColor: 'rgba(6, 182, 212, 0.3)',
                      color: '#06b6d4'
                    }}
                  >
                    <Shield className="w-3.5 h-3.5 ml-1.5" />
                    התחבר / הירשם
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="md:hidden" style={{ 
          borderTop: '1px solid rgba(6, 182, 212, 0.2)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)'
        }}>
          <div className="max-w-7xl mx-auto px-2 py-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              {navigationItems.map((item) => {
                const isActive = window.location.pathname.includes(item.url.split('?')[0]);
                return (
                  <Link
                    key={item.title}
                    to={item.disabled ? '#' : item.url}
                    className={`flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      item.disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    style={item.disabled ? { color: '#64748b', background: 'rgba(30, 41, 59, 0.4)' } : 
                      isActive ? {
                      background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(14, 165, 233, 0.3) 100%)',
                      color: '#06b6d4',
                      boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)'
                    } : {
                      color: '#94a3b8',
                      background: 'rgba(30, 41, 59, 0.4)'
                    }}
                    onClick={(e) => {
                      if (item.disabled) {
                        e.preventDefault();
                        toast({
                          title: "בחר משחק",
                          description: "נא לבחור משחק תחילה",
                          variant: "destructive",
                          duration: 2000
                        });
                      } else if (item.requireAuth && !currentUser) {
                        e.preventDefault();
                        window.location.href = '/login';
                      }
                    }}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    <span className="text-[9px] text-center leading-tight">{item.title}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-center">
              {currentUser ? (
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#94a3b8' }}>
                  <span>{currentUser.full_name}</span>
                  {currentUser.role === 'admin' && (
                    <span className="text-[9px] px-1 py-0.5 rounded-full" style={{ 
                      background: 'rgba(6, 182, 212, 0.2)',
                      color: '#06b6d4',
                      border: '1px solid rgba(6, 182, 212, 0.3)'
                    }}>מנהל</span>
                  )}
                  <Button 
                    onClick={handleLogout} 
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[9px]"
                    style={{ color: '#94a3b8' }}
                  >
                    <LogOut className="w-2.5 h-2.5" />
                  </Button>
                </div>
              ) : (
                <Button 
                  onClick={() => window.location.href = '/login'}
                  size="sm"
                  className="h-5 px-2 text-[9px]"
                  style={{
                    background: 'rgba(6, 182, 212, 0.1)',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#06b6d4'
                  }}
                >
                  <Shield className="w-2.5 h-2.5 ml-0.5" />
                  התחבר / הירשם
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {children}
      </main>

      <UploadStatusIndicator />

      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent style={{ 
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          boxShadow: '0 0 40px rgba(6, 182, 212, 0.2)'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ 
              color: '#06b6d4',
              textShadow: '0 0 10px rgba(6, 182, 212, 0.5)'
            }}>
              <Shield className="w-6 h-6" />
              התחברות מנהל
            </DialogTitle>
            <DialogDescription style={{ color: '#94a3b8' }}>
              הזן את סיסמת המנהל כדי לקבל הרשאות מלאות
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>סיסמה</label>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                placeholder="הזן סיסמת מנהל..."
                style={{
                  background: '#0f172a',
                  borderColor: 'rgba(6, 182, 212, 0.3)',
                  color: '#f8fafc'
                }}
                className="focus:border-cyan-500 focus:ring-cyan-500"
              />
            </div>
            
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdminDialog(false);
                  setAdminPassword("");
                }}
                style={{ 
                  borderColor: 'rgba(6, 182, 212, 0.3)', 
                  color: '#94a3b8',
                  background: 'transparent'
                }}
                className="hover:bg-cyan-500/10"
              >
                ביטול
              </Button>
              <Button
                onClick={handleAdminLogin}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  color: 'white',
                  boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                }}
                className="hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]"
              >
                <Shield className="w-4 h-4 ml-2" />
                התחבר כמנהל
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// הקומפוננטה הראשית עם כל ה-Providers
export default function Layout({ children, currentPageName }) {
  return (
    <UploadStatusProvider>
      <GameProvider>
        <style>{`
          :root {
            --primary-bg: #0f172a;
            --secondary-bg: #1e293b;
            --card-bg: #1e293b;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-cyan: #06b6d4;
            --accent-blue: #0ea5e9;
            --accent-purple: #8b5cf6;
            --border-color: rgba(6, 182, 212, 0.2);
            --glow-cyan: rgba(6, 182, 212, 0.4);
          }
          
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100vh;
            background: #0f172a;
            color: var(--text-primary);
          }
          
          #root {
            width: 100%;
            min-height: 100vh;
          }
          
          @supports (padding: env(safe-area-inset-top)) {
            .app-header {
              padding-top: env(safe-area-inset-top);
            }
            .app-main {
              padding-bottom: env(safe-area-inset-bottom);
            }
          }
          
          .neon-border {
            border: 1px solid rgba(6, 182, 212, 0.3);
            box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
          }
          
          .neon-glow {
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.3);
          }
          
          .crypto-card {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            border: 1px solid rgba(6, 182, 212, 0.2);
            border-radius: 8px;
          }
          
          ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          
          ::-webkit-scrollbar-track {
            background: #1e293b;
          }
          
          ::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, #06b6d4 0%, #0ea5e9 100%);
            border-radius: 5px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, #0ea5e9 0%, #06b6d4 100%);
          }

          @media (max-width: 768px) {
            body {
              overflow-y: auto;
              overflow-x: hidden;
            }
            
            .app-container {
              min-height: 100vh;
              display: flex;
              flex-direction: column;
            }
            
            .app-header {
              position: sticky;
              top: 0;
              z-index: 50;
            }
            
            .app-main {
              flex: 1;
              overflow-y: auto;
              -webkit-overflow-scrolling: touch;
            }
          }
          
          @media (max-width: 768px) and (orientation: landscape) {
            .app-header {
              position: sticky;
              top: 0;
            }
            
            .app-header .py-2 {
              padding-top: 0.25rem;
              padding-bottom: 0.25rem;
            }
          }
        `}</style>
        <LayoutContent currentPageName={currentPageName}>
          {children}
        </LayoutContent>
      </GameProvider>
    </UploadStatusProvider>
  );
}