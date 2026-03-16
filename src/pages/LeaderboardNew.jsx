import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Trophy, Loader2, Crown, TrendingUp, TrendingDown, Minus,
  Users, Target, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";
import { calculateTotalScore } from "@/components/scoring/ScoreService";

export default function LeaderboardNew() {
  const [rankings,           setRankings          ] = useState([]);
  const [loading,            setLoading           ] = useState(true);
  const [settingBaseline,    setSettingBaseline   ] = useState(false);
  const [selectedParticipant,setSelectedParticipant] = useState(null);
  const [participantDetails, setParticipantDetails ] = useState(null);
  const [loadingDetails,     setLoadingDetails    ] = useState(false);
  const [currentUser,        setCurrentUser       ] = useState(null);
  const [avgScore,           setAvgScore          ] = useState(0);
  const [maxScore,           setMaxScore          ] = useState(0);
  const [minScore,           setMinScore          ] = useState(0);
  const [sortColumn,         setSortColumn        ] = useState('current_position');
  const [sortDirection,      setSortDirection     ] = useState('asc');
  const { toast }       = useToast();
  const { currentGame } = useGame();

  // ─── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: { user } } = await supabase.auth.getUser();
          setCurrentUser(user);
        } else setCurrentUser(null);
      } catch { setCurrentUser(null); }
    };
    loadUser();
  }, []);

  const formatScore = (score) => {
    if (!score || score === '__CLEAR__') return '';
    return score.includes('-')
      ? score.split('-').map(x => x.trim()).join(' - ')
      : score;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  DB HELPERS — STRICT GAME ISOLATION
  //  כל פונקציה מסננת אך ורק לפי game_id הנוכחי.
  //  אין cross-game fallback — אם שאלה לא קיימת במשחק הנוכחי היא לא מופיעה.
  // ═══════════════════════════════════════════════════════════════════════════

  /** דירוג — מסונן לפי game_id בלבד */
  const loadAllRankings = async (gameId, orderBy = '-current_score') => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      let q = supabase
        .from('rankings').select('*')
        .eq('game_id', gameId)
        .range(from, from + PAGE - 1);
      if (orderBy === '-current_score')
        q = q.order('current_score', { ascending: false });
      else if (orderBy)
        q = q.order(orderBy.replace('-', ''), { ascending: !orderBy.startsWith('-') });
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  /**
   * שאלות — מסונן לפי game_id בלבד, ללא שום fallback למשחק אחר.
   * אם שאלות T14-T19 לא קיימות במשחק הנוכחי — הן לא מופיעות.
   */
  const loadQuestionsForGame = async (gameId) => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('questions').select('*')
        .eq('game_id', gameId)
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    // סנן T1 (פרטי משתתף) — לא שאלות ניקוד
    return all.filter(q => q.table_id && q.table_id !== 'T1');
  };

  /**
   * ניחושים — מסונן לפי game_id + participant_name.
   * מחזיר רק ניחושים ששייכים לשאלות המשחק הנוכחי (allQuestions).
   *
   * הגנה כפולה:
   *   1. סינון לפי game_id בשאילתת ה-DB
   *   2. סינון לפי question_id ידוע (מה-allQuestions) בצד הלקוח
   */
  const loadPredictionsForGame = async (gameId, participantName, allQuestions) => {
    const knownQuestionIds = new Set(allQuestions.map(q => q.id));

    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('predictions').select('*')
        .eq('game_id', gameId)
        .eq('participant_name', participantName)
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // הגנה נוספת: השאר רק ניחושים לשאלות הידועות של המשחק הנוכחי
    return all.filter(p => knownQuestionIds.has(p.question_id));
  };

  /**
   * חישוב ניקוד — תיקון קריטי:
   * שאלות משחק מאוחסנות ב-home_prediction + away_prediction (לא text_prediction).
   * predMap חייב לטפל בשניהם.
   */
  const calcScore = (allQuestions, predictions) => {
    // dedup — קח רק את הניחוש האחרון לכל שאלה
    const latest = {};
    predictions.forEach(pred => {
      const ex = latest[pred.question_id];
      if (!ex || new Date(pred.created_at) > new Date(ex.created_at))
        latest[pred.question_id] = pred;
    });

    const predMap = {};
    for (const [qid, pred] of Object.entries(latest)) {
      if (
        pred.home_prediction !== null && pred.home_prediction !== undefined &&
        pred.away_prediction !== null && pred.away_prediction !== undefined
      ) {
        // ✅ שאלות משחק: פורמט "X-Y" כמו ViewSubmissions
        predMap[qid] = `${pred.home_prediction}-${pred.away_prediction}`;
      } else {
        predMap[qid] = pred.text_prediction;
      }
    }

    return calculateTotalScore(allQuestions, predMap);
  };

  // ─── Load rankings list ────────────────────────────────────────────────────
  const loadRankings = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      const rankingsData = await loadAllRankings(currentGame.id, '-current_score');
      if (rankingsData.length > 0) {
        let position = 1;
        for (let i = 0; i < rankingsData.length; i++) {
          if (i > 0 && rankingsData[i].current_score !== rankingsData[i - 1].current_score)
            position = i + 1;
          rankingsData[i].current_position = position;
        }
        setRankings(rankingsData);
        const scores = rankingsData.map(r => Number(r.current_score) || 0);
        setAvgScore(scores.reduce((a, b) => a + b, 0) / scores.length);
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

  // ─── Set baseline ──────────────────────────────────────────────────────────
  const handleSetBaseline = async () => {
    if (!currentGame) return;
    if (!window.confirm(
      '📌 האם לקבוע את הדירוג הנוכחי כנקודת ייחוס?\n\nהחישוב הבא יציג שינויים ביחס לנקודה זו.'
    )) return;
    setSettingBaseline(true);
    try {
      const allRankings = await loadAllRankings(currentGame.id, null);
      const now = new Date().toISOString();
      for (let i = 0; i < allRankings.length; i += 5) {
        const batch = allRankings.slice(i, i + 5);
        await Promise.all(batch.map(r =>
          db.Ranking.update(r.id, {
            baseline_score:    r.current_score,
            baseline_position: r.current_position,
            last_baseline_set: now,
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

  // ─── Load participant popup ────────────────────────────────────────────────
  const loadParticipantDetails = async (participantName) => {
    if (!currentGame) return;

    // פתח dialog מיד עם spinner
    setSelectedParticipant(participantName);
    setParticipantDetails(null);
    setLoadingDetails(true);

    try {
      // ═══ הפרדה מלאה: רק שאלות המשחק הנוכחי ═══
      const allQuestions = await loadQuestionsForGame(currentGame.id);

      // ═══ רק ניחושים של המשחק הנוכחי ═══
      const allPredictions = await loadPredictionsForGame(
        currentGame.id, participantName, allQuestions
      );

      const allTeams = currentGame.teams_data || [];
      const teamsMap = allTeams.reduce((acc, t) => { acc[t.name] = t; return acc; }, {});

      // ═══ חישוב ניקוד עם home/away תיקון ═══
      const { total: totalScore, breakdown } = calcScore(allQuestions, allPredictions);

      // ─── בניית breakdown לתצוגה ───────────────────────────────────────────
      const LOCATION_TABLE_IDS = ['T14', 'T15', 'T16', 'T17', 'T19'];
      const LOCATION_DEFAULTS = {
        T14: 'מקומות 1-8 — שלב הבתים',
        T15: 'מקומות 9-16 — שלב הבתים',
        T16: 'מקומות 17-24 — שלב הבתים',
        T17: 'מקומות 1-24 — טבלה כוללת',
        T19: 'רשימת העולות לשמינית הגמר',
      };
      const locationTableDescriptions = { ...LOCATION_DEFAULTS };
      allQuestions.forEach(q => {
        if (LOCATION_TABLE_IDS.includes(q.table_id) && q.table_description?.trim())
          locationTableDescriptions[q.table_id] = q.table_description.trim();
      });

      // dedup predictions לצורך הצגת ניחוש
      const latestPredByQId = {};
      allPredictions.forEach(p => {
        const ex = latestPredByQId[p.question_id];
        if (!ex || new Date(p.created_at) > new Date(ex.created_at))
          latestPredByQId[p.question_id] = p;
      });

      const getPredDisplay = (questionId) => {
        const pred = latestPredByQId[questionId];
        if (!pred) return '';
        if (pred.home_prediction !== null && pred.home_prediction !== undefined &&
            pred.away_prediction !== null && pred.away_prediction !== undefined)
          return formatScore(`${pred.home_prediction}-${pred.away_prediction}`);
        return formatScore(pred.text_prediction || '');
      };

      const locationSums     = {};
      const regularBreakdown = [];

      breakdown.forEach(item => {
        if (LOCATION_TABLE_IDS.includes(item.table_id)) {
          if (!locationSums[item.table_id]) locationSums[item.table_id] = 0;
          locationSums[item.table_id] += item.score;
        } else if (item.score > 0) {
          const q = allQuestions.find(x => x.id === item.question_id);
          if (!q) return;
          regularBreakdown.push({
            score:               item.score,
            max_score:           item.max_score,
            table_id:            item.table_id || '?',
            question_id_display: item.question_id_text || q.question_id || '?',
            question_text:       q.question_text || '',
            home_team:           q.home_team,
            away_team:           q.away_team,
            actual_result:       formatScore(q.actual_result || ''),
            prediction:          getPredDisplay(item.question_id),
            home_team_display:   q.home_team?.replace(/\s*\([^)]+\)\s*$/, '').trim() || null,
            away_team_display:   q.away_team?.replace(/\s*\([^)]+\)\s*$/, '').trim() || null,
            home_team_logo:      q.home_team
              ? (teamsMap[q.home_team]?.logo_url || teamsMap[q.home_team.replace(/\s*\([^)]+\)\s*$/, '').trim()]?.logo_url)
              : null,
            away_team_logo:      q.away_team
              ? (teamsMap[q.away_team]?.logo_url || teamsMap[q.away_team.replace(/\s*\([^)]+\)\s*$/, '').trim()]?.logo_url)
              : null,
            isLocationSummary: false,
          });
        }
      });

      const locationRows = Object.entries(locationSums)
        .filter(([, s]) => s > 0)
        .map(([tid, s]) => ({
          score: s, max_score: null, table_id: tid,
          question_id_display: '',
          question_text: locationTableDescriptions[tid] || tid,
          home_team: null, away_team: null, actual_result: '', prediction: '',
          home_team_display: null, away_team_display: null,
          home_team_logo: null, away_team_logo: null,
          isLocationSummary: true,
        }));

      const enriched = [...regularBreakdown, ...locationRows];
      enriched.sort((a, b) => {
        const tA = parseInt(a.table_id.replace('T', '')) || 999;
        const tB = parseInt(b.table_id.replace('T', '')) || 999;
        if (tA !== tB) return tA - tB;
        return (parseFloat(a.question_id_display) || 999) - (parseFloat(b.question_id_display) || 999);
      });

      setParticipantDetails({ name: participantName, scores: enriched, totalScore });
    } catch (error) {
      console.error("Error loading participant details:", error);
      toast({ title: "שגיאה", description: "טעינת הפרטים נכשלה", variant: "destructive" });
    }
    setLoadingDetails(false);
  };

  // ─── Sort ──────────────────────────────────────────────────────────────────
  const handleSort = (column) => {
    if (sortColumn === column) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setSortColumn(column);
      setSortDirection(
        ['current_score','previous_score','score_change','position_change'].includes(column)
          ? 'desc' : 'asc'
      );
    }
  };

  const getSortedRankings = () => [...rankings].sort((a, b) => {
    if (sortColumn === 'participant_name') {
      const aV = String(a.participant_name || '');
      const bV = String(b.participant_name || '');
      return sortDirection === 'asc' ? aV.localeCompare(bV, 'he') : bV.localeCompare(aV, 'he');
    }
    const aV = Number(a[sortColumn]) || 0;
    const bV = Number(b[sortColumn]) || 0;
    return sortDirection === 'asc' ? aV - bV : bV - aV;
  });

  const SortIcon = ({ column }) => {
    if (sortColumn !== column)
      return <ArrowUpDown className="w-2.5 h-2.5 md:w-4 md:h-4 opacity-30" />;
    return sortDirection === 'asc'
      ? <ArrowUp   className="w-2.5 h-2.5 md:w-4 md:h-4" style={{ color: 'var(--tp)' }} />
      : <ArrowDown className="w-2.5 h-2.5 md:w-4 md:h-4" style={{ color: 'var(--tp)' }} />;
  };

  const getPositionIcon = (p) => {
    if (p === 1) return <Crown  className="w-5 h-5 text-yellow-400" />;
    if (p === 2) return <Trophy className="w-5 h-5 text-gray-400" />;
    if (p === 3) return <Trophy className="w-5 h-5 text-orange-400" />;
    return null;
  };

  const getPositionChangeIcon = (c) => {
    if (c > 0) return <TrendingUp   className="w-3 h-3 md:w-4 md:h-4 text-green-400" />;
    if (c < 0) return <TrendingDown className="w-3 h-3 md:w-4 md:h-4 text-red-400" />;
    return          <Minus         className="w-3 h-3 md:w-4 md:h-4 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen"
        style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--tp)' }} />
        <span className="mr-3" style={{ color: 'var(--tp)' }}>טוען דירוג...</span>
      </div>
    );
  }

  const isAdmin        = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';
  const sortedRankings = getSortedRankings();

  return (
    <div className="min-h-screen p-3 md:p-6" dir="rtl"
      style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)' }}>
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-3 mb-4 md:mb-8">
          <div>
            <h1 className="text-xl md:text-4xl font-bold mb-1 md:mb-2 flex items-center gap-2 md:gap-3"
              style={{ color: '#f8fafc', textShadow: '0 0 10px var(--tp-30)' }}>
              <Trophy className="w-6 h-6 md:w-10 md:h-10" style={{ color: 'var(--tp)' }} />
              טבלת דירוג
            </h1>
            <p className="text-xs md:text-base" style={{ color: '#94a3b8' }}>
              מצב העמידה הנוכחי של המשתתפים
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2 md:gap-3 w-full md:w-auto flex-wrap">
              <Button
                onClick={handleSetBaseline}
                disabled={settingBaseline}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 0 20px rgba(16,185,129,0.4)'
                }}
                className="text-white flex-1 md:flex-none h-8 md:h-10 text-[10px] md:text-sm"
              >
                {settingBaseline
                  ? <><Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin ml-1"/>קובע...</>
                  : <><CheckCircle className="w-3 h-3 md:w-4 md:h-4 ml-1"/>קבע דירוג</>}
              </Button>
            </div>
          )}
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
          {[
            { label: 'סה"כ משתתפים', value: rankings.length,     icon: Users,       color: 'var(--tp)' },
            { label: 'ניקוד ממוצע',   value: avgScore.toFixed(1), icon: Target,      color: 'var(--tp)' },
            { label: 'ניקוד מקסימלי', value: maxScore.toFixed(1), icon: TrendingUp,  color: '#8b5cf6'   },
            { label: 'ניקוד מינימלי', value: minScore.toFixed(1), icon: TrendingDown,color: '#94a3b8'   },
          ].map((stat, idx) => (
            <Card key={idx} style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', backdropFilter: 'blur(10px)' }}>
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

        {/* ── Rankings table ── */}
        <Card style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', backdropFilter: 'blur(10px)' }}>
          <CardHeader className="py-2 md:py-4">
            <CardTitle className="text-sm md:text-lg" style={{ color: 'var(--tp)' }}>הדירוג הנוכחי</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div style={{ maxHeight: '600px', overflow: 'auto' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg3)' }}>
                  <tr style={{ borderBottom: '2px solid var(--tp-30)' }}>
                    {[
                      { key: 'current_position', label: '#',           mobile: '#',   align: 'center' },
                      { key: 'participant_name',  label: 'שם',          mobile: 'שם',  align: 'right'  },
                      { key: 'current_score',     label: "נק'",         mobile: "נק'", align: 'center' },
                      { key: 'previous_position', label: 'מיקום קודם', mobile: null,  align: 'center' },
                      { key: 'previous_score',    label: 'ניקוד קודם', mobile: null,  align: 'center' },
                      { key: 'score_change',      label: 'שינוי בניקוד',mobile: '+/-',align: 'center' },
                      { key: 'position_change',   label: 'שינוי במיקום',mobile: '↕',  align: 'center' },
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
                            : <span>{col.label}</span>}
                          <SortIcon column={col.key} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRankings.map((rank) => (
                    <tr key={rank.id} className="hover:bg-white/5"
                      style={{ borderBottom: '1px solid var(--tp-10)' }}>
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
                          {rank.score_change > 0  && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2" style={{ background: '#10b981' }}>+{rank.score_change}</Badge>}
                          {rank.score_change < 0  && <Badge className="text-white text-[8px] md:text-xs px-1 md:px-2" style={{ background: '#ef4444' }}>{rank.score_change}</Badge>}
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

      {/* ════════════════════════════════════════════════════════════════════════
          PARTICIPANT DETAIL DIALOG — גדול יותר + פונטים גדולים
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={selectedParticipant !== null}
        onOpenChange={() => { setSelectedParticipant(null); setParticipantDetails(null); }}
      >
        <DialogContent
          dir="rtl"
          style={{
            /* ── גודל מסך ── */
            maxWidth: '92vw',
            width: '92vw',
            maxHeight: '90vh',
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            /* ── עיצוב ── */
            background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg3) 100%)',
            border: '1px solid var(--tp-20)',
            boxShadow: '0 0 40px var(--tp-30)',
            borderRadius: '16px',
            padding: '0',
          }}
        >
          {/* Header */}
          <DialogHeader style={{
            padding: '20px 28px 16px',
            borderBottom: '1px solid var(--tp-25)',
            flexShrink: 0,
          }}>
            <DialogTitle style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: '#f8fafc',
              textAlign: 'right',
              marginBottom: '10px',
            }}>
              {selectedParticipant}
            </DialogTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px' }}>
              {loadingDetails ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 style={{ width: 18, height: 18, color: 'var(--tp)', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '1rem', color: 'var(--tp)' }}>מחשב ניקוד עדכני...</span>
                </div>
              ) : (
                <>
                  <Badge style={{
                    background: 'var(--tp)',
                    color: 'white',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    padding: '6px 18px',
                    borderRadius: '999px',
                    letterSpacing: '0.02em',
                  }}>
                    סה"כ: {participantDetails?.totalScore} נקודות
                  </Badge>
                  <span style={{ fontSize: '0.95rem', color: '#94a3b8' }}>
                    {participantDetails?.scores?.length || 0} שאלות עם ניקוד
                  </span>
                </>
              )}
            </div>
          </DialogHeader>

          {/* Body — scrollable */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 8px' }}>
            {loadingDetails ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
                <Loader2 style={{ width: 36, height: 36, color: 'var(--tp)' }} className="animate-spin" />
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 5px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    {[
                      { label: 'טבלה',  width: '70px'  },
                      { label: 'מס׳',   width: '60px'  },
                      { label: 'שאלה',  width: 'auto'  },
                      { label: 'ניחוש', width: '120px' },
                      { label: 'תוצאה', width: '90px'  },
                      { label: 'ניקוד', width: '80px'  },
                    ].map(h => (
                      <th key={h.label} style={{
                        backgroundColor: 'var(--bg1)',
                        color: '#64748b',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        textAlign: 'center',
                        padding: '10px 8px',
                        letterSpacing: '0.04em',
                        width: h.width,
                        borderBottom: '1px solid var(--tp-20)',
                      }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {participantDetails?.scores?.map((s, i) => {
                    // ── שורת מיקומים ──
                    if (s.isLocationSummary) {
                      return (
                        <tr key={i} style={{
                          backgroundColor: 'rgba(249,115,22,0.09)',
                          borderRight: '3px solid #f97316',
                        }}>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <Badge style={{
                              borderRadius: '999px', padding: '3px 10px',
                              fontSize: '0.78rem', border: '1px solid #f97316',
                              color: '#f97316', background: 'rgba(249,115,22,0.12)',
                            }}>
                              {s.table_id}
                            </Badge>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>📋</td>
                          <td colSpan={3} style={{ padding: '10px 8px', textAlign: 'right' }}>
                            <span style={{ color: '#fdba74', fontSize: '0.95rem', fontWeight: 600 }}>
                              {s.question_text}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <Badge style={{
                              background: '#ea580c', color: 'white',
                              fontSize: '0.9rem', fontWeight: 700,
                              padding: '4px 12px', borderRadius: '999px',
                            }}>
                              +{s.score}
                            </Badge>
                          </td>
                        </tr>
                      );
                    }

                    // ── שורת שאלה רגילה ──
                    let badgeBg = '#475569';
                    if (s.score === s.max_score && s.max_score > 0) badgeBg = '#16a34a';
                    else if (s.score >= 7) badgeBg = '#2563eb';
                    else if (s.score > 0) badgeBg = '#ca8a04';

                    return (
                      <tr key={i} style={{
                        backgroundColor: 'rgba(30,41,59,0.55)',
                        transition: 'background 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(30,41,59,0.55)'}
                      >
                        {/* טבלה */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <Badge style={{
                            borderRadius: '999px', padding: '3px 10px',
                            fontSize: '0.78rem', border: '1px solid var(--tp)',
                            color: 'var(--tp)', background: 'var(--tp-10)',
                          }}>
                            {s.table_id}
                          </Badge>
                        </td>
                        {/* מס' שאלה */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <Badge style={{
                            borderRadius: '999px', padding: '3px 10px',
                            fontSize: '0.78rem', border: '1px solid var(--tp)',
                            color: 'var(--tp)', background: 'var(--tp-10)',
                          }}>
                            {s.question_id_display}
                          </Badge>
                        </td>
                        {/* שאלה */}
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          {s.home_team && s.away_team ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', color: '#f1f5f9' }}>
                              <span>{s.home_team_display || s.home_team}</span>
                              {s.home_team_logo && (
                                <img src={s.home_team_logo} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} onError={e => e.target.style.display='none'} />
                              )}
                              <span style={{ color: '#64748b' }}>נגד</span>
                              {s.away_team_logo && (
                                <img src={s.away_team_logo} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} onError={e => e.target.style.display='none'} />
                              )}
                              <span>{s.away_team_display || s.away_team}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.95rem', color: '#f1f5f9' }}>{s.question_text}</span>
                          )}
                        </td>
                        {/* ניחוש */}
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.95rem', color: '#94a3b8' }}>
                          {s.prediction || '—'}
                        </td>
                        {/* תוצאה */}
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.95rem', color: '#f1f5f9', fontWeight: 600 }}>
                          {s.actual_result || '—'}
                        </td>
                        {/* ניקוד */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <Badge style={{
                            background: badgeBg, color: 'white',
                            fontSize: '0.9rem', fontWeight: 700,
                            padding: '4px 12px', borderRadius: '999px',
                            minWidth: '56px', display: 'inline-block', textAlign: 'center',
                          }}>
                            {s.score}/{s.max_score}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
