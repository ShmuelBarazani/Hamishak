import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useGame } from '@/components/contexts/GameContext';
import { supabase } from '@/api/supabaseClient';
import { calculateAllParticipantsScores, calculateTotalScore } from '@/components/scoring/ScoreService';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Wand2, Trophy, TrendingUp, TrendingDown, ShieldAlert, Lock, RotateCcw } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   🎮 סימולטור "מה אם" — גרסה 3
   • סימולציה בלבד: בדפדפן, על עותק. אפס כתיבה למסד. ScoreService מיובא בלבד.
   • שיטת ההפרשים: מדומה = רשמי + (מנוע[תרחיש] − מנוע[עכשיו]). כולל את כל
     בונוסי המונדיאל (בית/T16/T17/עולות) — הם חלק מהמנוע הרשמי.
   • מטמון: IndexedDB (ללא מגבלת 5MB) עם נסיגה ל-localStorage.
   ═══════════════════════════════════════════════════════════════════ */

const WC_GAME_ID = '30032806-6216-496f-ac32-fb628e181742';
const WC_BRACKET_ORDER = [
  ['גרמניה','פרגוואי'],   ['צרפת','שבדיה'],
  ['דרום אפריקה','קנדה'], ['הולנד','מרוקו'],
  ['פורטוגל','קרואטיה'],  ['ספרד','אוסטריה'],
  ['ארה"ב','בוסניה'],     ['בלגיה','סנגל'],
  ['ברזיל','יפן'],        ['חוף השנהב','נורווגיה'],
  ['מקסיקו','אקוואדור'],  ['אנגליה','קונגו'],
  ['ארגנטינה','קייפ ורדה'],['אוסטרליה','מצרים'],
  ['שווייץ',"אלג'יריה"],  ['קולומביה','גאנה'],
];
const STAGE_TIDS  = ['T19','T21','T23','T25'];
const LEVEL_NAMES = ['1/16','שמינית הגמר','רבע הגמר','חצי הגמר','הגמר'];
const LEVEL_ICONS = ['⚔️','🎯','🔥','⭐','🏆'];
const NEXT_STAGE_OF_LEVEL = ['T19','T21','T23','T25','CHAMP']; // המנצחת בשלב L נכנסת לרשימה הזו

const normT = s => String(s ?? '')
  .replace(/\s*\([^)]*\)\s*/g,' ')
  .replace(/["'׳"]/g,'')
  .replace(/\s+/g,' ')
  .trim().toLowerCase();
const isEmpty = v => v == null || String(v).trim() === '' || v === '__CLEAR__';

