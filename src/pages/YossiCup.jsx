import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2, Crown, Flag, Lock, Save, AlertTriangle, RefreshCw, Gavel, History, Play, Check, List, GitBranch, X } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { calculateQuestionScore, isScoreFinal } from "@/components/scoring/ScoreService";
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

// ⚖️ תיאורי כללי ההכרעה (א-ו) — תצוגה בלבד, המנוע עצמו ב-decidePair לא משתנה.
//    כלל א = ניצחון רגיל בניקוד הסיבוב; ב-ו = שוברי שוויון כשניקוד הסיבוב זהה.
const RULE_DESC = {
  'א': 'ניקוד הסיבוב',
  'ב': 'ניקוד מצטבר גבוה יותר מתחילת הגביע (סיבוב 1)',
  'ג': 'ניקוד כניסה גבוה יותר לגביע (בעת הזריעה)',
  'ד': 'הפרש ניצחון גדול יותר בסיבוב הקודם',
  'ה': 'הפרש ניצחון גדול יותר בסיבוב מוקדם יותר',
  'ו': 'המדורג הגבוה יותר בזריעת הגביע',
};
// שמות תקניים לפי גודל הסיבוב (תואם למספר המשתתפים הנותרים)
const roundLabel = (size, isPrelim) => {
  if (isPrelim) return `סיבוב 1 (מקדים) · ${size} משתתפים`;
  // אחרי המקדים, לפי מספר המשתתפים בסיבוב:
  //   128→סיבוב 2, 64→סיבוב 3, 32→שלב ה-16, 16→שמינית גמר, 8→רבע גמר, 4→חצי גמר, 2→גמר
  const map = {
    128: 'סיבוב 2', 64: 'סיבוב 3', 32: 'שלב ה-16',
    16: 'שמינית גמר', 8: 'רבע גמר', 4: 'חצי גמר', 2: 'גמר', 1: 'אלוף'
  };
  return map[size] || `סיבוב · ${size}`;
};

