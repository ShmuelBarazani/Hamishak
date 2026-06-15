import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Prediction, Question, Team, ValidationList, User, SystemSettings } from "@/entities/all";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { Users, Loader2, ChevronDown, ChevronUp, FileText, Trash2, AlertTriangle, Trophy, Pencil, Save, Download, Award, CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RoundTableReadOnly from "../components/predictions/RoundTableReadOnly";
import { calculateQuestionScore, calculateLocationBonus } from "@/components/scoring/ScoreService";
import StandingsTable from "../components/predictions/StandingsTable";
import { useGame } from "@/components/contexts/GameContext";

// 🌍 מונדיאל 2026 — לוגיקת תצוגה ייעודית
const WC_GAME_ID = '30032806-6216-496f-ac32-fb628e181742';

function ParticipantTotalScore({ participantName, gameId }) {
  const [totalScore, setTotalScore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadScore = async () => {
      if (!participantName || !gameId) { setLoading(false); return; }
      try {
        const rankingData = await db.Ranking.filter({ game_id: gameId, participant_name: participantName }, null, 1);
        if (rankingData && rankingData.length > 0) setTotalScore(rankingData[0].current_score);
        else setTotalScore(null);
      } catch (error) {
        console.error("Failed to load participant score:", error);
        setTotalScore(null);
      }
      setLoading(false);
    };
    loadScore();
  }, [participantName, gameId]);

  if (loading) return <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#06b6d4' }} />;
  if (totalScore === null) return null;

  return (
    <Badge className="text-white text-sm px-3 py-1 flex items-center gap-1.5" style={{ 
      background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
      boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)'
    }}>
      <Award className="w-4 h-4" />
      סה"כ: {totalScore} נקודות
    </Badge>
  );
}

