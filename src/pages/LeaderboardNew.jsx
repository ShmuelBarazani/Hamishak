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
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: { user } } = await supabase.auth.getUser();
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
      return score.split('-').map(x => x.trim()).join(' - ');
    }
    return score;
  };

  // ── Helper: load all rankings (supabase direct) ───────────────────────────
  const loadAllRankings = async (gameId, orderBy = '-current_score') => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      let query = supabase.from('rankings').select('*').eq('game_id', gameId).range(from, from + PAGE - 1);
      if (orderBy === '-current_score') query = query.order('current_score', { ascending: false });
      else if (orderBy) query = query.order(orderBy.replace('-',''), { ascending: !orderBy.startsWith('-') });
      const { data, error } = await query;
      if (error) { console.error('rankings fetch error:', error); break; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  // ── Helper: load all questions (supabase direct) ──────────────────────────
  const loadAllQuestions = async (gameId) => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('questions').select('*').eq('game_id', gameId).range(from, from + PAGE - 1);
      if (error) { console.error('questions fetch error:', error); break; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all.filter(q => q.table_id && q.table_id !== 'T1');
  };

  // ── Helper: load all predictions (supabase direct) ────────────────────────
  const loadAllPredictions = async (gameId, participantName = null) => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      let query = supabase.from('predictions').select('*').eq('game_id', gameId).range(from, from + PAGE - 1);
      if (participantName) query = query.eq('participant_name', participantName);
      const { data, error } = await query;
      if (error) { console.error('predictions fetch error:', error); break; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      console.log('   ניחושים סה"כ:', all.length);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  // ── Helper: calculate score for one participant ────────────────────────────
  const calcScore = (allQuestions, predictions) => {
    const latest = {};
    predictions.forEach(pred => {
      const ex = latest[pred.question_id];
      if (!ex || new Date(pred.created_at) > new Date(ex.created_at)) {
        latest[pred.question_id] = pred;
      }
    });
    const predMap = {};
    for (const [qid, pred] of Object.entries(latest)) {
      predMap[qid] = pred.text_prediction;
    }
    return calculateTotalScore(allQuestions, predMap);
  };

  // ── Load rankings from DB ──────────────────────────────────────────────────
  const loadRankings = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      const rankingsData = await loadAllRankings(currentGame.id, '-current_score');
      console.log(`✅ ${rankingsData.length} משתתפים בדירוג`);

      if (rankingsData.length > 0) {
        // הוסף מיקומים
        let position = 1;
        for (let i = 0; i < rankingsData.length; i++) {
          if (i > 0 && rankingsData[i].current_score !== rankingsData[i-1].current_score) position = i + 1;
          rankingsData[i].current_position = position;
        }
        setRankings(rankingsData);
        const scores = rankingsData.map(r => Number(r.current_score) || 0);
        setAvgScore(scores.reduce((a,b) => a+b, 0) / scores.length);
        setMaxScore(Math.max(...scores));
        setMinScore(Math.min(...scores));
      } else {
        setRankings([]);
      }
    } catch (error) {
      console.error("Error loading rankings:", error);
      toast({ title: "שגיאה", description: "טעינת הדירוג נכשלה", variant: "destructive" });
    }
    setLoading(false);
  }, [currentGame, toast]);

  useEffect(() => { loadRankings(); }, [loadRankings]);


  // ── Set baseline ───────────────────────────────────────────────────────────
  const handleSetBaseline = async () => {
    if (!currentGame) return;
    if (!window.confirm('📌 האם לקבוע את הדירוג הנוכחי כנקודת ייחוס?\n\nהחישוב הבא יציג שינויים ביחס לנקודה זו.')) return;

    setSettingBaseline(true);
    try {
      const allRankings = await loadAllRankings(currentGame.id, null);
      const now = new Date().toISOString();

      for (let i = 0; i < allRankings.length; i += 5) {
        const batch = allRankings.slice(i, i + 5);
        await Promise.all(batch.map(r =>
          db.Ranking.update(r.id, {
            baseline_score: r.current_score,
            baseline_position: r.current_position,
            last_baseline_set: now
          })
        ));
        await new Promise(r => setTimeout(r, 300));
      }

      toast({
        title: "נקודת ייחוס נקבעה!",
        description: `${allRankings.length} משתתפים עודכנו`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });
      await loadRankings();
    } catch (error) {
      console.error("Error setting baseline:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    }
    setSettingBaseline(false);
  };

  // ── Load participant details (popup) ───────────────────────────────────────
  const loadParticipantDetails = async (participantName) => {
    if (!currentGame) return;
    try {
      const allQuestions = await loadAllQuestions(currentGame.id);
      const allPredictions = await loadAllPredictions(currentGame.id, participantName);

      const allTeams = currentGame.teams_data || [];
      const teamsMap = allTeams.reduce((acc, t) => { acc[t.name] = t; return acc; }, {});

      const { total: totalScore, breakdown } = calcScore(allQuestions, allPredictions);

      const enriched = breakdown.map(item => {
        const q = allQuestions.find(x => x.id === item.question_id);
        if (!q) return null;
        const pred = allPredictions.find(p => p.question_id === item.question_id);
        return {
          score: item.score,
          max_score: item.max_score,
          table_id: item.table_id || '?',
          question_id_display: item.question_id_text || q.question_id || '?',
          question_text: q.question_text || '',
          home_team: q.home_team,
          away_team: q.away_team,
          actual_result: formatScore(q.actual_result || ''),
          prediction: formatScore(pred?.text_prediction || ''),
          home_team_display: q.home_team?.replace(/\s*\([^)]+\)\s*$/, '').trim() || null,
          away_team_display: q.away_team?.replace(/\s*\([^)]+\)\s*$/, '').trim() || null,
          home_team_logo: q.home_team ? (teamsMap[q.home_team]?.logo_url || teamsMap[q.home_team.replace(/\s*\([^)]+\)\s*$/, '').trim()]?.logo_url) : null,
          away_team_logo: q.away_team ? (teamsMap[q.away_team]?.logo_url || teamsMap[q.away_team.replace(/\s*\([^)]+\)\s*$/, '').trim()]?.logo_url) : null,
        };
      }).filter(s => s !== null && s.score > 0);

      enriched.sort((a, b) => {
        const tA = parseInt(a.table_id.replace('T', '')) || 999;
        const tB = parseInt(b.table_id.replace('T', '')) || 999;
        if (tA !== tB) return tA - tB;
        return (parseFloat(a.question_id_display) || 999) - (parseFloat(b.question_id_display) || 999);
      });

      // ✅ תמיד משתמש בניקוד המחושב, לא בזה שב-DB
      setParticipantDetails({ name: participantName, scores: enriched, totalScore });
      setSelectedParticipant(participantName);
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "שגיאה", description: "טעינת הפרטים נכשלה", variant: "destructive" });
    }
  };

  // ── Sort ───────────────────────────────────────────────────────────────────
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(['current_score','previous_score','score_change','position_change'].includes(column) ? 'desc' : 'asc');
    }
  };

  const getSortedRankings = () => {
    return [...rankings].sort((a, b) => {
      if (sortColumn === 'participant_name') {
        const aV = String(a.participant_name || '');
        const bV = String(b.participant_name || '');
        return sortDirection === 'asc' ? aV.localeCompare(bV, 'he') : bV.localeCompare(aV, 'he');
      }
      const aV = Number(a[sortColumn]) || 0;
      const bV = Number(b[sortColumn]) || 0;
      return sortDirection === 'asc' ? aV - bV : bV - aV;
    });
  };

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-2.5 h-2.5 md:w-4 md:h-4 opacity-30" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-2.5 h-2.5 md:w-4 md:h-4" style={{ color: 'var(--tp)' }} />
      : <ArrowDown className="w-2.5 h-2.5 md:w-4 md:h-4" style={{ color: 'var(--tp)' }} />;
  };

  const getPositionIcon = (p) => {
    if (p === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (p === 2) return <Trophy className="w-5 h-5 text-gray-400" />;
    if (p === 3) return <Trophy className="w-5 h-5 text-orange-400" />;
    return null;
  };

  const getPositionChangeIcon = (c) => {
    if (c > 0) return <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-green-400" />;
    if (c < 0) return <TrendingDown className="w-3 h-3 md:w-4 md:h-4 text-red-400" />;
    return <Minus className="w-3 h-3 md:w-4 md:h-4 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{
        background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--tp)' }} />
        <span className="mr-3" style={{ color: 'var(--tp)' }}>טוען דירוג...</span>
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';
  const sortedRankings = getSortedRankings();

  return (
    <div className="min-h-screen p-3 md:p-6" dir="rtl" style={{
      background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)'
    }}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-3 mb-4 md:mb-8">
          <div>
            <h1 className="text-xl md:text-4xl font-bold mb-1 md:mb-2 flex items-center gap-2 md:gap-3" style={{
              color: '#f8fafc', textShadow: '0 0 10px var(--tp-30)'
            }}>
              <Trophy className="w-6 h-6 md:w-10 md:h-10" style={{ color: 'var(--tp)' }} />
              טבלת דירוג
            </h1>
            <p className="text-xs md:text-base" style={{ color: '#94a3b8' }}>מצב העמידה הנוכחי של המשתתפים</p>
          </div>

          {isAdmin && (
            <div className="flex gap-2 md:gap-3 w-full md:w-auto flex-wrap">

              {/* כפתור קבע דירוג */}
              <Button
                onClick={handleSetBaseline}
                disabled={settingBaseline}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
                }}
                className="text-white flex-1 md:flex-none h-8 md:h-10 text-[10px] md:text-sm"
              >
                {settingBaseline ? (
                  <><Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin ml-1" />קובע...</>
                ) : (
                  <><CheckCircle className="w-3 h-3 md:w-4 md:h-4 ml-1" />קבע דירוג</>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
          {[
            { label: 'סה"כ משתתפים', value: rankings.length, icon: Users, color: 'var(--tp)' },
            { label: 'ניקוד ממוצע', value: avgScore.toFixed(1), icon: Target, color: 'var(--tp)' },
            { label: 'ניקוד מקסימלי', value: maxScore.toFixed(1), icon: TrendingUp, color: '#8b5cf6' },
            { label: 'ניקוד מינימלי', value: minScore.toFixed(1), icon: TrendingDown, color: '#94a3b8' }
          ].map((stat, idx) => (
            <Card key={idx} style={{
              background: 'var(--bg3-60)',
              border: '1px solid var(--tp-20)',
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

        {/* Table */}
        <Card style={{
          background: 'var(--bg3-60)',
          border: '1px solid var(--tp-20)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader className="py-2 md:py-4">
            <CardTitle className="text-sm md:text-lg" style={{ color: 'var(--tp)' }}>הדירוג הנוכחי</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div style={{ maxHeight: '600px', overflow: 'auto' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg3)' }}>
                  <tr style={{ borderBottom: '2px solid var(--tp-30)' }}>
                    {[
                      { key: 'current_position', label: '#', mobile: '#', align: 'center' },
                      { key: 'participant_name', label: 'שם', mobile: 'שם', align: 'right' },
                      { key: 'current_score', label: "נק'", mobile: "נק'", align: 'center' },
                      { key: 'previous_position', label: 'מיקום קודם', mobile: null, align: 'center' },
                      { key: 'previous_score', label: 'ניקוד קודם', mobile: null, align: 'center' },
                      { key: 'score_change', label: 'שינוי בניקוד', mobile: '+/-', align: 'center' },
                      { key: 'position_change', label: 'שינוי במיקום', mobile: '↕', align: 'center' },
                    ].map(col => (
                      <th
                        key={col.key}
                        className={`p-1 md:p-3 cursor-pointer hover:bg-cyan-900/20 transition-colors text-[8px] md:text-sm text-${col.align} ${col.mobile === null ? 'hidden md:table-cell' : ''}`}
                        style={{ backgroundColor: 'var(--bg3)', color: '#94a3b8' }}
                        onClick={() => handleSort(col.key)}
                      >
                        <div className={`flex items-center ${col.align === 'right' ? 'justify-start' : 'justify-center'} gap-0.5 md:gap-2`}>
                          {col.mobile !== null && col.mobile !== col.label
                            ? <><span className="hidden md:inline">{col.label}</span><span className="md:hidden">{col.mobile}</span></>
                            : <span>{col.label}</span>
                          }
                          <SortIcon column={col.key} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRankings.map((rank) => (
                    <tr key={rank.id} className="hover:bg-white/5" style={{ borderBottom: '1px solid var(--tp-10)' }}>
                      <td className="text-center p-1 md:p-2">
                        <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                          <span className="hidden md:inline">{getPositionIcon(rank.current_position)}</span>
                          <span className="font-bold text-xs md:text-base" style={{ color: '#f8fafc' }}>{rank.current_position}</span>
                        </div>
                      </td>
                      <td
                        className="font-medium text-[10px] md:text-base cursor-pointer hover:underline text-right p-1 md:p-2"
                        style={{ color: 'var(--tp)' }}
                        onClick={() => loadParticipantDetails(rank.participant_name)}
                      >
                        {rank.participant_name}
                      </td>
                      <td className="text-center p-1 md:p-2">
                        <Badge className="text-white text-[10px] md:text-base px-1.5 md:px-3 py-0.5 md:py-1"
                          style={{ background: 'var(--tp)', boxShadow: '0 0 10px var(--tp-40)' }}>
                          {rank.current_score}
                        </Badge>
                      </td>
                      <td className="hidden md:table-cell text-center p-1 md:p-2 text-sm" style={{ color: '#94a3b8' }}>{rank.previous_position || '-'}</td>
                      <td className="hidden md:table-cell text-center p-1 md:p-2 text-sm" style={{ color: '#94a3b8' }}>{rank.previous_score || '0'}</td>
                      <td className="text-center p-1 md:p-2">
                        <div className="flex items-center justify-center">
                          {rank.score_change > 0 && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2" style={{ background: '#10b981' }}>+{rank.score_change}</Badge>}
                          {rank.score_change < 0 && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2" style={{ background: '#ef4444' }}>{rank.score_change}</Badge>}
                          {(!rank.score_change || rank.score_change === 0) && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2" style={{ background: '#475569' }}>0</Badge>}
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
          background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg3) 100%)',
          border: '1px solid var(--tp-20)',
          boxShadow: '0 0 30px var(--tp-30)'
        }} dir="rtl">
          <DialogHeader className="flex-shrink-0 pb-2 md:pb-4" style={{ borderBottom: '1px solid var(--tp-30)' }}>
            <DialogTitle className="text-base md:text-2xl font-bold text-right" style={{ color: '#f8fafc' }}>
              {participantDetails?.name}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1 md:mt-2">
              <Badge className="text-white text-xs md:text-lg px-2 md:px-4 py-1 md:py-2 rounded-full" style={{ background: 'var(--tp)' }}>
                סה"כ: {participantDetails?.totalScore} נקודות
              </Badge>
              <span className="text-[10px] md:text-base" style={{ color: '#94a3b8' }}>
                {participantDetails?.scores?.length || 0} שאלות עם ניקוד
              </span>
            </div>
          </DialogHeader>
          <div className="flex-1" style={{ overflow: 'auto' }}>
            <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg1)' }}>
                <tr>
                  {['טבלה','מס׳','שאלה','ניחוש','תוצאה','ניקוד'].map(h => (
                    <th key={h} className="text-center p-2 text-xs" style={{ backgroundColor: 'var(--bg1)', color: '#94a3b8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participantDetails?.scores?.map((s, i) => {
                  let badgeColor = 'bg-slate-600 text-white';
                  if (s.score === s.max_score && s.max_score > 0) badgeColor = 'bg-green-600 text-white';
                  else if (s.score >= 7) badgeColor = 'bg-blue-600 text-white';
                  else if (s.score > 0) badgeColor = 'bg-yellow-500 text-white';

                  return (
                    <tr key={i} className="hover:bg-white/5" style={{ backgroundColor: 'var(--bg3)' }}>
                      <td className="text-center p-1.5">
                        <Badge variant="outline" className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{ borderColor: 'var(--tp)', color: 'var(--tp)', background: 'var(--tp-10)' }}>
                          {s.table_id}
                        </Badge>
                      </td>
                      <td className="text-center p-1.5">
                        <Badge variant="outline" className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{ borderColor: 'var(--tp)', color: 'var(--tp)', background: 'var(--tp-10)' }}>
                          {s.question_id_display}
                        </Badge>
                      </td>
                      <td className="text-right p-1.5">
                        {s.home_team && s.away_team ? (
                          <div className="flex items-center gap-1 text-xs" style={{ color: '#f8fafc' }}>
                            <span>{s.home_team_display || s.home_team}</span>
                            {s.home_team_logo && <img src={s.home_team_logo} alt="" className="w-4 h-4 rounded-full" onError={e => e.target.style.display='none'} />}
                            <span>-</span>
                            {s.away_team_logo && <img src={s.away_team_logo} alt="" className="w-4 h-4 rounded-full" onError={e => e.target.style.display='none'} />}
                            <span>{s.away_team_display || s.away_team}</span>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: '#f8fafc' }}>{s.question_text}</span>
                        )}
                      </td>
                      <td className="text-center p-1.5"><span className="text-xs" style={{ color: '#94a3b8' }}>{s.prediction || '-'}</span></td>
                      <td className="text-center p-1.5"><span className="text-xs" style={{ color: '#f8fafc' }}>{s.actual_result || '-'}</span></td>
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
