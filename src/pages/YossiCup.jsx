import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2, Crown, Flag, Lock, Save, AlertTriangle, RefreshCw, Gavel, History, Play, Check } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";

const CUP_SIZE = 128;
const ROUND_NAMES = {
  128: 'סיבוב ראשון (1/64)', 64: 'סיבוב שני (1/32)', 32: 'שמינית גמר',
  16: 'רבע גמר', 8: 'חצי גמר', 4: 'חצי גמר', 2: 'גמר',
};
// שמות תקניים לפי גודל הסיבוב (תואם למספר הנבחרות הנותרות)
const roundLabel = (size) => {
  const map = { 128: 'סיבוב 1 · 64 דו-קרבות', 64: 'סיבוב 2 · 32 דו-קרבות', 32: 'שמינית גמר', 16: 'רבע גמר', 8: 'חצי גמר', 4: 'חצי גמר', 2: 'גמר', 1: 'אלוף' };
  return map[size] || `סיבוב · ${size}`;
};

export default function YossiCup() {
  const { currentGame } = useGame();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [cupData, setCupData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [viewRound, setViewRound] = useState(null); // איזה סיבוב מוצג בבורר (null = הנוכחי)

  const loadRankings = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    try {
      const ranks = await db.Ranking.filter({ game_id: currentGame.id }, '-current_score', 1000);
      setRankings(ranks || []);
      setCupData(currentGame.yossi_cup_data || null);
    } catch (err) {
      console.error('שגיאה בטעינת גביע יוסי', err);
      toast({ title: 'שגיאה בטעינה', variant: 'destructive' });
    } finally { setLoading(false); }
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
  const scoreByName = useMemo(() => {
    const m = {}; rankings.forEach(r => { m[r.participant_name] = r.current_score; }); return m;
  }, [rankings]);

  // ── תצוגה חיה (לפני קיבוע) ──
  const liveSeeds = useMemo(() => rankings.slice(0, CUP_SIZE).map((r, i) => ({
    seed: i + 1, participant_name: r.participant_name, entry_score: r.current_score,
  })), [rankings]);
  const livePairs = useMemo(() => {
    const p = []; for (let i = 0; i < Math.floor(liveSeeds.length / 2); i++) p.push({ a: liveSeeds[i], b: liveSeeds[liveSeeds.length - 1 - i] });
    return p;
  }, [liveSeeds]);

  const saveCup = async (newData) => { await db.Game.update(currentGame.id, { yossi_cup_data: newData }); setCupData(newData); };

  const seedInfo = (seed) => cupData?.seeds.find(s => s.seed === seed);
  const nameOf = (seed) => seedInfo(seed)?.participant_name || `#${seed}`;
  const entryOf = (seed) => seedInfo(seed)?.entry_score ?? 0;

  // ניקוד הסיבוב הנוכחי (current − round_start)
  const roundScoreOf = (seed) => {
    if (!cupData?.round_start_set) return null;
    const s = seedInfo(seed); if (!s) return null;
    return (scoreByName[s.participant_name] ?? 0) - (cupData.round_start_scores[seed] ?? 0);
  };
  // ניקוד מתחילת סיבוב 1 (לכלל ב') = current − cup_start_score
  const cupTotalOf = (seed) => {
    const s = seedInfo(seed); if (!s) return 0;
    return (scoreByName[s.participant_name] ?? 0) - (cupData.cup_start_scores?.[seed] ?? s.entry_score);
  };
  // הפרש ניצחון בסיבוב היסטורי מסוים (לכללים ד-ה)
  const marginInRound = (seed, roundIdx) => {
    const h = cupData.history?.[roundIdx]; if (!h) return 0;
    const rec = h.results.find(r => r.winner === seed || r.loser === seed);
    if (!rec) return 0;
    return rec.winner === seed ? (rec.margin ?? 0) : -(rec.margin ?? 0);
  };

  // ── מנוע ההכרעה: מחזיר {winner, loser, margin, rule} ──
  const decidePair = (a, b) => {
    const ra = roundScoreOf(a) ?? 0, rb = roundScoreOf(b) ?? 0;
    // א. ניקוד הסיבוב
    if (ra !== rb) { const w = ra > rb ? a : b; return { winner: w, loser: w === a ? b : a, margin: Math.abs(ra - rb), rule: 'א' }; }
    // ב. ניקוד מתחילת סיבוב 1
    const ca = cupTotalOf(a), cb = cupTotalOf(b);
    if (ca !== cb) { const w = ca > cb ? a : b; return { winner: w, loser: w === a ? b : a, margin: 0, rule: 'ב' }; }
    // ג. ניקוד התחלתי
    const ea = entryOf(a), eb = entryOf(b);
    if (ea !== eb) { const w = ea > eb ? a : b; return { winner: w, loser: w === a ? b : a, margin: 0, rule: 'ג' }; }
    // ד-ה. הפרשי ניצחון אחורה (מהסיבוב האחרון שהוכרע ועד סיבוב 1)
    const hist = cupData.history || [];
    for (let i = hist.length - 1; i >= 0; i--) {
      const ma = marginInRound(a, i), mb = marginInRound(b, i);
      if (ma !== mb) { const w = ma > mb ? a : b; return { winner: w, loser: w === a ? b : a, margin: 0, rule: i === hist.length - 1 ? 'ד' : 'ה' }; }
    }
    // ו. המדורג הגבוה (seed קטן)
    const w = a < b ? a : b;
    return { winner: w, loser: w === a ? b : a, margin: 0, rule: 'ו' };
  };

  // ═══ פעולות ═══
  const lockBracket = async () => {
    if (!currentGame || !isAdmin) return;
    if (liveSeeds.length < CUP_SIZE) { toast({ title: 'אין מספיק משתתפים', description: `נדרשים ${CUP_SIZE}, קיימים ${rankings.length}`, variant: 'destructive' }); return; }
    setWorking(true);
    try {
      const pairs = livePairs.map(p => ({ a: p.a.seed, b: p.b.seed }));
      const cupStart = {}; liveSeeds.forEach(s => { cupStart[s.seed] = s.entry_score; }); // נקודת אפס לכלל ב'
      await saveCup({
        size: CUP_SIZE, locked_at: new Date().toISOString(), seeds: liveSeeds,
        current_round: 1, round_size: CUP_SIZE, round_start_scores: {}, round_start_set: false,
        cup_start_scores: cupStart, pairs, history: [], alive: liveSeeds.map(s => s.seed),
      });
      toast({ title: '🔒 הבראקט קובע!', description: `${CUP_SIZE} משתתפים ננעלו`, className: 'bg-green-900/30 border-green-500 text-green-200' });
    } catch (err) { console.error(err); toast({ title: 'שגיאה בקיבוע', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  const unlockBracket = async () => {
    if (!isAdmin) return;
    if (!window.confirm('האם אתה בטוח? פעולה זו תמחק את הבראקט הקבוע ואת כל היסטוריית הסיבובים, ותחזיר לתצוגה חיה.')) return;
    setWorking(true);
    try { await saveCup(null); setViewRound(null); toast({ title: 'הבראקט בוטל', className: 'bg-amber-900/30 border-amber-500 text-amber-200' }); }
    catch (err) { console.error(err); toast({ title: 'שגיאה', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  const setRoundBaseline = async () => {
    if (!cupData || !isAdmin) return;
    setWorking(true);
    try {
      const starts = {};
      cupData.seeds.forEach(s => { if (cupData.alive.includes(s.seed)) starts[s.seed] = scoreByName[s.participant_name] ?? 0; });
      await saveCup({ ...cupData, round_start_scores: starts, round_start_set: true });
      toast({ title: '✅ נקודת ייחוס לסיבוב נקבעה', className: 'bg-green-900/30 border-green-500 text-green-200' });
    } catch (err) { console.error(err); toast({ title: 'שגיאה', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  // ── הכרע סיבוב → בנה את הסיבוב הבא ──
  const decideRound = async () => {
    if (!cupData || !isAdmin) return;
    if (!cupData.round_start_set) { toast({ title: 'קבע קודם ניקוד לסיבוב', variant: 'destructive' }); return; }
    setWorking(true);
    try {
      const results = cupData.pairs.map(pair => {
        const d = decidePair(pair.a, pair.b);
        return { a: pair.a, b: pair.b, winner: d.winner, loser: d.loser, margin: d.margin, rule: d.rule,
                 sa: roundScoreOf(pair.a), sb: roundScoreOf(pair.b) };
      });
      const winners = results.map(r => r.winner);
      const histEntry = { round_size: cupData.round_size, round_index: cupData.current_round, decided_at: new Date().toISOString(), results };
      const newHistory = [...(cupData.history || []), histEntry];

      // האם הגענו לאלוף?
      if (winners.length === 1) {
        await saveCup({ ...cupData, history: newHistory, alive: winners, champion: winners[0], round_start_set: false });
        toast({ title: '🏆 יש אלוף לגביע יוסי!', description: nameOf(winners[0]), className: 'bg-amber-900/30 border-amber-500 text-amber-200' });
      } else {
        // בניית זוגות הסיבוב הבא: מנצחים מסודרים לפי הסדר הקיים, ואז זוגיות קצה-לקצה
        const nextPairs = [];
        for (let i = 0; i < Math.floor(winners.length / 2); i++) nextPairs.push({ a: winners[i], b: winners[winners.length - 1 - i] });
        await saveCup({
          ...cupData, history: newHistory, alive: winners,
          current_round: cupData.current_round + 1, round_size: winners.length,
          pairs: nextPairs, round_start_scores: {}, round_start_set: false,
        });
        toast({ title: `✅ הסיבוב הוכרע! ${winners.length} ממשיכים`, description: 'קבע ניקוד לסיבוב הבא', className: 'bg-green-900/30 border-green-500 text-green-200' });
      }
      setViewRound(null);
    } catch (err) { console.error(err); toast({ title: 'שגיאה בהכרעה', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /><span className="mr-3 text-cyan-300">טוען גביע יוסי...</span></div>;
  if (!isAdmin) return <div className="flex items-center justify-center py-20 text-slate-400">דף זה מיועד למנהלים בלבד.</div>;

  // רשימת השלבים לבורר (מההיסטוריה + הסיבוב הנוכחי)
  const stageButtons = [];
  if (cupData) {
    (cupData.history || []).forEach((h, i) => stageButtons.push({ idx: i, size: h.round_size, label: roundLabel(h.round_size), done: true }));
    if (!cupData.champion) stageButtons.push({ idx: 'current', size: cupData.round_size, label: roundLabel(cupData.round_size), done: false });
  }
  const showingHistory = cupData && viewRound !== null && viewRound !== 'current';
  const histToShow = showingHistory ? cupData.history[viewRound] : null;

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4" dir="rtl">
      {/* כותרת */}
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

      {/* אלוף */}
      {cupData?.champion && (
        <Card className="mb-4" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.5)' }}>
          <CardContent className="py-6 text-center">
            <Crown className="w-12 h-12 mx-auto mb-2 text-amber-400" />
            <p className="text-sm text-amber-200">🏆 מחזיק גביע יוסי הראשון</p>
            <p className="text-2xl font-bold text-amber-300 mt-1">{nameOf(cupData.champion)}</p>
          </CardContent>
        </Card>
      )}

      {/* ─── לפני קיבוע: תצוגה חיה ─── */}
      {!cupData ? (
        <>
          <Card className="mb-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.3)' }}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base text-blue-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> תצוגה חיה — {Math.min(liveSeeds.length, CUP_SIZE)} מובילים נוכחיים
                </CardTitle>
                <Button onClick={lockBracket} disabled={working || liveSeeds.length < CUP_SIZE} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                  {working ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Lock className="w-4 h-4 ml-2" />} קבע בראקט סופי
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-blue-200">🔴 הזוגות מתעדכנים אוטומטית עם כל שינוי בדירוג. <b>קבע בראקט סופי</b> רק בסוף המחזור הראשון.</p>
              {liveSeeds.length < CUP_SIZE && <p className="text-xs text-amber-300 mt-1">⚠️ כרגע {liveSeeds.length} משתתפים בלבד — נדרשים {CUP_SIZE}.</p>}
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
        /* ─── אחרי קיבוע ─── */
        <>
          {/* בורר שלבים */}
          <div className="mb-3 p-2 rounded-lg" style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(100,116,139,0.2)' }}>
            <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-400"><History className="w-3.5 h-3.5" /> בורר שלבים</div>
            <div className="flex gap-1.5 flex-wrap">
              {stageButtons.map((st) => {
                const active = (viewRound === null && !st.done) || viewRound === st.idx;
                return (
                  <button key={String(st.idx)} onClick={() => setViewRound(st.idx === 'current' ? null : st.idx)}
                    className="text-[11px] font-bold rounded-lg px-3 py-1.5 transition-colors"
                    style={{
                      color: active ? '#0f172a' : st.done ? '#34d399' : '#94a3b8',
                      background: active ? (st.done ? '#34d399' : '#fbbf24') : st.done ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active ? (st.done ? '#34d399' : '#fbbf24') : st.done ? 'rgba(52,211,153,0.4)' : 'rgba(148,163,184,0.3)'}`,
                    }}>
                    {st.done ? '✓ ' : '▶ '}{st.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* תצוגת סיבוב היסטורי (קריאה בלבד) */}
          {showingHistory ? (
            <Card style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <CardHeader className="py-3">
                <CardTitle className="text-base text-slate-300 flex items-center gap-2"><History className="w-4 h-4" /> {roundLabel(histToShow.round_size)} — הוכרע (קריאה בלבד)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {histToShow.results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(100,116,139,0.15)' }}>
                    <div className={`flex-1 flex items-center gap-2 min-w-0 ${r.loser === r.a ? 'opacity-50 line-through' : ''}`}>
                      <Badge variant="outline" className="border-slate-500 text-slate-400 text-[10px] flex-shrink-0">{r.a}</Badge>
                      <span className="text-sm text-slate-200 truncate">{nameOf(r.a)}</span>
                      <span className="text-xs text-slate-500 flex-shrink-0">{r.sa >= 0 ? '+' : ''}{r.sa}</span>
                      {r.winner === r.a && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                    </div>
                    <span className="text-[10px] text-slate-600 px-1 flex-shrink-0">VS</span>
                    <div className={`flex-1 flex items-center gap-2 justify-end min-w-0 ${r.loser === r.b ? 'opacity-50 line-through' : ''}`}>
                      {r.winner === r.b && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                      <span className="text-xs text-slate-500 flex-shrink-0">{r.sb >= 0 ? '+' : ''}{r.sb}</span>
                      <span className="text-sm text-slate-200 truncate">{nameOf(r.b)}</span>
                      <Badge variant="outline" className="border-slate-500 text-slate-400 text-[10px] flex-shrink-0">{r.b}</Badge>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-slate-600 text-center mt-1">הכרעות לפי כלל א (ניקוד סיבוב) ושובר-שוויון ב-ו לפי הצורך.</p>
              </CardContent>
            </Card>
          ) : !cupData.champion && (
            /* הסיבוב הנוכחי — פעיל */
            <>
              <Card className="mb-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base text-cyan-300 flex items-center gap-2"><Flag className="w-4 h-4" /> {roundLabel(cupData.round_size)} · פעיל</CardTitle>
                    <div className="flex gap-2 flex-wrap">
                      <Button onClick={setRoundBaseline} disabled={working} size="sm" className={cupData.round_start_set ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-cyan-600 hover:bg-cyan-700 text-white"}>
                        {working ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                        {cupData.round_start_set ? 'אפס ניקוד סיבוב' : 'קבע ניקוד לסיבוב'}
                      </Button>
                      <Button onClick={decideRound} disabled={working || !cupData.round_start_set} size="sm" className="bg-green-700 hover:bg-green-600 text-white">
                        <Gavel className="w-4 h-4 ml-2" /> הכרע סיבוב → העבר מנצחים
                      </Button>
                      <Button onClick={unlockBracket} disabled={working} size="sm" variant="outline" className="border-red-700 text-red-400">
                        <RefreshCw className="w-4 h-4 ml-2" /> צלם מחדש
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {!cupData.round_start_set
                    ? <p className="text-xs text-amber-300">⚠️ עדיין לא נקבעה נקודת ייחוס לסיבוב זה. לחץ "קבע ניקוד לסיבוב" בתחילתו.</p>
                    : <p className="text-xs text-green-300">✅ "ניקוד הסיבוב" מציג את ההפרש מתחילת הסיבוב. לחץ "הכרע סיבוב" בסיומו.</p>}
                </CardContent>
              </Card>
              <div className="grid gap-1.5">
                {cupData.pairs.map((pair, idx) => {
                  const sa = roundScoreOf(pair.a), sb = roundScoreOf(pair.b);
                  const leader = (sa != null && sb != null) ? (sa > sb ? 'a' : sb > sa ? 'b' : 'tie') : null;
                  return (
                    <Card key={idx} style={{ background: 'rgba(15,23,42,0.5)', border: `1px solid ${leader && leader !== 'tie' ? 'rgba(94,202,165,0.2)' : 'rgba(100,116,139,0.2)'}` }}>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
