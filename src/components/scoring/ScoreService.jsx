/**
 * 🎯 מערכת ניקוד - מסונכרן עם ScoreCalculator BASE44
 *
 * כללי הניקוד:
 * - משחקים רגילים: 10 = תוצאה מדויקת | 7 = תוצאה + הפרש | 5 = תוצאה בלבד | 0 = טעות
 * - משחקים T20 (ישראלי): 6 = תוצאה מדויקת | 4 = תוצאה + הפרש | 2 = תוצאה בלבד | 0 = טעות
 * - שאלות טקסט: possible_points = נכון | 0 = טעות
 * - בונוסים למיקומים: T14/T15/T16 (20 לקבוצה + 20 אם כולם + 40 אם סדר מושלם)
 *                     T17          (20 לקבוצה + 30 אם כולם + 50 אם סדר מושלם)
 *                     T19          (30 לקבוצה + 20 אם כולם | סדר לא משנה)
 */

// ======= פונקציות עזר =======

/**
 * ניקוי טקסט מרווחים ותווים מיותרים + הסרת סוגריים (שם מדינה)
 */
function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\s*\([^)]*\)/g, '') // הסר (שם מדינה)
    .replace(/[\s\u00A0\u200B\t\n\r\u200E\u200F]+/g, '') // הסר רווחים מיוחדים
    .trim();
}

/**
 * בדיקה האם תוצאה היא בפורמט משחק (X-Y)
 */
function isScoreFormat(text) {
  if (!text) return false;
  const str = String(text).trim();
  if (!str.includes('-')) return false;
  const parts = str.split('-');
  if (parts.length !== 2) return false;
  const num1 = parseInt(parts[0].trim(), 10);
  const num2 = parseInt(parts[1].trim(), 10);
  return !isNaN(num1) && !isNaN(num2) && num1 >= 0 && num2 >= 0;
}

/**
 * פירוק תוצאת משחק ל-[home, away]
 */
function parseScore(text) {
  if (!text) return [NaN, NaN];
  const str = String(text).trim();
  const parts = str.split('-');
  if (parts.length !== 2) return [NaN, NaN];
  return [parseInt(parts[0].trim(), 10), parseInt(parts[1].trim(), 10)];
}

/**
 * בדיקה שתוצאה תקינה (לא ריקה, לא null, לא placeholder)
 */
function isValidResult(result) {
  if (!result) return false;
  const r = String(result).trim();
  return r !== '' &&
    r !== '__CLEAR__' &&
    r !== '-' &&
    r !== 'null' &&
    r !== 'null-null' &&
    r !== 'null - null' &&
    !r.toLowerCase().includes('null');
}

// ======= חישוב ניקוד למשחק =======

/**
 * חישוב ניקוד למשחק (תוצאת X-Y)
 */
export function calculateMatchScore(actualResult, prediction, isIsraeliTable = false) {
  if (!actualResult || actualResult === '__CLEAR__') return null;
  if (!prediction) return 0;
  if (!isScoreFormat(actualResult)) return null;
  if (!isScoreFormat(prediction)) return 0;

  const [actualHome, actualAway] = parseScore(actualResult);
  const [predHome, predAway] = parseScore(prediction);

  const PERFECT = isIsraeliTable ? 6 : 10;
  const RESULT_AND_DIFF = isIsraeliTable ? 4 : 7;
  const RESULT_ONLY = isIsraeliTable ? 2 : 5;

  if (actualHome === predHome && actualAway === predAway) return PERFECT;

  const actualType = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
  const predType = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';

  if (actualType !== predType) return 0;

  const actualDiff = actualHome - actualAway;
  const predDiff = predHome - predAway;

  return actualDiff === predDiff ? RESULT_AND_DIFF : RESULT_ONLY;
}

// ======= חישוב ניקוד לשאלה בודדת =======

/**
 * חישוב ניקוד לשאלה (אוטומטי - משחק או טקסט)
 *
 * @param {Object} question - אובייקט השאלה
 * @param {string} prediction - הניחוש
 * @returns {number|null} הניקוד (null = אין תוצאה עדיין)
 */
