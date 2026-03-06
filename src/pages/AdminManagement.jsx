import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Plus, Trash2, Loader2, Users, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const STORAGE_KEY = "toto_admin_users";

export default function AdminManagement() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [showMainAdminPassword, setShowMainAdminPassword] = useState(false);
  const { toast } = useToast();

  const MAIN_ADMIN = {
    email: "admin@toto.com",
    password: "champ11"
  };

  useEffect(() => {
    const currentAdminEmail = localStorage.getItem("toto_admin_email");
    setIsMainAdmin(currentAdminEmail === MAIN_ADMIN.email);

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setAdmins(JSON.parse(stored));
      }
    } catch (e) {
      setAdmins([]);
    }
    setLoading(false);
  }, []);

  const saveAdmins = (updatedAdmins) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAdmins));
  };

  const handleAddAdmin = async () => {
    if (!newEmail.trim() || !newPassword.trim()) {
      toast({ title: "שגיאה", description: "נא למלא מייל וסיסמה", variant: "destructive" });
      return;
    }
    if (admins.some(a => a.email === newEmail.trim())) {
      toast({ title: "שגיאה", description: "מייל זה כבר קיים ברשימה", variant: "destructive" });
      return;
    }
    if (newEmail.trim() === MAIN_ADMIN.email) {
      toast({ title: "שגיאה", description: "לא ניתן להוסיף את המנהל הראשי", variant: "destructive" });
      return;
    }

    setSaving(true);
    const updatedAdmins = [
      ...admins,
      { email: newEmail.trim(), password: newPassword.trim(), created_at: new Date().toISOString() }
    ];
    saveAdmins(updatedAdmins);
    setAdmins(updatedAdmins);
    setNewEmail("");
    setNewPassword("");
    toast({ title: "הצלחה!", description: "המנהל נוסף בהצלחה", className: "bg-green-100 text-green-800" });
    setSaving(false);
  };

  const handleRemoveAdmin = (email) => {
    if (!window.confirm(`האם למחוק את המנהל ${email}?`)) return;
    const updatedAdmins = admins.filter(a => a.email !== email);
    saveAdmins(updatedAdmins);
    setAdmins(updatedAdmins);
    toast({ title: "הצלחה!", description: "המנהל הוסר בהצלחה", className: "bg-green-100 text-green-800" });
  };

  const togglePasswordVisibility = (email) => {
    setVisiblePasswords(prev => ({ ...prev, [email]: !prev[email] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <span className="mr-3 text-cyan-300">טוען...</span>
      </div>
    );
  }

  if (!isMainAdmin) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-screen" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Alert style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5'
        }} className="max-w-md">
          <Shield className="w-4 h-4" />
          <AlertDescription>רק המנהל הראשי יכול לנהל מנהלים</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl" style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      minHeight: '100vh'
    }}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3" style={{
          color: '#f8fafc',
          textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
        }}>
          <Users className="w-8 h-8" style={{ color: '#06b6d4' }} />
          ניהול מנהלים
        </h1>
        <p style={{ color: '#94a3b8' }}>הוסף או הסר משתמשי מנהל נוספים למערכת</p>
      </div>

      <Card className="mb-6" style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
            <Plus className="w-5 h-5" />
            הוסף מנהל חדש
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>מייל</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="example@email.com"
                style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', color: '#f8fafc' }}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>סיסמה</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="הזן סיסמה..."
                style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', color: '#f8fafc' }}
                onKeyPress={(e) => e.key === 'Enter' && handleAddAdmin()}
              />
            </div>
          </div>
          <Button
            onClick={handleAddAdmin}
            disabled={saving}
            style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)', boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)' }}
            className="text-white"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />מוסיף...</> : <><Plus className="w-4 h-4 ml-2" />הוסף מנהל</>}
          </Button>
        </CardContent>
      </Card>

      <Card style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', backdropFilter: 'blur(10px)' }}>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
            <Shield className="w-5 h-5" />
            מנהלים במערכת ({admins.length + 1})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* המנהל הראשי */}
            <div className="p-4 rounded-lg flex items-center justify-between" style={{
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <div className="flex items-center gap-3 flex-1">
                <Shield className="w-5 h-5" style={{ color: '#06b6d4' }} />
                <div className="flex-1">
                  <p className="font-medium" style={{ color: '#f8fafc' }}>{MAIN_ADMIN.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs" style={{ color: '#94a3b8' }}>
                      סיסמה: {showMainAdminPassword ? MAIN_ADMIN.password : '••••••••'}
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setShowMainAdminPassword(!showMainAdminPassword)}
                      className="h-5 w-5 p-0" style={{ color: '#94a3b8' }}>
                      {showMainAdminPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>מנהל ראשי</p>
                </div>
              </div>
              <div className="px-3 py-1 rounded text-xs font-medium" style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4' }}>קבוע</div>
            </div>

            {admins.length === 0 ? (
              <div className="text-center py-8" style={{ color: '#94a3b8' }}>אין מנהלים נוספים במערכת</div>
            ) : (
              admins.map((admin) => (
                <div key={admin.email} className="p-4 rounded-lg flex items-center justify-between" style={{
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid rgba(6, 182, 212, 0.1)'
                }}>
                  <div className="flex items-center gap-3 flex-1">
                    <Shield className="w-5 h-5" style={{ color: '#94a3b8' }} />
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: '#f8fafc' }}>{admin.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs" style={{ color: '#94a3b8' }}>
                          סיסמה: {visiblePasswords[admin.email] ? admin.password : '••••••••'}
                        </p>
                        <Button variant="ghost" size="sm" onClick={() => togglePasswordVisibility(admin.email)}
                          className="h-5 w-5 p-0" style={{ color: '#94a3b8' }}>
                          {visiblePasswords[admin.email] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </Button>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                        נוצר ב-{new Date(admin.created_at).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => handleRemoveAdmin(admin.email)} disabled={saving}
                    variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
