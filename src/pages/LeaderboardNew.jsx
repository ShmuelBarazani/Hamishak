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
  const [rankings,            setRankings           ] = useState([]);
  const [loading,             setLoading            ] = useState(true);
  const [settingBaseline,     setSettingBaseline    ] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantDetails,  setParticipantDetails ] = useState(null);
  const [loadingDetails,      setLoadingDetails     ] = useState(false);
  const [currentUser,         setCurrentUser        ] = useState(null);
  const [avgScore,            setAvgScore           ] = useState(0);
  const [maxScore,            setMaxScore           ] = useState(0);
  const [minScore,            setMinScore           ] = useState(0);
  const [sortColumn,          setSortColumn         ] = useState('current_position');
  const [sortDirection,       setSortDirection      ] = useState('asc');
  const { toast }       = useToast();
  const { currentGame } = useGame();

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

  const loadAllRankings = async (gameId, orderBy = '-current_score') => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      let q = supabase.from('rankings').select('*')
        .eq('game_id', gameId).range(from, from + PAGE - 1);
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
    return all.filter(q => q.table_id && q.table_id !== 'T1');
  };

  const loadPredictionsForGame = async (gameId, participantName, allQuestions) => {
    const knownIds = new Set(allQuestions.map(q => q.id));
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
    return all.filter(p => knownIds.has(p.question_id));
  };

  const calcScore = (allQuestions, predictions) => {
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
        predMap[qid] = `${pred.home_prediction}-${pred.away_prediction}`;
      } else {
        predMap[qid] = pred.text_prediction;
      }
    }
    return calculateTotalScore(allQuestions, predMap);
  };

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
      } else setRankings([]);
    } catch (error) {
      console.error("Error loading rankings:", error);
      toast({ title: "שגיאה", description: "טעינת הדירוג נכשלה", variant: "destructive" });
    }
    setLoading(false);
  }, [currentGame, toast]);

  useEffect(() => { loadRankings(); }, [loadRankings]);

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

  const loadParticipantDetails = async (participantName) => {
    if (!currentGame) return;
    setSelectedParticipant(participantName);
    setParticipantDetails(null);
    setLoadingDetails(true);

    try {
      const allQuestions   = await loadQuestionsForGame(currentGame.id);
      const allPredictions = await loadPredictionsForGame(currentGame.id, participantName, allQuestions);

      const teamsMap = (currentGame.teams_data || [])
        .reduce((acc, t) => { acc[t.name] = t; return acc; }, {});

      const { total: calcTotal, breakdown } = calcScore(allQuestions, allPredictions);

      let totalScore = calcTotal;
      try {
        const { data: rankRow } = await supabase
          .from('rankings')
          .select('current_score')
          .eq('game_id', currentGame.id)
          .eq('participant_name', participantName)
          .single();
        if (rankRow?.current_score != null) totalScore = rankRow.current_score;
      } catch { /* fallback to calcTotal */ }

      // 🌍 במונדיאל אין טבלאות מיקומים — T14/T15/T19 הן שאלות רגילות/עולות
      const isWC = currentGame?.id === '30032806-6216-496f-ac32-fb628e181742';
      const LOCATION_TABLE_IDS = isWC ? [] : ['T14', 'T15', 'T16', 'T17', 'T19'];
      const LOCATION_DEFAULTS  = {
        T14: 'מקומות 1-8 — שלב הבתים',
        T15: 'מקומות 9-16 — שלב הבתים',
        T16: 'מקומות 17-24 — שלב הבתים',
        T17: 'מקומות 1-24 — טבלה כוללת',
        T19: 'רשימת העולות לשמינית הגמר',
      };
      const locationDesc = { ...LOCATION_DEFAULTS };
      allQuestions.forEach(q => {
        if (LOCATION_TABLE_IDS.includes(q.table_id) && q.table_description?.trim())
          locationDesc[q.table_id] = q.table_description.trim();
      });

      const latestPred = {};
      allPredictions.forEach(p => {
        const ex = latestPred[p.question_id];
        if (!ex || new Date(p.created_at) > new Date(ex.created_at))
          latestPred[p.question_id] = p;
      });

      const getPredDisplay = (qid) => {
        const p = latestPred[qid];
        if (!p) return '';
        if (p.home_prediction !== null && p.home_prediction !== undefined &&
            p.away_prediction !== null && p.away_prediction !== undefined)
          return formatScore(`${p.home_prediction}-${p.away_prediction}`);
        return formatScore(p.text_prediction || '');
      };

      const locationSums     = {};
      const regularBreakdown = [];
      const bonusRows        = [];

      breakdown.forEach(item => {
        if (LOCATION_TABLE_IDS.includes(item.table_id)) {
          locationSums[item.table_id] = (locationSums[item.table_id] || 0) + item.score;
        } else if (item.isBonus === true || !allQuestions.find(x => x.id === item.question_id)) {
          if (item.score > 0) {
            bonusRows.push({
              score:               item.score,
              max_score:           item.max_score || item.score,
              table_id:            item.table_id || '?',
              question_id_display: '',
              question_text:       item.question_id_text || item.bonusDescription || `בונוס שלב ${item.table_id}`,
              home_team: null, away_team: null,
              actual_result: '', prediction: '',
              home_team_display: null, away_team_display: null,
              home_team_logo: null, away_team_logo: null,
              isLocationSummary: false, isStageBonusRow: true,
            });
          }
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
            isLocationSummary: false, isStageBonusRow: false,
          });
        }
      });

      const locationRows = Object.entries(locationSums)
        .filter(([, s]) => s > 0)
        .map(([tid, s]) => ({
          score: s, max_score: null, table_id: tid,
          question_id_display: '',
          question_text: locationDesc[tid] || tid,
          home_team: null, away_team: null,
          actual_result: '', prediction: '',
          home_team_display: null, away_team_display: null,
          home_team_logo: null, away_team_logo: null,
          isLocationSummary: true,
        }));

      const enriched = [...regularBreakdown, ...locationRows, ...bonusRows];
      enriched.sort((a, b) => {
        const tA = parseInt(a.table_id.replace('T', '')) || 999;
        const tB = parseInt(b.table_id.replace('T', '')) || 999;
        if (tA !== tB) return tA - tB;
        return (parseFloat(a.question_id_display) || 999) - (parseFloat(b.question_id_display) || 999);
      });

      // ── qualifying sections ────────────────────────────────────────────────
      const normT = n => (n || '')
        .replace(/\s*\([^)]+\)\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const qualTableMap = {};
      allQuestions.forEach(q => {
        if (q.stage_type !== 'qualifiers') return;
        const n = parseFloat(q.question_id);
        if (!Number.isInteger(n) || n < 1) return;
        if (!qualTableMap[q.table_id]) qualTableMap[q.table_id] = [];
        qualTableMap[q.table_id].push(q);
      });

      // שלב 1: בנה advSet לכל טבלה
      const sortedTableIds = Object.keys(qualTableMap)
        .sort((a, b) => (parseInt(a.replace('T', '')) || 0) - (parseInt(b.replace('T', '')) || 0));

      const tableMetaMap = {};
      sortedTableIds.forEach(tableId => {
        const tSlots = qualTableMap[tableId];
        tSlots.sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
        const advSet = new Set(
          tSlots
            .filter(q => q.actual_result && q.actual_result !== '__CLEAR__')
            .map(q => normT(q.actual_result))
        );
        const allResultsIn = tSlots.every(
          q => q.actual_result && q.actual_result !== '__CLEAR__'
        );
        tableMetaMap[tableId] = { tSlots, advSet, allResultsIn };
      });

      // שלב 2: לכל טבלה, חשב isElim + bonusImpossible
      const qualifyingSections = sortedTableIds.map((tableId, idx) => {
        const { tSlots, advSet, allResultsIn } = tableMetaMap[tableId];
        const count = tSlots.length;
        // 🌍 בונוסים במונדיאל לפי טבלה; אחרת לפי גודל (UCL)
        const WC_BONUS = { T16: 24, T17: 6, T19: 16, T21: 16, T23: 8, T25: 8 };
        const bonusPoints = isWC
          ? (WC_BONUS[tableId] || 0)
          : (count >= 8 ? 16 : count >= 4 ? 12 : count >= 2 ? 6 : 0);
        const cfg = { count, bonus: bonusPoints };

        const prevCompleteTables = sortedTableIds
          .slice(0, idx)
          .map(tid => tableMetaMap[tid])
          .filter(meta => meta.allResultsIn && meta.advSet.size > 0);

        const preds = tSlots.map(q => {
          const disp = getPredDisplay(q.id);
          const norm = normT(disp);
          const isAdv = disp && advSet.has(norm);
          const isElim = disp && !isAdv && (
            allResultsIn ||
            prevCompleteTables.some(prevMeta => !prevMeta.advSet.has(norm))
          );
          return { pred: disp, isAdv, isElim, pts: q.possible_points || 0 };
        });

        const guessedSet = new Set(preds.map(p => normT(p.pred)).filter(Boolean));
        const bonusEarned = allResultsIn && [...advSet].every(t => guessedSet.has(t));

        // ✅ בונוס בלתי אפשרי — יש ניחוש שנפל → אדום עם 0
        const bonusImpossible = !bonusEarned && preds.some(p => p.isElim);

        return {
          tableId,
          tableDesc: tSlots[0]?.table_description || tableId,
          preds, advSet, cfg, bonusEarned, bonusImpossible,
          hasAnyResult: advSet.size > 0,
          allResultsIn,
        };
      });

      setParticipantDetails({ name: participantName, scores: enriched, totalScore, qualifyingSections });
    } catch (error) {
      console.error("Error loading participant details:", error);
      toast({ title: "שגיאה", description: "טעינת הפרטים נכשלה", variant: "destructive" });
    }
    setLoadingDetails(false);
  };

  const handleSort = (column) => {
    if (sortColumn === column) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setSortColumn(column);
      setSortDirection(
        ['current_score','previous_score','score_change','position_change'].includes(column) ? 'desc' : 'asc'
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
    if (p === 2) return <Trophy className="w-5 h-5 text-gray-400"   />;
    if (p === 3) return <Trophy className="w-5 h-5 text-orange-400" />;
    return null;
  };

  const getPositionChangeIcon = (c) => {
    if (c > 0) return <TrendingUp   className="w-3 h-3 md:w-4 md:h-4 text-green-400" />;
    if (c < 0) return <TrendingDown className="w-3 h-3 md:w-4 md:h-4 text-red-400"   />;
    return          <Minus         className="w-3 h-3 md:w-4 md:h-4 text-gray-400"  />;
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

        <Card style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', backdropFilter: 'blur(10px)' }}>
          <CardHeader className="py-2 md:py-4">
            <CardTitle className="text-sm md:text-lg" style={{ color: 'var(--tp)' }}>הדירוג הנוכחי</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div style={{ maxHeight: '600px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg3)' }}>
                  <tr style={{ borderBottom: '2px solid var(--tp-30)' }}>
                    {[
                      { key: 'current_position', label: '#',            mobile: '#',   align: 'center' },
                      { key: 'participant_name',  label: 'שם',           mobile: 'שם',  align: 'right'  },
                      { key: 'current_score',     label: "נק'",          mobile: "נק'", align: 'center' },
                      { key: 'previous_position', label: 'מיקום קודם',  mobile: null,  align: 'center' },
                      { key: 'previous_score',    label: 'ניקוד קודם',  mobile: null,  align: 'center' },
                      { key: 'score_change',      label: 'שינוי בניקוד', mobile: '+/-', align: 'center' },
                      { key: 'position_change',   label: 'שינוי במיקום', mobile: '↕',  align: 'center' },
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
                          <span className="font-bold text-xs md:text-base" style={{ color: '#f8fafc' }}>
                            {rank.current_position}
                          </span>
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

      <Dialog
        open={selectedParticipant !== null}
        onOpenChange={() => { setSelectedParticipant(null); setParticipantDetails(null); }}
      >
        <DialogContent
          dir="rtl"
          className="[&>button]:left-4 [&>button]:right-auto [&>button]:top-4"
          style={{
            maxWidth: '52vw', width: '52vw',
            maxHeight: '82vh', height: '82vh',
            display: 'flex', flexDirection: 'column',
            background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg3) 100%)',
            border: '1px solid var(--tp-20)',
            boxShadow: '0 0 30px var(--tp-25)',
            borderRadius: '14px', padding: '0', overflow: 'hidden',
          }}
        >
          <DialogHeader style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--tp-20)', flexShrink: 0 }}>
            <DialogTitle style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', textAlign: 'right', marginBottom: '8px' }}>
              {selectedParticipant}
            </DialogTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
              {loadingDetails ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: 'var(--tp)' }} />
                  <span style={{ fontSize: '0.9rem', color: 'var(--tp)' }}>מחשב ניקוד עדכני...</span>
                </div>
              ) : (
                <>
                  <Badge style={{ background: 'var(--tp)', color: 'white', fontSize: '1rem', fontWeight: 700, padding: '5px 16px', borderRadius: '999px' }}>
                    סה"כ: {participantDetails?.totalScore} נקודות
                  </Badge>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    {participantDetails?.scores?.length || 0} שאלות עם ניקוד
                  </span>
                </>
              )}
            </div>
          </DialogHeader>

          <div style={{ flex: 1, overflow: 'auto', padding: '4px 0 8px' }}>
            {loadingDetails ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px' }}>
                <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--tp)' }} />
              </div>
            ) : (
              <>
              {participantDetails?.qualifyingSections?.filter(s => s.hasAnyResult).length > 0 && (
                <div style={{ padding:'8px 16px 4px' }}>
                  {participantDetails.qualifyingSections.filter(s => s.hasAnyResult).map(sec => {
                    const { bonusEarned, bonusImpossible } = sec;

                    // ✅ צבע וטקסט בונוס:
                    // ירוק = הרוויח | אדום = אי אפשר (bonusImpossible) או כל תוצאות ידועות ולא הרוויח | אפור = עדיין לא ידוע
                    const bonusBg = bonusEarned
                      ? '#059669'
                      : (sec.allResultsIn || bonusImpossible)
                        ? '#dc2626'
                        : 'rgba(100,116,139,0.3)';
                    const bonusText = bonusEarned
                      ? `🏆 +${sec.cfg.bonus}`
                      : (sec.allResultsIn || bonusImpossible)
                        ? `בונוס: 0/${sec.cfg.bonus}`
                        : `בונוס: ?/${sec.cfg.bonus}`;

                    return (
                      <div key={sec.tableId} style={{ marginBottom:'12px', background:'rgba(30,41,59,0.5)', border:'1px solid var(--tp-20)', borderRadius:'10px', padding:'10px 12px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                          <span style={{ fontSize:'0.82rem', fontWeight:700, color:'#f97316' }}>📋 {sec.tableDesc}</span>
                          <span style={{ fontSize:'0.75rem', padding:'2px 8px', borderRadius:'999px', background: bonusBg, color:'white', fontWeight:700 }}>
                            {bonusText}
                          </span>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'4px' }}>
                          {sec.preds.map((p, i) => {
                            const icon  = p.pred ? (p.isAdv ? '✅' : p.isElim ? '❌' : '❓') : '—';
                            const color = p.isAdv ? '#34d399' : p.isElim ? '#f87171' : '#94a3b8';
                            const bg    = p.isAdv ? 'rgba(16,185,129,0.10)' : p.isElim ? 'rgba(239,68,68,0.08)' : 'rgba(15,23,42,0.3)';

                            // ✅ ניקוד: isElim → 0 (גם בלי תוצאת אמת בשלב הנוכחי)
                            const score = !p.pred
                              ? `?/${p.pts}`
                              : p.isAdv
                                ? `+${p.pts}`
                                : p.isElim
                                  ? '0'
                                  : `?/${p.pts}`;

                            return (
                              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 8px', borderRadius:'6px', background: bg, border:`1px solid ${p.isAdv ? 'rgba(16,185,129,0.25)' : p.isElim ? 'rgba(239,68,68,0.20)' : 'rgba(71,85,105,0.3)'}` }}>
                                <span style={{ fontSize:'0.82rem', color, fontWeight: p.isAdv ? 700 : 400 }}>{icon} {p.pred || <span style={{color:'#475569'}}>—</span>}</span>
                                <span style={{ fontSize:'0.72rem', fontWeight:700, color: p.isAdv ? '#34d399' : p.isElim ? '#f87171' : '#64748b', marginRight:'6px' }}>{score}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ height:'1px', background:'var(--tp-15)', margin:'4px 0 8px' }}/>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    {[
                      { label: 'טבלה',  w: '64px'  },
                      { label: 'מס׳',   w: '54px'  },
                      { label: 'שאלה',  w: 'auto'  },
                      { label: 'ניחוש', w: '110px' },
                      { label: 'תוצאה', w: '80px'  },
                      { label: 'ניקוד', w: '74px'  },
                    ].map(h => (
                      <th key={h.label} style={{ width: h.w, background: 'var(--bg1)', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textAlign: 'center', padding: '8px 6px', letterSpacing: '0.04em', borderBottom: '1px solid var(--tp-15)' }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {participantDetails?.scores?.map((s, i) => {

                    if (s.isStageBonusRow) {
                      return (
                        <tr key={i} style={{ background: 'rgba(16,185,129,0.08)', borderRight: '3px solid #10b981' }}>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', border: '1px solid #10b981', color: '#10b981', background: 'rgba(16,185,129,0.1)' }}>{s.table_id}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.85rem' }}>🏆</td>
                          <td colSpan={3} style={{ padding: '8px 6px', textAlign: 'right' }}>
                            <span style={{ color: '#6ee7b7', fontSize: '0.88rem', fontWeight: 600 }}>{s.question_text}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', background: '#059669', color: 'white', fontSize: '0.85rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' }}>+{s.score}</span>
                          </td>
                        </tr>
                      );
                    }

                    if (s.isLocationSummary) {
                      return (
                        <tr key={i} style={{ background: 'rgba(249,115,22,0.08)', borderRight: '3px solid #f97316' }}>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', border: '1px solid #f97316', color: '#f97316', background: 'rgba(249,115,22,0.1)' }}>{s.table_id}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>📋</td>
                          <td colSpan={3} style={{ padding: '8px 6px', textAlign: 'right' }}>
                            <span style={{ color: '#fdba74', fontSize: '0.88rem', fontWeight: 600 }}>{s.question_text}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', background: '#ea580c', color: 'white', fontSize: '0.85rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' }}>+{s.score}</span>
                          </td>
                        </tr>
                      );
                    }

                    let badgeBg = '#475569';
                    if (s.score === s.max_score && s.max_score > 0) badgeBg = '#16a34a';
                    else if (s.score >= 7)  badgeBg = '#2563eb';
                    else if (s.score > 0)   badgeBg = '#ca8a04';

                    return (
                      <tr key={i}
                        style={{ background: 'rgba(30,41,59,0.5)', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.045)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(30,41,59,0.5)'}
                      >
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', border: '1px solid var(--tp)', color: 'var(--tp)', background: 'var(--tp-10)' }}>{s.table_id}</span>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', border: '1px solid var(--tp)', color: 'var(--tp)', background: 'var(--tp-10)' }}>{s.question_id_display}</span>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                          {s.home_team && s.away_team ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.88rem', color: '#f1f5f9' }}>
                              <span>{s.home_team_display || s.home_team}</span>
                              {s.home_team_logo && <img src={s.home_team_logo} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} onError={e => e.target.style.display = 'none'} />}
                              <span style={{ color: '#475569', fontSize: '0.78rem' }}>נגד</span>
                              {s.away_team_logo && <img src={s.away_team_logo} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} onError={e => e.target.style.display = 'none'} />}
                              <span>{s.away_team_display || s.away_team}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.88rem', color: '#f1f5f9' }}>{s.question_text}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.88rem', color: '#94a3b8' }}>{s.prediction || '—'}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.88rem', color: '#f1f5f9', fontWeight: 600 }}>{s.actual_result || '—'}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: badgeBg, color: 'white', fontSize: '0.85rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', minWidth: '52px', textAlign: 'center' }}>
                            {s.score}/{s.max_score}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
