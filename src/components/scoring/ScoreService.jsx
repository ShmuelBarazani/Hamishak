/**
 * ScoreService — העתק מדויק של BASE44 ScoreCalculator.jsx
 * לוגיקה זהה ב-100% לשימוש ב-LeaderboardNew
 */

// ── normalizeScore זהה לBASE44 ────────────────────────────────────────────────
function normalizeScore(score) {
  if (!score) return '';
  return String(score)
    .replace(/\s*\([^)]*\)/g, '')  // הסר (שם מדינה)
    .replace(/\s+/g, '')            // הסר כל רווחים
    .trim();
}

function isValidResult(result) {
  if (!result) return false;
  const r = String(result).trim();
  return r !== '' && r !== '__CLEAR__' && r !== '-' &&
    r !== 'null' && r !== 'null-null' && r !== 'null - null' &&
    !r.toLowerCase().includes('null');
}

// ── calculateQuestionScore — EXACT copy of BASE44 ────────────────────────────
export function calculateQuestionScore(question, prediction) {
  if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(question.table_id)) return null;
  if (!prediction || String(prediction).trim() === '') return null;

  let actualResult = question.actual_result;
  if (actualResult === null || actualResult === undefined) actualResult = '';
  if (typeof actualResult !== 'string') actualResult = String(actualResult);
  actualResult = actualResult.trim();

  // תשובות נכונות מרובות (|||)
  const multipleCorrectAnswers = actualResult.includes('|||')
    ? actualResult.split('|||').map(a => normalizeScore(a.trim())).filter(Boolean)
    : null;

  // תוצאה לא תקינה
  if (!isValidResult(actualResult)) return null;

  const normalizedActual = normalizeScore(actualResult);
  const normalizedPred   = normalizeScore(prediction);

  // ✅ EXACT BASE44: בדוק home_team && away_team לפני חישוב תוצאת משחק
  if (question.home_team && question.away_team && normalizedActual.includes('-')) {
    const actualParts = normalizedActual.split('-').map(x => parseInt(x));
    const predParts   = normalizedPred.split('-').map(x => parseInt(x));

    if (actualParts.length === 2 && predParts.length === 2 &&
        !isNaN(actualParts[0]) && !isNaN(actualParts[1]) &&
        !isNaN(predParts[0])   && !isNaN(predParts[1])) {

      const aH = actualParts[0], aA = actualParts[1];
      const pH = predParts[0],   pA = predParts[1];
      const isIsraeli = question.table_id === 'T20';
      const PERFECT = isIsraeli ? 6 : 10;
      const DIFF    = isIsraeli ? 4 : 7;
      const RESULT  = isIsraeli ? 2 : 5;

      if (aH === pH && aA === pA) return PERFECT;

      const aType = aH > aA ? 'home' : aH < aA ? 'away' : 'draw';
      const pType = pH > pA ? 'home' : pH < pA ? 'away' : 'draw';
      if (aType !== pType) return 0;
      return (aH - aA) === (pH - pA) ? DIFF : RESULT;
    } else {
      return null; // תוצאה לא תקינה — null כמו BASE44
    }
  }

  // השוואת טקסט — תשובות מרובות
  if (multipleCorrectAnswers) {
    const reversedPred = normalizedPred.includes('-')
      ? normalizedPred.split('-').reverse().join('-') : null;
    if (multipleCorrectAnswers.includes(normalizedPred) ||
        (reversedPred && multipleCorrectAnswers.includes(reversedPred))) {
      return question.possible_points || 0;
    }
    return 0;
  }

  // השוואת טקסט — תשובה בודדת
  if (normalizedPred === normalizedActual) return question.possible_points || 0;
  return 0;
}

export function getMaxScore(question) {
  if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(question.table_id)) return 0;
  if (question.home_team && question.away_team)
    return question.table_id === 'T20' ? 6 : 10;
  return question.possible_points || 0;
}

