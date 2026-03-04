/**
 * 🎯 מערכת ניקוד - מסונכרן במדויק עם ScoreCalculator BASE44
 *
 * כללי הניקוד:
 * - משחקים רגילים: 10=מדויק | 7=תוצאה+הפרש | 5=תוצאה בלבד | 0=טעות
 * - T20 (ישראלי): 6=מדויק | 4=תוצאה+הפרש | 2=תוצאה בלבד | 0=טעות
 * - שאלות טקסט: possible_points=נכון | 0=טעות
 * - T14/T15/T16: 20 לכל קבוצה נכונה + 20 אם כולן + 40 אם סדר מושלם
 * - T17:         20 לכל קבוצה נכונה + 30 אם כולן + 50 אם סדר מושלם
 * - T19:         30 לכל קבוצה נכונה + 20 אם כולן (סדר לא משנה)
 */

// ── פונקציות עזר ─────────────────────────────────────────────────────────────

/** נרמל טקסט: הסר סוגריים (שם מדינה) + רווחים מיוחדים */
function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[\s\u00A0\u200B\t\n\r\u200E\u200F]+/g, '')
    .trim();
}

/** בדיקת פורמט X-Y */
function isScoreFormat(text) {
  if (!text) return false;
  const parts = String(text).trim().split('-');
  if (parts.length !== 2) return false;
  const n1 = parseInt(parts[0].trim(), 10);
  const n2 = parseInt(parts[1].trim(), 10);
  return !isNaN(n1) && !isNaN(n2) && n1 >= 0 && n2 >= 0;
}

/** פירוק X-Y ל-[home, away] */
function parseScore(text) {
  const parts = String(text).trim().split('-');
  return [parseInt(parts[0].trim(), 10), parseInt(parts[1].trim(), 10)];
}

/** בדיקה שתוצאה תקינה ולא ריקה */
function isValidResult(result) {
  if (!result) return false;
  const r = String(result).trim();
  return r !== '' && r !== '__CLEAR__' && r !== '-' &&
    r !== 'null' && r !== 'null-null' && r !== 'null - null' &&
    !r.toLowerCase().includes('null');
}

// ── חישוב ניקוד למשחק ────────────────────────────────────────────────────────

export function calculateMatchScore(actualResult, prediction, isIsraeliTable = false) {
  if (!actualResult || actualResult === '__CLEAR__') return null;
  if (!prediction) return 0;
  if (!isScoreFormat(actualResult)) return null;
  if (!isScoreFormat(prediction)) return 0;

  const [aH, aA] = parseScore(actualResult);
  const [pH, pA] = parseScore(prediction);
  const PERFECT = isIsraeliTable ? 6 : 10;
  const DIFF    = isIsraeliTable ? 4 : 7;
  const RESULT  = isIsraeliTable ? 2 : 5;

  if (aH === pH && aA === pA) return PERFECT;

  const aType = aH > aA ? 'home' : aH < aA ? 'away' : 'draw';
  const pType = pH > pA ? 'home' : pH < pA ? 'away' : 'draw';
  if (aType !== pType) return 0;

  return (aH - aA) === (pH - pA) ? DIFF : RESULT;
}

// ── חישוב ניקוד לשאלה בודדת ──────────────────────────────────────────────────

export function calculateQuestionScore(question, prediction) {
  // טבלאות מיקומים — ניקוד ברמת הטבלה בלבד
  if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(question.table_id)) return null;

  if (!prediction || String(prediction).trim() === '') return null;

  const actualResult = question.actual_result != null
    ? String(question.actual_result).trim() : '';

  if (!isValidResult(actualResult)) return null;

  // משחק X-Y
  if (isScoreFormat(actualResult) && isScoreFormat(prediction)) {
    const [aH, aA] = parseScore(actualResult);
    const [pH, pA] = parseScore(prediction);
    if (!isNaN(aH) && !isNaN(aA) && !isNaN(pH) && !isNaN(pA)) {
      return calculateMatchScore(actualResult, prediction, question.table_id === 'T20');
    }
  }

  // שאלת טקסט — תשובות מרובות (|||)
  const cleanActual = cleanText(actualResult).toLowerCase();
  const cleanPred   = cleanText(prediction).toLowerCase();

  if (actualResult.includes('|||')) {
    const correctAnswers = actualResult.split('|||')
      .map(a => cleanText(a).trim().toLowerCase()).filter(Boolean);
    const reversedPred = cleanPred.includes('-')
      ? cleanPred.split('-').reverse().join('-') : null;
    if (correctAnswers.includes(cleanPred) ||
        (reversedPred && correctAnswers.includes(reversedPred))) {
      return question.possible_points || 0;
    }
    return 0;
  }

  return cleanActual === cleanPred ? (question.possible_points || 0) : 0;
}

export function getMaxScore(question) {
  if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(question.table_id)) return 0;
  if (question.home_team && question.away_team)
    return question.table_id === 'T20' ? 6 : 10;
  if (question.actual_result && isScoreFormat(String(question.actual_result)))
    return question.table_id === 'T20' ? 6 : 10;
  return question.possible_points || 0;
}

// ── בונוסים לטבלאות מיקומים ──────────────────────────────────────────────────

/**
 * 🔥 מסונכרן במדויק עם calculateLocationTableBonus ב-BASE44
 *
 * correctTeamsCount: האם הקבוצה נמצאת בכלל ברשימה (לא משנה מיקום)
 * perfectOrder:      האם כל קבוצה במיקום המדויק שלה
 */
