// 🚀 Cache גלובלי לחישובי ניקוד - חיסכון ענק!
const SCORE_CALCULATION_CACHE = new Map();

// 🚀 Cache לנורמליזציה - פונקציה נקראת אלפי פעמים
const NORMALIZE_CACHE = new Map();

const normalizeScore = (score) => {
  if (!score) return '';
  if (NORMALIZE_CACHE.has(score)) return NORMALIZE_CACHE.get(score);
  
  // הסר את החלק בסוגריים (שם המדינה) ורווחים מיותרים
  const result = score.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '').trim();
  NORMALIZE_CACHE.set(score, result);
  return result;
};

// פונקציה משותפת לחישוב ניקוד - תשמש גם בצפייה וגם בדירוג
export function calculateQuestionScore(question, prediction, debugMode = false) {
  // 🚀 בדוק cache תחילה
  const cacheKey = `${question.id}_${prediction}_${question.actual_result}`;
  if (SCORE_CALCULATION_CACHE.has(cacheKey)) {
    if (debugMode) console.log(`✅ Cache hit for ${question.question_id}`);
    return SCORE_CALCULATION_CACHE.get(cacheKey);
  }

  // 🔥 שאלות בטבלאות מיקומים לא מקבלות ניקוד בודד - רק ניקוד כולל של הטבלה
  if (['T14', 'T15', 'T16', 'T17', 'T19'].includes(question.table_id)) {
    if (debugMode) console.log(`   ⏭️ שאלת מיקום - ניקוד מחושב ברמת הטבלה`);
    SCORE_CALCULATION_CACHE.set(cacheKey, null);
    return null;
  }

  if (debugMode) {
    console.log(`🔍 DEBUG - חישוב ניקוד:`, {
      question_id: question.question_id,
      actual_result: question.actual_result,
      prediction: prediction,
      actual_result_type: typeof question.actual_result,
      prediction_type: typeof prediction,
      home_team: question.home_team,
      away_team: question.away_team,
      table_id: question.table_id
    });
  }

  // אם אין ניחוש
  if (!prediction || prediction.trim() === '') {
    if (debugMode) console.log(`   ❌ אין ניחוש - מחזיר null`);
    SCORE_CALCULATION_CACHE.set(cacheKey, null);
    return null;
  }

  let actualResult = question.actual_result;
  
  // נורמליזציה - המרה לטייפ נכון
  if (actualResult === null || actualResult === undefined) {
    actualResult = '';
  }
  if (typeof actualResult !== 'string') {
    actualResult = String(actualResult);
  }
  
  actualResult = actualResult.trim();
  
  // ✅ בדוק אם יש תשובות נכונות מרובות (מופרדות ב-|||)
  const multipleCorrectAnswers = actualResult.includes('|||') 
    ? actualResult.split('|||').map(a => normalizeScore(a.trim())).filter(Boolean)
    : null;
  
  // ✅ בדיקות מורחבות לתוצאות לא תקפות
  if (actualResult === '' || 
      actualResult === '__CLEAR__' || 
      actualResult === '-' || 
      actualResult === 'null' ||
      actualResult === 'null-null' ||
      actualResult === 'null - null' ||
      actualResult.toLowerCase() === 'null' ||
      actualResult.toLowerCase().includes('null')) {
    if (debugMode) console.log(`   ✅ Empty/Invalid result - returning null`);
    SCORE_CALCULATION_CACHE.set(cacheKey, null);
    return null;
  }

  // ✅ נורמליזציה של שתי המחרוזות לפני חישוב
  const normalizedActual = normalizeScore(actualResult);
  const normalizedPred = normalizeScore(prediction);

  if (debugMode) {
    console.log(`   📊 לפני נורמליזציה: actual="${actualResult}", pred="${prediction}"`);
    console.log(`   📊 אחרי נורמליזציה: actual="${normalizedActual}", pred="${normalizedPred}"`);
  }

  // יש ניחוש ויש תוצאה - חשב ניקוד
  // ✅ תיקון: T20 (ישראלי) + T2-T9 תמיד מחשב כמשחק גם אם home_team חסר בDB
  const isMatchTable = ['T2','T3','T4','T5','T6','T7','T8','T9','T20'].includes(question.table_id);
  if ((question.home_team && question.away_team || isMatchTable) && normalizedActual.includes('-')) {
    const actualParts = normalizedActual.split('-').map(x => parseInt(x));
    const predParts = normalizedPred.split('-').map(x => parseInt(x));
    
    if (debugMode) {
      console.log(`   🔢 actualParts: [${actualParts}], predParts: [${predParts}]`);
    }
    
    // ✅ בדוק שהתוצאה תקינה - לא null/NaN
    if (actualParts.length === 2 && predParts.length === 2 && 
        !isNaN(actualParts[0]) && !isNaN(actualParts[1]) && 
        !isNaN(predParts[0]) && !isNaN(predParts[1])) {
      const actualHome = actualParts[0];
      const actualAway = actualParts[1];
      const predHome = predParts[0];
      const predAway = predParts[1];
      
      const isIsraeliTable = question.table_id === 'T20';
      const maxScore = isIsraeliTable ? 6 : 10;
      
      // פגיעה מדויקת
      if (actualHome === predHome && actualAway === predAway) {
        if (debugMode) console.log(`   ✅ פגיעה מדויקת! ${maxScore} נקודות`);
        SCORE_CALCULATION_CACHE.set(cacheKey, maxScore);
        return maxScore;
      }
      
      // קביעת תוצאת המשחק
      const actualResultType = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
      const predResult = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';

      if (debugMode) {
        console.log(`   🎯 actualHome=${actualHome}, actualAway=${actualAway}, actualResultType=${actualResultType}`);
        console.log(`   🎯 predHome=${predHome}, predAway=${predAway}, predResult=${predResult}`);
        console.log(`   🎯 תוצאה אמיתית: ${actualResultType}, ניחוש: ${predResult}`);
      }

      // אם לא ניחש נכון את התוצאה - 0 נקודות
      if (actualResultType !== predResult) {
        if (debugMode) console.log(`   ❌ לא ניחש נכון את התוצאה - 0 נקודות`);
        SCORE_CALCULATION_CACHE.set(cacheKey, 0);
        return 0;
      }
      
      // ניחוש נכון של התוצאה + הפרש שערים זהה
      const actualDiff = actualHome - actualAway;
      const predDiff = predHome - predAway;
      
      if (debugMode) {
        console.log(`   📐 הפרש אמיתי: ${actualDiff}, הפרש ניחוש: ${predDiff}`);
      }
      
      if (actualDiff === predDiff) {
        const diffScore = isIsraeliTable ? 4 : 7;
        if (debugMode) console.log(`   ✅ תוצאה + הפרש נכון! ${diffScore} נקודות`);
        SCORE_CALCULATION_CACHE.set(cacheKey, diffScore);
        return diffScore;
      }
      
      // ניחוש נכון של התוצאה בלבד
      const resultOnlyScore = isIsraeliTable ? 2 : 5;
      if (debugMode) console.log(`   ✅ תוצאה נכונה בלבד! ${resultOnlyScore} נקודות`);
      SCORE_CALCULATION_CACHE.set(cacheKey, resultOnlyScore);
      return resultOnlyScore;
    } else {
      // ✅ אם התוצאה מכילה "-" אבל לא תקינה (null, NaN) - החזר null
      if (debugMode) console.log(`   ❌ תוצאה לא תקינה - מכילה NaN או null`);
      SCORE_CALCULATION_CACHE.set(cacheKey, null);
      return null;
    }
  }
  
  // שאלות לא-משחק - השוואה ישירה אחרי נורמליזציה
  // ✅ אם יש תשובות נכונות מרובות, בדוק אם הניחוש תואם לאחת מהן
  if (multipleCorrectAnswers) {
    // בשאלות ללא בית/חוץ, תוצאה כמו 1-2 ו-2-1 נחשבות זהות
    const reversedPred = normalizedPred.includes('-')
      ? normalizedPred.split('-').reverse().join('-')
      : null;
    if (multipleCorrectAnswers.includes(normalizedPred) || (reversedPred && multipleCorrectAnswers.includes(reversedPred))) {
      const points = question.possible_points || 0;
      if (debugMode) console.log(`   ✅ תשובה נכונה (מרובה)! ${points} נקודות`);
      SCORE_CALCULATION_CACHE.set(cacheKey, points);
      return points;
    }
  } else if (normalizedPred === normalizedActual) {
    const points = question.possible_points || 0;
    if (debugMode) console.log(`   ✅ תשובה נכונה! ${points} נקודות`);
    SCORE_CALCULATION_CACHE.set(cacheKey, points);
    return points;
  }
  
  // יש תוצאה אמיתית אבל לא ניחש נכון
  if (debugMode) console.log(`   ❌ תשובה לא נכונה - 0 נקודות`);
  SCORE_CALCULATION_CACHE.set(cacheKey, 0);
  return 0;
}

