import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '@/components/contexts/GameContext';
import { supabase } from '@/api/supabaseClient';
import { calculateAllParticipantsScores } from '@/components/scoring/ScoreService';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Wand2, Trophy, TrendingUp, TrendingDown, ShieldAlert } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   🎮 סימולטור "מה אם" — שלב א': התרחיש המושלם שלי
   ─────────────────────────────────────────────────────────────────
   • סימולציה בלבד: רץ בדפדפן על עותק בזיכרון. אפס כתיבה למסד,
     אפס שינוי בניקוד האמיתי, אפס נגיעה ב-ScoreService (ייבוא בלבד).
   • שיטת ההפרשים: הניקוד המדומה = הניקוד הרשמי (rankings) + ההפרש
     שהמנוע הרשמי מחשב בין "עכשיו" ל"תרחיש" — כך סטיות מנוע מתקזזות.
   ═══════════════════════════════════════════════════════════════════ */

const WC_GAME_ID = '30032806-6216-496f-ac32-fb628e181742';

// סדר הבראקט הרשמי (32 נבחרות) — זהה למסך הסטטיסטיקות
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

const STAGE_TIDS = ['T19','T21','T23','T25']; // עולות: שמינית / רבע / חצי / גמר
const STAGE_NAMES = { T19:'עולות לשמינית', T21:'עולות לרבע', T23:'עולות לחצי', T25:'עולות לגמר' };

const normT = s => String(s ?? '')
  .replace(/\s*\([^)]*\)\s*/g,' ')
  .replace(/["'׳"]/g,'')
  .replace(/\s+/g,' ')
  .trim().toLowerCase();

/* ── 💾 מטמון הניחושים המתמיד — אותו פורמט בדיוק כמו מסך הסטטיסטיקות (שיתוף מלא, אפס Egress כפול) ── */
const PRED_COLS = 'id,question_id,participant_name,text_prediction,home_prediction,away_prediction,created_at';
const PREDS_LS_KEY = gid => `tlt_preds_v1_${gid}`;
const PREDS_TTL_MS = 12 * 60 * 60 * 1000;
const decodePreds = c => c.r.map((row, i) => ({
  id: `c${i}`, question_id: c.q[row[0]], participant_name: c.n[row[1]],
  text_prediction: row[2], home_prediction: row[3], away_prediction: row[4],
  created_at: row[5] ? new Date(row[5]).toISOString() : null,
}));
const encodePreds = (all, count) => {
  const q=[], qm={}, n=[], nm={};
  const r = all.map(p => {
    let qi = qm[p.question_id]; if (qi === undefined) { qi = q.length; qm[p.question_id] = qi; q.push(p.question_id); }
    let ni = nm[p.participant_name]; if (ni === undefined) { ni = n.length; nm[p.participant_name] = ni; n.push(p.participant_name); }
    return [qi, ni, p.text_prediction ?? null, p.home_prediction ?? null, p.away_prediction ?? null, p.created_at ? new Date(p.created_at).getTime() : 0];
  });
  return { v: 1, ts: Date.now(), count, q, n, r };
};

async function loadAllPredictions(gameId) {
  const { count } = await supabase.from('predictions').select('id', { count: 'exact', head: true }).eq('game_id', gameId);
  if (!count) return [];
  try {
    const raw = localStorage.getItem(PREDS_LS_KEY(gameId));
    if (raw) {
      const c = JSON.parse(raw);
      if (c?.v === 1 && c.count === count && Date.now() - (c.ts || 0) <= PREDS_TTL_MS) {
        const dec = decodePreds(c);
        if (dec.length === count) return dec;
      }
    }
  } catch { /* המשך לטעינה מלאה */ }
  const all = [];
  const PAGE = 1000;
  for (let from = 0; from < count; from += PAGE) {
    const { data, error } = await supabase.from('predictions').select(PRED_COLS)
      .eq('game_id', gameId).order('id', { ascending: true }).range(from, Math.min(from + PAGE - 1, count - 1));
    if (error) throw error;
    all.push(...(data || []));
  }
  try { localStorage.setItem(PREDS_LS_KEY(gameId), JSON.stringify(encodePreds(all, count))); } catch { /* מכסה מלאה — לא נורא */ }
  return all;
}

