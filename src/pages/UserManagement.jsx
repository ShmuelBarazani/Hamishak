import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Trash2, Shield, Loader2, Mail, User as UserIcon, AlertTriangle, Crown, Info, UserPlus, Copy, CheckCircle } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { Prediction } from "@/entities/all";
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext"; // Fixed import path

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false); 
  const [userToDelete, setUserToDelete] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [credentialsCopied, setCredentialsCopied] = useState(false); 
  
  // 🆕 נתוני משחקים
  const [allGames, setAllGames] = useState([]);
  const [userGames, setUserGames] = useState({}); // { user_email: [games] }
  
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "predictor"
  });
  
  const { toast } = useToast();
  const { currentGame } = useGame();

  useEffect(() => {
    loadData();
  }, [currentGame]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [currentUserData, allUsers] = await Promise.all([
        supabase.auth.getUser().then(r => r.data.user),
        db.GameParticipant.filter({})
      ]);
      
      setCurrentUser(currentUserData);
      
      const userRole = currentUserData?.user_metadata?.role || currentUserData?.role;
      if (userRole !== 'admin') {
        toast({
          title: "אין הרשאות",
          description: "רק מנהלים יכולים לגשת לדף זה",
          variant: "destructive"
        });
        setLoading(false); // Make sure loading is set to false even on early exit
        return;
      }

      // 🔥 Dedup: עדיפות לרשומה עם אימייל; משתמשים ללא אימייל מקובצים לפי שם
      const uniqueByEmail = {};   // email → record
      const uniqueByName  = {};   // participant_name (no email) → record
      
      allUsers.forEach(u => {
        if (u.user_email) {
          // יש אימייל — dedup לפי אימייל
          if (!uniqueByEmail[u.user_email]) {
            uniqueByEmail[u.user_email] = u;
          } else {
            const existing = uniqueByEmail[u.user_email];
            const existingHasName = !!(existing.participant_name && existing.participant_name !== existing.user_email);
            const newHasName = !!(u.participant_name && u.participant_name !== u.user_email);
            if ((!existingHasName && newHasName) || u.role_in_game === 'admin') {
              uniqueByEmail[u.user_email] = u;
            }
          }
        } else if (u.participant_name) {
          // אין אימייל — dedup לפי שם (משתתפים ממיגרציה)
          if (!uniqueByName[u.participant_name]) {
            uniqueByName[u.participant_name] = u;
          }
        }
      });

      // שלב: כל המשתמשים — עם אימייל + ללא אימייל (כולם, ללא סינון לפי שם)
      const uniqueUsers = [...Object.values(uniqueByEmail), ...Object.values(uniqueByName)]
        .sort((a, b) => (a.participant_name || '').localeCompare(b.participant_name || '', 'he'));
      setUsers(uniqueUsers);
      
      // 🆕 טען את כל המשחקים והמשתתפים
      const [games, participants] = await Promise.all([
        db.Game.filter({}, '-created_at', 100),
        db.GameParticipant.filter({}, null, 1000)
      ]);
      
      setAllGames(games);
      
      // מיפוי משחקים לפי משתמש
      const gamesMap = {};
      participants.forEach(p => {
        if (!gamesMap[p.user_email]) {
          gamesMap[p.user_email] = [];
        }
        const game = games.find(g => g.id === p.game_id);
        if (game) {
          gamesMap[p.user_email].push({
            ...game,
            participant: p
          });
        }
      });
      setUserGames(gamesMap);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "שגיאה",
        description: "טעינת הנתונים נכשלה",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleAddUser = async () => {
    // בדיקות תקינות
    if (!newUser.full_name.trim()) {
      toast({
        title: "שגיאה",
        description: "נא למלא שם מלא",
        variant: "destructive"
      });
      return;
    }

    if (!newUser.email.trim() || !newUser.email.includes('@')) {
      toast({
        title: "שגיאה",
        description: "נא למלא אימייל תקין",
        variant: "destructive"
      });
      return;
    }

    if (!newUser.password.trim() || newUser.password.length < 6) {
      toast({
        title: "שגיאה",
        description: "הסיסמה חייבת להכיל לפחות 6 תווים",
        variant: "destructive"
      });
      return;
    }

    // הצג חלון עם הפרטים במקום לשלוח מייל
    setShowAddUserDialog(false);
    setShowCredentialsDialog(true);
    setCredentialsCopied(false); // Reset copy status when opening
  };

  const copyCredentialsToClipboard = () => {
    const appUrl = window.location.origin + window.location.pathname;
    const roleText = newUser.role === 'admin' ? 'מנהל' : newUser.role === 'predictor' ? 'מנחש' : 'צופה';
    
    const credentialsText = `🎯 הוזמנת להצטרף למערכת ניחושי הספורט!

👤 שם: ${newUser.full_name}
📧 אימייל: ${newUser.email}
🔒 סיסמה: ${newUser.password}
👔 תפקיד: ${roleText}

🌐 כניסה למערכת:
${appUrl}

📝 הוראות:
1. היכנס לקישור למעלה
2. לחץ על "התחבר/הירשם"
3. הזן את האימייל והסיסמה
4. התחל לנחש!

⚠️ חשוב: שמור את הפרטים במקום בטוח.

בהצלחה! 🏆`;

    navigator.clipboard.writeText(credentialsText);
    setCredentialsCopied(true);
    
    toast({
      title: "הועתק ללוח!",
      description: "כעת תוכל לשלוח את הפרטים ב-WhatsApp או SMS",
      className: "bg-green-900/30 border-green-500 text-green-200"
    });
  };

  const closeCredentialsDialog = () => {
    setShowCredentialsDialog(false);
    setNewUser({
      full_name: "",
      email: "",
      password: "",
      role: "predictor"
    });
  };

  const handleDeleteUser = async (user) => {
    setUserToDelete(user);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;

    setDeletingUser(true);
    try {
      const predictions = await Prediction.filter({ 
        participant_name: userToDelete.participant_name || userToDelete.user_email 
      }, null, 10000);
      
      for (const pred of predictions) {
        await Prediction.delete(pred.id);
      }

      // 🔥 מחק את כל הרשומות של המשתמש בכל המשחקים
      const allRecords = await db.GameParticipant.filter({ user_email: userToDelete.user_email }, null, 1000);
      for (const rec of allRecords) {
        await db.GameParticipant.delete(rec.id);
      }

      toast({
        title: "נמחק בהצלחה!",
        description: `המשתמש ${userToDelete.participant_name || userToDelete.user_email} וכל הניחושים שלו נמחקו`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });

      await loadData();
      
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        title: "שגיאה",
        description: "מחיקת המשתמש נכשלה",
        variant: "destructive"
      });
    }
    
    setDeletingUser(false);
    setShowDeleteDialog(false);
    setUserToDelete(null);
  };

  const handleToggleAdmin = async (user) => {
    if (user.id === currentUser.id) {
      toast({
        title: "לא ניתן",
        description: "אינך יכול לשנות את ההרשאות של עצמך",
        variant: "destructive"
      });
      return;
    }

    try {
      const newRole = user.role_in_game === 'admin' ? 'predictor' : 'admin';
      await db.GameParticipant.update(user.id, { role_in_game: newRole });

      toast({
        title: "עודכן!",
        description: `${user.participant_name || user.user_email || '—'} ${newRole === 'admin' ? 'הוגדר כמנהל' : 'הוסר מהרשאות מנהל'}`,
        className: "bg-cyan-900/30 border-cyan-500 text-cyan-200"
      });

      await loadData();
    } catch (error) {
      console.error("Error updating user role:", error);
      toast({
        title: "שגיאה",
        description: "עדכון ההרשאות נכשל",
        variant: "destructive"
      });
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען משתמשים...</span>
      </div>
    );
  }

  const userRole = currentUser?.user_metadata?.role || currentUser?.role;
  if (userRole !== 'admin') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            אין לך הרשאות לגשת לדף זה. רק מנהלים יכולים לנהל משתמשים.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const appUrl = window.location.origin + window.location.pathname;
  const roleText = newUser.role === 'admin' ? 'מנהל' : newUser.role === 'predictor' ? 'מנחש' : 'צופה';

  return (
    <div className="min-h-screen p-6" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold mb-2 flex items-center gap-3" style={{ 
                color: '#f8fafc',
                textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
              }}>
                <Users className="w-10 h-10" style={{ color: '#06b6d4' }} />
                ניהול משתמשים
              </h1>
              <p style={{ color: '#94a3b8' }}>
                סה"כ {users.length} משתמשים במערכת | {allGames.length} משחקים
              </p>
            </div>

            <Button
              onClick={() => setShowAddUserDialog(true)}
              style={{
                background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
              }}
            >
              <UserPlus className="w-5 h-5 ml-2" />
              הוסף משתמש חדש
            </Button>
          </div>

          <Alert className="mt-6" style={{
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.3)'
          }}>
            <Info className="w-4 h-4" style={{ color: '#06b6d4' }} />
            <AlertDescription style={{ color: '#94a3b8' }}>
              <p className="font-semibold mb-2" style={{ color: '#06b6d4' }}>איך זה עובד?</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>לחץ על "הוסף משתמש חדש" והזן פרטים</li>
                <li>המערכת תציג לך את הפרטים + כפתור להעתקה</li>
                <li>העתק ושלח למשתמש ב-WhatsApp/SMS</li>
                <li>המשתמש יירשם בעצמו דרך מסך ההתחברות</li>
              </ol>
            </AlertDescription>
          </Alert>
        </div>

        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader>
            <CardTitle style={{ color: '#06b6d4' }}>רשימת משתמשים</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead style={{ 
                  background: '#1e293b',
                  borderBottom: '2px solid rgba(6, 182, 212, 0.3)'
                }}>
                  <tr>
                    <th className="text-right p-4" style={{ color: '#94a3b8' }}>שם מלא</th>
                    <th className="text-right p-4" style={{ color: '#94a3b8' }}>אימייל</th>
                    <th className="text-center p-4" style={{ color: '#94a3b8' }}>תפקיד מערכת</th>
                    <th className="text-right p-4" style={{ color: '#94a3b8' }}>משחקים נרשמים</th>
                    <th className="text-center p-4" style={{ color: '#94a3b8' }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const games = userGames[user.user_email] || [];
                    
                    return (
                      <tr 
                        key={user.id} 
                        className="hover:bg-cyan-500/10 transition-colors"
                        style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" style={{ color: '#06b6d4' }} />
                            <span style={{ color: '#f8fafc', fontWeight: '500' }}>
                              {user.participant_name || user.user_email || '—'}
                            </span>
                            {user.id === currentUser.id && (
                              <Badge className="text-xs" style={{ 
                                background: '#8b5cf6',
                                color: 'white'
                              }}>
                                את/ה
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" style={{ color: '#94a3b8' }} />
                            <span style={{ color: '#94a3b8' }}>{user.user_email || '—'}</span>
                          </div>
                        </td>
                        <td className="text-center p-4">
                          {user.role_in_game === 'admin' ? (
                            <Badge className="text-white" style={{ 
                              background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                              boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)'
                            }}>
                              <Shield className="w-3 h-3 ml-1" />
                              מנהל מערכת
                            </Badge>
                          ) : (
                            <Badge style={{ 
                              background: 'rgba(148, 163, 184, 0.2)',
                              color: '#94a3b8',
                              border: '1px solid rgba(148, 163, 184, 0.3)'
                            }}>
                              משתמש רגיל
                            </Badge>
                          )}
                        </td>
                        
                        <td className="p-4">
                          {games.length === 0 ? (
                            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>לא רשום למשחקים</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {games.map(g => {
                                // חישוב סטטוס דינמי לפי תאריכים
                                const now = new Date();
                                const isActive = g.status === 'active' || 
                                  (g.start_date && g.end_date && 
                                   new Date(g.start_date) <= now && 
                                   new Date(g.end_date) >= now);
                                
                                return (
                                  <Badge 
                                    key={g.id}
                                    variant="outline"
                                    style={{ 
                                      background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                      color: isActive ? '#10b981' : '#64748b',
                                      border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
                                      fontSize: '0.7rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '2px'
                                    }}
                                  >
                                    {g.participant.role_in_game === 'admin' && (
                                      <Crown className="w-2.5 h-2.5" />
                                    )}
                                    {g.game_name}
                                    <span style={{ 
                                      opacity: 0.7,
                                      fontSize: '0.65rem',
                                      marginRight: '2px'
                                    }}>
                                      ({isActive ? 'פעיל' : 'סגור'})
                                    </span>
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              onClick={() => handleToggleAdmin(user)}
                              disabled={user.id === currentUser.id}
                              size="sm"
                              variant="outline"
                              style={{ 
                                borderColor: user.role_in_game === 'admin' ? '#ef4444' : '#06b6d4',
                                color: user.role_in_game === 'admin' ? '#fca5a5' : '#06b6d4',
                                background: 'rgba(30, 41, 59, 0.4)'
                              }}
                              className={user.role_in_game === 'admin' ? 'hover:bg-red-500/20' : 'hover:bg-cyan-500/20'}
                            >
                              <Shield className="w-4 h-4 ml-1" />
                              {user.role_in_game === 'admin' ? 'הסר מנהל' : 'הפוך למנהל'}
                            </Button>
                            
                            <Button
                              onClick={() => handleDeleteUser(user)}
                              disabled={user.id === currentUser.id}
                              size="sm"
                              variant="outline"
                              style={{ 
                                borderColor: 'rgba(239, 68, 68, 0.5)',
                                color: '#fca5a5',
                                background: 'rgba(30, 41, 59, 0.4)'
                              }}
                              className="hover:bg-red-500/20"
                            >
                              <Trash2 className="w-4 h-4 ml-1" />
                              מחק
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* דיאלוג הוספת משתמש חדש */}
        <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
          <DialogContent style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            boxShadow: '0 0 40px rgba(6, 182, 212, 0.2)'
          }} dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: '#06b6d4' }}>
                <UserPlus className="w-6 h-6" />
                הוספת משתמש חדש
              </DialogTitle>
              <DialogDescription style={{ color: '#94a3b8' }}>
                הזן פרטי משתמש והמערכת תציג לך את פרטי ההתחברות להעתקה
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>שם מלא</label>
                <Input
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                  placeholder="הזן שם מלא..."
                  style={{
                    background: '#0f172a',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#f8fafc'
                  }}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>אימייל</label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="example@email.com"
                  style={{
                    background: '#0f172a',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#f8fafc'
                  }}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>סיסמה</label>
                <Input
                  type="text"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  placeholder="לפחות 6 תווים..."
                  style={{
                    background: '#0f172a',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#f8fafc'
                  }}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>תפקיד</label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser({...newUser, role: value})}>
                  <SelectTrigger style={{
                    background: '#0f172a',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#f8fafc'
                  }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{
                    background: '#1e293b',
                    border: '1px solid rgba(6, 182, 212, 0.3)'
                  }}>
                    <SelectItem value="predictor" style={{ color: '#f8fafc' }}>מנחש</SelectItem>
                    <SelectItem value="viewer" style={{ color: '#f8fafc' }}>צופה</SelectItem>
                    <SelectItem value="admin" style={{ color: '#f8fafc' }}>מנהל</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddUserDialog(false);
                    setNewUser({ full_name: "", email: "", password: "", role: "predictor" });
                  }}
                  style={{ 
                    borderColor: 'rgba(148, 163, 184, 0.3)', 
                    color: '#94a3b8',
                    background: 'transparent'
                  }}
                >
                  ביטול
                </Button>
                <Button
                  onClick={handleAddUser}
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                    color: 'white',
                    boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                  }}
                >
                  <CheckCircle className="w-4 h-4 ml-2" />
                  הצג פרטים
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* דיאלוג הצגת פרטי התחברות */}
        <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
          <DialogContent style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            boxShadow: '0 0 40px rgba(6, 182, 212, 0.2)'
          }} dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: '#06b6d4' }}>
                <UserPlus className="w-6 h-6" />
                פרטי משתמש חדש - מוכן לשליחה!
              </DialogTitle>
              <DialogDescription style={{ color: '#94a3b8' }}>
                העתק את הפרטים ושלח למשתמש ב-WhatsApp או SMS
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="p-4 rounded-lg" style={{
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.3)'
              }}>
                <div className="space-y-3 font-mono text-sm" style={{ color: '#f8fafc' }}>
                  <div>
                    <span style={{ color: '#94a3b8' }}>👤 שם:</span>
                    <span className="mr-2 font-bold">{newUser.full_name}</span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>📧 אימייל:</span>
                    <span className="mr-2 font-bold">{newUser.email}</span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>🔒 סיסמה:</span>
                    <span className="mr-2 font-bold">{newUser.password}</span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>👔 תפקיד:</span>
                    <span className="mr-2 font-bold">{roleText}</span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>🌐 קישור:</span>
                    <span className="mr-2 text-xs break-all" style={{ color: '#06b6d4' }}>{appUrl}</span>
                  </div>
                </div>
              </div>

              <Alert style={{
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)'
              }}>
                <AlertDescription style={{ color: '#fdba74' }}>
                  <strong>חשוב:</strong> לחץ על "העתק פרטים" ושלח למשתמש. המשתמש צריך להירשם בעצמו דרך מסך ההתחברות עם הפרטים האלה.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={closeCredentialsDialog}
                  style={{ 
                    borderColor: 'rgba(148, 163, 184, 0.3)', 
                    color: '#94a3b8',
                    background: 'transparent'
                  }}
                >
                  סגור
                </Button>
                <Button
                  onClick={copyCredentialsToClipboard}
                  style={{
                    background: credentialsCopied 
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                    color: 'white',
                    boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                  }}
                >
                  {credentialsCopied ? (
                    <>
                      <CheckCircle className="w-4 h-4 ml-2" />
                      הועתק! ✓
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 ml-2" />
                      העתק פרטים
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* דיאלוג מחיקה */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 0 40px rgba(239, 68, 68, 0.2)'
          }} dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: '#ef4444' }}>
                <AlertTriangle className="w-6 h-6" />
                אזהרה - מחיקת משתמש
              </DialogTitle>
              <DialogDescription style={{ color: '#94a3b8' }}>
                פעולה זו תמחק את המשתמש וכל הניחושים שלו. <strong>לא ניתן לבטל!</strong>
              </DialogDescription>
            </DialogHeader>
            
            {userToDelete && (
              <div className="space-y-4">
                <Alert style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}>
                  <AlertDescription style={{ color: '#fca5a5' }}>
                    <p className="font-bold mb-2">המשתמש שיימחק:</p>
                    <p>שם: {userToDelete.participant_name || userToDelete.user_email}</p>
                    <p>אימייל: {userToDelete.email}</p>
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteDialog(false);
                      setUserToDelete(null);
                    }}
                    disabled={deletingUser}
                    style={{ 
                      borderColor: 'rgba(148, 163, 184, 0.3)', 
                      color: '#94a3b8',
                      background: 'transparent'
                    }}
                  >
                    ביטול
                  </Button>
                  <Button
                    onClick={confirmDelete}
                    disabled={deletingUser}
                    style={{
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: 'white'
                    }}
                  >
                    {deletingUser ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin ml-2" />
                        מוחק...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 ml-2" />
                        אשר מחיקה
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
