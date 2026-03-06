import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Users,
  FileText,
  BarChart3,
  Database,
  Award,
  PieChart,
  LogOut,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadStatusProvider } from '@/components/contexts/UploadStatusContext';
import UploadStatusIndicator from '@/components/layout/UploadStatusIndicator';
import { useToast } from "@/components/ui/use-toast";
import { Settings } from 'lucide-react';

const allNavigationItems = [
  {
    title: "סקירת מערכת",
    url: createPageUrl("SystemOverview"),
    icon: Database,
    roles: ["admin"],
  },
  {
    title: "מילוי ניחושים",
    url: createPageUrl("PredictionForm"),
    icon: FileText,
    roles: ["admin", "user"],
  },
  {
    title: "צפייה בניחושים",
    url: createPageUrl("ViewSubmissions"),
    icon: Users,
    roles: ["admin", "user"],
  },
  {
    title: "תוצאות אמת",
    url: createPageUrl("AdminResults"),
    icon: BarChart3,
    roles: ["admin", "user"],
  },
  {
    title: "טבלת דירוג",
    url: createPageUrl("LeaderboardNew"),
    icon: Award,
    roles: ["admin", "user"],
  },
  {
    title: "סטטיסטיקות",
    url: createPageUrl("Statistics"),
    icon: PieChart,
    roles: ["admin", "user"],
  }
];

