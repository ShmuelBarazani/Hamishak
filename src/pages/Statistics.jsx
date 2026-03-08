import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Users, Target, Loader2, PieChart, ChevronDown, ChevronUp, TrendingUp, Award, AlertTriangle, Trophy } from "lucide-react";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useGame } from "@/components/contexts/GameContext";

import InsightsAnalyzer from "../components/insights/InsightsAnalyzer";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];

// 🚀 Cache גלובלי
const NORMALIZE_CACHE = new Map();
const CLEAN_CACHE = new Map();
const PARSE_ID_CACHE = new Map();

const normalizeTeamName = (name) => {
  if (!name) return name;
  if (NORMALIZE_CACHE.has(name)) return NORMALIZE_CACHE.get(name);

  const result = name
    .replace(/קרבאך/g, 'קרבאח')
    .replace(/קראבח/g, 'קרבאח')
    .replace(/קראבך/g, 'קרבאח')
    .trim();

  NORMALIZE_CACHE.set(name, result);
  return result;
};

const cleanTeamName = (name) => {
  if (!name) return name;
  if (CLEAN_CACHE.has(name)) return CLEAN_CACHE.get(name);

  const result = name.split('(')[0].trim();
  CLEAN_CACHE.set(name, result);
  return result;
};

// 🆕 פונקציה לנרמול תוצאות משחקים (הסרת רווחים)
const normalizePrediction = (result) => {
  if (!result) return '';
  return result.replace(/\s+/g, '').trim();
};

// 🆕 פונקציה לסדר חתיכות פאי - גדול-קטן-גדול-קטן
const alternateSliceOrder = (data) => {
  if (!data || data.length <= 2) return data;

  // מיון מהגדול לקטן (assuming 'value' or 'count' exists)
  const sorted = [...data].sort((a, b) => {
    const aVal = a.value || a.count || 0;
    const bVal = b.value || b.count || 0;
    return bVal - aVal;
  });

  // פיצול לשתי קבוצות
  const midpoint = Math.ceil(sorted.length / 2);
  const largerHalf = sorted.slice(0, midpoint);
  const smallerHalf = sorted.slice(midpoint).reverse(); // Reverse smaller half for alternating

  // שזור גדול-קטן-גדול-קטן
  const result = [];
  for (let i = 0; i < Math.max(largerHalf.length, smallerHalf.length); i++) {
    if (i < largerHalf.length) result.push(largerHalf[i]);
    if (i < smallerHalf.length) result.push(smallerHalf[i]);
  }

  return result;
};

// 🚀 Cache לפונקציית parsing
const parseQuestionId = (id) => {
  if (!id) return 0;
  if (PARSE_ID_CACHE.has(id)) return PARSE_ID_CACHE.get(id);

  const numStr = id.replace(/[^\d.]/g, '');
  const result = parseFloat(numStr) || 0;

  PARSE_ID_CACHE.set(id, result);
  return result;
};