/* ── 💾 מטמון: IndexedDB (ראשי) + localStorage (נסיגה). מפתח משותף עם מסך הסטטיסטיקות ── */
const PRED_COLS = 'question_id,participant_name,text_prediction,home_prediction,away_prediction';
const PREDS_KEY = gid => `tlt_preds_v4_${gid}`;
const PREDS_TTL_MS = 12 * 60 * 60 * 1000;
const idbGet = key => new Promise(res => {
  try {
    const rq = indexedDB.open('tlt_cache', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => { try {
      const g = rq.result.transaction('kv','readonly').objectStore('kv').get(key);
      g.onsuccess = () => res(g.result ?? null); g.onerror = () => res(null);
    } catch { res(null); } };
    rq.onerror = () => res(null);
  } catch { res(null); }
});
const idbSet = (key, val) => new Promise(res => {
  try {
    const rq = indexedDB.open('tlt_cache', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => { try {
      const tx = rq.result.transaction('kv','readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res(true); tx.onerror = () => res(false);
    } catch { res(false); } };
    rq.onerror = () => res(false);
  } catch { res(false); }
});
const decodePreds = c => c.r.map((row, i) => {
  const val = row[2];
  const m = typeof val === 'string' ? val.match(/^(\d+)-(\d+)$/) : null;
  return {
    id: `c${i}`, question_id: c.q[row[0]], participant_name: c.n[row[1]],
    text_prediction: m ? null : (val ?? null),
    home_prediction: m ? +m[1] : null,
    away_prediction: m ? +m[2] : null,
    created_at: null,
  };
});
const encodePreds = (all, count) => {
  const q=[], qm={}, n=[], nm={};
  const r = all.map(p => {
    let qi = qm[p.question_id]; if (qi === undefined) { qi = q.length; qm[p.question_id] = qi; q.push(p.question_id); }
    let ni = nm[p.participant_name]; if (ni === undefined) { ni = n.length; nm[p.participant_name] = ni; n.push(p.participant_name); }
    const val = (p.home_prediction != null && p.away_prediction != null)
      ? `${p.home_prediction}-${p.away_prediction}` : (p.text_prediction ?? null);
    return [qi, ni, val];
  });
  return { v: 1, ts: Date.now(), count, q, n, r };
};
async function resolvePredsSource(gameId) {
  // קריאה ישירה מהטבלה: ה-View מריץ DISTINCT מלא בכל עמוד — כבד וגורם timeout במכשירים איטיים.
  const { count } = await supabase.from('predictions')
    .select('id', { count: 'exact', head: true }).eq('game_id', gameId);
  return { src: 'predictions', count: count || 0 };
}
const _memPreds = {};
// אילו שאלות רלוונטיות לסימולציה: משבצות העולות (לניקוד+בונוס), וכל שאלה שעדיין פתוחה.
// שאלות שכבר נסגרו בתוצאת אמת מתקזזות בשיטת ההפרשים — אין צורך בניחושים שלהן.
const neededQids = questions => questions
  .filter(q => q.table_id !== 'T1' && (STAGE_TIDS.includes(q.table_id) || isEmpty(q.actual_result)))
  .map(q => q.id);

async function loadSimPredictions(gameId, questions, onStage) {
  if (_memPreds[gameId]) { onStage?.('מטמון ✓'); return _memPreds[gameId]; }
  const qids = neededQids(questions);
  const qidSet = new Set(qids);
  const SIM_KEY = `tlt_simpreds_v2_${gameId}`;

  // 1) המטמון המלא של הסטטיסטיקות — תמיד superset; סינון בזיכרון, אפס רשת
  try {
    const full = await idbGet(PREDS_KEY(gameId));
    if (full && full.v === 1 && Date.now() - (full.ts || 0) <= PREDS_TTL_MS) {
      const rows = decodePreds(full).filter(p => qidSet.has(p.question_id));
      if (rows.length) { onStage?.('מטמון ✓'); _memPreds[gameId] = rows; return rows; }
    }
  } catch { /* — */ }

  // 2) המטמון הייעודי — תקף אם הוא מכיל את כל השאלות הנדרשות (superset).
  //    סגירת שאלה בתוצאת אמת רק מקטינה את הצורך — מסננים בזיכרון, לא מורידים מחדש.
  try {
    const c = await idbGet(SIM_KEY);
    if (c && c.v === 1 && Array.isArray(c.qids) && Date.now() - (c.ts || 0) <= PREDS_TTL_MS) {
      const covered = new Set(c.qids);
      if (qids.every(q => covered.has(q))) {
        const rows = decodePreds(c).filter(p => qidSet.has(p.question_id));
        onStage?.('מטמון ✓'); _memPreds[gameId] = rows; return rows;
      }
    }
  } catch { /* — */ }

  // 3) הורדה ממוקדת — רק בפעם הראשונה (או כשנוספו שאלות חדשות / פג תוקף)
  const { src, count } = await (async () => {
    const r = await resolvePredsSource(gameId);
    const { count } = await supabase.from(r.src).select('question_id', { count: 'exact', head: true })
      .eq('game_id', gameId).in('question_id', qids);
    return { src: r.src, count: count || 0 };
  })();
  if (!count) return [];
  onStage?.(`מוריד ${count.toLocaleString()} ניחושים רלוונטיים (חד-פעמי)...`);
  const PAGE = 1000; const jobs = [];
  for (let from = 0; from < count; from += PAGE) {
    jobs.push(supabase.from(src).select(PRED_COLS).eq('game_id', gameId).in('question_id', qids)
      .order('question_id', { ascending: true }).order('participant_name', { ascending: true })
      .range(from, Math.min(from + PAGE - 1, count - 1)));
  }
  const results = await Promise.all(jobs);
  let all = [];
  for (const r of results) { if (r.error) throw r.error; if (r.data?.length) all = all.concat(r.data); }
  all.forEach((p, i) => { if (p.id == null) p.id = `n${i}`; });
  const enc = encodePreds(all, count); enc.src = src; enc.qids = qids;
  idbSet(SIM_KEY, enc);
  _memPreds[gameId] = all;
  return all;
}
async function loadAllQuestions(gameId) {
  const all = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('questions').select('*')
      .eq('game_id', gameId).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export default function Simulator() {
  const { currentGame } = useGame();
  const isWC = currentGame?.id === WC_GAME_ID;

  const [loading, setLoading]     = useState(true);
  const [loadStage, setLoadStage] = useState('טוען...');
  const [loadErr, setLoadErr]     = useState('');
  const [questions, setQuestions] = useState([]);
  const [preds, setPreds]         = useState([]);
  const [rankRows, setRankRows]   = useState([]);
  const [koResults, setKoResults] = useState({});
  const [me, setMe]               = useState('');
  const [specialsMode, setSpecialsMode] = useState('mine'); // 'mine' | 'popular' | 'off'
  const [treeMode, setTreeMode] = useState('mine');           // 'mine' | 'popular'
  const [overrides, setOverrides] = useState({});
  const [specOverrides, setSpecOverrides] = useState({}); // 🗳️✏️ התאמות ידניות לשאלות פתוחות במצב חוכמת ההמונים: {qid: תשובה}
  const [simulating, setSimulating] = useState(false);
  const [result, setResult]       = useState(null);
  const [specOpen, setSpecOpen]   = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [isNarrow, setIsNarrow]   = useState(() => { try { return window.innerWidth <= 980; } catch { return false; } });
  const baseAllRef = useRef(null);

  useEffect(() => {
    const onR = () => { try { setIsNarrow(window.innerWidth <= 980); } catch { /* — */ } };
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentGame?.id) return;
      setLoading(true); setLoadErr(''); setResult(null); setMe(''); setOverrides({}); baseAllRef.current = null;
      try {
        setLoadStage('טוען נתונים...');
        const [qs, rk, ko] = await Promise.all([
          loadAllQuestions(currentGame.id),
          supabase.from('rankings').select('participant_name,current_score').eq('game_id', currentGame.id).limit(100000).then(r => r.data || []),
          supabase.from('games').select('ko_results').eq('id', currentGame.id).single().then(r => r.data?.ko_results || {}).catch(() => ({})),
        ]);
        if (cancelled) return;
        const ps = await loadSimPredictions(currentGame.id, qs, s => !cancelled && setLoadStage(s));
        if (cancelled) return;
        setQuestions(qs); setRankRows(rk); setKoResults(ko); setPreds(ps);
      } catch (e) {
        if (!cancelled) setLoadErr('טעינת הנתונים נכשלה — נסה לרענן. ' + (e?.message || ''));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentGame?.id]);

  const { engineRows, latestByPart } = useMemo(() => {
    const latest = {};
    preds.forEach(p => {
      const t = (p.home_prediction != null && p.away_prediction != null)
        ? `${p.home_prediction}-${p.away_prediction}` : (p.text_prediction ?? '');
      if (!latest[p.participant_name]) latest[p.participant_name] = {};
      latest[p.participant_name][p.question_id] = t;
    });
    const rows = [];
    Object.entries(latest).forEach(([name, m]) =>
      Object.entries(m).forEach(([qid, t]) => rows.push({ participant_name: name, question_id: qid, text_prediction: t })));
    return { engineRows: rows, latestByPart: latest };
  }, [preds]);

  const participantNames = useMemo(() =>
    [...new Set(rankRows.map(r => r.participant_name))].sort((a, b) => a.localeCompare(b, 'he')),
  [rankRows]);

  const officialPos = useMemo(() => {
    const rows = rankRows.map(r => ({ name: r.participant_name, score: Number(r.current_score) || 0 }));
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'he'));
    const m = {}; rows.forEach((r, i) => { m[r.name] = i + 1; }); return m;
  }, [rankRows]);

  const totalOf = r => (r && typeof r === 'object' && 'total' in r) ? (Number(r.total) || 0) : (Number(r) || 0);

  const compute = (who, ovr, sMode, tMode, spOvr = specOverrides) => {
    const myPred = latestByPart[who] || {};

    const mySets = {}; STAGE_TIDS.forEach(t => { mySets[t] = new Set(); });
    const slotPts = {}; // נקודות למשבצת בכל שלב
    questions.forEach(q => {
      if (STAGE_TIDS.includes(q.table_id)) {
        if (myPred[q.id]) mySets[q.table_id].add(normT(myPred[q.id]));
        if (!slotPts[q.table_id] && q.possible_points) slotPts[q.table_id] = q.possible_points;
      }
    });
    const champQ  = questions.find(q => /זוכה|אלופ/.test(q.question_text || '') && !/סגנ/.test(q.question_text || '') && q.stage_type !== 'qualifiers');
    const runnerQ = questions.find(q => /סגנית/.test(q.question_text || '') && q.stage_type !== 'qualifiers');
    const myChamp = champQ ? normT(myPred[champQ.id] || '') : '';
    slotPts.CHAMP = champQ?.possible_points || 0;
    const prio = t => { const n = normT(t);
      if (n && n === myChamp) return 6;
      if (mySets.T25.has(n)) return 5; if (mySets.T23.has(n)) return 4;
      if (mySets.T21.has(n)) return 3; if (mySets.T19.has(n)) return 2; return 0; };
    // כמה שווה לי שהקבוצה הזו תעלה בשלב הבא (לתג בעץ)
    const gainOf = (team, lvl) => {
      const tid = NEXT_STAGE_OF_LEVEL[lvl]; const n = normT(team);
      if (tid === 'CHAMP') return (n && n === myChamp) ? (slotPts.CHAMP || 0) : 0;
      return mySets[tid]?.has(n) ? (slotPts[tid] || 0) : 0;
    };

    // 🗳️ חוכמת ההמונים בעץ: כמה משתתפים ניחשו שכל קבוצה תגיע לשלב הבא
    const stagePop = { T19: {}, T21: {}, T23: {}, T25: {} }; const champPop = {};
    if (tMode === 'popular') {
      const stageQ = {}; questions.forEach(q => { if (STAGE_TIDS.includes(q.table_id)) stageQ[q.id] = q.table_id; });
      engineRows.forEach(p => {
        const t = String(p.text_prediction ?? '').trim(); if (!t) return;
        const tid = stageQ[p.question_id];
        if (tid) { const n = normT(t); stagePop[tid][n] = (stagePop[tid][n] || 0) + 1; }
        else if (champQ && p.question_id === champQ.id) { const n = normT(t); champPop[n] = (champPop[n] || 0) + 1; }
      });
    }
    const votesFor = (team, lvl) => {
      const tid = NEXT_STAGE_OF_LEVEL[lvl]; const n = normT(team);
      return tid === 'CHAMP' ? (champPop[n] || 0) : (stagePop[tid]?.[n] || 0);
    };

    // 🔒 תוצאות אמת — דו-כיווני ומנורמל
    const koMap = {};
    Object.entries(koResults || {}).forEach(([key, val]) => {
      const s = String(val); const m = s.match(/(\d+)\s*-\s*(\d+)/); if (!m) return;
      const parts = key.split(' - '); if (parts.length < 2) return;
      const home = parts[0].trim(), away = parts.slice(1).join(' - ').trim();
      const hs = +m[1], as = +m[2];
      let winner = null;
      if (hs > as) winner = home; else if (as > hs) winner = away;
      else { const adv = s.includes('|') ? s.split('|')[1].trim() : ''; if (adv) winner = normT(adv) === normT(home) ? home : away; }
      if (!winner) return;
      koMap[`${normT(home)}|${normT(away)}`] = normT(winner);
      koMap[`${normT(away)}|${normT(home)}`] = normT(winner);
    });
    const realWinner = (h, a) => {
      const w = koMap[`${normT(h)}|${normT(a)}`];
      if (!w) return null;
      return w === normT(h) ? h : (w === normT(a) ? a : null);
    };

    const matches = []; const memo = {};
    const W = (lvl, idx) => {
      const key = `${lvl}:${idx}`;
      if (key in memo) return memo[key];
      let h, a;
      if (lvl === 0) { [h, a] = WC_BRACKET_ORDER[idx]; }
      else { h = W(lvl - 1, idx * 2); a = W(lvl - 1, idx * 2 + 1); }
      if (!h || !a) return (memo[key] = null);
      const real = realWinner(h, a);
      let w, src;
      if (real) { w = real; src = 'real'; }
      else if (ovr[key] && (normT(ovr[key]) === normT(h) || normT(ovr[key]) === normT(a))) { w = normT(ovr[key]) === normT(h) ? h : a; src = 'override'; }
      else if (tMode === 'popular') {
        const vh = votesFor(h, lvl), va = votesFor(a, lvl);
        w = va > vh ? a : (vh > va ? h : (prio(a) > prio(h) ? a : h));
        src = 'auto';
        matches.push({ key, lvl, idx, home: h, away: a, winner: w, src, myGain: gainOf(w, lvl), votes: [vh, va] });
        return (memo[key] = w);
      }
      else { w = prio(a) > prio(h) ? a : h; src = 'auto'; }
      matches.push({ key, lvl, idx, home: h, away: a, winner: w, src, myGain: gainOf(w, lvl) });
      return (memo[key] = w);
    };
    const champion  = W(4, 0);
    const finalists = [W(3, 0), W(3, 1)].filter(Boolean);
    const semis     = [0,1,2,3].map(i => W(2, i)).filter(Boolean);
    const quarters  = [0,1,2,3,4,5,6,7].map(i => W(1, i)).filter(Boolean);
    const r16       = WC_BRACKET_ORDER.map((_, i) => W(0, i)).filter(Boolean);
    const runnerUp  = finalists.find(t => normT(t) !== normT(champion || '')) || null;

    // 🗳️ חוכמת ההמונים: התשובה הנפוצה לכל שאלה פתוחה — לפי כל המשתתפים (ספירה מנורמלת)
    const openQids = new Set(questions.filter(q =>
      q.table_id !== 'T1' && !STAGE_TIDS.includes(q.table_id) && isEmpty(q.actual_result) &&
      !(champQ && q.id === champQ.id) && !(runnerQ && q.id === runnerQ.id)
    ).map(q => q.id));
    const popCount = {};
    engineRows.forEach(p => {
      if (!openQids.has(p.question_id)) return;
      const t = String(p.text_prediction ?? '').trim();
      if (!t) return;
      const nk = normT(t);
      if (!popCount[p.question_id]) popCount[p.question_id] = {};
      const bucket = popCount[p.question_id];
      if (!bucket[nk]) bucket[nk] = { count: 0, reps: {} };
      bucket[nk].count++;
      bucket[nk].reps[t] = (bucket[nk].reps[t] || 0) + 1;
    });
    const popular = {};
    Object.entries(popCount).forEach(([qid, bucket]) => {
      let best = null;
      Object.values(bucket).forEach(b => { if (!best || b.count > best.count) best = b; });
      if (!best) return;
      let rep = '', repC = -1;
      Object.entries(best.reps).forEach(([t, c]) => { if (c > repC) { rep = t; repC = c; } });
      const total = Object.values(bucket).reduce((s, b) => s + b.count, 0);
      popular[qid] = { answer: rep, count: best.count, pct: Math.round((best.count / total) * 100) };
    });

    const stageTeams = { T19: r16, T21: quarters, T23: semis, T25: finalists };
    const buildSim = (fillSpecials) => {
      const simQ = questions.map(q => ({ ...q }));
      STAGE_TIDS.forEach(tid => {
        const slots = simQ.filter(q => q.table_id === tid); if (!slots.length) return;
        const existing = new Set(slots.filter(q => !isEmpty(q.actual_result)).map(q => normT(q.actual_result)));
        const toAssign = (stageTeams[tid] || []).filter(t => !existing.has(normT(t)));
        slots.filter(q => isEmpty(q.actual_result)).forEach((q, i) => { if (toAssign[i]) q.actual_result = toAssign[i]; });
      });
      if (champQ && champion) { const q = simQ.find(x => x.id === champQ.id); if (q && isEmpty(q.actual_result)) q.actual_result = champion; }
      if (runnerQ && runnerUp) { const q = simQ.find(x => x.id === runnerQ.id); if (q && isEmpty(q.actual_result)) q.actual_result = runnerUp; }
      const specials = [];
      simQ.forEach(q => {
        if (q.table_id === 'T1' || STAGE_TIDS.includes(q.table_id)) return;
        if (!isEmpty(q.actual_result)) return;
        if ((champQ && q.id === champQ.id) || (runnerQ && q.id === runnerQ.id)) return;
        const mine = String(myPred[q.id] ?? '').trim();
        const pop = popular[q.id] || null;
        let fill;
        if (fillSpecials && typeof fillSpecials === 'object' && fillSpecials.trueQids) {
          // 🎯 מצב "מספיק שאנצח": שאלות בסט = התשובה שלי; כל היתר לא מתגשמות לאף אחד
          fill = fillSpecials.trueQids.has(q.id) ? mine : '⛔__לא_יתגשם__';
        } else {
          const manual = String(spOvr[q.id] ?? '').trim(); // ✏️ התאמה ידנית של המשתמש — גוברת על ההמונים
          fill = fillSpecials === 'mine' ? mine : fillSpecials === 'popular' ? (manual || pop?.answer || '') : '';
        }
        if (mine || pop) {
          specials.push({ id: q.id, text: q.question_text, mine: mine || '—', pop, used: (fill && fill !== '⛔__לא_יתגשם__') ? fill : null, pts: q.possible_points || 0,
                          vlist: q.validation_list || null, manual: String(spOvr[q.id] ?? '').trim() || null,
                          qno: q.question_id ?? null, stage: q.stage_name || q.table_description || '',
                          sord: Number.isFinite(Number(q.stage_order)) ? Number(q.stage_order) : (parseInt(String(q.table_id || '').replace('T',''), 10) || 9999) });
        }
        if (fill) q.actual_result = fill;
      });
      return { simQ, specials };
    };
    const { simQ, specials: specialsList } = buildSim(sMode);
    // 🔢 סדר עולה: קודם לפי השלב (stage_order, ובהיעדרו — מספר הטבלה), ואז לפי מספר השאלה
    specialsList.sort((a, b) => {
      if (a.sord !== b.sord) return a.sord - b.sord;
      const na = parseFloat(a.qno), nb = parseFloat(b.qno);
      return (Number.isFinite(na) ? na : 1e9) - (Number.isFinite(nb) ? nb : 1e9);
    });

    if (!baseAllRef.current) baseAllRef.current = calculateAllParticipantsScores(questions, engineRows);
    const baseAll = baseAllRef.current;
    const simAll  = calculateAllParticipantsScores(simQ, engineRows);
    const officialMap = {}; rankRows.forEach(r => { officialMap[r.participant_name] = Number(r.current_score) || 0; });

    const table = participantNames.map(name => {
      const base = totalOf(baseAll[name]); const sim = totalOf(simAll[name]);
      const official = officialMap[name] ?? base;
      return { name, official, simScore: official + (sim - base), delta: sim - base };
    });
    table.sort((a, b) => b.simScore - a.simScore || a.name.localeCompare(b.name, 'he'));
    table.forEach((r, i) => { r.simPos = i + 1; r.offPos = officialPos[r.name] || null; });

    // 🔍 פירוק ביקורת שלי — מה-breakdown הרשמי (כולל שורות בונוס עם תיאור)
    const myBaseRes = calculateTotalScore(questions, myPred);
    const mySimRes  = calculateTotalScore(simQ, myPred);
    const collect = res => { const m = {}; ((res && res.breakdown) || []).forEach(b => {
      const k = b.question_id;
      if (!m[k]) m[k] = { score: 0, label: b.question_id_text, isBonus: !!b.isBonus, tid: b.table_id };
      m[k].score += Number(b.score) || 0;
    }); return m; };
    const bBy = collect(myBaseRes), sBy = collect(mySimRes);
    const qMeta = {}; questions.forEach(q => { qMeta[q.id] = q.question_text; });
    const audit = [];
    new Set([...Object.keys(bBy), ...Object.keys(sBy)]).forEach(k => {
      const d = (sBy[k]?.score || 0) - (bBy[k]?.score || 0);
      if (Math.abs(d) < 0.001) return;
      const info = sBy[k] || bBy[k];
      audit.push({ d, isBonus: info.isBonus, text: qMeta[k] || info.label || k, answer: info.isBonus ? '' : (myPred[k] || '') });
    });
    audit.sort((a, b) => b.d - a.d);
    const auditSum = audit.reduce((s, a) => s + a.d, 0);
    const bonusDelta = audit.filter(a => a.isBonus).reduce((s, a) => s + a.d, 0);
    // 🎁 בונוס-שלב לכל רשימת עולות: הושג בתרחיש? (מהמנוע), וערכו
    const STAGE_BONUS_DEF = { T19: 16, T21: 16, T23: 8, T25: 8 };
    const stageBonus = {};
    STAGE_TIDS.forEach(tid => {
      const k = `${tid}_STAGE_BONUS`;
      const simB = sBy[k]?.score || 0, baseB = bBy[k]?.score || 0;
      stageBonus[tid] = { val: simB || baseB || STAGE_BONUS_DEF[tid] || 0, earned: simB > 0, isNew: simB > 0 && baseB === 0 };
    });
    const auditByQ = {}; audit.forEach(a => { /* מפת נקודות לשאלות פתוחות */ });
    // נקודות לכל שאלה פתוחה (מהביקורת): לפי טקסט לא אמין — נשתמש במפה לפי qid
    const gainByQid = {};
    new Set([...Object.keys(bBy), ...Object.keys(sBy)]).forEach(k => {
      const d = (sBy[k]?.score || 0) - (bBy[k]?.score || 0);
      if (Math.abs(d) > 0.001) gainByQid[k] = d;
    });
    specialsList.forEach(sp => { sp.gain = sMode !== 'off' ? (gainByQid[sp.id] ?? 0) : null; });

    let engineDiffs = 0;
    table.forEach(r => { if (Math.abs(totalOf(baseAll[r.name]) - r.official) > 0.001) engineDiffs++; });
    const meRow = table.find(r => r.name === who) || null;
    return { table, meRow, matches, champion, runnerUp, specialsList, sMode, tMode, engineDiffs, audit, auditSum, bonusDelta, stageBonus };
  };

  const run = (ovr = overrides, mode = specialsMode, tree = treeMode, who = me, spOvr = specOverrides) => {
    if (!who) return;
    setSimulating(true);
    setTimeout(() => {
      try { setResult(compute(who, ovr, mode, tree, spOvr)); }
      catch (e) { console.error(e); setResult({ error: 'הסימולציה נכשלה: ' + (e?.message || '') }); }
      setSimulating(false);
    }, 40);
  };
  // 🗳️✏️ רשימות האימות מהמשחק (games.validation_lists — המקור הסמכותי)
  const validationLists = useMemo(() => {
    const m = {};
    (currentGame?.validation_lists || []).forEach(l => { m[l.list_name] = l.options || []; });
    return m;
  }, [currentGame]);
  const setSpecOverride = (qid, val) => {
    if (simulating) return;
    const next = { ...specOverrides };
    if (val == null || val === '') delete next[qid]; else next[qid] = val;
    setSpecOverrides(next);
    run(overrides, specialsMode, treeMode, me, next);
  };
  const clearSpecOverrides = () => { if (simulating) return; setSpecOverrides({}); run(overrides, specialsMode, treeMode, me, {}); };
  const clickWinner = (match, team) => {
    if (match.src === 'real' || simulating) return;
    const next = { ...overrides, [match.key]: team };
    setOverrides(next); run(next);
  };
  const resetOverrides = () => { setOverrides({}); run({}); };
  const [minWinBusy, setMinWinBusy] = useState(false);

  // 🎯 "מספיק שאנצח": הסט המינימלי (חמדני, מאומת במנוע) של ניחושים שלי שחייבים להתגשם כדי לסיים ראשון,
  //    כשכל היתר נגדי: שאלות מחוץ לסט לא מתגשמות לאף אחד, והעץ מוכרע לפי חוכמת ההמונים.
  const analyzeMinWin = () => {
    if (!me || simulating || minWinBusy) return;
    setMinWinBusy(true);
    setTimeout(() => {
      try {
        const myPred = latestByPart[me] || {};
        const officialMap = {}; rankRows.forEach(r => { officialMap[r.participant_name] = Number(r.current_score) || 0; });
        const rivals = participantNames.filter(n => n !== me);
        const heBefore = (a, b) => a.localeCompare(b, 'he') < 0;

        // — מבנה עזר: שאלות שלב + נקודות + אלופה —
        const stageQ = {}; const slotPts = {};
        questions.forEach(q => { if (STAGE_TIDS.includes(q.table_id)) { stageQ[q.id] = q.table_id; if (!slotPts[q.table_id] && q.possible_points) slotPts[q.table_id] = q.possible_points; } });
        const champQ = questions.find(q => /זוכה|אלופ/.test(q.question_text || '') && !/סגנ/.test(q.question_text || '') && q.stage_type !== 'qualifiers');
        const partStageSets = {}; const partChamp = {};
        Object.entries(latestByPart).forEach(([name, m]) => {
          const sets = { T19: new Set(), T21: new Set(), T23: new Set(), T25: new Set() };
          Object.entries(m).forEach(([qid, t]) => {
            const tid = stageQ[qid]; const v = String(t ?? '').trim();
            if (tid && v) sets[tid].add(normT(v));
            else if (champQ && qid === champQ.id && v) partChamp[name] = normT(v);
          });
          partStageSets[name] = sets;
        });

        // — תרחיש בסיס: עץ לפי הרוב, אפס שאלות מתגשמות —
        const probe = compute(me, {}, { trueQids: new Set() }, 'popular');
        const flatIdx = {}; WC_BRACKET_ORDER.flat().forEach((t, i) => { flatIdx[normT(t)] = i; });
        // עומק בסיס של כל קבוצה בעץ-הרוב + זיהוי הכרעות אמת
        const baseDepth = {}; const realAt = {};
        probe.matches.forEach(mm => {
          const n = normT(mm.winner);
          baseDepth[n] = Math.max(baseDepth[n] || 0, mm.lvl + 1);
          if (mm.src === 'real') realAt[`${mm.lvl}:${mm.idx}`] = normT(mm.winner);
        });

        // — מועמדים —
        // (א) שאלות פתוחות שעניתי עליהן: Δ מדויק (מי שענה כמוני מרוויח גם)
        const items = [];
        (probe.specialsList || []).forEach(sp => {
          const mine = String(myPred[sp.id] ?? '').trim(); if (!mine) return;
          const delta = {}; let myD = 0;
          Object.entries(latestByPart).forEach(([name, m]) => {
            const v = String(m[sp.id] ?? '').trim();
            if (v && normT(v) === normT(mine)) { delta[name] = sp.pts; if (name === me) myD = sp.pts; }
          });
          if (myD > 0) items.push({ kind: 'special', id: sp.id, label: sp.text, answer: mine, cost: 1, myGain: myD, delta, path: null });
        });
        // (ב) קבוצות מהרשימות שלי: "T מגיעה עד שלב X" (כולל אלופה) — Δ מצטבר משלב-הבסיס ומעלה
        const STAGE_LVL = { T19: 1, T21: 2, T23: 3, T25: 4 };
        const mySets = partStageSets[me] || { T19: new Set(), T21: new Set(), T23: new Set(), T25: new Set() };
        const myChampN = partChamp[me] || '';
        const teams = new Set([...mySets.T19, ...mySets.T21, ...mySets.T23, ...mySets.T25]); if (myChampN) teams.add(myChampN);
        teams.forEach(tn => {
          if (!(tn in flatIdx)) return;
          const fi = flatIdx[tn];
          // בדיקת חסימה בתוצאות אמת + בניית נתיב
          const pathFor = targetLvl => {
            const ovr = {};
            for (let l = 0; l <= targetLvl - 1; l++) {
              const node = Math.floor(fi / Math.pow(2, l + 1));
              const key = `${l}:${node}`;
              if (realAt[key] !== undefined) { if (realAt[key] !== tn) return null; }
              else ovr[key] = WC_BRACKET_ORDER.flat()[fi];
            }
            return ovr;
          };
          const bd = baseDepth[tn] || 0;
          const maxLvl = myChampN === tn ? 5 : Math.max(...[4,3,2,1].filter(l => mySets[['','T19','T21','T23','T25'][l]]?.has(tn)), 0);
          for (let target = bd + 1; target <= Math.min(maxLvl, 5); target++) {
            const treeTarget = Math.min(target, 5); // 5=אלופה (ניצחון בגמר=רמה 4)
            const path = pathFor(treeTarget === 5 ? 5 : treeTarget); if (!path) break;
            // עלות = כמה ניחושים שלי מתגשמים בקטע (bd..target); Δ = רווחי כולם בקטע
            let cost = 0; const delta = {}; let myGain = 0;
            for (let s = bd + 1; s <= target; s++) {
              if (s <= 4) {
                const tid = ['','T19','T21','T23','T25'][s]; const pts = slotPts[tid] || 0;
                Object.entries(partStageSets).forEach(([name, sets]) => { if (sets[tid].has(tn)) { delta[name] = (delta[name] || 0) + pts; if (name === me) { myGain += pts; } } });
                if (mySets[tid].has(tn)) cost += 1;
              } else { // אלופה
                const cPts = champQ?.possible_points || 0;
                Object.entries(partChamp).forEach(([name, cn]) => { if (cn === tn) { delta[name] = (delta[name] || 0) + cPts; if (name === me) myGain += cPts; } });
                if (myChampN === tn) cost += 1;
              }
            }
            if (myGain > 0) items.push({ kind: 'team', id: `${tn}@${target}`, label: `${WC_BRACKET_ORDER.flat()[fi]} ${target === 5 ? 'אלופה 🏆' : 'מגיעה ל' + ['','שמינית','רבע','חצי','גמר'][target]}`, answer: '', cost, myGain, delta, path: pathFor(Math.min(target, 4) === target && target <= 4 ? target : 4), team: tn, target });
          }
        });

        // — חמדני: מקסימום שיפור פער-מינימלי לעלות —
        const myOff = officialMap[me] ?? 0;
        const totals = {}; participantNames.forEach(n => { totals[n] = officialMap[n] ?? 0; });
        const chosen = []; const chosenIds = new Set(); const usedNodes = {};
        const winNow = () => rivals.every(r => totals[me] > totals[r] || (totals[me] === totals[r] && heBefore(me, r)));
        let guard = 40;
        while (!winNow() && guard-- > 0) {
          const worstGap = () => Math.min(...rivals.map(r => totals[me] - totals[r] + (heBefore(me, r) ? 0.5 : 0)));
          const g0 = worstGap();
          let best = null, bestScore = -Infinity;
          items.forEach(it => {
            if (chosenIds.has(it.id)) return;
            if (it.kind === 'team' && chosen.some(c => c.kind === 'team' && c.team === it.team)) { /* שדרוג אותה קבוצה מותר */ }
            if (it.path) { for (const k in it.path) { if (usedNodes[k] && usedNodes[k] !== it.team) return; } } // התנגשות עץ
            // סימולציית הוספה
            const t2 = { ...totals };
            Object.entries(it.delta).forEach(([n, d]) => { t2[n] += d; });
            const g1 = Math.min(...rivals.map(r => t2[me] - t2[r] + (heBefore(me, r) ? 0.5 : 0)));
            const score = (g1 - g0) / it.cost + (g1 > 0 ? 1000 : 0);
            if (score > bestScore) { bestScore = score; best = it; }
          });
          if (!best || bestScore <= 0) break;
          chosen.push(best); chosenIds.add(best.id);
          Object.entries(best.delta).forEach(([n, d]) => { totals[n] += d; });
          if (best.path) Object.keys(best.path).forEach(k => { usedNodes[k] = best.team; });
        }

        // — בנייה ואימות במנוע הרשמי —
        const trueQids = new Set(chosen.filter(c => c.kind === 'special').map(c => c.id));
        const ovr = {}; chosen.forEach(c => { if (c.path) Object.assign(ovr, c.path); });
        const verified = compute(me, ovr, { trueQids }, 'popular');
        const meRow = verified.meRow;
        const runner = verified.table.find(r => r.name !== me);
        verified.minWin = {
          items: chosen.map(c => ({ label: c.kind === 'special' ? c.label : c.label, answer: c.answer, gain: c.myGain, cost: c.cost, kind: c.kind })),
          totalCost: chosen.reduce((s, c) => s + c.cost, 0),
          ok: meRow?.simPos === 1,
          pos: meRow?.simPos ?? null,
          margin: meRow && runner ? meRow.simScore - runner.simScore : null,
        };
        setSpecialsMode('mine'); // הבוררים לא משקפים מצב-סט — נשאיר תווית ברורה בפאנל
        setOverrides(ovr);
        setResult(verified);
      } catch (e) { console.error(e); setResult({ error: 'ניתוח "מספיק שאנצח" נכשל: ' + (e?.message || '') }); }
      setMinWinBusy(false);
    }, 40);
  };

  const setMode = m => { setSpecialsMode(m); if (result && !result.error) run(overrides, m, treeMode); };
  const setTree = m => { setTreeMode(m); setOverrides({}); if (result && !result.error) run({}, specialsMode, m); };

  const S = {
    page: { direction: 'rtl', padding: '16px', maxWidth: 1280, margin: '0 auto' },
    card: { background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 14 },
    btn: { background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: 'white', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 },
  };

  if (!isWC) return (
    <div style={S.page}><Card style={S.card}><CardContent style={{ padding: 24 }}>
      <p style={{ color: '#94a3b8' }}>הסימולטור זמין כרגע למשחק המונדיאל בלבד.</p>
    </CardContent></Card></div>
  );

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.7rem' }}>🎮</span>
          <div>
            <h1 style={{ color: '#f8fafc', fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>סימולטור "מה אם"</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>בחר משתתף — התרחיש נבנה מיד. לחץ על קבוצה בעץ כדי לשנות הכרעה.</p>
          </div>
        </div>
        <span style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid #a855f7', color: '#d8b4fe', borderRadius: 999, padding: '5px 14px', fontSize: '0.78rem', fontWeight: 700 }}>
          🧪 סימולציה בלבד — לא משנה שום נתון אמיתי
        </span>
      </div>

      {loading ? (
        <Card style={S.card}><CardContent style={{ padding: 30, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 className="animate-spin" style={{ width: 20, height: 20, color: '#a855f7' }} />
          <span style={{ color: '#94a3b8' }}>{loadStage}</span>
        </CardContent></Card>
      ) : loadErr ? (
        <Card style={S.card}><CardContent style={{ padding: 24 }}><p style={{ color: '#f87171' }}>{loadErr}</p></CardContent></Card>
      ) : (
        <>
          <Card style={{ ...S.card, marginBottom: 14 }}>
            <CardContent style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 18 }}>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, marginBottom: 5 }}>👤 משתתף</div>
                  <select value={me}
                    onChange={e => { const v = e.target.value; setMe(v); setOverrides({}); setSpecOverrides({}); setResult(null); if (v) run({}, specialsMode, treeMode, v, {}); }}
                    style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid rgba(148,163,184,0.35)', borderRadius: 9, padding: '8px 12px', fontSize: '0.88rem', minWidth: 210, height: 38 }}>
                    <option value="">בחר משתתף...</option>
                    {participantNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <div>
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, marginBottom: 5 }}>🌳 עץ הבראקט</div>
                  <div style={{ display: 'inline-flex', borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(6,182,212,0.35)', height: 38 }}>
                    {[['mine','הטוב עבורי'],['popular','🗳️ חוכמת ההמונים']].map(([m, lbl]) => (
                      <button key={m} onClick={() => setTree(m)} disabled={simulating}
                        style={{ background: treeMode === m ? 'rgba(6,182,212,0.28)' : 'transparent', color: treeMode === m ? '#a5f3fc' : '#94a3b8', border: 'none', padding: '0 13px', fontSize: '0.8rem', fontWeight: treeMode === m ? 800 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, marginBottom: 5 }}>✨ שאלות פתוחות</div>
                  <div style={{ display: 'inline-flex', borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.35)', height: 38 }}>
                    {[['mine','התשובות שלי'],['popular','🗳️ חוכמת ההמונים'],['off','ללא']].map(([m, lbl]) => (
                      <button key={m} onClick={() => setMode(m)} disabled={simulating}
                        style={{ background: specialsMode === m ? 'rgba(168,85,247,0.3)' : 'transparent', color: specialsMode === m ? '#e9d5ff' : '#94a3b8', border: 'none', padding: '0 13px', fontSize: '0.8rem', fontWeight: specialsMode === m ? 800 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, marginBottom: 5 }}>🎯 ניתוח</div>
                  <button onClick={analyzeMinWin} disabled={!me || simulating || minWinBusy}
                    style={{ height: 38, background: 'linear-gradient(135deg,#b45309,#f59e0b)', color: '#1c1917', border: 'none', borderRadius: 9, padding: '0 14px', fontSize: '0.82rem', fontWeight: 800, cursor: me ? 'pointer' : 'default', opacity: me && !simulating && !minWinBusy ? 1 : 0.5, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {minWinBusy ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : '🎯'} מספיק שאנצח
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38 }}>
                  {simulating && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#a855f7', fontSize: '0.82rem', fontWeight: 700 }}>
                      <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> מחשב...
                    </span>
                  )}
                  {!simulating && Object.keys(overrides).length > 0 && (
                    <button onClick={resetOverrides} style={{ background: 'transparent', border: '1px solid rgba(148,163,184,0.4)', color: '#cbd5e1', borderRadius: 9, padding: '7px 12px', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <RotateCcw style={{ width: 13, height: 13 }} /> איפוס שינויים ידניים
                    </button>
                  )}
                </div>
              </div>
              {!me && <p style={{ color: '#64748b', fontSize: '0.76rem', margin: '10px 0 0' }}>בחר משתתף — התרחיש נבנה אוטומטית לפי המצבים שנבחרו. לחיצה על קבוצה בעץ משנה הכרעה.</p>}
            </CardContent>
          </Card>

          {result?.error && (
            <Card style={S.card}><CardContent style={{ padding: 18 }}><p style={{ color: '#f87171' }}>{result.error}</p></CardContent></Card>
          )}

          {result && !result.error && (
            <>
              {result.minWin && (
                <Card style={{ ...S.card, marginBottom: 14, border: `1.5px solid ${result.minWin.ok ? '#f59e0b' : '#ef4444'}`, boxShadow: result.minWin.ok ? '0 0 22px rgba(245,158,11,0.15)' : 'none' }}>
                  <CardContent style={{ padding: 18 }}>
                    {result.minWin.ok ? (
                      <>
                        <h3 style={{ color: '#fde68a', fontSize: '1.05rem', fontWeight: 800, margin: '0 0 4px' }}>
                          🎯 מספיק לך {result.minWin.totalCost} ניחושים נכונים — ואתה במקום הראשון{result.minWin.margin != null ? ` (פער +${result.minWin.margin} על השני)` : ''} ✓
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.74rem', margin: '0 0 10px' }}>
                          בהנחות הקשוחות ביותר: כל שאר השאלות הפתוחות לא מתגשמות לאף אחד, והעץ מוכרע לפי חוכמת ההמונים. אומת במנוע הניקוד הרשמי. (חישוב חמדני — ייתכן סט קטן עוד יותר.)
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {result.minWin.items.map((it, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '7px 10px' }}>
                              <div style={{ minWidth: 0 }}>
                                <span style={{ fontSize: '0.84rem', color: '#f8fafc', fontWeight: 600 }}>{it.kind === 'team' ? '⚽ ' : '✨ '}{it.label}</span>
                                {it.answer && <span style={{ fontSize: '0.76rem', color: '#94a3b8', marginRight: 7 }}>· התשובה שלך: <b style={{ color: '#fde68a' }}>{it.answer}</b></span>}
                              </div>
                              <span style={{ flexShrink: 0, fontSize: '0.82rem', fontWeight: 800, color: '#fbbf24' }}>+{it.gain}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 style={{ color: '#fca5a5', fontSize: '1rem', fontWeight: 800, margin: '0 0 4px' }}>
                          🎯 בהנחות הקשוחות — לא נמצא סט שמנצח (הגעת למקום {result.minWin.pos ?? '?'})
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: 0 }}>
                          גם אם כל הניחושים הרלוונטיים שלך יתגשמו, כשהשאר לא מתגשם לאף אחד והעץ לפי הרוב — זה לא מספיק לראשון. נסה את "התרחיש המושלם" (הכול לטובתך) כדי לראות את הגבול העליון שלך.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
              {result.meRow && (
                <Card style={{ ...S.card, marginBottom: 14, border: '1px solid rgba(251,191,36,0.5)' }}>
                  <CardContent style={{ padding: 18 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
                      <Trophy style={{ width: 34, height: 34, color: '#fbbf24' }} />
                      <div>
                        <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>בתרחיש הזה</div>
                        <div style={{ color: '#f8fafc', fontSize: '1.5rem', fontWeight: 800 }}>
                          מקום {result.meRow.simPos}
                          {result.meRow.offPos && result.meRow.simPos < result.meRow.offPos && (
                            <span style={{ color: '#34d399', fontSize: '1rem', marginRight: 8 }}>
                              <TrendingUp style={{ width: 16, height: 16, display: 'inline' }} /> טיפוס של {result.meRow.offPos - result.meRow.simPos} (מ-{result.meRow.offPos})
                            </span>
                          )}
                          {result.meRow.offPos && result.meRow.simPos >= result.meRow.offPos && (
                            <span style={{ color: '#94a3b8', fontSize: '0.95rem', marginRight: 8 }}>(היום: {result.meRow.offPos})</span>
                          )}
                        </div>
                        <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {result.bonusDelta > 0 && (
                            <span style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', color: '#fde68a', borderRadius: 999, padding: '2px 10px', fontSize: '0.74rem', fontWeight: 700 }}>🎁 מזה בונוסים: +{result.bonusDelta}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ marginRight: 'auto', textAlign: 'left' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>ניקוד מדומה</div>
                        <div style={{ color: '#fbbf24', fontSize: '1.4rem', fontWeight: 800 }}>{result.meRow.simScore}</div>
                        <div style={{ color: '#34d399', fontSize: '0.82rem', fontWeight: 700 }}>+{result.meRow.delta} מהיום ({result.meRow.official})</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 🖥️ פריסת מחשב: ימין = הדירוג המדומה, שמאל = עץ התרחיש */}
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'minmax(340px,420px) 1fr', gap: 14, alignItems: 'start', marginBottom: 14 }}>
                <div style={isNarrow ? {} : { position: 'sticky', top: 12 }}>
                  <Card style={S.card}>
                    <CardContent style={{ padding: 16 }}>
                      <h3 style={{ color: '#d8b4fe', fontSize: '0.95rem', fontWeight: 800, margin: '0 0 10px' }}>🏁 הדירוג בתרחיש הזה</h3>
                      <SimTable table={result.table} me={me} />
                      {result.engineDiffs > 0 && (
                        <p style={{ color: '#64748b', fontSize: '0.68rem', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <ShieldAlert style={{ width: 12, height: 12 }} />
                          מחושב כהפרש מעל הניקוד הרשמי — מדויק גם בסטיות מנוע ({result.engineDiffs}).
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card style={S.card}>
                  <CardContent style={{ padding: 16, maxHeight: isNarrow ? undefined : '74vh', overflowY: isNarrow ? undefined : 'auto' }}>
                    <h3 style={{ color: '#d8b4fe', fontSize: '0.95rem', fontWeight: 800, margin: '0 0 4px' }}>🌳 עץ התרחיש — לחץ על קבוצה כדי לשנות הכרעה</h3>
                    <p style={{ color: '#64748b', fontSize: '0.72rem', margin: '0 0 12px' }}>
                      <span style={{ color: '#fbbf24' }}>🔒 צהוב = תוצאת אמת</span> • <span style={{ color: '#6ee7b7' }}>ירוק = אוטומטי ({result.tMode === 'popular' ? 'לפי הרוב 🗳️' : 'הטוב עבורך'})</span> • <span style={{ color: '#d8b4fe' }}>✎ סגול = הכרעה ששינית</span> • תג זהוב = כמה שווה לך
                    </p>
                    {[0,1,2,3,4].map(lvl => {
                      const ms = result.matches.filter(m => m.lvl === lvl).sort((a, b) => a.idx - b.idx);
                      if (!ms.length) return null;
                      return (
                        <div key={lvl} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                            <span style={{ fontSize: '0.9rem' }}>{LEVEL_ICONS[lvl]}</span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#67e8f9' }}>{LEVEL_NAMES[lvl]}</span>
                            {(() => {
                              const tid = NEXT_STAGE_OF_LEVEL[lvl];
                              const sb = tid !== 'CHAMP' ? result.stageBonus?.[tid] : null;
                              if (!sb || !sb.val) return null;
                              return sb.earned
                                ? <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#fde68a', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 999, padding: '1px 8px' }}>🎁 בונוס שלב +{sb.val} ✓</span>
                                : <span style={{ fontSize: '0.66rem', color: '#64748b', border: '1px solid rgba(71,85,105,0.4)', borderRadius: 999, padding: '1px 8px' }}>בונוס שלב {sb.val} — דורש פגיעה בכל העולות</span>;
                            })()}
                            <div style={{ flex: 1, height: 1, background: 'rgba(6,182,212,0.2)' }} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(148px,1fr))', gap: 5 }}>
                            {ms.map(m => (
                              <div key={m.key} style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${m.src === 'real' ? 'rgba(251,191,36,0.4)' : m.src === 'override' ? 'rgba(168,85,247,0.55)' : 'rgba(71,85,105,0.35)'}`, borderRadius: 8, padding: 4 }}>
                                <div style={{ display: 'flex', gap: 5 }}>
                                  {[m.home, m.away].map(team => {
                                    const won = normT(team) === normT(m.winner);
                                    const locked = m.src === 'real';
                                    const cWin = locked ? '#fbbf24' : (m.src === 'override' ? '#a855f7' : '#10b981');
                                    const tWin = locked ? '#fde68a' : (m.src === 'override' ? '#d8b4fe' : '#6ee7b7');
                                    return (
                                      <button key={team} onClick={() => clickWinner(m, team)} disabled={locked || simulating}
                                        style={{
                                          flex: 1, borderRadius: 6, padding: '4px 3px', fontSize: '0.7rem', fontWeight: won ? 800 : 400,
                                          cursor: locked ? 'default' : 'pointer',
                                          background: won ? (locked ? 'rgba(251,191,36,0.12)' : (m.src === 'override' ? 'rgba(168,85,247,0.2)' : 'rgba(16,185,129,0.15)')) : 'transparent',
                                          border: `1.5px solid ${won ? cWin : 'rgba(71,85,105,0.4)'}`,
                                          color: won ? tWin : '#94a3b8',
                                          fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                        {team}
                                      </button>
                                    );
                                  })}
                                </div>
                                {(m.src !== 'auto' || m.myGain > 0 || m.votes) && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, minHeight: 13 }}>
                                  <span style={{ fontSize: '0.6rem', color: m.src === 'real' ? '#fbbf24' : m.src === 'override' ? '#c084fc' : '#67e8f9', fontWeight: 700 }}>
                                    {m.src === 'real' ? <Lock style={{ width: 9, height: 9 }} /> : m.src === 'override' ? '✎' : (m.votes ? `🗳️ ${m.votes[0]}-${m.votes[1]}` : '')}
                                  </span>
                                  {m.myGain > 0 && (
                                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fde68a', background: 'rgba(251,191,36,0.1)', borderRadius: 999, padding: '0 6px' }}>+{m.myGain}</span>
                                  )}
                                </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, color: '#cbd5e1', fontSize: '0.84rem', marginTop: 4 }}>
                      {result.champion && <span>🏆 אלופה בתרחיש: <b style={{ color: '#fbbf24' }}>{result.champion}</b></span>}
                      {result.runnerUp && <span>🥈 סגנית: <b>{result.runnerUp}</b></span>}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ✨ השאלות הפתוחות — עם הנקודות של כל אחת */}
              <Card style={{ ...S.card, marginBottom: 14 }}>
                <CardContent style={{ padding: 18 }}>
                  <div onClick={() => setSpecOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <h3 style={{ color: '#6ee7b7', fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>
                      ✨ השאלות הפתוחות ({result.specialsList.length}) — {(result.sMode && typeof result.sMode === 'object') ? 'תרחיש "מספיק שאנצח" — רק הנדרשות מתגשמות' : result.sMode === 'mine' ? 'נופלות לפי התשובות שלך' : result.sMode === 'popular' ? `נופלות לפי חוכמת ההמונים 🗳️${Object.keys(specOverrides).length ? ` · ✏️ ${Object.keys(specOverrides).length} התאמות שלך` : ''}` : 'לא נכללות בתרחיש'}
                    </h3>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {result.sMode === 'popular' && Object.keys(specOverrides).length > 0 && (
                        <button onClick={e => { e.stopPropagation(); clearSpecOverrides(); }} disabled={simulating}
                          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', cursor: 'pointer' }}>
                          ✏️ איפוס {Object.keys(specOverrides).length} התאמות
                        </button>
                      )}
                      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{specOpen ? '▲ סגור' : '▼ פתח'}</span>
                    </span>
                  </div>
                  {specOpen && (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 5, maxHeight: 360, overflowY: 'auto' }}>
                      {result.specialsList.map((sp, spIdx) => (
                        <React.Fragment key={sp.id}>
                        {(spIdx === 0 || (result.specialsList[spIdx - 1].stage || '') !== (sp.stage || '')) && (
                          <div style={{ gridColumn: '1 / -1', marginTop: spIdx === 0 ? 0 : 6, padding: '3px 10px', borderRadius: 7, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: '#22d3ee', fontSize: '0.78rem', fontWeight: 800 }}>
                            {sp.stage || 'שאלות נוספות'}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '6px 10px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.79rem', color: '#e2e8f0', display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                              {sp.qno != null && <span style={{ flexShrink: 0, fontSize: '0.7rem', fontWeight: 800, color: '#22d3ee', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 5, padding: '0 5px' }}>{sp.qno}</span>}
                              <span>{sp.text}</span>
                            </div>
                            {result.sMode === 'popular' ? (
                              <div style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <span>🗳️</span>
                                {(() => {
                                  // ✏️ בורר תשובות: ברירת המחדל = חוכמת ההמונים. אפשר לסמן כמה תשובות מרשימת
                                  //    האימות — הן מוזנות למנוע בפורמט '|||' (ריבוי תשובות רשמי של ScoreService).
                                  const opts = validationLists[sp.vlist] || [];
                                  const popAns = sp.pop?.answer || '';
                                  const parts = sp.manual ? sp.manual.split('|||').map(s => s.trim()).filter(Boolean) : [];
                                  if (!opts.length && !popAns) return <b style={{ color: '#67e8f9' }}>—</b>;
                                  const chosen = new Set(parts.map(normT));
                                  const addVal = v => { const t = String(v).trim(); if (!t || chosen.has(normT(t))) return; setSpecOverride(sp.id, [...parts, t].join('|||')); };
                                  const removeVal = t => { const next = parts.filter(p => normT(p) !== normT(t)); setSpecOverride(sp.id, next.length ? next.join('|||') : null); };
                                  const seen = new Set(chosen);
                                  const items = [];
                                  if (popAns && !seen.has(normT(popAns))) { items.push({ v: popAns, lbl: `${popAns} — חוכמת ההמונים (${sp.pop.pct}%)` }); seen.add(normT(popAns)); }
                                  opts.forEach(o => { const t = String(o).trim(); if (t && !seen.has(normT(t))) { seen.add(normT(t)); items.push({ v: t, lbl: t }); } });
                                  return (<>
                                    {parts.map(t => (
                                      <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.5)', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px' }}>
                                        {t}
                                        <button onClick={() => removeVal(t)} disabled={simulating} title="הסר תשובה"
                                          style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: '0.72rem', padding: 0, lineHeight: 1 }}>✕</button>
                                      </span>
                                    ))}
                                    <select value="" disabled={simulating}
                                      onChange={e => { const v = e.target.value; if (!v) return; if (!parts.length && normT(v) === normT(popAns)) { e.target.value = ''; return; } addVal(v); e.target.value = ''; }}
                                      style={{ maxWidth: 190, background: parts.length ? 'rgba(251,191,36,0.08)' : 'rgba(8,145,178,0.12)', color: parts.length ? '#fbbf24' : '#67e8f9', border: `1px solid ${parts.length ? 'rgba(251,191,36,0.4)' : 'rgba(8,145,178,0.4)'}`, borderRadius: 6, fontSize: '0.74rem', fontWeight: 700, padding: '2px 6px', cursor: 'pointer' }}>
                                      <option value="">{parts.length ? '＋ הוסף תשובה' : (popAns ? `${popAns} — חוכמת ההמונים (${sp.pop.pct}%)` : 'בחר תשובה...')}</option>
                                      {items.map(it => <option key={it.v} value={it.v}>{it.lbl}</option>)}
                                    </select>
                                  </>);
                                })()}
                                {sp.manual && (
                                  <button onClick={() => setSpecOverride(sp.id, null)} disabled={simulating} title="חזרה לחוכמת ההמונים"
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.72rem', padding: 0, textDecoration: 'underline' }}>איפוס</button>
                                )}
                                {(() => {
                                  const popAns = sp.pop?.answer || '';
                                  const eff = sp.manual ? sp.manual.split('|||').map(s => s.trim()).filter(Boolean) : (popAns ? [popAns] : []);
                                  const hit = eff.some(t => normT(t) === normT(sp.mine));
                                  return <span>· שלך: <b style={{ color: hit ? '#6ee7b7' : '#f87171' }}>{sp.mine}</b></span>;
                                })()}
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>הניחוש שלך: <b style={{ color: '#6ee7b7' }}>{sp.mine}</b>{sp.pop && <span style={{ marginRight: 8, color: '#64748b' }}>· חוכמת ההמונים: {sp.pop.answer} ({sp.pop.pct}%)</span>}</div>
                            )}
                          </div>
                          <span style={{ flexShrink: 0, fontSize: '0.8rem', fontWeight: 800, color: (sp.gain ?? 1) > 0 ? '#34d399' : '#94a3b8', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 999, padding: '2px 9px' }}>
                            {sp.gain != null ? (sp.gain > 0 ? `+${sp.gain}` : '0') : `עד +${sp.pts}`}
                          </span>
                        </div>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 🔍 פירוק ביקורת */}
              {result.meRow && result.audit && (
                <Card style={{ ...S.card, marginBottom: 14, border: '1px solid rgba(251,191,36,0.35)' }}>
                  <CardContent style={{ padding: 18 }}>
                    <div onClick={() => setAuditOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <h3 style={{ color: '#fde68a', fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>
                        🔍 מאיפה הגיעה התוספת שלי — פירוק מלא ({result.audit.length} פריטים, סה"כ {result.auditSum >= 0 ? '+' : ''}{result.auditSum})
                      </h3>
                      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{auditOpen ? '▲ סגור' : '▼ פתח'}</span>
                    </div>
                    {auditOpen && (
                      <>
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
                          {result.audit.map((a, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, background: a.isBonus ? 'rgba(251,191,36,0.07)' : 'rgba(0,0,0,0.22)', border: '1px solid rgba(71,85,105,0.3)', borderRadius: 8, padding: '6px 10px' }}>
                              <div style={{ minWidth: 0 }}>
                                <span style={{ fontSize: '0.8rem', color: a.isBonus ? '#fde68a' : '#e2e8f0' }}>{a.text}</span>
                                {a.answer && <span style={{ fontSize: '0.74rem', color: '#94a3b8', marginRight: 6 }}>· הניחוש: {a.answer}</span>}
                              </div>
                              <span style={{ flexShrink: 0, fontSize: '0.82rem', fontWeight: 800, color: a.d > 0 ? '#34d399' : '#f87171' }}>{a.d > 0 ? '+' : ''}{a.d}</span>
                            </div>
                          ))}
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.7rem', marginTop: 8 }}>
                          הפירוק מגיע ישירות מהמנוע הרשמי (ScoreService), כולל שורות הבונוס (מסומנות בזהוב). הסכום = בדיוק התוספת שלך בטבלה.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SimTable({ table, me }) {
  const meIdx = table.findIndex(r => r.name === me);
  const idxSet = new Set();
  for (let i = 0; i < Math.min(10, table.length); i++) idxSet.add(i);
  if (meIdx >= 0) for (let i = Math.max(0, meIdx - 3); i <= Math.min(table.length - 1, meIdx + 3); i++) idxSet.add(i);
  const idxs = [...idxSet].sort((a, b) => a - b);
  const rows = []; let prev = -1;
  idxs.forEach(i => {
    if (prev >= 0 && i > prev + 1) rows.push({ gap: true, key: `g${i}` });
    rows.push({ ...table[i], key: table[i].name });
    prev = i;
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map(r => r.gap ? (
        <div key={r.key} style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem' }}>⋮</div>
      ) : (
        <div key={r.key} style={{
          display: 'grid', gridTemplateColumns: '36px 1fr 62px 58px 52px', gap: 6, alignItems: 'center',
          background: r.name === me ? 'rgba(251,191,36,0.12)' : 'rgba(0,0,0,0.22)',
          border: `1px solid ${r.name === me ? '#fbbf24' : 'rgba(71,85,105,0.3)'}`,
          borderRadius: 8, padding: '5px 8px',
        }}>
          <span style={{ color: r.simPos <= 3 ? '#fbbf24' : '#94a3b8', fontWeight: 800, fontSize: '0.84rem' }}>{r.simPos}</span>
          <span style={{ color: r.name === me ? '#fde68a' : '#f1f5f9', fontWeight: r.name === me ? 800 : 500, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name === me ? '🙋 ' : ''}{r.name}
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.8rem' }}>{r.simScore}</span>
          <span style={{ color: r.delta > 0 ? '#34d399' : '#64748b', fontSize: '0.74rem', fontWeight: 700 }}>{r.delta > 0 ? `+${r.delta}` : '—'}</span>
          {r.offPos && r.offPos !== r.simPos ? (
            r.simPos < r.offPos
              ? <span style={{ color: '#34d399', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 2 }}><TrendingUp style={{ width: 11, height: 11 }} />{r.offPos - r.simPos}</span>
              : <span style={{ color: '#f87171', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 2 }}><TrendingDown style={{ width: 11, height: 11 }} />{r.simPos - r.offPos}</span>
          ) : <span style={{ color: '#475569', fontSize: '0.72rem' }}>—</span>}
        </div>
      ))}
    </div>
  );
}