const MAIN_ADMIN = {
  email: "admin@toto.com",
  password: "champ11"
};

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    const addMetaTag = (name, content) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    const addAppleMetaTag = (name, content) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    addMetaTag('theme-color', '#06b6d4');
    addMetaTag('mobile-web-app-capable', 'yes');
    addAppleMetaTag('apple-mobile-web-app-capable', 'yes');
    addAppleMetaTag('apple-mobile-web-app-status-bar-style', 'black-translucent');
    addAppleMetaTag('apple-mobile-web-app-title', 'טוטו ליגה');

    let manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = 'data:application/json;base64,{}';
      document.head.appendChild(manifestLink);
    }

    let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleTouchIcon) {
      appleTouchIcon = document.createElement('link');
      appleTouchIcon.rel = 'apple-touch-icon';
      appleTouchIcon.href = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d81aa00ebfb4a62a9ba9b2/952cd4e3c_2025-11-06124540.png';
      document.head.appendChild(appleTouchIcon);
    }

    const manifestData = {
      name: "טוטו ליגת אלופות 2025-2026",
      short_name: "טוטו ליגה",
      description: "אפליקציה לניחושים בליגת האלופות",
      start_url: "/",
      display: "standalone",
      background_color: "#0f172a",
      theme_color: "#06b6d4",
      orientation: "portrait",
      dir: "rtl",
      lang: "he",
      icons: [
        {
          src: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d81aa00ebfb4a62a9ba9b2/952cd4e3c_2025-11-06124540.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable"
        },
        {
          src: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d81aa00ebfb4a62a9ba9b2/952cd4e3c_2025-11-06124540.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable"
        }
      ]
    };

    const manifestBlob = new Blob([JSON.stringify(manifestData)], { type: 'application/json' });
    const manifestURL = URL.createObjectURL(manifestBlob);
    if (manifestLink) {
      manifestLink.href = manifestURL;
    }

    return () => {
      if (manifestURL) {
        URL.revokeObjectURL(manifestURL);
      }
    };
  }, []);

  // ✅ תיקון: SystemSettings מבוטל - אין יותר קריאה ל-BASE44
  useEffect(() => {
    loadAdminUsers();
  }, []);

  const loadAdminUsers = async () => {
    // SystemSettings disabled - using localStorage only
    setAdminUsers([]);
  };

  useEffect(() => {
    const adminLoggedIn = localStorage.getItem("toto_admin_logged_in");
    const adminEmail = localStorage.getItem("toto_admin_email");
    setIsAdmin(adminLoggedIn === "true");
    setIsMainAdmin(adminEmail === MAIN_ADMIN.email);
  }, []);

  const handleAdminLogin = () => {
    if (email === MAIN_ADMIN.email && password === MAIN_ADMIN.password) {
      localStorage.setItem("toto_admin_logged_in", "true");
      localStorage.setItem("toto_admin_email", email);
      setIsAdmin(true);
      setIsMainAdmin(true);
      setShowAdminDialog(false);
      setEmail("");
      setPassword("");
      toast({
        title: "התחברת בהצלחה!",
        description: "כעת יש לך גישה מלאה כמנהל ראשי",
        className: "bg-green-100 text-green-800",
        duration: 3000
      });
      return;
    }

    const matchingAdmin = adminUsers.find(
      admin => admin.email === email && admin.password === password
    );

    if (matchingAdmin) {
      localStorage.setItem("toto_admin_logged_in", "true");
      localStorage.setItem("toto_admin_email", email);
      setIsAdmin(true);
      setIsMainAdmin(false);
      setShowAdminDialog(false);
      setEmail("");
      setPassword("");
      toast({
        title: "התחברת בהצלחה!",
        description: "כעת יש לך גישה מלאה כמנהל",
        className: "bg-green-100 text-green-800",
        duration: 3000
      });
      return;
    }

    toast({
      title: "שגיאה בהתחברות",
      description: "מייל או סיסמה שגויים",
      variant: "destructive",
      duration: 3000
    });
    setPassword("");
  };

  const handleLogout = () => {
    localStorage.removeItem("toto_admin_logged_in");
    localStorage.removeItem("toto_admin_email");
    setIsAdmin(false);
    setIsMainAdmin(false);
    toast({
      title: "התנתקת בהצלחה",
      description: "תוכל להמשיך לצפות בטבלת הדירוג",
      className: "bg-blue-100 text-blue-800",
      duration: 3000
    });
  };

  const userRole = isAdmin ? "admin" : "user";
  const navigationItems = allNavigationItems.filter(item =>
    item.roles.includes(userRole)
  );

  return (
    <ThemeProvider>
      <UploadStatusProvider>
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
      <div className="app-container w-full min-h-screen" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }} dir="rtl">
        <header className="app-header" style={{ 
          background: 'rgba(15, 23, 42, 0.95)', 
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(6, 182, 212, 0.2)',
          boxShadow: '0 4px 24px 0 rgba(6, 182, 212, 0.1)'
        }}>
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-2 sm:py-3">
              <Link to={createPageUrl("LeaderboardNew")} className="flex items-center gap-2 sm:gap-3 mr-0">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d81aa00ebfb4a62a9ba9b2/952cd4e3c_2025-11-06124540.png"
                  alt="ליגת האלופות"
                  className="w-9 h-9 sm:w-11 sm:h-11 flex-shrink-0"
                />
                <div className="flex flex-col items-center">
                  <h1 className="font-bold text-base sm:text-2xl leading-tight whitespace-nowrap" style={{ 
                    color: '#f8fafc',
                    textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
                  }}>טוטו ליגת אלופות 2025-2026</h1>
                  <span className="font-semibold text-xs sm:text-lg leading-tight" style={{ color: '#06b6d4' }}>שלב הליגה</span>
                </div>
              </Link>

              <div className="hidden md:flex items-center gap-3">
                <nav className="flex items-center space-x-reverse space-x-3">
                  {navigationItems.map((item) => (
                    <Link
                      key={item.title}
                      to={item.url}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        location.pathname === item.url ? 'text-white' : 'hover:text-white'
                      }`}
                      style={location.pathname === item.url ? {
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)',
                        borderLeft: '2px solid #06b6d4',
                        color: '#06b6d4',
                        boxShadow: '0 0 15px rgba(6, 182, 212, 0.2)'
                      } : {
                        color: '#94a3b8'
                      }}
                    >
                      <item.icon className="w-3.5 h-3.5" />
                      <span className="text-xs">{item.title}</span>
                    </Link>
                  ))}
                  
                  {isMainAdmin && (
                    <Link
                      to={createPageUrl("AdminManagement")}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        location.pathname === createPageUrl("AdminManagement") ? 'text-white' : 'hover:text-white'
                      }`}
                      style={location.pathname === createPageUrl("AdminManagement") ? {
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)',
                        borderLeft: '2px solid #06b6d4',
                        color: '#06b6d4',
                        boxShadow: '0 0 15px rgba(6, 182, 212, 0.2)'
                      } : {
                        color: '#94a3b8'
                      }}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="text-xs">ניהול מנהלים</span>
                    </Link>
                  )}
                </nav>
                
                <div className="flex flex-col items-center gap-1 pr-3" style={{ 
                  borderRight: '1px solid rgba(6, 182, 212, 0.2)' 
                }}>
                  {isAdmin ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5" style={{ color: '#94a3b8' }}>
                        <Shield className="w-3 h-3" />
                        <span className="text-xs">
                          {isMainAdmin ? 'מנהל ראשי' : 'מנהל'}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          onClick={() => setShowThemeSettings(true)} 
                          variant="outline" 
                          size="sm"
                          className="h-6 px-2 text-xs hover:bg-cyan-500/10 hover:border-cyan-500"
                          style={{ 
                            borderColor: 'rgba(6, 182, 212, 0.3)',
                            color: '#94a3b8',
                            background: 'transparent'
                          }}
                        >
                          <Settings className="w-3 h-3" />
                        </Button>
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
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <Button 
                        onClick={() => setShowThemeSettings(true)} 
                        size="sm"
                        className="h-7 px-2 text-xs hover:bg-cyan-500/20"
                        style={{
                          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%)',
                          borderColor: 'rgba(6, 182, 212, 0.3)',
                          color: '#06b6d4'
                        }}
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        onClick={() => setShowAdminDialog(true)} 
                        size="sm"
                        className="h-7 px-3 text-xs hover:bg-cyan-500/20"
                        style={{
                          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%)',
                          borderColor: 'rgba(6, 182, 212, 0.3)',
                          color: '#06b6d4'
                        }}
                      >
                        <Shield className="w-3.5 h-3.5 ml-1.5" />
                        התחבר כמנהל
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="md:hidden" style={{ borderTop: '1px solid rgba(6, 182, 212, 0.2)' }}>
            <div className="max-w-7xl mx-auto px-2 py-1.5">
              <div className="grid grid-cols-3 gap-1.5">
                {navigationItems.map((item) => (
                  <Link
                    key={item.title}
                    to={item.url}
                    className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                    style={location.pathname === item.url ? {
                      background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)',
                      color: '#06b6d4',
                      boxShadow: '0 0 10px rgba(6, 182, 212, 0.2)'
                    } : {
                      color: '#94a3b8',
                      background: 'rgba(30, 41, 59, 0.4)'
                    }}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    <span className="text-[9px] text-center leading-tight">{item.title}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-1.5 flex justify-center gap-1">
                <Button 
                  onClick={() => setShowThemeSettings(true)} 
                  size="sm"
                  className="h-5 px-1.5 text-[9px]"
                  style={{
                    background: 'rgba(6, 182, 212, 0.1)',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#06b6d4'
                  }}
                >
                  <Settings className="w-2.5 h-2.5" />
                </Button>
                {isAdmin ? (
                  <div className="flex items-center gap-1 text-[10px]" style={{ color: '#94a3b8' }}>
                    <span>{isMainAdmin ? 'מנהל ראשי' : 'מנהל'}</span>
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
                    onClick={() => setShowAdminDialog(true)} 
                    size="sm"
                    className="h-5 px-2 text-[9px]"
                    style={{
                      background: 'rgba(6, 182, 212, 0.1)',
                      borderColor: 'rgba(6, 182, 212, 0.3)',
                      color: '#06b6d4'
                    }}
                  >
                    <Shield className="w-2.5 h-2.5 ml-0.5" />
                    מנהל
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
                הזן מייל וסיסמה כדי להתחבר כמנהל
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>מייל</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="הזן מייל..."
                  style={{
                    background: '#0f172a',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#f8fafc'
                  }}
                />
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>סיסמה</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  placeholder="הזן סיסמה..."
                  style={{
                    background: '#0f172a',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#f8fafc'
                  }}
                />
              </div>
              
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAdminDialog(false);
                    setEmail("");
                    setPassword("");
                  }}
                  style={{ 
                    borderColor: 'rgba(6, 182, 212, 0.3)', 
                    color: '#94a3b8',
                    background: 'transparent'
                  }}
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
                >
                  <Shield className="w-4 h-4 ml-2" />
                  התחבר
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ThemeSettings open={showThemeSettings} onOpenChange={setShowThemeSettings} />
      </div>
    </UploadStatusProvider>
  </ThemeProvider>
  );
}
