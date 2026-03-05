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
import { calculateQuestionScore, calculateLocationTableBonus } from "@/components/scoring/ScoreCalculator";

export default function LeaderboardNew() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState('');
  const [settingBaseline, setSettingBaseline] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantDetails, setParticipantDetails] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [avgScore, setAvgScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const [sortColumn, setSortColumn] = useState('current_position');
  const [sortDirection, setSortDirection] = useState('asc');
  const { toast } = useToast();
  const { currentGame } = useGame();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
        if (isAuth) {
          const user = await supabase.auth.getUser().then(r => r.data.user);
          setCurrentUser(user);
        }
      } catch (error) { setCurrentUser(null); }
    };
    loadUser();
  }, []);

  const formatScore = (score) => {
    if (!score || score === '__CLEAR__') return '';
    if (score.includes('-')) return score.split('-').map(x => x.trim()).join(' - ');
    return score;
  };

  const loadRankings = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      const stored = await db.Ranking.filter({ game_id: currentGame.id }, '-current_score', 500);
      if (stored.length > 0) {
        let position = 1;
        const ranked = stored.map((r, i) => {
          if (i > 0 && stored[i].current_score !== stored[i - 1].current_score) position = i + 1;
          return { ...r, current_position: position };
        });
        setRankings(ranked);
        const scores = ranked.map(r => r.current_score || 0);
        setAvgScore(scores.reduce((a, b) => a + b, 0) / scores.length);
        setMaxScore(Math.max(...scores));
        setMinScore(Math.min(...scores));
      } else { setRankings([]); }
    } catch (error) {
      toast({ title: "שגיאה", description: "טעינת הדירוג נכשלה", variant: "destructive" });
    }
    setLoading(false);
  }, [currentGame, toast]);

  useEffect(() => { loadRankings(); }, [loadRankings, currentGame]);

  const loadAllQuestions = async (gameId) => {
    let all = []; let skip = 0; const BATCH = 1000;
    while (true) {
      const batch = await db.Question.filter({ game_id: gameId }, null, BATCH, skip);
      all = [...all, ...batch];
      if (batch.length < BATCH) break;
      skip += BATCH;
    }
    all.forEach(q => {
      if (!q.home_team && !q.away_team && q.question_text) {
        let teams = null;
        if (q.question_text.includes(' נגד ')) teams = q.question_text.split(' נגד ').map(t => t.trim());
        else if (q.question_text.includes(' - ')) teams = q.question_text.split(' - ').map(t => t.trim());
        if (teams?.length === 2) { q.home_team = teams[0]; q.away_team = teams[1]; }
      }
    });
    return all;
  };

  const loadAllPredictions = async (gameId, participantName = null) => {
    let all = []; let skip = 0; const BATCH = 1000;
    const filter = participantName ? { game_id: gameId, participant_name: participantName } : { game_id: gameId };
    while (true) {
      const batch = await db.Prediction.filter(filter, null, BATCH, skip);
      all = [...all, ...batch];
      if (batch.length < BATCH) break;
      skip += BATCH;
    }
    return all;
  };

  const buildLatestPredMap = (predictions) => {
    const tempPreds = {};
    for (const pred of predictions) {
      const existing = tempPreds[pred.question_id];
      const existingDate = existing ? new Date(existing.created_at || existing.created_date || 0) : new Date(0);
      const newDate = new Date(pred.created_at || pred.created_date || 0);
      if (!existing || newDate > existingDate) tempPreds[pred.question_id] = pred;
    }
    const predMap = {};
    for (const [qid, pred] of Object.entries(tempPreds)) predMap[qid] = pred.text_prediction;
    return predMap;
  };

  // ✅ תיקון קריטי: רק משתתפים רשמיים מ-game_participants
  // 🔧 פונקציה משותפת לחישוב ניקוד - משמשת גם handleRecalculate וגם loadParticipantDetails
  const computeParticipantScore = async (name, allQuestions) => {
    const preds = await loadAllPredictions(currentGame.id, name);

    // ניחוש אחרון לכל שאלה (לפי created_at)
    const latestPreds = {};
    preds.forEach(p => {
      const ex = latestPreds[p.question_id];
      if (!ex || new Date(p.created_at||0) > new Date(ex.created_at||0)) latestPreds[p.question_id] = p;
    });
    const predictionsMap = new Map(Object.values(latestPreds).map(p => [p.question_id, p.text_prediction]));

    const questionsWithResults = allQuestions.filter(q => {
      if (!q.actual_result) return false;
      const r = String(q.actual_result).trim();
      return r !== '' && r !== '__CLEAR__' && r !== '-' && r !== 'null' && !r.toLowerCase().includes('null');
    });

    let totalScore = 0;

    questionsWithResults.forEach(q => {
      const prediction = predictionsMap.get(q.id);
      if (!prediction) return;
      const score = calculateQuestionScore(q, prediction);
      if (score === null) return;
      totalScore += score;
    });

    const baseScore = totalScore;

    const locationTables = ['T14', 'T15', 'T16', 'T17', 'T19'];
    let locationBonus = 0;
    for (const tableId of locationTables) {
      const tableQuestions = questionsWithResults.filter(q => q.table_id === tableId);
      if (tableQuestions.length === 0) {
        if (name === 'אביב רחמים') console.log(`  ❌ ${tableId}: no questions in questionsWithResults`);
        continue;
      }
      const tablePredictions = {};
      const sourceQuestions = tableId === 'T19'
        ? allQuestions.filter(q => q.table_id === 'T19')
        : tableQuestions;
      sourceQuestions.forEach(q => {
        const pred = predictionsMap.get(q.id);
        if (pred) tablePredictions[q.id] = pred;
      });
      const predCount = Object.keys(tablePredictions).length;
      if (name === 'אביב רחמים' && tableId === 'T14') {
        const sampleQ = tableQuestions[0];
        const mapKeys = [...predictionsMap.keys()];
        const sampleKey = mapKeys[0];
        const directLookup = predictionsMap.get(sampleQ?.id);
        console.log(`  📊 T14: tableQ=${tableQuestions.length}, predCount=${predCount}`);
        console.log(`    sampleQ.id="${sampleQ?.id}" (${typeof sampleQ?.id})`);
        console.log(`    mapKey[0]="${sampleKey}" (${typeof sampleKey})`);
        console.log(`    directLookup="${directLookup}"`);
        console.log(`    === match: ${sampleQ?.id === sampleKey}`);
        // Show first few map entries
        for (let i = 0; i < Math.min(3, mapKeys.length); i++) {
          console.log(`    mapKey[${i}]="${mapKeys[i]}" → "${predictionsMap.get(mapKeys[i])}"`);
        }
      }
      const bonusResult = calculateLocationTableBonus(tableId, tableQuestions, tablePredictions);
      if (bonusResult) {
        const bonus = (bonusResult.basicScore||0) + (bonusResult.teamsBonus||0) + (bonusResult.orderBonus||0);
        locationBonus += bonus;
        totalScore += bonus;
        if (name === 'אביב רחמים') console.log(`  ✅ ${tableId}: bonus=${bonus} (basic=${bonusResult.basicScore}, correct=${bonusResult.correctTeamsCount})`);
      }
    }

    if (name === 'אביב רחמים' || name === 'עודד רגב') {
      console.log(`🔍 ${name}: preds=${preds.length}, qWithResults=${questionsWithResults.length}, baseScore=${baseScore}, locationBonus=${locationBonus}, total=${totalScore}`);
    }

    return { totalScore, predictionsMap, questionsWithResults };
  };

  const handleRecalculateScores = async () => {
    if (!currentGame) return;
    setRecalculating(true);
    setRecalcProgress('טוען משתתפים...');
    try {
      // 1️⃣ רשימת משתתפים רשמית בלבד
      const gameParticipants = await db.GameParticipant.filter(
        { game_id: currentGame.id }, 'participant_name', 500
      );
      const validParticipants = new Set(
        gameParticipants
          .filter(p => p.is_active !== false)
          .map(p => p.participant_name)
      );

      if (validParticipants.size === 0) {
        toast({ title: "שגיאה", description: "לא נמצאו משתתפים ב-game_participants", variant: "destructive" });
        setRecalculating(false); return;
      }

      setRecalcProgress(`טוען שאלות...`);
      // 🔑 טוען שאלות פעם אחת - אותן שאלות שמשמשות את הפופאפ
      const allQuestions = await loadAllQuestions(currentGame.id);

      // 2️⃣ חשב ניקוד לכל משתתף באמצעות אותה פונקציה כמו הפופאפ
      const participantScores = [];
      let i = 0;
      for (const name of validParticipants) {
        i++;
        setRecalcProgress(`מחשב ניקוד: ${i}/${validParticipants.size} — ${name}`);
        const { totalScore } = await computeParticipantScore(name, allQuestions);
        console.log(`🔢 RECALC ${name}: ${totalScore}`);
        participantScores.push({ participant_name: name, current_score: totalScore });
      }

      // 3️⃣ מיין + מיקומים
      participantScores.sort((a, b) => b.current_score - a.current_score);
      let position = 1;
      for (let i = 0; i < participantScores.length; i++) {
        if (i > 0 && participantScores[i].current_score !== participantScores[i - 1].current_score) position = i + 1;
        participantScores[i].current_position = position;
      }

      // 4️⃣ שמור
      const baselines = await db.Ranking.filter({ game_id: currentGame.id }, null, 500);
      const baselineMap = {};
      baselines.forEach(b => { baselineMap[b.participant_name] = b; });

      setRecalcProgress(`שומר ${participantScores.length} רשומות...`);
      const BATCH = 10;
      for (let i = 0; i < participantScores.length; i += BATCH) {
        const chunk = participantScores.slice(i, i + BATCH);
        await Promise.all(chunk.map(async p => {
          const baseline = baselineMap[p.participant_name];
          const data = {
            participant_name: p.participant_name, game_id: currentGame.id,
            current_score: p.current_score, current_position: p.current_position,
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
            if (baseline) await db.Ranking.update(baseline.id, data);
            else await db.Ranking.create(data);
          } catch (err) { console.error(`שגיאה ב-${p.participant_name}:`, err); }
        }));
        setRecalcProgress(`שמירה: ${Math.min(i + BATCH, participantScores.length)}/${participantScores.length}`);
      }

      // 5️⃣ מחק רשומות ישנות
      const orphaned = baselines.filter(b => !validParticipants.has(b.participant_name));
      if (orphaned.length > 0) await Promise.all(orphaned.map(r => db.Ranking.delete(r.id)));

      toast({ title: "הצלחה!", description: `עודכן דירוג ל-${participantScores.length} משתתפים`, className: "bg-cyan-900/30 border-cyan-500 text-cyan-200" });
      await loadRankings();
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    }
    setRecalculating(false); setRecalcProgress('');
  };

  const handleSetBaseline = async () => {
    if (!currentGame || !window.confirm('האם לקבוע את הדירוג הנוכחי כנקודת ייחוס?')) return;
    setSettingBaseline(true);
    try {
      const allRankings = await db.Ranking.filter({ game_id: currentGame.id }, null, 500);
      const now = new Date().toISOString();
      const BATCH = 10;
      for (let i = 0; i < allRankings.length; i += BATCH) {
        await Promise.all(allRankings.slice(i, i + BATCH).map(r =>
          db.Ranking.update(r.id, { baseline_score: r.current_score, baseline_position: r.current_position, last_baseline_set: now })
        ));
      }
      toast({ title: "נקודת ייחוס נקבעה!", description: `${allRankings.length} משתתפים עודכנו`, className: "bg-green-900/30 border-green-500 text-green-200" });
      await loadRankings();
    } catch (error) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); }
    setSettingBaseline(false);
  };

  const loadParticipantDetails = async (participantName) => {
    if (!currentGame) return;
    try {
      const allQuestions = await loadAllQuestions(currentGame.id);
      const teamsMap = (currentGame.teams_data || []).reduce((acc, t) => { acc[t.name] = t; return acc; }, {});

      // 🔑 משתמש באותה פונקציה כמו handleRecalculateScores - מובטח אותו חישוב
      const { totalScore, predictionsMap, questionsWithResults } = await computeParticipantScore(participantName, allQuestions);

      const enrichedScores = [];

      // בנה enrichedScores לתצוגה בפופאפ
      questionsWithResults.forEach(question => {
        const prediction = predictionsMap.get(question.id);
        if (!prediction) return;
        const score = calculateQuestionScore(question, prediction);
        if (score === null) return;
        const maxScore = (question.home_team && question.away_team) || ['T2','T3','T4','T5','T6','T7','T8','T9','T20'].includes(question.table_id)
          ? (question.table_id === 'T20' ? 6 : 10)
          : (question.possible_points || 0);
        enrichedScores.push({
          question_id: question.id, score, max_score: maxScore,
          table_id: question.table_id || '?',
          question_id_display: question.question_id || '?',
          question_text: question.question_text || '',
          home_team: question.home_team, away_team: question.away_team,
          actual_result: formatScore(question.actual_result || ''),
          prediction: formatScore(prediction || ''),
          home_team_logo: question.home_team ? teamsMap[question.home_team]?.logo_url : null,
          away_team_logo: question.away_team ? teamsMap[question.away_team]?.logo_url : null,
          isBonus: false
        });
      });

      // בונוסי מיקומים לתצוגה
      const locationTables = ['T14', 'T15', 'T16', 'T17', 'T19'];
      for (const tableId of locationTables) {
        const tableQuestions = questionsWithResults.filter(q => q.table_id === tableId);
        if (tableQuestions.length === 0) continue;
        const tablePredictions = {};
        const sourceQuestions = tableId === 'T19' ? allQuestions.filter(q => q.table_id === 'T19') : tableQuestions;
        sourceQuestions.forEach(q => { const p = predictionsMap.get(q.id); if (p) tablePredictions[q.id] = p; });
        const bonusResult = calculateLocationTableBonus(tableId, tableQuestions, tablePredictions);
        if (!bonusResult) continue;
        if (bonusResult.basicScore > 0) {
          enrichedScores.push({ question_id: `${tableId}_BASIC`, score: bonusResult.basicScore, max_score: bonusResult.basicScore, table_id: tableId, question_id_display: '🎁', question_text: `ניקוד קבוצות (${bonusResult.correctTeamsCount})`, home_team: null, away_team: null, actual_result: '✓', prediction: '✓', home_team_logo: null, away_team_logo: null, isBonus: true });
        }
        if (bonusResult.teamsBonus > 0) {
          enrichedScores.push({ question_id: `${tableId}_TEAMS`, score: bonusResult.teamsBonus, max_score: bonusResult.teamsBonus, table_id: tableId, question_id_display: '🎁', question_text: 'בונוס עולות', home_team: null, away_team: null, actual_result: '✓', prediction: '✓', home_team_logo: null, away_team_logo: null, isBonus: true });
        }
        if (bonusResult.orderBonus > 0) {
          enrichedScores.push({ question_id: `${tableId}_ORDER`, score: bonusResult.orderBonus, max_score: bonusResult.orderBonus, table_id: tableId, question_id_display: '🎁', question_text: 'בונוס סדר מדויק', home_team: null, away_team: null, actual_result: '✓', prediction: '✓', home_team_logo: null, away_team_logo: null, isBonus: true });
        }
      }

      const filteredScores = enrichedScores
        .filter(s => s.score > 0)
        .sort((a, b) => {
          const tA = parseInt(String(a.table_id).replace('T', '')) || 999;
          const tB = parseInt(String(b.table_id).replace('T', '')) || 999;
          if (tA !== tB) return tA - tB;
          return (parseFloat(a.question_id_display) || 999) - (parseFloat(b.question_id_display) || 999);
        });

      console.log(`🔢 POPUP ${participantName}: ${totalScore}`);
      setParticipantDetails({ name: participantName, scores: filteredScores, totalScore });
      setSelectedParticipant(participantName);
    } catch (error) {
      toast({ title: "שגיאה", description: "טעינת הפרטים נכשלה", variant: "destructive" });
    }
  };

  const handleSort = (column) => {
    if (sortColumn === column) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(column); setSortDirection(['current_score','previous_score','score_change','position_change'].includes(column) ? 'desc' : 'asc'); }
  };

  const getSortedRankings = () => [...rankings].sort((a, b) => {
    let aVal = a[sortColumn], bVal = b[sortColumn];
    if (sortColumn === 'participant_name') { aVal = String(aVal||''); bVal = String(bVal||''); return sortDirection==='asc' ? aVal.localeCompare(bVal,'he') : bVal.localeCompare(aVal,'he'); }
    aVal = Number(aVal)||0; bVal = Number(bVal)||0;
    return sortDirection==='asc' ? aVal-bVal : bVal-aVal;
  });

  const SortIcon = ({ column }) => sortColumn!==column ? <ArrowUpDown className="w-2.5 h-2.5 md:w-4 md:h-4 opacity-30"/> : sortDirection==='asc' ? <ArrowUp className="w-2.5 h-2.5 md:w-4 md:h-4" style={{color:'#06b6d4'}}/> : <ArrowDown className="w-2.5 h-2.5 md:w-4 md:h-4" style={{color:'#06b6d4'}}/>;
  const getPositionIcon = (pos) => pos===1?<Crown className="w-5 h-5 text-yellow-400"/>:pos===2?<Trophy className="w-5 h-5 text-gray-400"/>:pos===3?<Trophy className="w-5 h-5 text-orange-400"/>:null;
  const getChangeIcon = (change) => change>0?<TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-green-400"/>:change<0?<TrendingDown className="w-3 h-3 md:w-4 md:h-4 text-red-400"/>:<Minus className="w-3 h-3 md:w-4 md:h-4 text-gray-400"/>;

  const isAdmin = currentUser?.role==='admin'||currentUser?.app_metadata?.role==='admin'||currentUser?.email==='tropikan1@gmail.com';
  const sortedRankings = getSortedRankings();

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{background:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)'}}>
      <Loader2 className="w-8 h-8 animate-spin" style={{color:'#06b6d4'}}/>
      <span className="mr-3" style={{color:'#06b6d4'}}>טוען דירוג...</span>
    </div>
  );

  return (
    <div className="min-h-screen p-3 md:p-6" dir="rtl" style={{background:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)'}}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-3 mb-4 md:mb-8">
          <div>
            <h1 className="text-xl md:text-4xl font-bold mb-1 md:mb-2 flex items-center gap-2 md:gap-3" style={{color:'#f8fafc',textShadow:'0 0 10px rgba(6,182,212,0.3)'}}>
              <Trophy className="w-6 h-6 md:w-10 md:h-10" style={{color:'#06b6d4'}}/>טבלת דירוג
            </h1>
            <p className="text-xs md:text-base" style={{color:'#94a3b8'}}>מצב העמידה הנוכחי של המשתתפים</p>
            {recalcProgress && <p className="text-xs mt-1" style={{color:'#06b6d4'}}>{recalcProgress}</p>}
          </div>
          {isAdmin && (
            <div className="flex gap-2 md:gap-3 w-full md:w-auto">
              <Button onClick={handleSetBaseline} disabled={settingBaseline||recalculating} style={{background:'linear-gradient(135deg,#10b981 0%,#059669 100%)'}} className="text-white flex-1 md:flex-none h-8 md:h-10 text-[10px] md:text-sm">
                {settingBaseline?<Loader2 className="w-3 h-3 animate-spin ml-1"/>:<CheckCircle className="w-3 h-3 ml-1"/>}קבע דירוג
              </Button>
              <Button onClick={handleRecalculateScores} disabled={recalculating||settingBaseline} style={{background:'linear-gradient(135deg,#06b6d4 0%,#0ea5e9 100%)'}} className="text-white flex-1 md:flex-none h-8 md:h-10 text-[10px] md:text-sm">
                {recalculating?<Loader2 className="w-3 h-3 animate-spin ml-1"/>:<RefreshCw className="w-3 h-3 ml-1"/>}{recalculating?recalcProgress||'מחשב...':'חשב ניקוד'}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
          {[{label:'סה"כ משתתפים',value:rankings.length,icon:Users,color:'#06b6d4'},{label:'ניקוד ממוצע',value:avgScore.toFixed(1),icon:Target,color:'#0ea5e9'},{label:'ניקוד מקסימלי',value:maxScore.toFixed(1),icon:TrendingUp,color:'#8b5cf6'},{label:'ניקוד מינימלי',value:minScore.toFixed(1),icon:TrendingDown,color:'#94a3b8'}].map((stat,idx)=>(
            <Card key={idx} style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(6,182,212,0.2)'}}>
              <CardContent className="p-2 md:p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[9px] md:text-sm" style={{color:'#94a3b8'}}>{stat.label}</p><p className="text-lg md:text-3xl font-bold" style={{color:stat.color}}>{stat.value}</p></div>
                  <stat.icon className="w-6 h-6 md:w-10 md:h-10" style={{color:stat.color,opacity:0.5}}/>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(6,182,212,0.2)'}}>
          <CardHeader className="py-2 md:py-4"><CardTitle className="text-sm md:text-lg" style={{color:'#06b6d4'}}>הדירוג הנוכחי</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rankings.length===0 ? (
              <div className="p-8 text-center" style={{color:'#94a3b8'}}>אין נתוני דירוג — לחץ "חשב ניקוד" כדי לחשב</div>
            ) : (
              <div style={{maxHeight:'600px',overflow:'auto'}}>
                <table className="w-full" style={{borderCollapse:'collapse'}}>
                  <thead style={{position:'sticky',top:0,zIndex:10,backgroundColor:'#1e293b'}}>
                    <tr style={{borderBottom:'2px solid rgba(6,182,212,0.3)'}}>
                      {[{key:'current_position',label:'#',mobile:true},{key:'participant_name',label:'שם',mobile:true,align:'right'},{key:'current_score',label:"נק'",mobile:true},{key:'previous_position',label:'מיקום קודם',mobile:false},{key:'previous_score',label:'ניקוד קודם',mobile:false},{key:'score_change',label:'שינוי בניקוד',mobileLabel:'+/-',mobile:true},{key:'position_change',label:'שינוי במיקום',mobileLabel:'↕',mobile:true}].map(col=>(
                        <th key={col.key} className={`${col.mobile?'':'hidden md:table-cell'} text-${col.align||'center'} p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 text-[8px] md:text-sm`} style={{backgroundColor:'#1e293b',color:'#94a3b8'}} onClick={()=>handleSort(col.key)}>
                          <div className={`flex items-center justify-${col.align==='right'?'start':'center'} gap-0.5 md:gap-2`}>
                            <span className="hidden md:inline">{col.label}</span>
                            {col.mobileLabel&&<span className="md:hidden">{col.mobileLabel}</span>}
                            {!col.mobileLabel&&<span className="md:hidden">{col.label}</span>}
                            <SortIcon column={col.key}/>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRankings.map(rank=>(
                      <tr key={rank.id} className="hover:bg-cyan-500/10" style={{borderBottom:'1px solid rgba(6,182,212,0.1)'}}>
                        <td className="text-center p-1 md:p-2">
                          <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                            <span className="hidden md:inline">{getPositionIcon(rank.current_position)}</span>
                            <span className="font-bold text-xs md:text-base" style={{color:'#f8fafc'}}>{rank.current_position}</span>
                          </div>
                        </td>
                        <td className="font-medium text-[10px] md:text-base cursor-pointer hover:underline text-right p-1 md:p-2" style={{color:'#0ea5e9'}} onClick={()=>loadParticipantDetails(rank.participant_name)}>{rank.participant_name}</td>
                        <td className="text-center p-1 md:p-2"><Badge className="text-white text-[10px] md:text-base px-1.5 md:px-3 py-0.5 md:py-1" style={{background:'#06b6d4',boxShadow:'0 0 10px rgba(6,182,212,0.4)'}}>{rank.current_score}</Badge></td>
                        <td className="hidden md:table-cell text-center p-2 text-sm" style={{color:'#94a3b8'}}>{rank.previous_position||'-'}</td>
                        <td className="hidden md:table-cell text-center p-2 text-sm" style={{color:'#94a3b8'}}>{rank.previous_score||'0'}</td>
                        <td className="text-center p-1 md:p-2">
                          <div className="flex items-center justify-center gap-0.5 md:gap-1">
                            {rank.score_change>0&&<Badge className="text-white text-[8px] md:text-xs px-1 md:px-2" style={{background:'#10b981'}}>+{rank.score_change}</Badge>}
                            {rank.score_change<0&&<Badge className="text-white text-[8px] md:text-xs px-1 md:px-2" style={{background:'#ef4444'}}>{rank.score_change}</Badge>}
                            {(!rank.score_change||rank.score_change===0)&&<Badge className="text-white text-[8px] md:text-xs px-1 md:px-2" style={{background:'#475569'}}>0</Badge>}
                          </div>
                        </td>
                        <td className="text-center p-1 md:p-2">
                          <div className="flex items-center justify-center gap-0.5 md:gap-1">
                            {getChangeIcon(rank.position_change)}
                            <span className={`font-medium text-[10px] md:text-sm ${rank.position_change>0?'text-green-400':rank.position_change<0?'text-red-400':'text-gray-400'}`}>{rank.position_change!==0?Math.abs(rank.position_change):'-'}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={selectedParticipant!==null} onOpenChange={()=>setSelectedParticipant(null)}>
        <DialogContent className="max-w-6xl max-h-[85vh] w-[95vw] md:w-auto flex flex-col" style={{background:'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',border:'1px solid rgba(6,182,212,0.2)',boxShadow:'0 0 30px rgba(6,182,212,0.3)'}} dir="rtl">
          <DialogHeader className="flex-shrink-0 pb-2 md:pb-4" style={{borderBottom:'1px solid rgba(6,182,212,0.3)'}}>
            <DialogTitle className="text-base md:text-2xl font-bold text-right" style={{color:'#f8fafc'}}>{participantDetails?.name}</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1 md:mt-2">
              <Badge className="text-white text-xs md:text-lg px-2 md:px-4 py-1 md:py-2 rounded-full" style={{background:'#0ea5e9'}}>סה"כ: {participantDetails?.totalScore} נקודות</Badge>
              <span className="text-[10px] md:text-base" style={{color:'#94a3b8'}}>{participantDetails?.scores.filter(s=>s.score>0).length} פריטים עם ניקוד</span>
            </div>
          </DialogHeader>
          <div className="flex-1" style={{overflow:'auto'}}>
            <table className="w-full" style={{borderCollapse:'separate',borderSpacing:'0 4px'}}>
              <thead style={{position:'sticky',top:0,zIndex:10,backgroundColor:'#0f172a'}}>
                <tr>
                  {[['טבלה','60px'],['מס׳','50px'],['שאלה',null,'right'],['ניחוש','90px'],['תוצאה','90px'],['ניקוד','70px']].map(([label,w,align],i)=>(
                    <th key={i} className={`text-${align||'center'} p-2 text-xs`} style={{backgroundColor:'#0f172a',color:'#94a3b8',width:w||'auto'}}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(participantDetails?.scores||[]).map((s,index)=>{
                  let badgeColor='bg-slate-600 text-white';
                  if(s.score===s.max_score&&s.max_score>0) badgeColor='bg-green-600 text-white';
                  else if(s.score===0) badgeColor='bg-red-600 text-white';
                  else if(s.score>=7) badgeColor='bg-blue-600 text-white';
                  else if(s.score>0) badgeColor='bg-yellow-500 text-white';
                  return (
                    <tr key={index} className="transition-colors hover:bg-cyan-500/10" style={{backgroundColor:s.isBonus?'rgba(6,182,212,0.08)':'#1e293b',borderTop:s.isBonus?'1px solid rgba(6,182,212,0.2)':'none'}}>
                      <td className="text-center p-1.5"><Badge variant="outline" className="rounded-full px-1.5 py-0.5 text-[10px]" style={{borderColor:'#06b6d4',color:'#06b6d4',background:'rgba(6,182,212,0.1)'}}>{s.table_id}</Badge></td>
                      <td className="text-center p-1.5"><Badge variant="outline" className="rounded-full px-1.5 py-0.5 text-[10px]" style={{borderColor:'#0ea5e9',color:'#0ea5e9',background:'rgba(14,165,233,0.1)'}}>{s.question_id_display}</Badge></td>
                      <td className="text-right p-1.5">
                        {s.home_team&&s.away_team?(
                          <div className="flex items-center justify-start gap-1 text-xs" style={{color:'#f8fafc'}}>
                            <span>{s.home_team}</span>
                            {s.home_team_logo&&<img src={s.home_team_logo} alt={s.home_team} className="w-4 h-4 rounded-full" onError={e=>e.target.style.display='none'}/>}
                            <span>-</span>
                            {s.away_team_logo&&<img src={s.away_team_logo} alt={s.away_team} className="w-4 h-4 rounded-full" onError={e=>e.target.style.display='none'}/>}
                            <span>{s.away_team}</span>
                          </div>
                        ):(
                          <span className="text-xs" style={{color:s.isBonus?'#06b6d4':'#f8fafc',fontWeight:s.isBonus?'bold':'normal'}}>{s.question_text}</span>
                        )}
                      </td>
                      <td className="text-center p-1.5"><span className="font-medium text-xs" style={{color:'#94a3b8'}}>{s.prediction||'-'}</span></td>
                      <td className="text-center p-1.5"><span className="font-medium text-xs" style={{color:'#f8fafc'}}>{s.actual_result||'-'}</span></td>
                      <td className="text-center p-1.5"><Badge className={`${badgeColor} text-xs font-bold px-2 py-0.5 rounded-full`}>{s.score}/{s.max_score}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
