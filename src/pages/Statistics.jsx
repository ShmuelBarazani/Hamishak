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


const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];

// 🔥 קבועי עולות
const ADVANCING_CONFIG = { T4: { count: 8, bonus: 16 }, T5: { count: 4, bonus: 12 }, T6: { count: 2, bonus: 6 } };
const QUALIFIER_TABLE_IDS = ['T4', 'T5', 'T6'];

// 🚀 Cache גלובלי
const NORMALIZE_CACHE = new Map();
const CLEAN_CACHE = new Map();
const PARSE_ID_CACHE = new Map();

const normalizeTeamName = (name) => {
  if (!name) return name;
  if (NORMALIZE_CACHE.has(name)) return NORMALIZE_CACHE.get(name);
  const result = name.replace(/קרבאך/g, 'קרבאח').replace(/קראבח/g, 'קרבאח').replace(/קראבך/g, 'קרבאח').trim();
  NORMALIZE_CACHE.set(name, result);
  return result;
};

const cleanTeamName = (name) => {
  if (!name) return name;
  if (CLEAN_CACHE.has(name)) return CLEAN_CACHE.get(name);
  const result = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
  CLEAN_CACHE.set(name, result);
  return result;
};

const normalizePrediction = (result) => {
  if (!result) return '';
  return result.replace(/\s+/g, '').trim();
};

const alternateSliceOrder = (data) => {
  if (!data || data.length <= 2) return data;
  const sorted = [...data].sort((a, b) => (b.value || b.count || 0) - (a.value || a.count || 0));
  const midpoint = Math.ceil(sorted.length / 2);
  const largerHalf = sorted.slice(0, midpoint);
  const smallerHalf = sorted.slice(midpoint).reverse();
  const result = [];
  for (let i = 0; i < Math.max(largerHalf.length, smallerHalf.length); i++) {
    if (i < largerHalf.length) result.push(largerHalf[i]);
    if (i < smallerHalf.length) result.push(smallerHalf[i]);
  }
  return result;
};

const parseQuestionId = (id) => {
  if (!id) return 0;
  if (PARSE_ID_CACHE.has(id)) return PARSE_ID_CACHE.get(id);
  const result = parseFloat(id.replace(/[^\d.]/g, '')) || 0;
  PARSE_ID_CACHE.set(id, result);
  return result;
};

