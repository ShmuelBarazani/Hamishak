import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2, Crown, Flag, Lock, Save, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";

const CUP_SIZE = 128;
const ROUND_NAMES = {
  128: 'סיבוב ראשון (1/64)', 64: 'סיבוב שני (1/32)', 32: 'שמינית גמר',
  16: 'שמינית גמר', 8: 'רבע גמר', 4: 'חצי גמר', 2: 'גמר',
};

export default function YossiCup() {
  const { currentGame } = useGame();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [cupData, setCupData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const loadRankings = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    try {
      const ranks = await db.Ranking.filter({ game_id: currentGame.id }, '-current_score', 1000);
      setRankings(ranks || []);
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
        if (session) { const { data: { user } } = await supabase.auth.getUser(); setCurrentUser(user); }
      } catch (e) { /* ignore */ }
    };
    loadUser();
  }, []);

  useEffect(() => { loadRankings(); }, [loadRankings]);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';

  // 🔴 תצוגה חיה: 128 המובילים הנוכחיים + זוגות (1↔128...) — מחושב בכל רינדור מהדירוג
  const liveSeeds = useMemo(() => {
    return rankings.slice(0, CUP_SIZE).map((r, i) => ({
      seed: i + 1, participant_name: r.participant_name, entry_score: r.current_score,
    }));
  }, [rankings]);

  const livePairs = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < Math.floor(liveSeeds.length / 2); i++) {
      pairs.push({ a: liveSeeds[i], b: liveSeeds[liveSeeds.length - 1 - i] });
    }
    return pairs;
  }, [liveSeeds]);

  const saveCup = async (newData) => {
    await db.Game.update(currentGame.id, { yossi_cup_data: newData });
    setCupData(newData);
  };

  // 🔒 קיבוע הבראקט הסופי (בסוף מחזור 1)
  const lockBracket = async () => {
    if (!currentGame || !isAdmin) return;
    if (liveSeeds.length < CUP_SIZE) {
      toast({ title: 'אין מספיק משתתפים', description: `נדרשים ${CUP_SIZE}, קיימים ${rankings.length}`, variant: 'destructive' });
      return;
    }
    setWorking(true);
    try {
      const pairs = livePairs.map(p => ({ a: p.a.seed, b: p.b.seed }));
      const newData = {
        size: CUP_SIZE, locked_at: new Date().toISOString(),
        seeds: liveSeeds, current_round: 1, round_size: CUP_SIZE,
        round_start_scores: {}, round_start_set: false,
        pairs, history: [], alive: liveSeeds.map(s => s.seed),
      };
      await saveCup(newData);
      toast({ title: '🔒 הבראקט קובע!', description: `${CUP_SIZE} משתתפים ננעלו לבראקט הסופי`, className: 'bg-green-900/30 border-green-500 text-green-200' });
    } catch (err) {
      console.error(err);
      toast({ title: 'שגיאה בקיבוע', variant: 'destructive' });
    } finally { setWorking(false); }
  };

  // ♻️ ביטול קיבוע (דריסה) — חזרה לתצוגה חיה
  const unlockBracket = async () => {
    if (!isAdmin) return;
    if (!window.confirm('האם אתה בטוח? פעולה זו תמחק את הבראקט הקבוע ואת כל היסטוריית הסיבובים, ותחזיר לתצוגה חיה.')) return;
    setWorking(true);
    try {
      await saveCup(null);
      toast({ title: 'הבראקט בוטל', description: 'חזרה לתצוגה חיה', className: 'bg-amber-900/30 border-amber-500 text-amber-200' });
    } catch (err) { console.error(err); toast({ title: 'שגיאה', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  // קבע ניקוד לסיבוב — נקודת אפס נפרדת לגביע
  const setRoundBaseline = async () => {
    if (!cupData || !isAdmin) return;
    setWorking(true);
    try {
      const scoreByName = {};
      rankings.forEach(r => { scoreByName[r.participant_name] = r.current_score; });
      const starts = {};
      cupData.seeds.forEach(s => { if (cupData.alive.includes(s.seed)) starts[s.seed] = scoreByName[s.participant_name] ?? 0; });
      await saveCup({ ...cupData, round_start_scores: starts, round_start_set: true });
      toast({ title: '✅ נקודת ייחוס לסיבוב נקבעה', className: 'bg-green-900/30 border-green-500 text-green-200' });
    } catch (err) { console.error(err); toast({ title: 'שגיאה', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  const roundScoreOf = (seed) => {
    if (!cupData?.round_start_set) return null;
    const s = cupData.seeds.find(x => x.seed === seed);
    if (!s) return null;
    const cur = rankings.find(r => r.participant_name === s.participant_name)?.current_score ?? 0;
    return cur - (cupData.round_start_scores[seed] ?? 0);
  };
  const nameOf = (seed) => cupData?.seeds.find(s => s.seed === seed)?.participant_name || `#${seed}`;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /><span className="mr-3 text-cyan-300">טוען גביע יוסי...</span></div>;
  if (!isAdmin) return <div className="flex items-center justify-center py-20 text-slate-400">דף זה מיועד למנהלים בלבד.</div>;

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-amber-400" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-amber-300">גביע יוסי</h1>
            <p className="text-xs md:text-sm text-slate-400">פיילוט — נוק-אאוט במקביל לליגה • גלוי למנהל בלבד</p>
          </div>
        </div>
        <Button onClick={loadRankings} disabled={working} size="sm" variant="outline" className="border-slate-600 text-slate-300">
          <RefreshCw className="w-4 h-4 ml-2" /> רענן ניקוד
        </Button>
      </div>

      <div className="mb-4 p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <span className="text-xs text-amber-200">מסך זה נראה למנהל בלבד. המשתמשים אינם רואים אותו כלל עד שתחליט לחשוף אותו.</span>
      </div>

      {/* ─── מצב לפני קיבוע: תצוגה חיה ─── */}
      {!cupData ? (
        <>
          <Card className="mb-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.3)' }}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base text-blue-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> תצוגה חיה — {liveSeeds.length >= CUP_SIZE ? CUP_SIZE : liveSeeds.length} מובילים נוכחיים
                </CardTitle>
                <Button onClick={lockBracket} disabled={working || liveSeeds.length < CUP_SIZE} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                  {working ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Lock className="w-4 h-4 ml-2" />}
                  קבע בראקט סופי
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-blue-200">🔴 הזוגות מתעדכנים אוטומטית עם כל שינוי בדירוג. <b>קבע בראקט סופי</b> רק בסוף המחזור הראשון — אז הרשימה תינעל.</p>
              {liveSeeds.length < CUP_SIZE && <p className="text-xs text-amber-300 mt-1">⚠️ כרגע {liveSeeds.length} משתתפים בלבד — נדרשים {CUP_SIZE} לקיבוע.</p>}
            </CardContent>
          </Card>

          <div className="grid gap-1.5">
            {livePairs.map((pair, idx) => (
              <Card key={idx} style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(100,116,139,0.2)' }}>
                <CardContent className="py-2 px-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="border-amber-400 text-amber-300 text-[10px] flex-shrink-0">{pair.a.seed}</Badge>
                      <span className="text-sm text-slate-200 font-medium truncate">{pair.a.participant_name}</span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">({pair.a.entry_score})</span>
                    </div>
                    <span className="text-xs text-slate-600 px-1 flex-shrink-0">VS</span>
                    <div className="flex-1 flex items-center gap-2 justify-end min-w-0">
                      <span className="text-[10px] text-slate-500 flex-shrink-0">({pair.b.entry_score})</span>
                      <span className="text-sm text-slate-200 font-medium truncate">{pair.b.participant_name}</span>
                      <Badge variant="outline" className="border-slate-500 text-slate-400 text-[10px] flex-shrink-0">{pair.b.seed}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        /* ─── מצב אחרי קיבוע: בראקט קפוא + ניקוד סיבוב ─── */
        <>
          <Card className="mb-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base text-cyan-300 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> {ROUND_NAMES[cupData.round_size] || 'סיבוב'} · {cupData.round_size} משתתפים
                </CardTitle>
                <div className="flex gap-2">
                  <Button onClick={setRoundBaseline} disabled={working} size="sm" className={cupData.round_start_set ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-cyan-600 hover:bg-cyan-700 text-white"}>
                    {working ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                    {cupData.round_start_set ? 'אפס ניקוד סיבוב' : 'קבע ניקוד לסיבוב'}
                  </Button>
                  <Button onClick={unlockBracket} disabled={working} size="sm" variant="outline" className="border-red-700 text-red-400">
                    <RefreshCw className="w-4 h-4 ml-2" /> צלם מחדש
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!cupData.round_start_set
                ? <p className="text-xs text-amber-300">⚠️ עדיין לא נקבעה נקודת ייחוס לסיבוב זה. לחץ "קבע ניקוד לסיבוב" בתחילת הסיבוב.</p>
                : <p className="text-xs text-green-300">✅ "ניקוד הסיבוב" מציג את ההפרש מתחילת הסיבוב.</p>}
            </CardContent>
          </Card>

          <div className="grid gap-1.5">
            {cupData.pairs.map((pair, idx) => {
              const sa = roundScoreOf(pair.a), sb = roundScoreOf(pair.b);
              const leader = (sa != null && sb != null) ? (sa > sb ? 'a' : sb > sa ? 'b' : 'tie') : null;
              return (
                <Card key={idx} style={{ background: 'rgba(15,23,42,0.5)', border: `1px solid ${leader ? 'rgba(94,202,165,0.2)' : 'rgba(100,116,139,0.2)'}` }}>
                  <CardContent className="py-2 px-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`flex-1 flex items-center gap-2 min-w-0 ${leader === 'b' ? 'opacity-50' : ''}`}>
                        <Badge variant="outline" className="border-amber-400 text-amber-300 text-[10px] flex-shrink-0">{pair.a}</Badge>
                        <span className="text-sm text-slate-200 font-medium truncate">{nameOf(pair.a)}</span>
                        {sa != null && <span className={`text-sm font-bold flex-shrink-0 ${leader === 'a' ? 'text-green-400' : 'text-slate-400'}`}>{sa >= 0 ? '+' : ''}{sa}</span>}
                        {leader === 'a' && <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      </div>
                      <span className="text-xs text-slate-600 px-1 flex-shrink-0">VS</span>
                      <div className={`flex-1 flex items-center gap-2 justify-end min-w-0 ${leader === 'a' ? 'opacity-50' : ''}`}>
                        {leader === 'b' && <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                        {sb != null && <span className={`text-sm font-bold flex-shrink-0 ${leader === 'b' ? 'text-green-400' : 'text-slate-400'}`}>{sb >= 0 ? '+' : ''}{sb}</span>}
                        <span className="text-sm text-slate-200 font-medium truncate">{nameOf(pair.b)}</span>
                        <Badge variant="outline" className="border-slate-500 text-slate-400 text-[10px] flex-shrink-0">{pair.b}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-600 mt-4 text-center">מנוע ההכרעה האוטומטי (6 כללי שובר-שוויון) ומעבר לסיבוב הבא — בשלב הבא.</p>
        </>
      )}
    </div>
  );
}
