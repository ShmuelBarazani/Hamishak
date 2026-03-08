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
 * בדיקה האם תוצאה היא בפורמט משחק (X-Y)
 * תומך גם ברווחים סביב המקף
 */
function isScoreFormat(text) {
  if (!text) return false;
  const str = String(text).trim();
  
  // בדוק אם יש מקף (עם או בלי רווחים)
  if (!str.includes('-')) return false;
  
  // פצל לפי מקף
  const parts = str.split('-');
  if (parts.length !== 2) return false;
  
  // נקה רווחים ובדוק שזה מספרים
  const num1 = parseInt(parts[0].trim(), 10);
  const num2 = parseInt(parts[1].trim(), 10);
  
  return !isNaN(num1) && !isNaN(num2) && num1 >= 0 && num2 >= 0;
}

/**
 * פירוק תוצאת משחק ל-[home, away]
 * תומך גם ברווחים סביב המקף
 */
function parseScore(text) {
  if (!text) return [NaN, NaN];
  const str = String(text).trim();
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
 * 
 * @param {string} actualResult - התוצאה האמיתית (למשל "2-1")
 * @param {string} prediction - הניחוש (למשל "2-1")
 * @param {boolean} isIsraeliTable - האם זה T20 (ניקוד 6/4/2)
 * @returns {number|null} הניקוד שהושג (או null אם אין תוצאה)
 */
export function calculateMatchScore(actualResult, prediction, isIsraeliTable = false) {
  // אין תוצאה אמיתית
  if (!actualResult || actualResult === '__CLEAR__') return null;
  
  // אין ניחוש
  if (!prediction) return 0;
  
  // בדוק פורמט תקין
  if (!isScoreFormat(actualResult)) return null;
  if (!isScoreFormat(prediction)) return 0;
  
  // פרק את התוצאות
  const [actualHome, actualAway] = parseScore(actualResult);
  const [predHome, predAway] = parseScore(prediction);
  
  // קבע ניקוד מקסימלי
  const PERFECT = isIsraeliTable ? 6 : 10;
  const RESULT_AND_DIFF = isIsraeliTable ? 4 : 7;
  const RESULT_ONLY = isIsraeliTable ? 2 : 5;
  
  // ✅ תוצאה מדויקת
  if (actualHome === predHome && actualAway === predAway) {
    return PERFECT;
  }
  
  // בדוק סוג תוצאה
  const actualType = getResultType(actualHome, actualAway);
  const predType = getResultType(predHome, predAway);
  
  // ❌ תוצאה שגויה
  if (actualType !== predType) {
    return 0;
  }
  
  // ✅ תוצאה נכונה - בדוק הפרש שערים
  const actualDiff = actualHome - actualAway;
  const predDiff = predHome - predAway;
  
  if (actualDiff === predDiff) {
    return RESULT_AND_DIFF; // תוצאה + הפרש
  }
  
  return RESULT_ONLY; // תוצאה בלבד
}

// ======= חישוב ניקוד לשאלת טקסט =======

/**
 * חישוב ניקוד לשאלה טקסטואלית
 * 
 * @param {string} actualResult - התשובה הנכונה
 * @param {string} prediction - הניחוש
 * @param {number} possiblePoints - הניקוד המקסימלי
 * @returns {number|null} הניקוד שהושג (או null אם אין תוצאה)
 */
export function calculateTextScore(actualResult, prediction, possiblePoints) {
  // אין ניקוד לשאלה
  if (!possiblePoints || possiblePoints === 0) return null;
  
  // אין תוצאה אמיתית
  if (!actualResult || actualResult === '__CLEAR__' || actualResult === '0') return null;
  
  // אין ניחוש
  if (!prediction) return 0;
  
  // השווה (ללא רגישות לרווחים ואותיות גדולות/קטנות)
  const actualClean = cleanText(actualResult).toLowerCase();
  const predClean = cleanText(prediction).toLowerCase();
  
  if (actualClean === predClean) {
    return possiblePoints; // ✅ תשובה נכונה
  }
  
  return 0; // ❌ תשובה שגויה
}

// ======= חישוב ניקוד לשאלה בודדת =======

/**
 * חישוב ניקוד לשאלה (אוטומטי - משחק או טקסט)
 * 
 * @param {Object} question - אובייקט השאלה
 * @param {string} prediction - הניחוש
 * @param {Array} allQuestionsInTable - כל השאלות באותו שלב (לצורך בדיקת presence)
 * @param {Object} allPredictions - כל הניחושים של המשתתף (לצורך בדיקת presence)
 * @returns {number|null} הניקוד (או null אם אין תוצאה)
 */
export function calculateQuestionScore(question, prediction, allQuestionsInTable = [], allPredictions = {}) {
  // דלג על שאלות T1 (פרטי משתתף)
  if (question.table_id === 'T1') return null;
  
  // אין ניחוש
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
  
  // אין תוצאה
  if (actualResult === '' || actualResult === '__CLEAR__' || actualResult === '-' || 
      actualResult === 'null' || actualResult === 'null-null' || actualResult === 'null - null') {
    return null;
  }

  // בדוק אם זה פורמט משחק (X-Y)
  const isActualScore = isScoreFormat(actualResult);
  const isPredScore = isScoreFormat(prediction);

  // 🎯 משחק עם תוצאה
  if (isActualScore && isPredScore) {
    const [actualHome, actualAway] = parseScore(actualResult);
    const [predHome, predAway] = parseScore(prediction);
    
    // ודא שהפירוק הצליח
    if (!isNaN(actualHome) && !isNaN(actualAway) && !isNaN(predHome) && !isNaN(predAway)) {
      const isIsraeliTable = question.table_id === 'T20';
      const maxScore = isIsraeliTable ? 6 : 10;
      
      // פגיעה מדויקת
      if (actualHome === predHome && actualAway === predAway) {
        return maxScore;
      }
      
      const actualResultType = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
      const predResult = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';

      // לא ניחש את התוצאה
      if (actualResultType !== predResult) {
        return 0;
      }
      
      // תוצאה + הפרש נכון
      const actualDiff = actualHome - actualAway;
      const predDiff = predHome - predAway;
      
      if (actualDiff === predDiff) {
        const diffScore = isIsraeliTable ? 4 : 7;
        return diffScore;
      }
      
      // תוצאה נכונה בלבד
      const resultOnlyScore = isIsraeliTable ? 2 : 5;
      return resultOnlyScore;
    }
  }
  
  // 🎯 שלבי טורניר - ניקוד לפי נוכחות (לא סדר)
  const isPresenceStage = ['T_TOP_FINISHERS', 'T11', 'T12', 'T13'].includes(question.table_id);
  const isThirdPlaceMain = question.table_id === 'T_THIRD_PLACE' && !question.question_id.includes('.');
  
  if (isPresenceStage || isThirdPlaceMain) {
    // אסוף את כל התוצאות האמיתיות מהשלב
    const actualTeams = allQuestionsInTable
      .filter(q => q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__')
      .map(q => cleanText(q.actual_result).toLowerCase());
    
    // נקה את הניחוש
    const cleanPred = cleanText(prediction).toLowerCase();
    
    // בדוק אם הניחוש מופיע ברשימה
    if (actualTeams.includes(cleanPred)) {
      return question.possible_points || 0;
    }
    
    return 0;
  }
  
  // 📝 שאלות טקסט רגילות - השוואה case-insensitive מדויקת
  const cleanActual = cleanText(actualResult).toLowerCase();
  const cleanPred = cleanText(prediction).toLowerCase();
  
  if (cleanActual === cleanPred) {
    const points = question.possible_points || 0;
    return points;
  }
  
  return 0;
}

/**
 * קבלת ניקוד מקסימלי לשאלה
 */
export function getMaxScore(question) {
  if (question.table_id === 'T1') return 0;
  
  if (isScoreFormat(question.actual_result)) {
    return question.table_id === 'T20' ? 6 : 10;
  }
  
  return question.possible_points || 0;
}

// ======= בונוסים לטבלאות מיקומים =======

/**
 * חישוב בונוס עבור טבלת מיקומים (T14-T19)
 * 
 * @param {string} tableId - מזהה הטבלה
 * @param {Array} questions - רשימת השאלות בטבלה
 * @param {Object} predictions - מפת ניחושים (question_id -> prediction)
 * @returns {Object|null} { teamsBonus, orderBonus, total } או null
 */
export function calculateLocationBonus(tableId, questions, predictions) {
  // רק טבלאות מיקומים
  if (!['T14', 'T15', 'T16', 'T17', 'T19'].includes(tableId)) {
    return null;
  }
  
  // מספר קבוצות צפוי
  const expectedCount = tableId === 'T17' ? 12 : 8;
  
  // בדוק שיש מספר נכון של שאלות
  if (questions.length !== expectedCount) return null;
  
  // בדוק שיש תוצאה לכל השאלות
  const allHaveResults = questions.every(q => 
    q.actual_result && 
    q.actual_result.trim() !== '' && 
    q.actual_result !== '__CLEAR__'
  );
  
  if (!allHaveResults) return null;
  
  // ספור קבוצות נכונות וסדר מושלם
  let correctTeams = 0;
  let perfectOrder = true;
  
  for (const q of questions) {
    const pred = predictions[q.id];
    const actualClean = cleanText(q.actual_result);
    const predClean = cleanText(pred || '');
    
    if (actualClean === predClean) {
      correctTeams++;
    } else {
      perfectOrder = false;
    }
  }
  
  // חשב בונוסים
  let teamsBonus = 0;
  let orderBonus = 0;
  
  const allCorrect = (correctTeams === expectedCount);
  
  if (allCorrect) {
    // כל הקבוצות נכונות
    teamsBonus = tableId === 'T17' ? 30 : 20;
    
    // סדר מושלם (לא ל-T19)
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
 * 
 * @param {Array} questions - כל השאלות במשחק
 * @param {Object} predictions - מפת ניחושים: question.id -> prediction_text
 * @returns {Object} { total, breakdown }
 */
export function calculateTotalScore(questions, predictions) {
  let total = 0;
  const breakdown = [];
  const tableQuestions = {};
  
  // קבץ שאלות לפי טבלה
  for (const q of questions) {
    if (!tableQuestions[q.table_id]) {
      tableQuestions[q.table_id] = [];
    }
    tableQuestions[q.table_id].push(q);
  }
  
  // 1️⃣ עבור על כל השאלות וחשב ניקוד
  for (const q of questions) {
    // דלג על פרטי משתתף
    if (q.table_id === 'T1') continue;
    
    // קבל את הניחוש
    const pred = predictions[q.id];
    
    // העבר את כל השאלות באותו שלב לצורך presence scoring
    const questionsInTable = tableQuestions[q.table_id] || [];
    
    // חשב ניקוד
    const score = calculateQuestionScore(q, pred, questionsInTable, predictions);
    
    // אם יש ניקוד - הוסף
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
  
  // 2️⃣ חשב בונוסים לטבלאות מיקומים
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
 * 
 * @param {Array} questions - כל השאלות
 * @param {Array} predictions - כל הניחושים
 * @returns {Object} { participantName: { total, breakdown } }
 */
export function calculateAllParticipantsScores(questions, predictions) {
  const predictionsByParticipant = {};
  
  // קבץ לפי משתתף
  for (const p of predictions) {
    if (!predictionsByParticipant[p.participant_name]) {
      predictionsByParticipant[p.participant_name] = {};
    }
    predictionsByParticipant[p.participant_name][p.question_id] = p.text_prediction;
  }
  
  // חשב לכל משתתף
  const results = {};
  for (const [name, preds] of Object.entries(predictionsByParticipant)) {
    results[name] = calculateTotalScore(questions, preds);
  }
  
  return results;
}