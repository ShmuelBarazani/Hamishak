import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
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
  const [myName, setMyName] = useState(''); // שם המשתתף לחיפוש והדגשה

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

  // רשימת כל שמות המשתתפים (לרשימת הבחירה המסננת), ממוינת א-ב
  const allParticipantNames = useMemo(
    () => liveSeeds.map(s => s.participant_name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'he')),
    [liveSeeds]
  );

  // האם נדרש סיבוב מקדים (יותר מ-128 משתתפים)
  const needsPrelim = liveSeeds.length > CUP_SIZE;
  // 🔑 גודל הבראקט הרשמי קבוע: המשלים של זרע s הוא (TOTAL_SEEDS + 1 - s).
  //    TOTAL_SEEDS = מספר המשתתפים בפועל (242 בדרך כלל). הבּיי = זרעים שהמשלים שלהם
  //    חורג מ-CUP_SIZE*2 ... לא. הנוסחה הרשמית: היריב של s הוא (2*CUP_SIZE+1 - s)=257-s,
  //    והבּיי הם הזרעים שהיריב שלהם אינו קיים (257-s > מספר המשתתפים).
  //    כדי שזה יהיה יציב ולא תלוי בכמה שמות הותאמו, נשתמש במספר המשתתפים בפועל.
  const TOTAL_SEEDS = liveSeeds.length;
  const byeCount = needsPrelim ? Math.max(0, 2 * CUP_SIZE - TOTAL_SEEDS) : 0;

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

  // ── חיפוש: מציאת המשחק של המשתתף לפי שם ──
  //   מחזיר { match_no, opponent, isBye, side } או null אם לא נמצא / שם ריק.
  const myMatchInfo = (() => {
    const q = (myName || '').trim();
    if (!q) return null;
    const norm = (s) => (s || '').trim();
    const isMe = (name) => norm(name) === q;

    if (!cupData) {
      // לפני קיבוע — מחפשים ב-livePairs (כולל בּיי)
      for (const p of livePairs) {
        if (p.is_bye && isMe(p.a.participant_name)) return { match_no: p.match_no, isBye: true };
        if (!p.is_bye && isMe(p.a.participant_name)) return { match_no: p.match_no, opponent: p.b.participant_name, side: 'a' };
        if (!p.is_bye && isMe(p.b?.participant_name)) return { match_no: p.match_no, opponent: p.a.participant_name, side: 'b' };
      }
      return null;
    }
    // אחרי קיבוע — מחפשים בזוגות הסיבוב הנוכחי
    for (const pair of (cupData.pairs || [])) {
      if (isMe(nameOf(pair.a))) return { match_no: pair.match_no, opponent: nameOf(pair.b), side: 'a' };
      if (isMe(nameOf(pair.b))) return { match_no: pair.match_no, opponent: nameOf(pair.a), side: 'b' };
    }
    // בּיי בסיבוב מקדים
    if (cupData.is_prelim && cupData.current_round === 1) {
      const order = bracketOrder(CUP_SIZE);
      for (const seed of (cupData.bye_seeds || [])) {
        if (isMe(nameOf(seed))) {
          const posIdx = order.indexOf(seed);
          return { match_no: posIdx >= 0 ? posIdx + 1 : null, isBye: true };
        }
      }
    }
    return null;
  })();

  // האם שם נתון הוא "אני" (להדגשה)
  const isMyName = (name) => {
    const q = (myName || '').trim();
    return q && (name || '').trim() === q;
  };

  // ── שורת דו-קרב מינימליסטית ──
  //   המוביל בזיווג: ניקוד ירוק + כתר. המפגר: ניקוד אדום + עמעום קל.
  //   תיקו / טרם החל: אפור ניטרלי.
  const MatchRow = ({ idx, a, b, sa, sb, won, matchNo }) => {
    // won: 'a'|'b'|'tie'|null
    const scoreColor = (side) => {
      if (won == null || won === 'tie') return 'text-slate-400'; // טרם הוכרע מוביל
      return won === side ? 'text-green-400' : 'text-red-400';   // מוביל=ירוק, מפגר=אדום
    };
    const meA = isMyName(a.name);
    const meB = isMyName(b.name);
    return (
      <div className="flex items-center text-sm rounded-md overflow-hidden" style={{ background: (meA || meB) ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.02)', boxShadow: (meA || meB) ? 'inset 0 0 0 1px rgba(56,189,248,0.5)' : 'none' }}>
        {/* מספר משחק */}
        {matchNo != null && <span className="text-[10px] text-slate-500 w-7 text-center flex-shrink-0 tabular-nums" style={{ borderLeft: '1px solid rgba(100,116,139,0.2)' }}>{matchNo}</span>}
        {/* צד A */}
        <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 min-w-0 ${won === 'b' ? 'opacity-60' : ''}`}>
          <span className="text-[10px] text-amber-400/70 w-7 flex-shrink-0 tabular-nums">{a.seed}</span>
          <span className={`truncate ${meA ? 'text-cyan-300 font-bold' : 'text-slate-200'}`}>{a.name}{meA ? ' ⭐' : ''}</span>
          {sa != null && <span className={`mr-auto text-xs font-bold flex-shrink-0 ${scoreColor('a')}`}>{sa >= 0 ? '+' : ''}{sa}</span>}
          {won === 'a' && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
        </div>
        <span className="text-[9px] text-slate-600 px-1 flex-shrink-0">·</span>
        {/* צד B */}
        <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 justify-end min-w-0 ${won === 'a' ? 'opacity-60' : ''}`}>
          {won === 'b' && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
          {sb != null && <span className={`ml-auto text-xs font-bold flex-shrink-0 ${scoreColor('b')}`}>{sb >= 0 ? '+' : ''}{sb}</span>}
          <span className={`truncate ${meB ? 'text-cyan-300 font-bold' : 'text-slate-200'}`}>{meB ? '⭐ ' : ''}{b.name}</span>
          <span className="text-[10px] text-slate-500 w-7 text-left flex-shrink-0 tabular-nums">{b.seed}</span>
        </div>
      </div>
    );
  };

  // ── עץ בראקט ויזואלי מלא: כל השלבים מצוירים מראש, עתידיים כתיבות ריקות. ──
  //   הבּיי משובצים במיקומם הנכון וכבר ממולאים בעמודת הסיבוב השני.
  const BracketTree = () => {
    if (!cupData) return null;

    // צבע ניקוד: מוביל=ירוק, מפגר=אדום, טרם=אפור
    const scoreClr = (m, side) => {
      if (m.won == null) return 'text-slate-400';
      return m.won === side ? 'text-green-400' : 'text-red-400';
    };

    // 1) בונים את שלד כל השלבים. גודל כל שלב: מקדים(אם יש) → 128 → 64 → ... → 1.
    const order = bracketOrder(CUP_SIZE); // 128 עמדות
    const comp = 2 * CUP_SIZE + 1;        // 257
    const byeSet = new Set(cupData.bye_seeds || []);
    const hasPrelim = cupData.is_prelim || (cupData.history || []).some(h => h.is_prelim);

    // מיפוי: מאיזה סיבוב בהיסטוריה/נוכחי לקחת נתונים
    const decidedRounds = cupData.history || [];
    const currentRoundSize = cupData.champion ? 1 : cupData.round_size;

    // שלבי הגדלים: [מקדים?] ואז 128,64,...,2 (הגמר). אין עמודת זוכה נפרדת.
    const sizes = [];
    if (hasPrelim) sizes.push({ size: 242, isPrelim: true });
    let s = CUP_SIZE;
    while (s >= 2) { sizes.push({ size: s, isPrelim: false }); s = Math.floor(s / 2); }

    // 2) לכל שלב — בונים את רשימת התיבות (משחקים). שלב שהוכרע → מההיסטוריה.
    //    שלב נוכחי → cupData.pairs. שלב עתידי → תיבות ריקות.
    //    בּיי: בעמודת 128 (סיבוב 2) הם כבר ממולאים.
    const columns = sizes.map((st) => {
      // מצא אם השלב הזה הוכרע (לפי גודל + prelim)
      const decided = decidedRounds.find(h => h.round_size === st.size && !!h.is_prelim === st.isPrelim);
      const isCurrent = !cupData.champion && currentRoundSize === st.size && (cupData.is_prelim === st.isPrelim);

      const numMatches = Math.floor(st.size / 2);

      if (decided) {
        // שלב שהוכרע — מההיסטוריה
        return {
          label: roundLabel(st.size, st.isPrelim),
          matches: decided.results.map(r => ({
            a: nameOf(r.a), b: nameOf(r.b), seedA: r.a, seedB: r.b, match_no: r.match_no,
            sa: r.sa, sb: r.sb, won: r.winner === r.a ? 'a' : 'b',
          })),
        };
      }

      if (isCurrent) {
        // השלב הפעיל
        return {
          label: roundLabel(st.size, st.isPrelim),
          matches: cupData.pairs.map(p => {
            const sa = roundScoreOf(p.a), sb = roundScoreOf(p.b);
            const w = (sa != null && sb != null) ? (sa > sb ? 'a' : sb > sa ? 'b' : null) : null;
            return { a: nameOf(p.a), b: nameOf(p.b), seedA: p.a, seedB: p.b, match_no: p.match_no, sa, sb, won: w, live: true };
          }),
        };
      }

      // ── שלב עתידי — תיבות ריקות ──
      // מקרה מיוחד: עמודת 128 (סיבוב 2) כשעדיין בסיבוב מקדים → ממלאים את הבּיי במקומם.
      if (st.size === CUP_SIZE && hasPrelim && cupData.is_prelim && !decided) {
        // לכל עמדת עץ: אם הזרע bye → ממולא; אחרת ריק (ממתין למנצח המקדים)
        const rows = [];
        for (let i = 0; i < order.length; i += 2) {
          const sTop = order[i], sBot = order[i + 1];
          const topBye = byeSet.has(sTop);
          const botBye = byeSet.has(sBot);
          rows.push({
            a: topBye ? nameOf(sTop) : null, seedA: topBye ? sTop : null, aBye: topBye,
            b: botBye ? nameOf(sBot) : null, seedB: botBye ? sBot : null, bBye: botBye,
            future: true,
          });
        }
        return { label: roundLabel(st.size, false), matches: rows };
      }

      // שלב עתידי רגיל — תיבות ריקות לגמרי
      return {
        label: roundLabel(st.size, st.isPrelim),
        matches: Array.from({ length: numMatches }, () => ({ a: null, b: null, future: true })),
      };
    });

    // תיבת שם בודדת (ריקה / ממולאת)
    const Cell = ({ name, seed, score, scoreClass, crown, dim, bye, me }) => (
      <div className={`flex items-center gap-1 px-1.5 py-1 ${dim ? 'opacity-50' : ''}`}>
        {seed != null && <span className="text-[8px] text-amber-400/60 w-4 flex-shrink-0 tabular-nums">{seed}</span>}
        {name
          ? <span className={`truncate ${me ? 'text-cyan-300 font-bold' : bye ? 'text-green-300' : 'text-slate-200'}`}>{me ? '⭐ ' : ''}{name}{bye ? ' ⏭️' : ''}</span>
          : <span className="text-slate-600 italic">—</span>}
        {score != null && <span className={`mr-auto text-[10px] font-bold flex-shrink-0 ${scoreClass}`}>{score >= 0 ? '+' : ''}{score}</span>}
        {crown && <Crown className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />}
      </div>
    );

    return (
      <div className="overflow-x-auto pb-2" dir="ltr">
        <div className="flex gap-2 min-w-max" style={{ direction: 'rtl' }}>
          {columns.map((col, ci) => {
            const isFinal = col.label && col.label.includes('גמר');
            return (
            <div key={ci} className="flex flex-col gap-1 flex-shrink-0" style={{ width: 165 }}>
              <div className="text-[10px] font-bold text-cyan-300 text-center pb-0.5 truncate">{col.label}</div>
              {col.matches.map((m, mi) => {
                const champ = isFinal && m.won ? (m.won === 'a' ? m.a : m.b) : null;
                const meA = isMyName(m.a), meB = isMyName(m.b);
                const mine = meA || meB;
                return (
                  <div key={mi} className="rounded text-[11px] overflow-hidden" style={{ background: mine ? 'rgba(56,189,248,0.12)' : 'rgba(15,23,42,0.6)', border: `1px solid ${mine ? 'rgba(56,189,248,0.6)' : m.live ? 'rgba(6,182,212,0.25)' : m.future ? 'rgba(100,116,139,0.1)' : 'rgba(100,116,139,0.18)'}` }}>
                    {m.match_no != null && <div className="text-[8px] text-slate-500 text-center" style={{ background: 'rgba(100,116,139,0.1)' }}>משחק {m.match_no}</div>}
                    <Cell name={m.a} seed={m.seedA} score={m.sa} scoreClass={scoreClr(m, 'a')} crown={m.won === 'a'} dim={m.won === 'b'} bye={m.aBye} me={meA} />
                    <div className="h-px" style={{ background: 'rgba(100,116,139,0.12)' }} />
                    <Cell name={m.b} seed={m.seedB} score={m.sb} scoreClass={scoreClr(m, 'b')} crown={m.won === 'b'} dim={m.won === 'a'} bye={m.bBye} me={meB} />
                    {champ && <div className="text-[10px] text-amber-300 font-bold text-center py-0.5" style={{ background: 'rgba(251,191,36,0.12)' }}>🏆 {champ}</div>}
                  </div>
                );
              })}
            </div>
            );
          })}
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
        <Button onClick={loadRankings} disabled={working} size="sm" variant="outline" className="border-slate-600 text-slate-300">
          <RefreshCw className="w-4 h-4 ml-2" /> רענן ניקוד
        </Button>
      </div>

      {/* 🔍 חיפוש שם — בחירה מרשימה מסננת + מציאת המשחק והיריב + הדגשה ברשימה ובעץ */}
      <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.25)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-cyan-300 font-medium flex-shrink-0">🔍 מצא את המשחק שלך:</span>
          <ParticipantSearchSelect
            participants={allParticipantNames}
            selected={myName || null}
            onSelect={(name) => setMyName(name || '')}
          />
        </div>
        {myName.trim() && (
          <div className="mt-2 text-sm">
            {myMatchInfo ? (
              myMatchInfo.isBye ? (
                <p className="text-green-300">
                  ⏭️ <b>{myName.trim()}</b> — עולה אוטומטית לסיבוב 2 (בּיי){myMatchInfo.match_no ? ` · משחק מס' ${myMatchInfo.match_no}` : ''}
                </p>
              ) : (
                <p className="text-cyan-200">
                  🎯 משחק מס' <b className="text-cyan-300">{myMatchInfo.match_no}</b> · היריב שלך: <b className="text-amber-300">{myMatchInfo.opponent}</b>
                </p>
              )
            ) : (
              <p className="text-slate-400">לא נמצא משתתף בשם זה בסיבוב הנוכחי.</p>
            )}
          </div>
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

          {/* תיבת העולים האוטומטיים (בּיי) — מוצגת גם אחרי הקיבוע בסיבוב המקדים */}
          {cupData.is_prelim && cupData.current_round === 1 && (cupData.bye_seeds || []).length > 0 && (
            <div className="mb-3 p-2 rounded-lg" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.25)' }}>
              <p className="text-xs text-green-300 mb-1.5 font-medium">⏭️ עולים אוטומטית לסיבוב 2 ({(cupData.bye_seeds || []).length} מדורגים עליונים):</p>
              <div className="flex flex-wrap gap-1.5">
                {(cupData.bye_seeds || []).map(seed => (
                  <span key={seed} className="text-[11px] text-green-200 px-2 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.1)' }}>
                    {seed}. {nameOf(seed)}
                  </span>
                ))}
              </div>
            </div>
          )}

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
              <CardContent className="py-3 px-2 overflow-hidden">
                <p className="text-[10px] text-slate-400 mb-2">↔️ גלול לצדדים לצפייה בכל שלבי העץ עד הגמר</p>
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
                    ? (isAdmin
                        ? <p className="text-xs text-amber-300">⚠️ עדיין לא נקבעה נקודת ייחוס לסיבוב זה. לחץ "קבע ניקוד לסיבוב" בתחילתו.</p>
                        : <p className="text-xs text-slate-400">הסיבוב טרם החל להיספר.</p>)
                    : <p className="text-xs text-green-300">🟢 ניקוד הסיבוב מתעדכן בזמן אמת — המוביל בכל זיווג מסומן בירוק והמפגר באדום.</p>}
                </CardContent>
              </Card>
              <div className="flex flex-col gap-1">
                {(() => {
                  // בסיבוב מקדים — משלבים את הבּיי (שנשמרו ב-bye_seeds) עם הזוגות, ממוינים לפי מספר משחק.
                  const byeRows = (cupData.is_prelim && cupData.current_round === 1)
                    ? (cupData.bye_seeds || []).map(seed => {
                        // מספר המשחק של בּיי = עמדת הזרע בעץ + 1
                        const order = bracketOrder(CUP_SIZE);
                        const posIdx = order.indexOf(seed);
                        return { is_bye: true, seed, match_no: posIdx >= 0 ? posIdx + 1 : 9999 };
                      })
                    : [];
                  const matchRows = cupData.pairs.map(pair => ({ ...pair, is_bye: false }));
                  const allRows = [...matchRows, ...byeRows].sort((x, y) => (x.match_no || 0) - (y.match_no || 0));
                  return allRows.map((row, idx) => {
                    if (row.is_bye) {
                      return (
                        <div key={`bye-${row.seed}`} className="flex items-center text-sm rounded-md overflow-hidden" style={{ background: 'rgba(52,211,153,0.06)' }}>
                          <span className="text-[10px] text-slate-500 w-7 text-center flex-shrink-0 tabular-nums" style={{ borderLeft: '1px solid rgba(100,116,139,0.2)' }}>{row.match_no}</span>
                          <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 min-w-0">
                            <span className="text-[10px] text-amber-400/70 w-7 flex-shrink-0 tabular-nums">{row.seed}</span>
                            <span className="text-slate-200 truncate">{nameOf(row.seed)}</span>
                          </div>
                          <span className="text-[10px] text-green-400 px-2 flex-shrink-0">⏭️ עולה אוטומטית (בּיי)</span>
                        </div>
                      );
                    }
                    const sa = roundScoreOf(row.a), sb = roundScoreOf(row.b);
                    const leader = (sa != null && sb != null) ? (sa > sb ? 'a' : sb > sa ? 'b' : 'tie') : null;
                    return (
                      <MatchRow key={`m-${idx}`} idx={idx} matchNo={row.match_no}
                        a={{ seed: row.a, name: nameOf(row.a) }}
                        b={{ seed: row.b, name: nameOf(row.b) }}
                        sa={sa} sb={sb}
                        won={leader === 'tie' ? null : leader} />
                    );
                  });
                })()}
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

// ── רכיב בחירת משתתף עם חיפוש מסנן (זהה למסך צפייה בניחושים) ──
function ParticipantSearchSelect({ participants, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState(null);
  const ref = React.useRef(null);
  const listRef = React.useRef(null);

  const updatePos = React.useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  const openList = () => { updatePos(); setOpen(true); };

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          listRef.current && !listRef.current.contains(e.target)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePos();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); };
  }, [open, updatePos]);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    if (!q) return participants;
    return participants.filter(p => p.includes(q));
  }, [participants, query]);

  useEffect(() => { setHighlight(0); }, [query]);
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[highlight];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight, open]);

  const choose = (name) => { onSelect(name); setQuery(''); setOpen(false); };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { openList(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) choose(filtered[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  const dropdown = open && pos ? createPortal(
    <div ref={listRef} dir="rtl" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 100000, maxHeight: '300px', overflowY: 'auto', backgroundColor: '#0b1220', backgroundImage: 'linear-gradient(180deg, #101b30 0%, #0b1220 100%)', border: '1px solid rgba(6,182,212,0.5)', borderRadius: '8px', boxShadow: '0 12px 32px rgba(0,0,0,0.85)' }}>
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.82rem', textAlign: 'right' }}>לא נמצאו שמות מתאימים</div>
      ) : filtered.map((p, i) => (
        <div key={p}
          onClick={() => choose(p)}
          onMouseEnter={() => setHighlight(i)}
          style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'right', color: p === selected ? '#22d3ee' : '#f8fafc', fontWeight: p === selected ? 700 : 400, background: i === highlight ? 'rgba(6,182,212,0.22)' : '#0b1220', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {p}
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '34px', padding: '0 10px', borderRadius: '6px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.3)' }}>
        <input
          value={open ? query : (selected || '')}
          onChange={(e) => { setQuery(e.target.value); if (!open) openList(); }}
          onFocus={() => { openList(); setQuery(''); }}
          onKeyDown={onKeyDown}
          placeholder={selected || 'הקלד שם לחיפוש...'}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '0.85rem', textAlign: 'right', fontFamily: 'inherit' }}
        />
        {selected && !open && (
          <button onClick={() => { onSelect(null); setQuery(''); }} title="נקה בחירה" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.8rem', padding: '0 2px', lineHeight: 1 }}>✕</button>
        )}
        <span onClick={() => { if (open) { setOpen(false); } else { openList(); } setQuery(''); }} style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.65rem' }}>▼</span>
      </div>
      {dropdown}
    </div>
  );
}
