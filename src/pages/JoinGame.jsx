import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Trophy, CheckCircle, AlertTriangle, Users } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";

export default function JoinGame() {
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [game, setGame] = useState(null);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [error, setError] = useState(null);
  
  const { toast } = useToast();
  const navigate = useNavigate();

  // קבל game_id מה-URL
  const urlParams = new URLSearchParams(window.location.search);
  const gameId = urlParams.get('gameId');

  useEffect(() => {
    loadData();
  }, [gameId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. בדוק אם יש game_id
      if (!gameId) {
        setError("לא צוין משחק להצטרפות");
        setLoading(false);
        return;
      }

      // 2. טען את המשחק
      const games = await db.Game.filter({ id: gameId }, null, 1);
      if (games.length === 0) {
        setError("המשחק לא נמצא");
        setLoading(false);
        return;
      }
      setGame(games[0]);

      // 3. בדוק אם המשתמש מחובר
      const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
      if (!isAuth) {
        // אם לא מחובר - הצג הודעה והמתן להתחברות
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      // 4. טען את המשתמש
      const user = await supabase.auth.getUser().then(r => r.data.user);
      setCurrentUser(user);

      // 5. בדוק אם המשתמש כבר הצטרף
      const existingParticipation = await db.GameParticipant.filter({
        game_id: gameId,
        user_email: user.email
      }, null, 1);

      if (existingParticipation.length > 0) {
        setAlreadyJoined(true);
      }

    } catch (error) {
      console.error("Error loading data:", error);
      setError("שגיאה בטעינת הנתונים");
    }

    setLoading(false);
  };

  const handleJoin = async () => {
    setJoining(true);

    try {
      // יצור רשומת GameParticipant
      await db.GameParticipant.create({
        game_id: gameId,
        user_email: currentUser.email,
        role_in_game: "predictor",
        joined_date: new Date().toISOString(),
        is_active: true
      });

      toast({
        title: "הצטרפת בהצלחה!",
        description: `הצטרפת למשחק ${game.game_name}`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });

      // מעבר לדף מילוי ניחושים
      setTimeout(() => {
        navigate(createPageUrl("PredictionForm") + `?gameId=${gameId}`);
      }, 1500);

    } catch (error) {
      console.error("Error joining game:", error);
      toast({
        title: "שגיאה",
        description: "ההצטרפות למשחק נכשלה",
        variant: "destructive"
      });
    }

    setJoining(false);
  };

  const handleLogin = () => {
    // שמור את ה-URL הנוכחי כדי לחזור אליו אחרי ההתחברות
    window.location.href = '/login'; //window.location.href);
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

  if (error) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center" dir="rtl" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Card className="max-w-md" style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          <CardContent className="p-6">
            <Alert style={{ 
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              <AlertTriangle className="w-4 h-4" style={{ color: '#ef4444' }} />
              <AlertDescription style={{ color: '#fca5a5' }}>
                {error}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // אם לא מחובר - בקש התחברות
  if (!currentUser) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center" dir="rtl" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Card className="max-w-md" style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.3)'
        }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3" style={{ color: '#06b6d4' }}>
              <Trophy className="w-8 h-8" />
              הצטרפות למשחק
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-6 rounded-lg" style={{
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.2)'
            }}>
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#f8fafc' }}>
                {game?.game_name}
              </h2>
              {game?.game_subtitle && (
                <p style={{ color: '#06b6d4' }}>{game.game_subtitle}</p>
              )}
            </div>

            <Alert style={{
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <AlertDescription style={{ color: '#94a3b8' }}>
                על מנת להצטרף למשחק, עליך להיות מחובר למערכת
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleLogin}
              className="w-full"
              size="lg"
              style={{
                background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
              }}
            >
              <Users className="w-5 h-5 ml-2" />
              התחבר / הירשם
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // אם כבר הצטרף
  if (alreadyJoined) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center" dir="rtl" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Card className="max-w-md" style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3" style={{ color: '#10b981' }}>
              <CheckCircle className="w-8 h-8" />
              כבר הצטרפת!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-6 rounded-lg" style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#f8fafc' }}>
                {game?.game_name}
              </h2>
              {game?.game_subtitle && (
                <p style={{ color: '#10b981' }}>{game.game_subtitle}</p>
              )}
            </div>

            <Alert style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
              <AlertDescription style={{ color: '#94a3b8' }}>
                את/ה כבר משתתף/ת במשחק זה!
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => navigate(createPageUrl("PredictionForm") + `?gameId=${gameId}`)}
              className="w-full"
              size="lg"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
              }}
            >
              מעבר למילוי ניחושים
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // טופס הצטרפות
  return (
    <div className="min-h-screen p-6 flex items-center justify-center" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }}>
      <Card className="max-w-md" style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.3)'
      }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-3" style={{ color: '#06b6d4' }}>
            <Trophy className="w-8 h-8" />
            הצטרפות למשחק
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center p-6 rounded-lg" style={{
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.2)'
          }}>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#f8fafc' }}>
              {game?.game_name}
            </h2>
            {game?.game_subtitle && (
              <p className="mb-4" style={{ color: '#06b6d4' }}>{game.game_subtitle}</p>
            )}
            {game?.game_description && (
              <p className="text-sm" style={{ color: '#94a3b8' }}>{game.game_description}</p>
            )}
          </div>

          <div className="p-4 rounded-lg" style={{
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(6, 182, 212, 0.1)'
          }}>
            <p className="text-sm mb-2" style={{ color: '#94a3b8' }}>מחובר כ:</p>
            <p className="font-bold" style={{ color: '#f8fafc' }}>{currentUser.full_name}</p>
            <p className="text-sm" style={{ color: '#06b6d4' }}>{currentUser.email}</p>
          </div>

          <Alert style={{
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.3)'
          }}>
            <AlertDescription style={{ color: '#94a3b8' }}>
              לחיצה על "הצטרף" תוסיף אותך כמשתתף במשחק זה
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full"
            size="lg"
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
            }}
          >
            {joining ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin ml-2" />
                מצטרף...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 ml-2" />
                הצטרף למשחק
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}