export default function Statistics() {
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState(null);
  const [openSections, setOpenSections] = useState({});
  const [selectedRound, setSelectedRound] = useState(null);

  const [allQuestions, setAllQuestions] = useState([]);
  const [allPredictions, setAllPredictions] = useState([]);
  const [teams, setTeams] = useState({});
  const [validationLists, setValidationLists] = useState({});

  const [roundTables, setRoundTables] = useState([]);
  const [specialTables, setSpecialTables] = useState([]);
  const [locationTables, setLocationTables] = useState([]);
  const [israeliTable, setIsraeliTable] = useState(null);
  const [playoffTable, setPlayoffTable] = useState(null);

  const [gameStats, setGameStats] = useState(null);
  const [specialStats, setSpecialStats] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [userStatsLoading, setUserStatsLoading] = useState(false);
  const [userStatsError, setUserStatsError] = useState(null);

  const { currentGame } = useGame();

  const formatResult = useCallback((result) => {
    if (!result || result === '__CLEAR__') return '';
    if (result.includes('-')) {
      const parts = result.split('-').map(x => x.trim());
      return parts.join(' - ');
    }
    return result;
  }, []);

  useEffect(() => {
    loadAllData();
  }, [currentGame]);

  const loadAllData = async () => {
    if (!currentGame) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log('📊 מתחיל טעינת נתונים עבור:', currentGame.id);
      
      // 🔥 טעינת שאלות
      const questions = await db.Question.filter({ game_id: currentGame.id }, null, 5000);
      console.log(`✅ נטענו ${questions.length} שאלות`);
      
      // 🔥 טעינת Predictions בבאצ'ים של 5000
      console.log('📊 מתחיל לטעון predictions בבאצ\'ים...');
      let predictions = [];
      let offset = 0;
      let hasMore = true;
      const batchSize = 5000;
      
      while (hasMore) {
        const batch = await db.Prediction.filter(
          { game_id: currentGame.id },
          null,
          batchSize,
          offset
        );
        console.log(`   ✅ batch #${Math.floor(offset/batchSize) + 1}: ${batch.length} predictions (offset: ${offset})`);
        predictions = predictions.concat(batch);
        
        if (batch.length < batchSize) {
          console.log(`   ⛔ batch אחרון - ${batch.length} < ${batchSize}, עוצר`);
          hasMore = false;
        } else {
          offset += batchSize;
        }
      }
      
      console.log(`✅ סה"כ נטענו ${predictions.length} predictions`);
      
      if (predictions.length > 0) {
        console.log('🔍 דוגמה לניחוש:', predictions[0]);
        const uniqueParticipants = new Set(predictions.map(p => p.participant_name));
        console.log(`✅ ${uniqueParticipants.size} משתתפים עם ניחושים`);
        
        // 🔥 לוג מפורט לפי table_id
        const predsByTable = {};
        predictions.forEach(pred => {
          const question = questions.find(q => q.id === pred.question_id);
          if (question) {
            const tableId = question.table_id || 'unknown';
            if (!predsByTable[tableId]) predsByTable[tableId] = 0;
            predsByTable[tableId]++;
          }
        });
        console.log('📊 ניחושים לפי טבלאות:', predsByTable);
        
        // 🔍 ניתוח מפורט של T12.7 (גאווה ישראלית, שאלה 7)
        const t12Questions = questions.filter(q => q.table_id === 'T12');
        const t12q7 = t12Questions.find(q => q.question_id === '7');
        
        if (t12q7) {
          console.log('🔍🔍🔍 ניתוח מפורט T12.7 🔍🔍🔍');
          console.log('📋 פרטי שאלה:', {
            id: t12q7.id,
            table_id: t12q7.table_id,
            question_id: t12q7.question_id,
            question_text: t12q7.question_text
          });
          
          const t12q7Predictions = predictions.filter(p => p.question_id === t12q7.id);
          console.log(`📊 סה"כ ${t12q7Predictions.length} ניחושים לשאלה T12.7 מתוך ${uniqueParticipants.size} משתתפים`);
          
          // 🔍 בדוק אם יש משתתפים חסרים
          const allParticipants = Array.from(uniqueParticipants);
          const t12q7Participants = new Set(t12q7Predictions.map(p => p.participant_name));
          const missingParticipants = allParticipants.filter(name => !t12q7Participants.has(name));
          
          if (missingParticipants.length > 0) {
            console.log(`⚠️⚠️⚠️ חסרים ${missingParticipants.length} משתתפים ל-T12.7:`);
            console.log(missingParticipants);
          }
          
          // קבץ לפי תשובה
          const answerCounts = {};
          const validAnswers = [];
          const invalidAnswers = [];
          
          t12q7Predictions.forEach(pred => {
            const answer = pred.text_prediction || '';
            const trimmed = answer.trim();
            
            if (!trimmed || trimmed === '__CLEAR__' || trimmed.toLowerCase() === 'null') {
              invalidAnswers.push({ name: pred.participant_name, answer });
            } else {
              validAnswers.push({ name: pred.participant_name, answer: trimmed });
              answerCounts[trimmed] = (answerCounts[trimmed] || 0) + 1;
            }
          });
          
          console.log('✅ תשובות תקינות:', validAnswers.length);
          console.log('❌ תשובות לא תקינות:', invalidAnswers.length, invalidAnswers);
          console.log('📊 התפלגות תשובות תקינות:', answerCounts);
        }
      } else {
        console.log('⚠️ אין ניחושים למשחק הזה!');
      }
      
      setAllQuestions(questions);
      setAllPredictions(predictions);

      const allTeams = currentGame.teams_data || [];
      const teamsMap = allTeams.reduce((acc, team) => {
        acc[normalizeTeamName(team.name)] = team;
        return acc;
      }, {});
      setTeams(teamsMap);

      const lists = currentGame.validation_lists || [];
      const listsMap = lists.reduce((acc, list) => {
        acc[list.list_name] = list.options;
        return acc;
      }, {});
      setValidationLists(listsMap);

      const rTables = {}, sTables = {};
      questions.forEach(q => {
        if (!q.table_id) return;

        if (q.table_id === 'T20' && q.question_text) {
          let teams = null;
          if (q.question_text.includes(' נגד ')) {
            teams = q.question_text.split(' נגד ').map(t => t.trim());
          } else if (q.question_text.includes(' - ')) {
            teams = q.question_text.split(' - ').map(t => t.trim());
          }
          if (teams && teams.length === 2) {
            q.home_team = normalizeTeamName(teams[0]);
            q.away_team = normalizeTeamName(teams[1]);
          }
        }

        if (q.home_team) q.home_team = normalizeTeamName(q.home_team);
        if (q.away_team) q.away_team = normalizeTeamName(q.away_team);

        const tableCollection = (q.home_team && q.away_team) ? rTables : sTables;

        let tableDescription = q.table_description;
        if (q.table_id === 'T12') {
          tableDescription = 'פינת הגאווה הישראלית';
        } else if (q.table_id === 'T13') {
          tableDescription = 'מבול מטאורים של כוכבים';
        } else if (q.table_id === 'T20') {
          tableDescription = 'המסלול הישראלי';
        }

        if (!tableCollection[q.table_id]) {
          tableCollection[q.table_id] = {
            id: q.table_id,
            description: tableDescription || (q.home_team && q.away_team ? `מחזור ${q.table_id.replace('T','')}` : `שאלות ${q.table_id.replace('T','')}`),
            questions: []
          };
        }
        tableCollection[q.table_id].questions.push(q);
      });

      const t20Table = rTables['T20'];
      delete rTables['T20'];
      setIsraeliTable(t20Table || null);

      const sortedRoundTables = Object.values(rTables).sort((a,b) => {
        const aNum = parseInt(a.id.replace('T','')) || 0;
        const bNum = parseInt(b.id.replace('T','')) || 0;
        return aNum - bNum;
      });
      setRoundTables(sortedRoundTables);
      if (sortedRoundTables.length > 0) {
        setSelectedRound(sortedRoundTables[0].id);
      }

      const locationTableIds = ['T14', 'T15', 'T16', 'T17'];
      const locationGroup = Object.values(sTables)
          .filter(table => locationTableIds.includes(table.id))
          .sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0));
      setLocationTables(locationGroup);

      const t19Table = sTables['T19'];
      setPlayoffTable(t19Table || null);

      const allSpecialTables = Object.values(sTables).filter(table => {
          const desc = table.description?.trim();
          return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && table.id !== 'T19';
      }).sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0));

      setSpecialTables(allSpecialTables);

    } catch (error) {
      console.error("Error loading data:", error);
    }
    setLoading(false);
  };

  const calculateGameStats = useCallback(async (type, specificId = null) => {
    try {
      let tablesToProcess = [];
      if (type === 'rounds') {
        if (specificId) {
          tablesToProcess = roundTables.filter(table => table.id === specificId);
        } else {
          tablesToProcess = roundTables;
        }
      } else if (type === 'israeli') {
        tablesToProcess = israeliTable ? [israeliTable] : [];
      }

      console.log('🔍 calculateGameStats:', { type, specificId, tablesToProcess: tablesToProcess.map(t => t?.id) });

      if (tablesToProcess.length === 0 || (tablesToProcess.length > 0 && tablesToProcess[0] === null)) {
        setGameStats(null);
        return;
      }

      // 🚀 Group predictions by question_id פעם אחת
      const predictionsByQuestion = new Map();
      allPredictions.forEach(p => {
        if (!predictionsByQuestion.has(p.question_id)) {
          predictionsByQuestion.set(p.question_id, []);
        }
        predictionsByQuestion.get(p.question_id).push(p);
      });

      console.log(`📊 סה"כ ${allPredictions.length} ניחושים במערכת`);
      console.log(`📊 מפת ניחושים לפי question_id: ${predictionsByQuestion.size} שאלות`);

      const gameStatsData = {};

      for (const table of tablesToProcess) {
        console.log(`📋 מעבד טבלה ${table.id} עם ${table.questions.length} שאלות`);
        for (const q of table.questions) {
          const gamePredictions = predictionsByQuestion.get(q.id) || [];
          console.log(`  🎯 שאלה ${q.table_id}.${q.question_id} (id: ${q.id}): ${gamePredictions.length} ניחושים`);

          // 🚀 reduce במקום forEach
          const resultCounts = gamePredictions.reduce((acc, pred) => {
            const result = pred.text_prediction || 'לא ניחש';
            acc[result] = (acc[result] || 0) + 1;
            return acc;
          }, {});

          const totalPredictions = gamePredictions.length;

          const tempChartData = Object.entries(resultCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([result, count]) => ({
              name: result,
              value: count,
              percentage: totalPredictions > 0 ? ((count / totalPredictions) * 100).toFixed(1) : 0,
            }));

          // ✅ סדר מחדש - גדול-קטן-גדול-קטן למניעת דריסת תוויות
          const chartDataFinal = alternateSliceOrder(tempChartData).map(entry => ({
            ...entry,
            percentage: parseFloat(entry.percentage)
          }));


          gameStatsData[q.id] = {
            question: q,
            table: table,
            totalPredictions,
            chartData: chartDataFinal,
            mostPopular: tempChartData[0] || { name: '-', value: 0, percentage: 0 }
          };
        }
      }

      setGameStats(gameStatsData);
    } catch (error) {
      console.error("Error calculating game stats:", error);
    }
  }, [roundTables, israeliTable, allPredictions]);

  const calculateSpecialStats = useCallback(async (tableGroup, specificTableId = null) => {
    try {
      let tablesToAnalyze = [];
      if (tableGroup === 'special') {
        tablesToAnalyze = specificTableId
            ? specialTables.filter(t => t.id === specificTableId)
            : specialTables;
      } else if (tableGroup === 'locations') {
        tablesToAnalyze = locationTables;
      } else if (tableGroup === 'playoff') {
        tablesToAnalyze = playoffTable ? [playoffTable] : [];
      }

      if (tablesToAnalyze.length === 0 || (tablesToAnalyze.length > 0 && tablesToAnalyze[0] === null)) {
        setSpecialStats(null);
        return;
      }

      const specialStatsData = {};

      for (const table of tablesToAnalyze) {
        const tableStats = {
          table: table,
          questions: []
        };

        if (['T14', 'T15', 'T16', 'T17'].includes(table.id)) {
          const allPredictionsForTable = allPredictions.filter(p =>
            table.questions.some(q => q.id === p.question_id)
          );

          // 🚀 reduce במקום forEach
          const teamCounts = allPredictionsForTable.reduce((acc, pred) => {
            if (pred.text_prediction && pred.text_prediction.trim()) {
              const teamName = cleanTeamName(normalizeTeamName(pred.text_prediction.trim()));
              if (teamName && teamName !== '' && teamName.toLowerCase() !== 'null') {
                acc[teamName] = (acc[teamName] || 0) + 1;
              }
            }
            return acc;
          }, {});

          const chartData = Object.entries(teamCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([team, count]) => ({
              team,
              count,
              percentage: allPredictionsForTable.length > 0 ? ((count / allPredictionsForTable.length) * 100).toFixed(1) : 0
            }));

          tableStats.locationsData = {
            totalPredictions: allPredictionsForTable.length,
            uniqueTeams: Object.keys(teamCounts).length,
            topTeams: chartData,
            mostPopular: chartData[0] || { team: '-', count: 0, percentage: 0 }
          };
        } else {
          if (table.id !== 'T1') {
          for (const q of table.questions) {
            // סנן ניחושים לפי question_id
            const qPredictions = allPredictions.filter(p => p.question_id === q.id);

            console.log(`📊 שאלה ${q.table_id}.${q.question_id}: ${qPredictions.length} ניחושים`);

            // 🔍 לוג מפורט לשאלה T12.7
            if (q.table_id === 'T12' && q.question_id === '7') {
              console.log('🔍🔍 calculateSpecialStats - T12.7:');
              console.log(`   📊 סה"כ ${qPredictions.length} ניחושים נמצאו`);
              console.log('   📋 הניחושים:', qPredictions.map(p => ({
                participant: p.participant_name,
                answer: p.text_prediction
              })));
            }

              // 🚀 reduce לספירת תשובות
              const answerCounts = qPredictions.reduce((acc, pred) => {
                let answer = String(pred.text_prediction || '').trim();
                
                // בדיקה בסיסית
                if (
                  !answer ||
                  answer === '' ||
                  answer === '__CLEAR__' ||
                  answer.toLowerCase() === 'null' ||
                  answer.toLowerCase() === 'undefined'
                ) {
                  return acc;
                }

                // 🔥 טיפול בקבוצות - רק אם validation_list מכיל "קבוצ" וזה לא כן/לא/מספר
                const isYesNo = ['כן', 'לא', 'yes', 'no'].includes(answer);
                const isNumber = !isNaN(Number(answer));
                
                if (!isYesNo && !isNumber && q.validation_list && q.validation_list.toLowerCase().includes('קבוצ')) {
                  answer = cleanTeamName(answer);
                }

                // בדיקה אחרי ניקוי
                if (!answer || answer.trim() === '') {
                  return acc;
                }

                // ✅ ספירה
                acc[answer] = (acc[answer] || 0) + 1;
                
                return acc;
              }, {});

              const totalAnswersWithContent = Object.values(answerCounts).reduce((sum, count) => sum + count, 0);
              
              // 🔍 לוג מפורט לשאלה T12.7
              if (q.table_id === 'T12' && q.question_id === '7') {
                console.log('📊 תוצאה סופית T12.7:');
                console.log(`   סה"כ ניחושים שהתקבלו: ${qPredictions.length}`);
                console.log(`   סה"כ תשובות שנספרו ב-answerCounts: ${totalAnswersWithContent}`);
                console.log('   answerCounts:', JSON.stringify(answerCounts));
                console.log('   Object.keys(answerCounts):', Object.keys(answerCounts));
                console.log('   Object.values(answerCounts):', Object.values(answerCounts));
              }

              const tempChartData = Object.entries(answerCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([answer, count]) => ({
                  answer,
                  count,
                  percentage: totalAnswersWithContent > 0 ? ((count / totalAnswersWithContent) * 100).toFixed(1) : 0,
                }));

              // ✅ סדר מחדש - גדול-קטן-גדול-קטן למניעת דריסת תוויות
              const chartData = alternateSliceOrder(tempChartData);

              tableStats.questions.push({
                question: q,
                totalAnswers: totalAnswersWithContent,
                chartData,
                mostPopular: tempChartData[0] || { answer: '-', count: 0, percentage: 0 },
                diversity: chartData.length
              });
            }
          }
        }

        specialStatsData[table.id] = tableStats;
      }

      setSpecialStats(specialStatsData);
    } catch (error) {
      console.error("Error calculating special stats:", error);
    }
  }, [specialTables, locationTables, playoffTable, allPredictions]);

  const calculateUserStats = useCallback(async () => {
    if (userStats) return;

    setUserStatsLoading(true);
    setUserStatsError(null);

    try {
      console.log('📊 טוען נתוני משתמשים מטבלה T1...');

      const t1Questions = allQuestions.filter(q => q.table_id === 'T1');
      console.log('📋 שאלות T1:', t1Questions);

      const professionQuestion = t1Questions.find(q =>
        q.question_text?.includes('מקצוע')
      );
      const ageQuestion = t1Questions.find(q =>
        q.question_text?.includes('גיל')
      );

      console.log('👔 שאלת מקצוע:', professionQuestion);
      console.log('🎂 שאלת גיל:', ageQuestion);

      if (!professionQuestion && !ageQuestion) {
        console.log('❌ לא נמצאו שאלות מקצוע וגיל');
        setUserStatsError('no_questions');
        setUserStatsLoading(false);
        return;
      }

      const professionPredictions = professionQuestion
        ? allPredictions.filter(p => p.question_id === professionQuestion.id)
        : [];
      const agePredictions = ageQuestion
        ? allPredictions.filter(p => p.question_id === ageQuestion.id)
        : [];

      console.log('📊 תשובות מקצוע:', professionPredictions.length);
      console.log('📊 תשובות גיל:', agePredictions.length);

      // 🚀 reduce במקום forEach
      const professionCounts = professionPredictions.reduce((acc, pred) => {
        const profession = pred.text_prediction?.trim();

        if (
          !profession ||
          profession === '' ||
          profession === '0' ||
          profession.toLowerCase() === 'null' ||
          profession.toLowerCase() === 'undefined' ||
          profession === '__CLEAR__'
        ) {
          return acc;
        }

        acc[profession] = (acc[profession] || 0) + 1;
        return acc;
      }, {});

      console.log('📊 מקצועות שנמצאו:', professionCounts);

      const totalProfessionsWithContent = Object.values(professionCounts).reduce((sum, count) => sum + count, 0);

      const professionData = Object.entries(professionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([profession, count]) => ({
          profession,
          count,
          percentage: totalProfessionsWithContent > 0 ? ((count / totalProfessionsWithContent) * 100).toFixed(1) : 0
        }));

      console.log('📊 professionData:', professionData);

      const ageGroups = {
        'מתחת ל-20': 0,
        '21-25': 0,
        '26-30': 0,
        '31-35': 0,
        '36-40': 0,
        '41-45': 0,
        '46-50': 0,
        '51-55': 0,
        '56+': 0
      };

      let totalAgesWithContent = 0;
      agePredictions.forEach(pred => {
        const ageStr = pred.text_prediction?.trim();
        const age = parseInt(ageStr, 10);

        if (!ageStr || ageStr === '' || ageStr === '0' || isNaN(age) || age === 0) {
          return;
        }

        totalAgesWithContent++;

        if (age < 20) ageGroups['מתחת ל-20']++;
        else if (age <= 25) ageGroups['21-25']++;
        else if (age <= 30) ageGroups['26-30']++;
        else if (age <= 35) ageGroups['31-35']++;
        else if (age <= 40) ageGroups['36-40']++;
        else if (age <= 45) ageGroups['41-45']++;
        else if (age <= 50) ageGroups['46-50']++;
        else if (age <= 55) ageGroups['51-55']++;
        else ageGroups['56+']++;
      });

      console.log('📊 קבוצות גיל:', ageGroups);

      const ageData = Object.entries(ageGroups)
        .filter(([_, count]) => count > 0)
        .map(([group, count]) => ({
          group,
          count,
          percentage: totalAgesWithContent > 0 ? ((count / totalAgesWithContent) * 100).toFixed(1) : 0
        }));

      console.log('📊 ageData:', ageData);

      const allParticipants = new Set([
        ...professionPredictions.map(p => p.participant_name),
        ...agePredictions.map(p => p.participant_name)
      ]);

      setUserStats({
        totalUsers: allParticipants.size,
        professionData,
        ageData,
        totalWithProfession: totalProfessionsWithContent,
        totalWithAge: totalAgesWithContent
      });

      console.log('✅ נתוני משתמשים נטענו בהצלחה');

    } catch (error) {
      console.error("❌ שגיאה בטעינת נתוני משתמשים:", error);

      if (error.message?.includes('Rate limit') || error.response?.status === 429) {
        setUserStatsError('rate_limit');
      } else {
        setUserStatsError('general_error');
      }
    } finally {
      setUserStatsLoading(false);
    }
  }, [userStats, allQuestions, allPredictions]);

  // 🚀 useCallback לחישוב outcomes
  const analyzeGameOutcomes = useCallback((chartData) => {
    return chartData.reduce((acc, entry) => {
      const result = entry.name;

      if (result && result.includes('-')) {
        const parts = result.split('-').map(x => x.trim());
        const homeScore = parseInt(parts[0]);
        const awayScore = parseInt(parts[1]);

        if (!isNaN(homeScore) && !isNaN(awayScore)) {
          if (homeScore > awayScore) {
            acc.homeWins += entry.value;
          } else if (homeScore === awayScore) {
            acc.draws += entry.value;
          } else {
            acc.awayWins += entry.value;
          }
        }
      }
      return acc;
    }, { homeWins: 0, draws: 0, awayWins: 0 });
  }, []);

  // 🚀 useMemo ל-gameStatsArray
  const gameStatsArray = useMemo(() =>
    Object.values(gameStats || {}),
  [gameStats]);

  // 🚀 useMemo ל-uniqueParticipantsCount
  const uniqueParticipantsCount = useMemo(() =>
    new Set(allPredictions.map(p => p.participant_name)).size,
  [allPredictions]);

  // 🚀 Pre-calculate participants by question and answer
  const participantsByQuestionAndAnswer = useMemo(() => {
    const index = new Map();
    allPredictions.forEach(p => {
      if (!p.text_prediction || !p.text_prediction.trim()) return;
      
      // נרמל את הניחוש
      const normalized = normalizePrediction(p.text_prediction.trim());
      const key = `${p.question_id}_${normalized}`;
      
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(p.participant_name);
      
      // 🔥 גם שמור בלי נורמליזציה למקרים מיוחדים
      const keyOriginal = `${p.question_id}_${p.text_prediction.trim()}`;
      if (keyOriginal !== key) {
        if (!index.has(keyOriginal)) index.set(keyOriginal, []);
        index.get(keyOriginal).push(p.participant_name);
      }
    });

    // Sort each array once
    index.forEach((participants, key) => {
      index.set(key, [...new Set(participants)].sort((a, b) => a.localeCompare(b, 'he')));
    });

    return index;
  }, [allPredictions]);

  // 🚀 Pre-calculate all outcome participants for each game
  const gameOutcomeParticipants = useMemo(() => {
    if (!gameStats) return new Map();

    const outcomeMap = new Map();

    Object.values(gameStats).forEach(game => {
      const q = game.question;
      const results = { home: [], draw: [], away: [] };

      game.chartData.forEach(entry => {
        const result = entry.name;
        if (result && result.includes('-')) {
          const parts = result.split('-').map(x => x.trim());
          const homeScore = parseInt(parts[0]);
          const awayScore = parseInt(parts[1]);

          if (!isNaN(homeScore) && !isNaN(awayScore)) {
            let outcomeType = null;
            if (homeScore > awayScore) outcomeType = 'home';
            else if (homeScore === awayScore) outcomeType = 'draw';
            else outcomeType = 'away';

            if (outcomeType) {
              const key = `${q.id}_${normalizePrediction(result)}`;
              const participants = participantsByQuestionAndAnswer.get(key) || [];
              results[outcomeType].push(...participants);
            }
          }
        }
      });

      outcomeMap.set(q.id, {
        homeWinParticipants: [...new Set(results.home)].sort((a, b) => a.localeCompare(b, 'he')),
        drawParticipants: [...new Set(results.draw)].sort((a, b) => a.localeCompare(b, 'he')),
        awayWinParticipants: [...new Set(results.away)].sort((a, b) => a.localeCompare(b, 'he'))
      });
    });

    return outcomeMap;
  }, [gameStats, participantsByQuestionAndAnswer]);

  const allButtons = useMemo(() => {
    const buttons = [];

    buttons.push({
      numericId: 0,
      key: 'insights',
      description: 'תובנות AI ומחנות',
      icon: PieChart
    });

    buttons.push({
      numericId: 0.5,
      key: 'users',
      description: 'פרטי המנחשים',
      icon: Users
    });

    if (roundTables.length > 0) {
      const firstRoundTableId = roundTables[0]?.id || 'T2';
      buttons.push({
        numericId: parseInt(firstRoundTableId.replace('T', ''), 10),
        key: 'rounds',
        description: 'סטטיסטיקות משחקי הליגה',
        icon: Target
      });
    }

    specialTables.forEach(table => {
      // סנן טבלאות T1 (פרטי משתתף) ו"פרטי מנחשים"
      if (table.id === 'T1' || (table.description && table.description.includes('פרטי מנחשים'))) {
        return;
      }

      buttons.push({
        numericId: parseInt(table.id.replace('T', ''), 10),
        key: table.id,
        description: table.description,
        icon: TrendingUp
      });
    });

    if (locationTables.length > 0) {
      const firstLocationTableId = locationTables[0]?.id || 'T14';
      buttons.push({
        numericId: parseInt(firstLocationTableId.replace('T', ''), 10),
        key: 'locations',
        description: 'מיקומים בסיום שלב הליגה',
        icon: Award
      });
    }

    if (playoffTable) {
      buttons.push({
        numericId: parseInt(playoffTable.id.replace('T', ''), 10),
        key: playoffTable.id,
        description: playoffTable.description,
      icon: Award
      });
    }

    if (israeliTable) {
      buttons.push({
        numericId: parseInt(israeliTable.id.replace('T', ''), 10),
        key: israeliTable.id,
        description: israeliTable.description,
      icon: Target
      });
    }

    return buttons.sort((a, b) => a.numericId - b.numericId);
  }, [roundTables, specialTables, locationTables, playoffTable, israeliTable]);

  useEffect(() => {
    if (selectedSection && !loading && allQuestions.length > 0 && allPredictions.length > 0) {
      const buttonInfo = allButtons.find(btn => btn.key === selectedSection);
      if (!buttonInfo) return;

      if (buttonInfo.key === 'rounds') {
        calculateGameStats('rounds', selectedRound);
      } else if (buttonInfo.key === 'israeli' || buttonInfo.key === israeliTable?.id) {
        calculateGameStats('israeli');
      } else if (buttonInfo.key === 'locations') {
        calculateSpecialStats('locations');
      } else if (buttonInfo.key === playoffTable?.id) {
        calculateSpecialStats('playoff');
      } else if (buttonInfo.key === 'insights') {
        // No specific calculation needed
      } else if (buttonInfo.key === 'users') {
        calculateUserStats();
      } else {
        calculateSpecialStats('special', buttonInfo.key);
      }
    }
  }, [selectedSection, loading, allQuestions, allPredictions, calculateGameStats, calculateSpecialStats, calculateUserStats, allButtons, israeliTable, playoffTable, selectedRound]);

  const toggleSection = (sectionId) => {
    setSelectedSection(selectedSection === sectionId ? null : sectionId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען סטטיסטיקות...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" dir="rtl" style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }}>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3" style={{
          color: '#f8fafc',
          textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
        }}>
          <PieChart className="w-10 h-10" style={{ color: '#06b6d4' }} />
          סטטיסטיקות ותובנות
        </h1>
        <p className="mb-8" style={{ color: '#94a3b8' }}>ניתוח מעמיק של ביצועי המשתתפים</p>

        <Card className="mb-6" style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader className="py-3">
            <CardTitle style={{ color: '#06b6d4' }}>בחר שלב לניתוח</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3">
            {allButtons.map(button => {
              const Icon = button.icon;
              return (
                <Button
                  key={button.key}
                  onClick={() => toggleSection(button.key)}
                  variant={selectedSection === button.key ? "default" : "outline"}
                  className={`h-24 p-3 flex-col gap-2 overflow-hidden ${
                    selectedSection === button.key
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white'
                      : 'bg-slate-700/50 hover:bg-cyan-600/20 border-cyan-400 text-cyan-200'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-xs font-medium text-center leading-tight break-words w-full px-1" style={{
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {button.description}
                  </span>
                  {selectedSection === button.key ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                </Button>
              );
            })}
          </CardContent>
        </Card>

        {/* 🧠 תצוגת תובנות AI */}
        {selectedSection === 'insights' && (
          <InsightsAnalyzer
            allQuestions={allQuestions}
            allPredictions={allPredictions}
          />
        )}

        {/* 📊 תצוגת פרטי מנחשים */}
        {selectedSection === 'users' && (
          <div className="space-y-6">
            {userStatsLoading ? (
              <Card style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)'
              }}>
                <CardContent className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#06b6d4' }} />
                  <p style={{ color: '#94a3b8' }}>טוען נתוני מנחשים...</p>
                </CardContent>
              </Card>
            ) : userStatsError ? (
              <Card style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: '#ef4444' }} />
                  <p className="text-xl font-bold mb-2" style={{ color: '#ef4444' }}>
                    {userStatsError === 'no_questions' ? 'לא נמצאו שאלות פרטי מנחשים' : 
                     userStatsError === 'rate_limit' ? 'יותר מדי בקשות - נסה שוב בעוד כמה שניות' : 
                     'שגיאה בטעינת הנתונים'}
                  </p>
                </CardContent>
              </Card>
            ) : userStats ? (
              <>
                <div className="grid md:grid-cols-2 gap-6">
                  <Card style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)'
                  }}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
                        <BarChart3 className="w-5 h-5" />
                        מקצועות המנחשים
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={450}>
                        <BarChart data={userStats.professionData} margin={{ top: 10, right: 30, left: 20, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <defs>
                            <linearGradient id="barHover" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="rgba(6, 182, 212, 0.15)" stopOpacity="1" />
                              <stop offset="100%" stopColor="rgba(6, 182, 212, 0.05)" stopOpacity="1" />
                            </linearGradient>
                          </defs>
                          <XAxis 
                            dataKey="profession" 
                            angle={0} 
                            textAnchor="middle" 
                            height={80}
                            stroke="#94a3b8"
                            interval={0}
                            tick={({ x, y, payload }) => {
                              const maxCharsPerLine = 8;
                              const words = String(payload.value).split(' ');
                              const lines = [];
                              let currentLine = '';

                              words.forEach(word => {
                                const testLine = currentLine ? `${currentLine} ${word}` : word;
                                if (testLine.length <= maxCharsPerLine) {
                                  currentLine = testLine;
                                } else {
                                  if (currentLine) lines.push(currentLine);
                                  currentLine = word;
                                }
                              });
                              if (currentLine) lines.push(currentLine);

                              const displayLines = lines.slice(0, 3);

                              return (
                                <g transform={`translate(${x},${y})`}>
                                  {displayLines.map((line, index) => (
                                    <text
                                      key={index}
                                      x={0}
                                      y={index * 14 + 10}
                                      textAnchor="middle"
                                      fill="#ffffff"
                                      fontSize="10px"
                                      >
                                      {line}
                                      </text>
                                  ))}
                                </g>
                              );
                            }}
                          />
                          <YAxis stroke="#94a3b8" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                          <Tooltip
                            wrapperStyle={{ zIndex: 1000 }}
                            cursor={false}
                            content={({ payload }) => {
                              if (!payload || !payload[0]) return null;
                              const data = payload[0].payload;
                              
                              const professionQuestion = allQuestions.find(q => 
                                q.table_id === 'T1' && q.question_text?.includes('מקצוע')
                              );
                              
                              const participants = professionQuestion 
                                ? allPredictions
                                    .filter(p => 
                                      p.question_id === professionQuestion.id && 
                                      p.text_prediction?.trim() === data.profession
                                    )
                                    .map(p => p.participant_name)
                                    .filter((name, index, self) => self.indexOf(name) === index)
                                    .sort((a, b) => a.localeCompare(b, 'he'))
                                : [];
                              
                              return (
                                <div style={{ 
                                  background: '#0a0f1a', 
                                  backgroundColor: '#0a0f1a',
                                  border: '2px solid #06b6d4', 
                                  borderRadius: '8px', 
                                  padding: '12px', 
                                  maxWidth: '350px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
                                }}>
                                  <p style={{ color: '#06b6d4', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                                    {data.profession}
                                  </p>
                                  <p style={{ color: '#f8fafc', fontSize: '12px', marginBottom: '8px' }}>
                                    {data.count} משתתפים ({data.percentage}%)
                                  </p>
                                  {participants.length > 0 && (
                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #475569' }}>
                                      <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: 'bold' }}>
                                        המשתתפים:
                                      </p>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {participants.map((name, idx) => (
                                          <span key={idx} style={{ 
                                            background: '#1e293b', 
                                            color: '#f8fafc',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '10px'
                                          }}>
                                            {name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Bar 
                            dataKey="count" 
                            fill="#06b6d4" 
                            radius={[8, 8, 0, 0]} 
                            cursor={{ fill: 'transparent' }}
                            activeBar={false}
                          >
                            {userStats.professionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)'
                  }}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
                        <PieChart className="w-5 h-5" />
                        קבוצות גיל המנחשים
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={450}>
                        <BarChart data={userStats.ageData} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <defs>
                            <linearGradient id="barHover2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="rgba(6, 182, 212, 0.15)" stopOpacity="1" />
                              <stop offset="100%" stopColor="rgba(6, 182, 212, 0.05)" stopOpacity="1" />
                            </linearGradient>
                          </defs>
                          <XAxis 
                            dataKey="group" 
                            angle={0}
                            textAnchor="middle"
                            height={60}
                            stroke="#94a3b8"
                            interval={0}
                            tick={({ x, y, payload }) => {
                              return (
                                <text
                                  x={x}
                                  y={y + 10}
                                  textAnchor="middle"
                                  fill="#94a3b8"
                                  fontSize="11px"
                                >
                                  {payload.value}
                                </text>
                              );
                            }}
                          />
                          <YAxis stroke="#94a3b8" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                          <Tooltip
                            wrapperStyle={{ zIndex: 1000 }}
                            cursor={false}
                            content={({ payload }) => {
                              if (!payload || !payload[0]) return null;
                              const data = payload[0].payload;
                              
                              const ageQuestion = allQuestions.find(q => 
                                q.table_id === 'T1' && q.question_text?.includes('גיל')
                              );
                              
                              const participants = ageQuestion 
                                ? allPredictions
                                    .filter(p => {
                                      if (p.question_id !== ageQuestion.id) return false;
                                      const age = parseInt(p.text_prediction?.trim(), 10);
                                      if (isNaN(age) || age === 0) return false;
                                      
                                      if (data.group === 'מתחת ל-20' && age < 20) return true;
                                      if (data.group === '21-25' && age >= 21 && age <= 25) return true;
                                      if (data.group === '26-30' && age >= 26 && age <= 30) return true;
                                      if (data.group === '31-35' && age >= 31 && age <= 35) return true;
                                      if (data.group === '36-40' && age >= 36 && age <= 40) return true;
                                      if (data.group === '41-45' && age >= 41 && age <= 45) return true;
                                      if (data.group === '46-50' && age >= 46 && age <= 50) return true;
                                      if (data.group === '51-55' && age >= 51 && age <= 55) return true;
                                      if (data.group === '56+' && age >= 56) return true;
                                      return false;
                                    })
                                    .map(p => p.participant_name)
                                    .filter((name, index, self) => self.indexOf(name) === index)
                                    .sort((a, b) => a.localeCompare(b, 'he'))
                                : [];
                              
                              return (
                                <div style={{ 
                                  background: '#0a0f1a',
                                  backgroundColor: '#0a0f1a',
                                  border: '2px solid #06b6d4', 
                                  borderRadius: '8px', 
                                  padding: '12px', 
                                  maxWidth: '350px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
                                }}>
                                  <p style={{ color: '#06b6d4', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                                    {data.group}
                                  </p>
                                  <p style={{ color: '#f8fafc', fontSize: '12px', marginBottom: '8px' }}>
                                    {data.count} משתתפים ({data.percentage}%)
                                  </p>
                                  {participants.length > 0 && (
                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #475569' }}>
                                      <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: 'bold' }}>
                                        המשתתפים:
                                      </p>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {participants.map((name, idx) => (
                                          <span key={idx} style={{ 
                                            background: '#1e293b', 
                                            color: '#f8fafc',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '10px'
                                          }}>
                                            {name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Bar 
                            dataKey="count" 
                            fill="#8b5cf6" 
                            radius={[8, 8, 0, 0]} 
                            cursor={{ fill: 'transparent' }}
                            activeBar={false}
                          >
                            {userStats.ageData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* תצוגת משחקים */}
        {selectedSection && (selectedSection === 'rounds' || selectedSection === israeliTable?.id) && (
          <div className="space-y-6">
            {selectedSection === 'rounds' && roundTables.length > 0 && (
              <Card className="mb-6" style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                backdropFilter: 'blur(10px)'
              }}>
                <CardHeader>
                  <CardTitle style={{ color: '#06b6d4' }}>בחר מחזור</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select onValueChange={setSelectedRound} value={selectedRound}>
                    <SelectTrigger className="w-[180px] bg-slate-700/50 border-cyan-400 text-cyan-200">
                      <SelectValue placeholder="בחר מחזור" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-cyan-400 text-cyan-200">
                      {roundTables.map(table => (
                        <SelectItem key={table.id} value={table.id}>
                          {table.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            {gameStats ? (
              <>
                {/* 🆕 טבלת סיכום מרכזת - RESPONSIVE */}
                {selectedSection === 'rounds' && selectedRound && (
                  (() => {
                    const gamesByDate = {};

                    gameStatsArray
                      .sort((a, b) => parseQuestionId(a.question.question_id) - parseQuestionId(b.question.question_id))
                      .forEach(game => {
                        const date = game.question.game_date || 'ללא תאריך';
                        if (!gamesByDate[date]) {
                          gamesByDate[date] = [];
                        }
                        gamesByDate[date].push(game);
                      });

                    const dates = Object.keys(gamesByDate).sort();

                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
                        {dates.map((date, dateIdx) => (
                          <Card key={dateIdx} style={{
                            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(14, 165, 233, 0.15) 100%)',
                            border: '2px solid rgba(6, 182, 212, 0.4)',
                            boxShadow: '0 0 20px rgba(6, 182, 212, 0.2)'
                          }}>
                            <CardHeader className="pb-2 px-2 py-2">
                              <CardTitle className="flex items-center gap-2 text-sm md:text-base" style={{ color: '#06b6d4' }}>
                                <Trophy className="w-4 h-4" />
                                יום {dateIdx + 1} - {date}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-2">
                              <TooltipProvider delayDuration={0}>
                                <div className="overflow-x-auto">
                                  <table className="w-full border-collapse text-[10px] md:text-xs">
                                    <thead>
                                      <tr style={{
                                        background: 'rgba(6, 182, 212, 0.2)',
                                        borderBottom: '2px solid rgba(6, 182, 212, 0.4)'
                                      }}>
                                        <th className="py-1 px-1 text-right text-[9px] md:text-xs font-bold whitespace-nowrap" style={{ color: '#06b6d4' }}>
                                          משחק
                                        </th>
                                        <th className="py-1 px-0.5 text-center text-[8px] md:text-[9px] font-bold" style={{
                                          color: '#10b981',
                                          borderLeft: '1px solid rgba(6, 182, 212, 0.2)'
                                        }} colSpan="2">
                                          בית
                                        </th>
                                        <th className="py-1 px-0.5 text-center text-[8px] md:text-[9px] font-bold" style={{
                                          color: '#f59e0b',
                                          borderLeft: '1px solid rgba(6, 182, 212, 0.2)'
                                        }} colSpan="2">
                                          תיקו
                                        </th>
                                        <th className="py-1 px-0.5 text-center text-[8px] md:text-[9px] font-bold" style={{
                                          color: '#ef4444',
                                          borderLeft: '1px solid rgba(6, 182, 212, 0.2)'
                                        }} colSpan="2">
                                          חוץ
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {gamesByDate[date].map((game, index) => {
                                        const q = game.question;
                                        const normalizedHome = normalizeTeamName(q.home_team);
                                        const normalizedAway = normalizeTeamName(q.away_team);
                                        const outcomes = analyzeGameOutcomes(game.chartData);

                                        // 🚀 Get pre-calculated participants
                                        const outcomeData = gameOutcomeParticipants.get(q.id) || {
                                          homeWinParticipants: [],
                                          drawParticipants: [],
                                          awayWinParticipants: []
                                        };

                                        const totalPredictions = outcomes.homeWins + outcomes.draws + outcomes.awayWins;
                                        const homePercent = totalPredictions > 0 ? Math.round((outcomes.homeWins / totalPredictions) * 100) : 0;
                                        const drawPercent = totalPredictions > 0 ? Math.round((outcomes.draws / totalPredictions) * 100) : 0;
                                        const awayPercent = totalPredictions > 0 ? Math.round((outcomes.awayWins / totalPredictions) * 100) : 0;

                                        const hasActualResult = q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__';
                                        let actualOutcome = null;
                                        if (hasActualResult) {
                                          const parts = q.actual_result.split('-').map(x => parseInt(x.trim()));
                                          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                            if (parts[0] > parts[1]) actualOutcome = 'home';
                                            else if (parts[0] < parts[1]) actualOutcome = 'away';
                                            else actualOutcome = 'draw';
                                          }
                                        }

                                        return (
                                          <tr
                                            key={q.id}
                                            style={{
                                              borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
                                              background: index % 2 === 0 ? 'rgba(15, 23, 42, 0.3)' : 'transparent'
                                            }}
                                            className="hover:bg-cyan-500/5 transition-colors"
                                          >
                                            <td className="py-1 px-1 text-right">
                                              <div className="text-[9px] md:text-xs font-medium whitespace-nowrap" style={{ color: '#f8fafc' }}>
                                                {normalizedHome} - {normalizedAway}
                                              </div>
                                            </td>

                                            {/* ניצחון בית */}
                                            <UITooltip>
                                              <TooltipTrigger asChild>
                                                <td
                                                  className="py-1 px-0.5 text-center cursor-pointer hover:bg-green-500/10 transition-all"
                                                  style={{
                                                    background: actualOutcome === 'home' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                                                    borderLeft: actualOutcome === 'home' ? '2px solid #10b981' : 'none'
                                                  }}
                                                >
                                                  <span className="text-[9px] md:text-xs font-bold" style={{ color: '#10b981' }}>
                                                    {homePercent}%
                                                  </span>
                                                </td>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                side="top"
                                                className="max-w-xs p-2 animate-in fade-in-0 zoom-in-95 duration-100"
                                                style={{
                                                  background: '#0f172a',
                                                  border: '2px solid #10b981',
                                                  borderRadius: '6px'
                                                }}
                                              >
                                                <p className="font-bold mb-1 text-xs" style={{ color: '#10b981' }}>
                                                  ניצחון {normalizedHome}
                                                </p>
                                                {outcomeData.homeWinParticipants.length > 0 ? (
                                                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                    {outcomeData.homeWinParticipants.map((name, idx) => (
                                                      <span
                                                        key={idx}
                                                        className="text-[8px] px-1 py-0.5 rounded"
                                                        style={{ background: '#1e293b', color: '#f8fafc' }}
                                                      >
                                                        {name}
                                                      </span>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="text-[8px]" style={{ color: '#94a3b8' }}>אין</p>
                                                )}
                                              </TooltipContent>
                                            </UITooltip>

                                            <UITooltip>
                                              <TooltipTrigger asChild>
                                                <td
                                                  className="py-1 px-0.5 text-center cursor-pointer hover:bg-green-500/10 transition-all"
                                                  style={{
                                                    background: actualOutcome === 'home' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                                                    borderLeft: '1px solid rgba(6, 182, 212, 0.2)'
                                                  }}
                                                >
                                                  <span className="text-[9px] md:text-xs" style={{ color: '#94a3b8' }}>
                                                    {outcomes.homeWins}
                                                  </span>
                                                </td>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                side="top"
                                                className="max-w-xs p-2 animate-in fade-in-0 zoom-in-95 duration-100"
                                                style={{
                                                  background: '#0f172a',
                                                  border: '2px solid #10b981',
                                                  borderRadius: '6px'
                                                }}
                                              >
                                                <p className="font-bold mb-1 text-xs" style={{ color: '#10b981' }}>
                                                  ניצחון {normalizedHome}
                                                </p>
                                                {outcomeData.homeWinParticipants.length > 0 ? (
                                                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                    {outcomeData.homeWinParticipants.map((name, idx) => (
                                                      <span
                                                        key={idx}
                                                        className="text-[8px] px-1 py-0.5 rounded"
                                                        style={{ background: '#1e293b', color: '#f8fafc' }}
                                                      >
                                                        {name}
                                                      </span>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="text-[8px]" style={{ color: '#94a3b8' }}>אין</p>
                                                )}
                                              </TooltipContent>
                                            </UITooltip>

                                            {/* תיקו */}
                                            <UITooltip>
                                              <TooltipTrigger asChild>
                                                <td
                                                  className="py-1 px-0.5 text-center cursor-pointer hover:bg-amber-500/10 transition-all"
                                                  style={{
                                                    background: actualOutcome === 'draw' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                                                    borderLeft: actualOutcome === 'draw' ? '2px solid #f59e0b' : 'none'
                                                  }}
                                                >
                                                  <span className="text-[9px] md:text-xs font-bold" style={{ color: '#f59e0b' }}>
                                                    {drawPercent}%
                                                  </span>
                                                </td>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                side="top"
                                                className="max-w-xs p-2 animate-in fade-in-0 zoom-in-95 duration-100"
                                                style={{
                                                  background: '#0f172a',
                                                  border: '2px solid #f59e0b',
                                                  borderRadius: '6px'
                                                }}
                                              >
                                                <p className="font-bold mb-1 text-xs" style={{ color: '#f59e0b' }}>תיקו</p>
                                                {outcomeData.drawParticipants.length > 0 ? (
                                                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                    {outcomeData.drawParticipants.map((name, idx) => (
                                                      <span
                                                        key={idx}
                                                        className="text-[8px] px-1 py-0.5 rounded"
                                                        style={{ background: '#1e293b', color: '#f8fafc' }}
                                                      >
                                                        {name}
                                                      </span>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="text-[8px]" style={{ color: '#94a3b8' }}>אין</p>
                                                )}
                                              </TooltipContent>
                                            </UITooltip>

                                            <UITooltip>
                                              <TooltipTrigger asChild>
                                                <td
                                                  className="py-1 px-0.5 text-center cursor-pointer hover:bg-amber-500/10 transition-all"
                                                  style={{
                                                    background: actualOutcome === 'draw' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                                                    borderLeft: '1px solid rgba(6, 182, 212, 0.2)'
                                                  }}
                                                >
                                                  <span className="text-[9px] md:text-xs" style={{ color: '#94a3b8' }}>
                                                    {outcomes.draws}
                                                  </span>
                                                </td>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                side="top"
                                                className="max-w-xs p-2 animate-in fade-in-0 zoom-in-95 duration-100"
                                                style={{
                                                  background: '#0f172a',
                                                  border: '2px solid #f59e0b',
                                                  borderRadius: '6px'
                                                }}
                                              >
                                                <p className="font-bold mb-1 text-xs" style={{ color: '#f59e0b' }}>תיקו</p>
                                                {outcomeData.drawParticipants.length > 0 ? (
                                                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                    {outcomeData.drawParticipants.map((name, idx) => (
                                                      <span
                                                        key={idx}
                                                        className="text-[8px] px-1 py-0.5 rounded"
                                                        style={{ background: '#1e293b', color: '#f8fafc' }}
                                                      >
                                                        {name}
                                                      </span>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="text-[8px]" style={{ color: '#94a3b8' }}>אין</p>
                                                )}
                                              </TooltipContent>
                                            </UITooltip>

                                            {/* ניצחון חוץ */}
                                            <UITooltip>
                                              <TooltipTrigger asChild>
                                                <td
                                                  className="py-1 px-0.5 text-center cursor-pointer hover:bg-red-500/10 transition-all"
                                                  style={{
                                                    background: actualOutcome === 'away' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                                                    borderLeft: actualOutcome === 'away' ? '2px solid #ef4444' : 'none'
                                                  }}
                                                >
                                                  <span className="text-[9px] md:text-xs font-bold" style={{ color: '#ef4444' }}>
                                                    {awayPercent}%
                                                  </span>
                                                </td>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                side="top"
                                                className="max-w-xs p-2 animate-in fade-in-0 zoom-in-95 duration-100"
                                                style={{
                                                  background: '#0f172a',
                                                  border: '2px solid #ef4444',
                                                  borderRadius: '6px'
                                                }}
                                              >
                                                <p className="font-bold mb-1 text-xs" style={{ color: '#ef4444' }}>
                                                  ניצחון {normalizedAway}
                                                </p>
                                                {outcomeData.awayWinParticipants.length > 0 ? (
                                                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                    {outcomeData.awayWinParticipants.map((name, idx) => (
                                                      <span
                                                        key={idx}
                                                        className="text-[8px] px-1 py-0.5 rounded"
                                                        style={{ background: '#1e293b', color: '#f8fafc' }}
                                                      >
                                                        {name}
                                                      </span>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="text-[8px]" style={{ color: '#94a3b8' }}>אין</p>
                                                )}
                                              </TooltipContent>
                                            </UITooltip>

                                            <UITooltip>
                                              <TooltipTrigger asChild>
                                                <td
                                                  className="py-1 px-0.5 text-center cursor-pointer hover:bg-red-500/10 transition-all"
                                                  style={{
                                                    background: actualOutcome === 'away' ? 'rgba(239, 68, 68, 0.2)' : 'transparent'
                                                  }}
                                                >
                                                  <span className="text-[9px] md:text-xs" style={{ color: '#94a3b8' }}>
                                                    {outcomes.awayWins}
                                                  </span>
                                                </td>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                side="top"
                                                className="max-w-xs p-2 animate-in fade-in-0 zoom-in-95 duration-100"
                                                style={{
                                                  background: '#0f172a',
                                                  border: '2px solid #ef4444',
                                                  borderRadius: '6px'
                                                }}
                                              >
                                                <p className="font-bold mb-1 text-xs" style={{ color: '#ef4444' }}>
                                                  ניצחון {normalizedAway}
                                                </p>
                                                {outcomeData.awayWinParticipants.length > 0 ? (
                                                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                    {outcomeData.awayWinParticipants.map((name, idx) => (
                                                      <span
                                                        key={idx}
                                                        className="text-[8px] px-1 py-0.5 rounded"
                                                        style={{ background: '#1e293b', color: '#f8fafc' }}
                                                      >
                                                        {name}
                                                      </span>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="text-[8px]" style={{ color: '#94a3b8' }}>אין</p>
                                                )}
                                              </TooltipContent>
                                            </UITooltip>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </TooltipProvider>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    );
                  })()
                )}

                <div className="grid md:grid-cols-3 gap-4">
                  <Card style={{
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.2) 100%)',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                  }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-blue-200 flex items-center gap-2 text-sm">
                        <Target className="w-4 h-4" />
                        משחקים
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-white">{gameStatsArray.length}</p>
                    </CardContent>
                  </Card>

                  <Card style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-green-200 flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4" />
                        משתתפים
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-white">
                        {uniqueParticipantsCount}
                      </p>
                    </CardContent>
                  </Card>

                  <Card style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(124, 58, 237, 0.2) 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.3)'
                  }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-purple-200 flex items-center gap-2 text-sm">
                        <BarChart3 className="w-4 h-4" />
                        ניחושים
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-white">
                        {gameStatsArray.reduce((sum, game) => sum + game.totalPredictions, 0)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {gameStatsArray
                    .sort((a, b) => parseQuestionId(a.question.question_id) - parseQuestionId(b.question.question_id))
                    .map(game => {
                    const q = game.question;
                    const normalizedHome = normalizeTeamName(q.home_team);
                    const normalizedAway = normalizeTeamName(q.away_team);

                    const homeTeam = teams[normalizedHome];
                    const awayTeam = teams[normalizedAway];

                    const hasActualResult = q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__';
                    const formattedActualResult = formatResult(q.actual_result);

                    const outcomes = analyzeGameOutcomes(game.chartData);

                    // 🚀 Get pre-calculated participants
                    const outcomeData = gameOutcomeParticipants.get(q.id) || {
                      homeWinParticipants: [],
                      drawParticipants: [],
                      awayWinParticipants: []
                    };

                    return (
                      <Card key={q.id} className="bg-slate-800/40 border-slate-700 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 pointer-events-none" />
                        <CardHeader className="pb-3 relative z-10">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="border-cyan-400 text-cyan-200 text-xs font-bold">
                                {q.question_id}
                              </Badge>
                              <div className="flex items-center gap-2">
                                {homeTeam?.logo_url && (
                                  <img src={homeTeam.logo_url} alt={normalizedHome} className="w-5 h-5 rounded-full shadow-lg" />
                                )}
                                <span className="text-slate-200 font-medium text-sm">{normalizedHome}</span>
                                <span className="text-slate-500 text-xs">נגד</span>
                                <span className="text-slate-200 font-medium text-sm">{normalizedAway}</span>
                                {awayTeam?.logo_url && (
                                  <img src={awayTeam.logo_url} alt={normalizedAway} className="w-5 h-5 rounded-full shadow-lg" />
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {hasActualResult && (
                                <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white text-xs font-bold shadow-lg">
                                  ⭐ {formattedActualResult}
                                </Badge>
                              )}
                              <Badge className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xs font-bold shadow-lg">
                                {game.totalPredictions} ניחושים
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="relative z-10">
                          {/* 🆕 טבלת התפלגות תוצאות עם tooltips */}
                          <TooltipProvider>
                            <div className="mb-4 rounded-lg p-3" style={{
                              background: 'rgba(6, 182, 212, 0.1)',
                              border: '1px solid rgba(6, 182, 212, 0.2)'
                            }}>
                              <table className="w-full text-center">
                                <thead>
                                  <tr className="border-b border-cyan-500/30">
                                    <th className="py-2 text-xs font-bold" style={{ color: '#10b981' }}>
                                      {normalizedHome}
                                    </th>
                                    <th className="py-2 text-xs font-bold" style={{ color: '#94a3b8' }}>
                                      תיקו
                                    </th>
                                    <th className="py-2 text-xs font-bold" style={{ color: '#ef4444' }}>
                                      {normalizedAway}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td className="py-2">
                                      <UITooltip delayDuration={100}>
                                        <TooltipTrigger asChild>
                                          <div className="flex flex-col items-center cursor-pointer hover:bg-green-500/10 rounded-lg p-2 transition-colors">
                                            <span className="text-2xl font-bold" style={{ color: '#10b981' }}>
                                              {outcomes.homeWins}
                                            </span>
                                            <span className="text-xs" style={{ color: '#94a3b8' }}>
                                              מנחשים
                                            </span>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          className="max-w-sm"
                                          style={{
                                            background: '#0f172a',
                                            border: '2px solid #10b981',
                                            borderRadius: '8px',
                                            padding: '12px'
                                          }}
                                        >
                                          <p className="font-bold mb-2" style={{ color: '#10b981' }}>
                                            ניחשו ניצחון {normalizedHome}
                                          </p>
                                          {outcomeData.homeWinParticipants.length > 0 ? (
                                            <>
                                              <p className="text-xs mb-1" style={{ color: '#94a3b8' }}>({outcomeData.homeWinParticipants.length} משתתפים)</p>
                                              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                                                {outcomeData.homeWinParticipants.map((name, idx) => (
                                                  <span
                                                    key={idx}
                                                    className="text-xs px-2 py-1 rounded"
                                                    style={{ background: '#1e293b', color: '#f8fafc' }}
                                                  >
                                                    {name}
                                                  </span>
                                                ))}
                                              </div>
                                            </>
                                          ) : (
                                            <p className="text-xs" style={{ color: '#94a3b8' }}>אין מנחשים</p>
                                          )}
                                        </TooltipContent>
                                      </UITooltip>
                                    </td>

                                    <td className="py-2">
                                      <UITooltip delayDuration={100}>
                                        <TooltipTrigger asChild>
                                          <div className="flex flex-col items-center cursor-pointer hover:bg-amber-500/10 rounded-lg p-2 transition-colors">
                                            <span className="text-2xl font-bold" style={{ color: '#f59e0b' }}>
                                              {outcomes.draws}
                                            </span>
                                            <span className="text-xs" style={{ color: '#94a3b8' }}>
                                              מנחשים
                                            </span>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          className="max-w-sm"
                                          style={{
                                            background: '#0f172a',
                                            border: '2px solid #f59e0b',
                                            borderRadius: '8px',
                                            padding: '12px'
                                          }}
                                        >
                                          <p className="font-bold mb-2" style={{ color: '#f59e0b' }}>
                                            ניחשו תיקו
                                          </p>
                                          {outcomeData.drawParticipants.length > 0 ? (
                                            <>
                                              <p className="text-xs mb-1" style={{ color: '#94a3b8' }}>({outcomeData.drawParticipants.length} משתתפים)</p>
                                              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                                                {outcomeData.drawParticipants.map((name, idx) => (
                                                  <span
                                                    key={idx}
                                                    className="text-xs px-2 py-1 rounded"
                                                    style={{ background: '#1e293b', color: '#f8fafc' }}
                                                  >
                                                    {name}
                                                  </span>
                                                ))}
                                              </div>
                                            </>
                                          ) : (
                                            <p className="text-xs" style={{ color: '#94a3b8' }}>אין מנחשים</p>
                                          )}
                                        </TooltipContent>
                                      </UITooltip>
                                    </td>

                                    <td className="py-2">
                                      <UITooltip delayDuration={100}>
                                        <TooltipTrigger asChild>
                                          <div className="flex flex-col items-center cursor-pointer hover:bg-red-500/10 rounded-lg p-2 transition-colors">
                                            <span className="text-2xl font-bold" style={{ color: '#ef4444' }}>
                                              {outcomes.awayWins}
                                            </span>
                                            <span className="text-xs" style={{ color: '#94a3b8' }}>
                                              מנחשים
                                            </span>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          className="max-w-sm"
                                          style={{
                                            background: '#0f172a',
                                            border: '2px solid #ef4444',
                                            borderRadius: '8px',
                                            padding: '12px'
                                          }}
                                        >
                                          <p className="font-bold mb-2" style={{ color: '#ef4444' }}>
                                            ניצחון {normalizedAway}
                                          </p>
                                          {outcomeData.awayWinParticipants.length > 0 ? (
                                            <>
                                              <p className="text-xs mb-1" style={{ color: '#94a3b8' }}>({outcomeData.awayWinParticipants.length} משתתפים)</p>
                                              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                                                {outcomeData.awayWinParticipants.map((name, idx) => (
                                                  <span
                                                    key={idx}
                                                    className="text-xs px-2 py-1 rounded"
                                                    style={{ background: '#1e293b', color: '#f8fafc' }}
                                                  >
                                                    {name}
                                                  </span>
                                                ))}
                                              </div>
                                            </>
                                          ) : (
                                            <p className="text-xs" style={{ color: '#94a3b8' }}>אין מנחשים</p>
                                          )}
                                        </TooltipContent>
                                      </UITooltip>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </TooltipProvider>

                          <div className="relative">
                           <ResponsiveContainer width="100%" height={650}>
                             <RechartsPieChart>
                               <Pie
                                 data={game.chartData}
                                 cx="50%"
                                 cy="45%"
                                 startAngle={-60}
                                 endAngle={300}
                                 outerRadius={160}
                                 innerRadius={0}
                                 dataKey="value"
                                 labelLine={false}
                                 label={(entry) => {
                                  const RADIAN = Math.PI / 180;
                                  const percentage = parseFloat(entry.percentage);

                                  const isActualResult = hasActualResult &&
                                    normalizePrediction(entry.name) === normalizePrediction(q.actual_result);
                                  const displayName = formatResult(entry.name);

                                  // פלחים גדולים (>10%) - תווית בתוך הפלח
                                  if (percentage > 10) {
                                    const radius = entry.outerRadius * 0.65;
                                    const x = entry.cx + radius * Math.cos(-entry.midAngle * RADIAN);
                                    const y = entry.cy + radius * Math.sin(-entry.midAngle * RADIAN);

                                    return (
                                      <g>
                                        <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="middle"
                                              style={{ fontSize: '12px', fontWeight: 'bold' }}>
                                          {displayName}
                                        </text>
                                        <text x={x} y={y + 15} fill="#ffffff" textAnchor="middle" dominantBaseline="middle"
                                              style={{ fontSize: '10px' }}>
                                          {percentage}%
                                        </text>
                                      </g>
                                    );
                                  }

                                  // פלחים קטנים - תווית מחוץ במרכז הקשת
                                  const labelRadius = entry.outerRadius + 30;
                                  const x = entry.cx + labelRadius * Math.cos(-entry.midAngle * RADIAN);
                                  const y = entry.cy + labelRadius * Math.sin(-entry.midAngle * RADIAN);

                                  return (
                                    <g>
                                      <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="middle"
                                            style={{ fontSize: '10px', fontWeight: 'bold' }}>
                                        {displayName}
                                      </text>
                                      <text x={x} y={y + 13} fill="#ffffff" textAnchor="middle" dominantBaseline="middle"
                                            style={{ fontSize: '9px' }}>
                                        {percentage}%
                                      </text>
                                    </g>
                                  );
                                 }}
                               >
                                 {game.chartData.map((entry, index) => {
                                   const isActualResult = hasActualResult &&
                                     normalizePrediction(entry.name) === normalizePrediction(q.actual_result);

                                   return (
                                     <Cell
                                       key={`cell-${index}`}
                                       fill={COLORS[index % COLORS.length]}
                                       stroke={isActualResult ? '#fbbf24' : 'rgba(15, 23, 42, 0.8)'}
                                       strokeWidth={isActualResult ? 3 : 2}
                                     />
                                   );
                                 })}
                               </Pie>
                               <Tooltip
                                  cursor={false}
                                  content={({ payload }) => {
                                    if (!payload || !payload[0]) return null;
                                    const data = payload[0].payload;

                                    const key = `${q.id}_${normalizePrediction(data.name)}`;
                                    const participants = participantsByQuestionAndAnswer.get(key) || [];

                                    return (
                                      <div
                                        style={{
                                          maxWidth: '500px',
                                          background: '#0a0f1a',
                                          backgroundColor: '#0a0f1a',
                                          border: '2px solid #06b6d4',
                                          borderRadius: '8px',
                                          padding: '12px',
                                          boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
                                        }}
                                      >
                                        <p className="font-bold mb-2" style={{ color: '#06b6d4', fontSize: '13px' }}>
                                          {formatResult(data.name)}
                                        </p>
                                        <p style={{ color: '#f8fafc', fontSize: '12px', marginBottom: '8px' }}>
                                          {data.value} משתתפים ({data.percentage}%)
                                        </p>
                                        {participants.length > 0 && (
                                          <div className="mt-2 pt-2" style={{ borderTop: '1px solid #475569' }}>
                                            <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '8px', fontWeight: 'bold' }}>
                                              המשתתפים שניחשו ({participants.length}):
                                            </p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                              {participants.map((name, idx) => (
                                                <span key={idx} style={{ 
                                                  background: '#1e293b', 
                                                  color: '#f8fafc',
                                                  padding: '4px 8px',
                                                  borderRadius: '4px',
                                                  fontSize: '10px'
                                                }}>
                                                  {name}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }}
                                />
                             </RechartsPieChart>
                           </ResponsiveContainer>
                          </div>

                          {hasActualResult && (
                            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg text-center">
                              <p className="text-yellow-300 font-bold">⭐ תוצאת אמת: {formattedActualResult}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            ) : (
              <Card style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)'
              }}>
                <CardContent className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#06b6d4' }} />
                  <p style={{ color: '#94a3b8' }}>טוען נתונים...</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* תצוגת שאלות מיוחדות */}
        {selectedSection && selectedSection !== 'rounds' && selectedSection !== israeliTable?.id && selectedSection !== 'insights' && selectedSection !== 'users' && specialStats && (
          <div className="space-y-6">
            {Object.values(specialStats).map(tableStats => (
              <div key={tableStats.table.id}>
                <h2 className="text-2xl font-bold text-white mb-4">{tableStats.table.description}</h2>

                {tableStats.locationsData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <Card className="bg-slate-800/40 border-slate-700">
                        <CardContent className="p-4">
                          <p className="text-sm text-slate-400">סה"כ בחירות</p>
                          <p className="text-3xl font-bold text-cyan-400">{tableStats.locationsData.totalPredictions}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-800/40 border-slate-700">
                        <CardContent className="p-4">
                          <p className="text-sm text-slate-400">קבוצות ייחודיות</p>
                          <p className="text-3xl font-bold text-blue-400">{tableStats.locationsData.uniqueTeams}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-800/40 border-slate-700">
                        <CardContent className="p-4">
                          <p className="text-sm text-slate-400">הכי פופולרית</p>
                          <p className="text-lg font-bold text-green-400">{tableStats.locationsData.mostPopular.team}</p>
                          <p className="text-sm text-slate-400">{tableStats.locationsData.mostPopular.count} בחירות ({tableStats.locationsData.mostPopular.percentage}%)</p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="bg-slate-800/40 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-cyan-300">10 הקבוצות הפופולריות ביותר</CardTitle>
                      </CardHeader>
                      <CardContent className="px-2 pb-3">
                        <ResponsiveContainer width="100%" height={450}>
                          <BarChart
                            data={tableStats.locationsData.topTeams.slice(0, 10)}
                            margin={{ top: 30, right: 0, left: 0, bottom: 130 }}
                          >
                            <defs>
                              <linearGradient id="barHover3" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgba(6, 182, 212, 0.15)" stopOpacity="1" />
                                <stop offset="100%" stopColor="rgba(6, 182, 212, 0.05)" stopOpacity="1" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                              dataKey="team"
                              angle={0}
                              textAnchor="middle"
                              height={120}
                              stroke="#94a3b8"
                              interval={0}
                              tick={({ x, y, payload }) => {
                                const maxCharsPerLine = 10;
                                const words = String(payload.value).split(' ');
                                const lines = [];
                                let currentLine = '';

                                words.forEach(word => {
                                  const testLine = currentLine ? `${currentLine} ${word}` : word;
                                  if (testLine.length <= maxCharsPerLine) {
                                    currentLine = testLine;
                                  } else {
                                    if (currentLine) lines.push(currentLine);
                                    currentLine = word;
                                  }
                                });
                                if (currentLine) lines.push(currentLine);

                                const displayLines = lines.slice(0, 3);

                                return (
                                  <g transform={`translate(${x},${y})`}>
                                    {displayLines.map((line, index) => (
                                      <text
                                        key={index}
                                        x={0}
                                        y={index * 14 + 10}
                                        textAnchor="middle"
                                        fill="#94a3b8"
                                        fontSize="10px"
                                      >
                                        {line}
                                      </text>
                                    ))}
                                  </g>
                                );
                              }}
                            />
                            <YAxis
                              stroke="#94a3b8"
                              tick={{ fontSize: 12, fill: '#94a3b8' }}
                            />
                            <Tooltip
                              wrapperStyle={{ zIndex: 1000 }}
                              cursor={false}
                              content={({ payload }) => {
                                if (!payload || !payload[0]) return null;
                                const data = payload[0].payload;

                                const allQuestionsInTable = locationTables
                                  .find(t => t.id === tableStats.table.id)?.questions || [];

                                const participants = allQuestionsInTable.flatMap(q => {
                                    const key = `${q.id}_${normalizePrediction(data.team)}`;
                                    return participantsByQuestionAndAnswer.get(key) || [];
                                }).filter((name, index, self) => self.indexOf(name) === index)
                                .sort((a, b) => a.localeCompare(b, 'he'));

                                return (
                                  <div style={{ 
                                    background: '#0a0f1a',
                                    backgroundColor: '#0a0f1a',
                                    border: '2px solid #06b6d4', 
                                    borderRadius: '8px', 
                                    padding: '12px', 
                                    maxWidth: '350px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
                                  }}>
                                    <p style={{ color: '#06b6d4', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                                      {data.team}
                                    </p>
                                    <p style={{ color: '#f8fafc', fontSize: '12px', marginBottom: '8px' }}>
                                      {data.count} בחירות ({data.percentage}%)
                                    </p>
                                    {participants.length > 0 && (
                                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #475569' }}>
                                        <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: 'bold' }}>
                                          המשתתפים:
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                          {participants.map((name, idx) => (
                                            <span key={idx} style={{ 
                                              background: '#1e293b', 
                                              color: '#f8fafc',
                                              padding: '4px 8px',
                                              borderRadius: '4px',
                                              fontSize: '10px'
                                            }}>
                                              {name}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              }}
                            />
                            <Bar 
                              dataKey="count" 
                              fill="#06b6d4" 
                              radius={[8, 8, 0, 0]} 
                              cursor={{ fill: 'transparent' }}
                              activeBar={false}
                            >
                              {tableStats.locationsData.topTeams.slice(0, 10).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tableStats.questions
                      .filter(qStat => qStat.question.question_id !== '11.1')
                      .sort((a, b) => parseFloat(a.question.question_id) - parseFloat(b.question.question_id))
                      .map(qStat => {
                      const q = qStat.question;

                      const usePieChart = qStat.chartData.length <= 3 && qStat.chartData.length > 0;

                      const hasActualResult = q.actual_result &&
                                             q.actual_result.trim() !== '' &&
                                             q.actual_result !== '__CLEAR__';

                      return (
                        <Card key={q.id} className="bg-slate-800/40 border-slate-700 flex flex-col">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" style={{
                                borderColor: 'rgba(6, 182, 212, 0.5)',
                                color: '#06b6d4',
                                minWidth: '50px'
                              }} className="justify-center">
                                {q.question_id}
                              </Badge>
                              <Badge className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xs">
                                {qStat.totalAnswers} תשובות
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-200 leading-tight min-h-[40px]">{q.question_text}</p>
                          </CardHeader>
                          <CardContent className="px-2 pb-3 flex-1 flex flex-col">
                            {qStat.chartData.length > 0 ? (
                              <>
                                <div className="flex-1 flex items-end" style={{ minHeight: '300px', maxHeight: '300px' }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    {usePieChart ? (
                                     <RechartsPieChart>
                                       <Pie
                                         data={qStat.chartData}
                                         cx="50%"
                                         cy="50%"
                                         labelLine={false}
                                         label={({ cx, cy, midAngle, innerRadius, outerRadius, answer, percentage, count }) => {
                                            const RADIAN = Math.PI / 180;
                                            const percentNum = parseFloat(percentage);
                                            const cleanAnswer = answer.replace(':', '').trim();

                                            const hasActualResultLocal = q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__';
                                            const isActualResult = hasActualResultLocal && answer === q.actual_result;

                                            // פלחים גדולים (>15%) - תווית בתוך הפלח
                                            if (percentNum > 15) {
                                              const radius = outerRadius * 0.65;
                                              const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                              const y = cy + radius * Math.sin(-midAngle * RADIAN);

                                              return (
                                                <g>
                                                  {isActualResult && (
                                                    <text x={x} y={y - 14} fill="#fbbf24" textAnchor="middle" dominantBaseline="middle"
                                                          style={{ fontSize: '11px' }}>
                                                      ⭐
                                                    </text>
                                                  )}
                                                  <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="middle"
                                                        style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                    {cleanAnswer}
                                                  </text>
                                                  <text x={x} y={y + 13} fill="#ffffff" textAnchor="middle" dominantBaseline="middle"
                                                        style={{ fontSize: '9px' }}>
                                                    {percentage}%
                                                  </text>
                                                </g>
                                              );
                                            }

                                            // פלחים קטנים - תווית מחוץ במרכז הקשת
                                            const labelRadius = outerRadius + 25;
                                            const x = cx + labelRadius * Math.cos(-midAngle * RADIAN);
                                            const y = cy + labelRadius * Math.sin(-midAngle * RADIAN);

                                            return (
                                              <g>
                                                {isActualResult && (
                                                  <text x={x} y={y - 12} fill="#fbbf24" textAnchor="middle" dominantBaseline="middle"
                                                        style={{ fontSize: '10px' }}>
                                                    ⭐
                                                  </text>
                                                )}
                                                <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="middle"
                                                      style={{ fontSize: '10px', fontWeight: 'bold' }}>
                                                  {cleanAnswer}
                                                </text>
                                                <text x={x} y={y + 12} fill="#ffffff" textAnchor="middle" dominantBaseline="middle"
                                                      style={{ fontSize: '9px' }}>
                                                  {percentage}%
                                                </text>
                                              </g>
                                            );
                                          }}
                                          outerRadius={70}
                                          fill="#8884d8"
                                          dataKey="count"
                                          style={{ outline: 'none' }}
                                        >
                                          {qStat.chartData.map((entry, index) => {
                                            const hasActualResultLocal = q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__';
                                            const isActualResult = hasActualResultLocal && entry.answer === q.actual_result;

                                            return (
                                              <Cell
                                                key={`cell-${index}`}
                                                fill={COLORS[index % COLORS.length]}
                                                stroke={isActualResult ? '#fbbf24' : 'rgba(15, 23, 42, 0.8)'}
                                                strokeWidth={isActualResult ? 3 : 2}
                                                style={{
                                                  filter: isActualResult ? 'brightness(1.2) drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))' : 'none'
                                                }}
                                              />
                                            );
                                          })}
                                        </Pie>
                                        <Tooltip
                                        wrapperStyle={{ zIndex: 1000 }}
                                        cursor={false}
                                        content={({ payload }) => {
                                          if (!payload || !payload[0]) return null;
                                          const data = payload[0].payload;

                                          const normalized = normalizePrediction(data.answer.trim());
                                          const key1 = `${q.id}_${normalized}`;
                                          const key2 = `${q.id}_${data.answer.trim()}`;
                                          let participants = participantsByQuestionAndAnswer.get(key1) || [];
                                          if (participants.length === 0) {
                                            participants = participantsByQuestionAndAnswer.get(key2) || [];
                                          }

                                          return (
                                            <div style={{ 
                                              background: '#0a0f1a',
                                              backgroundColor: '#0a0f1a',
                                              border: '2px solid #06b6d4', 
                                              borderRadius: '8px', 
                                              padding: '12px', 
                                              maxWidth: '350px',
                                              boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
                                            }}>
                                               <p style={{ color: '#06b6d4', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                                                 {data.answer}
                                               </p>
                                               <p style={{ color: '#f8fafc', fontSize: '12px', marginBottom: '8px' }}>
                                                 {data.count} תשובות ({data.percentage}%)
                                               </p>
                                               {participants.length > 0 && (
                                                 <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #475569' }}>
                                                   <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: 'bold' }}>
                                                     המשתתפים:
                                                   </p>
                                                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                                     {participants.map((name, idx) => (
                                                       <span key={idx} style={{ 
                                                         background: '#1e293b', 
                                                         color: '#f8fafc',
                                                         padding: '4px 8px',
                                                         borderRadius: '4px',
                                                         fontSize: '10px'
                                                       }}>
                                                         {name}
                                                       </span>
                                                     ))}
                                                   </div>
                                                 </div>
                                               )}
                                             </div>
                                           );
                                         }}
                                        />
                                        </RechartsPieChart>
                                    ) : (
                                      <BarChart
                                       data={(() => {
                                         const sortedData = [...qStat.chartData];

                                         // מיון לפי רשימת אימות אם קיימת
                                         if (q.validation_list && validationLists[q.validation_list]) {
                                           const validationOrder = validationLists[q.validation_list];
                                           sortedData.sort((a, b) => {
                                             const aIndex = validationOrder.indexOf(a.answer);
                                             const bIndex = validationOrder.indexOf(b.answer);

                                             // אם שניהם ברשימה - לפי הסדר
                                             if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                                             // אם רק a ברשימה - a לפני b
                                             if (aIndex !== -1) return -1;
                                             // אם רק b ברשימה - b לפני a
                                             if (bIndex !== -1) return 1;
                                             // אם שניהם לא ברשימה - מיון אלפביתי
                                             return a.answer.localeCompare(b.answer, 'he');
                                           });
                                         } else {
                                           // אם אין רשימת אימות - מיון לפי אותיות עבריות או אלפביתי
                                           const hasHebrewLetters = sortedData.some(item =>
                                             /[א-ת]/.test(item.answer)
                                           );

                                           if (hasHebrewLetters) {
                                             const hebrewOrder = 'אבגדהוזחטיכלמנסעפצקרשת';
                                             sortedData.sort((a, b) => {
                                               const aLetter = a.answer.match(/[א-ת]/)?.[0] || '';
                                               const bLetter = b.answer.match(/[א-ת]/)?.[0] || '';
                                               return hebrewOrder.indexOf(aLetter) - hebrewOrder.indexOf(bLetter);
                                             });
                                           } else {
                                             sortedData.sort((a, b) => a.answer.localeCompare(b.answer, 'he'));
                                           }
                                         }

                                         return sortedData.slice(0, 10);
                                       })()}
                                       margin={{ top: 10, right: 5, left: 5, bottom: 60 }}
                                       >
                                        <defs>
                                          <linearGradient id="barHover4" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="rgba(6, 182, 212, 0.15)" stopOpacity="1" />
                                            <stop offset="100%" stopColor="rgba(6, 182, 212, 0.05)" stopOpacity="1" />
                                          </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis
                                          dataKey="answer"
                                          angle={0}
                                          textAnchor="middle"
                                          height={60}
                                          stroke="#94a3b8"
                                          interval={0}
                                          tick={({ x, y, payload }) => {
                                            const maxCharsPerLine = 8;
                                            const words = String(payload.value).split(' ');
                                            const lines = [];
                                            let currentLine = '';

                                            words.forEach(word => {
                                              const testLine = currentLine ? `${currentLine} ${word}` : word;
                                              if (testLine.length <= maxCharsPerLine) {
                                                currentLine = testLine;
                                              } else {
                                                if (currentLine) lines.push(currentLine);
                                                currentLine = word;
                                              }
                                            });
                                            if (currentLine) lines.push(currentLine);

                                            const displayLines = lines.slice(0, 3);

                                            return (
                                              <g transform={`translate(${x},${y})`}>
                                                {displayLines.map((line, index) => (
                                                  <text
                                                    key={index}
                                                    x={0}
                                                    y={index * 10 + 6}
                                                    textAnchor="middle"
                                                    fill="#94a3b8"
                                                    fontSize="8px"
                                                  >
                                                    {line}
                                                  </text>
                                                ))}
                                              </g>
                                            );
                                          }}
                                        />
                                        <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                        <Tooltip
                                         wrapperStyle={{ zIndex: 1000 }}
                                         cursor={false}
                                         content={({ payload }) => {
                                           if (!payload || !payload[0]) return null;
                                           const data = payload[0].payload;

                                           const normalized = normalizePrediction(data.answer.trim());
                                           const key1 = `${q.id}_${normalized}`;
                                           const key2 = `${q.id}_${data.answer.trim()}`;
                                           let participants = participantsByQuestionAndAnswer.get(key1) || [];
                                           if (participants.length === 0) {
                                             participants = participantsByQuestionAndAnswer.get(key2) || [];
                                           }

                                           return (
                                             <div style={{ 
                                               background: '#0a0f1a',
                                               backgroundColor: '#0a0f1a',
                                               border: '2px solid #06b6d4', 
                                               borderRadius: '8px', 
                                               padding: '12px', 
                                               maxWidth: '350px',
                                               boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
                                             }}>
                                                <p style={{ color: '#06b6d4', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                                                  {data.answer}
                                                </p>
                                                <p style={{ color: '#f8fafc', fontSize: '12px', marginBottom: '8px' }}>
                                                  {data.count} תשובות ({data.percentage}%)
                                                </p>
                                                {participants.length > 0 && (
                                                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #475569' }}>
                                                    <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: 'bold' }}>
                                                      המשתתפים ({participants.length}):
                                                    </p>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                                      {participants.map((name, idx) => (
                                                        <span key={idx} style={{ 
                                                          background: '#1e293b', 
                                                          color: '#f8fafc',
                                                          padding: '4px 8px',
                                                          borderRadius: '4px',
                                                          fontSize: '10px'
                                                        }}>
                                                          {name}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }}
                                        />
                                        <Bar 
                                          dataKey="count" 
                                          fill="#06b6d4" 
                                          radius={[8, 8, 0, 0]} 
                                          cursor={{ fill: 'transparent' }}
                                          activeBar={false}
                                        >
                                          {qStat.chartData.slice(0, 10).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                          ))}
                                        </Bar>
                                      </BarChart>
                                    )}
                                  </ResponsiveContainer>
                                </div>

                                <div className="mt-3 pt-3 border-t border-slate-700 px-2">
                                  <p className="text-xs text-slate-400 mb-1">התשובה הפופולרית:</p>
                                  <p className="text-cyan-300 font-bold text-sm">{qStat.mostPopular.answer}</p>
                                  <p className="text-slate-400 text-xs">{qStat.mostPopular.count} תשובות ({qStat.mostPopular.percentage}%)</p>

                                  {hasActualResult && (
                                    <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-500/30 rounded">
                                      <p className="text-yellow-300 font-bold text-xs">⭐ תוצאת אמת: {q.actual_result}</p>
                                    </div>
                                  )}

                                  <p className="text-slate-500 text-xs mt-2">
                                    גיוון: {qStat.diversity} תשובות שונות
                                  </p>
                                </div>
                              </>
                            ) : (
                              <div className="text-center py-8 text-slate-500">
                                אין נתונים
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!selectedSection && (
          <Card className="bg-slate-800/40 border-slate-700">
            <CardContent className="p-12 text-center">
              <PieChart className="w-20 h-20 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">בחר שלב כדי לראות סטטיסטיקות מפורטות</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}