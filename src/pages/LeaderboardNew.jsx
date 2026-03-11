import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, Loader2, Crown, TrendingUp, TrendingDown, Minus, Users, Target, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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

  const calculateParticipantScore = (allQuestions, predictions) => {
    const tempPreds = {};
    predictions.forEach(pred => {
      const existing = tempPreds[pred.question_id];
      if (!existing || new Date(pred.created_at) > new Date(existing.created_at)) {
        tempPreds[pred.question_id] = pred;
      }
    });
    const predMap = {};
    for (const [qid, pred] of Object.entries(tempPreds)) {
      predMap[qid] = pred.text_prediction;
    }
    const { total, breakdown } = calculateTotalScore(allQuestions, predMap);
    return { total, breakdown };
  };

  // ── helper: load ALL rankings with pagination ──────────────────────────────
  const loadAllRankings = async (gameId, orderBy = '-current_score') => {
    let all = [];
    let skip = 0;
    const PAGE = 500;
    while (true) {
      const batch = await db.Ranking.filter({ game_id: gameId }, orderBy, PAGE, skip);
      all = [...all, ...batch];
      if (batch.length < PAGE) break;
      skip += PAGE;
    }
    return all;
  };

  const loadRankings = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      console.log('🔄 טוען דירוג עבור משחק:', currentGame.id, currentGame.game_name);

      // ✅ טעינה עם pagination מלאה
      const rankingsData = await loadAllRankings(currentGame.id, '-current_score');

      if (rankingsData && rankingsData.length > 0) {
        console.log(`✅ ${rankingsData.length} משתתפים בדירוג מהטבלה`);
        let position = 1;
        for (let i = 0; i < rankingsData.length; i++) {
          if (i > 0 && rankingsData[i].current_score !== rankingsData[i-1].current_score) position = i + 1;
          rankingsData[i].current_position = position;
        }
        setRankings(rankingsData);
        const scores = rankingsData.map(r => r.current_score);
        setAvgScore(scores.reduce((a,b) => a+b, 0) / scores.length);
        setMaxScore(Math.max(...scores));
        setMinScore(Math.min(...scores));
      } else {
        console.log('⚠️ טבלת rankings ריקה');
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

  const handleSetBaseline = async () => {
    if (!currentGame) return;
    if (!window.confirm('📌 האם לקבוע את הדירוג הנוכחי כנקודת ייחוס?\n\nהחישוב הבא יציג שינויים ביחס לנקודה זו.')) return;

    setSettingBaseline(true);
    try {
      console.log("📌 קובע נקודת ייחוס...");
      // ✅ גם כאן pagination מלאה
      const allRankings = await loadAllRankings(currentGame.id, null);
      const now = new Date().toISOString();
      console.log(`⏳ מעדכן ${allRankings.length} רשומות...`);

      for (let i = 0; i < allRankings.length; i += 2) {
        const batch = allRankings.slice(i, i + 2);
        await Promise.all(batch.map(ranking =>
          db.Ranking.update(ranking.id, {
            baseline_score: ranking.current_score,
            baseline_position: ranking.current_position,
            last_baseline_set: now
          })
        ));
        await new Promise(resolve => setTimeout(resolve, 500));
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
      const BATCH4 = 5000;
      let allQuestions = [];
      let questionSkip = 0;
      while (true) {
        const batch = await db.Question.filter({ game_id: currentGame.id }, null, BATCH4, questionSkip);
        allQuestions = [...allQuestions, ...batch];
        if (batch.length < BATCH4) break;
        questionSkip += BATCH4;
      }

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

      allQuestions = allQuestions.filter(q => q.table_id && q.table_id !== 'T1');
      const allTeams = currentGame.teams_data || [];
      const teamsMap = allTeams.reduce((acc, t) => { acc[t.name] = t; return acc; }, {});

      allQuestions.forEach(q => {
        if (!q.home_team && !q.away_team && q.question_text) {
          let teams = null;
          if (q.question_text.includes(' נגד ')) teams = q.question_text.split(' נגד ').map(t => t.trim());
          else if (q.question_text.includes(' - ')) teams = q.question_text.split(' - ').map(t => t.trim());
          if (teams && teams.length === 2) { q.home_team = teams[0]; q.away_team = teams[1]; }
        }
      });

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
          home_team_display: question.home_team ? question.home_team.replace(/\s*\([^)]+\)\s*$/, '').trim() : null,
          away_team_display: question.away_team ? question.away_team.replace(/\s*\([^)]+\)\s*$/, '').trim() : null,
          home_team_logo: question.home_team ? (teamsMap[question.home_team]?.logo_url || teamsMap[question.home_team.replace(/\s*\([^)]+\)\s*$/, '').trim()]?.logo_url) : null,
          away_team_logo: question.away_team ? (teamsMap[question.away_team]?.logo_url || teamsMap[question.away_team.replace(/\s*\([^)]+\)\s*$/, '').trim()]?.logo_url) : null,
          isBonus: item.isBonus || false
        };
      }).filter(s => s !== null);

      const filteredScores = enrichedScores.filter(s => s.score > 0);
      filteredScores.sort((a, b) => {
        const tableA = parseInt(a.table_id.replace('T', '')) || 999;
        const tableB = parseInt(b.table_id.replace('T', '')) || 999;
        if (tableA !== tableB) return tableA - tableB;
        return (parseFloat(a.question_id_display) || 999) - (parseFloat(b.question_id_display) || 999);
      });

      const rankingEntry = rankings.find(r => r.participant_name === participantName);
      const displayScore = rankingEntry ? rankingEntry.current_score : totalScore;

      setParticipantDetails({ name: participantName, scores: filteredScores, totalScore: displayScore });
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
      setSortDirection(['current_score', 'previous_score', 'score_change', 'position_change'].includes(column) ? 'desc' : 'asc');
    }
  };

  const getSortedRankings = () => {
    const sorted = [...rankings];
    sorted.sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      if (sortColumn === 'participant_name') {
        aVal = String(aVal || '');
        bVal = String(bVal || '');
        return sortDirection === 'asc' ? aVal.localeCompare(bVal, 'he') : bVal.localeCompare(aVal, 'he');
      }
      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  };

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-2.5 h-2.5 md:w-4 md:h-4 opacity-30" />;
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

  const isAdmin = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';
  const sortedRankings = getSortedRankings();

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
                  <><Loader2 className="w-3 h-3 md:w-5 md:h-5 animate-spin ml-1 md:ml-2" />קובע...</>
                ) : (
                  <><CheckCircle className="w-3 h-3 md:w-5 md:h-5 ml-1 md:ml-2" />קבע דירוג</>
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
                    {[
                      { key: 'current_position', label: '#', className: 'text-center' },
                      { key: 'participant_name', label: 'שם', className: 'text-right' },
                      { key: 'current_score', label: "נק'", className: 'text-center' },
                      { key: 'previous_position', label: 'מיקום קודם', className: 'text-center hidden md:table-cell' },
                      { key: 'previous_score', label: 'ניקוד קודם', className: 'text-center hidden md:table-cell' },
                      { key: 'score_change', label: 'שינוי בניקוד', labelMobile: '+/-', className: 'text-center' },
                      { key: 'position_change', label: 'שינוי במיקום', labelMobile: '↕', className: 'text-center' },
                    ].map(col => (
                      <th
                        key={col.key}
                        className={`${col.className} p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm`}
                        style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                        onClick={() => handleSort(col.key)}
                      >
                        <div className={`flex items-center ${col.className.includes('right') ? 'justify-start' : 'justify-center'} gap-0.5 md:gap-2`}>
                          <span className={col.labelMobile ? 'hidden md:inline' : ''}>{col.label}</span>
                          {col.labelMobile && <span className="md:hidden">{col.labelMobile}</span>}
                          <SortIcon column={col.key} />
                        </div>
                      </th>
                    ))}
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
                          {rank.score_change > 0 && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2 py-0 md:py-0.5" style={{ background: '#10b981' }}>+{rank.score_change}</Badge>}
                          {rank.score_change < 0 && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2 py-0 md:py-0.5" style={{ background: '#ef4444' }}>{rank.score_change}</Badge>}
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

      {/* Participant detail dialog */}
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
                  {['טבלה','מס׳','שאלה','ניחוש','תוצאה','ניקוד'].map(h => (
                    <th key={h} className="text-center p-2 text-xs" style={{ backgroundColor: '#0f172a', color: '#94a3b8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participantDetails?.scores.map((s, index) => {
                  const displayText = s.home_team && s.away_team ? `${s.home_team} - ${s.away_team}` : s.question_text;
                  let badgeColor = 'bg-slate-600 text-white';
                  if (s.score === s.max_score && s.max_score > 0) badgeColor = 'bg-green-600 text-white';
                  else if (s.score === 0) badgeColor = 'bg-red-600 text-white';
                  else if (s.score >= 7) badgeColor = 'bg-blue-600 text-white';
                  else if (s.score > 0) badgeColor = 'bg-yellow-500 text-white';

                  return (
                    <tr key={index} className="transition-colors hover:bg-cyan-500/10" style={{ backgroundColor: '#1e293b' }}>
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
                            <span>{s.home_team_display || s.home_team}</span>
                            {s.home_team_logo && <img src={s.home_team_logo} alt={s.home_team} className="w-4 h-4 rounded-full" onError={(e) => e.target.style.display='none'} />}
                            <span>-</span>
                            {s.away_team_logo && <img src={s.away_team_logo} alt={s.away_team} className="w-4 h-4 rounded-full" onError={(e) => e.target.style.display='none'} />}
                            <span>{s.away_team_display || s.away_team}</span>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: '#f8fafc' }}>{displayText}</span>
                        )}
                      </td>
                      <td className="text-center p-1.5"><span className="font-medium text-xs" style={{ color: '#94a3b8' }}>{s.prediction || '-'}</span></td>
                      <td className="text-center p-1.5"><span className="font-medium text-xs" style={{ color: '#f8fafc' }}>{s.actual_result || '-'}</span></td>
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
    </div>
  );
}
