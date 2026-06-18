import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2, Crown, Flag, Lock, Save, AlertTriangle, RefreshCw, Gavel, History, Play, Check, List, GitBranch } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";

const CUP_SIZE = 128;       // מספר המשתתפים החל מהסיבוב השני (אחרי הסיבוב המקדים)
const BYE_COUNT = 14;       // המדורגים 1-14 מקבלים בּיי (כרטיס אוטומטי) בסיבוב המקדים

// סדר עץ הזריעה הסטנדרטי (standard bracket seeding) — מאומת 100% מול הבראקט הרשמי.
// מחזיר את סדר ה"זרעים" בעמדות העץ: [1,128,64,65,32,97,...] עבור n=128.
function bracketOrder(n) {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2;
    const next = [];
    for (const x of order) { next.push(x); next.push(m + 1 - x); }
    order = next;
  }
  return order;
}
const ROUND_NAMES = {
  128: 'סיבוב ראשון (1/64)', 64: 'סיבוב שני (1/32)', 32: 'שמינית גמר',
  16: 'רבע גמר', 8: 'חצי גמר', 4: 'חצי גמר', 2: 'גמר',
};
// שמות תקניים לפי גודל הסיבוב (תואם למספר הנבחרות הנותרות)
const roundLabel = (size, isPrelim) => {
  if (isPrelim) return `סיבוב 1 (מקדים) · ${size} משתתפים`;
  // אחרי הסיבוב המקדים: 128 = סיבוב 2, 64 = סיבוב 3, וכו'
  const map = {
    128: 'סיבוב 2 · 64 דו-קרבות', 64: 'סיבוב 3 · 32 דו-קרבות', 32: 'שמינית גמר',
    16: 'רבע גמר', 8: 'חצי גמר', 4: 'חצי גמר', 2: 'גמר', 1: 'אלוף'
  };
  return map[size] || `סיבוב · ${size}`;
};