// ── מספור גלובלי רציף בין השלבים ──
//   מקדים תופס מספרים 1..128 (לפי עמדות העץ). כל שלב הבא ממשיך מהמספר הבא.
//   סיבוב 2 (64 משחקים) → 129..192, סיבוב 3 (32) → 193..224, שמינית(16)→225..240,
//   רבע(8)→241..248, חצי(4)→249..252, גמר(2... למעשה 1 משחק) → 253.
//   הקלט: roundSize (גודל הסיבוב = מספר המשתתפים בו), isPrelim, ו-localMatchNo (1-based בתוך השלב).
const CUP = 128;
const globalOffset = (roundSize, isPrelim) => {
  if (isPrelim) return 0;                 // מקדים: מספר גלובלי = localMatchNo (1..128)
  // אחרי המקדים: השלבים בגדלים 128,64,32,16,8,4,2.
  // offset מצטבר: לפני סיבוב2 כבר "נוצלו" 128 מספרים (המקדים).
  let off = CUP;                          // 128 (המקדים)
  let s = CUP;                            // מתחילים מ-128 (סיבוב 2)
  while (s > roundSize) { off += s / 2; s = s / 2; }
  return off;
};
const globalMatchNo = (roundSize, isPrelim, localMatchNo) => globalOffset(roundSize, isPrelim) + localMatchNo;

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
  const [viewMode, setViewMode] = useState('tree'); // 'tree' = עץ בראקט (ברירת מחדל) | 'list' = רשימה
  const [myName, setMyName] = useState(''); // שם המשתתף לחיפוש והדגשה
  const [peekPair, setPeekPair] = useState(null); // {me, opp} למסך צף של ניחושי דו-קרב
  const [showPotential, setShowPotential] = useState(false); // הצגת יריבים פוטנציאליים בעץ
  const [tiePopup, setTiePopup] = useState(null); // ⚖️ חלונית הסבר שובר-שוויון: {rule, vals, aName, bName, sa, live}
  const [showRules, setShowRules] = useState(false);  // 📖 הצגת רשימת כללי ההכרעה

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
  // 🔧 נירמול שם להשוואה — מתקן אי-התאמת שמות בין זריעת הגביע לטבלת הדירוג, שגרמה
  //    למשתתפים להופיע עם 0 נקודות. מסיר רווחים סביב '+' (שמות מאוחדים) ומכווץ רווחים.
  const normName = (n) => (n || '').replace(/\s*\+\s*/g, '+').replace(/\s+/g, ' ').trim();
  const scoreByName = useMemo(() => {
    const m = {}; rankings.forEach(r => { m[normName(r.participant_name)] = r.current_score; }); return m;
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
          entry_score: scoreByName[normName(s.participant_name)] ?? 0,
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
    return (scoreByName[normName(s.participant_name)] ?? 0) - (cupData.round_start_scores[seed] ?? 0);
  };
  // ניקוד מתחילת סיבוב 1 (לכלל ב') = current − cup_start_score
  const cupTotalOf = (seed) => {
    const s = seedInfo(seed); if (!s) return 0;
    return (scoreByName[normName(s.participant_name)] ?? 0) - (cupData.cup_start_scores?.[seed] ?? s.entry_score);
  };
  // הפרש ניצחון בסיבוב היסטורי מסוים (לכללים ד-ה)
  const marginInRound = (seed, roundIdx) => {
    const h = cupData.history?.[roundIdx]; if (!h) return null;
    const rec = h.results.find(r => r.winner === seed || r.loser === seed);
    if (!rec) return null; // לא שיחק באותו סיבוב (בּיי) → דלג (null), לא 0
    return rec.winner === seed ? (rec.margin ?? 0) : -(rec.margin ?? 0);
  };

  // ⚖️ שחזור ערכי שובר השוויון לסיבובים שהוכרעו לפני שהתחלנו להקפיא אותם.
  //    ג/ו — סטטיים מטבעם. ד/ה — הפרשי הניצחון של סיבובי העבר שמורים וקפואים
  //    בהיסטוריה (margin בכל תוצאה), ולכן ההליכה-אחורה משוחזרת במדויק כפי שהמנוע
  //    ביצע אותה ברגע ההכרעה. ב — דורש את הניקוד הכולל באותו רגע, שלא צולם אז,
  //    ולכן אינו ניתן לשחזור מדויק (מהיום הוא נשמר בשדה tie בעת ההכרעה).
  const reconstructHistVals = (rule, histIdx, a, b) => {
    if (rule === 'ג') return { label: 'ניקוד הכניסה לגביע (בעת הזריעה)', va: entryOf(a), vb: entryOf(b) };
    if (rule === 'ו') return { label: 'דירוג הזריעה (הנמוך עולה)', va: a, vb: b };
    if (rule === 'ד' || rule === 'ה') {
      const hist = cupData?.history || [];
      const marginFromHist = (h, seed) => {
        const rec = h.results.find(r => r.winner === seed || r.loser === seed);
        if (!rec) return null; // בּיי / לא שיחק — מדולג, בדיוק כמו במנוע
        return rec.winner === seed ? (rec.margin ?? 0) : -(rec.margin ?? 0);
      };
      for (let i = histIdx - 1; i >= 0; i--) {
        const ma = marginFromHist(hist[i], a), mb = marginFromHist(hist[i], b);
        if (ma === null || mb === null) continue;
        if (ma !== mb) return { label: `הפרש הניצחון ב${roundLabel(hist[i].round_size, !!hist[i].is_prelim)}`, va: ma, vb: mb };
      }
    }
    return null; // כלל ב בסיבוב ישן — אין נתון מוקפא ואין שחזור מדויק
  };

  // ── מנוע ההכרעה: מחזיר {winner, loser, margin, rule, vals} ──
  //    vals (תצוגה בלבד): {label, va, vb} — הערכים שעמדו מאחורי שובר השוויון,
  //    ביחס לצדדים a/b. ההכרעה עצמה לא השתנתה במאום.
  const decidePair = (a, b) => {
    const ra = roundScoreOf(a) ?? 0, rb = roundScoreOf(b) ?? 0;
    // א. ניקוד הסיבוב
    if (ra !== rb) { const w = ra > rb ? a : b; return { winner: w, loser: w === a ? b : a, margin: Math.abs(ra - rb), rule: 'א', vals: null }; }
    // ב. ניקוד מתחילת סיבוב 1
    const ca = cupTotalOf(a), cb = cupTotalOf(b);
    if (ca !== cb) { const w = ca > cb ? a : b; return { winner: w, loser: w === a ? b : a, margin: 0, rule: 'ב', vals: { label: 'ניקוד מצטבר מתחילת הגביע', va: ca, vb: cb } }; }
    // ג. ניקוד התחלתי
    const ea = entryOf(a), eb = entryOf(b);
    if (ea !== eb) { const w = ea > eb ? a : b; return { winner: w, loser: w === a ? b : a, margin: 0, rule: 'ג', vals: { label: 'ניקוד הכניסה לגביע (בעת הזריעה)', va: ea, vb: eb } }; }
    // ד-ה. הפרשי ניצחון אחורה (מהסיבוב האחרון שהוכרע ועד סיבוב 1).
    //       סיבוב שבו לאחד מהם היה בּיי (margin=null) — מדולג לגמרי.
    const hist = cupData.history || [];
    for (let i = hist.length - 1; i >= 0; i--) {
      const ma = marginInRound(a, i), mb = marginInRound(b, i);
      if (ma === null || mb === null) continue; // בּיי לאחד הצדדים → דלג על הסיבוב הזה
      if (ma !== mb) {
        const w = ma > mb ? a : b;
        return { winner: w, loser: w === a ? b : a, margin: 0, rule: i === hist.length - 1 ? 'ד' : 'ה',
                 vals: { label: `הפרש הניצחון ב${roundLabel(hist[i].round_size, !!hist[i].is_prelim)}`, va: ma, vb: mb } };
      }
    }
    // ו. המדורג הגבוה (seed קטן)
    const w = a < b ? a : b;
    return { winner: w, loser: w === a ? b : a, margin: 0, rule: 'ו', vals: { label: 'דירוג הזריעה (הנמוך עולה)', va: a, vb: b } };
  };

  // ═══ פעולות ═══
  const lockBracket = async () => {
    if (!currentGame || !isAdmin) return;
    if (liveSeeds.length < CUP_SIZE) { toast({ title: 'אין מספיק משתתפים', description: `נדרשים לפחות ${CUP_SIZE}, קיימים ${rankings.length}`, variant: 'destructive' }); return; }
    setWorking(true);
    try {
      const pairs = livePairs.filter(p => !p.is_bye).map(p => ({ a: p.a.seed, b: p.b.seed, match_no: p.match_no, global_no: p.match_no }));
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
      cupData.seeds.forEach(s => { if (cupData.alive.includes(s.seed)) starts[s.seed] = scoreByName[normName(s.participant_name)] ?? 0; });
      // 📸 snapshot: רשימת ה-question_id של כל השאלות שכבר היו סגורות (יש actual_result) ברגע זה.
      //    "שאלות הסיבוב" = שאלות שייסגרו מעכשיו והלאה (לא היו ב-snapshot).
      let closedNow = [];
      try {
        const qs = await db.Question.filter({ game_id: currentGame.id }, null, 10000);
        closedNow = (qs || [])
          .filter(q => q.actual_result && String(q.actual_result).trim() !== '' && q.actual_result !== '__CLEAR__')
          .map(q => q.id);
      } catch (e) { console.warn('snapshot שאלות סגורות נכשל', e); }
      await saveCup({ ...cupData, round_start_scores: starts, round_start_set: true, round_start_closed_qids: closedNow });
      toast({ title: '✅ נקודת ייחוס לסיבוב נקבעה', description: `${closedNow.length} שאלות סגורות נרשמו כבסיס`, className: 'bg-green-900/30 border-green-500 text-green-200' });
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
                 tie: d.rule !== 'א' && d.vals ? d.vals : null, // ⚖️ ערכי שובר השוויון — מוקפאים לרגע ההכרעה
                 match_no: pair.match_no, global_no: pair.global_no, sa: roundScoreOf(pair.a), sb: roundScoreOf(pair.b) };
      });
      const matchWinners = results.map(r => r.winner);

      // האם הסיבוב שהוכרע הוא המקדים? והבּיי שלו:
      const wasPrelim = !!cupData.is_prelim && cupData.current_round === 1;
      const byes = wasPrelim ? (cupData.bye_seeds || []) : [];

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
        round_start_closed_qids: (cupData.round_start_closed_qids || []),
        decided_at: new Date().toISOString(), results,
      };
      const newHistory = [...(cupData.history || []), histEntry];

      if (advancing.length === 1) {
        await saveCup({ ...cupData, history: newHistory, alive: advancing, champion: advancing[0], round_start_set: false });
        toast({ title: '🏆 יש אלוף לגביע יוסי!', description: nameOf(advancing[0]), className: 'bg-amber-900/30 border-amber-500 text-amber-200' });
      } else {
        // זוגות הסיבוב הבא: עמדות עוקבות בעץ נפגשות (0↔1, 2↔3, ...) — שומר מבנה עץ.
        // match_no = מקומי (1-based); global_no = רציף בין השלבים.
        const nextRoundSize = advancing.length; // מספר המשתתפים בסיבוב הבא
        const nextPairs = [];
        for (let i = 0; i < advancing.length; i += 2) {
          const local = (i / 2) + 1;
          nextPairs.push({ a: advancing[i], b: advancing[i + 1], match_no: local, global_no: globalMatchNo(nextRoundSize, false, local) });
        }

        // 🔍 בדיקת תקינות הצטלבות: אם הפייבוריטים היו מנצחים, סכום הזרעים בכל דו-קרב
        //    בסיבוב הבא היה אמור להיות קבוע (גודל_הסיבוב_הבא + 1). זה לא ישפיע על המשחק
        //    (כי מנצחים בפועל שונים), אבל חריגה במבנה מרמזת על הצטלבות שגויה — נרשום אזהרה.
        const expectedSum = advancing.length + 1; // 128→129, 64→65, 32→33, 16→17, 8→9, 4→5, 2→3
        const structuralBad = nextPairs.filter(p => (p.a + p.b) !== expectedSum).length;
        if (structuralBad > 0) {
          console.warn(`[גביע יוסי] אזהרת מבנה: ${structuralBad} דו-קרבות בסיבוב הבא חורגים מסכום ${expectedSum} (ייתכן בגלל אפסטים — תקין; אם בתחילת הטורניר — בעיית הצטלבות).`);
        }

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
    const isMe = (name) => normName(name) === normName(q);

    if (!cupData) {
      // לפני קיבוע — מחפשים ב-livePairs (כולל בּיי). במקדים global = match_no.
      for (const p of livePairs) {
        if (p.is_bye && isMe(p.a.participant_name)) return { match_no: p.match_no, isBye: true };
        if (!p.is_bye && isMe(p.a.participant_name)) return { match_no: p.match_no, opponent: p.b.participant_name, side: 'a' };
        if (!p.is_bye && isMe(p.b?.participant_name)) return { match_no: p.match_no, opponent: p.a.participant_name, side: 'b' };
      }
      return null;
    }
    // אחרי קיבוע — מחפשים בזוגות הסיבוב הנוכחי (מספר גלובלי) → השחקן עדיין חי ומשחק
    for (const pair of (cupData.pairs || [])) {
      const gno = pair.global_no || pair.match_no;
      if (isMe(nameOf(pair.a))) return { match_no: gno, opponent: nameOf(pair.b), side: 'a' };
      if (isMe(nameOf(pair.b))) return { match_no: gno, opponent: nameOf(pair.a), side: 'b' };
    }
    // בּיי בסיבוב מקדים פעיל
    if (cupData.is_prelim && cupData.current_round === 1) {
      const order = bracketOrder(CUP_SIZE);
      for (const seed of (cupData.bye_seeds || [])) {
        if (isMe(nameOf(seed))) {
          const posIdx = order.indexOf(seed);
          return { match_no: posIdx >= 0 ? posIdx + 1 : null, isBye: true };
        }
      }
    }
    // 🆕 השחקן קיים בבראקט אך לא בזוגות הנוכחיים → אלוף, או הודח. מאתרים מתי ומול מי.
    const meSeedObj = (cupData.seeds || []).find(s => isMe(s.participant_name));
    if (meSeedObj) {
      const mySeed = meSeedObj.seed;
      if (cupData.champion === mySeed) return { isChampion: true };
      const aliveSet = new Set(cupData.alive || []);
      if (!aliveSet.has(mySeed)) {
        for (const h of (cupData.history || [])) {
          const rec = (h.results || []).find(r => r.loser === mySeed);
          if (rec) return { eliminated: true, eliminatedRound: roundLabel(h.round_size, !!h.is_prelim), lostTo: nameOf(rec.winner) };
        }
        return { eliminated: true };
      }
    }
    return null;
  })();

  // האם שם נתון הוא "אני" (להדגשה)
  const isMyName = (name) => {
    const q = (myName || '').trim();
    return q && (name || '').trim() === q;
  };

  // ── יריבים פוטנציאליים: עמדת הבסיס של המשתתף בעץ + מי יכול לפגוש אותו בכל שלב ──
  //   עמדת הבסיס = האינדקס (0-127) של הזרע של המשתתף ב-bracketOrder(128).
  //   בשלב שגודלו 'size' משתתפים (=2^k), כל בלוק של (128*2/size) עמדות-בסיס מתמזג למשחק אחד.
  //   היריבים הפוטנציאליים של המשתתף בשלב הזה = העמדות בבלוק שלו, חוץ מהתת-בלוק שכבר "שלו".
  // ── יריבים פוטנציאליים מסודרים לפי שלבים (4 שלבים קדימה מהסיבוב הנוכחי) ──
  //   מחושב מהבראקט החי (cupData.pairs) — רק משתתפים שעדיין משחקים (לא מודחים).
  //   מבנה: בסיבוב הנוכחי כל זוג עוקב (0↔1, 2↔3, …) מתמזג בסיבוב הבא. לכן:
  //     שלב +1 = משחק-האח (2 אפשריים), +2 = 4, +3 = 8, +4 = 16.
  const potentialByStage = (() => {
    if (!cupData || cupData.champion) return [];
    const pairs = cupData.pairs || [];
    if (pairs.length === 0) return [];
    // מסדרים את משחקי הסיבוב לפי מספר המשחק (סדר עץ)
    const ordered = [...pairs].sort((x, y) => (x.match_no || 0) - (y.match_no || 0));
    const meTrim = normName(myName || '');
    // אינדקס המשחק של המשתתף בסיבוב הנוכחי
    let mi = -1;
    for (let i = 0; i < ordered.length; i++) {
      if (normName(nameOf(ordered[i].a)) === meTrim || normName(nameOf(ordered[i].b)) === meTrim) { mi = i; break; }
    }
    if (mi < 0) return [];
    const numMatches = ordered.length;
    const roundSize = cupData.round_size; // מספר המשתתפים בסיבוב הנוכחי
    // שני השחקנים (החיים) של משחק לפי אינדקס
    const playersOfMatch = (idx) => {
      const m = ordered[idx];
      if (!m) return [];
      const out = [];
      [m.a, m.b].forEach(sd => {
        const nm = nameOf(sd);
        if (nm && !String(nm).startsWith('#')) out.push({ name: nm, seed: sd });
      });
      return out;
    };
    const stages = [];
    for (let k = 1; k <= 4; k++) {
      const blockSize = Math.pow(2, k);        // מספר משחקים בבלוק של שלב k
      if (blockSize > numMatches) break;        // אין מספיק משחקים → השלב לא קיים
      const halfSize = blockSize / 2;
      const blockStart = Math.floor(mi / blockSize) * blockSize;
      const myHalfStart = Math.floor(mi / halfSize) * halfSize;
      // החצי השני של הבלוק (זה שאינו מכיל את המשתתף) = היריבים האפשריים בשלב הזה
      const oppHalfStart = (myHalfStart === blockStart) ? blockStart + halfSize : blockStart;
      const names = [];
      const seen = new Set();
      for (let idx = oppHalfStart; idx < oppHalfStart + halfSize; idx++) {
        for (const item of playersOfMatch(idx)) {
          if (normName(item.name) !== meTrim && !seen.has(item.name)) {
            seen.add(item.name);
            names.push(item);
          }
        }
      }
      const stageSize = Math.floor(roundSize / Math.pow(2, k)); // גודל הסיבוב שבו נפגשים
      stages.push({ size: stageSize, label: roundLabel(stageSize, false), count: names.length, names });
    }
    return stages;
  })();

  // ── שורת דו-קרב מינימליסטית ──
  //   המוביל בזיווג: ניקוד ירוק + כתר. המפגר: ניקוד אדום + עמעום קל.
  //   תיקו / טרם החל: אפור ניטרלי.
  const MatchRow = ({ idx, a, b, sa, sb, won, matchNo, tie }) => {
    // won: 'a'|'b'|'tie'|null
    // tie (אופציונלי): {rule, side:'a'|'b', vals:{label,va,vb}|null, live} — שובר שוויון.
    //   התג ⚖️ מוצג צמוד למשתתף שהשובר פעל לטובתו; לחיצה פותחת חלונית הסבר עם המספרים.
    const scoreColor = (side) => {
      if (won == null || won === 'tie') return 'text-slate-400'; // טרם הוכרע מוביל
      return won === side ? 'text-green-400' : 'text-red-400';   // מוביל=ירוק, מפגר=אדום
    };
    const meA = isMyName(a.name);
    const meB = isMyName(b.name);
    const hasTie = tie && tie.rule && tie.rule !== 'א';
    const tieColor = tie?.live ? '#fbbf24' : '#c4b5fd';
    const TieBadge = () => (
      <button onClick={(e) => { e.stopPropagation(); setTiePopup({ rule: tie.rule, vals: tie.vals || null, aName: a.name, bName: b.name, sa, live: !!tie.live }); }}
        title="הוכרע בשובר שוויון — לחץ להסבר"
        className="font-bold flex-shrink-0 rounded"
        style={{ fontSize: '8px', lineHeight: '11px', padding: '0 3px', color: tieColor, background: tie.live ? 'rgba(251,191,36,0.14)' : 'rgba(168,85,247,0.16)', border: `1px solid ${tie.live ? 'rgba(251,191,36,0.4)' : 'rgba(168,85,247,0.4)'}`, cursor: 'pointer' }}>
        {'\u2696\uFE0E'}{tie.rule}
      </button>
    );
    return (
      <div className="flex items-center text-sm rounded-md overflow-hidden" style={{ background: (meA || meB) ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.02)', boxShadow: (meA || meB) ? 'inset 0 0 0 1px rgba(56,189,248,0.5)' : 'none' }}>
        {/* מספר משחק */}
        {matchNo != null && <span className="text-[10px] text-slate-500 w-9 text-center flex-shrink-0 tabular-nums" style={{ borderLeft: '1px solid rgba(100,116,139,0.2)' }}>{matchNo}</span>}
        {/* צד A */}
        <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 min-w-0 ${won === 'b' ? 'opacity-60' : ''}`}>
          <span className="text-[10px] text-amber-400/70 w-7 flex-shrink-0 tabular-nums">{a.seed}</span>
          <span onClick={() => b?.name && setPeekPair({ me: a.name, opp: b.name })}
            className={`truncate cursor-pointer hover:underline ${meA ? 'text-cyan-300 font-bold' : 'text-slate-200'}`}
            title="הצג ניחושים מול היריב">{a.name}{meA ? ' ⭐' : ''}</span>
          {hasTie && tie.side === 'a' && <TieBadge />}
          {sa != null && <span className={`mr-auto text-xs font-bold flex-shrink-0 ${scoreColor('a')}`}>{sa >= 0 ? '+' : ''}{sa}</span>}
          {won === 'a' && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
        </div>
        <span className="text-[9px] text-slate-600 px-1 flex-shrink-0">·</span>
        {/* צד B */}
        <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 justify-end min-w-0 ${won === 'a' ? 'opacity-60' : ''}`}>
          {won === 'b' && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
          {sb != null && <span className={`ml-auto text-xs font-bold flex-shrink-0 ${scoreColor('b')}`}>{sb >= 0 ? '+' : ''}{sb}</span>}
          {hasTie && tie.side === 'b' && <TieBadge />}
          <span onClick={() => a?.name && setPeekPair({ me: b.name, opp: a.name })}
            className={`truncate cursor-pointer hover:underline ${meB ? 'text-cyan-300 font-bold' : 'text-slate-200'}`}
            title="הצג ניחושים מול היריב">{meB ? '⭐ ' : ''}{b.name}</span>
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

    // שלבי הגדלים: מהשלב הנבחר (ברירת מחדל = הפעיל) וקדימה עד הגמר.
    //   שלבים שהסתיימו (אחורה) מוסתרים — מעבר אליהם דרך בורר השלבים.
    //   שלבים קדימה לא משפיעים על גובה הטבלה (מתמרכזים בתוך העמודה הראשונה).
    const sizes = [];
    // נקודת ההתחלה: השלב הנבחר בבורר, או הפעיל, או הגמר אם הסתיים
    let startSize, startPrelim;
    if (showingHistory && histToShow) {
      startSize = histToShow.round_size; startPrelim = !!histToShow.is_prelim;
    } else if (cupData.champion) {
      startSize = 2; startPrelim = false;
    } else {
      startSize = cupData.round_size; startPrelim = !!cupData.is_prelim;
    }
    // מוסיפים את שלב ההתחלה וכל השלבים קדימה עד הגמר (2).
    //   לא מצמצמים שלבים — בנייד פשוט מגדילים רוחב עמודה וגוללים לרוחב לשאר השלבים.
    if (startPrelim) {
      sizes.push({ size: startSize, isPrelim: true });
      let s = CUP_SIZE;
      while (s >= 2) { sizes.push({ size: s, isPrelim: false }); s = Math.floor(s / 2); }
    } else {
      let s = startSize;
      while (s >= 2) { sizes.push({ size: s, isPrelim: false }); s = Math.floor(s / 2); }
    }

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
        const histIdxT = (cupData.history || []).indexOf(decided);
        const matches = decided.results.map(r => ({
          a: nameOf(r.a), b: nameOf(r.b), seedA: r.a, seedB: r.b, match_no: r.match_no, global_no: r.global_no,
          sa: r.sa, sb: r.sb, won: r.winner === r.a ? 'a' : 'b',
          rule: r.rule || null, // ⚖️ שובר השוויון + ערכיו: מוקפא, או שחזור מדויק לסיבובים ישנים
          tieVals: r.tie || (r.rule && r.rule !== 'א' ? reconstructHistVals(r.rule, histIdxT, r.a, r.b) : null),
        }));
        // 🆕 בשלב מקדים שהוכרע: מוסיפים את העולים האוטומטיים (בּיי) כשורות במקומם בעץ.
        //    בלעדיהם חסרות 14 עמדות בעמודה, ופריסת העץ של הסיבוב הבא מתעוותת (תיבות
        //    מתיישרות זו-לצד-זו במקום במבנה עץ, והעולים האוטומטיים "נעלמים").
        if (decided.is_prelim) {
          const ordP = bracketOrder(CUP_SIZE);
          (decided.bye_seeds || []).forEach(seed => {
            const posIdx = ordP.indexOf(seed);
            const mn = posIdx >= 0 ? posIdx + 1 : 9999;
            matches.push({ a: nameOf(seed), b: null, seedA: seed, seedB: null, aBye: true, match_no: mn, global_no: mn, byeRow: true });
          });
          matches.sort((x, y) => (x.global_no || x.match_no || 0) - (y.global_no || y.match_no || 0));
        }
        return {
          label: roundLabel(st.size, st.isPrelim), size: st.size, isPrelim: st.isPrelim,
          closedQids: (decided.round_start_closed_qids || []),
          matches,
        };
      }

      if (isCurrent) {
        // השלב הפעיל
        const liveMatches = cupData.pairs.map(p => {
          const sa = roundScoreOf(p.a), sb = roundScoreOf(p.b);
          const w = (sa != null && sb != null) ? (sa > sb ? 'a' : sb > sa ? 'b' : null) : null;
          // ⚖️ שוויון חי בעץ: מחשבים (לתצוגה בלבד) מי עולה כרגע לפי שוברי השוויון
          let liveRule = null, liveVals = null, liveTieSide = null;
          if (w == null && sa != null && sb != null && sa === sb && cupData.round_start_set) {
            const d = decidePair(p.a, p.b);
            if (d.rule !== 'א') { liveRule = d.rule; liveVals = d.vals; liveTieSide = d.winner === p.a ? 'a' : 'b'; }
          }
          return { a: nameOf(p.a), b: nameOf(p.b), seedA: p.a, seedB: p.b, match_no: p.match_no, global_no: p.global_no, sa, sb, won: w, live: true, rule: liveRule, tieVals: liveVals, tieSide: liveTieSide };
        });
        // אם זה המקדים — מוסיפים את הבּיי (עולים אוטומטית) במקומם, כתיבה עם צד אחד.
        if (st.isPrelim && cupData.current_round === 1) {
          const ord = bracketOrder(CUP_SIZE);
          (cupData.bye_seeds || []).forEach(seed => {
            const posIdx = ord.indexOf(seed);
            const mn = posIdx >= 0 ? posIdx + 1 : 9999;
            liveMatches.push({ a: nameOf(seed), b: null, seedA: seed, seedB: null, aBye: true, match_no: mn, global_no: mn, byeRow: true });
          });
          liveMatches.sort((x, y) => (x.global_no || x.match_no || 0) - (y.global_no || y.match_no || 0));
        }
        return {
          label: roundLabel(st.size, st.isPrelim), size: st.size, isPrelim: st.isPrelim,
          closedQids: (cupData.round_start_closed_qids || []),
          matches: liveMatches,
        };
      }

      // ── שלב עתידי — תיבות ריקות ──
      // מקרה מיוחד: עמודת 128 (סיבוב 2) כשעדיין בסיבוב מקדים → ממלאים את הבּיי במקומם.
      if (st.size === CUP_SIZE && hasPrelim && cupData.is_prelim && !decided) {
        // לכל עמדת עץ: אם הזרע bye → ממולא; אחרת "מנצח משחק X" (X = עמדת המקדים = global)
        const rows = [];
        for (let i = 0; i < order.length; i += 2) {
          const sTop = order[i], sBot = order[i + 1];
          const topBye = byeSet.has(sTop);
          const botBye = byeSet.has(sBot);
          rows.push({
            a: topBye ? nameOf(sTop) : null, seedA: topBye ? sTop : null, aBye: topBye,
            aFrom: topBye ? null : (i + 1),       // מנצח משחק מס' (עמדת המקדים)
            b: botBye ? nameOf(sBot) : null, seedB: botBye ? sBot : null, bBye: botBye,
            bFrom: botBye ? null : (i + 2),
            future: true,
          });
        }
        return { label: roundLabel(st.size, false), size: st.size, isPrelim: false, closedQids: [], matches: rows };
      }

      // שלב עתידי רגיל — תיבות עם "מנצח משחק X" (מהשלב הקודם)
      const prevSize = st.size * 2;                  // גודל הסיבוב הקודם
      const prevOffset = globalOffset(prevSize, false);
      return {
        label: roundLabel(st.size, st.isPrelim), size: st.size, isPrelim: st.isPrelim,
        closedQids: [],
        matches: Array.from({ length: numMatches }, (_, k) => ({
          a: null, b: null, future: true,
          aFrom: prevOffset + (2 * k + 1),   // מנצח המשחק הגלובלי הזה
          bFrom: prevOffset + (2 * k + 2),
        })),
      };
    });

    // תיבת שם בודדת (ריקה / "מנצח משחק X" / ממולאת). השם נשבר לעד 2 שורות במקום להיחתך.
    const Cell = ({ name, seed, score, scoreClass, crown, dim, bye, me, from, onName, tie }) => (
      <div className={`flex items-center gap-1 px-1.5 py-1 ${dim ? 'opacity-50' : ''}`}>
        {seed != null && <span className="text-[8px] text-amber-400/60 w-4 flex-shrink-0 tabular-nums">{seed}</span>}
        {name
          ? <span onClick={onName || undefined}
              className={`${onName ? 'cursor-pointer hover:underline' : ''} ${me ? 'text-cyan-300 font-bold' : bye ? 'text-green-300' : 'text-slate-200'}`}
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.15, wordBreak: 'break-word' }}
              title={onName ? 'הצג ניחושים מול היריב' : name}>{me ? '⭐ ' : ''}{name}{bye ? ' ⏭️' : ''}</span>
          : from
            ? <span className="text-slate-500 text-[10px]">מנצח משחק {from}</span>
            : <span className="text-slate-600 italic">—</span>}
        {/* ⚖️ תג שובר שוויון — צמוד למשתתף שהשובר פעל לטובתו; לחיצה פותחת חלונית הסבר */}
        {tie && (
          <button onClick={(e) => { e.stopPropagation(); tie.open(); }}
            title="הוכרע בשובר שוויון — לחץ להסבר"
            className="font-bold flex-shrink-0 rounded"
            style={{ fontSize: '7px', lineHeight: '9px', padding: '0 2px', color: tie.live ? '#fbbf24' : '#c4b5fd', background: tie.live ? 'rgba(251,191,36,0.14)' : 'rgba(168,85,247,0.16)', border: `1px solid ${tie.live ? 'rgba(251,191,36,0.4)' : 'rgba(168,85,247,0.4)'}`, cursor: 'pointer' }}>
            {'\u2696\uFE0E'}{tie.rule}
          </button>
        )}
        {score != null && <span className={`mr-auto text-[10px] font-bold flex-shrink-0 ${scoreClass}`}>{score >= 0 ? '+' : ''}{score}</span>}
        {crown && <Crown className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />}
      </div>
    );

    return <BracketTreeScroller columns={columns} isFinalLabel="גמר" scoreClr={scoreClr} Cell={Cell} isMyName={isMyName} globalMatchNo={globalMatchNo} onPeek={setPeekPair} onTie={setTiePopup} />;
  };

  // רכיב פנימי שמנהל גלילה אופקית עם פס עליון+תחתון מסונכרנים, וצמידה לימין בפתיחה
  const BracketTreeScroller = ({ columns, scoreClr, Cell, isMyName, globalMatchNo, onPeek, onTie }) => {
    // ⚖️ תג שובר שוויון לצד הרלוונטי: מוכרע → לצד המנצח; שוויון חי → לצד המוביל לפי השובר
    const tieFor = (m, side) => {
      if (!m.rule || m.rule === 'א') return null;
      const winSide = m.live ? m.tieSide : m.won;
      if (winSide !== side) return null;
      return {
        rule: m.rule, live: !!m.live,
        open: () => onTie && onTie({ rule: m.rule, vals: m.tieVals || null, aName: m.a, bName: m.b, sa: m.sa, live: !!m.live }),
      };
    };
    const topRef = React.useRef(null);
    const bottomRef = React.useRef(null);
    const contentRef = React.useRef(null);

    const syncFrom = (src, dst) => { if (dst.current && src.current) dst.current.scrollLeft = src.current.scrollLeft; };

    // ── חישוב פריסת עץ אמיתי: מיקום אנכי מצטבר + קווי חיבור ──
    // ממדי העץ: כל השלבים מוצגים. במחשב — כמו שהיה. בנייד — עמודות רחבות יותר
    //   לקריאות מלאה, והשלבים שלא נכנסים נגישים בגלילה לרוחב.
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const COL_W = isMobile ? 200 : 165;   // רוחב עמודה — רחב בנייד לקריאות
    const COL_GAP = isMobile ? 22 : 28;   // רווח אופקי בין עמודות (מקום לקווים)
    const BOX_H = isMobile ? 56 : 46;     // גובה תיבת משחק
    const V_GAP = isMobile ? 12 : 10;     // רווח אנכי בסיסי בין תיבות בעמודה הראשונה
    const LABEL_H = 20;      // גובה תווית השלב למעלה

    // לכל עמודה: מערך מרכזי-Y של התיבות.
    // עמודה 0: תיבות במרווח קבוע. עמודה i>0: כל תיבה במרכז שתי התיבות התואמות בעמודה i-1.
    const unit = BOX_H + V_GAP;             // המרווח האנכי הבסיסי
    const centersByCol = [];
    columns.forEach((col, ci) => {
      const n = col.matches.length;
      if (ci === 0) {
        const arr = [];
        for (let i = 0; i < n; i++) arr.push(LABEL_H + i * unit + BOX_H / 2);
        centersByCol.push(arr);
      } else {
        const prev = centersByCol[ci - 1];
        const arr = [];
        for (let i = 0; i < n; i++) {
          const top = prev[2 * i], bot = prev[2 * i + 1];
          // מרכז בין שתי התיבות המזינות; אם אין זוג (עודף) — יורש את הקיים
          arr.push(bot != null ? (top + bot) / 2 : top);
        }
        centersByCol.push(arr);
      }
    });
    const totalH = LABEL_H + (centersByCol[0]?.length || 0) * unit + 10;
    const totalW = columns.length * COL_W + (columns.length - 1) * COL_GAP;

    // בפתיחה — גלילה לקצה הימני (המקדים, שנמצא בימין בזכות היפוך ה-X). ב-LTR: scrollLeft מקסימלי.
    React.useEffect(() => {
      const el = bottomRef.current;
      if (!el) return;
      requestAnimationFrame(() => {
        const max = el.scrollWidth - el.clientWidth;
        el.scrollLeft = max;
        if (topRef.current) topRef.current.scrollLeft = max;
      });
    }, [totalW]);

    // מיקום X של עמודה (RTL: עמודה 0 בימין)
    const colLeft = (ci) => ci * (COL_W + COL_GAP);

    return (
      <div>
        <p className="text-[10px] text-slate-400 mb-1">↔️ מציג מהשלב הנוכחי קדימה עד הגמר. גלול לצדדים לשאר השלבים. למעבר לשלבים שהסתיימו — בורר השלבים למעלה.</p>
        {/* פס גלילה עליון — נשאר קבוע (sticky) בראש בזמן גלילה אנכית */}
        <div ref={topRef} onScroll={() => syncFrom(topRef, bottomRef)}
          dir="ltr" style={{ overflowX: 'auto', overflowY: 'hidden', position: 'sticky', top: 0, zIndex: 20, background: '#0f172a', borderBottom: '1px solid rgba(6,182,212,0.2)', paddingBottom: 2 }}>
          <div style={{ width: totalW, height: 8 }} />
        </div>

        {/* התוכן עם פס גלילה תחתון. RTL מושג ע"י היפוך X (עמודה 0 בימין). */}
        <div ref={bottomRef} onScroll={() => syncFrom(bottomRef, topRef)}
          className="pb-2" dir="ltr" style={{ overflowX: 'auto' }}>
          <div ref={contentRef} style={{ position: 'relative', width: totalW, height: totalH, direction: 'ltr' }}>
            {/* קווי חיבור (SVG מאחור) */}
            <svg width={totalW} height={totalH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {columns.map((col, ci) => {
                if (ci === 0) return null;
                const prev = centersByCol[ci - 1];
                const cur = centersByCol[ci];
                // RTL: עמודה ci בצד שמאל יותר. הילד (ci) מימינו ההורים (ci-1).
                const childRight = totalW - colLeft(ci) - COL_W;        // קצה ימני של תיבת הילד
                const parentLeft = totalW - colLeft(ci - 1);            // קצה שמאלי של תיבות ההורה (RTL)
                const childBoxRightX = childRight + COL_W;              // x של דופן ימין של הילד
                const parentBoxLeftX = totalW - colLeft(ci - 1) - COL_W; // לא בשימוש; נחשב ידנית למטה
                return cur.map((cy, i) => {
                  const pTop = prev[2 * i], pBot = prev[2 * i + 1];
                  if (pTop == null) return null;
                  // x של דופן שמאל של הילד (לכיוון ההורים מימין):
                  const childX = totalW - colLeft(ci) - COL_W;          // שמאל הילד
                  const childConnX = childX + COL_W;                    // ימין הילד (מחובר להורים מימין)
                  const parentX = totalW - colLeft(ci - 1) - COL_W;     // שמאל ההורה
                  const midX = (childConnX + parentX) / 2;
                  const lineColor = 'rgba(100,116,139,0.35)';
                  return (
                    <g key={i} stroke={lineColor} strokeWidth="1.2" fill="none">
                      {/* מהילד אופקית עד אמצע */}
                      <path d={`M ${childConnX} ${cy} H ${midX}`} />
                      {/* אנכית בין שני ההורים */}
                      <path d={`M ${midX} ${pTop} V ${pBot != null ? pBot : pTop}`} />
                      {/* מההורה העליון אופקית עד האמצע */}
                      <path d={`M ${parentX} ${pTop} H ${midX}`} />
                      {pBot != null && <path d={`M ${parentX} ${pBot} H ${midX}`} />}
                    </g>
                  );
                });
              })}
            </svg>

            {/* תוויות שלבים */}
            {columns.map((col, ci) => (
              <div key={`lbl-${ci}`} style={{ position: 'absolute', left: totalW - colLeft(ci) - COL_W, top: 0, width: COL_W, textAlign: 'center' }}
                className="text-[10px] font-bold text-cyan-300 truncate">{col.label}</div>
            ))}

            {/* תיבות המשחקים */}
            {columns.map((col, ci) => {
              const isFinal = col.label && col.label.trim() === 'גמר'; // רק הגמר עצמו — 'שמינית גמר'/'רבע גמר' מכילים את המילה אך אינם הגמר
              const left = totalW - colLeft(ci) - COL_W; // RTL: עמודה 0 בימין
              return col.matches.map((m, mi) => {
                const champ = isFinal && m.won ? (m.won === 'a' ? m.a : m.b) : null;
                const meA = isMyName(m.a), meB = isMyName(m.b);
                const mine = meA || meB;
                const gno = m.global_no != null ? m.global_no
                          : (col.size != null ? globalMatchNo(col.size, col.isPrelim, mi + 1) : null);
                const cy = centersByCol[ci][mi];
                return (
                  <div key={`${ci}-${mi}`} dir="rtl"
                    style={{ position: 'absolute', left, top: cy - BOX_H / 2, width: COL_W }}
                    className="rounded text-[11px] overflow-hidden"
                    >
                    <div className="rounded overflow-hidden" style={{ background: mine ? 'rgba(56,189,248,0.12)' : m.byeRow ? 'rgba(52,211,153,0.06)' : 'rgba(15,23,42,0.85)', border: `1px solid ${mine ? 'rgba(56,189,248,0.6)' : m.live ? 'rgba(6,182,212,0.25)' : m.byeRow ? 'rgba(52,211,153,0.25)' : m.future ? 'rgba(100,116,139,0.1)' : 'rgba(100,116,139,0.18)'}` }}>
                      {gno != null && (
                        <div className="text-[8px] text-slate-500 text-center" style={{ background: 'rgba(100,116,139,0.1)' }}>
                          משחק {gno}
                        </div>
                      )}
                      <Cell name={m.a} seed={m.seedA} score={m.sa} scoreClass={scoreClr(m, 'a')} crown={m.won === 'a'} dim={m.won === 'b'} bye={m.aBye} me={meA} from={m.aFrom}
                        tie={tieFor(m, 'a')}
                        onName={(m.a && m.b) ? () => onPeek({ me: m.a, opp: m.b, closedQids: col.closedQids || [], scoreMe: m.sa, scoreOpp: m.sb }) : undefined} />
                      <div className="h-px" style={{ background: 'rgba(100,116,139,0.12)' }} />
                      {m.byeRow
                        ? <div className="px-1.5 py-1 text-[9px] text-green-400">⏭️ עולה אוטומטית</div>
                        : <Cell name={m.b} seed={m.seedB} score={m.sb} scoreClass={scoreClr(m, 'b')} crown={m.won === 'b'} dim={m.won === 'a'} bye={m.bBye} me={meB} from={m.bFrom}
                            tie={tieFor(m, 'b')}
                            onName={(m.a && m.b) ? () => onPeek({ me: m.b, opp: m.a, closedQids: col.closedQids || [], scoreMe: m.sb, scoreOpp: m.sa }) : undefined} />}
                    </div>
                    {champ && <div className="text-[10px] text-amber-300 font-bold text-center py-0.5 mt-0.5 rounded" style={{ background: 'rgba(251,191,36,0.12)' }}>🏆 {champ}</div>}
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4" dir="rtl">
      {/* מסך צף: ניחושי דו-קרב */}
      {peekPair && (
        <DuelPeek
          me={peekPair.me}
          opp={peekPair.opp}
          gameId={currentGame?.id}
          startClosedQids={peekPair?.closedQids || []}
          scoreMe={peekPair?.scoreMe}
          scoreOpp={peekPair?.scoreOpp}
          onClose={() => setPeekPair(null)}
        />
      )}

      {/* ⚖️ חלונית צפה: הסבר שובר השוויון + המספרים שמאחוריו */}
      {tiePopup && createPortal(
        <div onClick={() => setTiePopup(null)} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', background: '#0b1220', backgroundImage: 'linear-gradient(180deg,#141230,#0b1220)', border: `1px solid ${tiePopup.live ? 'rgba(251,191,36,0.55)' : 'rgba(168,85,247,0.55)'}`, borderRadius: '12px', boxShadow: '0 16px 48px rgba(0,0,0,0.85)', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: tiePopup.live ? '#fbbf24' : '#c4b5fd' }}>⚖️ שובר שוויון — כלל {tiePopup.rule}</div>
              <button onClick={() => setTiePopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X className="w-5 h-5" /></button>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.6 }}>
              <p>שני המשתתפים סיימו את הסיבוב בניקוד זהה{tiePopup.sa != null ? ` (${tiePopup.sa >= 0 ? '+' : ''}${tiePopup.sa} לכל אחד)` : ''}.</p>
              <p>ההכרעה: <b style={{ color: tiePopup.live ? '#fbbf24' : '#c4b5fd' }}>כלל {tiePopup.rule}</b> — {RULE_DESC[tiePopup.rule]}.</p>
              {tiePopup.vals ? (
                <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(100,116,139,0.25)' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '4px' }}>{tiePopup.vals.label}:</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span><b>{tiePopup.aName}</b>: {tiePopup.rule === 'ו' ? `זרע ${tiePopup.vals.va}` : `${tiePopup.vals.va >= 0 ? '+' : ''}${tiePopup.vals.va}`}</span>
                    <span><b>{tiePopup.bName}</b>: {tiePopup.rule === 'ו' ? `זרע ${tiePopup.vals.vb}` : `${tiePopup.vals.vb >= 0 ? '+' : ''}${tiePopup.vals.vb}`}</span>
                  </div>
                </div>
              ) : (
                <p style={{ marginTop: '6px', fontSize: '0.72rem', color: '#94a3b8' }}>ההכרעה נעשתה לפי הניקוד המצטבר של שני המשתתפים באותו רגע. הסיבוב הזה הוכרע לפני שהמערכת החלה להקפיא את הערכים, והניקוד המצטבר ממשיך להשתנות מאז — לכן המספרים המקוריים אינם ניתנים לשחזור. מסיבוב זה ואילך הערכים נשמרים ברגע ההכרעה.</p>
              )}
              {tiePopup.live && <p style={{ marginTop: '8px', fontSize: '0.72rem', fontStyle: 'italic', color: '#fbbf24' }}>⏳ תצוגת ביניים — הסיבוב טרם הוכרע וההכרעה עשויה להשתנות עד "הכרע סיבוב".</p>}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* חלון צף: יריבים פוטנציאליים לפי שלבים */}
      {showPotential && createPortal(
        <div onClick={() => setShowPotential(false)} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', maxHeight: '88vh', overflowY: 'auto', background: '#0b1220', backgroundImage: 'linear-gradient(180deg,#101b30,#0b1220)', border: '1px solid rgba(251,146,60,0.5)', borderRadius: '12px', boxShadow: '0 16px 48px rgba(0,0,0,0.85)' }}>
            <div style={{ position: 'sticky', top: 0, background: '#0b1220', borderBottom: '1px solid rgba(100,116,139,0.3)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fb923c' }}>
                🎯 היריבים הפוטנציאליים של {myName.trim()}
              </div>
              <button onClick={() => setShowPotential(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X className="w-5 h-5" /></button>
            </div>
            <div style={{ padding: '10px' }}>
              {potentialByStage.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>אין נתונים להצגה.</div>
              ) : potentialByStage.map((st, i) => (
                <div key={i} style={{ marginBottom: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(251,146,60,0.25)' }}>
                  <div style={{ background: 'rgba(251,146,60,0.12)', padding: '6px 10px', fontSize: '0.82rem', fontWeight: 700, color: '#fdba74' }}>
                    {st.label} · {st.count} יריבים אפשריים
                  </div>
                  <div style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {st.names.length === 0
                      ? <span style={{ color: '#64748b', fontSize: '0.8rem' }}>טרם ידוע</span>
                      : st.names.map((item, j) => (
                          <span key={j} style={{ fontSize: '0.78rem', color: '#e2e8f0', background: 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <span>{item.name}</span>
                            <span style={{ fontSize: '0.68rem', color: '#fbbf24', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{item.seed}</span>
                          </span>
                        ))}
                  </div>
                </div>
              ))}
              <p style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>
                * אלה כל מי שעשוי לפגוש אותך בכל שלב, אם תעלה והם יעלו. ככל שמתקדמים — יותר מתמודדים אפשריים.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

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
              myMatchInfo.isChampion ? (
                <p className="text-amber-300">
                  🏆 <b>{myName.trim()}</b> — אלוף הגביע!
                </p>
              ) : myMatchInfo.eliminated ? (
                <p className="text-red-300">
                  ❌ <b>{myName.trim()}</b> — הודח{myMatchInfo.eliminatedRound ? ` ב${myMatchInfo.eliminatedRound}` : ''}
                  {myMatchInfo.lostTo && <> · הפסיד ל-<b className="text-amber-300">{myMatchInfo.lostTo}</b></>}
                </p>
              ) : myMatchInfo.isBye ? (
                <p className="text-green-300">
                  ⏭️ <b>{myName.trim()}</b> — עולה אוטומטית לסיבוב 2 (בּיי){myMatchInfo.match_no ? ` · משחק מס' ${myMatchInfo.match_no}` : ''}
                </p>
              ) : (
                <p className="text-cyan-200">
                  🎯 משחק מס' <b className="text-cyan-300">{myMatchInfo.match_no}</b> · היריב שלך: <b className="text-amber-300">{myMatchInfo.opponent}</b>
                </p>
              )
            ) : (
              <p className="text-slate-400">לא נמצא משתתף בשם זה בבראקט.</p>
            )}
            {/* כפתור הצגת יריבים פוטנציאליים בחלון צף */}
            <button onClick={() => setShowPotential(true)}
              className="mt-2 text-xs font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
              style={{ color: '#fb923c', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.5)' }}>
              🎯 הצג יריבים פוטנציאליים (4 שלבים קדימה)
            </button>
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

          {/* כפתורי מנהל — מוצגים בשתי התצוגות (רשימה ועץ), לסיבוב פעיל */}
          {isAdmin && !cupData.champion && !showingHistory && (
            <div className="mb-3 flex gap-2 flex-wrap items-center p-2 rounded-lg" style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(6,182,212,0.2)' }}>
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

          {/* מתג תצוגה: עץ ויזואלי / רשימה (עץ ראשון = ברירת מחדל) */}
          <div className="flex gap-1.5 mb-3 items-center flex-wrap">
            <button onClick={() => setViewMode('tree')}
              className="text-[11px] font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
              style={{ color: viewMode === 'tree' ? '#0f172a' : '#94a3b8', background: viewMode === 'tree' ? '#38bdf8' : 'rgba(255,255,255,0.04)', border: `1px solid ${viewMode === 'tree' ? '#38bdf8' : 'rgba(148,163,184,0.3)'}` }}>
              <GitBranch className="w-3.5 h-3.5" /> עץ בראקט
            </button>
            <button onClick={() => setViewMode('list')}
              className="text-[11px] font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
              style={{ color: viewMode === 'list' ? '#0f172a' : '#94a3b8', background: viewMode === 'list' ? '#38bdf8' : 'rgba(255,255,255,0.04)', border: `1px solid ${viewMode === 'list' ? '#38bdf8' : 'rgba(148,163,184,0.3)'}` }}>
              <List className="w-3.5 h-3.5" /> רשימה
            </button>
            {/* ⚖️ רשימת כללי ההכרעה — נפתח/נסגר */}
            <button onClick={() => setShowRules(v => !v)}
              className="text-[11px] font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5 mr-auto"
              style={{ color: showRules ? '#0f172a' : '#c4b5fd', background: showRules ? '#a78bfa' : 'rgba(168,85,247,0.08)', border: `1px solid ${showRules ? '#a78bfa' : 'rgba(168,85,247,0.4)'}` }}>
              ⚖️ כללי ההכרעה
            </button>
          </div>

          {/* ⚖️ פאנל כללי ההכרעה */}
          {showRules && (
            <div className="mb-3 p-2.5 rounded-lg text-[11px] leading-relaxed"
              style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.3)', color: '#e2e8f0' }}>
              <p className="font-bold mb-1" style={{ color: '#c4b5fd' }}>⚖️ איך מוכרע דו-קרב? לפי הסדר הבא:</p>
              <ol className="pr-4" style={{ listStyle: 'none' }}>
                <li><b style={{ color: '#c4b5fd' }}>א.</b> {RULE_DESC['א']} — הגבוה מנצח. בשוויון עוברים לשוברי השוויון:</li>
                <li><b style={{ color: '#c4b5fd' }}>ב.</b> {RULE_DESC['ב']}</li>
                <li><b style={{ color: '#c4b5fd' }}>ג.</b> {RULE_DESC['ג']}</li>
                <li><b style={{ color: '#c4b5fd' }}>ד.</b> {RULE_DESC['ד']}</li>
                <li><b style={{ color: '#c4b5fd' }}>ה.</b> {RULE_DESC['ה']} (הולכים אחורה סיבוב-סיבוב; סיבוב עם בּיי לאחד הצדדים מדולג)</li>
                <li><b style={{ color: '#c4b5fd' }}>ו.</b> {RULE_DESC['ו']}</li>
              </ol>
              <p className="mt-1" style={{ color: '#94a3b8' }}>דו-קרב שהוכרע בשובר שוויון מסומן בתג <span style={{ color: '#c4b5fd', fontWeight: 700 }}>⚖️</span> ליד המשתתף שעלה — לחיצה על התג מציגה את ההסבר והמספרים.</p>
            </div>
          )}

          {/* ── תצוגת עץ ויזואלי ── */}
          {viewMode === 'tree' ? (
            <Card style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <CardContent className="py-3 px-2">
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
                {histToShow.results.map((r, i) => {
                  // ⚖️ ערכי השובר: מהרשומה (הוקפאו ברגע ההכרעה); סיבובים ישנים — שחזור
                  //    מדויק מהנתונים הקפואים בהיסטוריה (ג/ד/ה/ו). כלל ב ישן אינו ניתן לשחזור.
                  const histIdx = (cupData.history || []).indexOf(histToShow);
                  const vals = r.tie || (r.rule && r.rule !== 'א' ? reconstructHistVals(r.rule, histIdx, r.a, r.b) : null);
                  return (
                    <MatchRow key={i} idx={i} matchNo={r.global_no || r.match_no}
                      a={{ seed: r.a, name: nameOf(r.a) }}
                      b={{ seed: r.b, name: nameOf(r.b) }}
                      sa={r.sa} sb={r.sb}
                      won={r.winner === r.a ? 'a' : 'b'}
                      tie={r.rule && r.rule !== 'א' ? { rule: r.rule, side: r.winner === r.a ? 'a' : 'b', vals } : null} />
                  );
                })}
                <p className="text-[10px] text-slate-600 text-center mt-1">
                  הכרעה לפי כלל א (ניקוד הסיבוב). בשוויון — שוברי שוויון לפי הסדר:
                  {' '}ב. {RULE_DESC['ב']} · ג. {RULE_DESC['ג']} · ד. {RULE_DESC['ד']} · ה. {RULE_DESC['ה']} · ו. {RULE_DESC['ו']}.
                </p>
              </CardContent>
            </Card>
          ) : !cupData.champion && (
            /* הסיבוב הנוכחי — פעיל */
            <>
              <Card className="mb-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base text-cyan-300 flex items-center gap-2"><Flag className="w-4 h-4" /> {roundLabel(cupData.round_size, cupData.is_prelim)} · פעיל</CardTitle>
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
                        // מספר המשחק של בּיי = עמדת הזרע בעץ + 1 (במקדים global = מקומי)
                        const order = bracketOrder(CUP_SIZE);
                        const posIdx = order.indexOf(seed);
                        const mn = posIdx >= 0 ? posIdx + 1 : 9999;
                        return { is_bye: true, seed, match_no: mn, global_no: mn };
                      })
                    : [];
                  const matchRows = cupData.pairs.map(pair => ({ ...pair, is_bye: false }));
                  const allRows = [...matchRows, ...byeRows].sort((x, y) => (x.global_no || x.match_no || 0) - (y.global_no || y.match_no || 0));
                  return allRows.map((row, idx) => {
                    const gno = row.global_no || row.match_no;
                    if (row.is_bye) {
                      return (
                        <div key={`bye-${row.seed}`} className="flex items-center text-sm rounded-md overflow-hidden" style={{ background: 'rgba(52,211,153,0.06)' }}>
                          <span className="text-[10px] text-slate-500 w-9 text-center flex-shrink-0 tabular-nums" style={{ borderLeft: '1px solid rgba(100,116,139,0.2)' }}>{gno}</span>
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
                    // ⚖️ שוויון חי: מציגים מי עולה כרגע לפי שוברי השוויון (תצוגת ביניים —
                    //    decidePair דטרמיניסטי, אפס נגיעה במנוע). ההכרעה הסופית רק ב"הכרע סיבוב".
                    let liveTie = null;
                    if (leader === 'tie' && cupData.round_start_set) {
                      const d = decidePair(row.a, row.b);
                      if (d.rule !== 'א') liveTie = { rule: d.rule, side: d.winner === row.a ? 'a' : 'b', vals: d.vals, live: true };
                    }
                    return (
                      <MatchRow key={`m-${idx}`} idx={idx} matchNo={gno}
                        a={{ seed: row.a, name: nameOf(row.a) }}
                        b={{ seed: row.b, name: nameOf(row.b) }}
                        sa={sa} sb={sb}
                        won={leader === 'tie' ? null : leader}
                        tie={liveTie} />
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

// ── מסך צף: ניחושי שני משתתפים בדו-קרב, אחד מול השני, לשאלות הסיבוב הנוכחי ──
//   "שאלות הסיבוב" = שאלות שנסגרו (יש actual_result) אך לא היו ב-snapshot של תחילת הסיבוב.
//   הניקוד לכל שאלה מחושב ע"י calculateQuestionScore — אותה לוגיקה כמו בשאר המסכים.
function DuelPeek({ me, opp, gameId, startClosedQids, scoreMe, scoreOpp, onClose }) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [predsMe, setPredsMe] = useState({});   // question_id(text) → text_prediction
  const [predsOpp, setPredsOpp] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const qs = await db.Question.filter({ game_id: gameId }, null, 10000);
        // 🔧 נירמול שם (רווחים סביב '+') — שם הבראקט עלול להכיל רווח-ליד-+ שאינו קיים
        //    בטבלת הניחושים, מה שגרם למשיכה ריקה ולכל השאלות להופיע אפורות ללא ניקוד.
        const normName = (n) => (n || '').replace(/\s*\+\s*/g, '+').replace(/\s+/g, ' ').trim();
        const pMe = await db.Prediction.filter({ participant_name: normName(me), game_id: gameId }, null, 10000);
        const pOpp = await db.Prediction.filter({ participant_name: normName(opp), game_id: gameId }, null, 10000);
        if (!alive) return;
        setQuestions(qs || []);
        const toMap = (arr) => {
          const m = {};
          (arr || []).forEach(p => { m[String(p.question_id)] = p.text_prediction; });
          return m;
        };
        setPredsMe(toMap(pMe));
        setPredsOpp(toMap(pOpp));
      } catch (e) {
        console.error('טעינת ניחושי דו-קרב נכשלה', e);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [me, opp, gameId]);

  // שאלות הסיבוב: סגורות עכשיו (actual_result) שלא היו ב-snapshot.
  //   חריג ל-T16/T17 (ראש בית/סגנית/מקום שלישי): שאלה ריקה תיכלל אם אחד מהמשתתפים
  //   כבר זכאי לניקוד עליה (כי הניחוש מתייחס לתוצאות אחרות שכבר נקבעו בבית).
  const snapSet = new Set(startClosedQids || []);
  const isClosed = (q) => q.actual_result && String(q.actual_result).trim() !== '' && q.actual_result !== '__CLEAR__';

  // scoreOf מוגדר כאן (לפני הסינון) כדי שנוכל להחליט אילו שאלות ריקות בכל זאת מציגות ניקוד
  const scoreOf = (q, pred) => {
    if (pred == null || String(pred).trim() === '') return null;
    const questionsInTable = questions.filter(x => x.table_id === q.table_id);
    return calculateQuestionScore(q, pred, questionsInTable, {}, questions);
  };

  const isPairTable = (q) => q.table_id === 'T16' || q.table_id === 'T17';
  const earnsScore = (q) => {
    const a = scoreOf(q, predsMe[String(q.id)]);
    const b = scoreOf(q, predsOpp[String(q.id)]);
    return typeof a === 'number' || typeof b === 'number';
  };

  // כל השאלות שיש בהן ניקוד (סגורות, או שאלות-זוג שכבר מזכות)
  // כלל אחיד: מוצגת כל שאלה שנספרת במסך הראשי — כלומר יש לה תוצאת אמת (סגורה),
  //   או שהמערכת נתנה עליה ניקוד חיובי בפועל לאחד המשתתפים (ניקוד חלקי לגיטימי,
  //   כמו "מקום 3" שכבר נקבע). מקור אחד לאמת — בדיוק כמו ספירת המסך הראשי.
  const scoredQuestions = questions
    .filter(q => {
      if (isClosed(q)) return true;
      const a = scoreOf(q, predsMe[String(q.id)]);
      const b = scoreOf(q, predsOpp[String(q.id)]);
      return (typeof a === 'number' && a > 0) || (typeof b === 'number' && b > 0);
    })
    .sort((a, b) => (a.table_id || '').localeCompare(b.table_id || '') || (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0));
  // שאלות הסיבוב הנוכחי = אלה שנסגרו מאז נקודת הייחוס (לא היו בצילום ההתחלה)
  const roundOnly = scoredQuestions.filter(q => !snapSet.has(q.id));
  // אם בסיבוב הנוכחי טרם נסגרו שאלות (תחילת סיבוב / צפייה בדו-קרב מוקדם) —
  //   מציגים את ההשוואה המצטברת המלאה, כדי שהחלון לעולם לא יהיה ריק כשיש מה להשוות.
  const showingCumulative = roundOnly.length === 0 && scoredQuestions.length > 0;
  const roundQuestions = showingCumulative ? scoredQuestions : roundOnly;

  // צבע badge לפי ניקוד: ירוק=מלא | צהוב=חלקי | אדום=0 סופי | אפור=0 לא-סופי/טרם
  const badgeFor = (score, maxNum, isFinal) => {
    if (score == null) return { bg: 'rgba(100,116,139,0.4)', fg: '#cbd5e1' };       // טרם נוקד
    if (score === maxNum && maxNum > 0) return { bg: '#15803d', fg: '#dcfce7' };    // מלא — ירוק
    if (score > 0) return { bg: '#eab308', fg: '#fff' };                            // חלקי — צהוב
    // score === 0:
    if (isFinal) return { bg: '#b91c1c', fg: '#fee2e2' };                           // 0 סופי — אדום
    return { bg: 'rgba(100,116,139,0.4)', fg: '#cbd5e1' };                          // 0 לא-סופי — אפור
  };

  const maxOf = (q) => (q.possible_points != null ? q.possible_points : 0);

  // 🏆 שם הבית ממספר שאלה (1→א', 2→ב', … 12→יב') — לציון הבית בתת-שאלות ההעפלה של מקום שלישי
  const GROUP_LETTERS = ['א',"ב",'ג','ד','ה','ו','ז','ח','ט','י','יא','יב'];
  const groupNameFromQid = (qid) => {
    const n = parseInt(String(qid), 10); // החלק השלם: "2.1" → 2
    return (n >= 1 && n <= 12) ? `בית ${GROUP_LETTERS[n - 1]}'` : '';
  };

  // 🎨 פיצול תצוגה ל-T17 (מקום שלישי) — זהה ל-ViewSubmissions (דרך א'): אפס נגיעה בחישוב.
  //   ScoreService נשאר מקור האמת; כאן רק מציגים באדג' תצוגתי כך שתת-שאלת ההעפלה תיצבע
  //   (4 ירוק / 0 אדום / אפור), והשאלה הראשית תציג את רכיב D (10/7). הסכום הרשמי לא משתנה.
  const T17_BG = {
    GREEN: { bg: '#15803d', fg: '#dcfce7' },
    RED:   { bg: '#b91c1c', fg: '#fee2e2' },
    BLUE:  { bg: '#1d4ed8', fg: '#dbeafe' },
    GRAY:  { bg: 'rgba(100,116,139,0.4)', fg: '#cbd5e1' },
  };
  const stripParensT17 = (s) => (s || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const normT17 = (s) => stripParensT17(s).toLowerCase();
  const actOfT17 = (qq) => (qq && qq.actual_result && qq.actual_result !== '__CLEAR__' && String(qq.actual_result).trim() !== '') ? qq.actual_result : null;
  const findQT17 = (tbl, qid) => questions.find(x => x.table_id === tbl && x.question_id === qid);
  // מחזיר {bg, fg, text} לשאלת T17 (ראשית או תת-שאלה) לפי הניחוש הנתון
  const t17Display = (q, pred) => {
    const g = parseInt(q.question_id, 10);
    const isSub = String(q.question_id).includes('.');
    const advQ = findQT17('T17', `${g}.1`);
    const advAct = actOfT17(advQ);
    const advKnown = !!advAct;
    if (isSub) {
      // ── תת-שאלת ההעפלה (E) ──
      if (!advKnown) return { ...T17_BG.GRAY, text: '?/4' };           // טרם נקבע → אפור
      const eCorrect = pred && normT17(pred) === normT17(advAct);
      return eCorrect ? { ...T17_BG.GREEN, text: '4/4' } : { ...T17_BG.RED, text: '0/4' };
    }
    // ── השאלה הראשית (D = הנבחרת השלישית) ──
    const thirdAct  = actOfT17(findQT17('T17', String(g)));
    const headAct   = actOfT17(findQT17('T16', String(2 * g - 1)));
    const runnerAct = actOfT17(findQT17('T16', String(2 * g)));
    if (!thirdAct) return { ...T17_BG.GRAY, text: '?/10' };            // השלישי טרם נקבע → אפור
    const predD = normT17(pred || '');
    if (predD && predD === normT17(thirdAct)) {
      // D נכון → 10 ירוק. ה-10 נעול ברגע שהשלישי ידוע (רכיב E של 4 הוא שורה נפרדת).
      return { ...T17_BG.GREEN, text: '10/10' };
    }
    if (predD && ((headAct && predD === normT17(headAct)) || (runnerAct && predD === normT17(runnerAct)))) {
      return { ...T17_BG.BLUE, text: '7/10' };                         // ניחש שלישית אך סיים ראש/סגנית → +7
    }
    return { ...T17_BG.RED, text: '0/10' };                            // D שגוי → 0 אדום
  };
  const isT17Q = (q) => q.table_id === 'T17';

  let sumMe = 0, sumOpp = 0;
  roundQuestions.forEach(q => {
    const a = scoreOf(q, predsMe[String(q.id)]); const b = scoreOf(q, predsOpp[String(q.id)]);
    if (typeof a === 'number') sumMe += a;
    if (typeof b === 'number') sumOpp += b;
  });
  // הניקוד הסמכותי = ניקוד-הסיבוב מהמסך הראשי (sa/sb). אם לא הועבר — נפילה לסכום המחושב.
  const displayMe = (scoreMe != null) ? scoreMe : sumMe;
  const displayOpp = (scoreOpp != null) ? scoreOpp : sumOpp;

  return createPortal(
    <div onClick={onClose} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '640px', maxHeight: '88vh', overflowY: 'auto', background: '#0b1220', backgroundImage: 'linear-gradient(180deg,#101b30,#0b1220)', border: '1px solid rgba(6,182,212,0.5)', borderRadius: '12px', boxShadow: '0 16px 48px rgba(0,0,0,0.85)' }}>
        {/* כותרת */}
        <div style={{ position: 'sticky', top: 0, background: '#0b1220', borderBottom: '1px solid rgba(100,116,139,0.3)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0' }}>
            ⚔️ השוואת ניחושי הדו-קרב
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X className="w-5 h-5" /></button>
        </div>

        {/* שמות + סיכום */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(100,116,139,0.2)' }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '10px', borderLeft: '1px solid rgba(100,116,139,0.2)' }}>
            <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: '0.85rem' }}>{me}</div>
            <div style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 800 }}>{displayMe}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '10px' }}>
            <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.85rem' }}>{opp}</div>
            <div style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 800 }}>{displayOpp}</div>
          </div>
        </div>

        {/* תוכן */}
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ margin: '0 auto' }} /> טוען ניחושים...
          </div>
        ) : roundQuestions.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
            עדיין לא נסגרו שאלות בסיבוב זה (מאז שנקבעה נקודת הייחוס).
          </div>
        ) : (
          <div style={{ padding: '8px' }}>
            {roundQuestions.map((q) => {
              const predMe = predsMe[String(q.id)];
              const predOpp = predsOpp[String(q.id)];
              const sMe = scoreOf(q, predMe), sOpp = scoreOf(q, predOpp);
              const mx = maxOf(q);
              const isFinal = isScoreFinal(q, questions);
              const bMe = badgeFor(sMe, mx, isFinal), bOpp = badgeFor(sOpp, mx, isFinal);
              // 🎨 T17: פיצול תצוגה (D על הראשית, E על ההעפלה) — אחרת ניקוד/מקס כרגיל
              const dispMe = isT17Q(q)
                ? t17Display(q, predMe)
                : { bg: bMe.bg, fg: bMe.fg, text: (sMe == null ? `?/${mx}` : (sMe === 0 && !isFinal) ? `?/${mx}` : `${sMe}/${mx}`) };
              const dispOpp = isT17Q(q)
                ? t17Display(q, predOpp)
                : { bg: bOpp.bg, fg: bOpp.fg, text: (sOpp == null ? `?/${mx}` : (sOpp === 0 && !isFinal) ? `?/${mx}` : `${sOpp}/${mx}`) };
              let label = q.question_text || q.table_description || `${q.table_id} · ${q.question_id}`;
              // 🏆 T17 (מקום שלישי): מציגים "מקום שלישי · בית X · <שאלה>" בשתי השאלות —
              //    הראשית (question_text = שם הבית) והעפלה (question_text = "האם תעפיל ?").
              if (q.table_id === 'T17') {
                const isSub = String(q.question_id).includes('.');
                if (isSub) {
                  const gname = groupNameFromQid(q.question_id);
                  label = ['מקום שלישי', gname, q.question_text].filter(Boolean).join(' · ');
                } else {
                  label = ['מקום שלישי', q.question_text].filter(Boolean).join(' · ');
                }
              }
              return (
                <div key={q.id} style={{ marginBottom: '6px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(100,116,139,0.18)' }}>
                  <div style={{ background: 'rgba(6,182,212,0.08)', padding: '5px 10px', fontSize: '0.72rem', color: '#94a3b8' }}>
                    {label} · תוצאה: <b style={{ color: '#22d3ee' }}>{q.actual_result}</b>
                  </div>
                  <div style={{ display: 'flex' }}>
                    {/* שלי */}
                    <div style={{ flex: 1, padding: '7px 10px', borderLeft: '1px solid rgba(100,116,139,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ color: '#e2e8f0', fontSize: '0.82rem' }}>{predMe || <span style={{ color: '#64748b' }}>—</span>}</span>
                      <span style={{ background: dispMe.bg, color: dispMe.fg, fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', minWidth: '38px', textAlign: 'center', flexShrink: 0 }}>{dispMe.text}</span>
                    </div>
                    {/* היריב */}
                    <div style={{ flex: 1, padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ color: '#e2e8f0', fontSize: '0.82rem' }}>{predOpp || <span style={{ color: '#64748b' }}>—</span>}</span>
                      <span style={{ background: dispOpp.bg, color: dispOpp.fg, fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', minWidth: '38px', textAlign: 'center', flexShrink: 0 }}>{dispOpp.text}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