export function calculateQuestionScore(question, prediction) {
  // ⚠️ שאלות טבלאות מיקומים — ניקוד מחושב ברמת הטבלה, לא ברמת השאלה
  if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(question.table_id)) return null;

  // אין ניחוש
  if (!prediction || String(prediction).trim() === '') return null;

  // קבל תוצאה
  const actualResult = question.actual_result != null ? String(question.actual_result).trim() : '';

  // אין תוצאה תקינה
  if (!isValidResult(actualResult)) return null;

  // 🎯 משחק עם תוצאת סקור (X-Y)
  if (isScoreFormat(actualResult) && isScoreFormat(prediction)) {
    const [actualHome, actualAway] = parseScore(actualResult);
    const [predHome, predAway] = parseScore(prediction);

    if (!isNaN(actualHome) && !isNaN(actualAway) && !isNaN(predHome) && !isNaN(predAway)) {
      const isIsraeliTable = question.table_id === 'T20';
      return calculateMatchScore(actualResult, prediction, isIsraeliTable);
    }
  }

  // 📝 שאלות טקסט — השוואה case-insensitive אחרי ניקוי
  const cleanActual = cleanText(actualResult).toLowerCase();
  const cleanPred = cleanText(prediction).toLowerCase();

  // תשובות נכונות מרובות (מופרדות ב-|||)
  if (actualResult.includes('|||')) {
    const correctAnswers = actualResult.split('|||').map(a => cleanText(a).trim().toLowerCase()).filter(Boolean);
    // בדוק גם תשובה הפוכה (לשאלות ללא בית/חוץ)
    const reversedPred = cleanPred.includes('-')
      ? cleanPred.split('-').reverse().join('-')
      : null;
    if (correctAnswers.includes(cleanPred) || (reversedPred && correctAnswers.includes(reversedPred))) {
      return question.possible_points || 0;
    }
    return 0;
  }

  if (cleanActual === cleanPred) {
    return question.possible_points || 0;
  }

  return 0;
}

/**
 * קבלת ניקוד מקסימלי לשאלה
 */
export function getMaxScore(question) {
  if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(question.table_id)) return 0;

  if (question.home_team && question.away_team) {
    return question.table_id === 'T20' ? 6 : 10;
  }

  if (question.actual_result && isScoreFormat(String(question.actual_result))) {
    return question.table_id === 'T20' ? 6 : 10;
  }

  return question.possible_points || 0;
}

// ======= בונוסים לטבלאות מיקומים =======

/**
 * 🔥 חישוב בונוס עבור טבלת מיקומים (T14-T19)
 * מסונכרן עם calculateLocationTableBonus ב-ScoreCalculator BASE44
 *
 * ניקוד:
 * - 20 נקודות לכל קבוצה נכונה (T14/T15/T16/T17)
 * - 30 נקודות לכל קבוצה נכונה (T19, סדר לא משנה)
 * - בונוס 20/30 אם כל הקבוצות נכונות
 * - בונוס 40/50 אם גם הסדר מדויק (לא T19)
 *
 * @param {string} tableId
 * @param {Array} questions - רשימת כל השאלות בטבלה
 * @param {Object} predictions - { question.id -> text_prediction }
 * @returns {Object|null}
 */
export function calculateLocationBonus(tableId, questions, predictions) {
  if (!['T14', 'T15', 'T16', 'T17', 'T19'].includes(tableId)) return null;

  const isT17 = tableId === 'T17';
  const isT19 = tableId === 'T19';
  const pointsPerTeam = isT19 ? 30 : 20;

  // ✅ עבוד רק עם שאלות שיש להן תוצאה אמיתית (כמו BASE44)
  const completedQuestions = questions.filter(q => isValidResult(q.actual_result));

  // אם אין אף תוצאה — אין ניקוד
  if (completedQuestions.length === 0) return null;

  // רשימת תוצאות אמיתיות מנורמלות
  const normalizedActuals = completedQuestions.map(q =>
    cleanText(q.actual_result).toLowerCase()
  );

  // ======= T19: סדר לא משנה — בדוק presence בלבד =======
  if (isT19) {
    // אסוף את כל הניחושים של המשתתף לטבלה זו (כולל שאלות ללא תוצאה)
    const allPredValues = questions
      .map(q => predictions[q.id])
      .filter(Boolean)
      .map(p => cleanText(p).toLowerCase())
      .filter(Boolean);

    // כמה קבוצות נכונות (ייחודיות) מתוך הרשימה
    const uniqueCorrect = new Set(allPredValues.filter(p => normalizedActuals.includes(p)));
    const correctTeamsCount = uniqueCorrect.size;
    const allCorrect = correctTeamsCount === questions.length;

    const basicScore = correctTeamsCount * pointsPerTeam;
    const teamsBonus = allCorrect ? 20 : 0;

    return {
      basicScore,
      teamsBonus,
      orderBonus: 0,
      allCorrect,
      perfectOrder: false,
      correctTeamsCount,
      total: basicScore + teamsBonus
    };
  }

  // ======= T14/T15/T16/T17: סדר משנה =======
  let correctTeamsCount = 0;
  let perfectOrder = true;

  for (let i = 0; i < completedQuestions.length; i++) {
    const q = completedQuestions[i];
    const pred = predictions[q.id];
    const normalizedPred = pred ? cleanText(pred).toLowerCase() : '';

    // קבוצה נכונה = מופיעה בכלל ברשימת התוצאות
    if (normalizedPred && normalizedActuals.includes(normalizedPred)) {
      correctTeamsCount++;
    }

    // בדיקת מיקום מדויק
    if (normalizedPred !== normalizedActuals[i]) {
      perfectOrder = false;
    }
  }

  const allCorrect = correctTeamsCount === completedQuestions.length;
  perfectOrder = perfectOrder && allCorrect;

  const basicScore = correctTeamsCount * pointsPerTeam;
  const teamsBonus = allCorrect ? (isT17 ? 30 : 20) : 0;
  const orderBonus = (allCorrect && perfectOrder) ? (isT17 ? 50 : 40) : 0;

  return {
    basicScore,
    teamsBonus,
    orderBonus,
    allCorrect,
    perfectOrder,
    correctTeamsCount,
    total: basicScore + teamsBonus + orderBonus
  };
}