export default function YossiCup() {
  const { currentGame } = useGame();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [cupData, setCupData] = useState(null);
  const [seedingFromDb, setSeedingFromDb] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [viewRound, setViewRound] = useState(null); // איזה סיבוב מוצג בבורר (null = הנוכחי)
  const [viewMode, setViewMode] = useState('list'); // 'list' = רשימת כרטיסים | 'tree' = עץ בראקט ויזואלי

  const loadRankings = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    try {
      const ranks = await db.Ranking.filter({ game_id: currentGame.id }, '-current_score', 1000);
      const sorted = [...(ranks || [])].sort((x, y) => {
        if ((y.current_score || 0) !== (x.current_score || 0)) return (y.current_score || 0) - (x.current_score || 0);
        const px = x.baseline_position ?? x.current_position ?? 9999;
        const py = y.baseline_position ?? y.current_position ?? 9999;
        if (px !== py) return px - py;
        return (x.participant_name || '').localeCompare(y.participant_name || '', 'he');
      });
      setRankings(sorted);
      // 🔑 טוען את הסידינג הקבוע + נתוני הגביע ישירות מה-DB (לא מסתמך על GameContext,
      //    שאולי לא טוען את העמודות החדשות). כך הסידינג מהאקסל תמיד זמין.
      try {
        const gameRow = await db.Game.get(currentGame.id);
        setSeedingFromDb(gameRow?.yossi_cup_seeding || null);
        setCupData(gameRow?.yossi_cup_data || currentGame.yossi_cup_data || null);
      } catch (e) {
        setSeedingFromDb(currentGame.yossi_cup_seeding || null);
        setCupData(currentGame.yossi_cup_data || null);
      }
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

  // ── תצוגה חיה (לפני קיבוע) — כל המשתתפים ──
  //   אם הוטען סידינג קבוע (fixed_seeding מהאקסל) — משתמשים בו במקום בסדר טבלת הדירוג,
  //   כדי שהמיון יהיה מדויק לבראקט הרשמי (שובר-שוויון פנימי בין משתתפים עם אותו ניקוד).
  //   הניקוד עדיין נלקח מהדירוג החי (לפי שם) — רק הסדר מגיע מהסידינג הקבוע.
  const fixedSeeding = seedingFromDb || currentGame?.yossi_cup_seeding || null;
  const liveSeeds = useMemo(() => {
    if (fixedSeeding && Array.isArray(fixedSeeding) && fixedSeeding.length > 0) {
      // ממיינים לפי seed עולה כדי להבטיח ש-liveSeeds[s-1] מצביע על הזרע הנכון
      // (גם אם ה-JSON מה-DB חזר בסדר אחר).
      return [...fixedSeeding]
        .sort((a, b) => (a.seed || 0) - (b.seed || 0))
        .map((s) => ({
          seed: s.seed,
          participant_name: s.participant_name,
          entry_score: scoreByName[s.participant_name] ?? 0,
        }));
    }
    return rankings.map((r, i) => ({
      seed: i + 1, participant_name: r.participant_name, entry_score: r.current_score,
    }));
  }, [rankings, fixedSeeding, scoreByName]);

  // האם נדרש סיבוב מקדים (יותר מ-128 משתתפים)
  const needsPrelim = liveSeeds.length > CUP_SIZE;
  // מספר הבּיי: כמה מדורגים עליונים עוברים אוטומטית. נוסחה גמישה לכל מספר משתתפים:
  //   byes = 2*CUP_SIZE − total  (ל-242 → 14). אם ≤128, אין בּיי ואין מקדים.
  const byeCount = needsPrelim ? Math.max(0, 2 * CUP_SIZE - liveSeeds.length) : 0;

  // זוגות לפי עץ הזריעה הסטנדרטי — מאומת 100% מול הבראקט הרשמי.
  //   העמדות בעץ: bracketOrder(128). לכל עמדה seed s, היריב הוא (2*total+1 - s) כאשר
  //   total = מספר המשתתפים בפועל. אם היריב > total → bye (אין יריב כזה).
  //   דוגמה ל-242: s=1 → יריב 485-1=484>242 → bye. s=16 → יריב 469-16... לא.
  //   בפועל הנוסחה הרשמית: total=242 → יריב = 257 - s (כי הבראקט בגודל 256 הקרוב).
  //   הכללה: bracketFull = הכפולה-של-2 הקרובה ל-total כלפי מעלה ×... → פשוט 2*CUP_SIZE+1 - s = 257 - s.
  const bracketComplement = 2 * CUP_SIZE + 1; // 257 — היריב של זרע s הוא (257 - s)

  const livePairs = useMemo(() => {
    if (liveSeeds.length === 0) return [];
    const total = liveSeeds.length;
    const seedToParticipant = (s) => liveSeeds[s - 1]; // seed 1-based
    const order = bracketOrder(CUP_SIZE); // 128 עמדות
    const p = [];
    order.forEach((s, posIdx) => {
      const opp = bracketComplement - s; // היריב
      const A = seedToParticipant(s);
      if (!A) return;
      if (opp > total) {
        // בּיי — אין יריב. מציגים כשורה (כמו באקסל) עם מספר משחק, מסומן is_bye.
        p.push({ a: A, b: null, match_no: posIdx + 1, is_bye: true });
        return;
      }
      const B = seedToParticipant(opp);
      if (!B) return;
      p.push({ a: A, b: B, match_no: posIdx + 1 }); // מספר המשחק = עמדה בעץ + 1
    });
    return p;
  }, [liveSeeds, bracketComplement]);

  // המדורגים שמקבלים בּיי: אלה שהיריב שלהם (257-seed) גדול ממספר המשתתפים
  const byeSeeds = useMemo(() => {
    if (!needsPrelim) return [];
    const total = liveSeeds.length;
    return liveSeeds.filter(s => (bracketComplement - s.seed) > total);
  }, [liveSeeds, needsPrelim, bracketComplement]);

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
    const h = cupData.history?.[roundIdx]; if (!h) return null;
    const rec = h.results.find(r => r.winner === seed || r.loser === seed);
    if (!rec) return null; // לא שיחק באותו סיבוב (בּיי) → דלג (null), לא 0
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
    // ד-ה. הפרשי ניצחון אחורה (מהסיבוב האחרון שהוכרע ועד סיבוב 1).
    //       סיבוב שבו לאחד מהם היה בּיי (margin=null) — מדולג לגמרי.
    const hist = cupData.history || [];
    for (let i = hist.length - 1; i >= 0; i--) {
      const ma = marginInRound(a, i), mb = marginInRound(b, i);
      if (ma === null || mb === null) continue; // בּיי לאחד הצדדים → דלג על הסיבוב הזה
      if (ma !== mb) { const w = ma > mb ? a : b; return { winner: w, loser: w === a ? b : a, margin: 0, rule: i === hist.length - 1 ? 'ד' : 'ה' }; }
    }
    // ו. המדורג הגבוה (seed קטן)
    const w = a < b ? a : b;
    return { winner: w, loser: w === a ? b : a, margin: 0, rule: 'ו' };
  };

  // ═══ פעולות ═══
  const lockBracket = async () => {
    if (!currentGame || !isAdmin) return;
    if (liveSeeds.length < CUP_SIZE) { toast({ title: 'אין מספיק משתתפים', description: `נדרשים לפחות ${CUP_SIZE}, קיימים ${rankings.length}`, variant: 'destructive' }); return; }
    setWorking(true);
    try {
      const pairs = livePairs.filter(p => !p.is_bye).map(p => ({ a: p.a.seed, b: p.b.seed, match_no: p.match_no }));
      const cupStart = {}; liveSeeds.forEach(s => { cupStart[s.seed] = s.entry_score; }); // נקודת אפס לכלל ב'
      // אם יש סיבוב מקדים — שומרים את הבּיי כדי לצרף אותם אחרי הכרעת הסיבוב המקדים
      const byes = needsPrelim ? byeSeeds.map(s => s.seed) : [];
      await saveCup({
        size: CUP_SIZE, locked_at: new Date().toISOString(), seeds: liveSeeds,
        current_round: 1,
        is_prelim: needsPrelim,            // סיבוב 1 הוא מקדים?
        round_size: needsPrelim ? liveSeeds.length : CUP_SIZE,
        bye_seeds: byes,                   // המדורגים שעוברים אוטומטית לסיבוב 2
        round_start_scores: {}, round_start_set: false,
        cup_start_scores: cupStart, pairs, history: [], alive: liveSeeds.map(s => s.seed),
      });
      toast({
        title: '🔒 הבראקט קובע!',
        description: needsPrelim ? `סיבוב מקדים: ${pairs.length} דו-קרבות + ${byes.length} בּיי` : `${CUP_SIZE} משתתפים ננעלו`,
        className: 'bg-green-900/30 border-green-500 text-green-200'
      });
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
                 match_no: pair.match_no, sa: roundScoreOf(pair.a), sb: roundScoreOf(pair.b) };
      });
      const matchWinners = results.map(r => r.winner);

      // 🆕 בניית הסיבוב הבא תוך שמירה על מבנה עץ הזריעה.
      let advancing;
      if (wasPrelim) {
        // הסיבוב המקדים: המנצחים כבר בסדר העץ (לפי cupData.pairs שנבנו ב-bracketOrder).
        // צריך לשבץ את הבּיי במיקומם הנכון בעץ. הבּיי (seed 1-14) תופסים עמדות בודדות בעץ,
        // והמשחקים תופסים עמדות-זוג. נשחזר את סדר 128 העמדות:
        const order = bracketOrder(CUP_SIZE);           // 128 עמדות
        const comp = 2 * CUP_SIZE + 1;                  // 257
        const byeSet = new Set(byes);
        const winnerBySeedA = {};                       // עמדת-זרע s → מנצח הדו-קרב שלו
        results.forEach(r => { winnerBySeedA[Math.min(r.a, r.b)] = r.winner; });
        // לכל עמדה בעץ: אם זרע s הוא bye → s עצמו; אחרת מנצח הדו-קרב (s ↔ comp-s)
        advancing = order.map(s => {
          if (byeSet.has(s)) return s;
          const lowSeed = Math.min(s, comp - s);
          return winnerBySeedA[lowSeed] ?? s;
        });
      } else {
        // סיבוב רגיל: המנצחים כבר בסדר העץ (לפי cupData.pairs). פשוט אוסף לפי הסדר.
        advancing = matchWinners;
      }

      const histEntry = {
        round_size: cupData.round_size, round_index: cupData.current_round,
        is_prelim: wasPrelim, bye_seeds: byes,
        decided_at: new Date().toISOString(), results,
      };
      const newHistory = [...(cupData.history || []), histEntry];

      if (advancing.length === 1) {
        await saveCup({ ...cupData, history: newHistory, alive: advancing, champion: advancing[0], round_start_set: false });
        toast({ title: '🏆 יש אלוף לגביע יוסי!', description: nameOf(advancing[0]), className: 'bg-amber-900/30 border-amber-500 text-amber-200' });
      } else {
        // זוגות הסיבוב הבא: עמדות עוקבות בעץ נפגשות (0↔1, 2↔3, ...) — שומר מבנה עץ.
        const nextPairs = [];
        for (let i = 0; i < advancing.length; i += 2) nextPairs.push({ a: advancing[i], b: advancing[i + 1], match_no: (i / 2) + 1 });
        await saveCup({
          ...cupData, history: newHistory, alive: advancing,
          current_round: cupData.current_round + 1, round_size: advancing.length,
          is_prelim: false,            // מהסיבוב הבא ואילך — בראקט רגיל
          pairs: nextPairs, round_start_scores: {}, round_start_set: false,
        });
        const desc = wasPrelim ? `${matchWinners.length} מנצחים + ${byes.length} בּיי = ${advancing.length}` : 'קבע ניקוד לסיבוב הבא';
        toast({ title: `✅ הסיבוב הוכרע! ${advancing.length} ממשיכים`, description: desc, className: 'bg-green-900/30 border-green-500 text-green-200' });
      }
      setViewRound(null);
    } catch (err) { console.error(err); toast({ title: 'שגיאה בהכרעה', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /><span className="mr-3 text-cyan-300">טוען גביע יוסי...</span></div>;

  // רשימת השלבים לבורר (מההיסטוריה + הסיבוב הנוכחי)
  const stageButtons = [];
  if (cupData) {
    (cupData.history || []).forEach((h, i) => stageButtons.push({ idx: i, size: h.round_size, label: roundLabel(h.round_size, h.is_prelim), done: true }));
    if (!cupData.champion) stageButtons.push({ idx: 'current', size: cupData.round_size, label: roundLabel(cupData.round_size, cupData.is_prelim), done: false });
  }
  const showingHistory = cupData && viewRound !== null && viewRound !== 'current';
  const histToShow = showingHistory ? cupData.history[viewRound] : null;

  // ── שורת דו-קרב מינימליסטית (קומפקטית, מעט מספרים) ──
  // side: { seed, name, score?(ניקוד סיבוב), entry? } | won/lost: הדגשה
  const MatchRow = ({ idx, a, b, sa, sb, won, matchNo }) => {
    // won: 'a'|'b'|'tie'|null
    return (
      <div className="flex items-center text-sm rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
        {/* מספר משחק */}
        {matchNo != null && <span className="text-[10px] text-slate-500 w-7 text-center flex-shrink-0 tabular-nums" style={{ borderLeft: '1px solid rgba(100,116,139,0.2)' }}>{matchNo}</span>}
        {/* צד A */}
        <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 min-w-0 ${won === 'b' ? 'opacity-45' : ''}`}>
          <span className="text-[10px] text-amber-400/70 w-7 flex-shrink-0 tabular-nums">{a.seed}</span>
          <span className="text-slate-200 truncate">{a.name}</span>
          {sa != null && <span className={`mr-auto text-xs font-bold flex-shrink-0 ${won === 'a' ? 'text-green-400' : 'text-slate-500'}`}>{sa >= 0 ? '+' : ''}{sa}</span>}
          {won === 'a' && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
        </div>
        <span className="text-[9px] text-slate-600 px-1 flex-shrink-0">·</span>
        {/* צד B */}
        <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 justify-end min-w-0 ${won === 'a' ? 'opacity-45' : ''}`}>
          {won === 'b' && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
          {sb != null && <span className={`ml-auto text-xs font-bold flex-shrink-0 ${won === 'b' ? 'text-green-400' : 'text-slate-500'}`}>{sb >= 0 ? '+' : ''}{sb}</span>}
          <span className="text-slate-200 truncate">{b.name}</span>
          <span className="text-[10px] text-slate-500 w-7 text-left flex-shrink-0 tabular-nums">{b.seed}</span>
        </div>
      </div>
    );
  };

  // ── עץ בראקט ויזואלי: עמודה לכל סיבוב, מנצחים מתחברים לסיבוב הבא ──
  const BracketTree = () => {
    if (!cupData) return null;
    // בונים עמודות: כל סיבוב שהוכרע (מההיסטוריה) + הסיבוב הנוכחי
    const columns = [];
    (cupData.history || []).forEach(h => {
      columns.push({
        label: roundLabel(h.round_size, h.is_prelim),
        matches: h.results.map(r => ({ a: nameOf(r.a), b: nameOf(r.b), seedA: r.a, seedB: r.b, won: r.winner === r.a ? 'a' : 'b' })),
      });
    });
    if (!cupData.champion) {
      columns.push({
        label: roundLabel(cupData.round_size, cupData.is_prelim),
        matches: cupData.pairs.map(p => {
          const sa = roundScoreOf(p.a), sb = roundScoreOf(p.b);
          const w = (sa != null && sb != null) ? (sa > sb ? 'a' : sb > sa ? 'b' : null) : null;
          return { a: nameOf(p.a), b: nameOf(p.b), seedA: p.a, seedB: p.b, won: w, live: true };
        }),
      });
    } else {
      columns.push({ label: 'אלוף', champion: nameOf(cupData.champion) });
    }

    return (
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-1.5" style={{ minWidth: 190 }}>
              <div className="text-[11px] font-bold text-cyan-300 text-center pb-1 sticky top-0">{col.label}</div>
              {col.champion ? (
                <div className="flex flex-col items-center justify-center gap-1 py-4 px-3 rounded-lg" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.4)' }}>
                  <Crown className="w-6 h-6 text-amber-400" />
                  <span className="text-sm font-bold text-amber-300 text-center">{col.champion}</span>
                </div>
              ) : (
                col.matches.map((m, mi) => (
                  <div key={mi} className="rounded-md text-xs overflow-hidden" style={{ background: 'rgba(15,23,42,0.6)', border: `1px solid ${m.live ? 'rgba(6,182,212,0.25)' : 'rgba(100,116,139,0.18)'}` }}>
                    <div className={`flex items-center gap-1.5 px-2 py-1 ${m.won === 'b' ? 'opacity-40' : ''}`}>
                      <span className="text-[9px] text-amber-400/60 w-5 flex-shrink-0 tabular-nums">{m.seedA}</span>
                      <span className="text-slate-200 truncate">{m.a}</span>
                      {m.won === 'a' && <Crown className="w-2.5 h-2.5 text-amber-400 flex-shrink-0 mr-auto" />}
                    </div>
                    <div className="h-px" style={{ background: 'rgba(100,116,139,0.15)' }} />
                    <div className={`flex items-center gap-1.5 px-2 py-1 ${m.won === 'a' ? 'opacity-40' : ''}`}>
                      <span className="text-[9px] text-slate-500 w-5 flex-shrink-0 tabular-nums">{m.seedB}</span>
                      <span className="text-slate-200 truncate">{m.b}</span>
                      {m.won === 'b' && <Crown className="w-2.5 h-2.5 text-amber-400 flex-shrink-0 mr-auto" />}
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-amber-400" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-amber-300">גביע יוסי</h1>
            <p className="text-xs md:text-sm text-slate-400">פיילוט — נוק-אאוט במקביל לליגה</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={loadRankings} disabled={working} size="sm" variant="outline" className="border-slate-600 text-slate-300">
            <RefreshCw className="w-4 h-4 ml-2" /> רענן ניקוד
          </Button>
        )}
      </div>

      {isAdmin && (
        <div className="mb-4 p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <span className="text-xs text-amber-200">כפתורי העריכה והפעולה מופיעים לך כמנהל בלבד. המשתמשים רואים את הבראקט והניקוד בלבד.</span>
        </div>
      )}

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
                  <RefreshCw className="w-4 h-4" /> תצוגה חיה — {liveSeeds.length} משתתפים{needsPrelim ? ` (סיבוב מקדים)` : ''}
                </CardTitle>
                {isAdmin && (
                  <Button onClick={lockBracket} disabled={working || liveSeeds.length < CUP_SIZE} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                    {working ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Lock className="w-4 h-4 ml-2" />} קבע בראקט סופי
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-blue-200">🔴 הזוגות מתעדכנים אוטומטית עם כל שינוי בדירוג. <b>קבע בראקט סופי</b> רק בסוף המחזור הראשון.</p>
              {fixedSeeding && Array.isArray(fixedSeeding) && fixedSeeding.length > 0
                ? <p className="text-xs text-green-300 mt-1">✅ סידינג קבוע מהאקסל פעיל ({fixedSeeding.length} משתתפים) — המיון מדויק לבראקט הרשמי.</p>
                : <p className="text-xs text-red-300 mt-1">⚠️ סידינג קבוע <b>לא</b> נטען — משתמש בטבלת הדירוג (המיון עלול לא להתאים). ודא שהרצת את ה-SQL.</p>}
              {needsPrelim && <p className="text-xs text-cyan-300 mt-1">ℹ️ סיבוב מקדים: {byeCount} המדורגים העליונים מקבלים בּיי (כרטיס אוטומטי) ל-128, ושאר {liveSeeds.length - byeCount} המשתתפים משחקים {livePairs.filter(p => !p.is_bye).length} דו-קרבות.</p>}
              {liveSeeds.length < CUP_SIZE && <p className="text-xs text-amber-300 mt-1">⚠️ כרגע {liveSeeds.length} משתתפים בלבד — נדרשים לפחות {CUP_SIZE}.</p>}
            </CardContent>
          </Card>
          {needsPrelim && byeSeeds.length > 0 && (
            <div className="mb-2 p-2 rounded-lg" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.25)' }}>
              <p className="text-xs text-green-300 mb-1.5 font-medium">⏭️ בּיי לסיבוב 2 ({byeSeeds.length} מדורגים עליונים):</p>
              <div className="flex flex-wrap gap-1.5">
                {byeSeeds.map(s => (
                  <span key={s.seed} className="text-[11px] text-green-200 px-2 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.1)' }}>
                    {s.seed}. {s.participant_name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            {livePairs.map((pair, idx) => (
              pair.is_bye ? (
                <div key={idx} className="flex items-center text-sm rounded-md overflow-hidden" style={{ background: 'rgba(52,211,153,0.06)' }}>
                  <span className="text-[10px] text-slate-500 w-7 text-center flex-shrink-0 tabular-nums" style={{ borderLeft: '1px solid rgba(100,116,139,0.2)' }}>{pair.match_no}</span>
                  <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 min-w-0">
                    <span className="text-[10px] text-amber-400/70 w-7 flex-shrink-0 tabular-nums">{pair.a.seed}</span>
                    <span className="text-slate-200 truncate">{pair.a.participant_name}</span>
                  </div>
                  <span className="text-[10px] text-green-400 px-2 flex-shrink-0">⏭️ עולה אוטומטית (בּיי)</span>
                </div>
              ) : (
                <MatchRow key={idx} idx={idx} matchNo={pair.match_no}
                  a={{ seed: pair.a.seed, name: pair.a.participant_name }}
                  b={{ seed: pair.b.seed, name: pair.b.participant_name }}
                  sa={null} sb={null} won={null} />
              )
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

          {/* מתג תצוגה: רשימה / עץ ויזואלי */}
          <div className="flex gap-1.5 mb-3">
            <button onClick={() => setViewMode('list')}
              className="text-[11px] font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
              style={{ color: viewMode === 'list' ? '#0f172a' : '#94a3b8', background: viewMode === 'list' ? '#38bdf8' : 'rgba(255,255,255,0.04)', border: `1px solid ${viewMode === 'list' ? '#38bdf8' : 'rgba(148,163,184,0.3)'}` }}>
              <List className="w-3.5 h-3.5" /> רשימה
            </button>
            <button onClick={() => setViewMode('tree')}
              className="text-[11px] font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
              style={{ color: viewMode === 'tree' ? '#0f172a' : '#94a3b8', background: viewMode === 'tree' ? '#38bdf8' : 'rgba(255,255,255,0.04)', border: `1px solid ${viewMode === 'tree' ? '#38bdf8' : 'rgba(148,163,184,0.3)'}` }}>
              <GitBranch className="w-3.5 h-3.5" /> עץ בראקט
            </button>
          </div>

          {/* ── תצוגת עץ ויזואלי ── */}
          {viewMode === 'tree' ? (
            <Card style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <CardContent className="py-3 px-3">
                <BracketTree />
              </CardContent>
            </Card>
          ) : (
          <>
          {/* תצוגת סיבוב היסטורי (קריאה בלבד) */}
          {showingHistory ? (
            <Card style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <CardHeader className="py-3">
                <CardTitle className="text-base text-slate-300 flex items-center gap-2"><History className="w-4 h-4" /> {roundLabel(histToShow.round_size, histToShow.is_prelim)} — הוכרע (קריאה בלבד)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {histToShow.results.map((r, i) => (
                  <MatchRow key={i} idx={i} matchNo={r.match_no}
                    a={{ seed: r.a, name: nameOf(r.a) }}
                    b={{ seed: r.b, name: nameOf(r.b) }}
                    sa={r.sa} sb={r.sb}
                    won={r.winner === r.a ? 'a' : 'b'} />
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
                    <CardTitle className="text-base text-cyan-300 flex items-center gap-2"><Flag className="w-4 h-4" /> {roundLabel(cupData.round_size, cupData.is_prelim)} · פעיל</CardTitle>
                    {isAdmin && (
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
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {!cupData.round_start_set
                    ? <p className="text-xs text-amber-300">⚠️ עדיין לא נקבעה נקודת ייחוס לסיבוב זה. לחץ "קבע ניקוד לסיבוב" בתחילתו.</p>
                    : <p className="text-xs text-green-300">✅ "ניקוד הסיבוב" מציג את ההפרש מתחילת הסיבוב. לחץ "הכרע סיבוב" בסיומו.</p>}
                </CardContent>
              </Card>
              <div className="flex flex-col gap-1">
                {cupData.pairs.map((pair, idx) => {
                  const sa = roundScoreOf(pair.a), sb = roundScoreOf(pair.b);
                  const leader = (sa != null && sb != null) ? (sa > sb ? 'a' : sb > sa ? 'b' : 'tie') : null;
                  return (
                    <MatchRow key={idx} idx={idx} matchNo={pair.match_no}
                      a={{ seed: pair.a, name: nameOf(pair.a) }}
                      b={{ seed: pair.b, name: nameOf(pair.b) }}
                      sa={sa} sb={sb}
                      won={leader === 'tie' ? null : leader} />
                  );
                })}
              </div>
            </>
          )}
          </>
          )}
        </>
      )}
    </div>
  );
}