const loadAllPredictions = async (gameId) => {
  try {
    const pageSize = 1000;
    let all = [], from = 0;
    while (true) {
      const { data, error } = await supabase.from('game_predictions').select('*').eq('game_id', gameId).range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data?.length) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    if (all.length > 0) return all;
  } catch (e) { console.warn('supabase fallback:', e.message); }

  const batchSize = 1000;
  let allFallback = [], offset = 0;
  const seenIds = new Set();
  let maxIter = 20;
  while (maxIter-- > 0) {
    const batch = await db.Prediction.filter({ game_id: gameId }, null, batchSize, offset);
    if (!batch?.length) break;
    const newItems = batch.filter(p => !seenIds.has(p.id));
    if (newItems.length === 0) break;
    newItems.forEach(p => seenIds.add(p.id));
    allFallback = allFallback.concat(newItems);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }
  return allFallback;
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
  const [qualifierTables, setQualifierTables] = useState([]);
  const [clickedSegment, setClickedSegment] = useState({}); // { [questionId]: { answer, participants } } // 🔥 חדש
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
    if (result.includes('-')) return result.split('-').map(x => x.trim()).join(' - ');
    return result;
  }, []);

  useEffect(() => { loadAllData(); }, [currentGame]);

  const loadAllData = async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      const questions = await db.Question.filter({ game_id: currentGame.id }, null, 5000);
      const predictions = await loadAllPredictions(currentGame.id);
      setAllQuestions(questions);
      setAllPredictions(predictions);

      const allTeams = currentGame.teams_data || [];
      setTeams(allTeams.reduce((acc, team) => { acc[normalizeTeamName(team.name)] = team; return acc; }, {}));

      const lists = currentGame.validation_lists || [];
      setValidationLists(lists.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {}));

      const rTables = {}, sTables = {};
      questions.forEach(q => {
        if (!q.table_id) return;
        if (q.table_id === 'T20' && q.question_text) {
          let ts = null;
          if (q.question_text.includes(' נגד ')) ts = q.question_text.split(' נגד ').map(t => t.trim());
          else if (q.question_text.includes(' - ')) ts = q.question_text.split(' - ').map(t => t.trim());
          if (ts && ts.length === 2) { q.home_team = normalizeTeamName(ts[0]); q.away_team = normalizeTeamName(ts[1]); }
        }
        if (q.home_team) q.home_team = normalizeTeamName(q.home_team);
        if (q.away_team) q.away_team = normalizeTeamName(q.away_team);

        const col = (q.home_team && q.away_team) ? rTables : sTables;
        let desc = q.table_description;
        if (q.table_id === 'T12') desc = 'פינת הגאווה הישראלית';
        else if (q.table_id === 'T13') desc = 'מבול מטאורים של כוכבים';
        else if (q.table_id === 'T20') desc = 'המסלול הישראלי';

        if (!col[q.table_id]) col[q.table_id] = { id: q.table_id, description: desc || q.table_id, questions: [] };
        col[q.table_id].questions.push(q);
      });

      const t20Table = rTables['T20']; delete rTables['T20'];
      setIsraeliTable(t20Table || null);

      const sortedRoundTables = Object.values(rTables).sort((a, b) => (parseInt(a.id.replace('T', '')) || 0) - (parseInt(b.id.replace('T', '')) || 0));
      sortedRoundTables.forEach(t => { if (t.id === 'T3') t.description = 'שלב שמינית הגמר - המשחקים!'; });
      setRoundTables(sortedRoundTables);
      if (sortedRoundTables.length > 0) setSelectedRound(sortedRoundTables[0].id);

      const locationTableIds = ['T14', 'T15', 'T16', 'T17'];
      setLocationTables(Object.values(sTables).filter(t => locationTableIds.includes(t.id)).sort((a, b) => (parseInt(a.id.replace('T', '')) || 0) - (parseInt(b.id.replace('T', '')) || 0)));
      setPlayoffTable(sTables['T19'] || null);

      const allSpecialTables = Object.values(sTables).filter(table => {
        const desc = table.description?.trim();
        return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && table.id !== 'T19';
      }).sort((a, b) => (parseInt(a.id.replace('T', '')) || 0) - (parseInt(b.id.replace('T', '')) || 0));

      // 🔥 זיהוי עולות לפי תיאור (תומך בשמות שונים)
      const isQualifierTable = (t) => {
        const desc = (t.description || '') + (t.name || '');
        return QUALIFIER_TABLE_IDS.includes(t.id) || desc.includes('רשימת הקבוצות שיעלו') || desc.includes('עולות');
      };
      const qualifiers = allSpecialTables.filter(t => isQualifierTable(t));
      const regulars = allSpecialTables.filter(t => !isQualifierTable(t));
      setQualifierTables(qualifiers);
      setSpecialTables(regulars);

    } catch (error) { console.error("Error loading data:", error); }
    setLoading(false);
  };

  const calculateGameStats = useCallback(async (type, specificId = null) => {
    try {
      let tablesToProcess = [];
      if (type === 'rounds') tablesToProcess = specificId ? roundTables.filter(t => t.id === specificId) : roundTables;
      else if (type === 'israeli') tablesToProcess = israeliTable ? [israeliTable] : [];
      if (!tablesToProcess.length) { setGameStats({}); return; }

      const predByQ = new Map();
      allPredictions.forEach(p => { if (!predByQ.has(p.question_id)) predByQ.set(p.question_id, []); predByQ.get(p.question_id).push(p); });

      const gsd = {};
      for (const table of tablesToProcess) {
        for (const q of table.questions) {
          const gamePredictions = predByQ.get(q.id) || [];
          const resultCounts = gamePredictions.reduce((acc, pred) => { const r = pred.text_prediction || 'לא ניחש'; acc[r] = (acc[r] || 0) + 1; return acc; }, {});
          const total = gamePredictions.length;
          const tempChart = Object.entries(resultCounts).sort((a, b) => b[1] - a[1]).map(([result, count]) => ({ name: result, value: count, percentage: total > 0 ? ((count / total) * 100).toFixed(1) : 0 }));
          gsd[q.id] = { question: q, table, totalPredictions: total, chartData: alternateSliceOrder(tempChart).map(e => ({ ...e, percentage: parseFloat(e.percentage) })), mostPopular: tempChart[0] || { name: '-', value: 0, percentage: 0 } };
        }
      }
      setGameStats(gsd);
    } catch (error) { console.error("Error calculating game stats:", error); }
  }, [roundTables, israeliTable, allPredictions]);

  const calculateSpecialStats = useCallback(async (tableGroup, specificTableId = null) => {
    try {
      let tablesToAnalyze = [];
      if (tableGroup === 'special') tablesToAnalyze = specificTableId ? specialTables.filter(t => t.id === specificTableId) : specialTables;
      else if (tableGroup === 'qualifier') tablesToAnalyze = specificTableId ? qualifierTables.filter(t => t.id === specificTableId) : qualifierTables;
      else if (tableGroup === 'locations') tablesToAnalyze = locationTables;
      else if (tableGroup === 'playoff') tablesToAnalyze = playoffTable ? [playoffTable] : [];
      if (!tablesToAnalyze.length) { setSpecialStats(null); return; }

      const ssd = {};
      for (const table of tablesToAnalyze) {
        const tableStats = { table, questions: [] };

        // 🔥 עולות: גרף מרוכז אחד — כמה בחרו כל קבוצה, ללא תלות במיקום
        if (tableGroup === 'qualifier') {
          const cfg = ADVANCING_CONFIG[table.id];
          // כל שאלות עם question_id שלם (slots), ללא תלות ב-advCount קשיח
          const slots = table.questions.filter(q => { const n = parseFloat(q.question_id); return Number.isInteger(n) && n >= 1; });
          const slotIds = new Set(slots.map(s => s.id));
          const advCount = cfg ? cfg.count : slots.length;

          const teamCounts = {};
          const participantsByTeam = {};
          allPredictions.forEach(p => {
            if (!slotIds.has(p.question_id)) return;
            if (!p.text_prediction?.trim()) return;
            const team = cleanTeamName(normalizeTeamName(p.text_prediction.trim()));
            if (!team || team.toLowerCase() === 'null') return;
            teamCounts[team] = (teamCounts[team] || 0) + 1;
            if (!participantsByTeam[team]) participantsByTeam[team] = new Set();
            participantsByTeam[team].add(p.participant_name);
          });

          // Convert Sets → sorted arrays
          const participantsMap = {};
          Object.entries(participantsByTeam).forEach(([team, set]) => {
            participantsMap[team] = [...set].sort((a, b) => a.localeCompare(b, 'he'));
          });

          tableStats.qualifierData = {
            chartData: Object.entries(teamCounts).sort((a, b) => b[1] - a[1]).map(([team, count]) => ({ team, count })),
            cfg, advCount, participantsMap
          };

        } else if (['T14', 'T15', 'T16', 'T17'].includes(table.id)) {
          const allForTable = allPredictions.filter(p => table.questions.some(q => q.id === p.question_id));
          const teamCounts = allForTable.reduce((acc, pred) => {
            if (pred.text_prediction?.trim()) {
              const t = cleanTeamName(normalizeTeamName(pred.text_prediction.trim()));
              if (t && t.toLowerCase() !== 'null') acc[t] = (acc[t] || 0) + 1;
            }
            return acc;
          }, {});
          const chartData = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([team, count]) => ({ team, count, percentage: allForTable.length > 0 ? ((count / allForTable.length) * 100).toFixed(1) : 0 }));
          tableStats.locationsData = { totalPredictions: allForTable.length, uniqueTeams: Object.keys(teamCounts).length, topTeams: chartData, mostPopular: chartData[0] || { team: '-', count: 0, percentage: 0 } };

        } else {
          if (table.id !== 'T1') {
            for (const q of table.questions) {
              const qPredictions = allPredictions.filter(p => p.question_id === q.id);
              const answerCounts = qPredictions.reduce((acc, pred) => {
                let answer = String(pred.text_prediction || '').trim();
                if (!answer || answer === '__CLEAR__' || answer.toLowerCase() === 'null' || answer.toLowerCase() === 'undefined') return acc;
                const isYesNo = ['כן', 'לא', 'yes', 'no'].includes(answer);
                const isNumber = !isNaN(Number(answer));
                if (!isYesNo && !isNumber && q.validation_list?.toLowerCase().includes('קבוצ')) answer = cleanTeamName(answer);
                if (!answer.trim()) return acc;
                acc[answer] = (acc[answer] || 0) + 1;
                return acc;
              }, {});
              const total = Object.values(answerCounts).reduce((s, c) => s + c, 0);
              const tempChart = Object.entries(answerCounts).sort((a, b) => b[1] - a[1]).map(([answer, count]) => ({ answer, count, percentage: total > 0 ? ((count / total) * 100).toFixed(1) : 0 }));
              tableStats.questions.push({ question: q, totalAnswers: total, chartData: alternateSliceOrder(tempChart), mostPopular: tempChart[0] || { answer: '-', count: 0, percentage: 0 }, diversity: tempChart.length });
            }
          }
        }
        ssd[table.id] = tableStats;
      }
      setSpecialStats(ssd);
    } catch (error) { console.error("Error calculating special stats:", error); }
  }, [specialTables, qualifierTables, locationTables, playoffTable, allPredictions]);

  const calculateUserStats = useCallback(async () => {
    if (userStats) return;
    setUserStatsLoading(true); setUserStatsError(null);
    try {
      const t1Qs = allQuestions.filter(q => q.table_id === 'T1');
      const profQ = t1Qs.find(q => q.question_text?.includes('מקצוע'));
      const ageQ = t1Qs.find(q => q.question_text?.includes('גיל'));
      if (!profQ && !ageQ) { setUserStatsError('no_questions'); setUserStatsLoading(false); return; }

      const profPreds = profQ ? allPredictions.filter(p => p.question_id === profQ.id) : [];
      const agePreds = ageQ ? allPredictions.filter(p => p.question_id === ageQ.id) : [];

      const profCounts = profPreds.reduce((acc, pred) => {
        const v = pred.text_prediction?.trim();
        if (!v || v === '' || v === '0' || v.toLowerCase() === 'null' || v === '__CLEAR__') return acc;
        acc[v] = (acc[v] || 0) + 1; return acc;
      }, {});
      const totalProf = Object.values(profCounts).reduce((s, c) => s + c, 0);
      const professionData = Object.entries(profCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([profession, count]) => ({ profession, count, percentage: totalProf > 0 ? ((count / totalProf) * 100).toFixed(1) : 0 }));

      const ageGroups = { 'מתחת ל-20': 0, '21-25': 0, '26-30': 0, '31-35': 0, '36-40': 0, '41-45': 0, '46-50': 0, '51-55': 0, '56+': 0 };
      let totalAge = 0;
      agePreds.forEach(pred => {
        const age = parseInt(pred.text_prediction?.trim(), 10);
        if (isNaN(age) || age === 0) return; totalAge++;
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
      const ageData = Object.entries(ageGroups).filter(([, c]) => c > 0).map(([group, count]) => ({ group, count, percentage: totalAge > 0 ? ((count / totalAge) * 100).toFixed(1) : 0 }));
      const allParticipants = new Set([...profPreds.map(p => p.participant_name), ...agePreds.map(p => p.participant_name)]);
      setUserStats({ totalUsers: allParticipants.size, professionData, ageData, totalWithProfession: totalProf, totalWithAge: totalAge });
    } catch (error) {
      setUserStatsError(error.message?.includes('Rate limit') ? 'rate_limit' : 'general_error');
    } finally { setUserStatsLoading(false); }
  }, [userStats, allQuestions, allPredictions]);

  const analyzeGameOutcomes = useCallback((chartData) => {
    return chartData.reduce((acc, entry) => {
      const result = entry.name;
      if (result?.includes('-')) {
        const parts = result.split('-').map(x => parseInt(x.trim()));
        if (!isNaN(parts[0]) && !isNaN(parts[1])) {
          if (parts[0] > parts[1]) acc.homeWins += entry.value;
          else if (parts[0] === parts[1]) acc.draws += entry.value;
          else acc.awayWins += entry.value;
        }
      }
      return acc;
    }, { homeWins: 0, draws: 0, awayWins: 0 });
  }, []);

  const gameStatsArray = useMemo(() => Object.values(gameStats || {}), [gameStats]);
  const uniqueParticipantsCount = useMemo(() => new Set(allPredictions.map(p => p.participant_name)).size, [allPredictions]);

  const participantsByQuestionAndAnswer = useMemo(() => {
    const index = new Map();
    allPredictions.forEach(p => {
      if (!p.text_prediction?.trim()) return;
      const normalized = normalizePrediction(p.text_prediction.trim());
      const key = `${p.question_id}_${normalized}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(p.participant_name);
      const keyOriginal = `${p.question_id}_${p.text_prediction.trim()}`;
      if (keyOriginal !== key) { if (!index.has(keyOriginal)) index.set(keyOriginal, []); index.get(keyOriginal).push(p.participant_name); }
    });
    index.forEach((participants, key) => index.set(key, [...new Set(participants)].sort((a, b) => a.localeCompare(b, 'he'))));
    return index;
  }, [allPredictions]);

  const gameOutcomeParticipants = useMemo(() => {
    if (!gameStats) return new Map();
    const outcomeMap = new Map();
    Object.values(gameStats).forEach(game => {
      const q = game.question;
      const results = { home: [], draw: [], away: [] };
      game.chartData.forEach(entry => {
        const result = entry.name;
        if (result?.includes('-')) {
          const parts = result.split('-').map(x => parseInt(x.trim()));
          if (!isNaN(parts[0]) && !isNaN(parts[1])) {
            const t = parts[0] > parts[1] ? 'home' : parts[0] === parts[1] ? 'draw' : 'away';
            results[t].push(...(participantsByQuestionAndAnswer.get(`${q.id}_${normalizePrediction(result)}`) || []));
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

  // 🔥 Sidebar — 4 קבוצות: תובנות | פלייאוף | מיוחדות | עולות
  const sidebarGroups = useMemo(() => {
    const groups = [];

    // קבוצה 1: תובנות AI (סגול)
    groups.push({
      label: '🤖 תובנות', color: '#8b5cf6', activeBg: '#7c3aed',
      buttons: [
        { key: 'insights', description: 'תובנות AI ומחנות' },
        { key: 'users', description: 'פרטי המנחשים' },
      ]
    });

    // קבוצה 2: פלייאוף — משחקים (כחול)
    const playoffButtons = [];
    roundTables.forEach(table => playoffButtons.push({
      key: `round_${table.id}`,
      description: table.id === 'T3' ? 'שלב שמינית הגמר - המשחקים!' : table.description,
    }));
    if (israeliTable) playoffButtons.push({ key: `round_${israeliTable.id}`, description: israeliTable.description });
    if (playoffButtons.length > 0) groups.push({ label: '⚽ פלייאוף', color: '#3b82f6', activeBg: '#2563eb', buttons: playoffButtons });

    // קבוצה 3: שאלות מיוחדות (ציאן)
    const specialButtons = [];
    specialTables.forEach(table => {
      if (table.id === 'T1' || table.description?.includes('פרטי מנחשים')) return;
      specialButtons.push({ key: table.id, description: table.description });
    });
    if (locationTables.length > 0) specialButtons.push({ key: 'locations', description: 'מיקומים בסיום שלב הליגה' });
    if (playoffTable) specialButtons.push({ key: playoffTable.id, description: playoffTable.description });
    if (specialButtons.length > 0) groups.push({ label: '✨ מיוחדות', color: '#06b6d4', activeBg: '#0891b2', buttons: specialButtons });

    // קבוצה 4: עולות T4/T5/T6 (כתום)
    if (qualifierTables.length > 0) {
      groups.push({
        label: '📋 עולות', color: '#f97316', activeBg: '#ea580c',
        buttons: qualifierTables.map(table => ({ key: `qual_${table.id}`, description: table.description }))
      });
    }

    return groups;
  }, [roundTables, specialTables, qualifierTables, locationTables, israeliTable, playoffTable]);

  // useEffect: חישוב לפי section שנבחר
  useEffect(() => {
    if (!selectedSection || loading || !allQuestions.length) return;
    if (selectedSection === 'insights') return;
    if (selectedSection === 'users') { calculateUserStats(); return; }

    if (selectedSection.startsWith('round_')) {
      const tableId = selectedSection.replace('round_', '');
      setSelectedRound(tableId);
      if (israeliTable && tableId === israeliTable.id) calculateGameStats('israeli');
      else calculateGameStats('rounds', tableId);
      return;
    }
    if (selectedSection.startsWith('qual_')) {
      const tableId = selectedSection.replace('qual_', '');
      calculateSpecialStats('qualifier', tableId);
      return;
    }
    if (selectedSection === 'locations') { calculateSpecialStats('locations'); return; }
    if (selectedSection === playoffTable?.id) { calculateSpecialStats('playoff'); return; }
    calculateSpecialStats('special', selectedSection);
  }, [selectedSection, loading, allQuestions, allPredictions]);

  const toggleSection = (sectionId) => {
    if (selectedSection === sectionId) { setSelectedSection(null); return; }
    setSelectedSection(sectionId);
    setSpecialStats(null);
    setGameStats(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען סטטיסטיקות...</span>
      </div>
    );
  }

  // helpers לזיהוי סוג section
  const isRoundsSection = selectedSection?.startsWith('round_');
  const isQualifierSection = selectedSection?.startsWith('qual_');
  const isSpecialSection = selectedSection && !isRoundsSection && !isQualifierSection
    && selectedSection !== 'insights' && selectedSection !== 'users';

  return (
    <div className="min-h-screen p-6" dir="rtl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3" style={{ color: '#f8fafc', textShadow: '0 0 10px rgba(6, 182, 212, 0.3)' }}>
          <PieChart className="w-10 h-10" style={{ color: '#06b6d4' }} />
          סטטיסטיקות ותובנות
        </h1>
        <p className="mb-8" style={{ color: '#94a3b8' }}>ניתוח מעמיק של ביצועי המשתתפים</p>

        <div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>

          {/* ── Sidebar מחולק ל-4 קבוצות ──────────────────────────────────── */}
          <aside style={{ width: '215px', flexShrink: 0, position: 'sticky', top: '70px', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 90px)', overflowY: 'auto', paddingBottom: '16px' }}>
            <div style={{ fontSize: '0.58rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569', marginBottom: '10px' }}>בחר שלב</div>

            {sidebarGroups.map(group => (
              <div key={group.label} style={{ marginBottom: '10px' }}>
                {/* כותרת קבוצה עם פס צבעוני */}
                <div style={{ fontSize: '0.62rem', fontWeight: '700', color: group.color, letterSpacing: '0.06em', marginBottom: '5px', paddingRight: '6px', borderRight: `3px solid ${group.color}`, opacity: 0.95 }}>
                  {group.label}
                </div>
                {group.buttons.map(button => {
                  const active = selectedSection === button.key;
                  return (
                    <button key={button.key} onClick={() => toggleSection(button.key)} style={{
                      display: 'block', width: '100%', textAlign: 'right',
                      padding: '7px 10px', marginBottom: '3px', borderRadius: '8px',
                      fontSize: '0.78rem', fontWeight: active ? '700' : '400',
                      color: active ? 'white' : group.color,
                      background: active ? group.activeBg : `${group.color}18`,
                      border: `1px solid ${active ? group.color : `${group.color}50`}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                      boxShadow: active ? `0 0 10px ${group.color}55` : 'none',
                      fontFamily: 'Rubik, Heebo, sans-serif',
                    }}>{button.description}</button>
                  );
                })}
              </div>
            ))}
          </aside>

          {/* ── Content ─────────────────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>

        {/* 🧠 תובנות AI */}
        {selectedSection === 'insights' && (
          <Card style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(139,92,246,0.3)' }}>
            <CardContent className="p-12 text-center">
              <span style={{ fontSize: '2.5rem' }}>🧠</span>
              <p className="text-lg font-bold mt-4 mb-2" style={{ color: '#a78bfa' }}>תובנות AI — בקרוב</p>
              <p style={{ color: '#94a3b8' }}>מודול התובנות המתקדם בפיתוח</p>
            </CardContent>
          </Card>
        )}

        {/* 📊 פרטי מנחשים */}
        {selectedSection === 'users' && (
          <div className="space-y-6">
            {userStatsLoading ? (
              <Card style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                <CardContent className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#06b6d4' }} />
                  <p style={{ color: '#94a3b8' }}>טוען נתוני מנחשים...</p>
                </CardContent>
              </Card>
            ) : userStatsError ? (
              <Card style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: '#ef4444' }} />
                  <p className="text-xl font-bold mb-2" style={{ color: '#ef4444' }}>
                    {userStatsError === 'no_questions' ? 'לא נמצאו שאלות פרטי מנחשים' : userStatsError === 'rate_limit' ? 'יותר מדי בקשות — נסה שוב' : 'שגיאה בטעינת הנתונים'}
                  </p>
                </CardContent>
              </Card>
            ) : userStats ? (
              <div className="grid md:grid-cols-2 gap-6">
                {[
                  { title: 'מקצועות המנחשים', data: userStats.professionData, dataKey: 'profession', color: '#06b6d4', icon: BarChart3 },
                  { title: 'קבוצות גיל המנחשים', data: userStats.ageData, dataKey: 'group', color: '#8b5cf6', icon: PieChart }
                ].map(({ title, data, dataKey, color, icon: Icon }) => (
                  <Card key={title} style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                    <CardHeader><CardTitle className="flex items-center gap-2" style={{ color }}><Icon className="w-5 h-5" />{title}</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={450}>
                        <BarChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey={dataKey} angle={0} textAnchor="middle" height={80} stroke="#94a3b8" interval={0}
                            tick={({ x, y, payload }) => {
                              const words = String(payload.value).split(' ');
                              const lines = []; let cur = '';
                              words.forEach(w => { const t = cur ? `${cur} ${w}` : w; if (t.length <= 8) cur = t; else { if (cur) lines.push(cur); cur = w; } });
                              if (cur) lines.push(cur);
                              return <g transform={`translate(${x},${y})`}>{lines.slice(0, 3).map((l, i) => <text key={i} x={0} y={i * 14 + 10} textAnchor="middle" fill="#94a3b8" fontSize="10px">{l}</text>)}</g>;
                            }}
                          />
                          <YAxis stroke="#94a3b8" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                          <Tooltip wrapperStyle={{ zIndex: 1000, pointerEvents: 'auto' }} cursor={false} />
                          <Bar dataKey="count" radius={[8, 8, 0, 0]} cursor={{ fill: 'transparent' }} activeBar={false}>
                            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* ⚽ משחקי פלייאוף */}
        {isRoundsSection && (
          <div className="space-y-6">
            {gameStats !== null ? (
              <>
                {selectedRound && (() => {
                  const gamesByDate = {};
                  gameStatsArray.sort((a, b) => parseQuestionId(a.question.question_id) - parseQuestionId(b.question.question_id)).forEach(game => {
                    const date = game.question.game_date || 'ללא תאריך';
                    if (!gamesByDate[date]) gamesByDate[date] = [];
                    gamesByDate[date].push(game);
                  });
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
                      {Object.keys(gamesByDate).sort().map((date, dateIdx) => (
                        <Card key={dateIdx} style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(14,165,233,0.15) 100%)', border: '2px solid rgba(6,182,212,0.4)' }}>
                          <CardHeader className="pb-2 px-2 py-2">
                            <CardTitle className="flex items-center gap-2 text-sm" style={{ color: '#06b6d4' }}>
                              <Trophy className="w-4 h-4" />יום {dateIdx + 1} - {date}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-2">
                            <TooltipProvider delayDuration={0}>
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-xs">
                                  <thead>
                                    <tr style={{ background: 'rgba(6,182,212,0.2)', borderBottom: '2px solid rgba(6,182,212,0.4)' }}>
                                      <th className="py-1 px-1 text-right text-xs font-bold" style={{ color: '#06b6d4' }}>משחק</th>
                                      <th className="py-1 px-0.5 text-center text-xs font-bold" style={{ color: '#10b981' }} colSpan="2">בית</th>
                                      <th className="py-1 px-0.5 text-center text-xs font-bold" style={{ color: '#f59e0b' }} colSpan="2">תיקו</th>
                                      <th className="py-1 px-0.5 text-center text-xs font-bold" style={{ color: '#ef4444' }} colSpan="2">חוץ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {gamesByDate[date].map((game, index) => {
                                      const q = game.question;
                                      const outcomes = analyzeGameOutcomes(game.chartData);
                                      const od = gameOutcomeParticipants.get(q.id) || { homeWinParticipants: [], drawParticipants: [], awayWinParticipants: [] };
                                      const tot = outcomes.homeWins + outcomes.draws + outcomes.awayWins;
                                      const hp = tot > 0 ? Math.round((outcomes.homeWins / tot) * 100) : 0;
                                      const dp = tot > 0 ? Math.round((outcomes.draws / tot) * 100) : 0;
                                      const ap = tot > 0 ? Math.round((outcomes.awayWins / tot) * 100) : 0;
                                      let actualOutcome = null;
                                      if (q.actual_result?.trim() && q.actual_result !== '__CLEAR__') {
                                        const parts = q.actual_result.split('-').map(x => parseInt(x.trim()));
                                        if (!isNaN(parts[0]) && !isNaN(parts[1])) actualOutcome = parts[0] > parts[1] ? 'home' : parts[0] < parts[1] ? 'away' : 'draw';
                                      }
                                      const makeTooltip = (label, color, participants) => (
                                        <TooltipContent side="top" style={{ background: '#0f172a', border: `2px solid ${color}`, borderRadius: '6px', padding: '8px', maxWidth: '240px' }}>
                                          <p className="font-bold mb-1 text-xs" style={{ color }}>{label}</p>
                                          {participants.length > 0
                                            ? <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">{participants.map((n, i) => <span key={i} className="text-xs px-1 py-0.5 rounded" style={{ background: '#1e293b', color: '#f8fafc' }}>{n}</span>)}</div>
                                            : <p className="text-xs" style={{ color: '#94a3b8' }}>אין</p>}
                                        </TooltipContent>
                                      );
                                      return (
                                        <tr key={q.id} style={{ borderBottom: '1px solid rgba(6,182,212,0.1)', background: index % 2 === 0 ? 'rgba(15,23,42,0.3)' : 'transparent' }}>
                                          <td className="py-1 px-1 text-xs font-medium" style={{ color: '#f8fafc' }}>{cleanTeamName(q.home_team)} - {cleanTeamName(q.away_team)}</td>
                                          {[
                                            { pct: hp, cnt: outcomes.homeWins, color: '#10b981', outcome: 'home', participants: od.homeWinParticipants, label: `ניצחון ${cleanTeamName(q.home_team)}` },
                                            { pct: dp, cnt: outcomes.draws, color: '#f59e0b', outcome: 'draw', participants: od.drawParticipants, label: 'תיקו' },
                                            { pct: ap, cnt: outcomes.awayWins, color: '#ef4444', outcome: 'away', participants: od.awayWinParticipants, label: `ניצחון ${cleanTeamName(q.away_team)}` }
                                          ].map(({ pct, cnt, color, outcome, participants, label }, i) => (
                                            <React.Fragment key={i}>
                                              <UITooltip>
                                                <TooltipTrigger asChild>
                                                  <td className="py-1 px-0.5 text-center cursor-pointer" style={{ background: actualOutcome === outcome ? `${color}33` : 'transparent', borderLeft: actualOutcome === outcome ? `2px solid ${color}` : 'none' }}>
                                                    <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
                                                  </td>
                                                </TooltipTrigger>
                                                {makeTooltip(label, color, participants)}
                                              </UITooltip>
                                              <UITooltip>
                                                <TooltipTrigger asChild>
                                                  <td className="py-1 px-0.5 text-center cursor-pointer" style={{ borderLeft: '1px solid rgba(6,182,212,0.2)' }}>
                                                    <span className="text-xs" style={{ color: '#94a3b8' }}>{cnt}</span>
                                                  </td>
                                                </TooltipTrigger>
                                                {makeTooltip(label, color, participants)}
                                              </UITooltip>
                                            </React.Fragment>
                                          ))}
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
                })()}

                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { label: 'משחקים', val: gameStatsArray.length, c1: 'rgba(59,130,246,0.2)', c2: 'rgba(59,130,246,0.3)', tc: 'text-blue-200' },
                    { label: 'משתתפים', val: uniqueParticipantsCount, c1: 'rgba(16,185,129,0.2)', c2: 'rgba(16,185,129,0.3)', tc: 'text-green-200' },
                    { label: 'ניחושים', val: gameStatsArray.reduce((s, g) => s + g.totalPredictions, 0), c1: 'rgba(139,92,246,0.2)', c2: 'rgba(139,92,246,0.3)', tc: 'text-purple-200' }
                  ].map(({ label, val, c1, c2, tc }) => (
                    <Card key={label} style={{ background: `linear-gradient(135deg, ${c1}, ${c1})`, border: `1px solid ${c2}` }}>
                      <CardHeader className="pb-2"><CardTitle className={`${tc} flex items-center gap-2 text-sm`}>{label}</CardTitle></CardHeader>
                      <CardContent><p className="text-3xl font-bold text-white">{val}</p></CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {gameStatsArray.sort((a, b) => parseQuestionId(a.question.question_id) - parseQuestionId(b.question.question_id)).map(game => {
                    const q = game.question;
                    const homeTeam = teams[normalizeTeamName(q.home_team)];
                    const awayTeam = teams[normalizeTeamName(q.away_team)];
                    const hasActualResult = q.actual_result?.trim() && q.actual_result !== '__CLEAR__';
                    const outcomes = analyzeGameOutcomes(game.chartData);
                    const od = gameOutcomeParticipants.get(q.id) || { homeWinParticipants: [], drawParticipants: [], awayWinParticipants: [] };
                    return (
                      <Card key={q.id} className="bg-slate-800/40 border-slate-700">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" style={{ borderColor: 'rgba(6,182,212,0.5)', color: '#06b6d4' }}>{q.question_id}</Badge>
                              <div className="flex items-center gap-1">
                                {homeTeam?.logo_url && <img src={homeTeam.logo_url} alt="" className="w-5 h-5 rounded-full" />}
                                <span className="text-slate-200 text-sm">{cleanTeamName(q.home_team)}</span>
                                <span className="text-slate-500 text-xs">נגד</span>
                                <span className="text-slate-200 text-sm">{cleanTeamName(q.away_team)}</span>
                                {awayTeam?.logo_url && <img src={awayTeam.logo_url} alt="" className="w-5 h-5 rounded-full" />}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {hasActualResult && <Badge style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white' }}>⭐ {formatResult(q.actual_result)}</Badge>}
                              <Badge style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white' }}>{game.totalPredictions} ניחושים</Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <TooltipProvider>
                            <div className="mb-4 rounded-lg p-3" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
                              <table className="w-full text-center">
                                <thead>
                                  <tr className="border-b border-cyan-500/30">
                                    <th className="py-2 text-xs font-bold" style={{ color: '#10b981' }}>{cleanTeamName(q.home_team)}</th>
                                    <th className="py-2 text-xs font-bold" style={{ color: '#94a3b8' }}>תיקו</th>
                                    <th className="py-2 text-xs font-bold" style={{ color: '#ef4444' }}>{cleanTeamName(q.away_team)}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    {[
                                      { cnt: outcomes.homeWins, p: od.homeWinParticipants, c: '#10b981', l: `ניצחון ${cleanTeamName(q.home_team)}` },
                                      { cnt: outcomes.draws, p: od.drawParticipants, c: '#f59e0b', l: 'תיקו' },
                                      { cnt: outcomes.awayWins, p: od.awayWinParticipants, c: '#ef4444', l: `ניצחון ${cleanTeamName(q.away_team)}` }
                                    ].map(({ cnt, p, c, l }, i) => (
                                      <td key={i}>
                                        <UITooltip delayDuration={100}>
                                          <TooltipTrigger asChild>
                                            <div className="flex flex-col items-center cursor-pointer p-2">
                                              <span className="text-2xl font-bold" style={{ color: c }}>{cnt}</span>
                                              <span className="text-xs" style={{ color: '#94a3b8' }}>מנחשים</span>
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" style={{ background: '#0f172a', border: `2px solid ${c}`, borderRadius: '8px', padding: '12px', maxWidth: '280px' }}>
                                            <p className="font-bold mb-2" style={{ color: c }}>{l}</p>
                                            {p.length > 0 ? <><p className="text-xs mb-1" style={{ color: '#94a3b8' }}>({p.length} משתתפים)</p><div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">{p.map((n, idx) => <span key={idx} className="text-xs px-2 py-1 rounded" style={{ background: '#1e293b', color: '#f8fafc' }}>{n}</span>)}</div></> : <p className="text-xs" style={{ color: '#94a3b8' }}>אין</p>}
                                          </TooltipContent>
                                        </UITooltip>
                                      </td>
                                    ))}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </TooltipProvider>

                          <ResponsiveContainer width="100%" height={650}>
                            <RechartsPieChart>
                              <Pie data={game.chartData} cx="50%" cy="45%" startAngle={-60} endAngle={300} outerRadius={160} dataKey="value" labelLine={false}
                                label={(entry) => {
                                  const RADIAN = Math.PI / 180;
                                  const pct = parseFloat(entry.percentage);
                                  const displayName = formatResult(entry.name);
                                  if (pct > 10) {
                                    const r = entry.outerRadius * 0.65;
                                    const x = entry.cx + r * Math.cos(-entry.midAngle * RADIAN), y = entry.cy + r * Math.sin(-entry.midAngle * RADIAN);
                                    return <g><text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '12px', fontWeight: 'bold' }}>{displayName}</text><text x={x} y={y + 15} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '10px' }}>{pct}%</text></g>;
                                  }
                                  const lr = entry.outerRadius + 30, x = entry.cx + lr * Math.cos(-entry.midAngle * RADIAN), y = entry.cy + lr * Math.sin(-entry.midAngle * RADIAN);
                                  return <g><text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '10px', fontWeight: 'bold' }}>{displayName}</text><text x={x} y={y + 13} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '9px' }}>{pct}%</text></g>;
                                }}
                              >
                                {game.chartData.map((entry, index) => {
                                  const isActual = hasActualResult && normalizePrediction(entry.name) === normalizePrediction(q.actual_result);
                                  return <Cell key={index} fill={COLORS[index % COLORS.length]} stroke={isActual ? '#fbbf24' : 'rgba(15,23,42,0.8)'} strokeWidth={isActual ? 3 : 2} />;
                                })}
                              </Pie>
                              <Tooltip cursor={false} content={({ payload }) => {
                                if (!payload?.[0]) return null;
                                const d = payload[0].payload;
                                const key = `${q.id}_${normalizePrediction(d.name)}`;
                                const participants = participantsByQuestionAndAnswer.get(key) || [];
                                return (
                                  <div style={{ background: '#0a0f1a', border: '2px solid #06b6d4', borderRadius: '8px', padding: '12px', maxWidth: '360px' }}>
                                    <p style={{ color: '#06b6d4', fontWeight: 'bold', marginBottom: '6px' }}>{formatResult(d.name)}</p>
                                    <p style={{ color: '#f8fafc', fontSize: '12px', marginBottom: '6px' }}>{d.value} משתתפים ({d.percentage}%)</p>
                                    {participants.length > 0 && <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #475569' }}><p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>המשתתפים ({participants.length}):</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>{participants.map((n, i) => <span key={i} style={{ background: '#1e293b', color: '#f8fafc', padding: '3px 7px', borderRadius: '4px', fontSize: '10px' }}>{n}</span>)}</div></div>}
                                  </div>
                                );
                              }} />
                            </RechartsPieChart>
                          </ResponsiveContainer>
                          {hasActualResult && <div className="mt-4 p-3 rounded-lg text-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}><p style={{ color: '#fde68a', fontWeight: 'bold' }}>⭐ תוצאת אמת: {formatResult(q.actual_result)}</p></div>}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            ) : (
              <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <CardContent className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#06b6d4' }} />
                  <p style={{ color: '#94a3b8' }}>טוען נתונים...</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* 📋 עולות — גרף מרוכז יחיד */}
        {isQualifierSection && (
          <div className="space-y-6">
            {specialStats ? (
              Object.values(specialStats).map(tableStats => {
                const { table, qualifierData } = tableStats;
                if (!qualifierData) return null;
                const { chartData, cfg, advCount } = qualifierData;
                const totalSelections = chartData.reduce((s, d) => s + d.count, 0);

                return (
                  <Card key={table.id} style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(249,115,22,0.35)' }}>
                    <CardHeader>
                      <CardTitle style={{ color: '#f97316' }}>📋 {table.description}</CardTitle>
                      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                        כמה משתתפים בחרו כל קבוצה כעולה — ללא תלות במיקום הרישום
                        {cfg ? ` • ${advCount} קבוצות עולות • בונוס שלב: +${cfg.bonus} נק'` : ''}
                      </p>
                    </CardHeader>
                    <CardContent className="px-2 pb-6">
                      {chartData.length > 0 ? (
                        <div dir="ltr">
                        <ResponsiveContainer width="100%" height={Math.max(400, chartData.length * 34)}>
                          <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 50, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                            <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                            <YAxis
                              type="category"
                              dataKey="team"
                              width={190}
                              stroke="#334155"
                              tick={{ fontSize: 12, fill: '#f8fafc', fontFamily: 'Rubik, Heebo, sans-serif' }}
                            />
                            <Tooltip
                              wrapperStyle={{ pointerEvents: 'auto' }}
                              cursor={{ fill: 'rgba(249,115,22,0.08)' }}
                              content={({ payload }) => {
                                if (!payload?.[0]) return null;
                                const d = payload[0].payload;
                                const pct = totalSelections > 0 ? ((d.count / totalSelections) * 100).toFixed(1) : 0;
                                const participants = qualifierData.participantsMap?.[d.team] || [];
                                return (
                                  <div style={{ background: '#0a0f1a', border: '2px solid #f97316', borderRadius: '8px', padding: '12px', minWidth: '180px', maxWidth: '320px', boxShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                                    <p style={{ color: '#f97316', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>{d.team}</p>
                                    <p style={{ color: '#f8fafc', fontSize: '12px', marginBottom: '6px' }}>{d.count} בחירות ({pct}%)</p>
                                    {participants.length > 0 && (
                                      <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #475569' }}>
                                        <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: 'bold' }}>המשתתפים ({participants.length}):</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '160px', overflowY: 'auto', pointerEvents: 'auto' }}>
                                          {participants.map((n, i) => (
                                            <span key={i} style={{ background: '#1e293b', color: '#f8fafc', padding: '3px 7px', borderRadius: '4px', fontSize: '10px' }}>{n}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              }}
                            />
                            <Bar dataKey="count" radius={[0, 6, 6, 0]} label={{ position: 'right', fill: '#94a3b8', fontSize: 11, formatter: (v) => v }}>
                              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="text-center py-12" style={{ color: '#94a3b8' }}>אין נתונים עדיין</div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(249,115,22,0.2)' }}>
                <CardContent className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#f97316' }} />
                  <p style={{ color: '#94a3b8' }}>טוען סטטיסטיקות...</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ✨ שאלות מיוחדות */}
        {isSpecialSection && !specialStats && (
          <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <CardContent className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#06b6d4' }} />
              <p style={{ color: '#94a3b8' }}>טוען סטטיסטיקות...</p>
            </CardContent>
          </Card>
        )}

        {isSpecialSection && specialStats && (
          <div className="space-y-6">
            {Object.values(specialStats).map(tableStats => (
              <div key={tableStats.table.id}>
                <h2 className="text-2xl font-bold text-white mb-4">{tableStats.table.description}</h2>

                {tableStats.locationsData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <Card className="bg-slate-800/40 border-slate-700"><CardContent className="p-4"><p className="text-sm text-slate-400">סה"כ בחירות</p><p className="text-3xl font-bold text-cyan-400">{tableStats.locationsData.totalPredictions}</p></CardContent></Card>
                      <Card className="bg-slate-800/40 border-slate-700"><CardContent className="p-4"><p className="text-sm text-slate-400">קבוצות ייחודיות</p><p className="text-3xl font-bold text-blue-400">{tableStats.locationsData.uniqueTeams}</p></CardContent></Card>
                      <Card className="bg-slate-800/40 border-slate-700"><CardContent className="p-4"><p className="text-sm text-slate-400">הכי פופולרית</p><p className="text-lg font-bold text-green-400">{tableStats.locationsData.mostPopular.team}</p><p className="text-sm text-slate-400">{tableStats.locationsData.mostPopular.count} בחירות ({tableStats.locationsData.mostPopular.percentage}%)</p></CardContent></Card>
                    </div>
                    <Card className="bg-slate-800/40 border-slate-700">
                      <CardHeader><CardTitle className="text-cyan-300">10 הקבוצות הפופולריות ביותר</CardTitle></CardHeader>
                      <CardContent className="px-2 pb-3">
                        <ResponsiveContainer width="100%" height={450}>
                          <BarChart data={tableStats.locationsData.topTeams.slice(0, 10)} margin={{ top: 30, right: 0, left: 0, bottom: 130 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="team" angle={0} textAnchor="middle" height={120} stroke="#94a3b8" interval={0}
                              tick={({ x, y, payload }) => {
                                const words = String(payload.value).split(' '); const lines = []; let cur = '';
                                words.forEach(w => { const t = cur ? `${cur} ${w}` : w; if (t.length <= 10) cur = t; else { if (cur) lines.push(cur); cur = w; } }); if (cur) lines.push(cur);
                                return <g transform={`translate(${x},${y})`}>{lines.slice(0, 3).map((l, i) => <text key={i} x={0} y={i * 14 + 10} textAnchor="middle" fill="#94a3b8" fontSize="10px">{l}</text>)}</g>;
                              }}
                            />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                            <Tooltip wrapperStyle={{ zIndex: 1000, pointerEvents: 'auto' }} cursor={false} />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]} cursor={{ fill: 'transparent' }} activeBar={false}>
                              {tableStats.locationsData.topTeams.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tableStats.questions.filter(qs => qs.question.question_id !== '11.1').sort((a, b) => parseFloat(a.question.question_id) - parseFloat(b.question.question_id)).map(qStat => {
                      const q = qStat.question;
                      const usePieChart = qStat.chartData.length <= 3 && qStat.chartData.length > 0;
                      const hasActualResult = q.actual_result?.trim() && q.actual_result !== '__CLEAR__';
                      return (
                        <Card key={q.id} className="bg-slate-800/40 border-slate-700 flex flex-col">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" style={{ borderColor: 'rgba(6,182,212,0.5)', color: '#06b6d4', minWidth: '50px' }} className="justify-center">{q.question_id}</Badge>
                              <Badge className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xs">{qStat.totalAnswers} תשובות</Badge>
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
                                        <Pie data={qStat.chartData} cx="50%" cy="50%" labelLine={false}
                                          label={({ cx, cy, midAngle, outerRadius, answer, percentage }) => {
                                            const R = Math.PI / 180; const pct = parseFloat(percentage); const clean = answer.replace(':', '').trim();
                                            if (pct > 15) { const r = outerRadius * 0.65; const x = cx + r * Math.cos(-midAngle * R), y = cy + r * Math.sin(-midAngle * R); return <g><text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '11px', fontWeight: 'bold' }}>{clean}</text><text x={x} y={y + 13} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '9px' }}>{percentage}%</text></g>; }
                                            const lr = outerRadius + 25; const x = cx + lr * Math.cos(-midAngle * R), y = cy + lr * Math.sin(-midAngle * R);
                                            return <g><text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '10px', fontWeight: 'bold' }}>{clean}</text><text x={x} y={y + 12} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '9px' }}>{percentage}%</text></g>;
                                          }}
                                          outerRadius={70} dataKey="count">
                                          {qStat.chartData.map((entry, i) => {
                                            const isActual = hasActualResult && entry.answer === q.actual_result;
                                             return <Cell key={i} fill={COLORS[i % COLORS.length]} stroke={isActual ? '#fbbf24' : 'rgba(15,23,42,0.8)'} strokeWidth={isActual ? 3 : 2} style={{ cursor: 'pointer' }}
                                               onClick={() => { const k1c = `${q.id}_${normalizePrediction(entry.answer.trim())}`; const pts = participantsByQuestionAndAnswer.get(k1c) || participantsByQuestionAndAnswer.get(`${q.id}_${entry.answer.trim()}`) || []; setClickedSegment(prev => ({ ...prev, [q.id]: prev[q.id]?.answer === entry.answer ? null : { answer: entry.answer, count: entry.count, percentage: entry.percentage, participants: pts } })); }} />;
                                          })}
                                        </Pie>
                                         <Tooltip wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }} cursor={false}
                                           content={({ payload }) => {
                                             if (!payload?.[0]) return null;
                                             const d = payload[0].payload;
                                             return <div style={{ background: '#0a0f1a', border: '1px solid #06b6d4', borderRadius: '6px', padding: '8px', pointerEvents: 'none' }}><p style={{ color: '#06b6d4', fontWeight: 'bold', fontSize: '12px' }}>{d.answer}</p><p style={{ color: '#f8fafc', fontSize: '11px' }}>{d.count} תשובות ({d.percentage}%)</p><p style={{ color: '#94a3b8', fontSize: '9px', marginTop: '2px' }}>לחץ לרשימת מנחשים</p></div>;
                                           }}
                                         />
                                      </RechartsPieChart>
                                    ) : (
                                      <BarChart data={qStat.chartData.slice(0, 10)} margin={{ top: 10, right: 5, left: 5, bottom: 60 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="answer" angle={0} textAnchor="middle" height={60} stroke="#94a3b8" interval={0}
                                          tick={({ x, y, payload }) => {
                                            const ws = String(payload.value).split(' '); const ls = []; let cur = '';
                                            ws.forEach(w => { const t = cur ? `${cur} ${w}` : w; if (t.length <= 8) cur = t; else { if (cur) ls.push(cur); cur = w; } }); if (cur) ls.push(cur);
                                            return <g transform={`translate(${x},${y})`}>{ls.slice(0, 3).map((l, i) => <text key={i} x={0} y={i * 10 + 6} textAnchor="middle" fill="#94a3b8" fontSize="8px">{l}</text>)}</g>;
                                          }} />
                                        <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                         <Tooltip wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }} cursor={false} />
                                        <Bar dataKey="count" radius={[6, 6, 0, 0]} cursor={{ fill: 'transparent' }} activeBar={false}>
                                           {qStat.chartData.slice(0, 10).map((entry, i) => { const k1c = `${q.id}_${normalizePrediction(entry.answer.trim())}`; const pts = participantsByQuestionAndAnswer.get(k1c) || participantsByQuestionAndAnswer.get(`${q.id}_${entry.answer.trim()}`) || []; return <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ cursor: 'pointer' }} onClick={() => setClickedSegment(prev => ({ ...prev, [q.id]: prev[q.id]?.answer === entry.answer ? null : { answer: entry.answer, count: entry.count, percentage: entry.percentage, participants: pts } }))} />; })}
                                        </Bar>
                                      </BarChart>
                                    )}
                                  </ResponsiveContainer>
                                </div>
                                 {clickedSegment[q.id] && (
                                   <div style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '8px', padding: '10px', margin: '8px 0' }}>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                       <p style={{ color: '#06b6d4', fontWeight: 'bold', fontSize: '13px' }}>{clickedSegment[q.id].answer} — {clickedSegment[q.id].count} תשובות ({clickedSegment[q.id].percentage}%)</p>
                                       <button onClick={() => setClickedSegment(prev => ({ ...prev, [q.id]: null }))} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                                     </div>
                                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                                       {clickedSegment[q.id].participants.map((n, i) => (
                                         <span key={i} style={{ background: '#1e293b', color: '#f8fafc', padding: '3px 7px', borderRadius: '4px', fontSize: '10px' }}>{n}</span>
                                       ))}
                                     </div>
                                   </div>
                                 )}
                                <div className="mt-3 pt-3 border-t border-slate-700 px-2">
                                  <p className="text-xs text-slate-400 mb-1">התשובה הפופולרית:</p>
                                  <p className="text-cyan-300 font-bold text-sm">{qStat.mostPopular.answer}</p>
                                  <p className="text-slate-400 text-xs">{qStat.mostPopular.count} תשובות ({qStat.mostPopular.percentage}%)</p>
                                  {hasActualResult && <div className="mt-2 p-2 rounded" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}><p className="text-yellow-300 font-bold text-xs">⭐ תוצאת אמת: {q.actual_result}</p></div>}
                                  <p className="text-slate-500 text-xs mt-2">גיוון: {qStat.diversity} תשובות שונות</p>
                                </div>
                              </>
                            ) : <div className="text-center py-8 text-slate-500">אין נתונים</div>}
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

          </div> {/* end content */}
        </div> {/* end flex */}
      </div>
    </div>
  );
}
