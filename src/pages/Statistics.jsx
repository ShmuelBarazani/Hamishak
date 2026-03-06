import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Users, Target, Loader2, PieChart, ChevronDown, ChevronUp, TrendingUp, Award, Database, AlertTriangle, Trophy } from "lucide-react";
import { Question } from "@/entities/Question";
import { Prediction } from "@/entities/Prediction";
import { ValidationList } from "@/entities/ValidationList";
import { Team } from "@/entities/Team";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  // Removed hoveredSlice and hoverTimeout states
  const [userStats, setUserStats] = useState(null);
  const [userStatsLoading, setUserStatsLoading] = useState(false);
  const [userStatsError, setUserStatsError] = useState(null);

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
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [questions, allTeams, lists] = await Promise.all([
        Question.list(null, 5000),
        Team.list(null, 5000),
        ValidationList.list(null, 5000),
      ]);

      console.log('📊 טוען predictions...');
      let predictions = [];
      let offset = 0;
      let hasMore = true;
      const batchSize = 5000;
      
      while (hasMore) {
        const batch = await Prediction.list(null, batchSize, offset);
        console.log(`✅ טען batch: ${batch.length} predictions (offset: ${offset})`);
        predictions = predictions.concat(batch);
        
        if (batch.length < batchSize) {
          hasMore = false;
        } else {
          offset += batchSize;
        }
      }

      console.log(`✅ סה"כ נטענו ${predictions.length} predictions`);

      // 🚀 reduce במקום forEach
      const teamsMap = allTeams.reduce((acc, team) => {
        acc[normalizeTeamName(team.name)] = team;
        return acc;
      }, {});
      setTeams(teamsMap);

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
      // Set the initial selected round after roundTables are loaded
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

      setAllQuestions(questions);
      setAllPredictions(predictions);

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
          tablesToProcess = roundTables; // If no specific round selected, process all
        }
      } else if (type === 'israeli') {
        tablesToProcess = israeliTable ? [israeliTable] : [];
      }

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

      const gameStatsData = {};

      for (const table of tablesToProcess) {
        for (const q of table.questions) {
          const gamePredictions = predictionsByQuestion.get(q.id) || [];

          // 🚀 reduce במקום forEach
          const resultCounts = gamePredictions.reduce((acc, pred) => {
            const result = pred.text_prediction || 'לא ניחש';
            acc[result] = (acc[result] || 0) + 1;
            return acc;
          }, {});

          const totalPredictions = gamePredictions.length;

          const tempChartData = Object.entries(resultCounts)
            .sort((a, b) => b[1] - a[1]) // Keep this sort for mostPopular and initial sorting
            .map(([result, count]) => ({
              name: result,
              value: count,
              percentage: totalPredictions > 0 ? ((count / totalPredictions) * 100).toFixed(1) : 0,
            }));

          // ✅ סדר מחדש - גדול-קטן-גדול-קטן למניעת דריסת תוויות
          const chartDataFinal = alternateSliceOrder(tempChartData).map(entry => ({
            ...entry,
            percentage: parseFloat(entry.percentage) // Ensure percentage is a number
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
              const qPredictions = allPredictions.filter(p => p.question_id === q.id);

              // 🚀 reduce במקום forEach
              const answerCounts = qPredictions.reduce((acc, pred) => {
                let answer = String(pred.text_prediction || '').trim();

                // נורמליזציה ובדיקות מקיפות לניחושים ריקים

                // דלג על כל סוגי הניחושים הריקים
                if (
                  !answer ||
                  answer === '' ||
                  answer === 'לא ענה' ||
                  answer === 'לא ניחש' ||
                  answer === '__CLEAR__' ||
                  answer.toLowerCase() === 'null' ||
                  answer.toLowerCase() === 'undefined'
                ) {
                  return acc; // דלג על ניחוש זה ופשוט החזר את ה-accumulator
                }

                if (q.validation_list && q.validation_list.toLowerCase().includes('קבוצ')) {
                  answer = cleanTeamName(answer);
                }

                // בדיקה נוספת אחרי cleanTeamName
                if (!answer || answer.trim() === '') {
                  return acc; // דלג על ניחוש זה
                }

                acc[answer] = (acc[answer] || 0) + 1;
                return acc;
              }, {});

              // חשב את סך התשובות בפועל (לא כולל ריקים)
              const totalAnswersWithContent = Object.values(answerCounts).reduce((sum, count) => sum + count, 0);

              // אם אין תשובות בכלל - דלג על השאלה או הצג הודעה
              const tempChartData = Object.entries(answerCounts)
                .sort((a, b) => b[1] - a[1]) // Keep this sort for mostPopular and initial sorting
                .map(([answer, count]) => ({
                  answer,
                  count,
                  percentage: totalAnswersWithContent > 0 ? ((count / totalAnswersWithContent) * 100).toFixed(1) : 0,
                }));

              // ✅ סדר מחדש - גדול-קטן-גדול-קטן למניעת דריסת תוויות
              const chartData = alternateSliceOrder(tempChartData);

              tableStats.questions.push({
                question: q,
                totalAnswers: totalAnswersWithContent, // רק תשובות עם תוכן
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

      // מצא את השאלות מטבלה T1 (פרטי משתתפים)
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

      // טען את התשובות לשאלות אלו
      const professionPredictions = professionQuestion
        ? allPredictions.filter(p => p.question_id === professionQuestion.id)
        : [];
      const agePredictions = ageQuestion
        ? allPredictions.filter(p => p.question_id === ageQuestion.id)
        : [];

      console.log('📊 תשובות מקצוע:', professionPredictions.length);
      console.log('📊 תשובות גיל:', agePredictions.length);

      // חישוב מקצועות - רק מקצועות שמולאו
      // 🚀 reduce במקום forEach
      const professionCounts = professionPredictions.reduce((acc, pred) => {
        const profession = pred.text_prediction?.trim();

        // דלג על מקצועות ריקים/לא מוגדרים/0
        if (
          !profession ||
          profession === '' ||
          profession === '0' ||
          profession.toLowerCase() === 'null' ||
          profession.toLowerCase() === 'undefined' ||
          profession === '__CLEAR__'
        ) {
          return acc; // דלג על ניחוש זה והחזר את ה-accumulator
        }

        acc[profession] = (acc[profession] || 0) + 1;
        return acc; // החזר את ה-accumulator
      }, {});

      console.log('📊 מקצועות שנמצאו:', professionCounts);

      // חשב את סך התשובות בפועל (לא כולל ריקים)
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

      // חישוב קבוצות גיל - רק גילאים שמולאו
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

        // דלג על גילאים ריקים/לא מוגדרים/0
        if (!ageStr || ageStr === '' || ageStr === '0' || isNaN(age) || age === 0) {
          return; // דלג על ניחוש זה
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

      // הצג רק קבוצות גיל עם נתונים
      const ageData = Object.entries(ageGroups)
        .filter(([_, count]) => count > 0)
        .map(([group, count]) => ({
          group,
          count,
          percentage: totalAgesWithContent > 0 ? ((count / totalAgesWithContent) * 100).toFixed(1) : 0
        }));

      console.log('📊 ageData:', ageData);

      // קבל רשימה ייחודית של משתתפים
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

      // If it's a Rate Limit or other specific error (though less likely with local data)
      if (error.message?.includes('Rate limit') || error.response?.status === 429) {
        setUserStatsError('rate_limit');
      } else {
        setUserStatsError('general_error');
      }
    } finally {
      setUserStatsLoading(false);
    }
  }, [userStats, allQuestions, allPredictions]);

  // 🚀 useCallback לחישוב outcomes - זו פונקציה שנשמרת
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
      const key = `${p.question_id}_${normalizePrediction(p.text_prediction)}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(p.participant_name);
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

  const allButtons = [];

  allButtons.push({
    numericId: -1,
    key: 'users',
    description: 'פרטי מנחשים',
    icon: Users
  });

  allButtons.push({
    numericId: 0,
    key: 'insights',
    description: 'תובנות AI ומחנות',
    icon: PieChart
  });

  if (roundTables.length > 0) {
    const firstRoundTableId = roundTables[0]?.id || 'T2';
    allButtons.push({
      numericId: parseInt(firstRoundTableId.replace('T', ''), 10),
      key: 'rounds',
      description: 'סטטיסטיקות משחקי הליגה',
      icon: Target
    });
  }

  specialTables.forEach(table => {
    // דלג על טבלה שה-description שלה "פרטי מנחשים"
    if (table.description && table.description.includes('פרטי מנחשים')) {
      return; // דלג על הטבלה הזו
    }

    allButtons.push({
      numericId: parseInt(table.id.replace('T', ''), 10),
      key: table.id,
      description: table.description,
      icon: TrendingUp
    });
  });

  if (locationTables.length > 0) {
    const firstLocationTableId = locationTables[0]?.id || 'T14';
    allButtons.push({
      numericId: parseInt(firstLocationTableId.replace('T', ''), 10),
      key: 'locations',
      description: 'מיקומים בסיום שלב הליגה',
      icon: Award
    });
  }

  if (playoffTable) {
    allButtons.push({
      numericId: parseInt(playoffTable.id.replace('T', ''), 10),
      key: playoffTable.id,
      description: playoffTable.description,
    icon: Award
    });
  }

  if (israeliTable) {
    allButtons.push({
      numericId: parseInt(israeliTable.id.replace('T', ''), 10),
      key: israeliTable.id,
      description: israeliTable.description,
    icon: Target
    });
  }

  allButtons.sort((a, b) => a.numericId - b.numericId);

  useEffect(() => {
    if (selectedSection && !loading) {
      const buttonInfo = allButtons.find(btn => btn.key === selectedSection);
      if (!buttonInfo) return;

      if (buttonInfo.key === 'rounds') {
        calculateGameStats('rounds', selectedRound); // Pass selectedRound
      } else if (buttonInfo.key === 'israeli' || buttonInfo.key === israeliTable?.id) {
        calculateGameStats('israeli');
      } else if (buttonInfo.key === 'locations') {
        calculateSpecialStats('locations');
      } else if (buttonInfo.key === playoffTable?.id) {
        calculateSpecialStats('playoff');
      } else if (buttonInfo.key === 'insights') {
        // No specific calculation needed here, InsightsAnalyzer will handle its own data.
        // But we might want to ensure allQuestions and allPredictions are loaded.
      } else if (buttonInfo.key === 'users') {
        calculateUserStats();
      }
      else {
        calculateSpecialStats('special', buttonInfo.key);
      }
    }
  }, [selectedSection, loading, calculateGameStats, calculateSpecialStats, calculateUserStats, allButtons, israeliTable, playoffTable, selectedRound]); // Add selectedRound to dependencies

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

        {/* 👥 תצוגת פרטי מנחשים */}
        {selectedSection === 'users' && (
          <div className="space-y-6">
            {userStatsLoading && (
              <Card style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)'
              }}>
                <CardContent className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#06b6d4' }} />
                  <p style={{ color: '#94a3b8' }}>טוען נתוני משתמשים...</p>
                </CardContent>
              </Card>
            )}

            {userStatsError === 'no_questions' && (
              <Card style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: '#ef4444' }} />
                  <h3 className="text-xl font-bold mb-2" style={{ color: '#ef4444' }}>לא נמצאו שאלות פרטי משתתפים</h3>
                  <p style={{ color: '#fca5a5' }}>
                    לא נמצאו שאלות מקצוע וגיל בטבלה T1
                  </p>
                </CardContent>
              </Card>
            )}

            {userStatsError === 'cache_not_found' && (
              <Card style={{
                background: 'rgba(249, 115, 22, 0.1)',
                border: '1px solid rgba(249, 115, 22, 0.3)'
              }}>
                <CardContent className="p-8 text-center">
                  <Database className="w-12 h-12 mx-auto mb-4" style={{ color: '#f97316' }} />
                  <h3 className="text-xl font-bold mb-2" style={{ color: '#f97316' }}>נתוני משתמשים לא זמינים במטמון</h3>
                  <p className="mb-4" style={{ color: '#fdba74' }}>
                    כדי להציג סטטיסטיקות משתמשים, יש צורך ליצור מטמון של הנתונים.
                  </p>
                  <p className="text-sm" style={{ color: '#94a3b8' }}>
                    <strong>מה לעשות:</strong> עבור לעמוד "סקירת מערכת" ולחץ על כפתור "רענן מטמון משתמשים"
                  </p>
                </CardContent>
              </Card>
            )}

            {userStatsError === 'rate_limit' && (
              <Card style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: '#ef4444' }} />
                  <h3 className="text-xl font-bold mb-2" style={{ color: '#ef4444' }}>יותר מדי קריאות לשרת</h3>
                  <p className="mb-4" style={{ color: '#fca5a5' }}>
                    המערכת חוסמת קריאות זמנית. אנא נסה שוב בעוד מספר שניות.
                  </p>
                  <Button
                    onClick={() => {
                      setUserStatsError(null);
                      calculateUserStats();
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                      color: 'white'
                    }}
                  >
                    נסה שוב
                  </Button>
                </CardContent>
              </Card>
            )}

            {userStatsError === 'general_error' && (
              <Card style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <CardContent className="p-6 text-center">
                  <p style={{ color: '#ef4444' }}>לא ניתן לטעון נתוני משתמשים כרגע.</p>
                </CardContent>
              </Card>
            )}

            {userStats && !userStatsLoading && !userStatsError && (
              <>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* גרף מקצועות */}
                  <Card style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)'
                  }}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
                        <Users className="w-5 h-5" />
                        מקצועות המנחשים
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {userStats.professionData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={500}>
                          <BarChart data={userStats.professionData} margin={{ top: 10, right: 5, left: 5, bottom: 100 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                              dataKey="profession"
                              angle={0} // Changed from -45 to 0 for custom tick
                              textAnchor="middle"
                              height={100}
                              stroke="#94a3b8"
                              interval={0}
                              tick={({ x, y, payload }) => {
                                const maxCharsPerLine = 10; // Adjust as needed
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

                                const displayLines = lines.slice(0, 3); // Max 3 lines

                                return (
                                  <g transform={`translate(${x},${y})`}>
                                    {displayLines.map((line, index) => (
                                      <text
                                        key={index}
                                        x={0}
                                        y={index * 14 + 10} // Adjusted Y position
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
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <Tooltip
                              contentStyle={{
                                background: '#0f172a',
                                border: '2px solid #06b6d4',
                                borderRadius: '8px',
                                opacity: 1
                              }}
                              content={({ payload }) => {
                                if (!payload || !payload[0]) return null;
                                const data = payload[0].payload;

                                const t1Questions = allQuestions.filter(q => q.table_id === 'T1');
                                const professionQuestion = t1Questions.find(q => q.question_text?.includes('מקצוע'));

                                if (!professionQuestion) return null;

                                // 🚀 שימוש ב-pre-calculated index
                                const key = `${professionQuestion.id}_${normalizePrediction(data.profession)}`;
                                const participants = participantsByQuestionAndAnswer.get(key) || [];

                                return (
                                  <div className="rounded-lg p-3 shadow-2xl" style={{ maxWidth: '500px', background: '#0f172a', border: '2px solid #06b6d4' }}>
                                    <p className="text-cyan-300 font-bold mb-2">{data.profession}</p>
                                    <p className="text-white text-sm mb-2">{data.count} משתתפים ({data.percentage}%)</p>
                                    {participants.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-slate-700" style={{ background: '#0f172a' }}>
                                        <p className="text-slate-400 text-xs mb-2">משתתפים:</p>
                                        <div className="flex flex-wrap gap-2" style={{ background: '#0f172a' }}>
                                          {participants.map((name, idx) => (
                                            <span key={idx} className="text-slate-200 text-xs px-2 py-1 rounded" style={{ background: '#1e293b' }}>
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
                            <Bar dataKey="count" fill="#06b6d4" radius={[8, 8, 0, 0]}>
                              {userStats.professionData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-center py-8 text-slate-500">
                          אין נתוני מקצועות
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* גרף גילאים */}
                  <Card style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)'
                  }}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
                        <Target className="w-5 h-5" />
                        קבוצות גיל המנחשים
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {userStats.ageData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={500}>
                          <BarChart data={userStats.ageData} margin={{ top: 10, right: 5, left: 5, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                              dataKey="group"
                              stroke="#94a3b8"
                              tick={{ fontSize: 11, fill: '#94a3b8' }}
                              height={60}
                            />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <Tooltip
                              contentStyle={{
                                background: '#0f172a',
                                border: '2px solid #06b6d4',
                                borderRadius: '8px',
                                opacity: 1
                              }}
                              formatter={(value, name, props) => {
                                return [`${value} (${props.payload.percentage}%)`, 'מספר'];
                              }}
                            />
                            <Bar dataKey="count" fill="#0ea5e9" radius={[8, 8, 0, 0]}>
                              {userStats.ageData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-center py-8 text-slate-500">
                          אין נתוני גילאים
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* סיכום */}
                <Card style={{
                  background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%)',
                  border: '1px solid rgba(6, 182, 212, 0.3)'
                }}>
                  <CardContent className="p-6">
                    <div className="grid md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm" style={{ color: '#94a3b8' }}>סה"כ מנחשים</p>
                        <p className="text-3xl font-bold" style={{ color: '#06b6d4' }}>{userStats.totalUsers}</p>
                      </div>
                      <div>
                        <p className="text-sm" style={{ color: '#94a3b8' }}>מקצועות שונים</p>
                        <p className="text-3xl font-bold" style={{ color: '#10b981' }}>{userStats.professionData.length}</p>
                      </div>
                      <div>
                        <p className="text-sm" style={{ color: '#94a3b8' }}>עם מקצוע</p>
                        <p className="text-3xl font-bold" style={{ color: '#f59e0b' }}>{userStats.totalWithProfession}</p>
                      </div>
                      <div>
                        <p className="text-sm" style={{ color: '#94a3b8' }}>עם גיל</p>
                        <p className="text-3xl font-bold" style={{ color: '#8b5cf6' }}>{userStats.totalWithAge}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* 🧠 תצוגת תובנות AI */}
        {selectedSection === 'insights' && (
          <InsightsAnalyzer
            allQuestions={allQuestions}
            allPredictions={allPredictions}
          />
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
                                            <div className="flex flex-wrap gap-2">
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
                                            <div className="flex flex-wrap gap-2">
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
                                            <div className="flex flex-wrap gap-2">
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
                                  labelLine={(entry) => {
                                    const percentage = parseFloat(entry.percentage);

                                    if (percentage >= 5) {
                                      return null;
                                    }

                                    const RADIAN = Math.PI / 180;
                                    const cx = entry.cx;
                                    const cy = entry.cy;
                                    const outerRadius = entry.outerRadius;

                                    const startX = cx + outerRadius * Math.cos(-entry.midAngle * RADIAN);
                                    const startY = cy + outerRadius * Math.sin(-entry.midAngle * RADIAN);
                                    const endX = cx + (outerRadius + 35) * Math.cos(-entry.midAngle * RADIAN);
                                    const endY = cy + (outerRadius + 35) * Math.sin(-entry.midAngle * RADIAN);

                                    return (
                                      <line
                                        x1={startX}
                                        y1={startY}
                                        x2={endX}
                                        y2={endY}
                                        stroke="#94a3b8"
                                        strokeWidth={1}
                                      />
                                    );
                                  }}
                                  label={(entry) => {
                                    const RADIAN = Math.PI / 180;
                                    const cx = entry.cx; // Use entry.cx
                                    const cy = entry.cy; // Use entry.cy
                                    const outerRadius = entry.outerRadius; // Use entry.outerRadius
                                    const percentage = parseFloat(entry.percentage);

                                    const isActualResult = hasActualResult &&
                                      normalizePrediction(entry.name) === normalizePrediction(q.actual_result);
                                    const displayName = formatResult(entry.name);

                                    // פלחים גדולים (מעל 15%)
                                    if (percentage > 15) {
                                      const radius = outerRadius * 0.7;
                                      const x = cx + radius * Math.cos(-entry.midAngle * RADIAN);
                                      const y = cy + radius * Math.sin(-entry.midAngle * RADIAN);

                                      return (
                                        <g>
                                          {isActualResult ? (
                                            <>
                                              <text
                                                x={x}
                                                y={y - 10}
                                                fill="#fbbf24"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                style={{
                                                  fontSize: '16px',
                                                  textShadow: '0 0 3px rgba(0,0,0,0.8)'
                                                }}
                                              >
                                                ⭐
                                              </text>
                                              <text
                                                x={x}
                                                y={y + 5}
                                                fill="#ffffff"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                style={{
                                                  fontSize: '13px',
                                                  fontWeight: 'bold',
                                                  textShadow: '0 0 3px rgba(0,0,0,0.8)'
                                                }}
                                              >
                                                {displayName}
                                              </text>
                                              <text
                                                x={x}
                                                y={y + 21}
                                                fill="#ffffff"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                style={{
                                                  fontSize: '11px',
                                                  textShadow: '0 0 3px rgba(0,0,0,0.8)'
                                                }}
                                              >
                                                {percentage}%
                                              </text>
                                            </>
                                          ) : (
                                            <>
                                              <text
                                                x={x}
                                                y={y}
                                                fill="#ffffff"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                style={{
                                                  fontSize: '13px',
                                                  fontWeight: 'bold',
                                                  textShadow: '0 0 3px rgba(0,0,0,0.8)'
                                                }}
                                              >
                                                {displayName}
                                              </text>
                                              <text
                                                x={x}
                                                y={y + 16}
                                                fill="#ffffff"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                style={{
                                                  fontSize: '11px',
                                                  textShadow: '0 0 3px rgba(0,0,0,0.8)'
                                                }}
                                              >
                                                {percentage}%
                                              </text>
                                            </>
                                          )}
                                        </g>
                                      );
                                    }

                                    // פלחים בינוניים (5-15%)
                                    if (percentage >= 5) {
                                      const x = cx + (outerRadius + 30) * Math.cos(-entry.midAngle * RADIAN);
                                      const y = cy + (outerRadius + 30) * Math.sin(-entry.midAngle * RADIAN);

                                      const angle = (entry.midAngle + 360) % 360;
                                      const textAnchor = (angle < 180 && angle > 0) ? 'start' : 'end';

                                      return (
                                        <g>
                                          {isActualResult ? (
                                            <>
                                              <text
                                                x={x}
                                                y={y - 12}
                                                fill="#fbbf24"
                                                textAnchor={textAnchor}
                                                dominantBaseline="middle"
                                                style={{ fontSize: '14px' }}
                                              >
                                                ⭐
                                              </text>
                                              <text
                                                x={x}
                                                y={y}
                                                fill="#ffffff"
                                                textAnchor={textAnchor}
                                                dominantBaseline="middle"
                                                style={{
                                                  fontSize: '11px',
                                                  fontWeight: '600'
                                                }}
                                              >
                                                {displayName}
                                              </text>
                                              <text
                                                x={x}
                                                y={y + 14}
                                                fill="#ffffff"
                                                textAnchor={textAnchor}
                                                dominantBaseline="middle"
                                                style={{ fontSize: '10px' }}
                                              >
                                                {percentage}%
                                              </text>
                                            </>
                                          ) : (
                                            <>
                                              <text
                                                x={x}
                                                y={y}
                                                fill="#ffffff"
                                                textAnchor={textAnchor}
                                                dominantBaseline="middle"
                                                style={{
                                                  fontSize: '11px',
                                                  fontWeight: '600'
                                                }}
                                              >
                                                {displayName}
                                              </text>
                                              <text
                                                x={x}
                                                y={y + 14}
                                                fill="#ffffff"
                                                textAnchor={textAnchor}
                                                dominantBaseline="middle"
                                                style={{ fontSize: '10px' }}
                                              >
                                                {percentage}%
                                              </text>
                                            </>
                                          )}
                                        </g>
                                      );
                                    }

                                    // פלחים קטנים (מתחת ל-5%)
                                    const lineEndX = cx + (outerRadius + 35) * Math.cos(-entry.midAngle * RADIAN);
                                    const lineEndY = cy + (outerRadius + 35) * Math.sin(-entry.midAngle * RADIAN);

                                    const angle = (entry.midAngle + 360) % 360;
                                    let textAnchor = 'middle';
                                    let yOffset = 0;

                                    if (angle >= 337.5 || angle < 22.5) {
                                      textAnchor = 'start';
                                      yOffset = 0;
                                    } else if (angle >= 22.5 && angle < 67.5) {
                                      textAnchor = 'start';
                                      yOffset = -3;
                                    } else if (angle >= 67.5 && angle < 112.5) {
                                      textAnchor = 'middle';
                                      yOffset = -10;
                                    } else if (angle >= 112.5 && angle < 157.5) {
                                      textAnchor = 'end';
                                      yOffset = -3;
                                    } else if (angle >= 157.5 && angle < 202.5) {
                                      textAnchor = 'end';
                                      yOffset = 0;
                                    } else if (angle >= 202.5 && angle < 247.5) {
                                      textAnchor = 'end';
                                      yOffset = 3;
                                    } else if (angle >= 247.5 && angle < 292.5) {
                                      textAnchor = 'middle';
                                      yOffset = 15;
                                    } else {
                                      textAnchor = 'start';
                                      yOffset = 3;
                                    }

                                    return (
                                      <g>
                                        {isActualResult ? (
                                          <>
                                            <text
                                              x={lineEndX}
                                              y={lineEndY + yOffset - 12}
                                              fill="#fbbf24"
                                              textAnchor={textAnchor}
                                              dominantBaseline="middle"
                                              style={{ fontSize: '12px' }}
                                            >
                                              ⭐
                                            </text>
                                            <text
                                              x={lineEndX}
                                              y={lineEndY + yOffset}
                                              fill="#ffffff"
                                              textAnchor={textAnchor}
                                              dominantBaseline="middle"
                                              style={{
                                                fontSize: '10px',
                                                fontWeight: '600'
                                              }}
                                            >
                                              {displayName}
                                            </text>
                                            <text
                                              x={lineEndX}
                                              y={lineEndY + yOffset + 12}
                                              fill="#ffffff"
                                              textAnchor={textAnchor}
                                              dominantBaseline="middle"
                                              style={{ fontSize: '9px' }}
                                            >
                                              {percentage}%
                                            </text>
                                          </>
                                        ) : (
                                          <>
                                            <text
                                              x={lineEndX}
                                              y={lineEndY + yOffset}
                                              fill="#ffffff"
                                              textAnchor={textAnchor}
                                              dominantBaseline="middle"
                                              style={{
                                                fontSize: '10px',
                                                fontWeight: '600'
                                              }}
                                            >
                                              {displayName}
                                            </text>
                                            <text
                                              x={lineEndX}
                                              y={lineEndY + yOffset + 12}
                                              fill="#ffffff"
                                              textAnchor={textAnchor}
                                              dominantBaseline="middle"
                                              style={{ fontSize: '9px' }}
                                            >
                                              {percentage}%
                                            </text>
                                          </>
                                        )}
                                      </g>
                                    );
                                  }}
                                  outerRadius={160}
                                  innerRadius={0}
                                  fill="#8884d8"
                                  dataKey="value"
                                  // Removed onMouseEnter for hoveredSlice state - recharts Tooltip handles it
                                  style={{ cursor: 'pointer', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }}
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
                                        style={{
                                          filter: isActualResult ? 'brightness(1.2) drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))' : 'none'
                                        }}
                                      />
                                    );
                                  })}
                                </Pie>
                                <Tooltip
                                  content={({ payload }) => {
                                    if (!payload || !payload[0]) return null;
                                    const data = payload[0].payload;

                                    // 🚀 שימוש ב-pre-calculated index
                                    const key = `${q.id}_${normalizePrediction(data.name)}`;
                                    const participants = participantsByQuestionAndAnswer.get(key) || [];

                                    return (
                                      <div
                                        className="rounded-lg p-3 shadow-2xl"
                                        style={{
                                          maxWidth: '500px',
                                          background: '#0f172a',
                                          border: '2px solid #06b6d4',
                                          opacity: 1
                                        }}
                                      >
                                        <div className="mb-3">
                                          <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white mb-2 text-sm font-bold">
                                            {formatResult(data.name)}
                                          </Badge>
                                          <p className="text-cyan-300 text-sm font-semibold">
                                            {data.value} משתתפים ({data.percentage}%)
                                          </p>
                                        </div>
                                        {participants.length > 0 && (
                                          <div className="mt-2 pt-2 border-t border-slate-700" style={{ background: '#0f172a' }}>
                                            <p className="text-slate-400 text-xs mb-2">המשתתפים שניחשו:</p>
                                            <div className="flex flex-wrap gap-2" style={{ background: '#0f172a' }}>
                                              {participants.map((name, idx) => (
                                                <span key={idx} className="text-slate-200 text-xs px-2 py-1 rounded" style={{ background: '#1e293b' }}>
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
                        <ResponsiveContainer width="100%" height={500}>
                          <BarChart
                            data={tableStats.locationsData.topTeams.slice(0, 10)}
                            margin={{ top: 20, right: 0, left: 0, bottom: 120 }}
                          >
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
                              contentStyle={{
                                background: '#0f172a',
                                border: '2px solid #06b6d4',
                                borderRadius: '8px',
                                opacity: 1
                              }}
                              content={({ payload }) => {
                                if (!payload || !payload[0]) return null;
                                const data = payload[0].payload;

                                const allQuestionsInTable = locationTables
                                  .find(t => t.id === tableStats.table.id)?.questions || [];

                                // 🚀 שימוש ב-pre-calculated index
                                const participants = allQuestionsInTable.flatMap(q => {
                                    const key = `${q.id}_${normalizePrediction(data.team)}`;
                                    return participantsByQuestionAndAnswer.get(key) || [];
                                }).filter((name, index, self) => self.indexOf(name) === index) // Unique participants
                                .sort((a, b) => a.localeCompare(b, 'he'));

                                return (
                                  <div className="rounded-lg p-3 shadow-2xl" style={{ maxWidth: '500px', background: '#0f172a', border: '2px solid #06b6d4' }}>
                                    <p className="text-cyan-300 font-bold mb-2">{data.team}</p>
                                    <p className="text-white text-sm mb-2">{data.count} בחירות ({data.percentage}%)</p>
                                    {participants.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-slate-700" style={{ background: '#0f172a' }}>
                                        <p className="text-slate-400 text-xs mb-2">משתתפים:</p>
                                        <div className="flex flex-wrap gap-2" style={{ background: '#0f172a' }}>
                                          {participants.map((name, idx) => (
                                            <span key={idx} className="text-slate-200 text-xs px-2 py-1 rounded" style={{ background: '#1e293b' }}>
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
                            <Bar dataKey="count" fill="#06b6d4">
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
                      .filter(qStat => qStat.question.question_id !== '11.1') // Filtering out question 11.1
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
                                {/* 🔥 גובה קבוע לכל הגרפים - 300px */}
                                <div className="flex-1 flex items-end" style={{ minHeight: '300px', maxHeight: '300px' }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    {usePieChart ? (
                                      <RechartsPieChart>
                                        <Pie
                                          data={qStat.chartData}
                                          cx="50%"
                                          cy="50%"
                                          labelLine={{
                                            stroke: '#94a3b8',
                                            strokeWidth: 1
                                          }}
                                          label={({ cx, cy, midAngle, innerRadius, outerRadius, answer, percentage, count }) => {
                                            const RADIAN = Math.PI / 180;
                                            const radius = outerRadius + 35; // Adjusted from 30 to 35
                                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                            const y = cy + radius * Math.sin(-midAngle * RADIAN);

                                            // Remove colon from "כן:", "לא:"
                                            const cleanAnswer = answer.replace(':', '').trim();

                                            const hasActualResultLocal = q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__';
                                            const isActualResult = hasActualResultLocal && answer === q.actual_result;

                                            return (
                                              <g>
                                                {isActualResult ? (
                                                  <>
                                                    <text
                                                      x={x}
                                                      y={y - 12}
                                                      fill="#fbbf24"
                                                      textAnchor={x > cx ? 'start' : 'end'}
                                                      dominantBaseline="central"
                                                      style={{ fontSize: '12px' }}
                                                    >
                                                      ⭐
                                                    </text>
                                                    <text
                                                      x={x}
                                                      y={y}
                                                      fill="#ffffff"
                                                      textAnchor={x > cx ? 'start' : 'end'}
                                                      dominantBaseline="central"
                                                      style={{ fontSize: '11px', fontWeight: 'bold' }}
                                                    >
                                                      {cleanAnswer}
                                                    </text>
                                                    <text
                                                      x={x}
                                                      y={y + 14}
                                                      fill="#ffffff"
                                                      textAnchor={x > cx ? 'start' : 'end'}
                                                      dominantBaseline="central"
                                                      style={{ fontSize: '10px' }}
                                                    >
                                                      {percentage}%
                                                    </text>
                                                  </>
                                                ) : (
                                                  <>
                                                    <text
                                                      x={x}
                                                      y={y}
                                                      fill="#ffffff"
                                                      textAnchor={x > cx ? 'start' : 'end'}
                                                      dominantBaseline="central"
                                                      style={{ fontSize: '11px', fontWeight: 'bold' }}
                                                    >
                                                      {cleanAnswer}
                                                    </text>
                                                    <text
                                                      x={x}
                                                      y={y + 14}
                                                      fill="#ffffff"
                                                      textAnchor={x > cx ? 'start' : 'end'}
                                                      dominantBaseline="central"
                                                      style={{ fontSize: '10px' }}
                                                    >
                                                      {percentage}%
                                                    </text>
                                                  </>
                                                )}
                                              </g>
                                            );
                                          }}
                                          outerRadius={70} // Adjusted from 80 to 70
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
                                          contentStyle={{
                                            maxWidth: '500px',
                                            background: '#0f172a',
                                            border: '2px solid #06b6d4',
                                            opacity: 1,
                                            borderRadius: '8px',
                                            padding: '0.75rem',
                                            boxShadow: '0 0 15px rgba(6, 182, 212, 0.2)'
                                          }}
                                          content={({ payload }) => {
                                            if (!payload || !payload[0]) return null;
                                            const data = payload[0].payload;

                                            // 🚀 שימוש ב-pre-calculated index
                                            const key = `${q.id}_${normalizePrediction(data.answer)}`;
                                            const participants = participantsByQuestionAndAnswer.get(key) || [];

                                            return (
                                              <div style={{ background: '#0f172a' }}>
                                                <p className="text-cyan-300 font-bold mb-2">{data.answer}</p>
                                                <p className="text-white text-sm mb-2">{data.count} תשובות ({data.percentage}%)</p>
                                                {participants.length > 0 && (
                                                  <div className="mt-2 pt-2 border-t border-slate-700" style={{ background: '#0f172a' }}>
                                                    <p className="text-slate-400 text-xs mb-2">משתתפים:</p>
                                                    <div className="flex flex-wrap gap-2" style={{ background: '#0f172a' }}>
                                                      {participants.map((name, idx) => (
                                                        <span key={idx} className="text-slate-200 text-xs px-2 py-1 rounded" style={{ background: '#1e293b' }}>
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
                                          // מיון מיוחד לפי תוית הנתונים (answer)
                                          const sortedData = [...qStat.chartData];

                                          // בדוק אם התשובות מכילות מחזורים (א', ב', ג'...)
                                          const hasHebrewLetters = sortedData.some(item =>
                                            /[א-ת]/.test(item.answer)
                                          );

                                          if (hasHebrewLetters) {
                                            // מיון לפי סדר האותיות העבריות
                                            const hebrewOrder = 'אבגדהוזחטיכלמנסעפצקרשת';
                                            sortedData.sort((a, b) => {
                                              const aLetter = a.answer.match(/[א-ת]/)?.[0] || '';
                                              const bLetter = b.answer.match(/[א-ת]/)?.[0] || '';
                                              return hebrewOrder.indexOf(aLetter) - hebrewOrder.indexOf(bLetter);
                                            });
                                          } else {
                                            // מיון אלפביתי רגיל
                                            sortedData.sort((a, b) => a.answer.localeCompare(b.answer, 'he'));
                                          }

                                          return sortedData.slice(0, 10);
                                        })()}
                                        margin={{ top: 10, right: 5, left: 5, bottom: 100 }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis
                                          dataKey="answer"
                                          angle={0}
                                          textAnchor="middle"
                                          height={100}
                                          stroke="#94a3b8"
                                          interval={0}
                                          tick={({ x, y, payload }) => {
                                            const maxCharsPerLine = 8;
                                            const text = String(payload.value);

                                            if (text.length <= maxCharsPerLine) {
                                              return (
                                                <text
                                                  x={x}
                                                  y={10}
                                                  textAnchor="middle"
                                                  fill="#94a3b8"
                                                  fontSize="10px"
                                                >
                                                  {text}
                                                </text>
                                              );
                                            }

                                            const words = text.split(' ');
                                            const line1 = [];
                                            const line2 = [];
                                            let currentLength = 0;

                                            words.forEach(word => {
                                              if (currentLength + word.length <= maxCharsPerLine && line2.length === 0) {
                                                line1.push(word);
                                                currentLength += word.length + 1;
                                              } else {
                                                line2.push(word);
                                              }
                                            });

                                            const firstLine = line1.join(' ');
                                            const secondLine = line2.join(' ');

                                            return (
                                              <g transform={`translate(${x},${y})`}>
                                                <text
                                                  x={0}
                                                  y={10}
                                                  textAnchor="middle"
                                                  fill="#94a3b8"
                                                  fontSize="10px"
                                                >
                                                  {firstLine}
                                                </text>
                                                {secondLine && (
                                                  <text
                                                    x={0}
                                                    y={22}
                                                    textAnchor="middle"
                                                    fill="#94a3b8"
                                                    fontSize="10px"
                                                  >
                                                    {secondLine}
                                                  </text>
                                                )}
                                              </g>
                                            );
                                          }}
                                        />
                                        <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                        <Tooltip
                                          contentStyle={{
                                            background: '#0f172a',
                                            border: '2px solid #06b6d4',
                                            borderRadius: '8px',
                                            opacity: 1
                                          }}
                                          content={({ payload }) => {
                                            if (!payload || !payload[0]) return null;
                                            const data = payload[0].payload;

                                            // 🚀 שימוש ב-pre-calculated index
                                            const key = `${q.id}_${normalizePrediction(data.answer)}`;
                                            const participants = participantsByQuestionAndAnswer.get(key) || [];

                                            return (
                                              <div style={{ background: '#0f172a' }}>
                                                <p className="text-cyan-300 font-bold mb-2">{data.answer}</p>
                                                <p className="text-white text-sm mb-2">{data.count} תשובות ({data.percentage}%)</p>
                                                {participants.length > 0 && (
                                                  <div className="mt-2 pt-2 border-t border-slate-700" style={{ background: '#0f172a' }}>
                                                    <p className="text-slate-400 text-xs mb-2">משתתפים:</p>
                                                    <div className="flex flex-wrap gap-2" style={{ background: '#0f172a' }}>
                                                      {participants.map((name, idx) => (
                                                        <span key={idx} className="text-slate-200 text-xs px-2 py-1 rounded" style={{ background: '#1e293b' }}>
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
                                        <Bar dataKey="count" fill="#06b6d4">
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
