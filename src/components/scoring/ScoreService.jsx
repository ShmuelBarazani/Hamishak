/**
 * 🎯 מערכת ניקוד
 *
 * כללי הניקוד:
 * - משחקים רגילים: 10 = תוצאה מדויקת | 7 = תוצאה + הפרש | 5 = תוצאה בלבד | 0 = טעות
 * - משחקים T20 (ישראלי): 6 = תוצאה מדויקת | 4 = תוצאה + הפרש | 2 = תוצאה בלבד | 0 = טעות
 * - שאלות טקסט: possible_points = נכון | 0 = טעות
 * - T4/T5/T6 (רשימות עולות): ניקוד לפי נוכחות — אין משמעות לסדר
 *
 * 🏆 בונוסי שלבים:
 * - T3  (שמינית גמר - משחקים):      כל המשחקים עם ניקוד > 0 → +16
 * - T4  (עולות לרבע גמר, 8 קבוצות): כל 8 הקבוצות → +16
 * - T5  (עולות לחצי גמר, 4 קבוצות): כל 4 הקבוצות → +12
 * - T6  (עולות לגמר, 2 קבוצות):     שתי הקבוצות   → +6
 */

// ─── קונפיגורציית טבלאות עולות ──────────────────────────────────────────────
const ADVANCING_TEAM_TABLES = {
  T4: { advancingCount: 8, bonusPoints: 16 },
  T5: { advancingCount: 4, bonusPoints: 12 },
  T6: { advancingCount: 2, bonusPoints: 6  },
};

// ── מזהי טבלאות מיקומים ──────────────────────────────────────────────────────
// כולל תמיכה דינמית: כל טבלה עם stage_type==='locations' תיחשב כטבלת מיקום
const LOCATION_TABLE_IDS = ['T14', 'T15', 'T16', 'T17'];

// ── ניקוד בונוס לטבלת מיקומים לפי מספר שאלות ──────────────────────────────
// T17: 30 קבוצות + 50 סדר / T19: 20 קבוצות בלבד / שאר: 20 קבוצות + 40 סדר
function getLocationBonusConfig(tableId, questionCount) {
  if (tableId === 'T17') return { teamsBonus: 30, orderBonus: 50 };
  if (tableId === 'T19') return { teamsBonus: 20, orderBonus: 0 };
  return { teamsBonus: 20, orderBonus: 40 };
}

// ======= פונקציות עזר =======

function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\s\u00A0\u200B\t\n\r‎‏]+/g, '')
    .trim();
}

function normalizeResult(text) {
  if (!text) return '';
  return String(text)
    .replace(/^(דקות?|מינוט[וס]?)\s*/i, '')
    .replace(/\s*\([^)]+\)\s*$/, '') // הסרת "(מדינה)" מסוף השם
    .replace(/\s+/g, ' ')
    .trim();
}

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

function parseScore(text) {
  if (!text) return [NaN, NaN];
  const str = normalizeResult(String(text).trim());
  const parts = str.split('-');
  if (parts.length !== 2) return [NaN, NaN];
  return [parseInt(parts[0].trim(), 10), parseInt(parts[1].trim(), 10)];
}

