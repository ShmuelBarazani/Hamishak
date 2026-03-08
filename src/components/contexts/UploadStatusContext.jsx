import { createContext, useContext, useState } from 'react';
import { supabase } from '@/api/supabaseClient';

const UploadStatusContext = createContext(null);

const DEFAULT_STATUS = { inProgress: false, message: '', error: null, progress: 0, warnings: [], results: {} };

// ─── CSV / TSV Parser ────────────────────────────────────────────────────────
function parseDelimited(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const isTab = lines[0].includes('\t');
  const sep = isTab ? '\t' : ',';

  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v !== ''));
}

// ─── Process Questions CSV ───────────────────────────────────────────────────
async function processQuestionsCSV(text, gameId, setStatus) {
  const rows = parseDelimited(text);
  if (!rows.length) throw new Error('קובץ שאלות ריק או לא תקין');

  // Detect column names flexibly
  const sampleKeys = Object.keys(rows[0]);
  const col = {
    tableId:      sampleKeys.find(k => k.includes("טבלה") && k.includes("מס")) || "מס' טבלה",
    tableDesc:    sampleKeys.find(k => k.includes("תיאור")) || "תיאור טבלה",
    questionNum:  sampleKeys.find(k => k.includes("שאלה") && k.includes("מס")) || "מס' שאלה",
    validList:    sampleKeys.find(k => k.includes("אימות")) || "רשימת אימות",
    gameDate:     sampleKeys.find(k => k.includes("תאריך")) || "תאריך המשחק",
    score:        sampleKeys.find(k => k.includes("ניקוד")) || "ניקוד אפשרי",
    questionText: sampleKeys.find(k => k === "שאלה" || (k.includes("שאלה") && !k.includes("מס"))) || "שאלה",
  };

  // Skip T1 (personal details) — handled by the form itself
  const questionRows = rows.filter(r => {
    const tid = (r[col.tableId] || '').trim();
    return tid && tid !== 'T1' && tid !== '';
  });

  if (!questionRows.length) throw new Error('לא נמצאו שאלות (אחרי סינון T1)');

  setStatus({ inProgress: true, message: `מייבא ${questionRows.length} שאלות...`, progress: 30, error: null, warnings: [], results: {} });

  // Build stage order map per table
  const tableOrderMap = {};
  const questions = questionRows.map((r, idx) => {
    const tableId = (r[col.tableId] || '').trim();
    if (!tableOrderMap[tableId]) tableOrderMap[tableId] = 0;
    tableOrderMap[tableId]++;

    const questionText = (r[col.questionText] || '').trim();
    let homeTeam = null, awayTeam = null;

    // Extract teams from "Home - Away" pattern in question text
    if (questionText.includes(' - ')) {
      const parts = questionText.split(' - ');
      if (parts.length === 2) {
        homeTeam = parts[0].trim();
        awayTeam = parts[1].trim();
      }
    }

    const rawDate = (r[col.gameDate] || '').trim();
    let gameDate = null;
    if (rawDate && rawDate !== 'NaN' && rawDate !== '') {
      // Try to parse date DD/MM/YYYY or YYYY-MM-DD
      const ddmm = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (ddmm) {
        gameDate = `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        gameDate = rawDate.substring(0, 10);
      }
    }

    return {
      game_id: gameId,
      table_id: tableId,
      table_description: (r[col.tableDesc] || '').trim(),
      question_text: questionText || `שאלה ${idx + 1}`,
      home_team: homeTeam,
      away_team: awayTeam,
      validation_list: (r[col.validList] || '').trim() || null,
      stage_name: (r[col.tableDesc] || '').trim(),
      stage_order: tableOrderMap[tableId],
      actual_result: null,
    };
  });

  // Insert in batches of 50
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < questions.length; i += BATCH) {
    const batch = questions.slice(i, i + BATCH);
    const { error } = await supabase.from('questions').insert(batch);
    if (error) throw new Error(`שגיאה בשמירת שאלות: ${error.message}`);
    inserted += batch.length;
    const pct = 30 + Math.round((inserted / questions.length) * 50);
    setStatus({ inProgress: true, message: `נשמרו ${inserted}/${questions.length} שאלות...`, progress: pct, error: null, warnings: [], results: {} });
  }

  return inserted;
}

// ─── Process Validation Lists CSV ───────────────────────────────────────────
async function processValidationCSV(text, gameId, setStatus) {
  const rows = parseDelimited(text);
  if (!rows.length) throw new Error('קובץ רשימות אימות ריק');

  const keys = Object.keys(rows[0]);
  const nameCol = keys.find(k => k.includes('list_name') || k.includes('שם')) || keys[0];
  const optCol  = keys.find(k => k.includes('option') || k.includes('אפשרות')) || keys[1];

  // Group options by list name
  const listsMap = {};
  rows.forEach(r => {
    const name = (r[nameCol] || '').trim();
    const opt  = (r[optCol]  || '').trim();
    if (!name || !opt) return;
    if (!listsMap[name]) listsMap[name] = [];
    listsMap[name].push(opt);
  });

  const listNames = Object.keys(listsMap);
  if (!listNames.length) throw new Error('לא נמצאו רשימות אימות');

  setStatus({ inProgress: true, message: `מייבא ${listNames.length} רשימות אימות...`, progress: 75, error: null, warnings: [], results: {} });

  let saved = 0;
  for (const name of listNames) {
    const opts = listsMap[name];
    // Check if exists
    const { data: existing } = await supabase.from('validation_lists').select('id').eq('list_name', name).limit(1);
    if (existing && existing.length > 0) {
      await supabase.from('validation_lists').update({ options: opts }).eq('id', existing[0].id);
    } else {
      await supabase.from('validation_lists').insert({ list_name: name, options: opts, game_id: gameId });
    }
    saved++;
  }

  return saved;
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function UploadStatusProvider({ children }) {
  const [status, setStatus] = useState({ ...DEFAULT_STATUS });

  const setUploadStatus = (newStatus) => {
    setStatus(prev => ({ ...DEFAULT_STATUS, ...prev, ...newStatus }));
  };

  const clearStatus = () => setStatus({ ...DEFAULT_STATUS });

  const startProcessing = async (filesOrData, existingData, currentGame) => {
    const gameId = currentGame?.id || null;
    setStatus({ inProgress: true, message: 'מתחיל עיבוד...', progress: 5, error: null, warnings: [], results: {} });

    try {
      let questionsInserted = 0;
      let listsInserted = 0;
      const warnings = [];

      // ── Paste mode ──────────────────────────────────────────────────────
      if (filesOrData?.pasteData) {
        const text = filesOrData.pasteData;
        // Detect if it looks like questions (has "מס' טבלה" header) or validation lists
        const firstLine = text.split('\n')[0];
        if (firstLine.includes('list_name') || firstLine.includes('option')) {
          listsInserted = await processValidationCSV(text, gameId, setStatus);
        } else {
          questionsInserted = await processQuestionsCSV(text, gameId, setStatus);
        }
      }

      // ── File mode ───────────────────────────────────────────────────────
      if (filesOrData?.questions) {
        setStatus({ inProgress: true, message: 'קורא קובץ שאלות...', progress: 10, error: null, warnings: [], results: {} });
        const text = await filesOrData.questions.text();
        questionsInserted = await processQuestionsCSV(text, gameId, setStatus);
      }

      if (filesOrData?.validation) {
        setStatus({ inProgress: true, message: 'קורא קובץ רשימות אימות...', progress: 70, error: null, warnings: [], results: {} });
        const text = await filesOrData.validation.text();
        listsInserted = await processValidationCSV(text, gameId, setStatus);
      }

      const results = {};
      if (questionsInserted > 0) results.questions = `✅ ${questionsInserted} שאלות נוספו`;
      if (listsInserted > 0) results.lists = `✅ ${listsInserted} רשימות אימות נשמרו`;
      if (!questionsInserted && !listsInserted) {
        warnings.push('לא נמצאו נתונים לייבוא');
      }

      setStatus({ inProgress: false, message: 'הייבוא הושלם בהצלחה!', progress: 100, error: null, warnings, results });

    } catch (err) {
      console.error('Upload processing error:', err);
      setStatus({ inProgress: false, message: 'שגיאה בעיבוד', progress: 0, error: err.message, warnings: [], results: {} });
    }
  };

  return (
    <UploadStatusContext.Provider value={{ status, startProcessing, setUploadStatus, clearStatus }}>
      {children}
    </UploadStatusContext.Provider>
  );
}

export function useUploadStatus() {
  const context = useContext(UploadStatusContext);
  if (!context) {
    return { status: { ...DEFAULT_STATUS }, startProcessing: () => {}, setUploadStatus: () => {}, clearStatus: () => {} };
  }
  return context;
}
