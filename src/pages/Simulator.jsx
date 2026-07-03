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
  try {
    const { count, error } = await supabase.from('latest_predictions')
      .select('question_id', { count: 'exact', head: true }).eq('game_id', gameId);
    if (error || count == null) throw error || new Error('no view');
    return { src: 'latest_predictions', count };
  } catch {
    const { count } = await supabase.from('predictions')
      .select('id', { count: 'exact', head: true }).eq('game_id', gameId);
    return { src: 'predictions', count: count || 0 };
  }
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

  // 1) אם קיים המטמון המלא של מסך הסטטיסטיקות — משתמשים בו (אפס רשת) ומסננים בזיכרון
  try {
    const full = await idbGet(PREDS_KEY(gameId));
    if (full && full.v === 1 && Date.now() - (full.ts || 0) <= PREDS_TTL_MS) {
      const rows = decodePreds(full).filter(p => qidSet.has(p.question_id));
      if (rows.length) { onStage?.('מטמון ✓'); _memPreds[gameId] = rows; return rows; }
    }
  } catch { /* — */ }

  // 2) מטמון ייעודי של הסימולטור
  const SIM_KEY = `tlt_simpreds_v1_${gameId}`;
  const { src } = await resolvePredsSource(gameId);
  const { count } = await supabase.from(src).select('question_id', { count: 'exact', head: true })
    .eq('game_id', gameId).in('question_id', qids);
  if (!count) return [];
  try {
    const c = await idbGet(SIM_KEY);
    if (c && c.v === 1 && c.src === src && c.count === count && c.nq === qids.length && Date.now() - (c.ts || 0) <= PREDS_TTL_MS) {
      const dec = decodePreds(c);
      if (dec.length === count) { onStage?.('מטמון ✓'); _memPreds[gameId] = dec; return dec; }
    }
  } catch { /* — */ }

  // 3) הורדה ממוקדת — רק השאלות הרלוונטיות (~רבע מהנפח המלא)
  onStage?.(`מוריד ${count.toLocaleString()} ניחושים רלוונטיים (שאלות פתוחות בלבד)...`);
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
  const enc = encodePreds(all, count); enc.src = src; enc.nq = qids.length;
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
  const [includeSpecials, setIncludeSpecials] = useState(true);
  const [overrides, setOverrides] = useState({});
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

  const compute = (who, ovr, withSpecials) => {
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
        const mine = myPred[q.id];
        if (mine && String(mine).trim() !== '') {
          specials.push({ id: q.id, text: q.question_text, answer: mine, pts: q.possible_points || 0 });
          if (fillSpecials) q.actual_result = mine;
        }
      });
      return { simQ, specials };
    };
    const { simQ, specials: specialsList } = buildSim(withSpecials);

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
    specialsList.forEach(sp => { sp.gain = withSpecials ? (gainByQid[sp.id] ?? 0) : null; });

    let engineDiffs = 0;
    table.forEach(r => { if (Math.abs(totalOf(baseAll[r.name]) - r.official) > 0.001) engineDiffs++; });
    const meRow = table.find(r => r.name === who) || null;
    return { table, meRow, matches, champion, runnerUp, specialsList, withSpecials, engineDiffs, audit, auditSum, bonusDelta, stageBonus };
  };

  const run = (ovr = overrides, withSpecials = includeSpecials) => {
    if (!me) return;
    setSimulating(true);
    setTimeout(() => {
      try { setResult(compute(me, ovr, withSpecials)); }
      catch (e) { console.error(e); setResult({ error: 'הסימולציה נכשלה: ' + (e?.message || '') }); }
      setSimulating(false);
    }, 40);
  };
  const clickWinner = (match, team) => {
    if (match.src === 'real' || simulating) return;
    const next = { ...overrides, [match.key]: team };
    setOverrides(next); run(next, includeSpecials);
  };
  const resetOverrides = () => { setOverrides({}); run({}, includeSpecials); };
  const toggleSpecials = () => { const v = !includeSpecials; setIncludeSpecials(v); if (result && !result.error) run(overrides, v); };

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
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>בחר תרחיש — וראה את הדירוג זז. לחץ על קבוצה בעץ כדי לשנות הכרעה.</p>
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
            <CardContent style={{ padding: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <label style={{ color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 700 }}>אני:</label>
              <select value={me} onChange={e => { setMe(e.target.value); setResult(null); setOverrides({}); }}
                style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 8, padding: '8px 12px', fontSize: '0.9rem', minWidth: 220 }}>
                <option value="">בחר משתתף...</option>
                {participantNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button style={{ ...S.btn, opacity: me && !simulating ? 1 : 0.5 }} disabled={!me || simulating} onClick={() => run()}>
                {simulating ? <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> : <Wand2 style={{ width: 18, height: 18 }} />}
                התרחיש המושלם שלי
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: '0.82rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeSpecials} onChange={toggleSpecials} />
                השאלות הפתוחות נופלות לפי התשובות שלי
              </label>
              {Object.keys(overrides).length > 0 && (
                <button onClick={resetOverrides} style={{ background: 'transparent', border: '1px solid rgba(148,163,184,0.4)', color: '#cbd5e1', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <RotateCcw style={{ width: 13, height: 13 }} /> חזרה לתרחיש המושלם
                </button>
              )}
            </CardContent>
          </Card>

          {result?.error && (
            <Card style={S.card}><CardContent style={{ padding: 18 }}><p style={{ color: '#f87171' }}>{result.error}</p></CardContent></Card>
          )}

          {result && !result.error && (
            <>
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
                      <span style={{ color: '#fbbf24' }}>🔒 צהוב = תוצאת אמת</span> • <span style={{ color: '#6ee7b7' }}>ירוק = אוטומטי (הטוב עבורך)</span> • <span style={{ color: '#d8b4fe' }}>✎ סגול = הכרעה ששינית בלחיצה</span> • תג זהוב = כמה שווה לך
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
                                {(m.src !== 'auto' || m.myGain > 0) && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, minHeight: 13 }}>
                                  <span style={{ fontSize: '0.6rem', color: m.src === 'real' ? '#fbbf24' : '#c084fc', fontWeight: 700 }}>
                                    {m.src === 'real' ? <Lock style={{ width: 9, height: 9 }} /> : m.src === 'override' ? '✎' : ''}
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
                      ✨ השאלות הפתוחות ({result.specialsList.length}) — {result.withSpecials ? 'נופלות לפי התשובות שלך' : 'לא נכללות בתרחיש'}
                    </h3>
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{specOpen ? '▲ סגור' : '▼ פתח'}</span>
                  </div>
                  {specOpen && (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 5, maxHeight: 360, overflowY: 'auto' }}>
                      {result.specialsList.map(sp => (
                        <div key={sp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '6px 10px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.79rem', color: '#e2e8f0' }}>{sp.text}</div>
                            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>הניחוש: <b style={{ color: '#6ee7b7' }}>{sp.answer}</b></div>
                          </div>
                          <span style={{ flexShrink: 0, fontSize: '0.8rem', fontWeight: 800, color: '#34d399', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 999, padding: '2px 9px' }}>
                            {sp.gain != null ? `+${sp.gain}` : `עד +${sp.pts}`}
                          </span>
                        </div>
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