// 🎁 פונקציה לחישוב ניקוד ובונוסים עבור טבלאות מיקומים
export function calculateLocationTableBonus(tableId, tableQuestions, predictions) {
  // בדוק אם זו טבלת מיקומים
  if (!['T14', 'T15', 'T16', 'T17', 'T19'].includes(tableId)) {
    return null;
  }

  const isT17 = tableId === 'T17';
  const isT19 = tableId === 'T19';

  // ✅ סנן רק שאלות עם תוצאות אמיתיות
  const completedQuestions = tableQuestions.filter(q => 
    q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__'
  );

  // אם אין אף תוצאה - החזר null
  if (completedQuestions.length === 0) {
    console.log(`❌ ${tableId}: completedQuestions=0 of ${tableQuestions.length}`);
    return null;
  }
  

  // בנה רשימה של כל התוצאות האמיתיות (רק מהשאלות המושלמות)
  const actualResults = completedQuestions.map(q => q.actual_result);

  // 🔥 נרמל את התוצאות האמיתיות (הסר סוגריים ורווחים)
  const normalizedActualResults = actualResults.map(r => r.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '').trim());

  // 🔥 T19 - סדר לא משנה! בדוק את כל הניחושים מול רשימת הקבוצות שהתאמתו
  if (isT19) {
    const allPredValues = Object.values(predictions)
      .map(p => p ? p.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '').trim() : '')
      .filter(Boolean);
    const uniqueCorrect = new Set(allPredValues.filter(p => normalizedActualResults.includes(p)));
    const correctTeamsCount = uniqueCorrect.size;
    const allCorrect = correctTeamsCount === tableQuestions.length; // בונוס רק אם כל 8 נכונות
    return {
      basicScore: correctTeamsCount * 30,
      teamsBonus: allCorrect ? 20 : 0,
      orderBonus: 0,
      allCorrect,
      perfectOrder: false,
      correctTeamsCount
    };
  }

  // ספירת קבוצות נכונות ובדיקת מיקום מדויק (רק מהשאלות המושלמות)
  let correctTeamsCount = 0;
  let perfectOrder = true;

  for (let i = 0; i < completedQuestions.length; i++) {
    const question = completedQuestions[i];
    // ✅ predictions מגיע עם מפתח question.id (ID פנימי)
    const prediction = predictions[question.id];

    // 🔥 נרמל את הניחוש
    const normalizedPred = prediction ? prediction.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '').trim() : '';

    // בדוק אם הקבוצה המנוחשת נמצאת בכלל ברשימת התוצאות האמיתיות
    if (normalizedPred && normalizedActualResults.includes(normalizedPred)) {
      correctTeamsCount++;
    }

    // בדוק מיקום מדויק
    if (normalizedPred !== normalizedActualResults[i]) {
      perfectOrder = false;
    }
  }

  const allCorrect = correctTeamsCount === completedQuestions.length;
  perfectOrder = perfectOrder && allCorrect;

  // ניקוד בסיסי: 20 נקודות לכל קבוצה נכונה (30 ב-T19)
  const pointsPerTeam = isT19 ? 30 : 20;
  const basicScore = correctTeamsCount * pointsPerTeam;

  // בונוס עולות - רק אם ניחש את כל הקבוצות (לא משנה מיקום)
  let teamsBonus = 0;
  if (allCorrect) {
    if (isT17) {
      teamsBonus = 30;
    } else if (isT19) {
      teamsBonus = 20;
    } else {
      teamsBonus = 20; // T14, T15, T16
    }
  }

  // בונוס מיקום - רק אם כל הקבוצות במיקום מדויק (ולא T19)
  let orderBonus = 0;
  if (allCorrect && perfectOrder && !isT19) {
    if (isT17) {
      orderBonus = 50;
    } else {
      orderBonus = 40; // T14, T15, T16
    }
  }

  return { 
    basicScore,      // ניקוד בסיסי - רק אם כל הקבוצות נכונות
    teamsBonus,      // בונוס עולות - רק אם כל הקבוצות נכונות
    orderBonus,      // בונוס מיקום - רק אם כל הקבוצות במיקום מדויק
    allCorrect, 
    perfectOrder, 
    correctTeamsCount 
  };
}

// 🚀 פונקציה לניקוי cache (אם צריך)
export function clearScoreCache() {
  SCORE_CALCULATION_CACHE.clear();
  NORMALIZE_CACHE.clear();
}
