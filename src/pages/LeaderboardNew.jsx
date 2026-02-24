import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, RefreshCw, Loader2, Crown, TrendingUp, TrendingDown, Minus, Users, Target, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";
import { calculateTotalScore } from "@/components/scoring/ScoreService";

export default function LeaderboardNew() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [settingBaseline, setSettingBaseline] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantDetails, setParticipantDetails] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [avgScore, setAvgScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const [sortColumn, setSortColumn] = useState('current_position');
  const [sortDirection, setSortDirection] = useState('asc');
  const [debugData, setDebugData] = useState(null);
  const [showDebugDialog, setShowDebugDialog] = useState(false);
  const { toast } = useToast();
  const { currentGame } = useGame();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
        if (isAuth) {
          const user = await supabase.auth.getUser().then(r => r.data.user);
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
      } catch (error) {
        console.error("Failed to load current user:", error);
        setCurrentUser(null);
      }
    };
    loadUser();
  }, []);

  const formatScore = (score) => {
    if (!score || score === '__CLEAR__') return '';
    if (score.includes('-')) {
      const parts = score.split('-').map(x => x.trim());
      return parts.join(' - ');
    }
    return score;
  };

  // 🔥 פונקציית עזר לחישוב ניקוד משתתף - אותה לוגיקה בדיוק כמו החלון הצף
  const calculateParticipantScore = (allQuestions, predictions) => {
    // בנה מפת ניחושים - רק הניחוש האחרון לכל שאלה
    const tempPreds = {};
    predictions.forEach(pred => {
      const existing = tempPreds[pred.question_id];
      if (!existing || new Date(pred.created_date) > new Date(existing.created_date)) {
        tempPreds[pred.question_id] = pred;
      }
    });

    // המר למפה פשוטה
    const predMap = {};
    for (const [qid, pred] of Object.entries(tempPreds)) {
      predMap[qid] = pred.text_prediction;
    }

    // חשב ניקוד כולל באמצעות calculateTotalScore
    const { total, breakdown } = calculateTotalScore(allQuestions, predMap);
    return { total, breakdown };
  };

  const loadRankings = useCallback(async () => {
    if (!currentGame) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log('🔄 טוען דירוג עבור משחק:', currentGame.id, currentGame.game_name);

      // 1️⃣ טען שאלות
      let allQuestions = [];
      let questionSkip = 0;
      const BATCH = 5000;
      while (true) {
        const batch = await db.Question.filter({ game_id: currentGame.id }, null, BATCH, questionSkip);
        allQuestions = [...allQuestions, ...batch];
        console.log(`   📊 שאלות: נטענו ${batch.length}, סה"כ ${allQuestions.length}`);
        if (batch.length < BATCH) break;
        questionSkip += BATCH;
      }
      console.log(`✅ נטענו ${allQuestions.length} שאלות`);

      // 2️⃣ טען ניחושים
      let allPredictions = [];
      let skip = 0;
      while (true) {
        console.log(`   🔄 מבקש ניחושים: skip=${skip}, limit=${BATCH}`);
        const batch = await db.Prediction.filter({ game_id: currentGame.id }, null, BATCH, skip);
        console.log(`   📊 התקבלו ${batch.length} ניחושים בקבוצה זו`);
        allPredictions = [...allPredictions, ...batch];
        console.log(`   📊 סה"כ עד עכשיו: ${allPredictions.length} ניחושים`);
        if (batch.length < BATCH) {
          console.log(`   ⛔ עוצר - קיבלנו פחות מ-${BATCH} (${batch.length})`);
          break;
        }
        skip += BATCH;
      }
      console.log(`✅ סה"כ נטענו ${allPredictions.length} ניחושים`);

      // 3️⃣ סנן רק שאלות מ-T2 ומעלה - זהה לחלון הצף
      allQuestions = allQuestions.filter(q => q.table_id && q.table_id !== 'T1');
      console.log(`✅ ${allQuestions.length} שאלות אחרי סינון T1`);

      // 4️⃣ חלץ קבוצות לשאלות
      allQuestions.forEach(q => {
        if (!q.home_team && !q.away_team && q.question_text) {
          let teams = null;
          if (q.question_text.includes(' נגד ')) {
            teams = q.question_text.split(' נגד ').map(t => t.trim());
          } else if (q.question_text.includes(' - ')) {
            teams = q.question_text.split(' - ').map(t => t.trim());
          }
          if (teams && teams.length === 2) {
            q.home_team = teams[0];
            q.away_team = teams[1];
          }
        }
      });

      // 5️⃣ קבץ ניחושים לפי משתתף
      const participantPredictions = {};
      allPredictions.forEach(pred => {
        if (!pred.participant_name || pred.participant_name.trim() === '') return;

        if (!participantPredictions[pred.participant_name]) {
          participantPredictions[pred.participant_name] = [];
        }
        participantPredictions[pred.participant_name].push(pred);
      });

      console.log(`✅ ${Object.keys(participantPredictions).length} משתתפים`);

      // 6️⃣ חשב ניקוד לכל משתתף - בדיוק כמו החלון הצף
      const participantScores = [];
      for (const [name, predictions] of Object.entries(participantPredictions)) {
        const { total } = calculateParticipantScore(allQuestions, predictions);
        participantScores.push({ participant_name: name, current_score: total });
      }

      // 7️⃣ מיין
      participantScores.sort((a, b) => b.current_score - a.current_score);

      // 8️⃣ הוסף מיקומים
      let position = 1;
      for (let i = 0; i < participantScores.length; i++) {
        if (i > 0 && participantScores[i].current_score !== participantScores[i-1].current_score) {
          position = i + 1;
        }
        participantScores[i].current_position = position;
      }

      // 9️⃣ טען baseline
      const baselines = await db.Ranking.filter({ game_id: currentGame.id }, null, 1000);
      const baselineMap = {};
      baselines.forEach(b => { baselineMap[b.participant_name] = b; });

      // 🔟 בנה rankings
      const rankings = participantScores.map(p => {
        const baseline = baselineMap[p.participant_name];
        return {
          participant_name: p.participant_name,
          id: baseline?.id || `temp-${p.participant_name}`,
          game_id: currentGame.id,
          current_score: p.current_score,
          current_position: p.current_position,
          previous_score: baseline?.current_score || 0,
          previous_position: baseline?.current_position || 0,
          baseline_score: baseline?.baseline_score || 0,
          baseline_position: baseline?.baseline_position || 0,
          score_change: p.current_score - (baseline?.current_score || 0),
          position_change: (baseline?.current_position || 0) - p.current_position,
          last_updated: new Date().toISOString(),
          last_baseline_set: baseline?.last_baseline_set || null
        };
      });

      console.log(`✅ ${rankings.length} משתתפים בדירוג`);
      setRankings(rankings);

      // 1️⃣1️⃣ סטטיסטיקות
      if (rankings.length > 0) {
        const scores = rankings.map(r => r.current_score);
        setAvgScore(scores.reduce((a,b) => a+b, 0) / scores.length);
        setMaxScore(Math.max(...scores));
        setMinScore(Math.min(...scores));
      }
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "שגיאה", description: "טעינת הדירוג נכשלה", variant: "destructive" });
    }
    setLoading(false);
  }, [currentGame, toast]);

  useEffect(() => {
    loadRankings();
  }, [loadRankings, currentGame]);

  // 🔍 פונקציית DEBUG - מציגה בדיוק מה שמוצג בטבלת הדירוג
  const debugCompareScores = async () => {
    console.log('🔍 DEBUG נלחץ!');
    if (!currentGame) {
      console.log('❌ אין משחק נוכחי');
      return;
    }
    
    console.log('🔍 ===== DEBUG: מציג ניקוד בדיוק כמו טבלת הדירוג =====');
    
    try {
      const participantName = 'עדי חן';
      
      // 🔥 השתמש באותו קוד בדיוק כמו loadRankings!
      
      // 1️⃣ טען שאלות (debugCompareScores)
      const BATCH3 = 5000;
      let allQuestions = [];
      let questionSkip = 0;
      while (true) {
        const batch = await db.Question.filter({ game_id: currentGame.id }, null, BATCH3, questionSkip);
        allQuestions = [...allQuestions, ...batch];
        if (batch.length < BATCH3) break;
        questionSkip += BATCH3;
      }

      // 2️⃣ טען ניחושים של המשחק (debugCompareScores)
      let allPredictions = [];
      let skip = 0;
      while (true) {
        const batch = await db.Prediction.filter({ game_id: currentGame.id }, null, BATCH3, skip);
        allPredictions = [...allPredictions, ...batch];
        if (batch.length < BATCH3) break;
        skip += BATCH3;
      }

      // 3️⃣ סנן רק ניחושים תקינים
      allPredictions = allPredictions.filter(p => 
        p.participant_name && 
        p.participant_name.trim() !== ''
      );

      // 4️⃣ חלץ קבוצות לכל שאלה (אם חסר)
      allQuestions.forEach(q => {
        if (!q.home_team && !q.away_team && q.question_text) {
          let teams = null;
          if (q.question_text.includes(' נגד ')) {
            teams = q.question_text.split(' נגד ').map(t => t.trim());
          } else if (q.question_text.includes(' - ')) {
            teams = q.question_text.split(' - ').map(t => t.trim());
          }
          if (teams && teams.length === 2) {
            q.home_team = teams[0];
            q.away_team = teams[1];
          }
        }
      });

      // 5️⃣ סנן רק ניחושים של המשתתף הנבחר
      const participantPredictions = allPredictions.filter(p => p.participant_name === participantName);

      // 6️⃣ בנה מפת ניחושים - רק האחרון לכל שאלה
      const tempPredictions = {};
      participantPredictions.forEach((pred) => {
        const existing = tempPredictions[pred.question_id];
        if (!existing || new Date(pred.created_date) > new Date(existing.created_date)) {
          tempPredictions[pred.question_id] = pred;
        }
      });

      // 7️⃣ המר למפה פשוטה - בדיוק כמו loadRankings
      const tempPreds = {};
      for (const [qid, pred] of Object.entries(tempPredictions)) {
        tempPreds[qid] = {
          text_prediction: pred.text_prediction,
          created_date: pred.created_date
        };
      }

      const predictionsMapSimple = {};
      for (const [qid, data] of Object.entries(tempPreds)) {
        predictionsMapSimple[qid] = data.text_prediction;
      }

      // 8️⃣ חשב ניקוד - בדיוק כמו loadRankings
      const { total: leaderboardTotal, breakdown } = calculateTotalScore(allQuestions, predictionsMapSimple);

      // 🔍 בדיקת שאלות T2-T11
      const t2t11Questions = allQuestions.filter(q => {
        const tNum = parseInt(q.table_id.replace('T', ''));
        return tNum >= 2 && tNum <= 11;
      });

      const t2t11WithResults = t2t11Questions.filter(q => q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__');
      const t2t11WithPreds = t2t11Questions.filter(q => predictionsMapSimple[q.id] && predictionsMapSimple[q.id].trim() !== '');
      const t2t11WithScore = breakdown.filter(b => {
        const tNum = parseInt(b.table_id?.replace('T', '') || '0');
        return tNum >= 2 && tNum <= 11 && b.score > 0;
      });

      console.log(`🔍 ${participantName}:`);
      console.log(`  📊 ניקוד כולל: ${leaderboardTotal}`);
      console.log(`  📊 T2-T11: ${t2t11Questions.length} שאלות, ${t2t11WithResults.length} עם תוצאות, ${t2t11WithPreds.length} עם ניחושים, ${t2t11WithScore.length} עם ניקוד`);
      
      // 🔍 בדיקה מפורטת של שאלות T2-T12
      console.log('🔍 בודק שאלות T2-T12:');
      const t2t12Questions = allQuestions.filter(q => {
        const tNum = parseInt(q.table_id.replace('T', ''));
        return tNum >= 2 && tNum <= 12;
      });
      
      console.log(`✅ נמצאו ${t2t12Questions.length} שאלות בטבלאות T2-T12`);
      
      let hasResults = 0;
      let hasPredictions = 0;
      let hasScore = 0;
      
      t2t12Questions.forEach(q => {
        const pred = predictionsMapSimple[q.id];
        const hasResult = q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__';
        
        if (hasResult) hasResults++;
        if (pred) hasPredictions++;
        
        const scoreItem = breakdown.find(b => b.question_id === q.id);
        if (scoreItem && scoreItem.score > 0) hasScore++;
        
        if (pred && hasResult) {
          console.log(`  ${q.table_id} - שאלה ${q.question_id}: ניחוש="${pred}", תוצאה="${q.actual_result}", ניקוד=${scoreItem?.score || 0}`);
        }
      });
      
      console.log(`📊 T2-T12: ${hasResults} עם תוצאות, ${hasPredictions} עם ניחושים, ${hasScore} עם ניקוד`);

      // 9️⃣ בנה טבלה להצגה - כל השאלות (גם עם וגם בלי ניקוד)
      const allComparison = [];
      const withScoreComparison = [];
      
      for (const item of breakdown) {
        const question = allQuestions.find(q => q.id === item.question_id);
        if (!question) continue;

        const row = {
          'טבלה': item.table_id,
          'שאלה': item.question_id_text || question.question_id,
          'טקסט שאלה': question.question_text || `${question.home_team || ''} - ${question.away_team || ''}`,
          'ניחוש': predictionsMapSimple[question.id] || '-',
          'תוצאה': question.actual_result || '-',
          'ניקוד': item.score,
          'מקסימום': item.max_score,
          'בונוס?': item.isBonus ? '✅' : ''
        };
        
        allComparison.push(row);
        if (item.score > 0) {
          withScoreComparison.push(row);
        }
      }
      
      // שמור ל-state
      setDebugData({
        participantName,
        leaderboardTotal,
        comparison: allComparison,
        withScoreOnly: withScoreComparison,
        stats: {
          totalQuestions: allQuestions.length,
          totalPredictions: participantPredictions.length,
          uniquePredictions: Object.keys(predictionsMapSimple).length,
          questionsWithScore: withScoreComparison.length,
          totalBreakdown: breakdown.length
        }
      });
      setShowDebugDialog(true);

      console.log(`✅ ${withScoreComparison.length} שאלות עם ניקוד, ${allComparison.length} סה"כ`);
      
    } catch (error) {
      console.error('❌ שגיאה ב-debug:', error);
      toast({
        title: "שגיאה",
        description: "לא ניתן להפעיל DEBUG",
        variant: "destructive"
      });
    }
  };

  const handleRecalculateScores = async () => {
    if (!currentGame) return;

    setRecalculating(true);
    try {
      console.log("📊 מחשב ניקוד בזמן אמת מ-Questions + Predictions (זהה לחלון הצף)...");

      // 1️⃣ טען שאלות (handleRecalculateScores)
      const BATCH2 = 5000;
      let allQuestions = [];
      let questionSkip = 0;
      while (true) {
        const batch = await db.Question.filter({ game_id: currentGame.id }, null, BATCH2, questionSkip);
        allQuestions = [...allQuestions, ...batch];
        if (batch.length < BATCH2) break;
        questionSkip += BATCH2;
      }
      console.log(`✅ נטענו ${allQuestions.length} שאלות`);

      // 2️⃣ טען ניחושים (handleRecalculateScores)
      let allPredictions = [];
      let skip = 0;
      while (true) {
        const batch = await db.Prediction.filter({ game_id: currentGame.id }, null, BATCH2, skip);
        allPredictions = [...allPredictions, ...batch];
        if (batch.length < BATCH2) break;
        skip += BATCH2;
      }
      console.log(`✅ נטענו ${allPredictions.length} ניחושים`);

      // 3️⃣ סנן רק שאלות מ-T2 ומעלה
      allQuestions = allQuestions.filter(q => q.table_id && q.table_id !== 'T1');
      console.log(`✅ ${allQuestions.length} שאלות אחרי סינון T1`);

      // 4️⃣ חלץ קבוצות לשאלות
      allQuestions.forEach(q => {
        if (!q.home_team && !q.away_team && q.question_text) {
          let teams = null;
          if (q.question_text.includes(' נגד ')) {
            teams = q.question_text.split(' נגד ').map(t => t.trim());
          } else if (q.question_text.includes(' - ')) {
            teams = q.question_text.split(' - ').map(t => t.trim());
          }
          if (teams && teams.length === 2) {
            q.home_team = teams[0];
            q.away_team = teams[1];
          }
        }
      });

      // 5️⃣ קבץ ניחושים לפי משתתף
      const participantPredictions = {};
      allPredictions.forEach(pred => {
        if (!pred.participant_name || pred.participant_name.trim() === '') return;

        if (!participantPredictions[pred.participant_name]) {
          participantPredictions[pred.participant_name] = [];
        }
        participantPredictions[pred.participant_name].push(pred);
      });

      console.log(`✅ ${Object.keys(participantPredictions).length} משתתפים`);

      // 6️⃣ חשב ניקוד לכל משתתף - בדיוק כמו החלון הצף
      const participantScores = [];
      for (const [name, predictions] of Object.entries(participantPredictions)) {
        const { total } = calculateParticipantScore(allQuestions, predictions);
        participantScores.push({ participant_name: name, current_score: total });
      }

      // 7️⃣ מיין
      participantScores.sort((a, b) => b.current_score - a.current_score);

      // 8️⃣ הוסף מיקומים
      let position = 1;
      for (let i = 0; i < participantScores.length; i++) {
        if (i > 0 && participantScores[i].current_score !== participantScores[i-1].current_score) {
          position = i + 1;
        }
        participantScores[i].current_position = position;
      }

      // 9️⃣ טען baseline
      const baselines = await db.Ranking.filter({ game_id: currentGame.id }, null, 1000);
      const baselineMap = {};
      baselines.forEach(b => { baselineMap[b.participant_name] = b; });

      // 🔟 עדכן/צור רשומות Ranking
      for (let i = 0; i < participantScores.length; i++) {
        const p = participantScores[i];
        const baseline = baselineMap[p.participant_name];

        const data = {
          participant_name: p.participant_name,
          game_id: currentGame.id,
          current_score: p.current_score,
          current_position: p.current_position,
          previous_score: baseline?.current_score || 0,
          previous_position: baseline?.current_position || 0,
          baseline_score: baseline?.baseline_score || 0,
          baseline_position: baseline?.baseline_position || 0,
          score_change: p.current_score - (baseline?.baseline_score || 0),
          position_change: (baseline?.baseline_position || 0) - p.current_position,
          last_updated: new Date().toISOString(),
          last_baseline_set: baseline?.last_baseline_set || null
        };

        try {
          if (baseline) {
            await db.Ranking.update(baseline.id, data);
          } else {
            await db.Ranking.create(data);
          }
          console.log(`✅ ${p.participant_name}: ${p.current_score} נקודות, מיקום ${p.current_position}`);
        } catch (err) {
          console.error(`❌ שגיאה בשמירת ${p.participant_name}:`, err);
        }

        // עיכוב של שנייה אחרי כל שמירה למניעת rate limit
        await new Promise(r => setTimeout(r, 1000));
      }

      toast({ 
        title: "הצלחה!", 
        description: `עודכן דירוג עבור ${participantScores.length} משתתפים - חישוב זהה לחלון הצף`,
        className: "bg-cyan-900/30 border-cyan-500 text-cyan-200"
      });
      loadRankings();
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    }
    setRecalculating(false);
  };

  const handleSetBaseline = async () => {
    if (!currentGame) return;
    
    if (!window.confirm('📌 האם לקבוע את הדירוג הנוכחי כנקודת ייחוס?\n\nהחישוב הבא יציג שינויים ביחס לנקודה זו.')) {
      return;
    }

    setSettingBaseline(true);
    try {
      console.log("📌 קובע נקודת ייחוס...");
      
      const allRankings = await db.Ranking.filter({ game_id: currentGame.id }, null, 1000);
      const now = new Date().toISOString();
      
      console.log(`⏳ מעדכן ${allRankings.length} רשומות בקבוצות...`);
      
      // עדכון בקבוצות של 2 עם השהייה
      for (let i = 0; i < allRankings.length; i += 2) {
        const batch = allRankings.slice(i, i + 2);
        await Promise.all(batch.map(ranking => 
          db.Ranking.update(ranking.id, {
            baseline_score: ranking.current_score,
            baseline_position: ranking.current_position,
            last_baseline_set: now
          })
        ));
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`   ✅ עודכנו ${Math.min(i + 2, allRankings.length)}/${allRankings.length}`);
      }
      
      console.log(`✅ נקודת ייחוס נקבעה עבור ${allRankings.length} משתתפים`);
      
      toast({
        title: "נקודת ייחוס נקבעה!",
        description: `הדירוג הנוכחי נשמר. החישוב הבא יציג שינויים ביחס לנקודה זו.`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });
      
      loadRankings();
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    }
    setSettingBaseline(false);
  };

  const loadParticipantDetails = async (participantName) => {
    if (!currentGame) return;

    try {
      console.log(`📊 טוען פרטי ${participantName}...`);

      // 🔥 טען שאלות עם פגינציה (loadParticipantDetails)
      const BATCH4 = 5000;
      let allQuestions = [];
      let questionSkip = 0;
      while (true) {
        const batch = await db.Question.filter({ game_id: currentGame.id }, null, BATCH4, questionSkip);
        allQuestions = [...allQuestions, ...batch];
        if (batch.length < BATCH4) break;
        questionSkip += BATCH4;
      }

      // 🔥 טען ניחושים עם פגינציה (loadParticipantDetails)
      let allPredictions = [];
      let skip = 0;
      while (true) {
        const batch = await db.Prediction.filter({ 
          participant_name: participantName,
          game_id: currentGame.id 
        }, null, BATCH4, skip);
        allPredictions = [...allPredictions, ...batch];
        if (batch.length < BATCH4) break;
        skip += BATCH4;
      }

      // סנן רק שאלות מ-T2 ומעלה (כמו בטבלת הדירוג)
      allQuestions = allQuestions.filter(q => q.table_id && q.table_id !== 'T1');

      const allTeams = currentGame.teams_data || [];
      const teamsMap = allTeams.reduce((acc, t) => { acc[t.name] = t; return acc; }, {});

      // חלץ קבוצות לכל שאלה
      allQuestions.forEach(q => {
        if (!q.home_team && !q.away_team && q.question_text) {
          let teams = null;
          if (q.question_text.includes(' נגד ')) {
            teams = q.question_text.split(' נגד ').map(t => t.trim());
          } else if (q.question_text.includes(' - ')) {
            teams = q.question_text.split(' - ').map(t => t.trim());
          }
          if (teams && teams.length === 2) {
            q.home_team = teams[0];
            q.away_team = teams[1];
          }
        }
      });

      // 🔥 השתמש בפונקציית העזר
      const { total: totalScore, breakdown } = calculateParticipantScore(allQuestions, allPredictions);

      const enrichedScores = breakdown.map(item => {
        const question = allQuestions.find(q => q.id === item.question_id);
        if (!question) return null;

        const pred = allPredictions.find(p => p.question_id === item.question_id);
        
        return {
          question_id: question.id,
          score: item.score,
          max_score: item.max_score,
          table_id: item.table_id || '?',
          question_id_display: item.question_id_text || question.question_id || '?',
          question_text: question.question_text || '',
          home_team: question.home_team,
          away_team: question.away_team,
          actual_result: formatScore(question.actual_result || ''),
          prediction: formatScore(pred?.text_prediction || ''),
          home_team_logo: question.home_team ? teamsMap[question.home_team]?.logo_url : null,
          away_team_logo: question.away_team ? teamsMap[question.away_team]?.logo_url : null,
          isBonus: item.isBonus || false
        };
      }).filter(s => s !== null);

        // סנן רק שאלות עם ניקוד גדול מ-0
        const filteredScores = enrichedScores.filter(s => s.score > 0);

        // מיון לפי table_id ואז question_id
        filteredScores.sort((a, b) => {
        const tableA = parseInt(a.table_id.replace('T', '')) || 999;
        const tableB = parseInt(b.table_id.replace('T', '')) || 999;
        if (tableA !== tableB) return tableA - tableB;

        const qA = parseFloat(a.question_id_display) || 999;
        const qB = parseFloat(b.question_id_display) || 999;
        return qA - qB;
        });

        setParticipantDetails({
          name: participantName,
          scores: filteredScores,
          totalScore: totalScore
        });
      setSelectedParticipant(participantName);
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "שגיאה", description: "טעינת הפרטים נכשלה", variant: "destructive" });
    }
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      // Set default sort direction based on column type
      if (['current_score', 'previous_score', 'score_change', 'position_change'].includes(column)) {
        setSortDirection('desc'); // Usually for scores/changes, descending is default
      } else {
        setSortDirection('asc'); // For position and name, ascending is default
      }
    }
  };

  const getSortedRankings = () => {
    const sorted = [...rankings];
    
    sorted.sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      
      // מיון לפי שם - בסדר אלפביתי
      if (sortColumn === 'participant_name') {
        aVal = String(aVal || ''); // Ensure it's a string for localeCompare
        bVal = String(bVal || '');
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal, 'he')
          : bVal.localeCompare(aVal, 'he');
      }
      
      // מיון מספרי
      aVal = Number(aVal) || 0; // Ensure it's a number, default to 0
      bVal = Number(bVal) || 0;
      
      if (sortDirection === 'asc') {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });
    
    return sorted;
  };

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-2.5 h-2.5 md:w-4 md:h-4 opacity-30" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-2.5 h-2.5 md:w-4 md:h-4" style={{ color: '#06b6d4' }} />
      : <ArrowDown className="w-2.5 h-2.5 md:w-4 md:h-4" style={{ color: '#06b6d4' }} />;
  };

  const getPositionIcon = (position) => {
    if (position === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (position === 2) return <Trophy className="w-5 h-5 text-gray-400" />;
    if (position === 3) return <Trophy className="w-5 h-5 text-orange-400" />;
    return null;
  };

  const getPositionChangeIcon = (change) => {
    if (change > 0) return <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-green-400" />;
    if (change < 0) return <TrendingDown className="w-3 h-3 md:w-4 md:h-4 text-red-400" />;
    return <Minus className="w-3 h-3 md:w-4 md:h-4 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען דירוג...</span>
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin';
  const sortedRankings = getSortedRankings();

  // 🔍 DEBUG: בדוק מה בטבלה
  console.log('🔍 === RENDERING TABLE ===');
  console.log('Rankings state length:', rankings.length);
  if (rankings.length > 0) {
    console.log('First ranking in state:', {
      name: rankings[0].participant_name,
      score: rankings[0].current_score,
      position: rankings[0].current_position
    });
  }

  return (
    <div className="min-h-screen p-3 md:p-6" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-3 mb-4 md:mb-8">
          <div>
            <h1 className="text-xl md:text-4xl font-bold mb-1 md:mb-2 flex items-center gap-2 md:gap-3" style={{ 
              color: '#f8fafc',
              textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
            }}>
              <Trophy className="w-6 h-6 md:w-10 md:h-10" style={{ color: '#06b6d4' }} />
              טבלת דירוג
            </h1>
            <p className="text-xs md:text-base" style={{ color: '#94a3b8' }}>מצב העמידה הנוכחי של המשתתפים</p>
          </div>

          {isAdmin && (
            <div className="flex gap-2 md:gap-3 w-full md:w-auto">
              <Button 
                onClick={handleSetBaseline} 
                disabled={settingBaseline || recalculating}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
                }}
                className="text-white hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] flex-1 md:flex-none h-8 md:h-10 text-[10px] md:text-sm"
              >
                {settingBaseline ? (
                  <>
                    <Loader2 className="w-3 h-3 md:w-5 md:h-5 animate-spin ml-1 md:ml-2" />
                    קובע...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3 h-3 md:w-5 md:h-5 ml-1 md:ml-2" />
                    קבע דירוג
                  </>
                )}
              </Button>

              <Button 
                onClick={handleRecalculateScores} 
                disabled={recalculating || settingBaseline}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                }}
                className="text-white hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] flex-1 md:flex-none h-8 md:h-10 text-[10px] md:text-sm"
              >
                {recalculating ? (
                  <>
                    <Loader2 className="w-3 h-3 md:w-5 md:h-5 animate-spin ml-1 md:ml-2" />
                    מחשב...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 md:w-5 md:h-5 ml-1 md:ml-2" />
                    חשב ניקוד
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
          {[
            { label: 'סה"כ משתתפים', value: rankings.length, icon: Users, color: '#06b6d4' },
            { label: 'ניקוד ממוצע', value: avgScore.toFixed(1), icon: Target, color: '#0ea5e9' },
            { label: 'ניקוד מקסימלי', value: maxScore.toFixed(1), icon: TrendingUp, color: '#8b5cf6' },
            { label: 'ניקוד מינימלי', value: minScore.toFixed(1), icon: TrendingDown, color: '#94a3b8' }
          ].map((stat, idx) => (
            <Card key={idx} style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              backdropFilter: 'blur(10px)'
            }}>
              <CardContent className="p-2 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] md:text-sm" style={{ color: '#94a3b8' }}>{stat.label}</p>
                    <p className="text-lg md:text-3xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                  </div>
                  <stat.icon className="w-6 h-6 md:w-10 md:h-10" style={{ color: stat.color, opacity: 0.5 }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader className="py-2 md:py-4">
            <CardTitle className="text-sm md:text-lg" style={{ color: '#06b6d4' }}>הדירוג הנוכחי</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div style={{ maxHeight: '600px', overflow: 'auto' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#1e293b' }}>
                  <tr style={{ borderBottom: '2px solid rgba(6, 182, 212, 0.3)' }}>
                    <th 
                      className="text-center p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm" 
                      style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                      onClick={() => handleSort('current_position')}
                    >
                      <div className="flex items-center justify-center gap-0.5 md:gap-2">
                        <span>#</span>
                        <SortIcon column="current_position" />
                      </div>
                    </th>
                    <th 
                      className="text-right p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm" 
                      style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                      onClick={() => handleSort('participant_name')}
                    >
                      <div className="flex items-center justify-start gap-0.5 md:gap-2">
                        <span>שם</span>
                        <SortIcon column="participant_name" />
                      </div>
                    </th>
                    <th 
                      className="text-center p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm" 
                      style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                      onClick={() => handleSort('current_score')}
                    >
                      <div className="flex items-center justify-center gap-0.5 md:gap-2">
                        <span>נק׳</span>
                        <SortIcon column="current_score" />
                      </div>
                    </th>
                    <th 
                      className="hidden md:table-cell text-center p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm" 
                      style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                      onClick={() => handleSort('previous_position')}
                    >
                      <div className="flex items-center justify-center gap-0.5 md:gap-2">
                        <span>מיקום קודם</span>
                        <SortIcon column="previous_position" />
                      </div>
                    </th>
                    <th 
                      className="hidden md:table-cell text-center p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm" 
                      style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                      onClick={() => handleSort('previous_score')}
                    >
                      <div className="flex items-center justify-center gap-0.5 md:gap-2">
                        <span>ניקוד קודם</span>
                        <SortIcon column="previous_score" />
                      </div>
                    </th>
                    <th 
                      className="text-center p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm" 
                      style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                      onClick={() => handleSort('score_change')}
                    >
                      <div className="flex items-center justify-center gap-0.5 md:gap-2">
                        <span className="hidden md:inline">שינוי בניקוד</span>
                        <span className="md:hidden">+/-</span>
                        <SortIcon column="score_change" />
                      </div>
                    </th>
                    <th 
                      className="text-center p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm" 
                      style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                      onClick={() => handleSort('position_change')}
                    >
                      <div className="flex items-center justify-center gap-0.5 md:gap-2">
                        <span className="hidden md:inline">שינוי במיקום</span>
                        <span className="md:hidden">↕</span>
                        <SortIcon column="position_change" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRankings.map((rank) => (
                    <tr key={rank.id} className="hover:bg-cyan-500/10" style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}>
                      <td className="text-center p-1 md:p-2">
                        <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                          <span className="hidden md:inline">{getPositionIcon(rank.current_position)}</span>
                          <span className="font-bold text-xs md:text-base" style={{ color: '#f8fafc' }}>{rank.current_position}</span>
                        </div>
                      </td>
                      <td 
                        className="font-medium text-[10px] md:text-base cursor-pointer hover:underline text-right p-1 md:p-2" 
                        style={{ color: '#0ea5e9' }}
                        onClick={() => loadParticipantDetails(rank.participant_name)}
                      >
                        {rank.participant_name}
                      </td>
                      <td className="text-center p-1 md:p-2">
                        <Badge className="text-white text-[10px] md:text-base px-1.5 md:px-3 py-0.5 md:py-1" style={{ background: '#06b6d4', boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)' }}>
                          {rank.current_score}
                        </Badge>
                      </td>
                      <td className="hidden md:table-cell text-center p-1 md:p-2 text-sm" style={{ color: '#94a3b8' }}>{rank.previous_position || '-'}</td>
                      <td className="hidden md:table-cell text-center p-1 md:p-2 text-sm" style={{ color: '#94a3b8' }}>{rank.previous_score || '0'}</td>
                      <td className="text-center p-1 md:p-2">
                        <div className="flex items-center justify-center gap-0.5 md:gap-1">
                          {rank.score_change > 0 && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2 py-0 md:py-0.5" style={{ background: '#10b981', boxShadow: '0 0 5px rgba(16, 185, 129, 0.4)' }}>+{rank.score_change}</Badge>}
                          {rank.score_change < 0 && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2 py-0 md:py-0.5" style={{ background: '#ef4444', boxShadow: '0 0 5px rgba(239, 68, 68, 0.4)' }}>{rank.score_change}</Badge>}
                          {rank.score_change === 0 && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2 py-0 md:py-0.5" style={{ background: '#475569' }}>0</Badge>}
                        </div>
                      </td>
                      <td className="text-center p-1 md:p-2">
                        <div className="flex items-center justify-center gap-0.5 md:gap-1">
                          {getPositionChangeIcon(rank.position_change)}
                          <span className={`font-medium text-[10px] md:text-sm ${rank.position_change > 0 ? 'text-green-400' : rank.position_change < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            {rank.position_change !== 0 ? Math.abs(rank.position_change) : '-'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={selectedParticipant !== null} onOpenChange={() => setSelectedParticipant(null)}>
        <DialogContent className="max-w-6xl max-h-[85vh] w-[95vw] md:w-auto flex flex-col" style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          boxShadow: '0 0 30px rgba(6, 182, 212, 0.3)'
        }} dir="rtl">
          <DialogHeader className="flex-shrink-0 pb-2 md:pb-4" style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>
            <DialogTitle className="text-base md:text-2xl font-bold text-right" style={{ color: '#f8fafc' }}>
              {participantDetails?.name}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1 md:mt-2">
              <Badge className="text-white text-xs md:text-lg px-2 md:px-4 py-1 md:py-2 rounded-full" style={{ background: '#0ea5e9' }}>
                סה"כ: {participantDetails?.totalScore} נקודות
              </Badge>
              <span className="text-[10px] md:text-base" style={{ color: '#94a3b8' }}>
                {participantDetails?.scores.filter(s => s.score > 0).length} שאלות עם ניקוד
              </span>
            </div>
          </DialogHeader>
          <div className="flex-1" style={{ overflow: 'auto', background: 'transparent' }}>
            <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#0f172a' }}>
                <tr>
                  <th className="text-center p-2 text-xs" style={{ backgroundColor: '#0f172a', color: '#94a3b8', width: '60px' }}>טבלה</th>
                  <th className="text-center p-2 text-xs" style={{ backgroundColor: '#0f172a', color: '#94a3b8', width: '50px' }}>מס׳</th>
                  <th className="text-right p-2 text-xs" style={{ backgroundColor: '#0f172a', color: '#94a3b8' }}>שאלה</th>
                  <th className="text-center p-2 text-xs" style={{ backgroundColor: '#0f172a', color: '#94a3b8', width: '90px' }}>ניחוש</th>
                  <th className="text-center p-2 text-xs" style={{ backgroundColor: '#0f172a', color: '#94a3b8', width: '90px' }}>תוצאה</th>
                  <th className="text-center p-2 text-xs" style={{ backgroundColor: '#0f172a', color: '#94a3b8', width: '70px' }}>ניקוד</th>
                </tr>
              </thead>
              <tbody>
                {participantDetails?.scores.map((s, index) => {
                    const displayText = s.home_team && s.away_team 
                      ? `${s.home_team} - ${s.away_team}`
                      : s.question_text;
                    
                    let badgeColor = 'bg-slate-600 text-white'; // אפור - אין תוצאה
                    if (s.score === s.max_score && s.max_score > 0) {
                      badgeColor = 'bg-green-600 text-white'; // ירוק - ניקוד מלא
                    } else if (s.score === 0) {
                      badgeColor = 'bg-red-600 text-white'; // אדום - 0 נקודות
                    } else if (s.score >= 7) {
                      badgeColor = 'bg-blue-600 text-white'; // כחול - 7 נקודות (תוצאה + הפרש)
                    } else if (s.score > 0) {
                      badgeColor = 'bg-yellow-500 text-white'; // צהוב - 5 נקודות (תוצאה בלבד)
                    }
                    
                    return (
                      <tr 
                        key={index} 
                        className="transition-colors hover:bg-cyan-500/10"
                        style={{ backgroundColor: '#1e293b' }}
                      >
                        <td className="text-center p-1.5">
                          <Badge variant="outline" className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ borderColor: '#06b6d4', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>
                            {s.table_id}
                          </Badge>
                        </td>
                        <td className="text-center p-1.5">
                          <Badge variant="outline" className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ borderColor: '#0ea5e9', color: '#0ea5e9', background: 'rgba(14, 165, 233, 0.1)' }}>
                            {s.question_id_display}
                          </Badge>
                        </td>
                        <td className="text-right p-1.5">
                          {s.home_team && s.away_team ? (
                            <div className="flex items-center justify-start gap-1 text-xs" style={{ color: '#f8fafc' }}>
                              <span>{s.home_team}</span>
                              {s.home_team_logo && (
                                <img 
                                  src={s.home_team_logo} 
                                  alt={s.home_team} 
                                  className="w-4 h-4 rounded-full" 
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              )}
                              <span>-</span>
                              {s.away_team_logo && (
                                <img 
                                  src={s.away_team_logo} 
                                  alt={s.away_team} 
                                  className="w-4 h-4 rounded-full" 
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              )}
                              <span>{s.away_team}</span>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: '#f8fafc' }}>{displayText}</span>
                          )}
                        </td>
                        <td className="text-center p-1.5">
                          <span className="font-medium text-xs" style={{ color: '#94a3b8' }}>{s.prediction || '-'}</span>
                        </td>
                        <td className="text-center p-1.5">
                          <span className="font-medium text-xs" style={{ color: '#f8fafc' }}>{s.actual_result || '-'}</span>
                        </td>
                        <td className="text-center p-1.5">
                          <Badge className={`${badgeColor} text-xs font-bold px-2 py-0.5 rounded-full`}>
                            {s.score}/{s.max_score}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDebugDialog} onOpenChange={setShowDebugDialog}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] w-auto flex flex-col" style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          boxShadow: '0 0 30px rgba(6, 182, 212, 0.3)'
        }} dir="rtl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-xl font-bold" style={{ color: '#f8fafc' }}>
              🔍 דוח DEBUG - השוואת ניקוד
            </DialogTitle>
          </DialogHeader>

          {debugData && (
            <div className="flex-1 overflow-auto space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg" style={{
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.3)'
              }}>
                <div className="text-center">
                  <div className="text-sm" style={{ color: '#94a3b8' }}>משתתף</div>
                  <div className="text-lg font-bold" style={{ color: '#06b6d4' }}>{debugData.participantName}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm" style={{ color: '#94a3b8' }}>סה"כ ניקוד בטבלת הדירוג</div>
                  <div className="text-2xl font-bold" style={{ color: '#10b981' }}>{debugData.leaderboardTotal}</div>
                </div>
              </div>

              {debugData.stats && (
                <div className="grid grid-cols-5 gap-2 p-3 rounded-lg" style={{
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.3)'
                }}>
                  <div className="text-center">
                    <div className="text-xs" style={{ color: '#94a3b8' }}>שאלות במשחק</div>
                    <div className="text-lg font-bold" style={{ color: '#8b5cf6' }}>{debugData.stats.totalQuestions}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs" style={{ color: '#94a3b8' }}>ניחושי משתתף</div>
                    <div className="text-lg font-bold" style={{ color: '#8b5cf6' }}>{debugData.stats.totalPredictions}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs" style={{ color: '#94a3b8' }}>ניחושים ייחודיים</div>
                    <div className="text-lg font-bold" style={{ color: '#8b5cf6' }}>{debugData.stats.uniquePredictions}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs" style={{ color: '#94a3b8' }}>שאלות עם ניקוד</div>
                    <div className="text-lg font-bold" style={{ color: '#10b981' }}>{debugData.stats.questionsWithScore}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs" style={{ color: '#94a3b8' }}>סה"כ פירוט</div>
                    <div className="text-lg font-bold" style={{ color: '#8b5cf6' }}>{debugData.stats.totalBreakdown}</div>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-lg" style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <p className="text-sm font-bold" style={{ color: '#10b981' }}>
                  📊 מציג {debugData.comparison?.length || 0} שאלות (כולל ציון 0)
                </p>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 10 }}>
                    <tr>
                      <th className="p-2 text-center" style={{ color: '#94a3b8', borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>טבלה</th>
                      <th className="p-2 text-center" style={{ color: '#94a3b8', borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>שאלה</th>
                      <th className="p-2 text-right" style={{ color: '#94a3b8', borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>טקסט שאלה</th>
                      <th className="p-2 text-center" style={{ color: '#94a3b8', borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>ניחוש</th>
                      <th className="p-2 text-center" style={{ color: '#94a3b8', borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>תוצאה</th>
                      <th className="p-2 text-center" style={{ color: '#10b981', borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>ניקוד</th>
                      <th className="p-2 text-center" style={{ color: '#94a3b8', borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>מקס</th>
                      <th className="p-2 text-center" style={{ color: '#94a3b8', borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>בונוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(debugData.comparison || []).map((row, idx) => {
                      const isBonus = row['בונוס?'] === '✅';
                      return (
                        <tr key={idx} className="hover:bg-cyan-500/10" style={{ 
                          borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
                          background: isBonus ? 'rgba(251, 191, 36, 0.1)' : 'transparent'
                        }}>
                          <td className="p-2 text-center" style={{ color: '#f8fafc' }}>{row['טבלה']}</td>
                          <td className="p-2 text-center" style={{ color: '#f8fafc' }}>{row['שאלה']}</td>
                          <td className="p-2 text-right" style={{ color: '#94a3b8' }}>{row['טקסט שאלה']}</td>
                          <td className="p-2 text-center font-medium" style={{ color: '#06b6d4' }}>{row['ניחוש']}</td>
                          <td className="p-2 text-center font-medium" style={{ color: '#0ea5e9' }}>{row['תוצאה']}</td>
                          <td className="p-2 text-center font-bold text-base" style={{ color: '#10b981' }}>{row['ניקוד']}</td>
                          <td className="p-2 text-center" style={{ color: '#94a3b8' }}>{row['מקסימום']}</td>
                          <td className="p-2 text-center">{row['בונוס?']}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}