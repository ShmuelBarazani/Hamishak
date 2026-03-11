import { useState, useCallback } from "react";
import * as db from "@/api/entities";
import { useGame } from "@/components/contexts/GameContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Trash2, Loader2, AlertTriangle, CheckCircle } from "lucide-react";

// ─── text helpers ────────────────────────────────────────────────────────────

function normalizeTeam(s) {
  if (!s) return '';
  return s.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
}

function normalizeText(s) {
  if (!s) return '';
  return s
    .replace(/["'"״'']/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/[?!.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlap(a, b) {
  const wa = new Set(normalizeText(a).split(' ').filter(w => w.length > 1));
  const wb = new Set(normalizeText(b).split(' ').filter(w => w.length > 1));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

// ─── CSV parser ──────────────────────────────────────────────────────────────

function parseCSVText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map(line => {
    const cols = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    cols.push(cur.trim());
    return cols;
  });
}

function extractPredictions(rows) {
  const preds = [];
  const safe = (row, col) => (rows[row]?.[col] || '').trim();
  const name = safe(2, 4);

  // Q1: player + goal count sub-question
  if (safe(13,3)) preds.push({ csvNum:'1א', qtext: safe(13,1), value: safe(13,3), section:'T2' });
  if (safe(13,8)) preds.push({ csvNum:'1ב', qtext: safe(13,7), value: safe(13,8), section:'T2', isSubQ:true, parentText:safe(13,1) });
  // Q2: team + goals
  if (safe(15,4)) preds.push({ csvNum:'2א', qtext: safe(15,1), value: safe(15,4), section:'T2' });
  if (safe(15,7)) preds.push({ csvNum:'2ב', qtext: safe(15,6), value: safe(15,7), section:'T2', isSubQ:true, parentText:safe(15,1) });
  // Q3: team + penalties
  if (safe(17,4)) preds.push({ csvNum:'3א', qtext: safe(17,1), value: safe(17,4), section:'T2' });
  if (safe(17,7)) preds.push({ csvNum:'3ב', qtext: safe(17,6), value: safe(17,7), section:'T2', isSubQ:true, parentText:safe(17,1) });

  // Q4-Q33
  for (let i = 19; i < 79; i += 2) {
    const qnum = safe(i,0);
    if (!qnum.startsWith('(')) continue;
    const v = safe(i,6);
    if (v) preds.push({ csvNum: qnum.replace('(',''), qtext: safe(i,1), value: v, section:'T2' });
  }

  // שמינית matches
  for (let i = 83; i < 101; i++) {
    const home = safe(i,3), away = safe(i,5), hs = safe(i,6), as_ = safe(i,8);
    if (home && away && /^\d+$/.test(hs) && /^\d+$/.test(as_))
      preds.push({ csvNum:`שמ${i-82}`, type:'match', home:normalizeTeam(home), away:normalizeTeam(away), value:`${hs}-${as_}`, section:'T3' });
  }

  // שמינית qualifiers
  for (let i = 102; i < 115; i++) {
    const slot = safe(i,2), team = safe(i,3);
    if (/^\d+$/.test(slot) && team && !team.includes('שם הנבחרת'))
      preds.push({ csvNum:`רשמ${slot}`, type:'qualifier', stage:'שמינית', slot:parseInt(slot), team:normalizeTeam(team), section:'T4' });
  }

  // שמינית special
  for (let i = 115; i < 136; i += 2) {
    if (!safe(i,0).startsWith('(')) continue;
    const v = safe(i,7);
    if (v) preds.push({ csvNum:`שמס${safe(i,0).replace('(','').replace(')','')}`, qtext:safe(i,1), value:v, section:'T5' });
  }

  // רבע qualifiers
  for (let i = 140; i < 152; i++) {
    const slot = safe(i,2), team = safe(i,3);
    if (/^\d+$/.test(slot) && team && !team.includes('שם הנבחרת'))
      preds.push({ csvNum:`רסר${slot}`, type:'qualifier', stage:'רבע', slot:parseInt(slot), team:normalizeTeam(team), section:'T6' });
  }

  // רבע special
  for (let i = 149; i < 170; i += 2) {
    if (!safe(i,0).startsWith('(')) continue;
    const v = safe(i,7);
    if (v) preds.push({ csvNum:`רבע${safe(i,0).replace('(','').replace(')','')}`, qtext:safe(i,1), value:v, section:'T7' });
  }

  // חצי qualifiers
  for (let i = 174; i < 184; i++) {
    const slot = safe(i,2), team = safe(i,3);
    if (/^\d+$/.test(slot) && team && !team.includes('שם הנבחרת'))
      preds.push({ csvNum:`חצר${slot}`, type:'qualifier', stage:'חצי', slot:parseInt(slot), team:normalizeTeam(team), section:'T8' });
  }

  // חצי special
  for (let i = 181; i < 202; i += 2) {
    if (!safe(i,0).startsWith('(')) continue;
    const v = safe(i,7);
    if (v) preds.push({ csvNum:`חצס${safe(i,0).replace('(','').replace(')','')}`  , qtext:safe(i,1), value:v, section:'T9' });
  }

  // גמר special
  for (let i = 207; i < 245; i += 2) {
    if (!safe(i,0).startsWith('(')) continue;
    const v = safe(i,7);
    if (v) preds.push({ csvNum:`גמר${safe(i,0).replace('(','').replace(')','')}`, qtext:safe(i,1), value:v, section:'T10' });
  }

  return { name, preds };
}

// ─── matcher ─────────────────────────────────────────────────────────────────

function matchPred(pred, questions) {
  if (pred.type === 'match') {
    return questions.find(q =>
      q.home_team && q.away_team &&
      normalizeTeam(q.home_team) === pred.home &&
      normalizeTeam(q.away_team) === pred.away
    ) || null;
  }
  if (pred.type === 'qualifier') {
    const stageQs = questions.filter(q =>
      q.stage_type === 'qualifiers' &&
      (q.table_description?.includes(pred.stage) || q.stage_name?.includes(pred.stage))
    ).sort((a,b) =>
      (a.stage_order||0)-(b.stage_order||0) ||
      (parseInt(a.question_id?.split('.')[1])||0)-(parseInt(b.question_id?.split('.')[1])||0)
    );
    return stageQs[pred.slot-1] || null;
  }
  // exact
  const normPred = normalizeText(pred.qtext || '');
  const exact = questions.find(q => normalizeText(q.question_text||'') === normPred);
  if (exact) return exact;

  // sub-question: search by short label contained in DB text
  if (pred.isSubQ) {
    const label = normalizeText(pred.qtext||'');
    const found = questions.find(q => {
      const qt = normalizeText(q.question_text||'');
      return qt.includes(label) || (label.length > 4 && label.includes(qt));
    });
    if (found) return found;
  }

  // fuzzy word-overlap >= 0.65
  let best = null, bestScore = 0;
  for (const q of questions) {
    if (!q.question_text) continue;
    const s = wordOverlap(normPred, normalizeText(q.question_text));
    if (s > bestScore) { bestScore = s; best = q; }
  }
  return bestScore >= 0.65 ? best : null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminImport() {
  const { currentGame } = useGame();
  const { toast } = useToast();

  const [questions, setQuestions] = useState([]);
  const [loadingQs, setLoadingQs] = useState(false);
  const [deletingTest, setDeletingTest] = useState(false);
  const [parsed, setParsed] = useState(null);   // { name, matched, unmatched }
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const TEST_NAMES = ['בדיקה_אחד','בדיקה_שתיים','בדיקה_שלוש'];

  const loadQuestions = useCallback(async () => {
    if (!currentGame) return [];
    setLoadingQs(true);
    try {
      let qs = [], skip = 0;
      while (true) {
        const batch = await db.Question.filter({ game_id: currentGame.id }, null, 5000, skip);
        qs = [...qs, ...batch]; if (batch.length < 5000) break; skip += 5000;
      }
      qs = qs.filter(q => q.table_id !== 'T1');
      setQuestions(qs);
      toast({ title: `✅ ${qs.length} שאלות נטענו`, duration: 3000 });
      return qs;
    } catch(err) {
      toast({ title:'שגיאה', description:err.message, variant:'destructive', duration:4000 });
      return [];
    } finally { setLoadingQs(false); }
  }, [currentGame]);

  const deleteTestUsers = async () => {
    setDeletingTest(true);
    try {
      let total = 0;
      for (const name of TEST_NAMES) {
        const preds = await db.Prediction.filter({ game_id:currentGame.id, participant_name:name }, null, 9999);
        for (const p of preds) { await db.Prediction.delete(p.id); total++; }
        const ranks = await db.Ranking.filter({ game_id:currentGame.id, participant_name:name }, null, 100);
        for (const r of ranks) await db.Ranking.delete(r.id);
        const gps = await db.GameParticipant.filter({ game_id:currentGame.id, participant_name:name }, null, 100);
        for (const gp of gps) await db.GameParticipant.delete(gp.id);
      }
      toast({ title:`🗑️ נמחקו (${total} ניחושים)`, duration:4000 });
    } catch(err) { toast({ title:'שגיאה', description:err.message, variant:'destructive', duration:4000 }); }
    finally { setDeletingTest(false); }
  };

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const qs = questions.length ? questions : await loadQuestions();
    if (!qs.length) return;
    const rows = parseCSVText(await file.text());
    const { name, preds } = extractPredictions(rows);
    const matched = [], unmatched = [];
    for (const pred of preds) {
      const q = matchPred(pred, qs);
      if (q) matched.push({ pred, question: q });
      else    unmatched.push(pred);
    }
    setParsed({ name, matched, unmatched });
    setImportResults(null);
  };

  const doImport = async (allFiles) => {
    if (!currentGame) return;
    setImporting(true);
    let totalInserted = 0, totalErrors = 0;
    const perParticipant = [];
    const qs = questions.length ? questions : await loadQuestions();
    try {
      for (const file of allFiles) {
        const rows = parseCSVText(await file.text());
        const { name, preds } = extractPredictions(rows);
        const matched = [];
        for (const pred of preds) {
          const q = matchPred(pred, qs);
          if (q) matched.push({ pred, question: q });
        }
        if (!matched.length) continue;
        // delete existing
        const existing = await db.Prediction.filter({ game_id:currentGame.id, participant_name:name }, null, 9999);
        for (const p of existing) await db.Prediction.delete(p.id);
        // insert
        let inserted = 0, errors = 0;
        for (let i = 0; i < matched.length; i++) {
          const { pred, question } = matched[i];
          try {
            const data = { game_id:currentGame.id, question_id:question.id, participant_name:name, text_prediction:pred.value, created_at:new Date().toISOString() };
            if (pred.type==='match') { const p=pred.value.split('-'); if(p.length===2){data.home_prediction=parseInt(p[0]); data.away_prediction=parseInt(p[1]);} }
            await db.Prediction.create(data); inserted++;
          } catch { errors++; }
          if ((i+1)%10===0) await new Promise(r=>setTimeout(r,50));
        }
        try {
          const gps = await db.GameParticipant.filter({ game_id:currentGame.id, participant_name:name }, null, 1);
          if (!gps.length) await db.GameParticipant.create({ game_id:currentGame.id, participant_name:name, is_active:true });
        } catch {}
        totalInserted+=inserted; totalErrors+=errors;
        perParticipant.push({ name, inserted, errors });
      }
      setImportResults({ totalInserted, totalErrors, perParticipant });
      toast({ title:`✅ יובאו ${totalInserted} ניחושים ל-${perParticipant.length} משתתפים`, duration:5000 });
    } catch(err) { toast({ title:'שגיאה', description:err.message, variant:'destructive', duration:5000 }); }
    finally { setImporting(false); }
  };

  const [allFiles, setAllFiles] = useState([]);
  const handleAllFiles = (e) => setAllFiles(Array.from(e.target.files));

  const cell = { padding:'6px 10px', borderBottom:'1px solid #1e293b', fontSize:13, verticalAlign:'top' };
  const hdr = { padding:'6px 10px', color:'#64748b', textAlign:'right', borderBottom:'2px solid #334155', fontSize:12, background:'#0f172a', position:'sticky', top:0 };

  const sectionLabel = (s) => ({
    'T2':'נוקאאוט כללי','T3':'שמינית-גמר','T4':'רשימת שמינית','T5':'שמינית מיוחד',
    'T6':'רשימת רבע','T7':'רבע מיוחד','T8':'רשימת חצי','T9':'חצי מיוחד','T10':'גמר'
  }[s] || s);

  return (
    <div dir="rtl" style={{ minHeight:'100vh', background:'#0f172a', color:'#e2e8f0', padding:24, fontFamily:'Arial,sans-serif' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <h1 style={{ fontSize:26, fontWeight:'bold', color:'#06b6d4', marginBottom:24 }}>ייבוא ניחושים מ-CSV</h1>

        {/* Step 1: delete test + load questions */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
          <div style={{ background:'#1e293b', borderRadius:12, padding:20, border:'1px solid #7f1d1d' }}>
            <h2 style={{ color:'#f87171', fontSize:14, marginBottom:10 }}>שלב 1 — מחיקת משתמשי בדיקה</h2>
            <Button onClick={deleteTestUsers} disabled={deletingTest||!currentGame} style={{ background:'#dc2626', color:'white' }}>
              {deletingTest ? <><Loader2 className="w-4 h-4 animate-spin ml-2"/>מוחק...</> : <><Trash2 className="w-4 h-4 ml-2"/>מחק בדיקה_אחד/שתיים/שלוש</>}
            </Button>
          </div>
          <div style={{ background:'#1e293b', borderRadius:12, padding:20, border:'1px solid #334155' }}>
            <h2 style={{ color:'#e2e8f0', fontSize:14, marginBottom:10 }}>שלב 2 — טעינת שאלות מסופאבייס</h2>
            <Button onClick={loadQuestions} disabled={loadingQs||!currentGame} style={{ background:'#0284c7', color:'white' }}>
              {loadingQs ? <><Loader2 className="w-4 h-4 animate-spin ml-2"/>טוען...</> : `טען שאלות${questions.length ? ` (✓ ${questions.length})` : ''}`}
            </Button>
          </div>
        </div>

        {questions.length > 0 && (
          <>
            {/* Step 3: verify single file */}
            <div style={{ background:'#1e293b', borderRadius:12, padding:20, marginBottom:20, border:'1px solid #0284c7' }}>
              <h2 style={{ color:'#38bdf8', fontSize:14, marginBottom:8 }}>שלב 3 — בדיקת קובץ יחיד (אימות לפני טעינה מלאה)</h2>
              <p style={{ color:'#64748b', fontSize:12, marginBottom:12 }}>בחר קובץ אחד — תראה טבלה מלאה של כל הניחושים שזוהו ואילו לא</p>
              <input type="file" accept=".csv" onChange={handleFile} style={{ color:'#e2e8f0' }}/>
            </div>

            {/* Verification table */}
            {parsed && (
              <div style={{ background:'#1e293b', borderRadius:12, padding:20, marginBottom:20, border: parsed.unmatched.length===0 ? '1px solid #059669' : '1px solid #dc2626' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <h2 style={{ color: parsed.unmatched.length===0 ? '#6ee7b7' : '#f87171', fontSize:16 }}>
                    {parsed.unmatched.length===0 ? <><CheckCircle className="w-5 h-5 inline ml-2"/>כל הניחושים זוהו!</> : <><AlertTriangle className="w-5 h-5 inline ml-2"/>{parsed.unmatched.length} ניחושים לא זוהו</>}
                  </h2>
                  <span style={{ color:'#94a3b8', fontSize:13 }}>
                    {parsed.name} — {parsed.matched.length} זוהו / {parsed.unmatched.length} לא זוהו
                  </span>
                </div>

                {/* UNMATCHED TABLE */}
                {parsed.unmatched.length > 0 && (
                  <div style={{ marginBottom:24 }}>
                    <h3 style={{ color:'#f87171', fontSize:14, marginBottom:8 }}>❌ ניחושים שלא זוהו ({parsed.unmatched.length})</h3>
                    <div style={{ overflowX:'auto', background:'#0f172a', borderRadius:8 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse' }}>
                        <thead>
                          <tr>
                            {['#','שאלה מה-CSV (מה חיפשנו)','ערך הניחוש','קטגוריה'].map(h => <th key={h} style={hdr}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {parsed.unmatched.map((u,i) => (
                            <tr key={i} style={{ background: i%2===0 ? '#0f172a' : '#111827' }}>
                              <td style={{ ...cell, color:'#f87171', width:40 }}>{u.csvNum||i+1}</td>
                              <td style={{ ...cell, color:'#fca5a5' }}>
                                {u.type==='match' ? `⚽ ${u.home} נגד ${u.away}` :
                                 u.type==='qualifier' ? `📋 רשימת ${u.stage} — מקום ${u.slot}: ${u.team}` :
                                 u.qtext}
                              </td>
                              <td style={{ ...cell, color:'#fbbf24', fontFamily:'monospace' }}>"{u.value}"</td>
                              <td style={{ ...cell, color:'#64748b' }}>{sectionLabel(u.section)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p style={{ color:'#f87171', fontSize:12, marginTop:8 }}>⛔ לא ניתן לייבא עד שכל הניחושים ימופו. שלח את הטבלה הזו לתיקון.</p>
                  </div>
                )}

                {/* MATCHED TABLE */}
                <div>
                  <h3 style={{ color:'#6ee7b7', fontSize:14, marginBottom:8 }}>✅ ניחושים שזוהו ({parsed.matched.length}) — אמת שהערכים נכונים</h3>
                  <div style={{ overflowX:'auto', background:'#0f172a', borderRadius:8, maxHeight:500 }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr>
                          {['#','שאלה ב-DB (מה נמצא)','ניחוש CSV','table_id','question_id'].map(h => <th key={h} style={hdr}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.matched.map(({pred, question}, i) => (
                          <tr key={i} style={{ background: i%2===0 ? '#0f172a' : '#111827' }}>
                            <td style={{ ...cell, color:'#6ee7b7', width:40 }}>{i+1}</td>
                            <td style={{ ...cell, color:'#e2e8f0' }}>
                              {question.home_team && question.away_team
                                ? `${question.home_team} נגד ${question.away_team}`
                                : question.question_text}
                            </td>
                            <td style={{ ...cell, color:'#38bdf8', fontFamily:'monospace', fontWeight:'bold' }}>"{pred.value}"</td>
                            <td style={{ ...cell, color:'#818cf8', whiteSpace:'nowrap' }}>{question.table_id}</td>
                            <td style={{ ...cell, color:'#64748b', whiteSpace:'nowrap', fontSize:11 }}>{question.question_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: import all - only if single-file test was perfect */}
            {parsed && parsed.unmatched.length === 0 && (
              <div style={{ background:'#1e293b', borderRadius:12, padding:20, marginBottom:20, border:'1px solid #059669' }}>
                <h2 style={{ color:'#6ee7b7', fontSize:14, marginBottom:8 }}>שלב 4 — טעינה מלאה של כל המשתתפים</h2>
                <p style={{ color:'#64748b', fontSize:12, marginBottom:12 }}>בחר את כל הקבצים (Ctrl+A) — יובאו רק כשהאימות הצליח</p>
                <input type="file" accept=".csv" multiple onChange={handleAllFiles} style={{ color:'#e2e8f0', marginBottom:12, display:'block' }}/>
                {allFiles.length > 0 && (
                  <Button onClick={() => doImport(allFiles)} disabled={importing}
                    style={{ background:'linear-gradient(135deg,#059669,#047857)', color:'white', padding:'10px 24px' }}>
                    {importing
                      ? <><Loader2 className="w-5 h-5 animate-spin ml-2"/>מייבא {allFiles.length} קבצים...</>
                      : <><Upload className="w-5 h-5 ml-2"/>ייבא {allFiles.length} משתתפים</>}
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {/* Import results */}
        {importResults && (
          <div style={{ background:'#064e3b', borderRadius:12, padding:24, border:'1px solid #059669' }}>
            <h2 style={{ color:'#6ee7b7', fontSize:18, marginBottom:12 }}>✅ ייבוא הושלם! {importResults.totalInserted} ניחושים</h2>
            <div style={{ maxHeight:400, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr style={{ background:'#065f46' }}>
                  {['משתתף','ניחושים','שגיאות'].map(h=><th key={h} style={{ padding:'5px 10px', color:'#6ee7b7', textAlign:'right' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {importResults.perParticipant.map((p,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid #065f46' }}>
                      <td style={{ padding:'5px 10px', color:'#d1fae5' }}>{p.name}</td>
                      <td style={{ padding:'5px 10px', color:'#6ee7b7' }}>{p.inserted}</td>
                      <td style={{ padding:'5px 10px', color:p.errors>0?'#fca5a5':'#6ee7b7' }}>{p.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color:'#94a3b8', fontSize:12, marginTop:12 }}>עכשיו עבור ל-AdminResults → לחץ "שמור תוצאות" לחישוב הדירוג.</p>
          </div>
        )}
      </div>
    </div>
  );
}
