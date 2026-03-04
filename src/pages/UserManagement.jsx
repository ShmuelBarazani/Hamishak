import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Trash2, Shield, Loader2, Mail, User as UserIcon, AlertTriangle, Crown, Info, UserPlus, Copy, CheckCircle, Star } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";

const ADMIN_EMAILS = ["tropikan1@gmail.com"];

const isAdmin = (user) => {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.app_metadata?.role === 'admin' ||
    ADMIN_EMAILS.includes(user.email)
  );
};

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
  const [allGames, setAllGames] = useState([]);
  const [userGames, setUserGames] = useState({});
  const [newUser, setNewUser] = useState({ full_name: "", email: "", password: "", role: "predictor" });

  const { toast } = useToast();
  const { currentGame } = useGame();

  useEffect(() => { loadData(); }, [currentGame]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentUserData = await supabase.auth.getUser().then(r => r.data.user);
      setCurrentUser(currentUserData);

      if (!isAdmin(currentUserData)) {
        toast({ title: "אין הרשאות", description: "רק מנהלים יכולים לגשת לדף זה", variant: "destructive" });
        setLoading(false);
        return;
      }

      // ✅ שמות שדות נכונים: participant_name, user_email, role_in_game
      const allParticipants = await db.GameParticipant.filter({}, null, 500);
      setUsers(allParticipants.sort((a, b) =>
        (a.participant_name || '').localeCompare(b.participant_name || '', 'he')
      ));

      const games = await db.Game.filter({}, '-created_at', 100);
      setAllGames(games);

      const gamesMap = {};
      allParticipants.forEach(p => {
        const key = p.user_email || p.participant_name;
        if (!gamesMap[key]) gamesMap[key] = [];
        const game = games.find(g => g.id === p.game_id);
        // ✅ מנע כפילויות — אל תוסיף אם המשחק כבר קיים
        if (game && !gamesMap[key].find(g => g.id === p.game_id)) {
          gamesMap[key].push({ ...game, participant: p });
        }
      });
      setUserGames(gamesMap);
    } catch (error) {
      console.error(error);
      toast({ title: "שגיאה", description: "טעינת הנתונים נכשלה", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleAddUser = () => {
    if (!newUser.full_name.trim()) { toast({ title: "שגיאה", description: "נא למלא שם מלא", variant: "destructive" }); return; }
    if (!newUser.email.trim() || !newUser.email.includes('@')) { toast({ title: "שגיאה", description: "נא למלא אימייל תקין", variant: "destructive" }); return; }
    if (!newUser.password.trim() || newUser.password.length < 6) { toast({ title: "שגיאה", description: "הסיסמה חייבת להכיל לפחות 6 תווים", variant: "destructive" }); return; }
    setShowAddUserDialog(false);
    setShowCredentialsDialog(true);
    setCredentialsCopied(false);
  };

  const copyCredentialsToClipboard = () => {
    const appUrl = window.location.origin;
    const roleText = newUser.role === 'admin' ? 'מנהל' : newUser.role === 'predictor' ? 'מנחש' : 'צופה';
    const text = `🎯 הוזמנת למערכת ניחושי הספורט!\n\n👤 שם: ${newUser.full_name}\n📧 אימייל: ${newUser.email}\n🔒 סיסמה: ${newUser.password}\n👔 תפקיד: ${roleText}\n\n🌐 קישור: ${appUrl}\n\nבהצלחה! 🏆`;
    navigator.clipboard.writeText(text);
    setCredentialsCopied(true);
    toast({ title: "הועתק ללוח!", className: "bg-green-900/30 border-green-500 text-green-200" });
  };

  const handleDeleteUser = (user) => { setUserToDelete(user); setShowDeleteDialog(true); };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    try {
      const predictions = await db.Prediction.filter({ participant_name: userToDelete.participant_name }, null, 10000);
      const BATCH = 10;
      for (let i = 0; i < predictions.length; i += BATCH) {
        await Promise.all(predictions.slice(i, i + BATCH).map(p => db.Prediction.delete(p.id)));
      }
      await db.GameParticipant.delete(userToDelete.id);
      toast({ title: "נמחק בהצלחה!", className: "bg-green-900/30 border-green-500 text-green-200" });
      await loadData();
    } catch (error) {
      toast({ title: "שגיאה", description: "מחיקת המשתמש נכשלה", variant: "destructive" });
    }
    setDeletingUser(false);
    setShowDeleteDialog(false);
    setUserToDelete(null);
  };

  const handleToggleAdmin = async (user) => {
    if (user.user_email === currentUser?.email) {
      toast({ title: "לא ניתן", description: "אינך יכול לשנות את ההרשאות של עצמך", variant: "destructive" });
      return;
    }
    try {
      const newRole = user.role_in_game === 'admin' ? 'predictor' : 'admin';
      await db.GameParticipant.update(user.id, { role_in_game: newRole });
      toast({ title: "עודכן!", className: "bg-cyan-900/30 border-cyan-500 text-cyan-200" });
      await loadData();
    } catch (error) {
      toast({ title: "שגיאה", description: "עדכון ההרשאות נכשל", variant: "destructive" });
    }
  };

  const handleLinkEmail = async (user) => {
    const email = prompt(`הזן אימייל עבור ${user.participant_name}:`);
    if (!email || !email.includes('@')) return;
    try {
      await db.GameParticipant.update(user.id, { user_email: email });
      toast({ title: "קושר!", description: `${user.participant_name} קושר ל-${email}`, className: "bg-green-900/30 border-green-500 text-green-200" });
      await loadData();
    } catch (error) {
      toast({ title: "שגיאה", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען משתמשים...</span>
      </div>
    );
  }

  if (!isAdmin(currentUser)) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>אין לך הרשאות לגשת לדף זה.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const appUrl = window.location.origin;
  const roleText = newUser.role === 'admin' ? 'מנהל' : newUser.role === 'predictor' ? 'מנחש' : 'צופה';
  const platformAdmins = users.filter(u => ADMIN_EMAILS.includes(u.user_email));
  const gameParticipants = users; // כולם מופיעים ברשימה, כולל מנהלי פלטפורמה

  return (
    <div className="min-h-screen p-6" dir="rtl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
      <div className="max-w-6xl mx-auto">

        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3" style={{ color: '#f8fafc', textShadow: '0 0 10px rgba(6, 182, 212, 0.3)' }}>
              <Users className="w-10 h-10" style={{ color: '#06b6d4' }} />
              ניהול משתמשים
            </h1>
            <p style={{ color: '#94a3b8' }}>סה"כ {users.length} משתתפים | {allGames.length} משחקים</p>
          </div>
          <Button onClick={() => setShowAddUserDialog(true)} style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)', boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)' }}>
            <UserPlus className="w-5 h-5 ml-2" />הוסף משתמש חדש
          </Button>
        </div>

        {/* מנהלי פלטפורמה */}
        <Card className="mb-6" style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.4)' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: '#a78bfa' }}>
              <Star className="w-5 h-5" />מנהלי פלטפורמה (Supabase Auth)
              <Badge style={{ background: 'rgba(139, 92, 246, 0.3)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.4)' }}>{ADMIN_EMAILS.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ADMIN_EMAILS.map((email) => {
              const isCurrent = email === currentUser?.email;
              const hasParticipant = platformAdmins.find(u => u.user_email === email);
              return (
                <div key={email} className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold" style={{ color: '#f8fafc' }}>{email}</span>
                        {isCurrent && <Badge style={{ background: '#8b5cf6', color: 'white', fontSize: '10px' }}>את/ה</Badge>}
                      </div>
                      <div className="flex gap-1.5">
                        <Badge style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white', fontSize: '10px' }}>
                          <Star className="w-2.5 h-2.5 ml-1" />מנהל פלטפורמה
                        </Badge>
                        {hasParticipant && (
                          <Badge style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)', fontSize: '10px' }}>
                            + {hasParticipant.participant_name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm" style={{ color: '#64748b' }}>גישה לכל המשחקים</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* משתתפי המשחק */}
        <Card style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
              <Users className="w-5 h-5" />משתמשי המשחק (GameParticipants)
              <Badge style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' }}>{gameParticipants.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead style={{ background: '#1e293b', borderBottom: '2px solid rgba(6, 182, 212, 0.3)' }}>
                  <tr>
                    <th className="text-right p-4" style={{ color: '#94a3b8' }}>שם מלא</th>
                    <th className="text-right p-4" style={{ color: '#94a3b8' }}>אימייל</th>
                    <th className="text-center p-4" style={{ color: '#94a3b8' }}>תפקיד</th>
                    <th className="text-right p-4" style={{ color: '#94a3b8' }}>משחקים</th>
                    <th className="text-center p-4" style={{ color: '#94a3b8' }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {gameParticipants.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center" style={{ color: '#64748b' }}>אין משתמשים רשומים עדיין</td></tr>
                  ) : gameParticipants.map((user) => {
                    const userKey = user.user_email || user.participant_name;
                    const games = userGames[userKey] || [];
                    const isCurrentUser = user.user_email === currentUser?.email;
                    return (
                      <tr key={user.id} className="hover:bg-cyan-500/10" style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" style={{ color: '#06b6d4' }} />
                            <span style={{ color: '#f8fafc', fontWeight: '500' }}>{user.participant_name || '(ללא שם)'}</span>
                            {isCurrentUser && <Badge style={{ background: '#8b5cf6', color: 'white', fontSize: '10px' }}>את/ה</Badge>}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" style={{ color: user.user_email ? '#94a3b8' : '#ef4444' }} />
                            {user.user_email ? (
                              <span style={{ color: '#94a3b8' }}>{user.user_email}</span>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => handleLinkEmail(user)}
                                style={{ color: '#fbbf24', fontSize: '12px', padding: '2px 8px' }}>
                                + קשר אימייל
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="text-center p-4">
                          {user.role_in_game === 'admin' ? (
                            <Badge style={{ background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: 'white' }}>
                              <Shield className="w-3 h-3 ml-1" />מנהל משחק
                            </Badge>
                          ) : user.role_in_game === 'predictor' ? (
                            <Badge style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>מנחש</Badge>
                          ) : (
                            <Badge style={{ background: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)' }}>{user.role_in_game || 'צופה'}</Badge>
                          )}
                        </td>
                        <td className="p-4">
                          {games.length === 0 ? (
                            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>לא רשום למשחקים</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {games.map(g => (
                                <Badge key={g.id} variant="outline" style={{
                                  background: g.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                  color: g.status === 'active' ? '#10b981' : '#64748b',
                                  border: `1px solid ${g.status === 'active' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
                                  fontSize: '0.7rem'
                                }}>
                                  {g.participant?.role_in_game === 'admin' && <Crown className="w-2.5 h-2.5 ml-1" />}
                                  {g.game_name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button onClick={() => handleToggleAdmin(user)} disabled={isCurrentUser} size="sm" variant="outline"
                              style={{ borderColor: user.role_in_game === 'admin' ? '#ef4444' : '#06b6d4', color: user.role_in_game === 'admin' ? '#fca5a5' : '#06b6d4', background: 'rgba(30, 41, 59, 0.4)' }}>
                              <Shield className="w-4 h-4 ml-1" />
                              {user.role_in_game === 'admin' ? 'הסר מנהל' : 'הפוך למנהל'}
                            </Button>
                            <Button onClick={() => handleDeleteUser(user)} disabled={isCurrentUser} size="sm" variant="outline"
                              style={{ borderColor: 'rgba(239, 68, 68, 0.5)', color: '#fca5a5', background: 'rgba(30, 41, 59, 0.4)' }}>
                              <Trash2 className="w-4 h-4 ml-1" />מחק
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

        {/* דיאלוג הוספה */}
        <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
          <DialogContent style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(6, 182, 212, 0.3)' }} dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: '#06b6d4' }}>
                <UserPlus className="w-6 h-6" />הוספת משתמש חדש
              </DialogTitle>
              <DialogDescription style={{ color: '#94a3b8' }}>הזן פרטי משתמש — המערכת תציג פרטי התחברות להעתקה</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {[
                { label: 'שם מלא', key: 'full_name', type: 'text', placeholder: 'הזן שם מלא...' },
                { label: 'אימייל', key: 'email', type: 'email', placeholder: 'example@email.com' },
                { label: 'סיסמה', key: 'password', type: 'text', placeholder: 'לפחות 6 תווים...' }
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>{label}</label>
                  <Input type={type} value={newUser[key]} onChange={(e) => setNewUser({ ...newUser, [key]: e.target.value })}
                    placeholder={placeholder} style={{ background: '#0f172a', borderColor: 'rgba(6, 182, 212, 0.3)', color: '#f8fafc' }} />
                </div>
              ))}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>תפקיד</label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger style={{ background: '#0f172a', borderColor: 'rgba(6, 182, 212, 0.3)', color: '#f8fafc' }}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ background: '#1e293b', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                    <SelectItem value="predictor" style={{ color: '#f8fafc' }}>מנחש</SelectItem>
                    <SelectItem value="viewer" style={{ color: '#f8fafc' }}>צופה</SelectItem>
                    <SelectItem value="admin" style={{ color: '#f8fafc' }}>מנהל משחק</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => { setShowAddUserDialog(false); setNewUser({ full_name: "", email: "", password: "", role: "predictor" }); }}
                  style={{ borderColor: 'rgba(148, 163, 184, 0.3)', color: '#94a3b8', background: 'transparent' }}>ביטול</Button>
                <Button onClick={handleAddUser} style={{ background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: 'white' }}>
                  <CheckCircle className="w-4 h-4 ml-2" />הצג פרטים
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* דיאלוג פרטי כניסה */}
        <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
          <DialogContent style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(6, 182, 212, 0.3)' }} dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: '#06b6d4' }}>
                <UserPlus className="w-6 h-6" />פרטי משתמש חדש
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 rounded-lg" style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                <div className="space-y-3 font-mono text-sm" style={{ color: '#f8fafc' }}>
                  <div><span style={{ color: '#94a3b8' }}>👤 שם:</span> <strong>{newUser.full_name}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>📧 אימייל:</span> <strong>{newUser.email}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>🔒 סיסמה:</span> <strong>{newUser.password}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>👔 תפקיד:</span> <strong>{roleText}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>🌐 קישור:</span> <span className="text-xs break-all" style={{ color: '#06b6d4' }}>{appUrl}</span></div>
                </div>
              </div>
              <Alert style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                <AlertDescription style={{ color: '#fbbf24', fontSize: '13px' }}>
                  ⚠️ המשתמש יצטרך להירשם באתר עם האימייל הזה, ואז לבחור את שמו מהרשימה.
                </AlertDescription>
              </Alert>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => { setShowCredentialsDialog(false); setNewUser({ full_name: "", email: "", password: "", role: "predictor" }); }}
                  style={{ borderColor: 'rgba(148, 163, 184, 0.3)', color: '#94a3b8', background: 'transparent' }}>סגור</Button>
                <Button onClick={copyCredentialsToClipboard}
                  style={{ background: credentialsCopied ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: 'white' }}>
                  {credentialsCopied ? <><CheckCircle className="w-4 h-4 ml-2" />הועתק! ✓</> : <><Copy className="w-4 h-4 ml-2" />העתק פרטים</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* דיאלוג מחיקה */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(239, 68, 68, 0.3)' }} dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: '#ef4444' }}>
                <AlertTriangle className="w-6 h-6" />אזהרה - מחיקת משתמש
              </DialogTitle>
              <DialogDescription style={{ color: '#94a3b8' }}>פעולה זו תמחק את המשתמש וכל הניחושים שלו. <strong>לא ניתן לבטל!</strong></DialogDescription>
            </DialogHeader>
            {userToDelete && (
              <div className="space-y-4">
                <Alert style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <AlertDescription style={{ color: '#fca5a5' }}>
                    <p className="font-bold mb-1">המשתמש שיימחק:</p>
                    <p>{userToDelete.participant_name} — {userToDelete.user_email || 'ללא אימייל'}</p>
                  </AlertDescription>
                </Alert>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setUserToDelete(null); }} disabled={deletingUser}
                    style={{ borderColor: 'rgba(148, 163, 184, 0.3)', color: '#94a3b8', background: 'transparent' }}>ביטול</Button>
                  <Button onClick={confirmDelete} disabled={deletingUser}
                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}>
                    {deletingUser ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />מוחק...</> : <><Trash2 className="w-4 h-4 ml-2" />אשר מחיקה</>}
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
