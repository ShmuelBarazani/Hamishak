import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Trash2, Shield, Loader2, Mail, User as UserIcon, AlertTriangle, Plus, Crown, Copy } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";

export default function ManageGameParticipants() {
  const [participants, setParticipants] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [participantToDelete, setParticipantToDelete] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  
  const { toast } = useToast();
  const { currentGame } = useGame();

  useEffect(() => {
    loadData();
  }, [currentGame]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [user, users, gameParticipants] = await Promise.all([
        supabase.auth.getUser().then(r => r.data.user),
        db.GameParticipant.filter({}),
        currentGame ? db.GameParticipant.filter({ game_id: currentGame.id }, null, 100) : Promise.resolve([])
      ]);
      
      setCurrentUser(user);
      setAllUsers(users);
      setParticipants(gameParticipants);
      
      if (user.role !== 'admin') {
        toast({
          title: "אין הרשאות",
          description: "רק מנהלים יכולים לגשת לדף זה",
          variant: "destructive"
        });
      }
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

  const handleAddParticipant = async () => {
    if (!selectedUser) {
      toast({
        title: "שגיאה",
        description: "נא לבחור משתמש",
        variant: "destructive"
      });
      return;
    }

    setAdding(true);
    try {
      // בדוק אם כבר קיים
      const existing = participants.find(p => p.user_email === selectedUser);
      if (existing) {
        toast({
          title: "כבר קיים",
          description: "המשתמש כבר משתתף במשחק זה",
          variant: "destructive"
        });
        setAdding(false);
        return;
      }

      await db.GameParticipant.create({
        game_id: currentGame.id,
        user_email: selectedUser,
        role_in_game: "predictor",
        joined_date: new Date().toISOString(),
        is_active: true
      });

      toast({
        title: "נוסף בהצלחה!",
        description: "המשתתף נוסף למשחק",
        className: "bg-green-900/30 border-green-500 text-green-200"
      });

      setShowAddDialog(false);
      setSelectedUser(null);
      await loadData();
    } catch (error) {
      console.error("Error adding participant:", error);
      toast({
        title: "שגיאה",
        description: "הוספת המשתתף נכשלה",
        variant: "destructive"
      });
    }
    setAdding(false);
  };

  const handleDeleteParticipant = async () => {
    if (!participantToDelete) return;

    setDeleting(true);
    try {
      await db.GameParticipant.delete(participantToDelete.id);

      toast({
        title: "נמחק בהצלחה!",
        description: "המשתתף הוסר מהמשחק",
        className: "bg-green-900/30 border-green-500 text-green-200"
      });

      setShowDeleteDialog(false);
      setParticipantToDelete(null);
      await loadData();
    } catch (error) {
      console.error("Error deleting participant:", error);
      toast({
        title: "שגיאה",
        description: "מחיקת המשתתף נכשלה",
        variant: "destructive"
      });
    }
    setDeleting(false);
  };

  const handleToggleRole = async (participant) => {
    try {
      const newRole = participant.role_in_game === 'admin' ? 'predictor' : 'admin';
      await db.GameParticipant.update(participant.id, {
        role_in_game: newRole
      });

      toast({
        title: "עודכן!",
        description: `התפקיד עודכן ל-${newRole === 'admin' ? 'מנהל' : 'מנחש'}`,
        className: "bg-cyan-900/30 border-cyan-500 text-cyan-200"
      });

      await loadData();
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        title: "שגיאה",
        description: "עדכון התפקיד נכשל",
        variant: "destructive"
      });
    }
  };

  const copyJoinLink = () => {
    const joinUrl = `${window.location.origin}${window.location.pathname.replace(/\/[^\/]*$/, '')}#/JoinGame?gameId=${currentGame.id}`;
    navigator.clipboard.writeText(joinUrl);
    
    toast({
      title: "הועתק!",
      description: "קישור ההצטרפות הועתק ללוח",
      className: "bg-cyan-900/30 border-cyan-500 text-cyan-200"
    });
  };

  const handleAddAllUsers = async () => {
    if (availableUsers.length === 0) {
      toast({
        title: "אין משתמשים להוספה",
        description: "כל המשתמשים כבר משתתפים במשחק",
        variant: "destructive"
      });
      return;
    }

    setAddingAll(true);
    try {
      const newParticipants = availableUsers.map(user => ({
        game_id: currentGame.id,
        user_email: user.email,
        role_in_game: "predictor",
        joined_date: new Date().toISOString(),
        is_active: true
      }));

      await db.GameParticipant.bulkCreate(newParticipants);

      toast({
        title: "נוספו בהצלחה!",
        description: `${newParticipants.length} משתמשים נוספו למשחק`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });

      await loadData();
    } catch (error) {
      console.error("Error adding all users:", error);
      toast({
        title: "שגיאה",
        description: "הוספת המשתמשים נכשלה",
        variant: "destructive"
      });
    }
    setAddingAll(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען...</span>
      </div>
    );
  }

  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            אין לך הרשאות לגשת לדף זה. רק מנהלים יכולים לנהל משתתפים.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!currentGame) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            נא לבחור משחק תחילה
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // משתמשים שעדיין לא הצטרפו
  const availableUsers = allUsers.filter(u => 
    !participants.some(p => p.user_email === u.email)
  );

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
                ניהול משתתפי משחק
              </h1>
              <p style={{ color: '#94a3b8' }}>
                משחק: <strong style={{ color: '#06b6d4' }}>{currentGame.game_name}</strong>
              </p>
              <p style={{ color: '#94a3b8' }}>
                סה"כ {participants.length} משתתפים
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={copyJoinLink}
                variant="outline"
                style={{
                  borderColor: 'rgba(6, 182, 212, 0.5)',
                  color: '#06b6d4',
                  background: 'rgba(6, 182, 212, 0.1)'
                }}
              >
                <Copy className="w-4 h-4 ml-2" />
                העתק קישור הצטרפות
              </Button>

              <Button
                onClick={handleAddAllUsers}
                disabled={addingAll || availableUsers.length === 0}
                variant="outline"
                style={{
                  borderColor: 'rgba(16, 185, 129, 0.5)',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.1)'
                }}
              >
                {addingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                    מוסיף...
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 ml-2" />
                    הוסף את כולם ({availableUsers.length})
                  </>
                )}
              </Button>

              <Button
                onClick={() => setShowAddDialog(true)}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                }}
              >
                <Plus className="w-5 h-5 ml-2" />
                הוסף משתתף
              </Button>
            </div>
          </div>
        </div>

        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader>
            <CardTitle style={{ color: '#06b6d4' }}>רשימת משתתפים</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead style={{ 
                  background: '#1e293b',
                  borderBottom: '2px solid rgba(6, 182, 212, 0.3)'
                }}>
                  <tr>
                    <th className="text-right p-4" style={{ color: '#94a3b8' }}>שם</th>
                    <th className="text-right p-4" style={{ color: '#94a3b8' }}>אימייל</th>
                    <th className="text-center p-4" style={{ color: '#94a3b8' }}>תפקיד במשחק</th>
                    <th className="text-center p-4" style={{ color: '#94a3b8' }}>תאריך הצטרפות</th>
                    <th className="text-center p-4" style={{ color: '#94a3b8' }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => {
                    const user = allUsers.find(u => u.email === participant.user_email);
                    
                    return (
                      <tr 
                        key={participant.id} 
                        className="hover:bg-cyan-500/10 transition-colors"
                        style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" style={{ color: '#06b6d4' }} />
                            <span style={{ color: '#f8fafc', fontWeight: '500' }}>
                              {user?.full_name || 'לא ידוע'}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" style={{ color: '#94a3b8' }} />
                            <span style={{ color: '#94a3b8' }}>{participant.user_email}</span>
                          </div>
                        </td>
                        <td className="text-center p-4">
                          {participant.role_in_game === 'admin' ? (
                            <Badge style={{ 
                              background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                              color: 'white',
                              boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)'
                            }}>
                              <Crown className="w-3 h-3 ml-1" />
                              מנהל משחק
                            </Badge>
                          ) : (
                            <Badge style={{ 
                              background: 'rgba(16, 185, 129, 0.2)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                              מנחש
                            </Badge>
                          )}
                        </td>
                        <td className="text-center p-4" style={{ color: '#94a3b8' }}>
                          {new Date(participant.joined_date).toLocaleDateString('he-IL')}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              onClick={() => handleToggleRole(participant)}
                              size="sm"
                              variant="outline"
                              style={{ 
                                borderColor: participant.role_in_game === 'admin' ? '#ef4444' : '#06b6d4',
                                color: participant.role_in_game === 'admin' ? '#fca5a5' : '#06b6d4',
                                background: 'rgba(30, 41, 59, 0.4)'
                              }}
                              className={participant.role_in_game === 'admin' ? 'hover:bg-red-500/20' : 'hover:bg-cyan-500/20'}
                            >
                              <Shield className="w-4 h-4 ml-1" />
                              {participant.role_in_game === 'admin' ? 'הסר מנהל' : 'הפוך למנהל'}
                            </Button>
                            
                            <Button
                              onClick={() => {
                                setParticipantToDelete(participant);
                                setShowDeleteDialog(true);
                              }}
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
                              הסר
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

        {/* דיאלוג הוספת משתתף */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(6, 182, 212, 0.3)'
          }} dir="rtl">
            <DialogHeader>
              <DialogTitle style={{ color: '#06b6d4' }}>הוסף משתתף למשחק</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <Select value={selectedUser || ""} onValueChange={setSelectedUser}>
                <SelectTrigger style={{
                  background: '#0f172a',
                  borderColor: 'rgba(6, 182, 212, 0.3)',
                  color: '#f8fafc'
                }}>
                  <SelectValue placeholder="בחר משתמש..." />
                </SelectTrigger>
                <SelectContent style={{
                  background: '#1e293b',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  color: '#f8fafc'
                }}>
                  {availableUsers.map(user => (
                    <SelectItem 
                      key={user.email} 
                      value={user.email} 
                      style={{ color: '#f8fafc' }}
                      className="hover:bg-cyan-500/20 focus:bg-cyan-500/30"
                    >
                      {user.full_name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddDialog(false);
                    setSelectedUser(null);
                  }}
                  style={{ 
                    borderColor: 'rgba(148, 163, 184, 0.3)', 
                    color: '#94a3b8'
                  }}
                >
                  ביטול
                </Button>
                <Button
                  onClick={handleAddParticipant}
                  disabled={adding || !selectedUser}
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)'
                  }}
                >
                  {adding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                      מוסיף...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 ml-2" />
                      הוסף
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
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }} dir="rtl">
            <DialogHeader>
              <DialogTitle style={{ color: '#ef4444' }}>אזהרה - הסרת משתתף</DialogTitle>
            </DialogHeader>
            
            {participantToDelete && (
              <div className="space-y-4">
                <Alert style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}>
                  <AlertDescription style={{ color: '#fca5a5' }}>
                    האם להסיר את {allUsers.find(u => u.email === participantToDelete.user_email)?.full_name} מהמשחק?
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteDialog(false);
                      setParticipantToDelete(null);
                    }}
                    disabled={deleting}
                    style={{ 
                      borderColor: 'rgba(148, 163, 184, 0.3)', 
                      color: '#94a3b8'
                    }}
                  >
                    ביטול
                  </Button>
                  <Button
                    onClick={handleDeleteParticipant}
                    disabled={deleting}
                    style={{
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                    }}
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin ml-2" />
                        מוחק...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 ml-2" />
                        אשר הסרה
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