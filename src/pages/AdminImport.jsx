import { useState, useCallback } from "react";
import * as db from "@/api/entities";
import { useGame } from "@/components/contexts/GameContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Loader2, ChevronDown, ChevronUp } from "lucide-react";

// ─── text helpers ─────────────────────────────────────────────────────────────
function cleanText(s) {
  if (!s) return '';
  return s
    .replace(/\(\*+\)/g, '')          // remove (*)  (**) (***) (****)
    .replace(/["'"״'']/g, '')          // remove quotes
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeTeam(s) {
  if (!s) return '';
  return s.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
}
function wordOverlap(a, b) {
  const stop = new Set(['את','של','עם','אם','או','על','בין','ב','ל','מ','כ','הכי','ביותר','אחד','אחת','כל','כולל','לא','שלב','שיובקע']);
  const wa = new Set(cleanText(a).split(' ').filter(w => w.length > 1 && !stop.has(w)));
  const wb = new Set(cleanText(b).split(' ').filter(w => w.length > 1 && !stop.has(w)));
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSVText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map(line => {
    const cols = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        // Only toggle if at start/end of field (next/prev char is comma or EOL)
        const prev = i === 0 ? ',' : line[i-1];
        const next = i === line.length-1 ? ',' : line[i+1];
        if (!inQ && prev === ',') { inQ = true; }
        else if (inQ && (next === ',' || i === line.length-1)) { inQ = false; }
        else { cur += c; }  // embedded quote — treat as literal
      } else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    cols.push(cur.trim()); return cols;
  });
}

// ─── Extract predictions ──────────────────────────────────────────────────────
function extractPredictions(rows) {
  const safe = (r, c) => (rows[r]?.[c] || '').trim();
  const name = safe(2, 4);
  const preds = [];

  // T2 Q1 main + sub
  if (safe(13,3)) preds.push({ label:'T2 (1) שחקן',    csvText:safe(13,1), value:safe(13,3),  section:'T2' });
  if (safe(13,8)) preds.push({ label:'T2 (1) שערים',   csvText:safe(13,7), value:safe(13,8),  section:'T2', subOf:'Q1', parentCsvText:safe(13,1) });
  // T2 Q2 main + sub
  if (safe(15,4)) preds.push({ label:'T2 (2) קבוצה',   csvText:safe(15,1), value:safe(15,4),  section:'T2' });
  if (safe(15,7)) preds.push({ label:'T2 (2) שערים',   csvText:safe(15,6), value:safe(15,7),  section:'T2', subOf:'Q2', parentCsvText:safe(15,1) });
  // T2 Q3 main + sub
  if (safe(17,4)) preds.push({ label:'T2 (3) קבוצה',   csvText:safe(17,1), value:safe(17,4),  section:'T2' });
  if (safe(17,7)) preds.push({ label:'T2 (3) פנדלים',  csvText:safe(17,6), value:safe(17,7),  section:'T2', subOf:'Q3', parentCsvText:safe(17,1) });
  // T2 Q4–Q33 (col6)
  for (let i = 19; i < 79; i += 2) {
    const num = safe(i,0); if (!num.startsWith('(')) continue;
    const v = safe(i,6); if (v) preds.push({ label:`T2 ${num}`, csvText:safe(i,1), value:v, section:'T2' });
  }

  // T3 matches
  for (let i = 83; i < 101; i++) {
    const home=safe(i,3), away=safe(i,5), hs=safe(i,6), as_=safe(i,8);
    if (home && away && /^\d+$/.test(hs) && /^\d+$/.test(as_))
      preds.push({ label:`T3: ${normalizeTeam(home)}-${normalizeTeam(away)}`,
        type:'match', home:normalizeTeam(home), away:normalizeTeam(away),
        value:`${hs}-${as_}`, section:'T3' });
  }

  // T4 שמינית qualifiers (value = team name)
  for (let i = 102; i < 115; i++) {
    const slot=safe(i,2), team=safe(i,3);
    if (/^\d+$/.test(slot) && team && !team.includes('שם'))
      preds.push({ label:`T4 מקום ${slot}`, type:'qualifier',
        slot:parseInt(slot), team:normalizeTeam(team), value:normalizeTeam(team), section:'T4' });
  }

  // T5 שמינית special (col7)
  for (let i = 115; i < 136; i += 2) {
    const num=safe(i,0); if (!num.startsWith('(')) continue;
    const v=safe(i,7); if (v) preds.push({ label:`T5 ${num}`, csvText:safe(i,1), value:v, section:'T5' });
  }

  // T6 רבע qualifiers
  for (let i = 140; i < 152; i++) {
    const slot=safe(i,2), team=safe(i,3);
    if (/^\d+$/.test(slot) && team && !team.includes('שם'))
      preds.push({ label:`T6 מקום ${slot}`, type:'qualifier',
        slot:parseInt(slot), team:normalizeTeam(team), value:normalizeTeam(team), section:'T6' });
  }

  // T7 רבע special (col7)
  for (let i = 149; i < 170; i += 2) {
    const num=safe(i,0); if (!num.startsWith('(')) continue;
    const v=safe(i,7); if (v) preds.push({ label:`T7 ${num}`, csvText:safe(i,1), value:v, section:'T7' });
  }

  // T8 חצי qualifiers
  for (let i = 174; i < 184; i++) {
    const slot=safe(i,2), team=safe(i,3);
    if (/^\d+$/.test(slot) && team && !team.includes('שם'))
      preds.push({ label:`T8 מקום ${slot}`, type:'qualifier',
        slot:parseInt(slot), team:normalizeTeam(team), value:normalizeTeam(team), section:'T8' });
  }

  // T9 חצי special (col7)
  for (let i = 181; i < 202; i += 2) {
    const num=safe(i,0); if (!num.startsWith('(')) continue;
    const v=safe(i,7); if (v) preds.push({ label:`T9 ${num}`, csvText:safe(i,1), value:v, section:'T9' });
  }

  // T10 גמר special (col7)
  for (let i = 207; i < 245; i += 2) {
    const num=safe(i,0); if (!num.startsWith('(')) continue;
    const v=safe(i,7); if (v) preds.push({ label:`T10 ${num}`, csvText:safe(i,1), value:v, section:'T10' });
  }

  return { name, preds };
}