function getResultType(home, away) {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

function isAdvancingTeamSlot(question) {
  const config = ADVANCING_TEAM_TABLES[question.table_id];
  if (!config) return false;
  const numId = parseFloat(question.question_id);
  return Number.isInteger(numId) && numId >= 1 && numId <= config.advancingCount;
}

// ── בדיקה האם טבלה היא טבלת מיקומים ─────────────────────────────────────────
function isLocationTable(tableId, questions = []) {
  // לא טבלת מיקומים אם יש home_team (זו טבלת משחקים)
  if (questions.length > 0 && questions[0]?.home_team) return false;
  if (LOCATION_TABLE_IDS.includes(tableId)) return true;
  // תמיכה דינמית: stage_type==='locations'
  if (questions.length > 0 && questions[0]?.stage_type === 'locations') return true;
  return false;
}

// ======= חישוב ניקוד למשחק =======

export function calculateMatchScore(actualResult, prediction, isIsraeliTable = false) {
  if (!actualResult || actualResult === '__CLEAR__') return null;
  if (!prediction) return 0;
  if (!isScoreFormat(actualResult)) return null;
  if (!isScoreFormat(prediction)) return 0;

  const [actualHome, actualAway] = parseScore(actualResult);
  const [predHome, predAway] = parseScore(prediction);

  const PERFECT         = isIsraeliTable ? 6  : 10;
  const RESULT_AND_DIFF = isIsraeliTable ? 4  : 7;
  const RESULT_ONLY     = isIsraeliTable ? 2  : 5;

  if (actualHome === predHome && actualAway === predAway) return PERFECT;

  const actualType = getResultType(actualHome, actualAway);
  const predType   = getResultType(predHome,   predAway);

  if (actualType !== predType) return 0;

  const actualDiff = actualHome - actualAway;
  const predDiff   = predHome   - predAway;

  if (actualDiff === predDiff) return RESULT_AND_DIFF;
  return RESULT_ONLY;
}

// ======= חישוב ניקוד לשאלת טקסט =======

export function calculateTextScore(actualResult, prediction, possiblePoints) {
  if (!possiblePoints || possiblePoints === 0) return null;
  if (!actualResult || actualResult === '__CLEAR__' || actualResult === '0') return null;
  if (!prediction) return 0;

  const actualClean = cleanText(normalizeResult(actualResult)).toLowerCase();
  const predClean   = cleanText(normalizeResult(prediction)).toLowerCase();

  return actualClean === predClean ? possiblePoints : 0;
}

// ======= חישוב ניקוד לשאלה בודדת =======

export function calculateQuestionScore(question, prediction, allQuestionsInTable = [], allPredictions = {}) {
  if (question.table_id === 'T1') return null;

  if (!prediction || String(prediction).trim() === '') return null;

  let actualResult = question.actual_result;
  if (actualResult === null || actualResult === undefined) actualResult = '';
  if (typeof actualResult !== 'string') actualResult = String(actualResult);
  actualResult = actualResult.trim();

  if (
    actualResult === '' || actualResult === '__CLEAR__' ||
    actualResult === '-' || actualResult === 'null' ||
    actualResult === 'null-null' || actualResult === 'null - null'
  ) {
    return null;
  }

  const normalizedActual = normalizeResult(actualResult);
  const normalizedPred   = normalizeResult(String(prediction).trim());

  const isActualScore   = isScoreFormat(normalizedActual);
  const isPredScore     = isScoreFormat(normalizedPred);
  const isMatchQuestion = !!(question.home_team && question.away_team);

  // ── משחקים (תוצאת X-Y) ──────────────────────────────────────────────────
  if (isActualScore && isPredScore && isMatchQuestion) {
    const [actualHome, actualAway] = parseScore(normalizedActual);
    const [predHome,   predAway  ] = parseScore(normalizedPred);

    if (!isNaN(actualHome) && !isNaN(actualAway) && !isNaN(predHome) && !isNaN(predAway)) {
      const isIsraeliTable = question.table_id === 'T20';
      const maxScore = isIsraeliTable ? 6 : 10;

      if (actualHome === predHome && actualAway === predAway) return maxScore;

      const actualResultType = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
      const predResult       = predHome   > predAway   ? 'home' : predHome   < predAway   ? 'away' : 'draw';

      if (actualResultType !== predResult) return 0;

      const actualDiff = actualHome - actualAway;
      const predDiff   = predHome   - predAway;

      if (actualDiff === predDiff) return isIsraeliTable ? 4 : 7;
      return isIsraeliTable ? 2 : 5;
    }
  }

  // ── ניקוד לפי נוכחות — T4/T5/T6 (חריצי עולות, ללא משמעות לסדר) ─────────
  if (isAdvancingTeamSlot(question)) {
    const advancingActuals = allQuestionsInTable
      .filter(q => isAdvancingTeamSlot(q))
      .filter(q => q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__')
      .map(q => cleanText(normalizeResult(q.actual_result)).toLowerCase());

    const cleanPred = cleanText(normalizeResult(prediction)).toLowerCase();
    return advancingActuals.includes(cleanPred) ? (question.possible_points || 0) : 0;
  }

  // ── ניקוד לפי נוכחות — שאלות "מי עלה" בטבלאות T_TOP_FINISHERS/T_THIRD_PLACE ──
  // T11/T12/T13 נשקלות לפי השוואה מדויקת (לא נוכחות) — בשלב הבתים הן כן/לא
  const isPresenceStage  = ['T_TOP_FINISHERS'].includes(question.table_id);
  const isThirdPlaceMain = question.table_id === 'T_THIRD_PLACE' && !question.question_id.includes('.');

  if (isPresenceStage || isThirdPlaceMain) {
    const actualTeams = allQuestionsInTable
      .filter(q => q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__')
      .map(q => cleanText(normalizeResult(q.actual_result)).toLowerCase());

    const cleanPred = cleanText(normalizeResult(prediction)).toLowerCase();
    return actualTeams.includes(cleanPred) ? (question.possible_points || 0) : 0;
  }

  // ── טבלאות מיקומים — ניקוד מחושב ברמת הטבלה בלבד (כמו BASE44) ──────────
  // calculateLocationBonus מחשב הכל: ניקוד בסיסי + בונוסים
  if (isLocationTable(question.table_id, allQuestionsInTable)) {
    return null; // לא מחשבים ניקוד ברמת שאלה בודדת
  }

  // ── שאלות טקסט רגילות ────────────────────────────────────────────────────
  const cleanActual = cleanText(normalizedActual).toLowerCase();
  const cleanPred   = cleanText(normalizedPred).toLowerCase();

  return cleanActual === cleanPred ? (question.possible_points || 0) : 0;
}

export function getMaxScore(question) {
  if (question.table_id === 'T1') return 0;
  const isMatchQuestion = !!(question.home_team && question.away_team);
  if (isMatchQuestion && isScoreFormat(question.actual_result)) {
    return question.table_id === 'T20' ? 6 : 10;
  }
  return question.possible_points || 0;
}

// ======= בונוסים לטבלאות מיקומים =======
// 🔧 תיקון: לא מסתמך על מספר שאלות קבוע — מחשב דינמית לפי מה שיש

export function calculateLocationBonus(tableId, questions, predictions) {
  // בדיקה האם זו טבלת מיקומים (לפי ID או stage_type)
  if (!isLocationTable(tableId, questions)) return null;

  // סינון שאלות ראשיות בלבד (question_id שלם, לא תתי-שאלות)
  const mainQuestions = questions.filter(q => {
    const n = parseFloat(q.question_id);
    return Number.isInteger(n) && n >= 1;
  });

  if (mainQuestions.length === 0) return null;

  const allHaveResults = mainQuestions.every(q =>
    q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__'
  );
  if (!allHaveResults) return null;

  // ניקוד לפי נוכחות — האם הקבוצה מופיעה בטבלה, ללא תלות במיקום
  const actualTeams = new Set(
    mainQuestions
      .map(q => cleanText(normalizeResult(q.actual_result)).toLowerCase())
      .filter(Boolean)
  );

  let correctTeams = 0;
  let perfectOrder = true;

  for (const q of mainQuestions) {
    const pred     = predictions[q.id];
    const predClean = cleanText(normalizeResult(pred || '')).toLowerCase();
    const actClean  = cleanText(normalizeResult(q.actual_result)).toLowerCase();

    // נוכחות: האם הניחוש מופיע בין הקבוצות האמיתיות
    if (predClean && actualTeams.has(predClean)) {
      correctTeams++;
    }
    // סדר מדויק: האם הניחוש תואם לאותו מיקום בדיוק
    if (predClean !== actClean) {
      perfectOrder = false;
    }
  }

  const allCorrect = correctTeams === mainQuestions.length;

  // ניקוד בסיסי: נוכחות לכל קבוצה נכונה (20 נקודות לכל קבוצה, 30 ב-T19)
  const pointsPerTeam = tableId === 'T19' ? 30 : 20;
  const basicScore = correctTeams * pointsPerTeam;

  // בונוס עולות: רק אם כל הקבוצות נכונות
  let teamsBonus = 0;
  if (allCorrect) {
    if (tableId === 'T17') teamsBonus = 30;
    else teamsBonus = 20; // T14, T15, T16, T19
  }

  // בונוס מיקום: רק אם כל הקבוצות נכונות ובמיקום מדויק (לא T19)
  let orderBonus = 0;
  if (allCorrect && perfectOrder && tableId !== 'T19') {
    if (tableId === 'T17') orderBonus = 50;
    else orderBonus = 40; // T14, T15, T16
  }

  return {
    basicScore,
    teamsBonus,
    orderBonus,
    total: basicScore + teamsBonus + orderBonus,
    allCorrect,
    perfectOrder,
    correctTeams,
    totalTeams: mainQuestions.length,
  };
}

// ======= 🏆 בונוסי שלבים =======

function calculateT3Bonus(t3Questions, predictions) {
  if (t3Questions.length === 0) return 0;

  const allHaveResults = t3Questions.every(q =>
    q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__'
  );
  if (!allHaveResults) return 0;

  const allScored = t3Questions.every(q => {
    const pred  = predictions[q.id];
    const score = calculateQuestionScore(q, pred, t3Questions, predictions);
    return score !== null && score > 0;
  });

  return allScored ? 16 : 0;
}

function calculateAdvancingBonus(tableId, allQuestions, predictions) {
  const config = ADVANCING_TEAM_TABLES[tableId];
  if (!config) return 0;

  const advancingSlots = allQuestions.filter(
    q => q.table_id === tableId && isAdvancingTeamSlot(q)
  );

  if (advancingSlots.length !== config.advancingCount) return 0;

  const allHaveResults = advancingSlots.every(q =>
    q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__'
  );
  if (!allHaveResults) return 0;

  const actualSet = new Set(
    advancingSlots.map(q => cleanText(normalizeResult(q.actual_result)).toLowerCase())
  );

  const guessedSet = new Set(
    advancingSlots
      .map(q => {
        const pred = predictions[q.id];
        return pred ? cleanText(normalizeResult(pred)).toLowerCase() : null;
      })
      .filter(Boolean)
  );

  const allGuessed = [...actualSet].every(team => guessedSet.has(team));
  return allGuessed ? config.bonusPoints : 0;
}

// ======= חישוב ניקוד כולל למשתתף =======

export function calculateTotalScore(questions, predictions) {
  let total = 0;
  const breakdown = [];
  const tableQuestions = {};

  for (const q of questions) {
    if (!tableQuestions[q.table_id]) tableQuestions[q.table_id] = [];
    tableQuestions[q.table_id].push(q);
  }

  // ── ניקוד בסיסי ──
  for (const q of questions) {
    if (q.table_id === 'T1') continue;

    const pred = predictions[q.id];
    const questionsInTable = tableQuestions[q.table_id] || [];
    const score = calculateQuestionScore(q, pred, questionsInTable, predictions);

    if (score !== null) {
      total += score;
      breakdown.push({
        question_id:      q.id,
        question_id_text: q.question_id,
        table_id:         q.table_id,
        score,
        max_score: getMaxScore(q),
      });
    }
  }

  // ── בונוסי מיקומים — כולל תמיכה דינמית בטבלאות מיקומים ──
  // מזהה את כל טבלאות המיקומים לפי ID ידוע + stage_type==='locations'
  const locationTableIds = new Set([
    ...LOCATION_TABLE_IDS,
    ...Object.keys(tableQuestions).filter(tid =>
      tableQuestions[tid]?.[0]?.stage_type === 'locations' &&
      !tableQuestions[tid]?.[0]?.home_team  // אל תכלול טבלאות משחקים
    )
  ]);

  for (const tableId of locationTableIds) {
    const tQuestions = tableQuestions[tableId];
    if (!tQuestions) continue;

    const bonus = calculateLocationBonus(tableId, tQuestions, predictions);
    if (bonus && bonus.total > 0) {
      total += bonus.total;
      if (bonus.basicScore > 0) {
        breakdown.push({
          question_id: `${tableId}_BASIC`, question_id_text: 'ניקוד מיקומים',
          table_id: tableId, score: bonus.basicScore, max_score: bonus.basicScore, isBonus: false,
        });
      }
      if (bonus.teamsBonus > 0) {
        breakdown.push({
          question_id: `${tableId}_TEAMS`, question_id_text: 'בונוס קבוצות',
          table_id: tableId, score: bonus.teamsBonus, max_score: bonus.teamsBonus, isBonus: true,
        });
      }
      if (bonus.orderBonus > 0) {
        breakdown.push({
          question_id: `${tableId}_ORDER`, question_id_text: 'בונוס סדר',
          table_id: tableId, score: bonus.orderBonus, max_score: bonus.orderBonus, isBonus: true,
        });
      }
    }
  }

  // ─── 🏆 בונוס 1 — T3 ──────────────────────────────────────────────────────
  const t3Bonus = calculateT3Bonus(tableQuestions['T3'] || [], predictions);
  if (t3Bonus > 0) {
    total += t3Bonus;
    breakdown.push({
      question_id:      'T3_STAGE_BONUS',
      question_id_text: '🏆 בונוס שלב — שמינית הגמר',
      table_id:         'T3',
      score:     t3Bonus,
      max_score: t3Bonus,
      isBonus:   true,
      bonusDescription: 'ניקוד בכל משחקי שמינית הגמר',
    });
  }

  // ─── 🏆 בונוסים 2/3/4 — T4/T5/T6 ────────────────────────────────────────
  const BONUS_LABELS = {
    T4: { label: '🏆 בונוס שלב — רבע גמר',  desc: 'ניחש את כל 8 קבוצות רבע הגמר' },
    T5: { label: '🏆 בונוס שלב — חצי גמר', desc: 'ניחש את כל 4 קבוצות חצי הגמר' },
    T6: { label: '🏆 בונוס שלב — גמר',       desc: 'ניחש את שתי קבוצות הגמר'        },
  };

  for (const tableId of ['T4', 'T5', 'T6']) {
    const advBonus = calculateAdvancingBonus(tableId, questions, predictions);
    if (advBonus > 0) {
      total += advBonus;
      const { label, desc } = BONUS_LABELS[tableId];
      breakdown.push({
        question_id:      `${tableId}_STAGE_BONUS`,
        question_id_text: label,
        table_id:         tableId,
        score:     advBonus,
        max_score: advBonus,
        isBonus:   true,
        bonusDescription: desc,
      });
    }
  }

  return { total, breakdown };
}

// ======= חישוב ניקוד לכל המשתתפים =======

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