// ======= חישוב ניקוד כולל למשתתף =======

/**
 * חישוב ניקוד כולל למשתתף
 *
 * @param {Array} questions - כל השאלות במשחק
 * @param {Object} predictions - מפת ניחושים: question.id -> prediction_text
 * @returns {{ total: number, breakdown: Array }}
 */
export function calculateTotalScore(questions, predictions) {
  let total = 0;
  const breakdown = [];

  // קבץ שאלות לפי טבלה (לצורך חישוב בונוסים)
  const tableQuestions = {};
  for (const q of questions) {
    if (!tableQuestions[q.table_id]) tableQuestions[q.table_id] = [];
    tableQuestions[q.table_id].push(q);
  }

  // 1️⃣ חשב ניקוד לכל שאלה רגילה
  for (const q of questions) {
    // דלג על טבלאות מיקומים — מחושבות בנפרד
    if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(q.table_id)) continue;

    const pred = predictions[q.id];
    const score = calculateQuestionScore(q, pred);

    if (score !== null) {
      total += score;
      breakdown.push({
        question_id: q.id,
        question_id_text: q.question_id,
        table_id: q.table_id,
        score,
        max_score: getMaxScore(q),
        isBonus: false
      });
    }
  }

  // 2️⃣ חשב בונוסים לטבלאות מיקומים
  for (const tableId of ['T14', 'T15', 'T16', 'T17', 'T19']) {
    const tQuestions = tableQuestions[tableId];
    if (!tQuestions || tQuestions.length === 0) continue;

    const bonus = calculateLocationBonus(tableId, tQuestions, predictions);
    if (!bonus || bonus.total <= 0) continue;

    total += bonus.total;

    // ניקוד בסיסי (לכל קבוצה נכונה)
    if (bonus.basicScore > 0) {
      breakdown.push({
        question_id: `${tableId}_BASIC`,
        question_id_text: `ניקוד קבוצות (${bonus.correctTeamsCount})`,
        table_id: tableId,
        score: bonus.basicScore,
        max_score: bonus.basicScore,
        isBonus: true
      });
    }

    // בונוס כל הקבוצות
    if (bonus.teamsBonus > 0) {
      breakdown.push({
        question_id: `${tableId}_TEAMS`,
        question_id_text: 'בונוס עולות',
        table_id: tableId,
        score: bonus.teamsBonus,
        max_score: bonus.teamsBonus,
        isBonus: true
      });
    }

    // בונוס סדר מושלם
    if (bonus.orderBonus > 0) {
      breakdown.push({
        question_id: `${tableId}_ORDER`,
        question_id_text: 'בונוס סדר מדויק',
        table_id: tableId,
        score: bonus.orderBonus,
        max_score: bonus.orderBonus,
        isBonus: true
      });
    }
  }

  return { total, breakdown };
}

/**
 * חישוב ניקוד לכל המשתתפים בו-זמנית
 *
 * @param {Array} questions - כל השאלות
 * @param {Array} predictions - כל הניחושים (מערך אובייקטים)
 * @returns {Object} { participantName: { total, breakdown } }
 */
export function calculateAllParticipantsScores(questions, predictions) {
  // קבץ לפי משתתף — קח ניחוש אחרון לכל שאלה
  const participantPreds = {};

  for (const p of predictions) {
    if (!p.participant_name?.trim()) continue;
    if (!participantPreds[p.participant_name]) participantPreds[p.participant_name] = {};

    const existing = participantPreds[p.participant_name][p.question_id];
    const existingDate = existing ? new Date(existing.created_at || existing.created_date || 0) : new Date(0);
    const newDate = new Date(p.created_at || p.created_date || 0);

    if (!existing || newDate > existingDate) {
      participantPreds[p.participant_name][p.question_id] = p;
    }
  }

  // חשב לכל משתתף
  const results = {};
  for (const [name, predsMap] of Object.entries(participantPreds)) {
    // בנה מפת question_id -> text_prediction
    const predTextMap = {};
    for (const [qid, pred] of Object.entries(predsMap)) {
      predTextMap[qid] = pred.text_prediction;
    }
    results[name] = calculateTotalScore(questions, predTextMap);
  }

  return results;
}