// ─── Matcher ──────────────────────────────────────────────────────────────────
function buildSubMap(questions) {
  const subMap = {};
  for (const q of questions) {
    const qid = String(q.question_id || '');
    if (qid.includes('.')) {
      const parent = qid.split('.')[0];
      if (!subMap[parent]) subMap[parent] = [];
      subMap[parent].push(q);
    }
  }
  return subMap;
}

function bestFuzzy(csvText, pool, threshold) {
  const norm = cleanText(csvText || '');
  // exact first
  const exact = pool.find(q => cleanText(q.question_text || '') === norm);
  if (exact) return exact;
  // fuzzy
  let best = null, bestScore = 0;
  for (const q of pool) {
    if (!q.question_text) continue;
    const score = wordOverlap(norm, cleanText(q.question_text));
    if (score > bestScore) { bestScore = score; best = q; }
  }
  return bestScore >= threshold ? best : null;
}

function matchPred(pred, questions, subMap) {
  const sectionPool = questions.filter(q => q.table_id === pred.section);

  // Match
  if (pred.type === 'match') {
    const m = sectionPool.find(q =>
      normalizeTeam(q.home_team || '') === pred.home &&
      normalizeTeam(q.away_team || '') === pred.away);
    if (m) return m;
    // reversed
    const rev = sectionPool.find(q =>
      normalizeTeam(q.home_team || '') === pred.away &&
      normalizeTeam(q.away_team || '') === pred.home);
    if (rev) return { ...rev, _reversed: true };
    return null;
  }

  // Qualifier: sort by question_id within section, pick by slot
  if (pred.type === 'qualifier') {
    const qPool = sectionPool
      .filter(q => !q.home_team)
      .sort((a, b) => (parseFloat(a.question_id)||0) - (parseFloat(b.question_id)||0));
    return qPool[pred.slot - 1] || null;
  }

  // Sub-question: find parent first, then its sub
  if (pred.subOf) {
    const parentQ = bestFuzzy(pred.parentCsvText, sectionPool, 0.65)
                 || bestFuzzy(pred.parentCsvText, questions, 0.70);
    if (parentQ) {
      const parentId = String(parentQ.question_id || '').replace(/\.0$/, '');
      const subs = (subMap[parentId] || []);
      if (subs.length === 1) return subs[0];
      if (subs.length > 1) {
        let best = null, score = 0;
        for (const s of subs) {
          const sc = wordOverlap(cleanText(pred.csvText||''), cleanText(s.question_text||''));
          if (sc > score) { score = sc; best = s; }
        }
        return best;
      }
    }
  }

  // Regular text: try section first (threshold 0.65), then all questions (0.72)
  return bestFuzzy(pred.csvText, sectionPool, 0.65)
      || bestFuzzy(pred.csvText, questions, 0.72);
}

