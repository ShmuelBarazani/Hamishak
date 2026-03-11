import { useState, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import * as db from "@/api/entities";
import { useGame } from "@/components/contexts/GameContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Trash2, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeTeam(s) {
  if (!s) return '';
  return s.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
}

function normalizeText(s) {
  if (!s) return '';
  return s.replace(/["'"״']/g, '').replace(/\s+/g, ' ').trim();
}

// ─── CSV parser ──────────────────────────────────────────────────────────────

function parseCSVText(text) {
  // Simple CSV parser respecting quoted fields
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map(line => {
    const cols = [];
    let cur = '', inQ = false;
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
  const r = rows; // shorthand

  const safe = (row, col) => (r[row] && r[row][col]) ? r[row][col].trim() : '';

  // ─── Participant name: row 2, col 4 ───
  const name = safe(2, 4);

  // ─── Section 1: General knockout special questions (rows 14-78, step 2) ───
  // Q1 (row 14): two predictions
  const q1player = safe(13, 3); const q1goals = safe(13, 8);
  if (q1player) preds.push({ qtext: safe(13, 1), value: q1player, section: 'T2' });
  if (q1goals)  preds.push({ qtext: safe(13, 7), value: q1goals,  section: 'T2' });

  // Q2 (row 16): two predictions
  const q2team = safe(15, 4); const q2goals = safe(15, 7);
  if (q2team)  preds.push({ qtext: safe(15, 1), value: q2team,  section: 'T2' });
  if (q2goals) preds.push({ qtext: safe(15, 6), value: q2goals, section: 'T2' });

  // Q3 (row 18): two predictions
  const q3team = safe(17, 4); const q3pens = safe(17, 7);
  if (q3team)  preds.push({ qtext: safe(17, 1), value: q3team,  section: 'T2' });
  if (q3pens)  preds.push({ qtext: safe(17, 6), value: q3pens,  section: 'T2' });

  // Q4-Q33 (rows 20-78, even indices = 19..77 step 2): col[6]
  for (let i = 19; i < 79; i += 2) {
    const qnum = safe(i, 0);
    if (!qnum.startsWith('(')) continue;
    const v = safe(i, 6);
    if (v) preds.push({ qtext: safe(i, 1), value: v, section: 'T2' });
  }

  // ─── Section 2: שמינית גמר matches (rows 84-99) ───
  for (let i = 83; i < 101; i++) {
    const home = safe(i, 3); const away = safe(i, 5);
    const hs = safe(i, 6); const as_ = safe(i, 8);
    if (home && away && hs.match(/^\d+$/) && as_.match(/^\d+$/)) {
      preds.push({
        type: 'match',
        home: normalizeTeam(home),
        away: normalizeTeam(away),
        value: `${hs}-${as_}`,
        section: 'T3'
      });
    }
  }

  // ─── Section 3: שמינית qualification list (rows ~103-113) ───
  for (let i = 102; i < 115; i++) {
    const slot = safe(i, 2); const team = safe(i, 3);
    if (slot.match(/^\d+$/) && team && !team.includes('שם הנבחרת')) {
      preds.push({ type: 'qualifier', stage: 'שמינית', slot: parseInt(slot), team: normalizeTeam(team), section: 'T4' });
    }
  }

  // ─── Section 4: שמינית special questions (rows 116-134, step 2) ───
  for (let i = 115; i < 136; i += 2) {
    if (!safe(i, 0).startsWith('(')) continue;
    const v = safe(i, 7);
    if (v) preds.push({ qtext: safe(i, 1), value: v, section: 'T5' });
  }

  // ─── Section 5: רבע qualification list (rows ~143-146) ───
  for (let i = 140; i < 152; i++) {
    const slot = safe(i, 2); const team = safe(i, 3);
    if (slot.match(/^\d+$/) && team && !team.includes('שם הנבחרת')) {
      preds.push({ type: 'qualifier', stage: 'רבע', slot: parseInt(slot), team: normalizeTeam(team), section: 'T6' });
    }
  }

  // ─── Section 6: רבע special questions (rows 150-168, step 2) ───
  for (let i = 149; i < 170; i += 2) {
    if (!safe(i, 0).startsWith('(')) continue;
    const v = safe(i, 7);
    if (v) preds.push({ qtext: safe(i, 1), value: v, section: 'T7' });
  }

  // ─── Section 7: חצי qualification list (rows ~177-178) ───
  for (let i = 174; i < 184; i++) {
    const slot = safe(i, 2); const team = safe(i, 3);
    if (slot.match(/^\d+$/) && team && !team.includes('שם הנבחרת')) {
      preds.push({ type: 'qualifier', stage: 'חצי', slot: parseInt(slot), team: normalizeTeam(team), section: 'T8' });
    }
  }

  // ─── Section 8: חצי special questions (rows 182-200, step 2) ───
  for (let i = 181; i < 202; i += 2) {
    if (!safe(i, 0).startsWith('(')) continue;
    const v = safe(i, 7);
    if (v) preds.push({ qtext: safe(i, 1), value: v, section: 'T9' });
  }

  // ─── Section 9: גמר special questions (rows 208-244, step 2) ───
  for (let i = 207; i < 245; i += 2) {
    if (!safe(i, 0).startsWith('(')) continue;
    const v = safe(i, 7);
    if (v) preds.push({ qtext: safe(i, 1), value: v, section: 'T10' });
  }

  return { name, preds };
}

// ─── Question matcher ────────────────────────────────────────────────────────

function buildMaps(questions) {
  const matchMap = {};   // "home|away" -> q
  const textMap = {};    // normalized_text -> q

  for (const q of questions) {
    if (q.home_team && q.away_team) {
      const key = `${normalizeTeam(q.home_team)}|${normalizeTeam(q.away_team)}`;
      matchMap[key] = q;
    }
    if (q.question_text) {
      textMap[normalizeText(q.question_text)] = q;
    }
  }
  return { matchMap, textMap };
}

function matchPred(pred, maps, questions) {
  if (pred.type === 'match') {
    const key = `${pred.home}|${pred.away}`;
    return maps.matchMap[key] || null;
  }
  if (pred.type === 'qualifier') {
    // Find questions in qualifier stage matching the slot + stage hint
    const stageQs = questions.filter(q =>
      q.stage_type === 'qualifiers' &&
      (q.table_description?.includes(pred.stage) || q.stage_name?.includes(pred.stage) ||
       q.table_id?.includes(pred.section?.replace('T', '')))
    );
    // Match by slot number (sort by question_id or stage_order)
    const sorted = stageQs.sort((a, b) =>
      (a.stage_order || 0) - (b.stage_order || 0) ||
      (parseInt(a.question_id?.split('.')[1]) || 0) - (parseInt(b.question_id?.split('.')[1]) || 0)
    );
    return sorted[pred.slot - 1] || null;
  }
  // text match
  if (pred.qtext) {
    const key = normalizeText(pred.qtext);
    return maps.textMap[key] || null;
  }
  return null;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminImport() {
  const { currentGame } = useGame();
  const { toast } = useToast();

  const [files, setFiles] = useState([]);
  const [parsed, setParsed] = useState([]); // [{name, preds, matched, unmatched}]
  const [questions, setQuestions] = useState([]);
  const [loadingQs, setLoadingQs] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingTest, setDeletingTest] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [step, setStep] = useState('init'); // init | preview | done

  const TEST_NAMES = ['בדיקה_אחד', 'בדיקה_שתיים', 'בדיקה_שלוש'];

  // ─── Load questions from Supabase ───────────────────────────────────────────
  const loadQuestions = useCallback(async () => {
    if (!currentGame) return;
    setLoadingQs(true);
    try {
      const BATCH = 5000;
      let qs = [], skip = 0;
      while (true) {
        const batch = await db.Question.filter({ game_id: currentGame.id }, null, BATCH, skip);
        qs = [...qs, ...batch];
        if (batch.length < BATCH) break;
        skip += BATCH;
      }
      qs = qs.filter(q => q.table_id !== 'T1');
      setQuestions(qs);
      toast({ title: `✅ נטענו ${qs.length} שאלות`, duration: 3000 });
      return qs;
    } catch (err) {
      toast({ title: 'שגיאה בטעינת שאלות', description: err.message, variant: 'destructive', duration: 5000 });
      return [];
    } finally {
      setLoadingQs(false);
    }
  }, [currentGame]);

  // ─── Delete test users ───────────────────────────────────────────────────────
  const deleteTestUsers = async () => {
    setDeletingTest(true);
    try {
      let total = 0;
      for (const name of TEST_NAMES) {
        const preds = await db.Prediction.filter({ game_id: currentGame.id, participant_name: name }, null, 9999);
        for (const p of preds) { await db.Prediction.delete(p.id); total++; }
        const ranks = await db.Ranking.filter({ game_id: currentGame.id, participant_name: name }, null, 100);
        for (const r of ranks) { await db.Ranking.delete(r.id); }
        const gps = await db.GameParticipant.filter({ game_id: currentGame.id, participant_name: name }, null, 100);
        for (const gp of gps) { await db.GameParticipant.delete(gp.id); }
      }
      toast({ title: `🗑️ משתמשי בדיקה נמחקו (${total} ניחושים)`, duration: 4000 });
    } catch (err) {
      toast({ title: 'שגיאה במחיקה', description: err.message, variant: 'destructive', duration: 5000 });
    } finally {
      setDeletingTest(false);
    }
  };

  // ─── File selection & parsing ────────────────────────────────────────────────
  const handleFiles = async (e) => {
    const selected = Array.from(e.target.files);
    setFiles(selected);
    const qs = questions.length ? questions : await loadQuestions();
    if (!qs || qs.length === 0) return;

    const maps = buildMaps(qs);
    const results = [];

    for (const file of selected) {
      const text = await file.text();
      const rows = parseCSVText(text);
      const { name, preds } = extractPredictions(rows);

      const matched = [], unmatched = [];
      for (const pred of preds) {
        const q = matchPred(pred, maps, qs);
        if (q) matched.push({ pred, question: q });
        else    unmatched.push(pred);
      }

      results.push({ fileName: file.name, name, matched, unmatched });
    }

    setParsed(results);
    setStep('preview');
  };

  // ─── Import all ─────────────────────────────────────────────────────────────
  const doImport = async () => {
    if (!currentGame || parsed.length === 0) return;
    setImporting(true);
    let totalInserted = 0, totalErrors = 0;
    const perParticipant = [];

    try {
      for (const participant of parsed) {
        if (participant.matched.length === 0) continue;

        // Delete existing predictions for this participant
        const existingPreds = await db.Prediction.filter({
          game_id: currentGame.id,
          participant_name: participant.name
        }, null, 9999);
        for (const p of existingPreds) {
          await db.Prediction.delete(p.id);
        }

        // Insert new predictions in batches
        let inserted = 0, errors = 0;
        for (let i = 0; i < participant.matched.length; i++) {
          const { pred, question } = participant.matched[i];
          try {
            const data = {
              game_id: currentGame.id,
              question_id: question.id,
              participant_name: participant.name,
              text_prediction: pred.value,
              created_at: new Date().toISOString()
            };
            // Add home/away if match prediction
            if (pred.type === 'match') {
              const parts = pred.value.split('-');
              if (parts.length === 2) {
                data.home_prediction = parseInt(parts[0]);
                data.away_prediction = parseInt(parts[1]);
              }
            }
            await db.Prediction.create(data);
            inserted++;
          } catch (err) {
            errors++;
          }
          if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 50));
        }

        // Ensure GameParticipant record exists
        try {
          const gps = await db.GameParticipant.filter({
            game_id: currentGame.id,
            participant_name: participant.name
          }, null, 1);
          if (gps.length === 0) {
            await db.GameParticipant.create({
              game_id: currentGame.id,
              participant_name: participant.name,
              is_active: true
            });
          }
        } catch {}

        totalInserted += inserted;
        totalErrors += errors;
        perParticipant.push({ name: participant.name, inserted, errors });
      }

      setImportResults({ totalInserted, totalErrors, perParticipant });
      setStep('done');
      toast({ title: `✅ יובאו ${totalInserted} ניחושים`, duration: 5000 });
    } catch (err) {
      toast({ title: 'שגיאה בייבוא', description: err.message, variant: 'destructive', duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 'bold', color: '#06b6d4', marginBottom: 8 }}>ייבוא ניחושים מ-CSV</h1>
          <p style={{ color: '#94a3b8' }}>טען קבצי CSV מהתיקייה toto_csv ויבא ניחושים של כל המשתתפים</p>
        </div>

        {/* Delete test users */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #dc2626' }}>
          <h2 style={{ color: '#f87171', fontSize: 16, marginBottom: 12 }}>🗑️ מחיקת משתמשי בדיקה</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
            ימחק: בדיקה_אחד, בדיקה_שתיים, בדיקה_שלוש — ניחושים, דירוג ורישום
          </p>
          <Button
            onClick={deleteTestUsers}
            disabled={deletingTest || !currentGame}
            style={{ background: '#dc2626', color: 'white' }}
          >
            {deletingTest ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />מוחק...</> : <><Trash2 className="w-4 h-4 ml-2" />מחק משתמשי בדיקה</>}
          </Button>
        </div>

        {/* Load questions */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>
              {questions.length > 0 ? `✅ ${questions.length} שאלות נטענו מסופאבייס` : 'שאלות לא נטענו עדיין'}
            </span>
            <Button onClick={loadQuestions} disabled={loadingQs || !currentGame}
              style={{ background: '#0284c7', color: 'white' }}>
              {loadingQs ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />טוען...</> : 'טען שאלות'}
            </Button>
          </div>
        </div>

        {/* File upload */}
        {questions.length > 0 && (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px dashed #06b6d4' }}>
            <h2 style={{ color: '#06b6d4', fontSize: 16, marginBottom: 12 }}>📁 בחר קבצי CSV</h2>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
              ניתן לבחור מספר קבצים בבת אחת (Ctrl+A לבחירת הכל)
            </p>
            <input
              type="file"
              accept=".csv"
              multiple
              onChange={handleFiles}
              style={{ color: '#e2e8f0' }}
            />
          </div>
        )}

        {/* Preview */}
        {step === 'preview' && parsed.length > 0 && (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #334155' }}>
            <h2 style={{ color: '#06b6d4', fontSize: 16, marginBottom: 16 }}>תצוגה מקדימה</h2>

            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#0f172a' }}>
                    {['קובץ', 'שם משתתף', 'ניחושים שזוהו', 'לא זוהו'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #334155' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 11 }}>{p.fileName}</td>
                      <td style={{ padding: '8px 12px', color: '#f1f5f9', fontWeight: 'bold' }}>{p.name || '?'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: '#064e3b', color: '#6ee7b7', padding: '2px 8px', borderRadius: 4 }}>
                          ✓ {p.matched.length}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {p.unmatched.length > 0 ? (
                          <span style={{ background: '#450a0a', color: '#fca5a5', padding: '2px 8px', borderRadius: 4 }}>
                            ✗ {p.unmatched.length}
                          </span>
                        ) : (
                          <span style={{ color: '#6ee7b7' }}>אפס</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Unmatched details */}
            {parsed.some(p => p.unmatched.length > 0) && (
              <details style={{ marginBottom: 16 }}>
                <summary style={{ color: '#f87171', cursor: 'pointer', marginBottom: 8 }}>
                  <AlertTriangle className="w-4 h-4 inline ml-1" />
                  פרטי ניחושים שלא זוהו (ראשון בכל משתתף)
                </summary>
                {parsed.filter(p => p.unmatched.length > 0).map((p, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <p style={{ color: '#e2e8f0', fontWeight: 'bold', marginBottom: 4 }}>{p.name}:</p>
                    {p.unmatched.slice(0, 5).map((u, j) => (
                      <div key={j} style={{ color: '#94a3b8', fontSize: 12, paddingRight: 12, marginBottom: 2 }}>
                        {u.type === 'match' ? `⚽ ${u.home} vs ${u.away} → ${u.value}` :
                         u.type === 'qualifier' ? `📋 ${u.stage} מקום ${u.slot}: ${u.team}` :
                         `❓ "${u.qtext?.slice(0, 50)}" → "${u.value}"`}
                      </div>
                    ))}
                    {p.unmatched.length > 5 && <p style={{ color: '#64748b', fontSize: 12 }}>ועוד {p.unmatched.length - 5}...</p>}
                  </div>
                ))}
              </details>
            )}

            <Button
              onClick={doImport}
              disabled={importing}
              style={{ background: 'linear-gradient(135deg, #059669, #047857)', color: 'white', padding: '10px 24px' }}
            >
              {importing ? (
                <><Loader2 className="w-5 h-5 animate-spin ml-2" />מייבא...</>
              ) : (
                <><Upload className="w-5 h-5 ml-2" />ייבא {parsed.reduce((s, p) => s + p.matched.length, 0)} ניחושים ל-{parsed.filter(p => p.name).length} משתתפים</>
              )}
            </Button>
          </div>
        )}

        {/* Done */}
        {step === 'done' && importResults && (
          <div style={{ background: '#064e3b', borderRadius: 12, padding: 24, border: '1px solid #059669' }}>
            <h2 style={{ color: '#6ee7b7', fontSize: 20, marginBottom: 16 }}>✅ ייבוא הושלם!</h2>
            <p style={{ color: '#a7f3d0', marginBottom: 16 }}>
              סה"כ יובאו <strong>{importResults.totalInserted}</strong> ניחושים
              {importResults.totalErrors > 0 && ` (${importResults.totalErrors} שגיאות)`}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#065f46' }}>
                    {['משתתף', 'ניחושים', 'שגיאות'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#6ee7b7', textAlign: 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importResults.perParticipant.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #065f46' }}>
                      <td style={{ padding: '6px 10px', color: '#d1fae5' }}>{p.name}</td>
                      <td style={{ padding: '6px 10px', color: '#6ee7b7' }}>{p.inserted}</td>
                      <td style={{ padding: '6px 10px', color: p.errors > 0 ? '#fca5a5' : '#6ee7b7' }}>{p.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 16 }}>
              עכשיו עבור לדף AdminResults ולחץ "שמור תוצאות" כדי לחשב מחדש את הדירוג.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
