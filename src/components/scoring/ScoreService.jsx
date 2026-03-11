/**
 * 🎯 מערכת ניקוד פשוטה וברורה
 * 
 * כללי הניקוד:
 * - משחקים רגילים: 10 = תוצאה מדויקת | 7 = תוצאה + הפרש | 5 = תוצאה בלבד | 0 = טעות
 * - משחקים T20 (ישראלי): 6 = תוצאה מדויקת | 4 = תוצאה + הפרש | 2 = תוצאה בלבד | 0 = טעות
 * - שאלות טקסט: possible_points = נכון | 0 = טעות
 * - בונוסים למיקומים: T14-T16 (20+40) | T17 (30+50) | T19 (20+0)
 */

// ======= פונקציות עזר =======

/**
 * ניקוי טקסט מרווחים ותווים מיותרים
 */
function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\s\u00A0\u200B\t\n\r‎‏]+/g, '')
    .trim();
}

/**
 * 🆕 נירמול תוצאה — מסיר קידומות כמו "דקות", "דקה", "מינוט" לפני השוואה
 * לדוגמה: "דקות 1-2" → "1-2" | "דקה 90" → "90"
 */
function normalizeResult(text) {
  if (!text) return '';
  return String(text)
    .replace(/^(דקות?|מינוט[וס]?)\s*/i, '')  // הסר "דקות"/"דקה"/"מינוט" מהתחלה
    .replace(/\s+/g, ' ')                        // צמצם רווחים מרובים
    .trim();
}

/**
 * בדיקה האם תוצאה היא בפורמט משחק (X-Y)
 * תומך גם ברווחים סביב המקף
 */
function isScoreFormat(text) {
  if (!text) return false;
  const str = normalizeResult(String(text).trim());
  
  if (!str.includes('-')) return false;
  
  const parts = str.split('-');
  if (parts.length !== 2) return false;
  
  const num1 = parseInt(parts[0].trim(), 10);
  const num2 = parseInt(parts[1].trim(), 10);
  
  return !isNaN(num1) && !isNaN(num2) && num1 >= 0 && num2 >= 0;
}

/**
 * פירוק תוצאת משחק ל-[home, away]
 * תומך גם ברווחים סביב המקף וקידומות "דקות"
 */
function parseScore(text) {
  if (!text) return [NaN, NaN];
  const str = normalizeResult(String(text).trim());
  const parts = str.split('-');
  if (parts.length !== 2) return [NaN, NaN];
  
  return [parseInt(parts[0].trim(), 10), parseInt(parts[1].trim(), 10)];
}

/**
 * קביעת סוג תוצאה: 'home' / 'away' / 'draw'
 */
function getResultType(home, away) {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
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
  
  if (actualHome === predHome && actualAway === predAway) {
    return PERFECT;
  }
  
  const actualType = getResultType(actualHome, actualAway);
  const predType = getResultType(predHome, predAway);
  
  if (actualType !== predType) {
    return 0;
  }
  
  const actualDiff = actualHome - actualAway;
  const predDiff = predHome - predAway;
  
  if (actualDiff === predDiff) {
    return RESULT_AND_DIFF;
  }
  
  return RESULT_ONLY;
}

// ======= חישוב ניקוד לשאלת טקסט =======

/**
 * חישוב ניקוד לשאלה טקסטואלית
 */
export function calculateTextScore(actualResult, prediction, possiblePoints) {
  if (!possiblePoints || possiblePoints === 0) return null;
  if (!actualResult || actualResult === '__CLEAR__' || actualResult === '0') return null;
  if (!prediction) return 0;
  
  // 🆕 נרמל לפני השוואה (מסיר "דקות" וכו')
  const actualClean = cleanText(normalizeResult(actualResult)).toLowerCase();
  const predClean = cleanText(normalizeResult(prediction)).toLowerCase();
  
  if (actualClean === predClean) {
    return possiblePoints;
  }
  
  return 0;
}

// ======= חישוב ניקוד לשאלה בודדת =======