// ─── Component ────────────────────────────────────────────────────────────────
const TC = { T2:'#a78bfa', T3:'#34d399', T4:'#34d399', T5:'#fbbf24',
             T6:'#f97316', T7:'#f87171', T8:'#60a5fa', T9:'#38bdf8', T10:'#f472b6' };

export default function AdminImport() {
  const { currentGame } = useGame();
  const { toast } = useToast();
  const [questions, setQuestions]   = useState([]);
  const [subMap,    setSubMap]      = useState({});
  const [loadingQs, setLoadingQs]   = useState(false);
  const [parsed,    setParsed]      = useState(null);
  const [importing, setImporting]   = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [step,      setStep]        = useState('init');
  const [showMatched, setShowMatched] = useState(false);

  const loadQuestions = useCallback(async () => {
    if (!currentGame) return null;
    setLoadingQs(true);
    try {
      let qs = [], skip = 0;
      while (true) {
        const batch = await db.Question.filter({ game_id: currentGame.id }, null, 5000, skip);
        qs = [...qs, ...batch]; if (batch.length < 5000) break; skip += 5000;
      }
      qs = qs.filter(q => q.table_id !== 'T1');
      const sm = buildSubMap(qs);
      setQuestions(qs); setSubMap(sm);
      toast({ title: `✅ ${qs.length} שאלות נטענו`, duration: 3000 });
      return { qs, sm };
    } catch (err) {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive', duration: 4000 });
      return null;
    } finally { setLoadingQs(false); }
  }, [currentGame]);

  const processFile = (text, qs, sm) => {
    const rows = parseCSVText(text);
    const { name, preds } = extractPredictions(rows);
    const matched = [], unmatched = [];
    for (const pred of preds) {
      const q = matchPred(pred, qs, sm);
      if (q) matched.push({ pred, question: q });
      else    unmatched.push(pred);
    }
    return { name, matched, unmatched };
  };

  const handleSingleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    let qs = questions, sm = subMap;
    if (!qs.length) { const res = await loadQuestions(); if (!res) return; qs=res.qs; sm=res.sm; }
    const text = await file.text();
    setParsed({ single:true, fileName:file.name, ...processFile(text, qs, sm) });
    setStep('preview'); setShowMatched(false);
  };

  const handleAllFiles = async (e) => {
    const files = Array.from(e.target.files); if (!files.length) return;
    let qs = questions, sm = subMap;
    if (!qs.length) { const res = await loadQuestions(); if (!res) return; qs=res.qs; sm=res.sm; }
    const results = [];
    for (const file of files) {
      const text = await file.text();
      results.push({ fileName: file.name, ...processFile(text, qs, sm) });
    }
    const totalMatched   = results.reduce((s,r) => s+r.matched.length,   0);
    const totalUnmatched = results.reduce((s,r) => s+r.unmatched.length, 0);
    setParsed({ bulk:true, results, totalMatched, totalUnmatched });
    setStep('bulk_preview');
  };

  const runImport = async (participants) => {
    setImporting(true);
    let totalInserted=0, totalErrors=0;
    const perParticipant = [];
    try {
      for (const p of participants) {
        if (!p.matched.length) continue;
        const existing = await db.Prediction.filter({ game_id:currentGame.id, participant_name:p.name }, null, 9999);
        for (const x of existing) await db.Prediction.delete(x.id);
        let inserted=0, errors=0;
        for (let i=0; i<p.matched.length; i++) {
          const { pred, question } = p.matched[i];
          try {
            const data = { game_id:currentGame.id, question_id:question.id,
              participant_name:p.name, text_prediction:pred.value,
              created_at:new Date().toISOString() };
            if (pred.type === 'match') {
              let [hs, as_] = pred.value.split('-').map(Number);
              if (question._reversed) [hs, as_] = [as_, hs];
              data.home_prediction = hs; data.away_prediction = as_;
            }
            await db.Prediction.create(data);
            inserted++;
          } catch { errors++; }
          if ((i+1) % 10 === 0) await new Promise(r => setTimeout(r, 50));
        }
        try {
          const gps = await db.GameParticipant.filter({ game_id:currentGame.id, participant_name:p.name }, null, 1);
          if (!gps.length) await db.GameParticipant.create({ game_id:currentGame.id, participant_name:p.name, is_active:true });
        } catch {}
        totalInserted+=inserted; totalErrors+=errors;
        perParticipant.push({ name:p.name, inserted, errors });
      }
      setImportResults({ totalInserted, totalErrors, perParticipant });
      setStep('done');
      toast({ title:`✅ יובאו ${totalInserted} ניחושים`, duration:5000 });
    } catch (err) {
      toast({ title:'שגיאה', description:err.message, variant:'destructive', duration:5000 });
    } finally { setImporting(false); }
  };

  return (
    <div dir="rtl" style={{ minHeight:'100vh', background:'#0f172a', color:'#e2e8f0', padding:'20px', fontFamily:'Arial,sans-serif' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <h1 style={{ fontSize:22, fontWeight:'bold', color:'#06b6d4', marginBottom:20 }}>ייבוא ניחושים מ-CSV</h1>

        {/* Load questions */}
        <div style={{ background:'#1e293b', borderRadius:10, padding:14, marginBottom:14, border:'1px solid #334155' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ color:'#94a3b8', fontSize:13 }}>
              {questions.length ? `✅ ${questions.length} שאלות נטענו` : 'שאלות לא נטענו'}
            </span>
            <Button onClick={loadQuestions} disabled={loadingQs||!currentGame}
              style={{ background:'#0284c7', color:'white', fontSize:13 }}>
              {loadingQs ? <><Loader2 className="w-3 h-3 animate-spin ml-1"/>טוען...</> : 'טען שאלות'}
            </Button>
          </div>
        </div>

        {/* Step 1: single file test */}
        {questions.length > 0 && step === 'init' && (
          <div style={{ background:'#1e293b', borderRadius:10, padding:14, marginBottom:14, border:'2px solid #0284c7' }}>
            <h2 style={{ color:'#38bdf8', fontSize:14, marginBottom:4 }}>שלב 1 — בדיקה עם קובץ בודד</h2>
            <p style={{ color:'#64748b', fontSize:12, marginBottom:10 }}>בחר קובץ אחד לפני ייבוא הכולל</p>
            <input type="file" accept=".csv" onChange={handleSingleFile} style={{ color:'#e2e8f0' }}/>
          </div>
        )}

        {/* Single file preview */}
        {step === 'preview' && parsed?.single && (
          <div style={{ background:'#1e293b', borderRadius:10, padding:16, marginBottom:14, border:'1px solid #334155' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h2 style={{ color:'#06b6d4', fontSize:15 }}>תוצאות: {parsed.name}</h2>
              <div style={{ display:'flex', gap:10 }}>
                <span style={{ background:'#064e3b', color:'#6ee7b7', padding:'3px 10px', borderRadius:4, fontSize:12 }}>✓ {parsed.matched.length} זוהו</span>
                <span style={{ background:parsed.unmatched.length>0?'#450a0a':'#064e3b',
                  color:parsed.unmatched.length>0?'#fca5a5':'#6ee7b7',
                  padding:'3px 10px', borderRadius:4, fontSize:12 }}>
                  {parsed.unmatched.length > 0 ? `✗ ${parsed.unmatched.length} לא זוהו` : '✓ 0 שגיאות'}
                </span>
              </div>
            </div>

            {/* Unmatched */}
            {parsed.unmatched.length > 0 && (
              <div style={{ background:'#1a0808', border:'2px solid #dc2626', borderRadius:8, padding:12, marginBottom:14 }}>
                <h3 style={{ color:'#f87171', fontSize:13, marginBottom:8 }}>⚠️ {parsed.unmatched.length} ניחושים שלא זוהו</h3>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#450a0a' }}>
                      {['#','קטגוריה','שאלה מה-CSV','ניחוש'].map(h =>
                        <th key={h} style={{ padding:'4px 8px', color:'#fca5a5', textAlign:'right' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.unmatched.map((u,i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #450a0a' }}>
                        <td style={{ padding:'4px 8px', color:'#64748b' }}>{i+1}</td>
                        <td style={{ padding:'4px 8px', color:TC[u.section]||'#fbbf24', whiteSpace:'nowrap' }}>{u.label}</td>
                        <td style={{ padding:'4px 8px', color:'#fca5a5' }}>
                          {u.type==='match' ? `${u.home} - ${u.away}` :
                           u.type==='qualifier' ? `מקום ${u.slot}: ${u.team}` :
                           (u.csvText||'').slice(0,90)}
                        </td>
                        <td style={{ padding:'4px 8px', color:'#f1f5f9', fontWeight:'bold', direction:'ltr', textAlign:'left' }}>"{u.value}"</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ color:'#64748b', fontSize:11, marginTop:8 }}>📩 שלח לי צילום מסך ואני אתקן</p>
              </div>
            )}

            {/* Matched table */}
            <button onClick={() => setShowMatched(!showMatched)}
              style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:12,
                display:'flex', alignItems:'center', gap:4, marginBottom:8 }}>
              {showMatched ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
              {showMatched ? 'הסתר' : 'הצג'} ניחושים שזוהו ({parsed.matched.length}) — בדוק שהתשובות נכונות
            </button>
            {showMatched && (
              <div style={{ maxHeight:500, overflowY:'auto', border:'1px solid #334155', borderRadius:8, marginBottom:12 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, background:'#0f172a' }}>
                    <tr>
                      {['#','שלב','q_id','שאלה ב-DB','ניחוש'].map(h =>
                        <th key={h} style={{ padding:'5px 10px', color:'#64748b', textAlign:'right', borderBottom:'1px solid #334155' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.matched.map(({pred,question},i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #1e293b', background:i%2===0?'transparent':'#161f2e' }}>
                        <td style={{ padding:'4px 10px', color:'#64748b' }}>{i+1}</td>
                        <td style={{ padding:'4px 10px' }}>
                          <span style={{ background:(TC[question.table_id]||'#94a3b8')+'22',
                            color:TC[question.table_id]||'#94a3b8',
                            padding:'1px 5px', borderRadius:3, fontSize:11 }}>{question.table_id}</span>
                        </td>
                        <td style={{ padding:'4px 10px', color:'#64748b', whiteSpace:'nowrap' }}>{question.question_id}</td>
                        <td style={{ padding:'4px 10px', color:'#e2e8f0' }}>
                          {question.question_text || `${question.home_team||''} - ${question.away_team||''}`}
                        </td>
                        <td style={{ padding:'4px 10px', color:'#6ee7b7', fontWeight:'bold', direction:'ltr', textAlign:'left' }}>
                          {pred.value}{question._reversed ? ' ↔' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Action */}
            {parsed.unmatched.length === 0 ? (
              <div style={{ padding:12, background:'#0f2718', borderRadius:8, border:'1px solid #059669' }}>
                <p style={{ color:'#6ee7b7', fontSize:13, marginBottom:10 }}>✅ זיהוי מושלם! טען את כל הקבצים.</p>
                <label style={{ display:'inline-block', padding:'8px 16px',
                  background:'linear-gradient(135deg,#059669,#047857)',
                  color:'white', borderRadius:6, cursor:'pointer', fontSize:13 }}>
                  <Upload className="w-4 h-4 inline ml-1"/>בחר את כל קבצי ה-CSV (Ctrl+A)
                  <input type="file" accept=".csv" multiple onChange={handleAllFiles} style={{ display:'none' }}/>
                </label>
              </div>
            ) : (
              <p style={{ color:'#f87171', fontSize:12, marginTop:10 }}>
                ⛔ תקן את {parsed.unmatched.length} השגיאות לפני הייבוא.
              </p>
            )}
          </div>
        )}

        {/* Bulk preview */}
        {step === 'bulk_preview' && parsed?.bulk && (
          <div style={{ background:'#1e293b', borderRadius:10, padding:16, marginBottom:14, border:'1px solid #334155' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h2 style={{ color:'#06b6d4', fontSize:15 }}>ייבוא {parsed.results.length} משתתפים</h2>
              {parsed.totalUnmatched === 0
                ? <span style={{ color:'#6ee7b7', fontSize:13 }}>✅ כל {parsed.totalMatched} ניחושים זוהו!</span>
                : <span style={{ color:'#fca5a5', fontSize:13 }}>⚠️ {parsed.totalUnmatched} לא זוהו</span>}
            </div>
            <div style={{ maxHeight:380, overflowY:'auto', marginBottom:12 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead style={{ position:'sticky', top:0, background:'#0f172a' }}>
                  <tr>{['שם','זוהו','לא זוהו'].map(h =>
                    <th key={h} style={{ padding:'4px 10px', color:'#64748b', textAlign:'right', borderBottom:'1px solid #334155' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {parsed.results.map((r,i) => (
                    <tr key={i} style={{ borderBottom:'1px solid #1e293b' }}>
                      <td style={{ padding:'4px 10px', color:'#f1f5f9' }}>{r.name}</td>
                      <td style={{ padding:'4px 10px', color:'#6ee7b7' }}>{r.matched.length}</td>
                      <td style={{ padding:'4px 10px', color:r.unmatched.length>0?'#fca5a5':'#6ee7b7' }}>{r.unmatched.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.totalUnmatched === 0 ? (
              <Button onClick={() => runImport(parsed.results)} disabled={importing}
                style={{ background:'linear-gradient(135deg,#059669,#047857)', color:'white', padding:'10px 24px' }}>
                {importing
                  ? <><Loader2 className="w-5 h-5 animate-spin ml-2"/>מייבא...</>
                  : <><Upload className="w-5 h-5 ml-2"/>ייבא {parsed.totalMatched} ניחושים ל-{parsed.results.length} משתתפים</>}
              </Button>
            ) : (
              <p style={{ color:'#f87171', fontSize:12 }}>⛔ יש {parsed.totalUnmatched} שגיאות — חזור לשלב 1 לתיקון</p>
            )}
          </div>
        )}

        {/* Done */}
        {step === 'done' && importResults && (
          <div style={{ background:'#064e3b', borderRadius:10, padding:20, border:'1px solid #059669' }}>
            <h2 style={{ color:'#6ee7b7', fontSize:18, marginBottom:10 }}>✅ ייבוא הושלם!</h2>
            <p style={{ color:'#a7f3d0', marginBottom:12 }}>
              יובאו <strong>{importResults.totalInserted}</strong> ניחושים
              {importResults.totalErrors > 0 && ` (${importResults.totalErrors} שגיאות)`}
            </p>
            <div style={{ maxHeight:350, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#065f46' }}>
                    {['משתתף','ניחושים','שגיאות'].map(h =>
                      <th key={h} style={{ padding:'4px 10px', color:'#6ee7b7', textAlign:'right' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {importResults.perParticipant.map((p,i) => (
                    <tr key={i} style={{ borderBottom:'1px solid #065f46' }}>
                      <td style={{ padding:'4px 10px', color:'#d1fae5' }}>{p.name}</td>
                      <td style={{ padding:'4px 10px', color:'#6ee7b7' }}>{p.inserted}</td>
                      <td style={{ padding:'4px 10px', color:p.errors>0?'#fca5a5':'#6ee7b7' }}>{p.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color:'#94a3b8', fontSize:12, marginTop:10 }}>
              עבור ל-AdminResults → "שמור תוצאות" לחישוב דירוג.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
