import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { LogIn, Mail, Lock } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!email || !password) return;
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/';
      } else {
        const { error } = await supabase.auth.signUp({ email, password,
          options: { data: { full_name: email.split('@')[0], role: 'predictor' } }
        });
        if (error) throw error;
        toast({ title: 'נרשמת בהצלחה!', description: 'בדוק את האימייל שלך לאישור' });
      }
    } catch (err) {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
      <div className="w-full max-w-md p-8 rounded-2xl" style={{
        background: 'rgba(30, 41, 59, 0.8)',
        border: '1px solid rgba(6, 182, 212, 0.3)',
        boxShadow: '0 0 40px rgba(6, 182, 212, 0.2)'
      }}>
        <div className="text-center mb-8">
          <LogIn className="w-12 h-12 mx-auto mb-3" style={{ color: '#06b6d4' }} />
          <h1 className="text-2xl font-bold" style={{ color: '#f8fafc' }}>
            {mode === 'login' ? 'התחברות' : 'הרשמה'}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>המשחק המדהים בעולם</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>אימייל</label>
            <div className="relative">
              <Mail className="absolute right-3 top-2.5 w-4 h-4" style={{ color: '#64748b' }} />
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" className="pr-9"
                style={{ background: '#0f172a', borderColor: 'rgba(6,182,212,0.3)', color: '#f8fafc' }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>סיסמה</label>
            <div className="relative">
              <Lock className="absolute right-3 top-2.5 w-4 h-4" style={{ color: '#64748b' }} />
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" className="pr-9"
                style={{ background: '#0f172a', borderColor: 'rgba(6,182,212,0.3)', color: '#f8fafc' }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={loading} className="w-full h-11 text-white font-medium"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', boxShadow: '0 0 20px rgba(6,182,212,0.4)' }}>
            {loading ? 'טוען...' : mode === 'login' ? 'התחבר' : 'הירשם'}
          </Button>

          <div className="text-center">
            <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-sm hover:underline" style={{ color: '#06b6d4' }}>
              {mode === 'login' ? 'אין לך חשבון? הירשם' : 'יש לך חשבון? התחבר'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