// ── calculateLocationTableBonus — EXACT copy of BASE44 ───────────────────────
export function calculateLocationBonus(tableId, questions, predictions) {
  if (!['T14', 'T15', 'T16', 'T17', 'T19'].includes(tableId)) return null;

  const isT17 = tableId === 'T17';
  const isT19 = tableId === 'T19';

  // ✅ BASE44: סנן רק שאלות עם תוצאות אמיתיות
  const completedQuestions = questions.filter(q =>
    q.actual_result && String(q.actual_result).trim() !== '' &&
    q.actual_result !== '__CLEAR__'
  );
  if (completedQuestions.length === 0) return null;

  const normalizedActualResults = completedQuestions.map(q => normalizeScore(q.actual_result));

  // T19: סדר לא משנה
  if (isT19) {
    const allPredValues = Object.values(predictions)
      .map(p => p ? normalizeScore(p) : '')
      .filter(Boolean);
    const uniqueCorrect = new Set(allPredValues.filter(p => normalizedActualResults.includes(p)));
    const correctTeamsCount = uniqueCorrect.size;
    const allCorrect = correctTeamsCount === questions.length;
    return {
      basicScore: correctTeamsCount * 30,
      teamsBonus: allCorrect ? 20 : 0,
      orderBonus: 0,
      allCorrect,
      perfectOrder: false,
      correctTeamsCount
    };
  }

  // T14/T15/T16/T17
  let correctTeamsCount = 0;
  let perfectOrder = true;

  for (let i = 0; i < completedQuestions.length; i++) {
    const q = completedQuestions[i];
    const pred = predictions[q.id];
    const normalizedPred = pred ? normalizeScore(pred) : '';

    if (normalizedPred && normalizedActualResults.includes(normalizedPred)) {
      correctTeamsCount++;
    }
    if (normalizedPred !== normalizedActualResults[i]) {
      perfectOrder = false;
    }
  }

  const allCorrect = correctTeamsCount === completedQuestions.length;
  perfectOrder = perfectOrder && allCorrect;

  const pointsPerTeam = 20;
  const basicScore  = correctTeamsCount * pointsPerTeam;
  const teamsBonus  = allCorrect ? (isT17 ? 30 : 20) : 0;
  const orderBonus  = (allCorrect && perfectOrder) ? (isT17 ? 50 : 40) : 0;

  return { basicScore, teamsBonus, orderBonus, allCorrect, perfectOrder, correctTeamsCount };
}

// ── calculateTotalScore ───────────────────────────────────────────────────────
export function calculateTotalScore(questions, predictions) {
  let total = 0;
  const breakdown = [];

  // שאלות רגילות (קח רק questionsWithResults כמו BASE44)
  const questionsWithResults = questions.filter(q => isValidResult(q.actual_result));

  for (const q of questionsWithResults) {
    if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(q.table_id)) continue;
    const score = calculateQuestionScore(q, predictions[q.id]);
    if (score === null) continue;
    total += score;
    breakdown.push({
      question_id: q.id, question_id_text: q.question_id,
      table_id: q.table_id, score, max_score: getMaxScore(q), isBonus: false
    });
  }

  // בונוסים לטבלאות מיקומים — EXACT BASE44 logic
  const locationTables = ['T14', 'T15', 'T16', 'T17', 'T19'];
  for (const tableId of locationTables) {
    // ✅ BASE44: tableQuestions = questionsWithResults.filter(tableId)
    const tableQuestions = questionsWithResults.filter(q => q.table_id === tableId);
    if (tableQuestions.length === 0) continue;

    // ✅ BASE44: T19 uses allQuestions (not just completed) for predictions source
    const sourceQuestions = tableId === 'T19'
      ? questions.filter(q => q.table_id === 'T19')
      : tableQuestions;

    const tablePredictions = {};
    sourceQuestions.forEach(q => {
      if (predictions[q.id]) tablePredictions[q.id] = predictions[q.id];
    });

    const bonusResult = calculateLocationBonus(tableId, tableQuestions, tablePredictions);
    if (!bonusResult) continue;

    const bonusTotal = (bonusResult.basicScore || 0) + (bonusResult.teamsBonus || 0) + (bonusResult.orderBonus || 0);
    total += bonusTotal;

    if (bonusResult.basicScore > 0)
      breakdown.push({ question_id: `${tableId}_BASIC`,
        question_id_text: `ניקוד קבוצות (${bonusResult.correctTeamsCount})`,
        table_id: tableId, score: bonusResult.basicScore, max_score: bonusResult.basicScore, isBonus: true });
    if (bonusResult.teamsBonus > 0)
      breakdown.push({ question_id: `${tableId}_TEAMS`, question_id_text: 'בונוס עולות',
        table_id: tableId, score: bonusResult.teamsBonus, max_score: bonusResult.teamsBonus, isBonus: true });
    if (bonusResult.orderBonus > 0)
      breakdown.push({ question_id: `${tableId}_ORDER`, question_id_text: 'בונוס סדר מדויק',
        table_id: tableId, score: bonusResult.orderBonus, max_score: bonusResult.orderBonus, isBonus: true });
  }

  return { total, breakdown };
}
