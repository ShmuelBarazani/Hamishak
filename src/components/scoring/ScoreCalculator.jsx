

// פונקציה משותפת לחישוב ניקוד - תשמש גם בצפייה וגם בדירוג
export function calculateQuestionScore(question, prediction, debugMode = false) {
  // ✅ פונקציה עזר - נורמליזציה של מחרוזת תוצאה (הסרת רווחים)
  const normalizeScore = (score) => {
    if (!score) return '';
    return score.replace(/\s+/g, '').trim(); // הסר את כל הרווחים
  };

  if (debugMode) {
    console.log(`🔍 DEBUG - חישוב ניקוד:`, {
      question_id: question.question_id,
      actual_result: question.actual_result,
      prediction: prediction,
      actual_result_type: typeof question.actual_result,
      prediction_type: typeof prediction
    });
  }

  // אם אין ניחוש
  if (!prediction || prediction.trim() === '') {
    if (debugMode) console.log(`   ❌ אין ניחוש - מחזיר null`);
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
  
  // הסרת רווחים
  actualResult = actualResult.trim();
  
  // בדיקה אם ריק
  if (actualResult === '' || actualResult === '__CLEAR__') {
    if (debugMode) console.log(`   ✅ Empty result - returning null`);
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
  if (question.home_team && question.away_team && normalizedActual.includes('-')) {
    const actualParts = normalizedActual.split('-').map(x => parseInt(x));
    const predParts = normalizedPred.split('-').map(x => parseInt(x));
    
    if (debugMode) {
      console.log(`   🔢 actualParts: [${actualParts}], predParts: [${predParts}]`);
    }
    
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
        return maxScore;
      }
      
      // קביעת תוצאת המשחק
      const actualResultType = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
      const predResult = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';
      
      if (debugMode) {
        console.log(`   🎯 תוצאה אמיתית: ${actualResultType}, ניחוש: ${predResult}`);
      }
      
      // אם לא ניחש נכון את התוצאה - 0 נקודות
      if (actualResultType !== predResult) {
        if (debugMode) console.log(`   ❌ לא ניחש נכון את התוצאה - 0 נקודות`);
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
        return diffScore;
      }
      
      // ניחוש נכון של התוצאה בלבד
      const resultOnlyScore = isIsraeliTable ? 2 : 5;
      if (debugMode) console.log(`   ✅ תוצאה נכונה בלבד! ${resultOnlyScore} נקודות`);
      return resultOnlyScore;
    }
  }
  
  // שאלות לא-משחק - השוואה ישירה אחרי נורמליזציה
  if (normalizedPred === normalizedActual) {
    const points = question.possible_points || 0;
    if (debugMode) console.log(`   ✅ תשובה נכונה! ${points} נקודות`);
    return points;
  }
  
  // יש תוצאה אמיתית אבל לא ניחש נכון
  if (debugMode) console.log(`   ❌ תשובה לא נכונה - 0 נקודות`);
  return 0;
}

// 🎁 פונקציה משופרת - חישוב בונוסים נפרדים עבור טבלאות מיקומים
export function calculateLocationTableBonus(tableId, tableQuestions, predictions) {
  // בדוק אם זו טבלת מיקומים
  if (!['T14', 'T15', 'T16', 'T17', 'T19'].includes(tableId)) {
    return null;
  }

  const isT17 = tableId === 'T17';
  const isT19 = tableId === 'T19';
  
  let expectedCount;
  if (isT17) {
    expectedCount = 12;
  } else if (isT19) {
    expectedCount = 8;
  } else {
    expectedCount = 8; // T14, T15, T16
  }

  // בדוק שיש מספיק שאלות
  if (tableQuestions.length !== expectedCount) {
    return null;
  }

  let correctCount = 0;
  let perfectOrder = true;

  // עבור על כל השאלות בטבלה
  for (let i = 0; i < tableQuestions.length; i++) {
    const question = tableQuestions[i];
    const prediction = predictions[question.id];
    const actualResult = question.actual_result;

    // אם אין תוצאה אמיתית - עדיין לא יודעים (אפור)
    if (!actualResult || actualResult.trim() === '' || actualResult === '__CLEAR__') {
      return null; // 🔄 שינוי: החזרת null במקום אובייקט עם false
    }

    // בדוק אם פגע בקבוצה
    if (prediction === actualResult) {
      correctCount++;
    } else {
      perfectOrder = false;
    }
  }

  const allCorrect = correctCount === expectedCount;
  perfectOrder = perfectOrder && allCorrect;

  let teamsBonus = 0;  // בונוס עולות
  let orderBonus = 0;  // בונוס מיקום

  if (allCorrect) {
    // בונוס על כל הקבוצות
    if (isT17) {
      teamsBonus = 30;
    } else {
      teamsBonus = 20; // T14, T15, T16, T19
    }
    
    // בונוס נוסף על סדר מושלם (רק אם לא T19)
    if (perfectOrder && !isT19) {
      if (isT17) {
        orderBonus = 50;
      } else {
        orderBonus = 40; // T14, T15, T16
      }
    }
  }

  return { teamsBonus, orderBonus, allCorrect, perfectOrder };
}