// ═══ 🆕 טבלת בית צפויה (גדולה וברורה — כמו במסך תוצאות אמת) ═══
function GroupStandingsVS({ table, teams, predictions }) {
  const matches = (table.questions || []).filter(q => q.home_team && q.away_team);
  if (matches.length === 0) return null;
  const stats = {};
  const ensure = name => { if (!stats[name]) stats[name] = { name, P:0, W:0, D:0, L:0, GF:0, GA:0, Pts:0 }; return stats[name]; };
  let playedAny = false;
  matches.forEach(q => {
    ensure(q.home_team); ensure(q.away_team);
    const r = predictions?.[q.id];
    if (!r || r === '__CLEAR__' || !String(r).includes('-')) return;
    const [hs, as] = String(r).split('-').map(x => parseInt(x.trim()));
    if (isNaN(hs) || isNaN(as)) return;
    playedAny = true;
    const H = stats[q.home_team], A = stats[q.away_team];
    H.P++; A.P++; H.GF+=hs; H.GA+=as; A.GF+=as; A.GA+=hs;
    if (hs>as) { H.W++; H.Pts+=3; A.L++; }
    else if (hs<as) { A.W++; A.Pts+=3; H.L++; }
    else { H.D++; A.D++; H.Pts++; A.Pts++; }
  });
  const rows = Object.values(stats).sort((a,b) =>
    b.Pts-a.Pts || (b.GF-b.GA)-(a.GF-a.GA) || b.GF-a.GF || a.name.localeCompare(b.name,'he')
  );
  const cleanName = n => String(n).replace(/\s*\([^)]+\)\s*$/, '').trim();
  return (
    <div style={{ background:'rgba(13,18,30,0.6)', border:'1px solid rgba(6,182,212,0.2)', borderRadius:12, padding:'12px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
        <span style={{ fontSize:'1.05rem', fontWeight:700, color:'#22d3ee' }}>📊 טבלת {table.description} (צפי)</span>
        {!playedAny && <span style={{ fontSize:'0.7rem', color:'#64748b' }}>(לפי ניחושי המשתתף)</span>}
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.9rem' }} dir="rtl">
        <thead>
          <tr style={{ color:'#94a3b8', fontSize:'0.72rem', textAlign:'center' }}>
            <th style={{ textAlign:'right', padding:'6px 5px', fontWeight:600 }}>#</th>
            <th style={{ textAlign:'right', padding:'6px 5px', fontWeight:600 }}>נבחרת</th>
            <th style={{ padding:'6px 4px', fontWeight:600 }} title="משחקים">מש'</th>
            <th style={{ padding:'6px 4px', fontWeight:600 }} title="ניצחונות">נ</th>
            <th style={{ padding:'6px 4px', fontWeight:600 }} title="תיקו">ת</th>
            <th style={{ padding:'6px 4px', fontWeight:600 }} title="הפסדים">ה</th>
            <th style={{ padding:'6px 4px', fontWeight:600 }} title="הפרש שערים">+/-</th>
            <th style={{ padding:'6px 4px', fontWeight:700, color:'#22d3ee' }} title="נקודות">נק'</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const team = teams?.[row.name];
            const gd = row.GF - row.GA;
            const qualifies = i < 2;
            return (
              <tr key={row.name} style={{ borderTop:'1px solid rgba(255,255,255,0.05)', textAlign:'center', background: qualifies && playedAny ? 'rgba(16,185,129,0.07)' : 'transparent' }}>
                <td style={{ textAlign:'right', padding:'7px 5px', color: qualifies?'#34d399':'#64748b', fontWeight:700 }}>{i+1}</td>
                <td style={{ textAlign:'right', padding:'7px 5px' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:7 }}>
                    {team?.logo_url && <img src={team.logo_url} alt="" style={{ width:20, height:20, borderRadius:'50%' }} onError={e=>e.target.style.display='none'} />}
                    <span style={{ color:'#f8fafc' }}>{cleanName(row.name)}</span>
                  </span>
                </td>
                <td style={{ padding:'7px 4px', color:'#94a3b8' }}>{row.P}</td>
                <td style={{ padding:'7px 4px', color:'#94a3b8' }}>{row.W}</td>
                <td style={{ padding:'7px 4px', color:'#94a3b8' }}>{row.D}</td>
                <td style={{ padding:'7px 4px', color:'#94a3b8' }}>{row.L}</td>
                <td style={{ padding:'7px 4px', color: gd>0?'#34d399':gd<0?'#f87171':'#94a3b8' }}>{gd>0?`+${gd}`:gd}</td>
                <td style={{ padding:'7px 4px', color:'#22d3ee', fontWeight:700, fontSize:'0.95rem' }}>{row.Pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {playedAny && <p style={{ fontSize:'0.68rem', color:'#475569', marginTop:8 }}>🟢 2 הראשונות מעפילות אוטומטית (ראש בית + סגנית)</p>}
    </div>
  );
}

export default function ViewSubmissions() {

  const [loading, setLoading] = useState(true);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [data, setData] = useState({ predictions: [], questions: [], teams: [], validationLists: [], locationPredsByTableQ: {}, locationActualsByTableQ: {} });
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [openSections, setOpenSections] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // 🆕 תפריט נייד מתקפל
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false); // 🆕 פעולות מנהל בנייד
  const [openMenuGroups, setOpenMenuGroups] = useState({ rounds:true, groups:true, playoff:true, league:true, special:false, qualifiers:false, other:true });
  const toggleMenuGroup = k => setOpenMenuGroups(prev=>({...prev,[k]:!prev[k]}));
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingParticipant, setDeletingParticipant] = useState(null);
  const [participantStats, setParticipantStats] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const [participantQuestions, setParticipantQuestions] = useState([]);
  const [roundTables, setRoundTables] = useState([]);
  const [israeliTable, setIsraeliTable] = useState(null);
  const [specialTables, setSpecialTables] = useState([]);
  const [locationTables, setLocationTables] = useState([]);
  const [playoffWinnersTable, setPlayoffWinnersTable] = useState(null);
  const [qualifiersTables, setQualifiersTables] = useState([]);
  const [allParticipants, setAllParticipants] = useState([]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPredictions, setEditedPredictions] = useState({});
  const [savingChanges, setSavingChanges] = useState(false);

  const [teamValidationList, setTeamValidationList] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [showMissingReport, setShowMissingReport] = useState(false);
  const [missingPredictions, setMissingPredictions] = useState([]);
  const [loadingMissing, setLoadingMissing] = useState(false);

  const { toast } = useToast();
  const { currentGame } = useGame();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';
  // 🌍 דגל מונדיאל
  const isWC = currentGame?.id === WC_GAME_ID;
  // טבלאות מיקומים — לא רלוונטיות למונדיאל
  const LOC_IDS = isWC ? [] : ['T14', 'T15', 'T16', 'T17', 'T19'];

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
        if (isAuth) {
          const user = await supabase.auth.getUser().then(r => r.data.user);
          setCurrentUser(user);
        } else setCurrentUser(null);
      } catch (error) {
        console.error("Failed to load current user:", error);
        setCurrentUser(null);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!currentGame) { setLoading(false); return; }
      const wcGame = currentGame.id === WC_GAME_ID;
      setLoading(true);
      try {
        const questions = await Question.filter({ game_id: currentGame.id }, "-created_at", 10000);

        let uniqueParticipants = [];
        try {
          const { data: gpData, error: gpErr } = await supabase
            .from('game_participants')
            .select('participant_name')
            .eq('game_id', currentGame.id)
            .order('participant_name');
          if (!gpErr && gpData && gpData.length > 0)
            uniqueParticipants = gpData.map(r => r.participant_name).filter(Boolean);
        } catch(e) { console.warn('game_participants fallback', e); }

        if (uniqueParticipants.length === 0) {
          const PAGE = 1000;
          let allPredNames = [], from = 0, keepGoing = true, iter = 0;
          while (keepGoing && iter < 20) {
            const { data: chunk } = await supabase
              .from('game_predictions')
              .select('participant_name')
              .eq('game_id', currentGame.id)
              .range(from, from + PAGE - 1);
            if (!chunk || chunk.length === 0) break;
            allPredNames = allPredNames.concat(chunk);
            keepGoing = chunk.length === PAGE;
            from += PAGE;
            iter++;
          }
          uniqueParticipants = [...new Set(allPredNames.map(p => p.participant_name))].sort();
        }

        const teamsData = currentGame.teams_data || [];
        const validationListsData = currentGame.validation_lists || [];
        const teamsMap = teamsData.reduce((acc, team) => { acc[team.name] = team; return acc; }, {});
        const listsMap = validationListsData.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {});

        const teamListObj = validationListsData.find(list =>
          list.list_name?.toLowerCase().includes('קבוצ') &&
          !list.list_name?.toLowerCase().includes('מוקדמות')
        );
        if (teamListObj) setTeamValidationList(teamListObj.options);

        setAllParticipants(uniqueParticipants);

        const rTables = {}, sTables = {};
        questions.forEach(q => {
          if (!q.table_id) return;
          // 🌍 פיצול שמות קבוצות מטקסט — לא במונדיאל
          if (!wcGame && (q.table_id === 'T20' || q.table_id === 'T3') && q.question_text && !q.home_team) {
            let teams = null;
            if (q.question_text.includes(' נגד ')) teams = q.question_text.split(' נגד ').map(t => t.trim());
            else if (q.question_text.includes(' - ')) teams = q.question_text.split(' - ').map(t => t.trim());
            if (teams && teams.length === 2) { q.home_team = teams[0]; q.away_team = teams[1]; }
          }

          const tableCollection = (q.home_team && q.away_team) ? rTables : sTables;
          let tableId = q.table_id;
          let tableDescription = q.table_description || q.stage_name;

          // 🌍 startsWith — רק בתים אמיתיים ("בית א'"), לא "ראש בית וסגנית"
          if (q.stage_name && q.stage_name.startsWith('בית')) { tableId = q.stage_name; tableDescription = q.stage_name; }
          else if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order && q.table_id !== 'T10') {
            tableId = `custom_order_${q.stage_order}`; tableDescription = q.stage_name || q.table_description;
          }
          // 🌍 כותרות קשיחות של שלב הליגה — לא במונדיאל
          if (!wcGame) {
            if (q.table_id === 'T12') tableDescription = 'שלב הליגה - פינת הגאווה הישראלית - 7 בוםםםםםםםםםם !!!';
            else if (q.table_id === 'T13') tableDescription = 'שלב ראש בראש - "מבול מטאורים של כוכבים (*)"';
          }

          if (!tableCollection[tableId]) {
            tableCollection[tableId] = {
              id: tableId,
              description: tableDescription || (q.home_team && q.away_team ? `מחזור ${tableId.replace('T','')}` : `שאלות ${tableId.replace('T','')}`),
              questions: []
            };
          }
          tableCollection[tableId].questions.push(q);
        });

        let t20Table = null;
        if (!wcGame) { t20Table = rTables['T20']; delete rTables['T20']; }
        setIsraeliTable(t20Table || null);

        const participantQns = sTables['T1'] ? sTables['T1'].questions : [];
        const uniqueParticipantQns = participantQns.reduce((acc, current) => {
          if (!acc.find(item => item.question_text === current.question_text)) acc.push(current);
          return acc;
        }, []);
        setParticipantQuestions(uniqueParticipantQns);
        delete sTables['T1'];

        const sortedRoundTables = Object.values(rTables).sort((a,b) => {
          const aIsGroup = a.id.startsWith('בית'), bIsGroup = b.id.startsWith('בית');
          if (aIsGroup && !bIsGroup) return -1;
          if (!aIsGroup && bIsGroup) return 1;
          // 🌍 מיון בתים לפי stage_order (א'=1 ... יב'=12)
          if (aIsGroup && bIsGroup) return (a.questions[0]?.stage_order || 0) - (b.questions[0]?.stage_order || 0);
          return (parseInt(a.id.replace('T',''))||0) - (parseInt(b.id.replace('T',''))||0);
        });
        setRoundTables(sortedRoundTables);

        // 🌍 במונדיאל אין טבלאות מיקומים
        const locationTableIds = wcGame ? [] : ['T9', 'T14', 'T15', 'T16', 'T17'];
        const locationGroup = Object.values(sTables)
          .filter(table => locationTableIds.includes(table.id))
          .sort((a,b) => (parseInt(a.id.replace('T',''))||0) - (parseInt(b.id.replace('T',''))||0));
        setLocationTables(locationGroup);

        // 🌍 במונדיאל T19 הוא טבלת עולות רגילה — לא "מנצחות פלייאוף"
        const t19Table = wcGame ? null : sTables['T19'];
        setPlayoffWinnersTable(t19Table || null);

        const allSpecialTables = Object.values(sTables).filter(table => {
          const desc = table.description?.trim();
          const isGroup = table.id.startsWith('בית') || desc?.startsWith('בית');
          const stageType = table.questions[0]?.stage_type;
          return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && (wcGame || table.id !== 'T19') && !isGroup && stageType !== 'qualifiers';
        }).sort((a,b) => {
          const orderA = a.questions[0]?.stage_order || 999, orderB = b.questions[0]?.stage_order || 999;
          if (orderA !== orderB) return orderA - orderB;
          return (parseInt(a.id.replace('T',''))||0) - (parseInt(b.id.replace('T',''))||0);
        });
        setSpecialTables(allSpecialTables);

        const t10Special = sTables['T10'];
        if (t10Special && !wcGame) {
          const t10Round = Object.values(rTables).find(t => t.id === 'T10');
          if (t10Round) t10Round.specialQuestions = t10Special.questions;
        }

        const allQualifiersTables = Object.values(sTables).filter(table => {
          const stageType = table.questions[0]?.stage_type;
          return stageType === 'qualifiers';
        }).sort((a,b) => {
          const orderA = a.questions[0]?.stage_order || 999, orderB = b.questions[0]?.stage_order || 999;
          return orderA - orderB;
        });
        setQualifiersTables(allQualifiersTables);

        setData(prev => ({ ...prev, questions, teams: teamsMap, validationLists: listsMap }));
      } catch (error) {
        console.error("Error loading data:", error);
      }
      setLoading(false);
    };
    loadData();
  }, [currentGame]);

  useEffect(() => {
    const loadParticipantPredictions = async () => {
      if (!selectedParticipant) {
        setData(prev => ({ ...prev, predictions: [] }));
        setEditedPredictions({});
        setIsEditMode(false);
        return;
      }
      setLoadingPredictions(true);
      try {
        const predictions = await Prediction.filter({ participant_name: selectedParticipant }, "-created_at", 5000);

        // 🌍 לוגיקת המיקומים חוצת-משחקים — לא במונדיאל
        const locationTableIds = isWC ? [] : ['T14', 'T15', 'T16', 'T17', 'T19'];
        const locationPredsByTableQ = {};
        if (locationTableIds.length > 0) {
          try {
            const { data: locQuestions } = await supabase
              .from('questions')
              .select('id, table_id, question_id, actual_result')
              .in('table_id', locationTableIds);

            if (locQuestions && locQuestions.length > 0) {
              const uuidToKey = {};
              locQuestions.forEach(q => { uuidToKey[q.id] = `${q.table_id}_${q.question_id}`; });

              predictions.forEach(p => {
                const key = uuidToKey[p.question_id];
                if (key) {
                  if (!locationPredsByTableQ[key] || new Date(p.created_at) > new Date(locationPredsByTableQ[key].created_at))
                    locationPredsByTableQ[key] = { text_prediction: p.text_prediction, created_at: p.created_at };
                }
              });

              const locationActualsByTableQ = {};
              locQuestions.forEach(q => {
                if (q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__')
                  locationActualsByTableQ[`${q.table_id}_${q.question_id}`] = q.actual_result;
              });
              setData(prev => ({ ...prev, predictions, locationPredsByTableQ, locationActualsByTableQ }));
            } else {
              setData(prev => ({ ...prev, predictions, locationPredsByTableQ, locationActualsByTableQ: {} }));
            }
          } catch (e) { console.error('Error building locationPredsByTableQ:', e); }
        } else {
          setData(prev => ({ ...prev, predictions, locationPredsByTableQ: {}, locationActualsByTableQ: {} }));
        }

        setEditedPredictions({});
        setIsEditMode(false);
      } catch (error) { console.error("Error loading participant predictions:", error); }
      setLoadingPredictions(false);
    };
    loadParticipantPredictions();
  }, [selectedParticipant, currentUser, isWC]);

  const participantPredictions = useMemo(() => {
    if (!selectedParticipant) return {};
    const tempPreds = {};
    data.predictions.forEach(p => {
      const existing = tempPreds[p.question_id];
      if (!existing || new Date(p.created_at) > new Date(existing.created_at))
        tempPreds[p.question_id] = { text_prediction: p.text_prediction, home_prediction: p.home_prediction, away_prediction: p.away_prediction, created_at: p.created_at };
    });
    const predMap = {};
    for (const [qid, pred] of Object.entries(tempPreds)) {
      if (pred.home_prediction !== null && pred.home_prediction !== undefined &&
          pred.away_prediction !== null && pred.away_prediction !== undefined)
        predMap[qid] = pred.home_prediction + '-' + pred.away_prediction;
      else predMap[qid] = pred.text_prediction;
    }
    return predMap;
  }, [selectedParticipant, data.predictions]);

  const getPredictionValueForDisplay = useCallback((questionId) => {
    return editedPredictions[questionId] !== undefined ? editedPredictions[questionId] : participantPredictions[questionId];
  }, [editedPredictions, participantPredictions]);

  const getLocationPred = useCallback((question) => {
    if (!LOC_IDS.includes(question.table_id)) return null;
    const direct = participantPredictions[question.id];
    if (direct !== undefined && direct !== '') return direct;
    const key = `${question.table_id}_${question.question_id}`;
    const fallback = data.locationPredsByTableQ?.[key];
    return fallback ? (fallback.text_prediction || '') : '';
  }, [participantPredictions, data.locationPredsByTableQ, LOC_IDS]);

  const getCombinedPredictionsMap = useCallback(() => ({
    ...participantPredictions,
    ...editedPredictions,
  }), [participantPredictions, editedPredictions]);

  const participantDetails = useMemo(() => {
    if (!selectedParticipant) return {};
    const details = { name: selectedParticipant };
    participantQuestions.forEach(q => {
      const pred = data.predictions.find(p => p.question_id === q.id);
      if (pred) details[q.id] = pred.text_prediction;
    });
    return details;
  }, [selectedParticipant, participantQuestions, data.predictions]);

  const loadParticipantStats = async () => {
    if (!currentGame) return;
    try {
      const allPredictions = await Prediction.filter({ game_id: currentGame.id }, null, 10000);
      const stats = {};
      allPredictions.forEach(pred => {
        if (!stats[pred.participant_name]) stats[pred.participant_name] = 0;
        stats[pred.participant_name]++;
      });
      const statsArray = Object.entries(stats).map(([name, count]) => ({ name, predictionsCount: count }))
        .sort((a, b) => a.name.localeCompare(b.name, 'he'));
      setParticipantStats(statsArray);
    } catch (error) {
      console.error("Error loading participant stats:", error);
      toast({ title: "שגיאה", description: "טעינת נתוני משתתפים נכשלה.", variant: "destructive" });
    }
  };

  const handleDeleteParticipant = async (participantName) => {
    if (!currentGame) return;
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את כל הניחושים של "${participantName}"? פעולה זו אינה הפיכה!`)) return;
    setDeletingParticipant(participantName);
    try {
      const predictionsToDelete = await Prediction.filter({ participant_name: participantName, game_id: currentGame.id }, null, 10000);
      const BATCH_SIZE = 10, DELAY_MS = 500;
      for (let i = 0; i < predictionsToDelete.length; i += BATCH_SIZE) {
        const batch = predictionsToDelete.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(pred => Prediction.delete(pred.id)));
        toast({ title: "מוחק...", description: `נמחקו ${Math.min(i+BATCH_SIZE, predictionsToDelete.length)}/${predictionsToDelete.length}`, className: "bg-yellow-900/30 border-yellow-500 text-yellow-200" });
        if (i + BATCH_SIZE < predictionsToDelete.length) await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
      toast({ title: "נמחק בהצלחה!", description: `נמחקו ${predictionsToDelete.length} ניחושים של ${participantName}.`, className: "bg-green-900/30 border-green-500 text-green-200" });
      setAllParticipants(prev => prev.filter(p => p !== participantName));
      if (selectedParticipant === participantName) setSelectedParticipant(null);
      await loadParticipantStats();
    } catch (error) {
      console.error("Error deleting participant:", error);
      toast({ title: "שגיאה", description: "מחיקת המשתתף נכשלה: " + error.message, variant: "destructive" });
    } finally { setDeletingParticipant(null); }
  };

  const handlePredictionEdit = (questionId, newValue) => {
    if (!isEditMode) return;
    const originalValue = participantPredictions[questionId] || '';
    if (newValue === originalValue) {
      setEditedPredictions(prev => { const n = { ...prev }; delete n[questionId]; return n; });
    } else {
      setEditedPredictions(prev => ({ ...prev, [questionId]: newValue }));
    }
  };

  const handleSaveChanges = async () => {
    const changedPredictions = Object.entries(editedPredictions);
    if (changedPredictions.length === 0) {
      toast({ title: "אין שינויים", description: "לא בוצעו שינויים בניחושים", className: "bg-blue-900/30 border-blue-500 text-blue-200" });
      return;
    }
    setSavingChanges(true);
    try {
      let updatedCount = 0;
      for (const [questionId, newValue] of changedPredictions) {
        const prediction = data.predictions.find(p => p.question_id === questionId);
        if (prediction) { await Prediction.update(prediction.id, { text_prediction: newValue }); updatedCount++; }
        else { await Prediction.create({ question_id: questionId, participant_name: selectedParticipant, game_id: currentGame?.id, text_prediction: newValue }); updatedCount++; }
      }
      toast({ title: "שינויים נשמרו!", description: `עודכנו ${updatedCount} ניחושים עבור ${selectedParticipant}`, className: "bg-green-900/30 border-green-500 text-green-200" });
      const reloadPreds = await Prediction.filter({ participant_name: selectedParticipant }, "-created_at", 5000);
      setData(prev => ({ ...prev, predictions: reloadPreds }));
      setEditedPredictions({});
      setIsEditMode(false);
    } catch (error) {
      console.error("Error saving changes:", error);
      toast({ title: "שגיאה", description: "שמירת השינויים נכשלה", variant: "destructive" });
    }
    setSavingChanges(false);
  };

  const toggleSection = (sectionId) => setOpenSections(prev => ({...prev, [sectionId]: !prev[sectionId]}));

  const handleMissingReport = async () => {
    if (!currentGame) return;
    setLoadingMissing(true);
    setShowMissingReport(true);
    try {
      let allPredictions = [], skip = 0;
      while (true) {
        const batch = await Prediction.filter({ game_id: currentGame.id }, null, 10000, skip);
        allPredictions = [...allPredictions, ...batch];
        if (batch.length < 10000) break;
        skip += 10000;
      }
      const predictionsByParticipant = {};
      allPredictions.forEach(pred => {
        if (!predictionsByParticipant[pred.participant_name]) predictionsByParticipant[pred.participant_name] = {};
        const existing = predictionsByParticipant[pred.participant_name][pred.question_id];
        if (!existing || new Date(pred.created_at) > new Date(existing.created_at))
          predictionsByParticipant[pred.participant_name][pred.question_id] = pred;
      });
      const participants = Object.keys(predictionsByParticipant).sort();
      const missingByQuestion = {};
      data.questions.forEach(q => {
        if (q.table_id === 'T1') return;
        const questionKey = `${q.table_id}.${q.question_id}`;
        const missingParticipants = [];
        participants.forEach(participant => {
          const participantPredictions = predictionsByParticipant[participant];
          const pred = participantPredictions[q.id];
          const hasPrediction = pred && pred.text_prediction !== null && pred.text_prediction !== undefined &&
                                pred.text_prediction.toString().trim() !== '' && pred.text_prediction !== '__CLEAR__';
          if (!hasPrediction) missingParticipants.push(participant);
        });
        if (missingParticipants.length > 0) {
          missingByQuestion[questionKey] = {
            table_id: q.table_id, table_description: q.table_description || q.stage_name || '',
            question_id: q.question_id,
            question_text: q.question_text || `${(q.home_team || '').replace(/\s*\([^)]+\)\s*$/, '').trim()} נגד ${(q.away_team || '').replace(/\s*\([^)]+\)\s*$/, '').trim()}`,
            stage_order: q.stage_order || 0,
            missing_count: missingParticipants.length,
            missing_participants: missingParticipants.sort((a, b) => a.localeCompare(b, 'he'))
          };
        }
      });
      const missingArray = Object.entries(missingByQuestion)
        .map(([key, data]) => ({ ...data, full_id: key }))
        .sort((a, b) => {
          if (a.stage_order !== b.stage_order) return a.stage_order - b.stage_order;
          const tableA = parseInt(a.table_id.replace('T', '')) || 0, tableB = parseInt(b.table_id.replace('T', '')) || 0;
          if (tableA !== tableB) return tableA - tableB;
          return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0);
        });
      setMissingPredictions(missingArray);
    } catch (error) {
      console.error("Error generating missing report:", error);
      toast({ title: "שגיאה", description: "יצירת הדוח נכשלה", variant: "destructive" });
    }
    setLoadingMissing(false);
  };

  const handleExportData = async () => {
    if (!currentGame) return;
    setExporting(true);
    try {
      let allPredictions = [], skip = 0;
      while (true) {
        const batch = await Prediction.filter({ game_id: currentGame.id }, null, 10000, skip);
        allPredictions = [...allPredictions, ...batch];
        if (batch.length < 10000) break;
        skip += 10000;
      }
      const questionsMap = {};
      data.questions.forEach(q => { questionsMap[q.id] = q; });
      const participants = [...new Set(allPredictions.map(p => p.participant_name))].sort();
      const headers = ['שלב', 'מס\' שאלה', 'שאלה', 'רשימת אימות', ...participants];
      const predictionsByQuestion = {};
      allPredictions.forEach(p => {
        if (!predictionsByQuestion[p.question_id]) predictionsByQuestion[p.question_id] = {};
        predictionsByQuestion[p.question_id][p.participant_name] = p.text_prediction || '';
      });
      const sortedQuestions = [...data.questions].sort((a, b) => {
        const stageOrderA = a.stage_order || 0, stageOrderB = b.stage_order || 0;
        if (stageOrderA !== stageOrderB) return stageOrderA - stageOrderB;
        return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0);
      });
      const rows = sortedQuestions.map(q => {
        const stageName = q.stage_name || q.table_description || q.table_id || '';
        const questionId = q.question_id || '';
        const questionText = q.question_text || `${q.home_team || ''} נגד ${q.away_team || ''}`;
        const validationList = q.validation_list || '';
        const participantValues = participants.map(p => {
          let pred = predictionsByQuestion[q.id]?.[p] || '';
          if (pred && pred.includes('-')) pred = "'" + pred;
          return pred;
        });
        let safeQuestionText = questionText;
        if (safeQuestionText && safeQuestionText.includes('-')) safeQuestionText = "'" + safeQuestionText;
        return [stageName, questionId, safeQuestionText, validationList, ...participantValues];
      });
      const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `predictions_export_${currentGame.game_name}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast({ title: "ייצוא הושלם!", description: `יוצאו ${sortedQuestions.length} שאלות עבור ${participants.length} משתתפים`, className: "bg-green-900/30 border-green-500 text-green-200" });
    } catch (error) {
      console.error("Error exporting data:", error);
      toast({ title: "שגיאה", description: "ייצוא הנתונים נכשל", variant: "destructive" });
    }
    setExporting(false);
  };

  const stripCountry = (name) => name ? name.replace(/\s*\([^)]+\)\s*$/, '').trim() : name;

  const findMatchedTeamName = useCallback((predictionName) => {
    if (!predictionName || teamValidationList.length === 0) return predictionName;
    const trimmedPrediction = predictionName.trim();
    if (teamValidationList.includes(trimmedPrediction)) return trimmedPrediction;
    const baseName = trimmedPrediction.split('(')[0].trim();
    const normalizeTeamName = (name) => name
      .replace(/קרבאך/g, 'קרבאח').replace(/קראבח/g, 'קרבאח').replace(/קראבך/g, 'קרבאח')
      .replace(/ת"א/g, 'תל אביב').replace(/ת.א/g, 'תל אביב');
    const normalizedBaseName = normalizeTeamName(baseName);
    for (const validName of teamValidationList) {
      const validBaseName = validName.split('(')[0].trim();
      if (normalizeTeamName(validBaseName) === normalizedBaseName) return validName;
    }
    return trimmedPrediction;
  }, [teamValidationList]);

  const getMaxPossibleScore = (question) => {
    if (question.table_id === 'T20' && question.home_team && question.away_team) return 6;
    // 🌍 T17 מקום שלישי: שאלה ראשית = 10 או 7 (לא מצטבר) ; תת-שאלה ".1" = 4
    if (question.game_id === WC_GAME_ID && question.table_id === 'T17') {
      const isSub = String(question.question_id).includes('.');
      return isSub ? 4 : '10/7';
    }
    if (question.possible_points != null && question.possible_points > 0) return question.possible_points;
    if (question.actual_result != null && question.actual_result !== '') return 10;
    if (question.table_id === 'T10') return question.possible_points || 10;
    return 0;
  };

  const renderReadOnlySelect = (question, originalValue) => {
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ') || question.validation_list?.toLowerCase().includes('נבחר');
    // 🌍 LOC_IDS ריק במונדיאל
    const isLocationQuestion = LOC_IDS.includes(question.table_id);

    let displayTeamNameForReadonly = originalValue;
    if (isTeamsList && originalValue && isLocationQuestion) displayTeamNameForReadonly = findMatchedTeamName(originalValue);
    const team = isTeamsList ? data.teams[displayTeamNameForReadonly] : null;

    const maxScore = getMaxPossibleScore(question);
    const hasValue = originalValue && originalValue.trim() !== '';
    const hasActualResult = question.actual_result && question.actual_result.trim() !== '' && question.actual_result !== '__CLEAR__';
    const textColor = hasActualResult ? '#06b6d4' : '#f8fafc';
    const isQuestion11_1 = false; // ❌ בוטל hack ישן (ליגת אלופות) שצימצם את תיבת 11.1
    const isQuestion11_2 = false;
    const boxWidth = 'min-w-[105px] max-w-[125px]';

    if (isEditMode && isAdmin && question.validation_list && data.validationLists[question.validation_list]) {
      const options = data.validationLists[question.validation_list] || [];
      const editedValue = editedPredictions[question.id];
      const currentValue = editedValue !== undefined ? editedValue : originalValue;
      const selectValue = currentValue || "__CLEAR__";
      let displayCurrentTeamNameForEdit = currentValue;
      if (isTeamsList && currentValue && isLocationQuestion) displayCurrentTeamNameForEdit = findMatchedTeamName(currentValue);
      const currentTeam = isTeamsList ? data.teams[displayCurrentTeamNameForEdit] : null;
      return (
        <>
          <Select value={selectValue} onValueChange={(val) => handlePredictionEdit(question.id, val === "__CLEAR__" ? "" : val)}>
            <SelectTrigger className={`${boxWidth} h-10`} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.3)', color: '#f8fafc' }}>
              {currentValue ? (
                <div className="flex items-center gap-2 w-full">
                  {currentTeam?.logo_url && <img src={currentTeam.logo_url} alt={displayCurrentTeamNameForEdit} className="w-4 h-4 rounded-full" onError={(e) => e.target.style.display='none'} />}
                  <span className="truncate">{displayCurrentTeamNameForEdit}</span>
                </div>
              ) : <span className="text-slate-400">{isQuestion11_1 || isQuestion11_2 ? "" : "- בחר -"}</span>}
            </SelectTrigger>
            <SelectContent style={{ background: '#1e293b', border: '1px solid rgba(6,182,212,0.3)' }}>
              <SelectItem value="__CLEAR__" className="hover:bg-cyan-700/20" style={{ color: '#94a3b8' }}>-</SelectItem>
              {options.map(opt => {
                const cleanOpt = opt.replace(/\s*\([^)]+\)\s*$/, '').trim();
                const optTeam = isTeamsList ? (data.teams[opt] || data.teams[cleanOpt]) : null;
                return (
                  <SelectItem key={opt} value={opt} className="hover:bg-cyan-700/20" style={{ color: '#f8fafc' }}>
                    <div className="flex items-center gap-2">
                      {optTeam?.logo_url && <img src={optTeam.logo_url} alt={cleanOpt} className="w-4 h-4 rounded-full" onError={(e) => e.target.style.display='none'} />}
                      <span>{cleanOpt}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="w-12"></div>
        </>
      );
    }

    if (isEditMode && isAdmin && (!question.validation_list || !data.validationLists[question.validation_list])) {
      const valueForInput = editedPredictions[question.id] !== undefined ? editedPredictions[question.id] : originalValue;
      return (
        <div className="flex items-center gap-2">
          <input type="text" value={valueForInput} onChange={(e) => handlePredictionEdit(question.id, e.target.value)}
            className="rounded-md px-3 py-2 min-w-[120px] h-10"
            style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.3)', color: '#f8fafc' }} />
          <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[40px] justify-center">?/{maxScore}</Badge>
        </div>
      );
    }

    if (!hasValue) {
      return (
        <>
          <div className={`rounded-md px-2 py-2 ${boxWidth} flex items-center gap-1`} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <span style={{ color: '#94a3b8', fontSize: isQuestion11_1 ? '0.65rem' : '0.875rem' }}>-</span>
          </div>
          <div className="w-12"></div>
        </>
      );
    }

    const stripParens = (s) => s ? s.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() : '';
    const isLocQ = LOC_IDS.includes(question.table_id);

    let score;
    if (isLocQ) {
      const locKey = `${question.table_id}_${question.question_id}`;
      const crossGameActual = data.locationActualsByTableQ?.[locKey];
      const effectiveActual = crossGameActual || question.actual_result || '';
      if (!effectiveActual || effectiveActual === '__CLEAR__' || !originalValue) {
        score = null;
      } else {
        const predClean = stripParens(originalValue).trim().toLowerCase();
        const allActualsInTable = Object.entries(data.locationActualsByTableQ || {})
          .filter(([k]) => k.startsWith(question.table_id + '_'))
          .map(([, v]) => stripParens(v).trim().toLowerCase()).filter(Boolean);
        score = allActualsInTable.includes(predClean) ? (question.possible_points || 0) : 0;
      }
    } else {
      // ✅ מעביר את כל שאלות הטבלה + כל שאלות המשחק (נדרש לניקוד T16 במונדיאל)
      const questionsInTable = data.questions.filter(q => q.table_id === question.table_id);
      score = calculateQuestionScore(question, originalValue, questionsInTable, {}, data.questions);
    }

    let badgeColor = 'bg-slate-600 text-slate-300';
    // maxScore יכול להיות מחרוזת כמו "10/7" (T17) — נחשב מקס נומרי להשוואת צבע
    const maxNum = typeof maxScore === 'string'
      ? Math.max(...maxScore.split('/').map(n => parseInt(n, 10)).filter(n => !isNaN(n)))
      : maxScore;
    if (score !== null) {
      if (score === maxNum && maxNum > 0) badgeColor = 'bg-green-700 text-green-100';
      else if (score === 0) badgeColor = 'bg-red-700 text-red-100';
      else if (maxNum > 0 && score >= maxNum * 0.7) badgeColor = 'bg-blue-700 text-blue-100';
      else if (score > 0) badgeColor = 'bg-yellow-500 text-white';
    }

    return (
      <>
        <div className={`rounded-md px-2 py-2 ${boxWidth} flex items-center gap-1`} style={{
          background: hasActualResult ? 'rgba(6,182,212,0.2)' : 'rgba(15,23,42,0.6)',
          border: hasActualResult ? '1px solid #06b6d4' : '1px solid rgba(6,182,212,0.2)',
          boxShadow: hasActualResult ? '0 0 10px rgba(6,182,212,0.4)' : 'none'
        }}>
          {team?.logo_url && <img src={team.logo_url} alt={displayTeamNameForReadonly} className="w-4 h-4 rounded-full flex-shrink-0" onError={(e) => e.target.style.display='none'} />}
          <span style={{ color: textColor, fontSize: isQuestion11_1 ? '0.65rem' : '0.875rem', fontWeight: hasActualResult ? '700' : 'normal' }}>{displayTeamNameForReadonly}</span>
        </div>
        {score !== null ? (
          <Badge className={`${badgeColor} text-xs font-bold px-1.5 py-0.5 min-w-[40px] justify-center`}>{score}/{maxScore}</Badge>
        ) : (
          <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[40px] justify-center">?/{maxScore}</Badge>
        )}
      </>
    );
  };

  const renderT10Questions = (table) => {
    const questions = table.questions;
    const grouped = {};
    questions.forEach(q => {
      const mainId = Math.floor(parseFloat(q.question_id));
      if (!grouped[mainId]) grouped[mainId] = { main: null, subs: [] };
      if (q.question_id.includes('.')) grouped[mainId].subs.push(q);
      else grouped[mainId].main = q;
    });
    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    const renderTeamPrediction = (questionId, originalValue) => {
      const valueToDisplay = editedPredictions[questionId] !== undefined ? editedPredictions[questionId] : originalValue;
      if (!valueToDisplay || valueToDisplay.trim() === '') {
        return (
          <>
            <div className="rounded-md px-2 py-2 min-w-[105px] max-w-[125px] flex items-center gap-1" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>-</span>
            </div>
            <div className="w-12"></div>
          </>
        );
      }
      const matchedName = findMatchedTeamName(valueToDisplay);
      const team = data.teams[matchedName];
      const q = questions.find(question => question.id === questionId);
      const hasActualResult = q?.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__';
      const textColor = hasActualResult ? '#06b6d4' : '#f8fafc';
      return (
        <>
          <div className="rounded-md px-2 py-2 min-w-[105px] max-w-[125px] flex items-center gap-1" style={{
            background: hasActualResult ? 'rgba(6,182,212,0.2)' : 'rgba(15,23,42,0.6)',
            border: hasActualResult ? '1px solid #06b6d4' : '1px solid rgba(6,182,212,0.2)',
            boxShadow: hasActualResult ? '0 0 10px rgba(6,182,212,0.4)' : 'none'
          }}>
            {team?.logo_url && <img src={team.logo_url} alt={matchedName} className="w-4 h-4 rounded-full flex-shrink-0" onError={(e) => e.target.style.display='none'} />}
            <span style={{ color: textColor, fontSize: '0.875rem', fontWeight: hasActualResult ? '700' : 'normal' }}>{matchedName}</span>
          </div>
          <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[40px] justify-center">?/10</Badge>
        </>
      );
    };

    return (
      <Card className="bg-slate-800/40 border-slate-700 shadow-lg shadow-slate-900/20">
        <CardHeader className="py-3"><CardTitle className="text-cyan-400">{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-3">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              const isTeamQuestion = !!(main.home_team && main.away_team);
              const mainValue = participantPredictions[main.id] || '';
              const getSubValue = (sub) => {
                const subVal = participantPredictions[sub.id] || '';
                if (sub.question_id === '1.1' && mainValue !== 'אחר') return '';
                return subVal;
              };

              if (sortedSubs.length === 0) {
                return (
                  <div key={main.id} style={{ display:'grid', gridTemplateColumns:'40px 1fr 140px 44px', gap:'5px', alignItems:'center', padding:'8px 8px', borderRadius:'6px' }} className="bg-slate-700/20 border border-slate-600/30">
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                    <div className="contents">{renderReadOnlySelect(main, participantPredictions[main.id] || "")}</div>
                  </div>
                );
              }

              if (sortedSubs.length === 1) {
                return (
                  <div key={main.id} style={{ display:'grid', gridTemplateColumns:'38px minmax(140px, 1.5fr) 125px 44px 38px minmax(120px, 1.2fr) 125px 44px', gap:'5px', alignItems:'center', padding:'8px 8px', borderRadius:'6px' }} className="bg-slate-700/20 border border-slate-600/30">
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{main.question_text}</span>
                    <div className="contents">{isTeamQuestion ? renderTeamPrediction(main.id, participantPredictions[main.id] || "") : renderReadOnlySelect(main, participantPredictions[main.id] || "")}</div>
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sortedSubs[0].question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{sortedSubs[0].question_text}</span>
                    <div className="contents">{isTeamQuestion ? renderTeamPrediction(sortedSubs[0].id, getSubValue(sortedSubs[0])) : renderReadOnlySelect(sortedSubs[0], getSubValue(sortedSubs[0]))}</div>
                  </div>
                );
              }

              return (
                <div key={main.id} style={{ display:'grid', gridTemplateColumns:'36px 1fr 110px 42px 36px 1fr 110px 42px 36px 1fr 110px 42px', gap:'5px', alignItems:'center', padding:'8px 8px', borderRadius:'6px' }} className="bg-slate-700/20 border border-slate-600/30">
                  <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                  <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                  <div className="contents">{isTeamQuestion ? renderTeamPrediction(main.id, participantPredictions[main.id] || "") : renderReadOnlySelect(main, participantPredictions[main.id] || "")}</div>
                  {sortedSubs.map(sub => (
                    <React.Fragment key={sub.id}>
                      <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sub.question_id}</Badge>
                      <span className="text-right font-medium text-sm text-blue-100 truncate">{sub.question_text}</span>
                      <div className="contents">{isTeamQuestion ? renderTeamPrediction(sub.id, getSubValue(sub)) : renderReadOnlySelect(sub, getSubValue(sub))}</div>
                    </React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>{/* end space-y-3 */}
          </div>{/* end overflow-x wrapper */}
        </CardContent>
      </Card>
    );
  };

  // 🌍 קונפיגורציית בונוסי עולות — פר-משחק
  const ADVANCING_CONFIG_VS = isWC
    ? { T19: { count: 16, bonus: 16 }, T21: { count: 8, bonus: 16 }, T23: { count: 4, bonus: 8 }, T25: { count: 2, bonus: 8 } }
    : { T4: { count: 8, bonus: 16 }, T5: { count: 4, bonus: 12 }, T6: { count: 2, bonus: 6 } };

  // ✅ נרמול שמות — הסרת "(מדינה)"
  const normTeam = (name) =>
    (name || '').replace(/\s*\([^)]+\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

  // ✅ בניית קבוצות עולות ומודחות
  const buildAdvancingAndEliminated = (slots, tableId) => {
    // עולות — מתוצאות האמת של חריצי הטבלה
    const advancingSet = new Set(
      slots
        .filter(q => q.actual_result && q.actual_result !== '__CLEAR__')
        .map(q => normTeam(q.actual_result))
    );
    // מודחות — הצד שלא עלה מכל זוג ב-T3 (נוקאאוט בלבד; במונדיאל T3 הוא בית ב')
    const eliminatedSet = new Set();
    if (!isWC) {
      const t3Qs = data.questions.filter(q => q.table_id === 'T3' && q.home_team && q.away_team);
      advancingSet.forEach(adv => {
        t3Qs.forEach(q => {
          const h = normTeam(q.home_team), a = normTeam(q.away_team);
          if (h === adv && !advancingSet.has(a)) eliminatedSet.add(a);
          if (a === adv && !advancingSet.has(h)) eliminatedSet.add(h);
        });
      });
    }
    return { advancingSet, eliminatedSet };
  };

  // 🌍 מונדיאל: ראש בית וסגנית — שורה אחת לכל בית
  const renderWCGroupLeaders = (table) => {
    const groupName = (q) => (q?.question_text || '').split('—')[0].trim();
    const rows = [];
    for (let g = 1; g <= 12; g++) {
      const winner = table.questions.find(q => q.question_id === String(g * 2 - 1));
      const runner = table.questions.find(q => q.question_id === String(g * 2));
      if (winner || runner) rows.push({ g, winner, runner });
    }
    return (
      <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(249,115,22,0.25)', backdropFilter: 'blur(10px)' }}>
        <CardHeader className="py-3"><CardTitle style={{ color: '#f97316' }}>📋 {table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div style={{ display:'grid', gridTemplateColumns:'64px 1fr 48px 1fr 48px', gap:'5px', alignItems:'center', padding:'4px 8px', marginBottom:'4px' }}>
            <span style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:700 }}>בית</span>
            <span style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:700, textAlign:'center' }}>ראש בית</span>
            <span />
            <span style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:700, textAlign:'center' }}>סגנית</span>
            <span />
          </div>
          <div className="space-y-2">
            {rows.map(({ g, winner, runner }) => {
              const wVal = winner ? (editedPredictions[winner.id] !== undefined ? editedPredictions[winner.id] : (participantPredictions[winner.id] || '')) : '';
              const rVal = runner ? (editedPredictions[runner.id] !== undefined ? editedPredictions[runner.id] : (participantPredictions[runner.id] || '')) : '';
              return (
                <div key={g} style={{ display:'grid', gridTemplateColumns:'64px 1fr 48px 1fr 48px', gap:'5px', alignItems:'center', padding:'7px 8px', borderRadius:'8px', background:'rgba(15,23,42,0.4)', border:'1px solid rgba(249,115,22,0.12)' }}>
                  <Badge variant="outline" className="justify-center text-xs h-6" style={{ borderColor:'rgba(249,115,22,0.5)', color:'#fb923c' }}>{groupName(winner || runner)}</Badge>
                  {winner ? <div className="contents">{renderReadOnlySelect(winner, wVal)}</div> : <><span /><span /></>}
                  {runner ? <div className="contents">{renderReadOnlySelect(runner, rVal)}</div> : <><span /><span /></>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderQualifiersTable = (table) => {
    const cfg = ADVANCING_CONFIG_VS[table.id];
    const advCount = cfg ? cfg.count : 999;
    const seenIds = new Set();
    const slots = (table.questions || [])
      .filter(q => {
        const n = parseFloat(q.question_id);
        if (!Number.isInteger(n) || n < 1 || n > advCount) return false;
        if (seenIds.has(n)) return false;
        seenIds.add(n);
        return true;
      })
      .sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));

    const { advancingSet, eliminatedSet } = buildAdvancingAndEliminated(slots, table.id);
    const hasAnyResult = advancingSet.size > 0;
    const allResultsIn = slots.length > 0 && slots.every(q => q.actual_result && q.actual_result !== '__CLEAR__');
    const pointsPerSlot = slots[0]?.possible_points || 0;
    const totalPossible = slots.length * pointsPerSlot;

    // בונוס שלב
    let stageBonusEarned = false;
    if (selectedParticipant && allResultsIn && cfg) {
      const pMap = getCombinedPredictionsMap();
      const guessedSet = new Set(
        slots.map(q => normTeam(pMap[q.id] ?? pMap[q.question_id] ?? '')).filter(Boolean)
      );
      stageBonusEarned = [...advancingSet].every(t => guessedSet.has(t));
    }

    // ✅ ניחושים — לפי זהות קבוצה, ללא מיקום
    const pMap = getCombinedPredictionsMap();
    const allPreds = slots.map(q => {
      const raw = pMap[q.id] ?? pMap[q.question_id] ?? '';
      return (typeof raw === 'string' ? raw : (raw?.text_prediction || '')).trim();
    });

    return (
      <div style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid var(--tp-20)', borderRadius: '12px', padding: '16px', backdropFilter: 'blur(10px)' }}>
        <h3 className="text-right font-bold text-base mb-3" style={{ color: '#f97316' }}>📋 {table.description}</h3>

        {/* בונוס שלב */}
        {cfg && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', borderRadius:'8px', marginBottom:'10px', background: stageBonusEarned ? 'rgba(16,185,129,0.12)' : 'rgba(234,179,8,0.08)', border: `1px solid ${stageBonusEarned ? 'rgba(16,185,129,0.45)' : 'rgba(234,179,8,0.35)'}` }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '1rem' }}>🏆</span>
              <div>
                <p style={{ fontSize: '0.78rem', fontWeight: '700', color: stageBonusEarned ? '#6ee7b7' : '#fde68a' }}>{stageBonusEarned ? '✅ בונוס שלב!' : '🏆 בונוס שלב'}</p>
                <p style={{ fontSize: '0.70rem', color: '#94a3b8' }}>{stageBonusEarned ? `כל ${advCount} הקבוצות נכונות!` : allResultsIn ? `פגיעה בכל ${advCount} → +${cfg.bonus} נק'` : `ממתין לתוצאות...`}</p>
              </div>
            </div>
            <Badge style={{ fontSize:'0.95rem', fontWeight:'800', padding:'4px 12px', background: stageBonusEarned ? '#059669' : allResultsIn ? '#dc2626' : 'rgba(100,116,139,0.3)', color:'#fff', border: stageBonusEarned ? '1px solid #10b981' : allResultsIn ? '1px solid #ef4444' : '1px solid rgba(100,116,139,0.4)' }}>
              {stageBonusEarned ? `+${cfg.bonus}` : allResultsIn ? `0/${cfg.bonus}` : `?/${cfg.bonus}`}
            </Badge>
          </div>
        )}

        <div style={{ textAlign:'left', marginBottom:'10px' }}>
          <span style={{ fontSize:'0.72rem', color:'#94a3b8' }}>
            {pointsPerSlot} נק' לכל קבוצה נכונה • סה"כ אפשרי: {totalPossible} נק'{cfg ? ` + בונוס ${cfg.bonus} נק'` : ''}
          </span>
        </div>

        {/* ✅ ניחושים לפי זהות — 2 עמודות */}
        <div className="grid grid-cols-2 gap-2">
          {allPreds.map((pred, i) => {
            const norm = normTeam(pred);
            const isAdv  = pred && advancingSet.has(norm);
            const isElim = pred && !isAdv && eliminatedSet.has(norm);
            const isGray = !pred || (!isAdv && !isElim);

            const bg     = isAdv ? 'rgba(16,185,129,0.12)' : isElim ? 'rgba(239,68,68,0.10)' : 'rgba(15,23,42,0.4)';
            const border = isAdv ? 'rgba(16,185,129,0.35)'  : isElim ? 'rgba(239,68,68,0.30)'  : 'rgba(71,85,105,0.30)';
            const color  = isAdv ? '#34d399'                 : isElim ? '#f87171'                : '#94a3b8';
            const icon   = isAdv ? '✅'                       : isElim ? '❌'                     : '❓';
            const scoreText = !pred ? `?/${pointsPerSlot}` : hasAnyResult ? (isAdv ? `+${pointsPerSlot}` : isElim ? '0' : `?/${pointsPerSlot}`) : `?/${pointsPerSlot}`;
            const scoreBg   = isAdv ? '#16a34a' : isElim ? '#dc2626' : 'rgba(100,116,139,0.25)';

            return (
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', borderRadius:'8px', background: bg, border:`1px solid ${border}`, gap:'8px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 }}>
                  <span style={{ fontSize:'0.9rem', flexShrink:0 }}>{pred ? icon : '—'}</span>
                  {(() => { const t = data.teams[pred] || data.teams[(pred || '').replace(/\s*\([^)]+\)\s*$/, '').trim()]; return t?.logo_url ? <img src={t.logo_url} alt={pred} style={{ width:18, height:18, borderRadius:'50%', flexShrink:0 }} onError={e => e.target.style.display='none'} /> : null; })()}
                  <span style={{ fontSize:'0.84rem', fontWeight: isAdv ? 700 : 500, color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {pred || <span style={{ color:'#475569' }}>לא מולא</span>}
                  </span>
                </div>
                <Badge style={{ fontSize:'0.75rem', fontWeight:700, background: scoreBg, color:'white', border:'none', minWidth:'44px', textAlign:'center', padding:'3px 8px', flexShrink:0 }}>
                  {scoreText}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSpecialQuestions = (table) => {
    const isT10 = table.description.includes('T10') || table.id === 'T10' || table.id.includes('custom_order');
    if (isT10) return renderT10Questions(table);

    const grouped = {};
    table.questions.forEach(q => {
      const mainId = Math.floor(parseFloat(q.question_id));
      if (!grouped[mainId]) grouped[mainId] = { main: null, subs: [] };
      if (q.question_id.includes('.')) grouped[mainId].subs.push(q);
      else grouped[mainId].main = q;
    });
    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    let bonusInfo = null;
    // 🌍 LOC_IDS ריק במונדיאל — אין בונוסי מיקומים בתצוגה זו
    const isLocationTable = LOC_IDS.includes(table.id);
    if (selectedParticipant) {
      const predForBonus = {};
      table.questions.forEach(q => {
        const editedValue = editedPredictions[q.id];
        if (editedValue !== undefined) predForBonus[q.id] = editedValue;
        else if (isLocationTable) predForBonus[q.id] = getLocationPred(q) || "";
        else predForBonus[q.id] = participantPredictions[q.id] || "";
      });
      const enrichedQuestions = isLocationTable ? table.questions.map(q => {
        const locKey = `${q.table_id}_${q.question_id}`;
        const crossActual = data.locationActualsByTableQ?.[locKey];
        return crossActual ? { ...q, actual_result: crossActual } : q;
      }) : table.questions;
      bonusInfo = calculateLocationBonus(table.id, enrichedQuestions, predForBonus);
    }

    let teamsBonusPotential = 0, orderBonusPotential = 0;
    if (isLocationTable) {
      if (table.id === 'T17') { teamsBonusPotential = 30; orderBonusPotential = 50; }
      else if (table.id === 'T19') { teamsBonusPotential = 20; orderBonusPotential = 0; }
      else { teamsBonusPotential = 20; orderBonusPotential = 40; }
    }

    return (
      <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(6,182,212,0.2)', backdropFilter: 'blur(10px)' }}>
        <CardHeader className="py-3"><CardTitle style={{ color: '#06b6d4' }}>{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-2">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              const isLocTable = LOC_IDS.includes(table.id);
              const mainOriginalValue = editedPredictions[main.id] !== undefined
                ? editedPredictions[main.id]
                : (isLocTable ? (getLocationPred(main) || '') : (participantPredictions[main.id] || ''));

              // ── 0 תתי-שאלות — 4 עמודות ──────────────────────────────────
              if (sortedSubs.length === 0) {
                return (
                  <div key={main.id} style={{ display:'grid', gridTemplateColumns:'40px 1fr 140px 44px', gap:'5px', alignItems:'center', padding:'8px 8px', borderRadius:'6px', background:'rgba(15,23,42,0.4)', border:'1px solid rgba(6,182,212,0.1)' }}>
                    <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor:'#06b6d4', color:'#06b6d4' }}>{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm truncate" style={{ color:'#f8fafc' }}>{main.question_text}</span>
                    <div className="contents">{renderReadOnlySelect(main, mainOriginalValue)}</div>
                  </div>
                );
              }

              // ── 1 תת-שאלה — 9 עמודות ────────────────────────────────────
              if (sortedSubs.length === 1) {
                const subOriginalValue = editedPredictions[sortedSubs[0].id] !== undefined
                  ? editedPredictions[sortedSubs[0].id]
                  : (isLocTable ? (getLocationPred(sortedSubs[0]) || '') : (participantPredictions[sortedSubs[0].id] || ''));
                return (
                  <div key={main.id} style={{ display:'grid', gridTemplateColumns:'38px minmax(140px, 1.5fr) 125px 44px 38px minmax(120px, 1.2fr) 125px 44px', gap:'5px', alignItems:'center', padding:'8px 8px', borderRadius:'6px', background:'rgba(15,23,42,0.4)', border:'1px solid rgba(6,182,212,0.1)' }}>
                    <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor:'#06b6d4', color:'#06b6d4' }}>{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{main.question_text}</span>
                    <div className="contents">{renderReadOnlySelect(main, mainOriginalValue)}</div>
                    <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor:'#06b6d4', color:'#06b6d4' }}>{sortedSubs[0].question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{sortedSubs[0].question_text}</span>
                    <div className="contents">{renderReadOnlySelect(sortedSubs[0], subOriginalValue)}</div>
                  </div>
                );
              }

              // ── 2 תתי-שאלות — 12 עמודות ─────────────────────────────────
              return (
                <div key={main.id} style={{ display:'grid', gridTemplateColumns:'36px 1fr 110px 42px 36px 1fr 110px 42px 36px 1fr 110px 42px', gap:'5px', alignItems:'center', padding:'8px 8px', borderRadius:'6px', background:'rgba(15,23,42,0.4)', border:'1px solid rgba(6,182,212,0.1)' }}>
                  <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor:'#06b6d4', color:'#06b6d4' }}>{main.question_id}</Badge>
                  <span className="text-right font-medium text-sm truncate" style={{ color:'#f8fafc' }}>{main.question_text}</span>
                  <div className="contents">{renderReadOnlySelect(main, mainOriginalValue)}</div>
                  {sortedSubs.map(sub => {
                    const subOriginalValue = editedPredictions[sub.id] !== undefined
                      ? editedPredictions[sub.id]
                      : (isLocTable ? (getLocationPred(sub) || '') : (participantPredictions[sub.id] || ''));
                    return (
                      <React.Fragment key={sub.id}>
                        <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor:'#06b6d4', color:'#06b6d4' }}>{sub.question_id}</Badge>
                        <span className="text-right font-medium text-sm truncate" style={{ color:'#f8fafc' }}>{sub.question_text}</span>
                        <div className="contents">{renderReadOnlySelect(sub, subOriginalValue)}</div>
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>{/* end space-y-2 */}
          </div>{/* end overflow-x wrapper */}

          {isLocationTable && selectedParticipant && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg border ${bonusInfo?.allCorrect ? 'bg-gradient-to-r from-green-900/40 to-emerald-900/40 border-green-600/50' : bonusInfo !== null ? 'bg-gradient-to-r from-red-900/40 to-red-800/40 border-red-600/50' : 'bg-gradient-to-r from-slate-800/40 to-slate-700/40 border-slate-600/50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className={`w-5 h-5 ${bonusInfo?.allCorrect ? 'text-green-400' : bonusInfo !== null ? 'text-red-400' : 'text-slate-400'}`} />
                    <div>
                      <p className={`font-bold text-sm ${bonusInfo?.allCorrect ? 'text-green-200' : bonusInfo !== null ? 'text-red-200' : 'text-slate-300'}`}>{bonusInfo?.allCorrect ? '✅' : bonusInfo !== null ? '❌' : '⏳'} בונוס עולות</p>
                      <p className={`text-xs ${bonusInfo?.allCorrect ? 'text-green-300' : bonusInfo !== null ? 'text-red-300' : 'text-slate-400'}`}>{bonusInfo?.allCorrect ? 'כל הקבוצות נכונות!' : bonusInfo !== null ? 'לא כל הקבוצות' : 'ממתין לתוצאות...'}</p>
                    </div>
                  </div>
                  <Badge className={`text-lg font-bold px-3 py-1 ${bonusInfo?.allCorrect ? 'bg-green-600 text-white' : bonusInfo !== null ? 'bg-red-600 text-white' : 'bg-slate-600 text-slate-300'}`}>
                    {bonusInfo?.allCorrect ? `+${bonusInfo.teamsBonus}` : bonusInfo !== null ? '0' : '?'}/{teamsBonusPotential}
                  </Badge>
                </div>
              </div>
              {table.id !== 'T19' && (
                <div className={`p-3 rounded-lg border ${bonusInfo?.perfectOrder ? 'bg-gradient-to-r from-yellow-900/40 to-orange-900/40 border-yellow-600/50' : bonusInfo !== null ? 'bg-gradient-to-r from-red-900/40 to-red-800/40 border-red-600/50' : 'bg-gradient-to-r from-slate-800/40 to-slate-700/40 border-slate-600/50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className={`w-5 h-5 ${bonusInfo?.perfectOrder ? 'text-yellow-400' : bonusInfo !== null ? 'text-red-400' : 'text-slate-400'}`} />
                      <div>
                        <p className={`font-bold text-sm ${bonusInfo?.perfectOrder ? 'text-yellow-200' : bonusInfo !== null ? 'text-red-200' : 'text-slate-300'}`}>{bonusInfo?.perfectOrder ? '✨' : bonusInfo !== null ? '❌' : '⏳'} בונוס מיקום</p>
                        <p className={`text-xs ${bonusInfo?.perfectOrder ? 'text-yellow-300' : bonusInfo !== null ? 'text-red-300' : 'text-slate-400'}`}>{bonusInfo?.perfectOrder ? 'סדר מושלם!' : bonusInfo?.allCorrect ? 'לא בסדר המדויק' : bonusInfo !== null ? 'לא כל הקבוצות' : 'ממתין לתוצאות...'}</p>
                      </div>
                    </div>
                    <Badge className={`text-lg font-bold px-3 py-1 ${bonusInfo?.perfectOrder ? 'bg-yellow-600 text-white' : bonusInfo !== null ? 'bg-red-600 text-white' : 'bg-slate-600 text-slate-300'}`}>
                      {bonusInfo?.perfectOrder ? `+${bonusInfo.orderBonus}` : bonusInfo !== null ? '0' : '?'}/{orderBonusPotential}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="ml-3" style={{ color: '#06b6d4' }}>טוען נתונים...</span>
      </div>
    );
  }

  const hasChanges = Object.keys(editedPredictions).length > 0;
  const TEXT_LENGTH_THRESHOLD = 18;

  // 📱 קיצור שמות שלבים — רק לתצוגת רצועת הניווט/תפריטים (לא משנה תוכן/כותרות)
  const shortLabel = (desc) => {
    if (!desc) return '';
    const raw = String(desc);

    // ראש בראש / מיוחדות / מסלול
    if (raw.includes('ראש בראש') || raw.includes('התותחים') || raw.includes('מבול')) return 'ראש בראש';
    if (raw.includes('הניחושים המיוחדים')) return 'הניחושים המיוחדים';
    if (raw.includes('המסלול המהיר')) return 'המסלול המהיר';

    // ── רשימות העולות — מזוהות לפי "רשימת הנבחרות" / "העולות" / "ראש בית וסגנית" / "נבחרות המקום" ──
    const isQualifierList = raw.includes('רשימת הנבחרות') || raw.includes('הנבחרות שתסיימנה') ||
                            raw.includes('הנבחרות שיעלו') || raw.includes('העולות') ||
                            (raw.includes('ראש בית') && raw.includes('סגנית')) || raw.includes('נבחרות המקום');
    if (isQualifierList) {
      if (raw.includes('ראש בית') && raw.includes('סגנית')) return 'עולות · ראש בית וסגנית';
      if (raw.includes('מקום השלישי') || raw.includes('המקום השלישי') || raw.includes('שלישי')) return 'עולות · מקום שלישי';
      if (raw.includes('שמינית')) return 'עולות · שמינית גמר';
      if (raw.includes('רבע')) return 'עולות · רבע גמר';
      if (raw.includes('חצי')) return 'עולות · חצי גמר';
      if (raw.includes('גמר')) return 'עולות · גמר מונדיאל';
    }

    // שלב הבתים
    if (raw.includes('שלב הבתים')) return 'שלב הבתים';

    // ברירת מחדל — ניקוי וקיצור
    let s = raw.replace(/\(\*+\)/g, '').replace(/["'״]/g, '').replace(/^בית\s*/, 'בית ').trim();
    return s.length > 16 ? s.slice(0, 15).trim() + '…' : s;
  };

  // 📱 ניווט נייד — בורר נפתח (Bottom Sheet). שורה אחת קבועה, בחירה פותחת חלון מלא.
  const renderMobileNav = (allButtonsList, openSectionsMap, toggleSectionFn) => {
    const typeColors = {
      playoff:'#3b82f6', league:'#3b82f6', groups:'#06b6d4', rounds:'#06b6d4',
      special:'#8b5cf6', qualifiers:'#f97316', other:'#64748b',
    };
    const groupLabels = {
      groups:'🏠 בתים', rounds:'⚽ מחזורים', playoff:'⚔️ נוקאאוט', league:'⚽ ליגה',
      special:'✨ הניחושים המיוחדים', qualifiers:'📋 רשימות העולות', other:'📌 נוסף',
    };

    const grouped = {};
    allButtonsList.forEach(b => {
      const t = b.stageType || 'special';
      (grouped[t] = grouped[t] || []).push(b);
    });
    const orderedTypes = ['groups','rounds','playoff','league','special','qualifiers','other']
      .filter(t => grouped[t]?.length);

    // השלבים הפתוחים כרגע (לתווית בכפתור)
    const openButtons = allButtonsList.filter(b => openSectionsMap[b.sectionKey]);
    const triggerLabel = openButtons.length === 0 ? 'בחר שלב לצפייה'
      : openButtons.length === 1 ? shortLabel(openButtons[0].houseGrid ? (openButtons[0].fullDescription || openButtons[0].description) : openButtons[0].description)
      : `${openButtons.length} שלבים נבחרו`;

    return (
      <div>
        <style>{`.vs-sheet-scroll::-webkit-scrollbar{width:0}`}</style>

        {/* שורת ניווט אחת — כפתור הבורר */}
        <button onClick={() => setMobileMenuOpen(true)} style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 16px', borderRadius:'12px', cursor:'pointer',
          background:'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(6,182,212,0.07))',
          border:'1.5px solid rgba(6,182,212,0.5)', fontFamily:'Rubik,Heebo,sans-serif',
          WebkitTapHighlightColor:'transparent', touchAction:'manipulation', minHeight:'48px',
        }}>
          <span style={{ display:'flex', alignItems:'center', gap:9 }}>
            <span style={{ fontSize:'1.15rem' }}>🗂️</span>
            <span style={{ color:'#f8fafc', fontWeight:700, fontSize:'0.98rem' }}>{triggerLabel}</span>
          </span>
          <span style={{ color:'#22d3ee', fontSize:'0.9rem', fontWeight:600 }}>החלף ▾</span>
        </button>

        {/* בורר נפתח מלמטה — portal ל-body כדי לעלות מעל הכותרת */}
        {mobileMenuOpen && createPortal((
          <div onClick={() => setMobileMenuOpen(false)} style={{
            position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,0.65)',
            display:'flex', alignItems:'flex-end', backdropFilter:'blur(2px)',
          }}>
            <div onClick={e => e.stopPropagation()} className="vs-sheet-scroll" style={{
              width:'100%', maxHeight:'82vh', overflowY:'auto',
              background:'#0b1220', borderTopLeftRadius:'22px', borderTopRightRadius:'22px',
              border:'1px solid rgba(6,182,212,0.3)', borderBottom:'none',
              padding:'10px 16px calc(28px + env(safe-area-inset-bottom,0px))',
              boxShadow:'0 -10px 40px rgba(0,0,0,0.8)',
            }}>
              {/* ידית + כותרת */}
              <div style={{ display:'flex', justifyContent:'center', padding:'4px 0 12px' }}>
                <div style={{ width:'42px', height:'5px', borderRadius:'3px', background:'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <span style={{ fontSize:'1.05rem', fontWeight:700, color:'#f8fafc' }}>בחר שלב לצפייה</span>
                <button onClick={() => setMobileMenuOpen(false)} aria-label="סגור" style={{
                  background:'rgba(255,255,255,0.06)', border:'none', borderRadius:'50%',
                  width:'32px', height:'32px', color:'#94a3b8', cursor:'pointer', fontSize:'1.1rem', lineHeight:1,
                }}>✕</button>
              </div>

              {orderedTypes.map(type => {
                const c = typeColors[type];
                const isGroups = type === 'groups';
                return (
                  <div key={type} style={{ marginBottom:18 }}>
                    <div style={{ fontSize:'0.78rem', color:c, marginBottom:9, fontWeight:700 }}>{groupLabels[type] || type}</div>
                    <div style={{ display:'grid', gridTemplateColumns: isGroups ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap:8 }}>
                      {grouped[type].map(b => {
                        const active = openSectionsMap[b.sectionKey];
                        return (
                          <button key={b.key}
                            onClick={() => {
                              Object.keys(openSectionsMap).forEach(k => { if (openSectionsMap[k] && k !== b.sectionKey) toggleSectionFn(k); });
                              if (!openSectionsMap[b.sectionKey]) toggleSectionFn(b.sectionKey);
                              setMobileMenuOpen(false);
                              setTimeout(() => {
                                const main = document.querySelector('.lm-page');
                                if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
                                else window.scrollTo({ top: 0, behavior: 'smooth' });
                              }, 60);
                            }}
                            title={b.fullDescription || b.description}
                            style={{
                              display:'flex', alignItems:'center', justifyContent:'center',
                              padding:'13px 8px', borderRadius:'12px',
                              fontSize:'0.86rem', fontWeight: active ? 700 : 500,
                              color: active ? '#0f172a' : '#e2e8f0',
                              background: active ? c : 'rgba(255,255,255,0.04)',
                              border:`1.5px solid ${active ? c : `${c}40`}`, cursor:'pointer',
                              fontFamily:'Rubik,Heebo,sans-serif', textAlign:'center',
                              WebkitTapHighlightColor:'transparent', touchAction:'manipulation', minHeight:'52px',
                              whiteSpace:'normal', lineHeight:1.25,
                            }}>
                            {shortLabel(b.houseGrid ? (b.fullDescription || b.description) : b.description)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ), document.body)}
      </div>
    );
  };

  const renderStageChips = (allButtonsList, openSectionsMap, toggleSectionFn) => {
    const allChips = allButtonsList.map(button => {
      const active = openSectionsMap[button.sectionKey];
      const type = button.stageType || 'special';
      const colors = {
        playoff:    { color:'#3b82f6', bg:'rgba(59,130,246,0.15)',  border:'rgba(59,130,246,0.4)'  },
        league:     { color:'#3b82f6', bg:'rgba(59,130,246,0.15)',  border:'rgba(59,130,246,0.4)'  },
        groups:     { color:'#06b6d4', bg:'rgba(6,182,212,0.15)',   border:'rgba(6,182,212,0.4)'   },
        rounds:     { color:'#06b6d4', bg:'rgba(6,182,212,0.15)',   border:'rgba(6,182,212,0.4)'   },
        special:    { color:'#8b5cf6', bg:'rgba(139,92,246,0.15)', border:'rgba(139,92,246,0.4)'  },
        qualifiers: { color:'#f97316', bg:'rgba(249,115,22,0.15)',  border:'rgba(249,115,22,0.4)'  },
        other:      { color:'#64748b', bg:'rgba(100,116,139,0.12)', border:'rgba(100,116,139,0.3)' },
      };
      const c = colors[type] || colors.other;
      return { button, active, c };
    });

    const openCount = allButtonsList.filter(b => openSectionsMap[b.sectionKey]).length;
    return (
      <div>
        {/* בר בחירה מתקפל — חוסך מקום במסך */}
        <button onClick={() => setMobileMenuOpen(o => !o)} style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 14px', borderRadius:'12px',
          background:'linear-gradient(135deg, rgba(6,182,212,0.16), rgba(6,182,212,0.06))',
          border:'1.5px solid rgba(6,182,212,0.45)', cursor:'pointer',
          WebkitTapHighlightColor:'transparent', touchAction:'manipulation', fontFamily:'Rubik, Heebo, sans-serif',
        }}>
          <span style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:'1.1rem' }}>📋</span>
            <span style={{ color:'#f8fafc', fontWeight:700, fontSize:'0.95rem' }}>בחירת שלב{openCount>0?` (${openCount} פתוחים)`:''}</span>
          </span>
          <span style={{ color:'#22d3ee', fontSize:'0.8rem', transform:mobileMenuOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>▼</span>
        </button>
        {mobileMenuOpen && (
          <div style={{ marginTop:8, padding:'10px', background:'rgba(10,15,26,0.98)', borderRadius:'12px', border:'1px solid rgba(6,182,212,0.2)', maxHeight:'70vh', overflowY:'auto', boxShadow:'0 12px 32px rgba(0,0,0,0.6)' }}>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
              {allChips.map(({button, active, c}) => (
                <button
                  key={button.key}
                  onClick={() => toggleSectionFn(button.sectionKey)}
                  style={{
                    display:'inline-flex', alignItems:'center', flexShrink:0,
                    padding:'9px 14px', borderRadius:'999px',
                    fontSize:'0.85rem', fontWeight: active ? 800 : 500,
                    color: active ? 'white' : c.color,
                    background: active ? c.color : c.bg,
                    border:`1.5px solid ${active ? c.color : c.border}`,
                    cursor:'pointer', transition:'all 0.15s',
                    fontFamily:'Rubik, Heebo, sans-serif',
                    whiteSpace:'nowrap',
                    WebkitTapHighlightColor:'transparent', touchAction:'manipulation',
                    minHeight:'42px',
                  }}
                >
                  {button.description}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSidebar = () => {
    const groupMap = {
      playoff:    { label: '⚔️ נוקאאוט',        color: '#3b82f6', activeBg: '#2563eb' },
      league:     { label: '⚽ משחקי ליגה',     color: '#3b82f6', activeBg: '#2563eb' },
      groups:     { label: '🏠 שלב הבתים',     color: '#06b6d4', activeBg: '#0891b2' },
      rounds:     { label: '⚽ מחזורים',        color: '#06b6d4', activeBg: '#0891b2' },
      special:    { label: '✨ שאלות מיוחדות', color: '#8b5cf6', activeBg: '#7c3aed' },
      qualifiers: { label: '📋 רשימות עולות',  color: '#f97316', activeBg: '#ea580c' },
      other:      { label: '📌 נוסף',           color: '#64748b', activeBg: '#475569' },
    };
    const grouped = {};
    allButtons.forEach(btn => {
      const t = btn.stageType || (btn.sectionKey === 'rounds' ? 'rounds' : btn.sectionKey.startsWith('round_') ? 'playoff' : btn.sectionKey.startsWith('qual_') ? 'qualifiers' : 'special');
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(btn);
    });
    const order = ['rounds','league','groups','playoff','special','qualifiers','other'];
    const sortedGroups = order.filter(t => grouped[t]);
    return (
      <aside style={{ width:'250px', maxHeight:'calc(100vh - 90px)', overflowY:'auto', paddingBottom:'16px' }}>
        <div style={{ background:'rgba(13,18,30,0.92)', borderRadius:'14px', border:'1px solid rgba(6,182,212,0.15)', padding:'12px 10px', backdropFilter:'blur(10px)' }}>
          <div style={{ fontSize:'0.55rem', fontWeight:'800', letterSpacing:'0.18em', textTransform:'uppercase', color:'#334155', marginBottom:'10px', paddingRight:'2px' }}>בחירת שלב</div>
          {sortedGroups.map(type => {
            const info = groupMap[type] || groupMap.other;
            const open = openMenuGroups[type] !== false;
            const gridBtns = grouped[type].filter(b => b.houseGrid);
            const listBtns = grouped[type].filter(b => !b.houseGrid);
            return (
              <div key={type} style={{ marginBottom:'8px' }}>
                <div onClick={() => toggleMenuGroup(type)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', borderRadius:10, cursor:'pointer', userSelect:'none', fontWeight:700, fontSize:'0.85rem', color:info.color, background:`${info.color}1A`, border:`1px solid ${info.color}40` }}>
                  <span>{info.label}</span>
                  <span style={{ fontSize:'0.6rem', transform:open?'rotate(90deg)':'none', transition:'transform 0.2s' }}>◀</span>
                </div>
                {open && (
                  <div style={{ padding:'8px 2px 2px' }}>
                    {gridBtns.length > 0 && (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, marginBottom: listBtns.length>0?6:0 }}>
                        {gridBtns.map(btn => {
                          const active = openSections[btn.sectionKey];
                          return (
                            <button key={btn.key} onClick={() => toggleSection(btn.sectionKey)} title={btn.fullDescription} style={{ textAlign:'center', padding:'7px 0', borderRadius:8, fontSize:'0.8rem', fontWeight:active?700:500, color:active?'#fff':'#67e8f9', background:active?info.activeBg:'rgba(6,182,212,0.08)', border:`1px solid ${active?info.color:'rgba(6,182,212,0.25)'}`, cursor:'pointer', transition:'all 0.12s', boxShadow:active?`0 0 8px ${info.color}80`:'none', fontFamily:'Rubik,Heebo,sans-serif' }}>
                              {shortLabel(btn.houseGrid ? (btn.fullDescription || btn.description) : btn.description)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {listBtns.map(btn => {
                      const active = openSections[btn.sectionKey];
                      return (
                        <button key={btn.key} onClick={() => toggleSection(btn.sectionKey)} title={btn.fullDescription} style={{ display:'block', width:'100%', textAlign:'right', padding:'7px 10px', marginBottom:4, borderRadius:'8px', fontSize:'0.78rem', fontWeight: active ? '700' : '400', color: active ? 'white' : info.color, background: active ? info.activeBg : `${info.color}12`, border:`1px solid ${active ? info.color : `${info.color}40`}`, cursor:'pointer', transition:'all 0.15s', boxShadow: active ? `0 0 10px ${info.color}55` : 'none', fontFamily:'Rubik, Heebo, sans-serif', lineHeight:'1.35' }}>
                          {shortLabel(btn.description)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    );
  };

  const allButtons = [];

  if (roundTables.length > 0) {
    const allAreGroups = roundTables.every(table => table.id.startsWith('בית') || table.description?.startsWith('בית'));
    if (allAreGroups) {
      // 🏠 גריד בתים — כפתור לכל בית + כפתור מסכם
      roundTables.forEach((table, idx) => {
        const short = String(table.description || table.id).replace(/^בית\s*/, '').trim() || table.id;
        allButtons.push({ numericId: idx, key:`round_${table.id}`, description: short, fullDescription: table.description || table.id, sectionKey:`round_${table.id}`, stageType:'groups', houseGrid:true, isLongText:false });
      });
      allButtons.push({ numericId: 990, key:'rounds', description:'📊 כל הבתים + טבלת ניקוד', sectionKey:'rounds', stageType:'groups', isLongText:false });
    } else {
      roundTables.forEach(table => {
        const description = table.description || table.id;
        allButtons.push({ numericId: parseInt(table.id.replace('T','').replace(/\D/g,''),10)||0, key:`round_${table.id}`, description, stageType: table.questions[0]?.stage_type || 'playoff', sectionKey:`round_${table.id}`, isLongText: description.length > TEXT_LENGTH_THRESHOLD });
      });
    }
  }

  specialTables.forEach(table => {
    const description = table.description;
    allButtons.push({ numericId: table.questions[0]?.stage_order || parseInt(table.id.replace('T','').replace(/\D/g,''),10), key:table.id, description, stageType: table.questions[0]?.stage_type || 'special', sectionKey:table.id, isLongText: description.length > TEXT_LENGTH_THRESHOLD });
  });

  if (locationTables.length > 0) {
    const firstLocationTableId = locationTables[0]?.id || 'T14';
    const description = 'מיקומים בתום שלב הבתים';
    allButtons.push({ numericId: parseInt(firstLocationTableId.replace('T',''),10), key:'locations', description, stageType:'qualifiers', sectionKey:'locations', isLongText: description.length > TEXT_LENGTH_THRESHOLD });
  }

  qualifiersTables.forEach(table => {
    const description = table.description || table.id;
    allButtons.push({ numericId: table.questions[0]?.stage_order || parseInt(table.id.replace('T',''))||0, key:`qual_${table.id}`, description, stageType:'qualifiers', sectionKey:`qual_${table.id}`, isLongText: description.length > TEXT_LENGTH_THRESHOLD });
  });

  if (israeliTable) {
    const description = israeliTable.description;
    allButtons.push({ numericId: parseInt(israeliTable.id.replace('T',''),10), key:israeliTable.id, description, stageType:'special', sectionKey:'israeli', isLongText: description.length > TEXT_LENGTH_THRESHOLD });
  }

  if (playoffWinnersTable) {
    const description = playoffWinnersTable.description;
    allButtons.push({ numericId: parseInt(playoffWinnersTable.id.replace('T',''),10), key:playoffWinnersTable.id, description, stageType:'qualifiers', sectionKey:'playoffWinners', isLongText: description.length > TEXT_LENGTH_THRESHOLD });
  }

  allButtons.sort((a, b) => {
    if (a.sectionKey === 'rounds' && b.sectionKey !== 'rounds') return -1;
    if (b.sectionKey === 'rounds' && a.sectionKey !== 'rounds') return 1;
    return a.numericId - b.numericId;
  });

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', maxWidth: '100vw' }}>
      <style>{`
        /* ── ViewSubmissions mobile fixes ── */
        @media (max-width: 768px) {

          .vs-grid-row {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding-bottom: 4px !important;
          }

          .vs-simple-row {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            gap: 6px !important;
            padding: 10px 12px !important;
          }
          .vs-simple-row .vs-q-id   { flex: 0 0 auto; }
          .vs-simple-row .vs-q-text { flex: 1 1 100%; font-size: 0.88rem !important; }
          .vs-simple-row .vs-q-val  { flex: 1 1 auto; }
          .vs-simple-row .vs-score  { flex: 0 0 auto; }

          .vs-q-text  { font-size: 0.88rem !important; }
          .vs-score   { font-size: 0.8rem !important; }

          .vs-sidebar-desktop { display: none !important; }

          .sticky .btn, .sticky button {
            font-size: 0.78rem !important;
            padding: 6px 10px !important;
          }
        }

        @media (max-width: 480px) {
          .vs-simple-row .vs-q-text { font-size: 0.82rem !important; }
        }
      `}</style>
      <div className="vs-header sticky top-0 z-30 backdrop-blur-sm shadow-lg" style={{ background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid rgba(6,182,212,0.2)' }}>
        <style>{`
          @media (max-width: 767px) {
            .vs-header { position: relative !important; top: auto !important; }
            .vs-admin-actions { display: none !important; }
            .vs-admin-actions.vs-actions-open { display: flex !important; }
          }
        `}</style>
        <div className="px-3 md:px-6 py-2 md:py-2.5 w-full">
          <div className="flex flex-row justify-between items-center gap-2 mb-2">
            <h1 className="text-base md:text-xl font-bold flex items-center gap-2" style={{ color:'#f8fafc', textShadow:'0 0 10px rgba(6,182,212,0.3)' }}>
              <Users className="w-5 h-5 md:w-6 md:h-6" style={{ color:'#06b6d4' }} />
              צפייה בניחושים
            </h1>
            {/* כפתור פעולות מנהל — נייד בלבד */}
            {isAdmin && (
              <button onClick={() => setMobileActionsOpen(o => !o)} className="md:hidden" style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:9, background:'rgba(6,182,212,0.12)', border:'1px solid rgba(6,182,212,0.35)', color:'#22d3ee', fontSize:'0.8rem', fontFamily:'Rubik,Heebo,sans-serif', cursor:'pointer', flexShrink:0 }}>
                ⚙️ פעולות
              </button>
            )}
            <div className={`vs-admin-actions flex gap-1.5 md:gap-3 flex-wrap w-full md:w-auto${mobileActionsOpen ? ' vs-actions-open' : ''}`}>
              {isAdmin && selectedParticipant && !loadingPredictions && (
                <>
                  {!isEditMode ? (
                    <Button onClick={() => setIsEditMode(true)} variant="outline" style={{ borderColor:'rgba(6,182,212,0.5)', color:'#06b6d4', background:'rgba(30,41,59,0.4)' }} className="hover:bg-cyan-500/20">
                      <Pencil className="w-4 h-4 ml-2" /> ערוך ניחושים
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => { setEditedPredictions({}); setIsEditMode(false); }} variant="outline" style={{ borderColor:'rgba(148,163,184,0.5)', color:'#94a3b8', background:'rgba(30,41,59,0.4)' }} className="hover:bg-slate-500/20" disabled={savingChanges}>ביטול</Button>
                      <Button onClick={handleSaveChanges} disabled={Object.keys(editedPredictions).length === 0 || savingChanges}
                        style={{ background: Object.keys(editedPredictions).length > 0 ? 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)' : 'rgba(71,85,105,0.5)', boxShadow: Object.keys(editedPredictions).length > 0 ? '0 0 20px rgba(6,182,212,0.4)' : 'none', color: Object.keys(editedPredictions).length > 0 ? 'white' : '#64748b' }}>
                        {savingChanges ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />שומר...</> : <><Save className="w-4 h-4 ml-2" />שמור שינויים {Object.keys(editedPredictions).length > 0 && `(${Object.keys(editedPredictions).length})`}</>}
                      </Button>
                    </>
                  )}
                </>
              )}
              {isAdmin && (
                <>
                  <Button onClick={handleExportData} disabled={exporting} variant="outline" style={{ borderColor:'rgba(34,197,94,0.5)', color:'#86efac', background:'rgba(30,41,59,0.4)' }} className="hover:bg-green-500/20">
                    {exporting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />מייצא...</> : <><Download className="w-4 h-4 ml-2" />ייצוא לקובץ</>}
                  </Button>
                  <Button onClick={() => { loadParticipantStats(); setShowDeleteDialog(true); }} variant="outline" style={{ borderColor:'rgba(239,68,68,0.5)', color:'#fca5a5', background:'rgba(30,41,59,0.4)' }} className="hover:bg-red-500/20">
                    <Trash2 className="w-4 h-4 ml-2" /> ניהול משתתפים
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold" style={{ color:'#06b6d4', whiteSpace:'nowrap' }}>בחר משתתף:</span>
            <ParticipantSearchSelect participants={allParticipants} selected={selectedParticipant} onSelect={setSelectedParticipant} />
            {selectedParticipant && <ParticipantTotalScore participantName={selectedParticipant} gameId={currentGame?.id} />}
          </div>

          {loadingPredictions && (
            <div className="flex items-center justify-center py-4 mt-4">
              <Loader2 className="w-6 h-6 animate-spin ml-2" style={{ color:'#06b6d4' }} />
              <span style={{ color:'#06b6d4' }}>טוען ניחושים...</span>
            </div>
          )}

          <div className="vs-mobile-chips" style={{ display:"block" }}>
            <style>{`@media (min-width: 768px) { .vs-mobile-chips { display: none !important; } }`}</style>
            {selectedParticipant && !loadingPredictions && (specialTables.length > 0 || roundTables.length > 0 || locationTables.length > 0 || israeliTable || playoffWinnersTable || qualifiersTables.length > 0) && (
              <div style={{ marginBottom:'14px' }}>{renderMobileNav(allButtons.map(b=>b.houseGrid?{...b,description:b.fullDescription||b.description}:b), openSections, toggleSection)}</div>
            )}
          </div>

          {!selectedParticipant && !loadingPredictions && (
            <Alert className="mt-4" style={{ background:'rgba(30,41,59,0.6)', border:'1px solid rgba(6,182,212,0.2)', color:'#f8fafc' }}>
              <FileText className="w-4 h-4" style={{ color:'#06b6d4' }} />
              <AlertDescription style={{ color:'#94a3b8' }}>בחר משתתף כדי לראות את הניחושים שלו.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="p-3 md:p-6 w-full">
        {selectedParticipant && !loadingPredictions && participantQuestions.length > 0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'14px', alignItems:'center' }}>
            {participantQuestions.map(q => {
              const isNameField = q.question_text?.includes("שם");
              const displayValue = isNameField ? selectedParticipant : (participantDetails[q.id] || '-');
              if (isEditMode && isAdmin && !isNameField) {
                const editedVal = editedPredictions[q.id];
                const currentVal = editedVal !== undefined ? editedVal : (participantDetails[q.id] || '');
                return (
                  <div key={q.id} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                    <span style={{ fontSize:'0.72rem', color:'#64748b' }}>{q.question_text}:</span>
                    <input type="text" value={currentVal} onChange={e => handlePredictionEdit(q.id, e.target.value)} style={{ width:'130px', background:'rgba(15,23,42,0.8)', border:'1px solid rgba(6,182,212,0.5)', color:'#f8fafc', outline:'none', borderRadius:6, padding:'3px 8px', fontSize:'0.8rem', textAlign:'right' }} />
                  </div>
                );
              }
              return (
                <span key={q.id} style={{ display:'inline-flex', alignItems:'center', gap:'5px', background:'rgba(15,23,42,0.6)', border:'1px solid rgba(6,182,212,0.18)', borderRadius:999, padding:'3px 11px', fontSize:'0.78rem' }}>
                  <span style={{ color:'#64748b' }}>{q.question_text}:</span>
                  <span style={{ color:'#f8fafc', fontWeight:600 }}>{displayValue}</span>
                </span>
              );
            })}
          </div>
        )}
        {selectedParticipant && !loadingPredictions ? (
          <div style={{ display:'flex', gap:'20px', alignItems:'flex-start' }}>
            <div style={{ display:'none', position:'sticky', top:'70px', alignSelf:'flex-start', flexShrink:0, zIndex:5 }} className="vs-sidebar-desktop">{renderSidebar()}</div>
            <style>{`@media (min-width: 768px) { .vs-sidebar-desktop { display: block !important; } }`}</style>
            <div style={{ flex:1, minWidth:0 }}>
              {allButtons.map(button => {
                if (!openSections[button.sectionKey]) return null;
                if (button.sectionKey === 'rounds') {
                  return (
                    <div key="rounds-section" className="mb-6 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {roundTables.map(table => (
                          <RoundTableReadOnly key={table.id} table={table} teams={data.teams} predictions={getCombinedPredictionsMap()} isEditMode={isEditMode && isAdmin} handlePredictionEdit={handlePredictionEdit} />
                        ))}
                      </div>
                      <StandingsTable roundTables={roundTables} teams={data.teams} data={getCombinedPredictionsMap()} type="predictions" />
                    </div>
                  );
                } else if (button.sectionKey.startsWith('round_')) {
                  const tableId = button.sectionKey.replace('round_', '');
                  const table = roundTables.find(t => t.id === tableId);
                  const isHouse = String(tableId).startsWith('בית');
                  if (table) return (
                    <div key={button.sectionKey} className="mb-6">
                      {isHouse ? (
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,400px)] gap-4 items-start">
                          <RoundTableReadOnly key={table.id} table={table} teams={data.teams} predictions={getCombinedPredictionsMap()} isEditMode={isEditMode && isAdmin} handlePredictionEdit={handlePredictionEdit} />
                          <GroupStandingsVS table={table} teams={data.teams} predictions={getCombinedPredictionsMap()} />
                        </div>
                      ) : (
                        <RoundTableReadOnly key={table.id} table={table} teams={data.teams} predictions={getCombinedPredictionsMap()} isEditMode={isEditMode && isAdmin} handlePredictionEdit={handlePredictionEdit} />
                      )}
                      {table.specialQuestions && table.specialQuestions.length > 0 && <div className="mt-4">{renderSpecialQuestions({ ...table, questions: table.specialQuestions })}</div>}
                    </div>
                  );
                } else if (button.sectionKey.startsWith('qual_')) {
                  const tableId = button.sectionKey.replace('qual_', '');
                  const table = qualifiersTables.find(t => t.id === tableId);
                  // 🌍 במונדיאל T16/T17 — תצוגת שאלות מלאה (כולל כן/לא), שאר העולות — רשימת קבוצות
                  if (table) return <div key={button.sectionKey} className="mb-6">{isWC && table.id === 'T16' ? renderWCGroupLeaders(table) : isWC && table.id === 'T17' ? renderSpecialQuestions(table) : renderQualifiersTable(table)}</div>;
                } else if (button.sectionKey === 'israeli' && israeliTable) {
                  return <div key="israeli-section" className="mb-6"><RoundTableReadOnly table={israeliTable} teams={data.teams} predictions={getCombinedPredictionsMap()} isEditMode={isEditMode && isAdmin} handlePredictionEdit={handlePredictionEdit} /></div>;
                } else if (button.sectionKey === 'locations') {
                  return <div key="locations-section" className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">{locationTables.map(table => <div key={table.id}>{renderSpecialQuestions(table)}</div>)}</div>;
                } else if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) {
                  return <div key="playoffWinners-section" className="mb-6">{renderSpecialQuestions(playoffWinnersTable)}</div>;
                } else {
                  const specificSpecialTable = specialTables.find(t => t.id === button.key);
                  if (specificSpecialTable) return <div key={specificSpecialTable.id} className="mb-6">{renderSpecialQuestions(specificSpecialTable)}</div>;
                }
                return null;
              })}
            </div>
          </div>
        ) : null}
      </div>

      {isAdmin && (
        <>
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent className="max-w-2xl" dir="rtl" style={{ background:'#1e293b', border:'1px solid rgba(6,182,212,0.3)' }}>
              <DialogHeader>
                <DialogTitle className="2xl font-bold flex items-center gap-2" style={{ color:'#f8fafc' }}>
                  <AlertTriangle className="w-6 h-6" style={{ color:'#ef4444' }} /> ניהול משתתפים
                </DialogTitle>
                <DialogDescription className="text-slate-300">
                  לחץ על כפתור המחיקה כדי למחוק את כל הניחושים של משתתף. <strong className="text-red-300">פעולה זו אינה הפיכה!</strong>
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto">
                {participantStats.length === 0 ? (
                  <div className="text-center py-8 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color:'#94a3b8' }} />
                    <span style={{ color:'#94a3b8' }}>טוען נתונים...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {participantStats.map(stat => (
                      <div key={stat.name} className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-700/50" style={{ background:'rgba(15,23,42,0.6)', border:'1px solid rgba(6,182,212,0.2)' }}>
                        <div>
                          <p className="font-medium" style={{ color:'#f8fafc' }}>{stat.name}</p>
                          <p className="text-sm" style={{ color:'#94a3b8' }}>{stat.predictionsCount} ניחושים</p>
                        </div>
                        <Button onClick={() => handleDeleteParticipant(stat.name)} disabled={deletingParticipant === stat.name} variant="destructive" size="sm">
                          {deletingParticipant === stat.name ? <><Loader2 className="w-4 h-4 ml-2" />מוחק...</> : <><Trash2 className="w-4 h-4 ml-2" />מחק</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showMissingReport} onOpenChange={setShowMissingReport}>
            <DialogContent className="max-w-6xl max-h-[90vh]" dir="rtl" style={{ background:'#1e293b', border:'1px solid rgba(6,182,212,0.3)' }}>
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color:'#f8fafc' }}>
                  <AlertTriangle className="w-6 h-6" style={{ color:'#fcd34d' }} /> דוח ניחושים חסרים
                </DialogTitle>
                <DialogDescription className="text-slate-300">שאלות עם ניחושים חסרים, ממוינות לפי סדר השלבים</DialogDescription>
              </DialogHeader>
              <div className="overflow-y-auto max-h-[70vh]">
                {loadingMissing ? (
                  <div className="text-center py-8 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color:'#94a3b8' }} />
                    <span style={{ color:'#94a3b8' }}>מחשב...</span>
                  </div>
                ) : missingPredictions.length === 0 ? (
                  <div className="text-center py-8" style={{ color:'#10b981' }}>
                    <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color:'#10b981' }} />
                    <p className="text-lg font-bold">מצוין! כל המשתתפים ענו על כל השאלות!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg" style={{ background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.3)' }}>
                      <p className="text-sm font-bold" style={{ color:'#fcd34d' }}>נמצאו {missingPredictions.length} שאלות עם ניחושים חסרים (סה"כ {missingPredictions.reduce((sum, m) => sum + m.missing_count, 0)} ניחושים)</p>
                    </div>
                    <table className="w-full">
                      <thead style={{ position:'sticky', top:0, zIndex:10, background:'#1e293b', borderBottom:'2px solid rgba(6,182,212,0.3)' }}>
                        <tr>
                          <th className="text-center p-2 text-sm" style={{ color:'#94a3b8', width:'80px' }}>טבלה</th>
                          <th className="text-center p-2 text-sm" style={{ color:'#94a3b8', width:'60px' }}>מס׳</th>
                          <th className="text-right p-2 text-sm" style={{ color:'#94a3b8' }}>שאלה</th>
                          <th className="text-center p-2 text-sm" style={{ color:'#94a3b8', width:'80px' }}>חסרים</th>
                          <th className="text-right p-2 text-sm" style={{ color:'#94a3b8', width:'200px' }}>משתתפים</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missingPredictions.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-700/50" style={{ borderBottom:'1px solid rgba(6,182,212,0.1)' }}>
                            <td className="text-center p-2"><Badge variant="outline" style={{ borderColor:'#06b6d4', color:'#06b6d4' }}>{item.table_id}</Badge></td>
                            <td className="text-center p-2"><Badge variant="outline" style={{ borderColor:'#0ea5e9', color:'#0ea5e9' }}>{item.question_id}</Badge></td>
                            <td className="text-right p-2 text-sm" style={{ color:'#f8fafc' }}>{item.question_text}</td>
                            <td className="text-center p-2"><Badge className="text-white font-bold" style={{ background:'#ef4444', boxShadow:'0 0 10px rgba(239,68,68,0.4)' }}>{item.missing_count}</Badge></td>
                            <td className="text-right p-2 text-xs" style={{ color:'#94a3b8' }}>{item.missing_participants.slice(0,3).join(', ')}{item.missing_participants.length > 3 && ` ועוד ${item.missing_participants.length - 3}...`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}


// 🔍 בוחר משתתף עם חיפוש — הקלדה מסננת את הרשימה
function ParticipantSearchSelect({ participants, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState(null);
  const ref = React.useRef(null);
  const listRef = React.useRef(null);

  // מיקום הרשימה לפי שדה החיפוש (Portal — מעל הכל, בלי בעיות שכבות)
  const updatePos = React.useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  const openList = () => { updatePos(); setOpen(true); };

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          listRef.current && !listRef.current.contains(e.target)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // עדכון מיקום בגלילה/שינוי גודל כשהרשימה פתוחה
  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePos();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); };
  }, [open, updatePos]);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    if (!q) return participants;
    return participants.filter(p => p.includes(q));
  }, [participants, query]);

  useEffect(() => { setHighlight(0); }, [query]);
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[highlight];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight, open]);

  const choose = (name) => { onSelect(name); setQuery(''); setOpen(false); };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { openList(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) choose(filtered[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  const dropdown = open && pos ? createPortal(
    <div ref={listRef} dir="rtl" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 100000, maxHeight: '300px', overflowY: 'auto', backgroundColor: '#0b1220', backgroundImage: 'linear-gradient(180deg, #101b30 0%, #0b1220 100%)', border: '1px solid rgba(6,182,212,0.5)', borderRadius: '8px', boxShadow: '0 12px 32px rgba(0,0,0,0.85)' }}>
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.82rem', textAlign: 'right' }}>לא נמצאו שמות מתאימים</div>
      ) : filtered.map((p, i) => (
        <div key={p}
          onClick={() => choose(p)}
          onMouseEnter={() => setHighlight(i)}
          style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'right', color: p === selected ? '#22d3ee' : '#f8fafc', fontWeight: p === selected ? 700 : 400, background: i === highlight ? 'rgba(6,182,212,0.22)' : '#0b1220', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {p}
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={ref} style={{ position: 'relative', width: '230px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '34px', padding: '0 10px', borderRadius: '6px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.3)' }}>
        <input
          value={open ? query : (selected || '')}
          onChange={(e) => { setQuery(e.target.value); if (!open) openList(); }}
          onFocus={() => { openList(); setQuery(''); }}
          onKeyDown={onKeyDown}
          placeholder={selected || 'הקלד שם לחיפוש...'}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '0.85rem', textAlign: 'right', fontFamily: 'inherit' }}
        />
        {selected && !open && (
          <button onClick={() => { onSelect(null); setQuery(''); }} title="נקה בחירה" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.8rem', padding: '0 2px', lineHeight: 1 }}>✕</button>
        )}
        <span onClick={() => { if (open) { setOpen(false); } else { openList(); } setQuery(''); }} style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.65rem' }}>▼</span>
      </div>
      {dropdown}
    </div>
  );
}
