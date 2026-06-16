import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2, Crown, Flag, Camera, Save, AlertTriangle } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";

// מספר המשתתפים שנכנסים לגביע
const CUP_SIZE = 128;

// כמה משתתפים נשארים בכל סיבוב (תואם למספר הנבחרות הנותרות במונדיאל)
const ROUND_SIZES = [128, 64, 32, 16, 8, 4, 2, 1];
const ROUND_NAMES = {
  128: 'סיבוב ראשון (1/64)',
  64: 'סיבוב שני (1/32)',
  32: 'שמינית גמר',
  16: 'שמינית גמר',
  8: 'רבע גמר',
  4: 'חצי גמר',
  2: 'גמר',
};

export default function YossiCup() {
  const { currentGame } = useGame();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [rankings, setRankings] = useState([]);   // דירוג נוכחי מהליגה
  const [cupData, setCupData] = useState(null);    // מצב הגביע (מ-games.yossi_cup_data)
  const [currentUser, setCurrentUser] = useState(null);

  // ── טעינה ──────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      // דירוג נוכחי (כל המשתתפים, ממוין לפי ניקוד)
      const ranks = await db.Ranking.filter({ game_id: currentGame.id }, '-current_score', 1000);
      setRankings(ranks || []);
      // מצב הגביע מתוך רשומת המשחק
      setCupData(currentGame.yossi_cup_data || null);
    } catch (err) {
      console.error('שגיאה בטעינת גביע יוסי', err);
      toast({ title: 'שגיאה בטעינה', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentGame, toast]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: { user } } = await supabase.auth.getUser();
          setCurrentUser(user);
        }
      } catch (e) { /* ignore */ }
    };
    loadUser();
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';

  // ── שמירת מצב הגביע ל-DB ──────────────────────────────
  const saveCup = async (newData) => {
    await db.Game.update(currentGame.id, { yossi_cup_data: newData });
    setCupData(newData);
  };

  // ── צילום פתיחה: קביעת ה-128 והבראקט ──────────────────
  const captureBracket = async () => {
    if (!currentGame || !isAdmin) return;
    if (rankings.length < CUP_SIZE) {
      toast({ title: 'אין מספיק משתתפים', description: `נדרשים ${CUP_SIZE}, קיימים ${rankings.length}`, variant: 'destructive' });
      return;
    }
    setWorking(true);
    try {
      // 128 המובילים לפי הדירוג הנוכחי (כבר ממוין). שוויון → סדר ההופעה ברשימה קובע.
      const seeded = rankings.slice(0, CUP_SIZE).map((r, i) => ({
        seed: i + 1,
        participant_name: r.participant_name,
        entry_score: r.current_score,        // הניקוד ההתחלתי (לכלל הכרעה ג')
      }));

      // בניית זוגות הסיבוב הראשון: 1↔128, 2↔127 ...
      const pairs = [];
      for (let i = 0; i < CUP_SIZE / 2; i++) {
        pairs.push({
          a: seeded[i].seed,                       // המדורג הגבוה
          b: seeded[CUP_SIZE - 1 - i].seed,        // המדורג הנמוך
        });
      }

      const newData = {
        size: CUP_SIZE,
        created_at: new Date().toISOString(),
        seeds: seeded,                  // [{seed, participant_name, entry_score}]
        current_round: 1,
        round_size: CUP_SIZE,
        round_start_scores: {},         // יתמלא ב"קבע ניקוד לסיבוב"
        round_start_set: false,
        pairs,                          // זוגות הסיבוב הנוכחי [{a,b}]
        history: [],                    // היסטוריית סיבובים שהוכרעו
        alive: seeded.map(s => s.seed), // seeds ששרדו
      };
      await saveCup(newData);
      toast({ title: '🏆 הבראקט נקבע!', description: `${CUP_SIZE} משתתפים שובצו`, className: 'bg-green-900/30 border-green-500 text-green-200' });
    } catch (err) {
      console.error(err);
      toast({ title: 'שגיאה בקביעת הבראקט', variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  // ── קבע ניקוד לסיבוב: שומר את current_score כנקודת אפס לסיבוב ──
  const setRoundBaseline = async () => {
    if (!cupData || !isAdmin) return;
    setWorking(true);
    try {
      const scoreByName = {};
      rankings.forEach(r => { scoreByName[r.participant_name] = r.current_score; });
      const starts = {};
      cupData.seeds.forEach(s => {
        if (cupData.alive.includes(s.seed)) {
          starts[s.seed] = scoreByName[s.participant_name] ?? 0;
        }
      });
      const newData = { ...cupData, round_start_scores: starts, round_start_set: true };
      await saveCup(newData);
      toast({ title: '✅ נקודת ייחוס לסיבוב נקבעה', description: 'מעכשיו נספר רק את הניקוד שייצבר בסיבוב זה', className: 'bg-green-900/30 border-green-500 text-green-200' });
    } catch (err) {
      console.error(err);
      toast({ title: 'שגיאה', variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  // ── ניקוד הסיבוב של seed מסוים (current − round_start) ──
  const roundScoreOf = (seed) => {
    if (!cupData?.round_start_set) return null;
    const s = cupData.seeds.find(x => x.seed === seed);
    if (!s) return null;
    const cur = rankings.find(r => r.participant_name === s.participant_name)?.current_score ?? 0;
    const start = cupData.round_start_scores[seed] ?? 0;
    return cur - start;
  };

  const nameOf = (seed) => cupData?.seeds.find(s => s.seed === seed)?.participant_name || `#${seed}`;

  // ── תצוגה ──────────────────────────────────────────────
  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /><span className="mr-3 text-cyan-300">טוען גביע יוסי...</span></div>;
  }

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-slate-400">דף זה מיועד למנהלים בלבד.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center gap-3 mb-4">
        <Trophy className="w-7 h-7 text-amber-400" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-amber-300">גביע יוסי</h1>
          <p className="text-xs md:text-sm text-slate-400">פיילוט — נוק-אאוט במקביל לליגה • גלוי למנהל בלבד</p>
        </div>
      </div>

      {/* באנר פיילוט */}
      <div className="mb-4 p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <span className="text-xs text-amber-200">מסך זה נראה למנהל בלבד. המשתמשים אינם רואים אותו כלל עד שתחליט לחשוף אותו.</span>
      </div>

      {/* אין בראקט עדיין → כפתור צילום פתיחה */}
      {!cupData ? (
        <Card style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
          <CardContent className="py-8 text-center">
            <Camera className="w-10 h-10 mx-auto mb-3 text-cyan-400" />
            <p className="text-slate-300 mb-1">עדיין לא נקבע בראקט.</p>
            <p className="text-xs text-slate-500 mb-5">לחיצה תיקח את {CUP_SIZE} המובילים בדירוג הנוכחי ותקבע את עץ הנוק-אאוט (1↔128, 2↔127...).</p>
            <Button onClick={captureBracket} disabled={working} className="bg-amber-600 hover:bg-amber-700 text-white">
              {working ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Camera className="w-4 h-4 ml-2" />}
              צלם פתיחה וקבע בראקט
            </Button>
            <p className="text-[11px] text-slate-600 mt-3">משתתפים בדירוג כעת: {rankings.length}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* פקדי סיבוב */}
          <Card className="mb-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base text-cyan-300 flex items-center gap-2">
                  <Flag className="w-4 h-4" />
                  {ROUND_NAMES[cupData.round_size] || `סיבוב`} · {cupData.round_size} משתתפים
                </CardTitle>
                <Button onClick={setRoundBaseline} disabled={working} size="sm"
                  className={cupData.round_start_set ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-cyan-600 hover:bg-cyan-700 text-white"}>
                  {working ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                  {cupData.round_start_set ? 'אפס מחדש ניקוד הסיבוב' : 'קבע ניקוד לסיבוב'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!cupData.round_start_set ? (
                <p className="text-xs text-amber-300">⚠️ עדיין לא נקבעה נקודת ייחוס לסיבוב זה. לחץ "קבע ניקוד לסיבוב" בתחילת הסיבוב כדי שהמערכת תספור רק את הנקודות שייצברו מעכשיו.</p>
              ) : (
                <p className="text-xs text-green-300">✅ נקודת הייחוס נקבעה. "ניקוד הסיבוב" מציג את ההפרש מתחילת הסיבוב.</p>
              )}
            </CardContent>
          </Card>

          {/* זוגות הסיבוב */}
          <div className="grid gap-2">
            {cupData.pairs.map((pair, idx) => {
              const sa = roundScoreOf(pair.a);
              const sb = roundScoreOf(pair.b);
              const leader = (sa != null && sb != null) ? (sa > sb ? 'a' : sb > sa ? 'b' : 'tie') : null;
              return (
                <Card key={idx} style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(100,116,139,0.2)' }}>
                  <CardContent className="py-2 px-3">
                    <div className="flex items-center justify-between gap-2">
                      {/* משתתף A (מדורג גבוה) */}
                      <div className={`flex-1 flex items-center gap-2 ${leader === 'a' ? 'opacity-100' : leader === 'b' ? 'opacity-50' : ''}`}>
                        <Badge variant="outline" className="border-amber-400 text-amber-300 text-[10px]">{pair.a}</Badge>
                        <span className="text-sm text-slate-200 font-medium truncate">{nameOf(pair.a)}</span>
                        {sa != null && <span className={`text-sm font-bold ${leader === 'a' ? 'text-green-400' : 'text-slate-400'}`}>{sa >= 0 ? '+' : ''}{sa}</span>}
                      </div>
                      <span className="text-xs text-slate-600 px-1">VS</span>
                      {/* משתתף B (מדורג נמוך) */}
                      <div className={`flex-1 flex items-center gap-2 justify-end ${leader === 'b' ? 'opacity-100' : leader === 'a' ? 'opacity-50' : ''}`}>
                        {sb != null && <span className={`text-sm font-bold ${leader === 'b' ? 'text-green-400' : 'text-slate-400'}`}>{sb >= 0 ? '+' : ''}{sb}</span>}
                        <span className="text-sm text-slate-200 font-medium truncate">{nameOf(pair.b)}</span>
                        <Badge variant="outline" className="border-slate-500 text-slate-400 text-[10px]">{pair.b}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-600 mt-4 text-center">
            שלב ראשון: צילום בראקט + ניקוד סיבוב חי. מנוע ההכרעה האוטומטי (6 כללי שובר-שוויון) ומעבר לסיבוב הבא — בשלב הבא.
          </p>
        </>
      )}
    </div>
  );
}