export function calculateLocationBonus(tableId, questions, predictions) {
  if (!['T14', 'T15', 'T16', 'T17', 'T19'].includes(tableId)) return null;

  const isT17 = tableId === 'T17';
  const isT19 = tableId === 'T19';
  const pointsPerTeam = isT19 ? 30 : 20;

  // עבוד רק עם שאלות שיש להן תוצאה (כמו BASE44)
  const completedQuestions = questions.filter(q => isValidResult(q.actual_result));
  if (completedQuestions.length === 0) return null;

  // רשימת תוצאות אמיתיות מנורמלות
  const normalizedActuals = completedQuestions.map(q =>
    cleanText(q.actual_result).toLowerCase()
  );

  // ── T19: סדר לא משנה, רק presence ──
  if (isT19) {
    const allPredValues = questions
      .map(q => predictions[q.id])
      .filter(Boolean)
      .map(p => cleanText(p).toLowerCase())
      .filter(Boolean);

    const uniqueCorrect = new Set(
      allPredValues.filter(p => normalizedActuals.includes(p))
    );
    const correctTeamsCount = uniqueCorrect.size;
    const allCorrect = correctTeamsCount === questions.length;
    const basicScore = correctTeamsCount * pointsPerTeam;
    const teamsBonus = allCorrect ? 20 : 0;

    return { basicScore, teamsBonus, orderBonus: 0, allCorrect,
             perfectOrder: false, correctTeamsCount,
             total: basicScore + teamsBonus };
  }

  // ── T14/T15/T16/T17: ──
  let correctTeamsCount = 0;
  let perfectOrder = true;

  for (let i = 0; i < completedQuestions.length; i++) {
    const q = completedQuestions[i];
    const pred = predictions[q.id];
    const normalizedPred = pred ? cleanText(pred).toLowerCase() : '';

    // ✅ correctTeamsCount: קבוצה נמצאת בכלל ברשימה (כמו BASE44 — includes!)
    if (normalizedPred && normalizedActuals.includes(normalizedPred)) {
      correctTeamsCount++;
    }

    // ✅ perfectOrder: קבוצה במיקום המדויק
    if (normalizedPred !== normalizedActuals[i]) {
      perfectOrder = false;
    }
  }

  const allCorrect = correctTeamsCount === completedQuestions.length;
  perfectOrder = perfectOrder && allCorrect;

  const basicScore  = correctTeamsCount * pointsPerTeam;
  const teamsBonus  = allCorrect ? (isT17 ? 30 : 20) : 0;
  const orderBonus  = (allCorrect && perfectOrder) ? (isT17 ? 50 : 40) : 0;

  return { basicScore, teamsBonus, orderBonus, allCorrect,
           perfectOrder, correctTeamsCount,
           total: basicScore + teamsBonus + orderBonus };
}

// ── חישוב ניקוד כולל ─────────────────────────────────────────────────────────

export function calculateTotalScore(questions, predictions) {
  let total = 0;
  const breakdown = [];

  // קבץ שאלות לפי טבלה
  const tableQuestions = {};
  for (const q of questions) {
    if (!tableQuestions[q.table_id]) tableQuestions[q.table_id] = [];
    tableQuestions[q.table_id].push(q);
  }

  // 1️⃣ שאלות רגילות
  for (const q of questions) {
    if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(q.table_id)) continue;

    const pred  = predictions[q.id];
    const score = calculateQuestionScore(q, pred);

    if (score !== null) {
      total += score;
      breakdown.push({
        question_id: q.id, question_id_text: q.question_id,
        table_id: q.table_id, score, max_score: getMaxScore(q), isBonus: false
      });
    }
  }

  // 2️⃣ בונוסים לטבלאות מיקומים
  for (const tableId of ['T14', 'T15', 'T16', 'T17', 'T19']) {
    const tQuestions = tableQuestions[tableId];
    if (!tQuestions || tQuestions.length === 0) continue;

    const bonus = calculateLocationBonus(tableId, tQuestions, predictions);
    if (!bonus || bonus.total <= 0) continue;

    total += bonus.total;

    if (bonus.basicScore > 0) {
      breakdown.push({
        question_id: `${tableId}_BASIC`,
        question_id_text: `ניקוד קבוצות (${bonus.correctTeamsCount})`,
        table_id: tableId, score: bonus.basicScore,
        max_score: bonus.basicScore, isBonus: true
      });
    }
    if (bonus.teamsBonus > 0) {
      breakdown.push({
        question_id: `${tableId}_TEAMS`, question_id_text: 'בונוס עולות',
        table_id: tableId, score: bonus.teamsBonus,
        max_score: bonus.teamsBonus, isBonus: true
      });
    }
    if (bonus.orderBonus > 0) {
      breakdown.push({
        question_id: `${tableId}_ORDER`, question_id_text: 'בונוס סדר מדויק',
        table_id: tableId, score: bonus.orderBonus,
        max_score: bonus.orderBonus, isBonus: true
      });
    }
  }

  return { total, breakdown };
}

export function calculateAllParticipantsScores(questions, predictions) {
  const participantPreds = {};
  for (const p of predictions) {
    if (!p.participant_name?.trim()) continue;
    if (!participantPreds[p.participant_name]) participantPreds[p.participant_name] = {};
    const existing  = participantPreds[p.participant_name][p.question_id];
    const existDate = existing ? new Date(existing.created_at || existing.created_date || 0) : new Date(0);
    const newDate   = new Date(p.created_at || p.created_date || 0);
    if (!existing || newDate > existDate)
      participantPreds[p.participant_name][p.question_id] = p;
  }
  const results = {};
  for (const [name, predsMap] of Object.entries(participantPreds)) {
    const predTextMap = {};
    for (const [qid, pred] of Object.entries(predsMap))
      predTextMap[qid] = pred.text_prediction;
    results[name] = calculateTotalScore(questions, predTextMap);
  }
  return results;
}