async function loadAllQuestions(gameId) {
  const all = [];
  const PAGE = 1000;
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

  const [loading, setLoading]       = useState(true);
  const [loadErr, setLoadErr]       = useState('');
  const [questions, setQuestions]   = useState([]);
  const [preds, setPreds]           = useState([]);
  const [rankRows, setRankRows]     = useState([]);
  const [koResults, setKoResults]   = useState({});
  const [me, setMe]                 = useState('');
  const [simulating, setSimulating] = useState(false);
  const [result, setResult]         = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentGame?.id) return;
      setLoading(true); setLoadErr(''); setResult(null); setMe('');
      try {
        const [qs, ps, rk, ko] = await Promise.all([
          loadAllQuestions(currentGame.id),
          loadAllPredictions(currentGame.id),
          supabase.from('rankings').select('participant_name,current_score').eq('game_id', currentGame.id).limit(100000).then(r => r.data || []),
          supabase.from('games').select('ko_results').eq('id', currentGame.id).single().then(r => r.data?.ko_results || {}).catch(() => ({})),
        ]);
        if (cancelled) return;
        setQuestions(qs); setPreds(ps); setRankRows(rk); setKoResults(ko);
      } catch (e) {
        if (!cancelled) setLoadErr('טעינת הנתונים נכשלה — נסה לרענן. ' + (e?.message || ''));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentGame?.id]);

  const participantNames = useMemo(() =>
    [...new Set(rankRows.map(r => r.participant_name))].sort((a, b) => a.localeCompare(b, 'he')),
  [rankRows]);

  // דירוג רשמי נוכחי (ניקוד ↓ ואז א'-ב' — זהה למסך הדירוג)
  const officialTable = useMemo(() => {
    const rows = rankRows.map(r => ({ name: r.participant_name, score: Number(r.current_score) || 0 }));
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'he'));
    return rows;
  }, [rankRows]);
  const officialPos = useMemo(() => {
    const m = {}; officialTable.forEach((r, i) => { m[r.name] = i + 1; }); return m;
  }, [officialTable]);

  /* ── מנוע התרחיש ── */
  const runSimulation = () => {
    if (!me) return;
    setSimulating(true); setResult(null);
    setTimeout(() => {
      try { setResult(buildPerfectScenario()); }
      catch (e) { console.error(e); setResult({ error: 'הסימולציה נכשלה: ' + (e?.message || '') }); }
      setSimulating(false);
    }, 60);
  };

  function buildPerfectScenario() {
    // 1) הניחושים שלי (UUID → טקסט) + פורמט שורות למנוע הרשמי
    const latest = {}; // participant -> qid -> text (האחרון לפי created_at)
    preds.forEach(p => {
      const t = (p.home_prediction != null && p.away_prediction != null)
        ? `${p.home_prediction}-${p.away_prediction}` : (p.text_prediction ?? '');
      const key = p.participant_name;
      if (!latest[key]) latest[key] = {};
      const ex = latest[key][p.question_id];
      if (!ex || new Date(p.created_at || 0) > new Date(ex.at || 0)) latest[key][p.question_id] = { t, at: p.created_at };
    });
    const engineRows = [];
    Object.entries(latest).forEach(([name, m]) =>
      Object.entries(m).forEach(([qid, v]) => engineRows.push({ participant_name: name, question_id: qid, text_prediction: v.t })));
    const myPred = {}; Object.entries(latest[me] || {}).forEach(([qid, v]) => { myPred[qid] = v.t; });

    // 2) עדיפות נבחרות עבורי: כמה עמוק ניחשתי שהנבחרת תגיע (אלופה = הכי עמוק)
    const qById = {}; questions.forEach(q => { qById[q.id] = q; });
    const myStageSets = {}; // tid -> Set(norm team)
    STAGE_TIDS.forEach(tid => { myStageSets[tid] = new Set(); });
    questions.forEach(q => {
      if (STAGE_TIDS.includes(q.table_id) && myPred[q.id]) myStageSets[q.table_id].add(normT(myPred[q.id]));
    });
    const champQ = questions.find(q => /זוכה|אלופ/.test(q.question_text || '') && !/סגנ/.test(q.question_text || '') && (q.stage_type !== 'qualifiers'));
    const runnerQ = questions.find(q => /סגנית/.test(q.question_text || '') && (q.stage_type !== 'qualifiers'));
    const myChamp = champQ ? normT(myPred[champQ.id] || '') : '';
    const prio = team => {
      const n = normT(team);
      if (n && n === myChamp) return 6;
      if (myStageSets.T25.has(n)) return 5;
      if (myStageSets.T23.has(n)) return 4;
      if (myStageSets.T21.has(n)) return 3;
      if (myStageSets.T19.has(n)) return 2;
      return 0;
    };

    // 3) פתרון הבראקט: תוצאות אמת (ko_results) קודמות לכל; הכרעות פתוחות — לפי העדיפות שלי
    const realWinner = (h, a) => {
      const v = koResults?.[`${h} - ${a}`]; if (v == null) return null;
      const s = String(v); const m = s.match(/(\d+)\s*-\s*(\d+)/); if (!m) return null;
      const hs = +m[1], as = +m[2];
      if (hs > as) return h; if (as > hs) return a;
      const adv = s.includes('|') ? s.split('|')[1].trim() : '';
      return adv ? (normT(adv) === normT(h) ? h : a) : null;
    };
    const decisions = []; // {stage, home, away, winner, isReal}
    const STAGE_OF_LVL = { 0: '1/16', 1: 'שמינית', 2: 'רבע', 3: 'חצי', 4: 'גמר' };
    const memo = {};
    const simWinner = (lvl, idx) => {
      const key = `${lvl}:${idx}`;
      if (key in memo) return memo[key];
      let h, a;
      if (lvl === 0) { [h, a] = WC_BRACKET_ORDER[idx]; }
      else { h = simWinner(lvl - 1, idx * 2); a = simWinner(lvl - 1, idx * 2 + 1); }
      if (!h || !a) return (memo[key] = null);
      const real = realWinner(h, a);
      const w = real || (prio(a) > prio(h) ? a : h);
      decisions.push({ stage: STAGE_OF_LVL[lvl], home: h, away: a, winner: w, isReal: !!real });
      return (memo[key] = w);
    };
    const champion = simWinner(4, 0);
    const finalists   = [simWinner(3, 0), simWinner(3, 1)].filter(Boolean);
    const semifinal   = [0,1,2,3].map(i => simWinner(2, i)).filter(Boolean);
    const quarter     = [0,1,2,3,4,5,6,7].map(i => simWinner(1, i)).filter(Boolean);
    const r16         = WC_BRACKET_ORDER.map((_, i) => simWinner(0, i)).filter(Boolean);
    const runnerUp    = finalists.find(t => normT(t) !== normT(champion || '')) || null;

    // 4) בניית עותק השאלות של התרחיש
    const filled = { stages: {}, specials: 0 };
    const stageTeams = { T19: r16, T21: quarter, T23: semifinal, T25: finalists };
    const simQuestions = questions.map(q => ({ ...q }));
    const isEmpty = v => v == null || String(v).trim() === '' || v === '__CLEAR__';
    STAGE_TIDS.forEach(tid => {
      const slots = simQuestions.filter(q => q.table_id === tid);
      if (!slots.length) return;
      const existing = new Set(slots.filter(q => !isEmpty(q.actual_result)).map(q => normT(q.actual_result)));
      const toAssign = (stageTeams[tid] || []).filter(t => !existing.has(normT(t)));
      const emptySlots = slots.filter(q => isEmpty(q.actual_result));
      emptySlots.forEach((q, i) => { if (toAssign[i]) { q.actual_result = toAssign[i]; } });
      filled.stages[tid] = toAssign.slice(0, emptySlots.length);
    });
    if (champQ && champion) { const q = simQuestions.find(x => x.id === champQ.id); if (q && isEmpty(q.actual_result)) q.actual_result = champion; }
    if (runnerQ && runnerUp) { const q = simQuestions.find(x => x.id === runnerQ.id); if (q && isEmpty(q.actual_result)) q.actual_result = runnerUp; }
    // שאלות עצמאיות פתוחות: התשובה שלי מתגשמת (אופטימלי מוכח עבורי)
    simQuestions.forEach(q => {
      if (q.table_id === 'T1' || STAGE_TIDS.includes(q.table_id)) return;
      if (!isEmpty(q.actual_result)) return;
      if (champQ && q.id === champQ.id) return;
      if (runnerQ && q.id === runnerQ.id) return;
      const mine = myPred[q.id];
      if (mine && String(mine).trim() !== '') { q.actual_result = mine; filled.specials++; }
    });

    // 5) ניקוד בשיטת ההפרשים — המנוע הרשמי על "עכשיו" ועל "התרחיש"
    const totalOf = r => (r && typeof r === 'object' && 'total' in r) ? (Number(r.total) || 0) : (Number(r) || 0);
    const baseAll = calculateAllParticipantsScores(questions, engineRows);
    const simAll  = calculateAllParticipantsScores(simQuestions, engineRows);
    const officialMap = {}; rankRows.forEach(r => { officialMap[r.participant_name] = Number(r.current_score) || 0; });

    const table = participantNames.map(name => {
      const base = totalOf(baseAll[name]);
      const sim  = totalOf(simAll[name]);
      const official = officialMap[name] ?? base;
      return { name, official, simScore: official + (sim - base), delta: sim - base };
    });
    table.sort((a, b) => b.simScore - a.simScore || a.name.localeCompare(b.name, 'he'));
    table.forEach((r, i) => { r.simPos = i + 1; r.offPos = officialPos[r.name] || null; });

    // אימות שקוף: כמה מנוע-התצוגה סוטה מהניקוד הרשמי (מידע בלבד — שיטת ההפרשים מנטרלת)
    let engineDiffs = 0;
    table.forEach(r => { const b = totalOf(baseAll[r.name]); if (Math.abs(b - r.official) > 0.001) engineDiffs++; });

    const meRow = table.find(r => r.name === me) || null;
    return { table, meRow, decisions, filled, champion, runnerUp, engineDiffs };
  }

  /* ── תצוגה ── */
  const S = {
    page: { direction: 'rtl', padding: '16px', maxWidth: 1100, margin: '0 auto' },
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
      {/* כותרת */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.7rem' }}>🎮</span>
          <div>
            <h1 style={{ color: '#f8fafc', fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>סימולטור "מה אם"</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>מה יקרה לדירוג אם הניחושים שלך יתגשמו?</p>
          </div>
        </div>
        <span style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid #a855f7', color: '#d8b4fe', borderRadius: 999, padding: '5px 14px', fontSize: '0.78rem', fontWeight: 700 }}>
          🧪 סימולציה בלבד — לא משנה שום נתון אמיתי
        </span>
      </div>

      {loading ? (
        <Card style={S.card}><CardContent style={{ padding: 30, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 className="animate-spin" style={{ width: 20, height: 20, color: '#a855f7' }} />
          <span style={{ color: '#94a3b8' }}>טוען נתונים...</span>
        </CardContent></Card>
      ) : loadErr ? (
        <Card style={S.card}><CardContent style={{ padding: 24 }}><p style={{ color: '#f87171' }}>{loadErr}</p></CardContent></Card>
      ) : (
        <>
          {/* בחירה והרצה */}
          <Card style={{ ...S.card, marginBottom: 14 }}>
            <CardContent style={{ padding: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <label style={{ color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 700 }}>אני:</label>
              <select value={me} onChange={e => { setMe(e.target.value); setResult(null); }}
                style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 8, padding: '8px 12px', fontSize: '0.9rem', minWidth: 220 }}>
                <option value="">בחר משתתף...</option>
                {participantNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button style={{ ...S.btn, opacity: me && !simulating ? 1 : 0.5 }} disabled={!me || simulating} onClick={runSimulation}>
                {simulating ? <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> : <Wand2 style={{ width: 18, height: 18 }} />}
                התרחיש המושלם שלי
              </button>
              <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                כל ההכרעות הפתוחות נופלות לטובתך: העולות שניחשת עולות (בכפוף לעץ האמיתי), והתשובות שלך לשאלות הפתוחות מתגשמות.
              </span>
            </CardContent>
          </Card>

          {result?.error && (
            <Card style={S.card}><CardContent style={{ padding: 18 }}><p style={{ color: '#f87171' }}>{result.error}</p></CardContent></Card>
          )}

          {result && !result.error && (
            <>
              {/* הכרטיס שלי */}
              {result.meRow && (
                <Card style={{ ...S.card, marginBottom: 14, border: '1px solid rgba(251,191,36,0.5)' }}>
                  <CardContent style={{ padding: 18 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
                      <Trophy style={{ width: 34, height: 34, color: '#fbbf24' }} />
                      <div>
                        <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>בתרחיש המושלם שלך</div>
                        <div style={{ color: '#f8fafc', fontSize: '1.5rem', fontWeight: 800 }}>
                          מקום {result.meRow.simPos}
                          {result.meRow.offPos && result.meRow.simPos < result.meRow.offPos && (
                            <span style={{ color: '#34d399', fontSize: '1rem', marginRight: 8 }}>
                              <TrendingUp style={{ width: 16, height: 16, display: 'inline' }} /> טיפוס של {result.meRow.offPos - result.meRow.simPos} מקומות (מ-{result.meRow.offPos})
                            </span>
                          )}
                          {result.meRow.offPos && result.meRow.simPos >= result.meRow.offPos && (
                            <span style={{ color: '#94a3b8', fontSize: '0.95rem', marginRight: 8 }}>(היום: {result.meRow.offPos})</span>
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

              {/* התרחיש עצמו */}
              <Card style={{ ...S.card, marginBottom: 14 }}>
                <CardContent style={{ padding: 18 }}>
                  <h3 style={{ color: '#d8b4fe', fontSize: '0.95rem', fontWeight: 800, margin: '0 0 10px' }}>📜 מה צריך לקרות</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
                    {result.decisions.filter(d => !d.isReal).map((d, i) => (
                      <div key={i} style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, padding: '7px 10px', fontSize: '0.8rem' }}>
                        <span style={{ color: '#94a3b8' }}>{d.stage}: </span>
                        <span style={{ color: '#f1f5f9' }}>{d.home} — {d.away} ← </span>
                        <span style={{ color: '#34d399', fontWeight: 700 }}>{d.winner} עולה</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, color: '#cbd5e1', fontSize: '0.82rem' }}>
                    {result.champion && <span>🏆 אלופה: <b style={{ color: '#fbbf24' }}>{result.champion}</b></span>}
                    {result.runnerUp && <span>🥈 סגנית: <b>{result.runnerUp}</b></span>}
                    {result.filled.specials > 0 && <span>✨ {result.filled.specials} שאלות פתוחות נפלו לפי התשובות שלך</span>}
                  </div>
                </CardContent>
              </Card>

              {/* הטבלה המדומה */}
              <Card style={S.card}>
                <CardContent style={{ padding: 18 }}>
                  <h3 style={{ color: '#d8b4fe', fontSize: '0.95rem', fontWeight: 800, margin: '0 0 10px' }}>🏁 הדירוג בתרחיש הזה</h3>
                  <SimTable table={result.table} me={me} />
                  {result.engineDiffs > 0 && (
                    <p style={{ color: '#64748b', fontSize: '0.7rem', marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <ShieldAlert style={{ width: 13, height: 13 }} />
                      הניקוד מחושב כהפרש מעל הניקוד הרשמי, ולכן מדויק גם כשמנוע התצוגה סוטה קלות ({result.engineDiffs} משתתפים).
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* טבלה מדומה: עשירייה ראשונה + חלון סביבי */
function SimTable({ table, me }) {
  const meIdx = table.findIndex(r => r.name === me);
  const idxSet = new Set();
  for (let i = 0; i < Math.min(10, table.length); i++) idxSet.add(i);
  if (meIdx >= 0) for (let i = Math.max(0, meIdx - 3); i <= Math.min(table.length - 1, meIdx + 3); i++) idxSet.add(i);
  const idxs = [...idxSet].sort((a, b) => a - b);

  const rows = [];
  let prev = -1;
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
          display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px 80px', gap: 8, alignItems: 'center',
          background: r.name === me ? 'rgba(251,191,36,0.12)' : 'rgba(0,0,0,0.22)',
          border: `1px solid ${r.name === me ? '#fbbf24' : 'rgba(71,85,105,0.3)'}`,
          borderRadius: 8, padding: '6px 10px',
        }}>
          <span style={{ color: r.simPos <= 3 ? '#fbbf24' : '#94a3b8', fontWeight: 800, fontSize: '0.88rem' }}>{r.simPos}</span>
          <span style={{ color: r.name === me ? '#fde68a' : '#f1f5f9', fontWeight: r.name === me ? 800 : 500, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name === me ? '🙋 ' : ''}{r.name}
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.84rem' }}>{r.simScore}</span>
          <span style={{ color: r.delta > 0 ? '#34d399' : '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>{r.delta > 0 ? `+${r.delta}` : '—'}</span>
          {r.offPos && r.offPos !== r.simPos ? (
            r.simPos < r.offPos
              ? <span style={{ color: '#34d399', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}><TrendingUp style={{ width: 12, height: 12 }} />{r.offPos - r.simPos}</span>
              : <span style={{ color: '#f87171', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}><TrendingDown style={{ width: 12, height: 12 }} />{r.simPos - r.offPos}</span>
          ) : <span style={{ color: '#475569', fontSize: '0.76rem' }}>—</span>}
        </div>
      ))}
    </div>
  );
}