/**
 * חישוב ניקוד לשאלה (אוטומטי - משחק או טקסט)
 */
export function calculateQuestionScore(question, prediction, allQuestionsInTable = [], allPredictions = {}) {
  if (question.table_id === 'T1') return null;
  
  if (!prediction || String(prediction).trim() === '') {
    return null;
  }

  let actualResult = question.actual_result;
  if (actualResult === null || actualResult === undefined) {
    actualResult = '';
  }
  if (typeof actualResult !== 'string') {
    actualResult = String(actualResult);
  }
  actualResult = actualResult.trim();
  
  if (actualResult === '' || actualResult === '__CLEAR__' || actualResult === '-' || 
      actualResult === 'null' || actualResult === 'null-null' || actualResult === 'null - null') {
    return null;
  }

  // 🆕 נרמל את שניהם לפני כל השוואה
  const normalizedActual = normalizeResult(actualResult);
  const normalizedPred = normalizeResult(String(prediction).trim());

  const isActualScore = isScoreFormat(normalizedActual);
  const isPredScore = isScoreFormat(normalizedPred);

  // 🎯 משחק עם תוצאה — רק לשאלות עם home_team ו-away_team!
  // שאלות טקסט שהתשובה שלהן נראית כמו "X-Y" (למשל: טווח דקות) לא יטופלו כמשחק
  const isMatchQuestion = !!(question.home_team && question.away_team);

  if (isActualScore && isPredScore && isMatchQuestion) {
    const [actualHome, actualAway] = parseScore(normalizedActual);
    const [predHome, predAway] = parseScore(normalizedPred);
    
    if (!isNaN(actualHome) && !isNaN(actualAway) && !isNaN(predHome) && !isNaN(predAway)) {
      const isIsraeliTable = question.table_id === 'T20';
      const maxScore = isIsraeliTable ? 6 : 10;
      
      if (actualHome === predHome && actualAway === predAway) {
        return maxScore;
      }
      
      const actualResultType = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
      const predResult = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';

      if (actualResultType !== predResult) {
        return 0;
      }
      
      const actualDiff = actualHome - actualAway;
      const predDiff = predHome - predAway;
      
      if (actualDiff === predDiff) {
        return isIsraeliTable ? 4 : 7;
      }
      
      return isIsraeliTable ? 2 : 5;
    }
  }
  
  // 🎯 שלבי טורניר - ניקוד לפי נוכחות
  const isPresenceStage = ['T_TOP_FINISHERS', 'T11', 'T12', 'T13'].includes(question.table_id);
  const isThirdPlaceMain = question.table_id === 'T_THIRD_PLACE' && !question.question_id.includes('.');
  
  if (isPresenceStage || isThirdPlaceMain) {
    const actualTeams = allQuestionsInTable
      .filter(q => q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__')
      .map(q => cleanText(normalizeResult(q.actual_result)).toLowerCase());
    
    const cleanPred = cleanText(normalizeResult(prediction)).toLowerCase();
    
    if (actualTeams.includes(cleanPred)) {
      return question.possible_points || 0;
    }
    
    return 0;
  }
  
  // 📝 שאלות טקסט רגילות — השוואה עם נירמול
  const cleanActual = cleanText(normalizedActual).toLowerCase();
  const cleanPred = cleanText(normalizedPred).toLowerCase();
  
  if (cleanActual === cleanPred) {
    return question.possible_points || 0;
  }
  
  return 0;
}

/**
 * קבלת ניקוד מקסימלי לשאלה
 */
export function getMaxScore(question) {
  if (question.table_id === 'T1') return 0;
  
  // רק שאלות עם home_team ו-away_team הן שאלות משחק אמיתיות
  const isMatchQuestion = !!(question.home_team && question.away_team);
  
  if (isMatchQuestion && isScoreFormat(question.actual_result)) {
    return question.table_id === 'T20' ? 6 : 10;
  }
  
  return question.possible_points || 0;
}

// ======= בונוסים לטבלאות מיקומים =======

/**
 * חישוב בונוס עבור טבלת מיקומים (T14-T19)
 */
export function calculateLocationBonus(tableId, questions, predictions) {
  if (!['T14', 'T15', 'T16', 'T17', 'T19'].includes(tableId)) {
    return null;
  }
  
  const expectedCount = tableId === 'T17' ? 12 : 8;
  
  if (questions.length !== expectedCount) return null;
  
  const allHaveResults = questions.every(q => 
    q.actual_result && 
    q.actual_result.trim() !== '' && 
    q.actual_result !== '__CLEAR__'
  );
  
  if (!allHaveResults) return null;
  
  let correctTeams = 0;
  let perfectOrder = true;
  
  for (const q of questions) {
    const pred = predictions[q.id];
    // 🆕 נרמל גם כאן
    const actualClean = cleanText(normalizeResult(q.actual_result));
    const predClean = cleanText(normalizeResult(pred || ''));
    
    if (actualClean === predClean) {
      correctTeams++;
    } else {
      perfectOrder = false;
    }
  }
  
  let teamsBonus = 0;
  let orderBonus = 0;
  
  const allCorrect = (correctTeams === expectedCount);
  
  if (allCorrect) {
    teamsBonus = tableId === 'T17' ? 30 : 20;
    
    if (perfectOrder && tableId !== 'T19') {
      orderBonus = tableId === 'T17' ? 50 : 40;
    }
  }
  
  return {
    teamsBonus,
    orderBonus,
    total: teamsBonus + orderBonus
  };
}

// ======= חישוב ניקוד כולל למשתתף =======

/**
 * חישוב ניקוד כולל למשתתף
 */
export function calculateTotalScore(questions, predictions) {
  let total = 0;
  const breakdown = [];
  const tableQuestions = {};
  
  for (const q of questions) {
    if (!tableQuestions[q.table_id]) {
      tableQuestions[q.table_id] = [];
    }
    tableQuestions[q.table_id].push(q);
  }
  
  for (const q of questions) {
    if (q.table_id === 'T1') continue;
    
    const pred = predictions[q.id];
    const questionsInTable = tableQuestions[q.table_id] || [];
    const score = calculateQuestionScore(q, pred, questionsInTable, predictions);
    
    if (score !== null) {
      total += score;
      breakdown.push({
        question_id: q.id,
        question_id_text: q.question_id,
        table_id: q.table_id,
        score,
        max_score: getMaxScore(q)
      });
    }
  }
  
  for (const tableId of ['T14', 'T15', 'T16', 'T17', 'T19']) {
    const tQuestions = tableQuestions[tableId];
    if (!tQuestions) continue;
    
    const bonus = calculateLocationBonus(tableId, tQuestions, predictions);
    
    if (bonus && bonus.total > 0) {
      total += bonus.total;
      
      if (bonus.teamsBonus > 0) {
        breakdown.push({
          question_id: `${tableId}_TEAMS`,
          question_id_text: 'בונוס קבוצות',
          table_id: tableId,
          score: bonus.teamsBonus,
          max_score: bonus.teamsBonus,
          isBonus: true
        });
      }
      
      if (bonus.orderBonus > 0) {
        breakdown.push({
          question_id: `${tableId}_ORDER`,
          question_id_text: 'בונוס סדר',
          table_id: tableId,
          score: bonus.orderBonus,
          max_score: bonus.orderBonus,
          isBonus: true
        });
      }
    }
  }
  
  return { total, breakdown };
}

/**
 * חישוב ניקוד לכל המשתתפים
 */
export function calculateAllParticipantsScores(questions, predictions) {
  const predictionsByParticipant = {};
  
  for (const p of predictions) {
    if (!predictionsByParticipant[p.participant_name]) {
      predictionsByParticipant[p.participant_name] = {};
    }
    predictionsByParticipant[p.participant_name][p.question_id] = p.text_prediction;
  }
  
  const results = {};
  for (const [name, preds] of Object.entries(predictionsByParticipant)) {
    results[name] = calculateTotalScore(questions, preds);
  }
  
  return results;
}
