import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Prediction, Question, Team, ValidationList, User, SystemSettings } from "@/entities/all";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { Users, Loader2, ChevronDown, ChevronUp, FileText, Trash2, AlertTriangle, Trophy, Pencil, Save, Download, Award, CheckCircle, Menu, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RoundTableReadOnly from "../components/predictions/RoundTableReadOnly";
import { calculateQuestionScore, calculateLocationBonus } from "@/components/scoring/ScoreService";
import StandingsTable from "../components/predictions/StandingsTable";
import { useGame } from "@/components/contexts/GameContext";

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
      } catch (error) { setTotalScore(null); }
      setLoading(false);
    };
    loadScore();
  }, [participantName, gameId]);

  if (loading) return <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--tp)' }} />;
  if (totalScore === null) return null;
  return (
    <Badge className="text-white text-sm px-3 py-1 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, var(--tp) 0%, var(--tp) 100%)', boxShadow: '0 0 10px var(--tp-40)' }}>
      <Award className="w-4 h-4" />
      סה"כ: {totalScore} נקודות
    </Badge>
  );
}


export default function ViewSubmissions() {
  const [loading, setLoading] = useState(true);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [data, setData] = useState({ predictions: [], questions: [], teams: [], validationLists: [] });
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [openSections, setOpenSections] = useState({});
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
  // 🆕 Mobile sidebar toggle
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { toast } = useToast();
  const { currentGame } = useGame();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
        if (isAuth) { const user = await supabase.auth.getUser().then(r => r.data.user); setCurrentUser(user); }
        else setCurrentUser(null);
      } catch (error) { setCurrentUser(null); }
    };
    loadUser();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!currentGame) { setLoading(false); return; }
      setLoading(true);
      try {
        const [samplePredictions, questions] = await Promise.all([
          Prediction.filter({ game_id: currentGame.id }, null, 10000),
          Question.filter({ game_id: currentGame.id }, "-created_at", 10000)
        ]);
        const teamsData = currentGame.teams_data || [];
        const validationListsData = currentGame.validation_lists || [];
        const teamsMap = teamsData.reduce((acc, team) => { acc[team.name] = team; return acc; }, {});
        const listsMap = validationListsData.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {});
        const teamListObj = validationListsData.find(list => list.list_name?.toLowerCase().includes('קבוצ') && !list.list_name?.toLowerCase().includes('מוקדמות'));
        if (teamListObj) setTeamValidationList(teamListObj.options);

        // 🔥 טוען רשימת משתתפים מ-game_participants — לא מניחושים (db.filter מוגבל ל-1000)
        const { data: gpData } = await supabase
          .from('game_participants')
          .select('participant_name')
          .eq('game_id', currentGame.id)
          .order('participant_name', { ascending: true });
        const allParticipantNames = gpData && gpData.length > 0
          ? [...new Set(gpData.map(r => r.participant_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'))
          : [...new Set(samplePredictions.map(p => p.participant_name))].sort((a, b) => a.localeCompare(b, 'he'));
        setAllParticipants(allParticipantNames);
        const rTables = {}, sTables = {};
        questions.forEach(q => {
          if (!q.table_id) return;
          if ((q.table_id === 'T20' || q.table_id === 'T3') && q.question_text && !q.home_team) {
            let teams = null;
            if (q.question_text.includes(' נגד ')) teams = q.question_text.split(' נגד ').map(t => t.trim());
            else if (q.question_text.includes(' - ')) teams = q.question_text.split(' - ').map(t => t.trim());
            if (teams && teams.length === 2) { q.home_team = teams[0]; q.away_team = teams[1]; }
          }
          const tableCollection = (q.home_team && q.away_team) ? rTables : sTables;
          let tableId = q.table_id;
          let tableDescription = q.table_description;
          if (q.stage_name && q.stage_name.includes('בית')) { tableId = q.stage_name; tableDescription = q.stage_name; }
          else if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order && q.table_id !== 'T10') { tableId = `custom_order_${q.stage_order}`; tableDescription = q.stage_name || q.table_description; }
          if (q.table_id === 'T12') tableDescription = 'שלב הליגה - פינת הגאווה הישראלית - 7 בוםםםםםםםםםם !!!';
          else if (q.table_id === 'T13') tableDescription = 'שלב ראש בראש - "מבול מטאורים של כוכבים (*)"';
          if (!tableCollection[tableId]) tableCollection[tableId] = { id: tableId, description: tableDescription || (q.home_team && q.away_team ? `מחזור ${tableId.replace('T','')}` : `שאלות ${tableId.replace('T','')}`), questions: [] };
          tableCollection[tableId].questions.push(q);
        });
        const t20Table = rTables['T20']; delete rTables['T20']; setIsraeliTable(t20Table || null);
        const participantQns = sTables['T1'] ? sTables['T1'].questions : [];
        const uniqueParticipantQns = participantQns.reduce((acc, current) => { if (!acc.find(item => item.question_text === current.question_text)) acc.push(current); return acc; }, []);
        setParticipantQuestions(uniqueParticipantQns);
        delete sTables['T1'];
        const sortedRoundTables = Object.values(rTables).sort((a,b) => {
          const aIsGroup = a.id.includes('בית'), bIsGroup = b.id.includes('בית');
          if (aIsGroup && !bIsGroup) return -1; if (!aIsGroup && bIsGroup) return 1;
          if (aIsGroup && bIsGroup) return a.id.charAt(a.id.length-1).localeCompare(b.id.charAt(b.id.length-1), 'he');
          return (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0);
        });
        setRoundTables(sortedRoundTables);
        const locationTableIds = ['T9', 'T14', 'T15', 'T16', 'T17'];
        setLocationTables(Object.values(sTables).filter(t => locationTableIds.includes(t.id)).sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0)));
        const t19Table = sTables['T19']; setPlayoffWinnersTable(t19Table || null);
        const allSpecialTables = Object.values(sTables).filter(table => {
          const desc = table.description?.trim(); const isGroup = table.id.includes('בית') || desc?.includes('בית'); const stageType = table.questions[0]?.stage_type;
          return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && table.id !== 'T19' && !isGroup && stageType !== 'qualifiers';
        }).sort((a,b) => { const oa = a.questions[0]?.stage_order || 999, ob = b.questions[0]?.stage_order || 999; if (oa !== ob) return oa - ob; return (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0); });
        setSpecialTables(allSpecialTables);
      // ── שינוי שם T3 ──────────────────────────────────────────
      sortedRoundTables.forEach(t => {
        if (t.id === 'T3') t.description = 'שלב שמינית הגמר - המשחקים!';
      });
      allSpecialTables.forEach(t => {
        if (t.id === 'T3') t.description = 'שלב שמינית הגמר - המשחקים!';
      });
        const t10Special = sTables['T10'];
        if (t10Special) { const t10Round = Object.values(rTables).find(t => t.id === 'T10'); if (t10Round) t10Round.specialQuestions = t10Special.questions; }
        setQualifiersTables(Object.values(sTables).filter(t => t.questions[0]?.stage_type === 'qualifiers').sort((a,b) => (a.questions[0]?.stage_order || 999) - (b.questions[0]?.stage_order || 999)));
        setData(prev => ({ ...prev, questions, teams: teamsMap, validationLists: listsMap }));
      } catch (error) { console.error("Error loading data:", error); }
      setLoading(false);
    };
    loadData();
  }, [currentGame]);

  useEffect(() => {
    const loadParticipantPredictions = async () => {
      if (!selectedParticipant || !currentGame) { setData(prev => ({ ...prev, predictions: [] })); setEditedPredictions({}); setIsEditMode(false); return; }
      setLoadingPredictions(true);
      try {
        // 🔥 Prediction.filter() עובד עם auth ועם entities — כל משתתף < 500 ניחושים
        const predictions = await Prediction.filter(
          { participant_name: selectedParticipant, game_id: currentGame.id },
          "created_at",
          5000
        );
        setData(prev => ({ ...prev, predictions })); setEditedPredictions({}); setIsEditMode(false);
      } catch (error) { console.error("Error loading participant predictions:", error); }
      setLoadingPredictions(false);
    };
    loadParticipantPredictions();
  }, [selectedParticipant, currentUser, currentGame]);

  const participantPredictions = useMemo(() => {
    if (!selectedParticipant) return {};
    const tempPreds = {};
    data.predictions.forEach(p => {
      const existing = tempPreds[p.question_id];
      if (!existing || new Date(p.created_at) > new Date(existing.created_at)) tempPreds[p.question_id] = { text_prediction: p.text_prediction, home_prediction: p.home_prediction, away_prediction: p.away_prediction, created_at: p.created_at };
    });
    const predMap = {};
    for (const [qid, pred] of Object.entries(tempPreds)) {
      if (pred.home_prediction !== null && pred.home_prediction !== undefined && pred.away_prediction !== null && pred.away_prediction !== undefined) predMap[qid] = pred.home_prediction + '-' + pred.away_prediction;
      else predMap[qid] = pred.text_prediction;
    }
    return predMap;
  }, [selectedParticipant, data.predictions]);

  const getCombinedPredictionsMap = useCallback(() => ({ ...participantPredictions, ...editedPredictions }), [participantPredictions, editedPredictions]);

  const participantDetails = useMemo(() => {
    if (!selectedParticipant) return {};
    const details = { name: selectedParticipant };
    participantQuestions.forEach(q => { const pred = data.predictions.find(p => p.question_id === q.id); if (pred) details[q.id] = pred.text_prediction; });
    return details;
  }, [selectedParticipant, participantQuestions, data.predictions]);

  const loadParticipantStats = async () => {
    if (!currentGame) return;
    try {
      const allPredictions = await Prediction.filter({ game_id: currentGame.id }, null, 10000);
      const stats = {};
      allPredictions.forEach(pred => { if (!stats[pred.participant_name]) stats[pred.participant_name] = 0; stats[pred.participant_name]++; });
      setParticipantStats(Object.entries(stats).map(([name, count]) => ({ name, predictionsCount: count })).sort((a, b) => a.name.localeCompare(b.name, 'he')));
    } catch (error) { toast({ title: "שגיאה", description: "טעינת נתוני משתתפים נכשלה.", variant: "destructive" }); }
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
        toast({ title: "מוחק...", description: `נמחקו ${Math.min(i + BATCH_SIZE, predictionsToDelete.length)}/${predictionsToDelete.length}`, className: "bg-yellow-900/30 border-yellow-500 text-yellow-200" });
        if (i + BATCH_SIZE < predictionsToDelete.length) await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
      toast({ title: "נמחק בהצלחה!", description: `נמחקו ${predictionsToDelete.length} ניחושים של ${participantName}.`, className: "bg-green-900/30 border-green-500 text-green-200" });
      setAllParticipants(prev => prev.filter(p => p !== participantName));
      if (selectedParticipant === participantName) setSelectedParticipant(null);
      await loadParticipantStats();
    } catch (error) { toast({ title: "שגיאה", description: "מחיקת המשתתף נכשלה: " + error.message, variant: "destructive" }); }
    finally { setDeletingParticipant(null); }
  };

  const handlePredictionEdit = (questionId, newValue) => {
    if (!isEditMode) return;
    const originalValue = participantPredictions[questionId] || '';
    if (newValue === originalValue) { setEditedPredictions(prev => { const s = { ...prev }; delete s[questionId]; return s; }); }
    else setEditedPredictions(prev => ({ ...prev, [questionId]: newValue }));
  };

  const handleSaveChanges = async () => {
    const changedPredictions = Object.entries(editedPredictions);
    if (changedPredictions.length === 0) { toast({ title: "אין שינויים", description: "לא בוצעו שינויים בניחושים", className: "bg-blue-900/30 border-blue-500 text-blue-200" }); return; }
    setSavingChanges(true);
    try {
      let updatedCount = 0;
      for (const [questionId, newValue] of changedPredictions) {
        const prediction = data.predictions.find(p => p.question_id === questionId);
        if (prediction) { await Prediction.update(prediction.id, { text_prediction: newValue }); updatedCount++; }
        else { await Prediction.create({ question_id: questionId, participant_name: selectedParticipant, text_prediction: newValue }); updatedCount++; }
      }
      toast({ title: "שינויים נשמרו!", description: `עודכנו ${updatedCount} ניחושים עבור ${selectedParticipant}`, className: "bg-green-900/30 border-green-500 text-green-200" });
      const predictions = await Prediction.filter({ participant_name: selectedParticipant, game_id: currentGame.id }, null, 10000);
      setData(prev => ({ ...prev, predictions })); setEditedPredictions({}); setIsEditMode(false);
    } catch (error) { toast({ title: "שגיאה", description: "שמירת השינויים נכשלה", variant: "destructive" }); }
    setSavingChanges(false);
  };

  const toggleSection = (sectionId) => {
    setOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
    setMobileSidebarOpen(false); // close mobile sidebar after selection
  };

  const handleExportData = async () => {
    if (!currentGame) return;
    setExporting(true);
    try {
      let allPredictions = [], skip = 0;
      while (true) { const batch = await Prediction.filter({ game_id: currentGame.id }, null, 10000, skip); allPredictions = [...allPredictions, ...batch]; if (batch.length < 10000) break; skip += 10000; }
      const participants = [...new Set(allPredictions.map(p => p.participant_name))].sort();
      const headers = ['שלב', 'מס\' שאלה', 'שאלה', 'רשימת אימות', ...participants];
      const predictionsByQuestion = {};
      allPredictions.forEach(p => { if (!predictionsByQuestion[p.question_id]) predictionsByQuestion[p.question_id] = {}; predictionsByQuestion[p.question_id][p.participant_name] = p.text_prediction || ''; });
      const sortedQuestions = [...data.questions].sort((a, b) => { const oa = a.stage_order || 0, ob = b.stage_order || 0; if (oa !== ob) return oa - ob; return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0); });
      const rows = sortedQuestions.map(q => {
        const questionText = q.question_text || `${q.home_team || ''} נגד ${q.away_team || ''}`;
        const participantValues = participants.map(p => { let pred = predictionsByQuestion[q.id]?.[p] || ''; if (pred && pred.includes('-')) pred = "'" + pred; return pred; });
        let safeQT = questionText; if (safeQT && safeQT.includes('-')) safeQT = "'" + safeQT;
        return [q.stage_name || q.table_description || q.table_id || '', q.question_id || '', safeQT, q.validation_list || '', ...participantValues];
      });
      const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `predictions_export_${currentGame.game_name}_${new Date().toISOString().split('T')[0]}.csv`; link.click();
      toast({ title: "ייצוא הושלם!", description: `יוצאו ${sortedQuestions.length} שאלות עבור ${participants.length} משתתפים`, className: "bg-green-900/30 border-green-500 text-green-200" });
    } catch (error) { toast({ title: "שגיאה", description: "ייצוא הנתונים נכשל", variant: "destructive" }); }
    setExporting(false);
  };

  const findMatchedTeamName = useCallback((predictionName) => {
    if (!predictionName || teamValidationList.length === 0) return predictionName;
    const trimmedPrediction = predictionName.trim();
    if (teamValidationList.includes(trimmedPrediction)) return trimmedPrediction;
    const baseName = trimmedPrediction.split('(')[0].trim();
    const normalizeTeamName = (name) => name.replace(/קרבאך/g, 'קרבאח').replace(/קראבח/g, 'קרבאח').replace(/קראבך/g, 'קרבאח').replace(/ת"א/g, 'תל אביב').replace(/ת.א/g, 'תל אביב');
    const normalizedBaseName = normalizeTeamName(baseName);
    for (const validName of teamValidationList) {
      const validBaseName = validName.split('(')[0].trim();
      if (normalizeTeamName(validBaseName) === normalizedBaseName) return validName;
    }
    return trimmedPrediction;
  }, [teamValidationList]);

  const getMaxPossibleScore = (question) => {
    if (question.table_id === 'T20' && question.home_team && question.away_team) return 6;
    if (question.possible_points != null && question.possible_points > 0) return question.possible_points;
    if (question.actual_result != null && question.actual_result !== '') return 10;
    if (question.table_id === 'T10') return question.possible_points || 10;
    return 0;
  };

  const renderReadOnlySelect = (question, originalValue) => {
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ');
    const locationTableIds = ['T14', 'T15', 'T16', 'T17', 'T19'];
    const isLocationQuestion = locationTableIds.includes(question.table_id);
    let displayTeamNameForReadonly = originalValue;
    if (isTeamsList && originalValue && isLocationQuestion) displayTeamNameForReadonly = findMatchedTeamName(originalValue);
    const team = isTeamsList ? data.teams[displayTeamNameForReadonly] : null;
    const maxScore = getMaxPossibleScore(question);
    const hasValue = originalValue && originalValue.trim() !== '';
    const hasActualResult = question.actual_result && question.actual_result.trim() !== '' && question.actual_result !== '__CLEAR__';
    const textColor = hasActualResult ? 'var(--tp)' : '#f8fafc';
    const isQuestion11_1 = question.question_id === '11.1';
    const isQuestion11_2 = question.question_id === '11.2';
    const boxWidth = isQuestion11_1 ? 'min-w-[60px] max-w-[65px]' : isQuestion11_2 ? 'min-w-[145px] max-w-[150px]' : 'min-w-[135px] max-w-[140px]';

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
            <SelectTrigger className={`${boxWidth} h-10`} style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--tp-30)', color: '#f8fafc' }}>
              {currentValue ? (<div className="flex items-center gap-2 w-full">{currentTeam?.logo_url && <img src={currentTeam.logo_url} alt={displayCurrentTeamNameForEdit} className="w-4 h-4 rounded-full" onError={(e) => e.target.style.display='none'} />}<span className="truncate">{displayCurrentTeamNameForEdit}</span></div>) : (<span className="text-slate-400">{isQuestion11_1 || isQuestion11_2 ? "" : "- בחר -"}</span>)}
            </SelectTrigger>
            <SelectContent style={{ background: 'var(--bg2)', border: '1px solid var(--tp-30)' }}>
              <SelectItem value="__CLEAR__" className="hover:bg-cyan-700/20" style={{ color: '#94a3b8' }}>-</SelectItem>
              {options.map(opt => { const cleanOpt = opt.replace(/\s*\([^)]+\)\s*$/, '').trim(); const optTeam = isTeamsList ? (data.teams[opt] || data.teams[cleanOpt]) : null; return (<SelectItem key={opt} value={opt} className="hover:bg-cyan-700/20" style={{ color: '#f8fafc' }}><div className="flex items-center gap-2">{optTeam?.logo_url && <img src={optTeam.logo_url} alt={cleanOpt} className="w-4 h-4 rounded-full" onError={(e) => e.target.style.display='none'} />}<span>{cleanOpt}</span></div></SelectItem>); })}
            </SelectContent>
          </Select>
          <div className="w-12"></div>
        </>
      );
    }

    if (isEditMode && isAdmin && (!question.validation_list || !data.validationLists[question.validation_list])) {
      const valueForInput = editedPredictions[question.id] !== undefined ? editedPredictions[question.id] : originalValue;
      return (<div className="flex items-center gap-2"><input type="text" value={valueForInput} onChange={(e) => handlePredictionEdit(question.id, e.target.value)} className="rounded-md px-3 py-2 min-w-[120px] h-10" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--tp-30)', color: '#f8fafc' }} /><Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">?/{maxScore}</Badge></div>);
    }

    if (!hasValue) return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <div className={`rounded-md px-2 py-2 ${boxWidth} flex items-center gap-1`} style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--tp-20)' }}>
          <span style={{ color: '#94a3b8', fontSize: isQuestion11_1 ? '0.65rem' : '0.875rem' }}>-</span>
        </div>
        {maxScore > 0 ? (
          <Badge className="bg-slate-700 text-slate-400 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">?/{maxScore}</Badge>
        ) : (
          <div className="w-12"></div>
        )}
      </div>
    );

    const score = calculateQuestionScore(question, originalValue);
    // 🔥 Fixed: replaced yellow badge with blue for partial scores
    let badgeColor = 'bg-slate-600 text-slate-300';
    if (score !== null) {
      if (score === maxScore && maxScore > 0) badgeColor = 'bg-green-700 text-green-100';
      else if (score === 0) badgeColor = 'bg-red-700 text-red-100';
      else if (maxScore > 0 && score >= maxScore * 0.7) badgeColor = 'bg-blue-600 text-blue-100';
      else if (score > 0) badgeColor = 'bg-blue-800 text-blue-200'; // 🔥 was yellow, now blue
    }

    return (<div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}><div className={`rounded-md px-2 py-2 ${boxWidth} flex items-center gap-1`} style={{ background: hasActualResult ? 'var(--tp-20)' : 'rgba(0,0,0,0.35)', border: hasActualResult ? '1px solid var(--tp)' : '1px solid var(--tp-20)', boxShadow: hasActualResult ? '0 0 10px var(--tp-40)' : 'none' }}>{team?.logo_url && <img src={team.logo_url} alt={displayTeamNameForReadonly} className="w-4 h-4 rounded-full flex-shrink-0" onError={(e) => e.target.style.display='none'} />}<span style={{ color: textColor, fontSize: isQuestion11_1 ? '0.65rem' : '0.875rem', fontWeight: hasActualResult ? '700' : 'normal' }}>{displayTeamNameForReadonly}</span></div>{score !== null ? (<Badge className={`${badgeColor} text-xs font-bold px-1.5 py-0.5 min-w-[45px] justify-center`}>{score}/{maxScore}</Badge>) : (<Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">?/{maxScore}</Badge>)}</div>);
  };

  const renderT10Questions = (table) => {
    const questions = table.questions;
    const grouped = {};
    questions.forEach(q => { const mainId = Math.floor(parseFloat(q.question_id)); if (!grouped[mainId]) grouped[mainId] = { main: null, subs: [] }; if (q.question_id.includes('.')) grouped[mainId].subs.push(q); else grouped[mainId].main = q; });
    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
    const renderTeamPrediction = (questionId, originalValue) => {
      const valueToDisplay = editedPredictions[questionId] !== undefined ? editedPredictions[questionId] : originalValue;
      const q = questions.find(question => question.id === questionId);
      const maxPts = getMaxPossibleScore(q || {});
      if (!valueToDisplay || valueToDisplay.trim() === '') return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <div className="rounded-md px-2 py-2 min-w-[135px] max-w-[140px] flex items-center gap-1" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--tp-20)' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>-</span>
          </div>
          {maxPts > 0
            ? <Badge className="bg-slate-700 text-slate-400 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">?/{maxPts}</Badge>
            : <div className="w-12"></div>
          }
        </div>
      );
      const matchedName = findMatchedTeamName(valueToDisplay);
      const team = data.teams[matchedName];
      const hasActualResult = q?.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__';
      const textColor = hasActualResult ? 'var(--tp)' : '#f8fafc';
      const score = q ? calculateQuestionScore(q, valueToDisplay) : null;
      let badgeColor = 'bg-slate-600 text-slate-300';
      if (score !== null) {
        if (score === maxPts && maxPts > 0) badgeColor = 'bg-green-700 text-green-100';
        else if (score === 0) badgeColor = 'bg-red-700 text-red-100';
        else if (score > 0) badgeColor = 'bg-blue-700 text-blue-100';
      }
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <div className="rounded-md px-2 py-2 min-w-[135px] max-w-[140px] flex items-center gap-1" style={{ background: hasActualResult ? 'var(--tp-20)' : 'rgba(0,0,0,0.35)', border: hasActualResult ? '1px solid var(--tp)' : '1px solid var(--tp-20)', boxShadow: hasActualResult ? '0 0 10px var(--tp-40)' : 'none' }}>
            {team?.logo_url && <img src={team.logo_url} alt={matchedName} className="w-4 h-4 rounded-full flex-shrink-0" onError={(e) => e.target.style.display='none'} />}
            <span style={{ color: textColor, fontSize: '0.875rem', fontWeight: hasActualResult ? '700' : 'normal' }}>{matchedName}</span>
          </div>
          {score !== null
            ? <Badge className={`${badgeColor} text-xs font-bold px-1.5 py-0.5 min-w-[45px] justify-center`}>{score}/{maxPts}</Badge>
            : <Badge className="bg-slate-700 text-slate-400 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">?/{maxPts}</Badge>
          }
        </div>
      );
    };
    return (
      <Card className="bg-slate-800/40 border-slate-700 shadow-lg shadow-slate-900/20">
        <CardHeader className="py-3"><CardTitle className="text-cyan-400">{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div className="space-y-3">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              const isTeamQuestion = !!(main.home_team && main.away_team);
              const mainValue = participantPredictions[main.id] || '';
              const getSubValue = (sub) => { const subVal = participantPredictions[sub.id] || ''; if (sub.question_id === '1.1' && mainValue !== 'אחר') return ''; return subVal; };
              // ── שורה אחת: ראשית + תתי-סעיפים ───────────────────────────
              const mainVal1 = participantPredictions[main.id] || '';
              const getSubVal1 = (sub) => { const v = participantPredictions[sub.id] || ''; if (sub.question_id === '1.1' && mainVal1 !== 'אחר') return ''; return v; };
              return (
                <div key={main.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--tp-12)', background: 'rgba(0,0,0,0.22)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: sortedSubs.length > 0 ? '1.4' : '1', minWidth: 0 }}>
                    <Badge variant="outline" style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{main.question_id}</Badge>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#f1f5f9', fontWeight: '500', textAlign: 'right' }}>{main.question_text}</span>
                    <div style={{ flexShrink: 0 }}>{isTeamQuestion ? renderTeamPrediction(main.id, mainVal1) : renderReadOnlySelect(main, mainVal1)}</div>
                  </div>
                  {sortedSubs.map((sub) => (
                    <React.Fragment key={sub.id}>
                      <div style={{ width: '1px', height: '26px', background: 'rgba(255,255,255,0.07)', flexShrink: 0, margin: '0 8px' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1', minWidth: 0 }}>
                        <Badge variant="outline" style={{ borderColor: 'rgba(139,92,246,0.45)', color: '#a78bfa', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{sub.question_id}</Badge>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#cbd5e1', textAlign: 'right' }}>{sub.question_text}</span>
                        <div style={{ flexShrink: 0 }}>{isTeamQuestion ? renderTeamPrediction(sub.id, getSubVal1(sub)) : renderReadOnlySelect(sub, getSubVal1(sub))}</div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── קונפיג לטבלאות עולות ─────────────────────────────────────────────────
  const ADVANCING_CONFIG_VS = { T4: { count: 8, bonus: 16 }, T5: { count: 4, bonus: 12 }, T6: { count: 2, bonus: 6 } };

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

    const actualSet = new Set(
      slots.filter(q => q.actual_result && q.actual_result !== "__CLEAR__")
           .map(q => q.actual_result.trim().toLowerCase())
    );
    const allResultsIn = slots.length > 0 && slots.every(q => q.actual_result && q.actual_result !== "__CLEAR__");

    let stageBonusEarned = false;
    if (selectedParticipant && allResultsIn && cfg) {
      const predMap = getCombinedPredictionsMap();
      const guessedSet = new Set(slots.map(q => (predMap[q.id] || "").trim().toLowerCase()).filter(Boolean));
      stageBonusEarned = [...actualSet].every(t => guessedSet.has(t));
    }

    const pointsPerSlot = slots[0]?.possible_points || 0;
    const totalPossible = slots.length * pointsPerSlot;

    return (
      <div style={{ background: "var(--bg3-60)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: "12px", padding: "16px", backdropFilter: "blur(10px)" }}>
        <h3 className="text-right font-bold text-base mb-3" style={{ color: "#f97316" }}>📋 {table.description}</h3>

        {totalPossible > 0 && (
          <div style={{ textAlign: "left", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
              {pointsPerSlot} נק' לכל קבוצה נכונה • סה"כ אפשרי: {totalPossible} נק'
              {cfg ? ` + בונוס שלב ${cfg.bonus} נק'` : ""}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          {slots.map(q => {
            const pred = (getCombinedPredictionsMap()[q.id] || "").trim();
            const hasResult = q.actual_result && q.actual_result !== "__CLEAR__";
            const isCorrect = hasResult && pred && actualSet.has(pred.toLowerCase());
            const isWrong   = hasResult && pred && !actualSet.has(pred.toLowerCase());
            const pts = isCorrect ? (q.possible_points || 0) : 0;
            return (
              <div key={q.id} style={{ display: "grid", gridTemplateColumns: "40px minmax(80px,1fr) 140px 46px", gap: "8px", alignItems: "center", padding: "7px 10px", borderRadius: "6px", background: isCorrect ? "rgba(16,185,129,0.10)" : isWrong ? "rgba(239,68,68,0.08)" : "rgba(0,0,0,0.22)", border: `1px solid ${isCorrect ? "rgba(16,185,129,0.30)" : isWrong ? "rgba(239,68,68,0.25)" : "rgba(249,115,22,0.15)"}` }}>
                <Badge variant="outline" style={{ borderColor: "rgba(249,115,22,0.45)", color: "#fb923c", fontSize: "0.72rem", justifyContent: "center" }}>
                  {q.question_id}
                </Badge>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {q.question_text || `קבוצה ${q.question_id} שעולה`}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "6px", background: isCorrect ? "rgba(16,185,129,0.12)" : isWrong ? "rgba(239,68,68,0.10)" : "rgba(249,115,22,0.08)", border: `1px solid ${isCorrect ? "rgba(16,185,129,0.35)" : isWrong ? "rgba(239,68,68,0.30)" : "rgba(249,115,22,0.25)"}` }}>
                  {pred ? (() => {
                    const matched = findMatchedTeamName(pred);
                    const teamObj = data.teams[matched] || data.teams[pred];
                    return (
                      <>
                        {teamObj?.logo_url && <img src={teamObj.logo_url} alt={matched} className="w-4 h-4 rounded-full flex-shrink-0" onError={(e) => e.target.style.display="none"} />}
                        <span style={{ fontSize: "0.84rem", fontWeight: "600", color: isCorrect ? "#6ee7b7" : isWrong ? "#fca5a5" : "#f8fafc" }}>{matched}</span>
                      </>
                    );
                  })() : <span style={{ fontSize: "0.84rem", color: "#475569" }}>—</span>}
                </div>
                <Badge style={{ minWidth: "42px", justifyContent: "center", fontSize: "0.75rem", background: isCorrect ? "rgba(16,185,129,0.2)" : isWrong ? "rgba(239,68,68,0.15)" : "rgba(100,116,139,0.15)", color: isCorrect ? "#34d399" : isWrong ? "#f87171" : "#94a3b8", border: `1px solid ${isCorrect ? "rgba(16,185,129,0.35)" : isWrong ? "rgba(239,68,68,0.3)" : "rgba(100,116,139,0.3)"}` }}>
                  {hasResult ? (isCorrect ? `+${pts}` : "0") : `?/${q.possible_points || 0}`}
                </Badge>
              </div>
            );
          })}
        </div>

        {cfg && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: "8px", marginTop: "14px",
            background: stageBonusEarned ? "linear-gradient(90deg,rgba(16,185,129,0.18),rgba(5,150,105,0.10))" : allResultsIn ? "linear-gradient(90deg,rgba(239,68,68,0.15),rgba(185,28,28,0.08))" : "linear-gradient(90deg,rgba(234,179,8,0.10),rgba(180,130,0,0.06))",
            border: `1px solid ${stageBonusEarned ? "rgba(16,185,129,0.50)" : allResultsIn ? "rgba(239,68,68,0.45)" : "rgba(234,179,8,0.40)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.3rem" }}>{stageBonusEarned ? "✅" : allResultsIn ? "❌" : "⏳"}</span>
              <div>
                <p style={{ fontSize: "0.82rem", fontWeight: "700", margin: 0,
                  color: stageBonusEarned ? "#6ee7b7" : allResultsIn ? "#fca5a5" : "#fde68a" }}>
                  {stageBonusEarned ? "בונוס שלב — הושג!" : allResultsIn ? "בונוס שלב — לא הושג" : "בונוס שלב — ממתין לתוצאות"}
                </p>
                <p style={{ fontSize: "0.70rem", color: "#94a3b8", margin: 0 }}>
                  {stageBonusEarned
                    ? `כל ${advCount} הקבוצות נכונות — +${cfg.bonus} נקודות!`
                    : allResultsIn
                      ? `נדרש לנחש נכון את כל ${advCount} הקבוצות`
                      : `פגיעה בכל ${advCount} הקבוצות = +${cfg.bonus} נקודות בונוס`}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "0.70rem", color: "#64748b" }}>בונוס</span>
              <Badge style={{ fontSize: "1.05rem", fontWeight: "800", padding: "5px 14px",
                background: stageBonusEarned ? "linear-gradient(135deg,#059669,#047857)" : allResultsIn ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "rgba(100,116,139,0.35)",
                color: "#fff",
                border: stageBonusEarned ? "1px solid #10b981" : allResultsIn ? "1px solid #ef4444" : "1px solid rgba(100,116,139,0.5)",
                boxShadow: stageBonusEarned ? "0 0 12px rgba(16,185,129,0.4)" : "none" }}>
                {stageBonusEarned ? `+${cfg.bonus}` : allResultsIn ? `0/${cfg.bonus}` : `?/${cfg.bonus}`}
              </Badge>
            </div>
          </div>
        )}
      </div>
    );
  };

    const renderSpecialQuestions = (table) => {
    const isT10 = table.description.includes('T10') || table.id === 'T10' || table.id.includes('custom_order');
    if (isT10) return renderT10Questions(table);
    const grouped = {};
    table.questions.forEach(q => { const mainId = Math.floor(parseFloat(q.question_id)); if (!grouped[mainId]) grouped[mainId] = { main: null, subs: [] }; if (q.question_id.includes('.')) grouped[mainId].subs.push(q); else grouped[mainId].main = q; });
    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
    let bonusInfo = null;
    const isLocationTable = ['T14', 'T15', 'T16', 'T17', 'T19'].includes(table.id);
    if (selectedParticipant) { const predForBonus = {}; table.questions.forEach(q => { const editedValue = editedPredictions[q.id]; predForBonus[q.id] = editedValue !== undefined ? editedValue : (participantPredictions[q.id] || ""); }); bonusInfo = calculateLocationBonus(table.id, table.questions, predForBonus); }
    let teamsBonusPotential = 0, orderBonusPotential = 0;
    if (isLocationTable) { if (table.id === 'T17') { teamsBonusPotential = 30; orderBonusPotential = 50; } else if (table.id === 'T19') { teamsBonusPotential = 20; orderBonusPotential = 0; } else { teamsBonusPotential = 20; orderBonusPotential = 40; } }
    return (
      <Card style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', backdropFilter: 'blur(10px)' }}>
        <CardHeader className="py-3"><CardTitle style={{ color: 'var(--tp)' }}>{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div className="space-y-2">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              const mainOriginalValue = participantPredictions[main.id] || '';
              // ── שורה אחת: ראשית + תתי-סעיפים ──────────────────────────
              return (
                <div key={main.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--tp-12)', background: 'rgba(0,0,0,0.22)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: sortedSubs.length > 0 ? '1.4' : '1', minWidth: 0 }}>
                    <Badge variant="outline" style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{main.question_id}</Badge>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#f1f5f9', fontWeight: '500', textAlign: 'right' }}>{main.question_text}</span>
                    <div style={{ flexShrink: 0 }}>{renderReadOnlySelect(main, mainOriginalValue)}</div>
                  </div>
                  {sortedSubs.map((sub) => {
                    const subOriginalValue = participantPredictions[sub.id] || '';
                    return (
                      <React.Fragment key={sub.id}>
                        <div style={{ width: '1px', height: '26px', background: 'rgba(255,255,255,0.07)', flexShrink: 0, margin: '0 8px' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1', minWidth: 0 }}>
                          <Badge variant="outline" style={{ borderColor: 'rgba(139,92,246,0.45)', color: '#a78bfa', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{sub.question_id}</Badge>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#cbd5e1', textAlign: 'right' }}>{sub.question_text}</span>
                          <div style={{ flexShrink: 0 }}>{renderReadOnlySelect(sub, subOriginalValue)}</div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {isLocationTable && selectedParticipant && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg border ${bonusInfo?.allCorrect ? 'bg-gradient-to-r from-green-900/40 to-emerald-900/40 border-green-600/50' : bonusInfo !== null ? 'bg-gradient-to-r from-red-900/40 to-red-800/40 border-red-600/50' : 'bg-gradient-to-r from-slate-800/40 to-slate-700/40 border-slate-600/50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Trophy className={`w-5 h-5 ${bonusInfo?.allCorrect ? 'text-green-400' : bonusInfo !== null ? 'text-red-400' : 'text-slate-400'}`} /><div><p className={`font-bold text-sm ${bonusInfo?.allCorrect ? 'text-green-200' : bonusInfo !== null ? 'text-red-200' : 'text-slate-300'}`}>{bonusInfo?.allCorrect ? '✅' : bonusInfo !== null ? '❌' : '⏳'} בונוס עולות</p><p className={`text-xs ${bonusInfo?.allCorrect ? 'text-green-300' : bonusInfo !== null ? 'text-red-300' : 'text-slate-400'}`}>{bonusInfo?.allCorrect ? 'כל הקבוצות נכונות!' : bonusInfo !== null ? 'לא כל הקבוצות' : 'ממתין לתוצאות...'}</p></div></div>
                  <Badge className={`text-lg font-bold px-3 py-1 ${bonusInfo?.allCorrect ? 'bg-green-600 text-white' : bonusInfo !== null ? 'bg-red-600 text-white' : 'bg-slate-600 text-slate-300'}`}>{bonusInfo?.allCorrect ? `+${bonusInfo.teamsBonus}` : bonusInfo !== null ? '0' : '?'}/{teamsBonusPotential}</Badge>
                </div>
              </div>
              {table.id !== 'T19' && (
                <div className={`p-3 rounded-lg border ${bonusInfo?.perfectOrder ? 'bg-gradient-to-r from-yellow-900/40 to-orange-900/40 border-yellow-600/50' : bonusInfo !== null ? 'bg-gradient-to-r from-red-900/40 to-red-800/40 border-red-600/50' : 'bg-gradient-to-r from-slate-800/40 to-slate-700/40 border-slate-600/50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Trophy className={`w-5 h-5 ${bonusInfo?.perfectOrder ? 'text-yellow-400' : bonusInfo !== null ? 'text-red-400' : 'text-slate-400'}`} /><div><p className={`font-bold text-sm ${bonusInfo?.perfectOrder ? 'text-yellow-200' : bonusInfo !== null ? 'text-red-200' : 'text-slate-300'}`}>{bonusInfo?.perfectOrder ? '✨' : bonusInfo !== null ? '❌' : '⏳'} בונוס מיקום</p><p className={`text-xs ${bonusInfo?.perfectOrder ? 'text-yellow-300' : bonusInfo !== null ? 'text-red-300' : 'text-slate-400'}`}>{bonusInfo?.perfectOrder ? 'סדר מושלם!' : bonusInfo?.allCorrect ? 'לא בסדר המדויק' : bonusInfo !== null ? 'לא כל הקבוצות' : 'ממתין לתוצאות...'}</p></div></div>
                    <Badge className={`text-lg font-bold px-3 py-1 ${bonusInfo?.perfectOrder ? 'bg-yellow-600 text-white' : bonusInfo !== null ? 'bg-red-600 text-white' : 'bg-slate-600 text-slate-300'}`}>{bonusInfo?.perfectOrder ? `+${bonusInfo.orderBonus}` : bonusInfo !== null ? '0' : '?'}/{orderBonusPotential}</Badge>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) return (<div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)' }}><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--tp)' }} /><span className="ml-3" style={{ color: 'var(--tp)' }}>טוען נתונים...</span></div>);

  const TEXT_LENGTH_THRESHOLD = 18;

  // ========= BUILD allButtons =========
  const allButtons = [];
  if (roundTables.length > 0) {
    const allAreGroups = roundTables.every(table => table.id.includes('בית') || table.description?.includes('בית'));
    if (allAreGroups) {
      const firstRoundTableId = roundTables[0]?.id || 'T2';
      allButtons.push({ numericId: parseInt(firstRoundTableId.replace('T', '').replace(/\D/g, ''), 10), key: 'rounds', description: 'שלב הבתים', sectionKey: 'rounds', stageType: 'rounds' });
    } else {
      roundTables.forEach(table => { allButtons.push({ numericId: parseInt(table.id.replace('T', '').replace(/\D/g, ''), 10) || 0, key: `round_${table.id}`, description: table.description || table.id, stageType: table.questions[0]?.stage_type || 'playoff', sectionKey: `round_${table.id}` }); });
    }
  }
  specialTables.forEach(table => { allButtons.push({ numericId: table.questions[0]?.stage_order || parseInt(table.id.replace('T', '').replace(/\D/g, ''), 10), key: table.id, description: table.description, stageType: table.questions[0]?.stage_type || 'special', sectionKey: table.id }); });
  if (locationTables.length > 0) { const firstLocationTableId = locationTables[0]?.id || 'T14'; allButtons.push({ numericId: parseInt(firstLocationTableId.replace('T', ''), 10), key: 'locations', description: 'מיקומים בתום שלב הבתים', stageType: 'other', sectionKey: 'locations' }); }
  qualifiersTables.forEach(table => { allButtons.push({ numericId: table.questions[0]?.stage_order || parseInt(table.id.replace('T','')) || 0, key: `qual_${table.id}`, description: table.description || table.id, stageType: 'qualifiers', sectionKey: `qual_${table.id}` }); });
  if (israeliTable) allButtons.push({ numericId: parseInt(israeliTable.id.replace('T', ''), 10), key: israeliTable.id, description: israeliTable.description, stageType: 'special', sectionKey: 'israeli' });
  if (playoffWinnersTable) allButtons.push({ numericId: parseInt(playoffWinnersTable.id.replace('T', ''), 10), key: playoffWinnersTable.id, description: playoffWinnersTable.description, stageType: 'qualifiers', sectionKey: 'playoffWinners' });
  allButtons.sort((a, b) => { if (a.sectionKey === 'rounds' && b.sectionKey !== 'rounds') return -1; if (b.sectionKey === 'rounds' && a.sectionKey !== 'rounds') return 1; return a.numericId - b.numericId; });

  // ========= SIDEBAR RENDERER =========
  const renderStageSidebar = (allButtonsList, openSectionsMap, toggleSectionFn) => {
    const groupMap = {
      playoff:    { label: '⚽ פלייאוף',   color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',   border: 'rgba(59,130,246,0.30)',   activeBg: '#2563eb',     activeShadow: '0 2px 10px rgba(59,130,246,0.44)'   },
      league:     { label: '⚽ ליגה',       color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',   border: 'rgba(59,130,246,0.30)',   activeBg: '#2563eb',     activeShadow: '0 2px 10px rgba(59,130,246,0.44)'   },
      groups:     { label: '🏠 בתים',       color: 'var(--tp)', bg: 'var(--tp-10)', border: 'var(--tp-30)', activeBg: 'var(--tp-dark)', activeShadow: 'var(--tp-glow-sm)' },
      special:    { label: '✨ מיוחדות',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',  border: 'rgba(139,92,246,0.30)',  activeBg: '#7c3aed',     activeShadow: '0 2px 10px rgba(139,92,246,0.44)'  },
      qualifiers: { label: '📋 עולות',      color: '#f97316', bg: 'rgba(249,115,22,0.10)',   border: 'rgba(249,115,22,0.30)',   activeBg: '#ea580c',     activeShadow: '0 2px 10px rgba(249,115,22,0.44)'   },
      rounds:     { label: '⚽ מחזורים',    color: 'var(--tp)', bg: 'var(--tp-10)', border: 'var(--tp-30)', activeBg: 'var(--tp-dark)', activeShadow: 'var(--tp-glow-sm)' },
      other:      { label: '📌 נוסף',       color: '#64748b', bg: 'rgba(100,116,139,0.08)',  border: 'rgba(100,116,139,0.20)',  activeBg: '#475569',     activeShadow: '0 2px 8px rgba(100,116,139,0.30)'   },
    };
    const grouped = {};
    allButtonsList.forEach(btn => {
      let type = btn.stageType;
      if (!type) { if (btn.sectionKey === 'rounds') type = 'rounds'; else if (btn.sectionKey.startsWith('round_')) type = 'playoff'; else if (btn.sectionKey.startsWith('qual_')) type = 'qualifiers'; else type = 'special'; }
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(btn);
    });
    const order = ['rounds','league','groups','playoff','special','qualifiers','other'];
    const sortedGroups = order.filter(t => grouped[t]);
    return (
      <div style={{ background: 'rgba(13,18,30,0.9)', borderRadius: '12px', border: '1px solid var(--tp-12)', padding: '14px 10px', backdropFilter: 'blur(10px)' }}>
        <div style={{ fontSize: '0.5rem', fontWeight: '800', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#334155', marginBottom: '14px', paddingRight: '2px' }}>בחירת שלב</div>
        {sortedGroups.map(type => {
          const info = groupMap[type] || groupMap.other;
          return (
            <div key={type} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: info.color, marginBottom: '5px', paddingRight: '2px', opacity: 0.85 }}>{info.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {grouped[type].map(button => {
                  const active = openSectionsMap[button.sectionKey];
                  return (
                    <button key={button.key} onClick={() => toggleSectionFn(button.sectionKey)} style={{ display: 'block', width: '100%', textAlign: 'right', padding: '7px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: active ? '700' : '400', color: active ? 'white' : info.color, background: active ? info.activeBg : info.bg, border: `1px solid ${active ? info.color : info.border}`, cursor: 'pointer', transition: 'all 0.15s', boxShadow: active ? (info.activeShadow || `0 2px 10px ${info.color}44`) : 'none', fontFamily: 'Rubik, Heebo, sans-serif', lineHeight: '1.35' }}>
                      {button.description}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ========= HORIZONTAL CHIPS (mobile) =========
  const renderStageChips = (allButtonsList, openSectionsMap, toggleSectionFn) => {
    const groupMap = {
      playoff:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)'  },
      league:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)'  },
      groups:     { color: 'var(--tp)', bg: 'var(--tp-12)',  border: 'var(--tp-35)'  },
      special:    { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)' },
      qualifiers: { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.35)'  },
      rounds:     { color: 'var(--tp)', bg: 'var(--tp-12)',  border: 'var(--tp-35)'  },
      other:      { color: '#64748b', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)' },
    };
    return (
      <div style={{ padding: '12px', background: 'rgba(0,0,0,0.40)', borderRadius: '12px', border: '1px solid var(--tp-12)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {allButtonsList.map(button => {
            const type = button.stageType || 'other';
            const info = groupMap[type] || groupMap.other;
            const active = openSectionsMap[button.sectionKey];
            return (<button key={button.key} onClick={() => toggleSectionFn(button.sectionKey)} style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 11px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: active ? '700' : '400', color: active ? 'white' : info.color, background: active ? info.color : info.bg, border: `1px solid ${active ? info.color : info.border}`, cursor: 'pointer', transition: 'all 0.15s', boxShadow: active ? `0 0 10px ${info.color}66` : 'none', fontFamily: 'Rubik, Heebo, sans-serif', whiteSpace: 'nowrap' }}>{button.description}</button>);
          })}
        </div>
      </div>
    );
  };

  const hasStages = specialTables.length > 0 || roundTables.length > 0 || locationTables.length > 0 || israeliTable || playoffWinnersTable || qualifiersTables.length > 0;

  const renderContent = () => {
    if (!selectedParticipant || loadingPredictions) return null;
    return allButtons.map(button => {
      if (!openSections[button.sectionKey]) return null;
      if (button.sectionKey === 'rounds') return (<div key="rounds-section" className="mb-6 space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-6">{roundTables.map(table => (<RoundTableReadOnly key={table.id} table={table} teams={data.teams} predictions={getCombinedPredictionsMap()} isEditMode={isEditMode && isAdmin} handlePredictionEdit={handlePredictionEdit} />))}</div><StandingsTable roundTables={roundTables} teams={data.teams} data={getCombinedPredictionsMap()} type="predictions" /></div>);
      if (button.sectionKey.startsWith('round_')) {
        const tableId = button.sectionKey.replace('round_', '');
        const table = roundTables.find(t => t.id === tableId);
        if (!table) return null;

        // ── T3 בונוס שלב (שמינית הגמר) ──
        let t3BonusBanner = null;
        if (tableId === 'T3' && selectedParticipant) {
          const t3Qs = table.questions || [];
          const allHaveResults = t3Qs.length > 0 && t3Qs.every(q => q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__');
          const predMap = getCombinedPredictionsMap();
          const allScored = allHaveResults && t3Qs.every(q => {
            const pred = predMap[q.id];
            if (!pred) return false;
            const sc = calculateQuestionScore(q, pred, t3Qs, predMap);
            return sc !== null && sc > 0;
          });
          const bonusEarned = allHaveResults && allScored;
          t3BonusBanner = (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: "8px", marginTop: "14px",
              background: bonusEarned ? "linear-gradient(90deg,rgba(16,185,129,0.18),rgba(5,150,105,0.10))" : allHaveResults ? "linear-gradient(90deg,rgba(239,68,68,0.15),rgba(185,28,28,0.08))" : "linear-gradient(90deg,rgba(234,179,8,0.10),rgba(180,130,0,0.06))",
              border: `1px solid ${bonusEarned ? "rgba(16,185,129,0.50)" : allHaveResults ? "rgba(239,68,68,0.45)" : "rgba(234,179,8,0.40)"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.3rem" }}>{bonusEarned ? "✅" : allHaveResults ? "❌" : "⏳"}</span>
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: "700", margin: 0,
                    color: bonusEarned ? "#6ee7b7" : allHaveResults ? "#fca5a5" : "#fde68a" }}>
                    {bonusEarned ? "בונוס שלב — הושג!" : allHaveResults ? "בונוס שלב — לא הושג" : "בונוס שלב — ממתין לתוצאות"}
                  </p>
                  <p style={{ fontSize: "0.70rem", color: "#94a3b8", margin: 0 }}>
                    {bonusEarned
                      ? "ניקוד בכל משחקי השמינית — +16 נקודות!"
                      : allHaveResults
                        ? "נדרש ניקוד (כלשהו) בכל משחקי השמינית"
                        : "ניקוד בכל משחקי השמינית = +16 נקודות בונוס"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "0.70rem", color: "#64748b" }}>בונוס</span>
                <Badge style={{ fontSize: "1.05rem", fontWeight: "800", padding: "5px 14px",
                  background: bonusEarned ? "linear-gradient(135deg,#059669,#047857)" : allHaveResults ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "rgba(100,116,139,0.35)",
                  color: "#fff",
                  border: bonusEarned ? "1px solid #10b981" : allHaveResults ? "1px solid #ef4444" : "1px solid rgba(100,116,139,0.5)",
                  boxShadow: bonusEarned ? "0 0 12px rgba(16,185,129,0.4)" : "none" }}>
                  {bonusEarned ? "+16" : allHaveResults ? "0/16" : "?/16"}
                </Badge>
              </div>
            </div>
          );
        }

        return (
          <div key={button.sectionKey} className="mb-6">
            <RoundTableReadOnly key={table.id} table={table} teams={data.teams} predictions={getCombinedPredictionsMap()} isEditMode={isEditMode && isAdmin} handlePredictionEdit={handlePredictionEdit} />
            {t3BonusBanner}
            {table.specialQuestions && table.specialQuestions.length > 0 && (
              <div className="mt-4">{renderSpecialQuestions({ ...table, questions: table.specialQuestions })}</div>
            )}
          </div>
        );
      }
      if (button.sectionKey.startsWith('qual_')) { const tableId = button.sectionKey.replace('qual_', ''); const table = qualifiersTables.find(t => t.id === tableId); if (!table) return null; return (<div key={button.sectionKey} className="mb-6">{renderQualifiersTable(table)}</div>); }
      if (button.sectionKey === 'israeli' && israeliTable) return (<div key="israeli-section" className="mb-6"><RoundTableReadOnly table={israeliTable} teams={data.teams} predictions={getCombinedPredictionsMap()} isEditMode={isEditMode && isAdmin} handlePredictionEdit={handlePredictionEdit} /></div>);
      if (button.sectionKey === 'locations') return (<div key="locations-section" className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">{locationTables.map(table => <div key={table.id}>{renderSpecialQuestions(table)}</div>)}</div>);
      if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) return (<div key="playoffWinners-section" className="mb-6">{renderSpecialQuestions(playoffWinnersTable)}</div>);
      const specificSpecialTable = specialTables.find(t => t.id === button.key);
      if (specificSpecialTable) return (<div key={specificSpecialTable.id} className="mb-6">{renderSpecialQuestions(specificSpecialTable)}</div>);
      return null;
    });
  };

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)' }}>

      {/* ===== STICKY HEADER ===== */}
      <div className="sticky top-0 z-30 backdrop-blur-sm shadow-lg" style={{ background: 'rgba(0,0,0,0.70)', borderBottom: '1px solid var(--tp-20)' }}>
        <div className="p-3 md:p-5 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-2 md:gap-0 mb-3 md:mb-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold mb-1 flex items-center gap-2" style={{ color: '#f8fafc', textShadow: '0 0 10px var(--tp-30)' }}>
                <Users className="w-5 h-5 md:w-7 md:h-7" style={{ color: 'var(--tp)' }} />
                צפייה בניחושים
              </h1>
              {currentGame?.game_name && <p className="text-xs font-medium" style={{ color: 'var(--tp)' }}>{currentGame.game_name}</p>}
              <p className="text-xs md:text-sm" style={{ color: '#94a3b8' }}>בחר משתתף כדי לראות את הניחושים שלו.</p>
            </div>
            <div className="flex gap-1.5 md:gap-2 flex-wrap w-full md:w-auto">
              {isAdmin && selectedParticipant && !loadingPredictions && (
                !isEditMode ? (
                  <Button onClick={() => setIsEditMode(true)} variant="outline" size="sm" style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', background: 'rgba(255,255,255,0.04)' }} className="hover:bg-cyan-500/20"><Pencil className="w-4 h-4 ml-1.5" />ערוך</Button>
                ) : (
                  <>
                    <Button onClick={() => { setEditedPredictions({}); setIsEditMode(false); }} variant="outline" size="sm" style={{ borderColor: 'rgba(148, 163, 184, 0.5)', color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }} className="hover:bg-slate-500/20" disabled={savingChanges}>ביטול</Button>
                    <Button onClick={handleSaveChanges} size="sm" disabled={Object.keys(editedPredictions).length === 0 || savingChanges} style={{ background: Object.keys(editedPredictions).length > 0 ? 'linear-gradient(135deg, var(--tp) 0%, var(--tp) 100%)' : 'rgba(71, 85, 105, 0.5)', color: Object.keys(editedPredictions).length > 0 ? 'white' : '#64748b' }}>
                      {savingChanges ? <><Loader2 className="w-4 h-4 animate-spin ml-1.5" />שומר...</> : <><Save className="w-4 h-4 ml-1.5" />שמור {Object.keys(editedPredictions).length > 0 && `(${Object.keys(editedPredictions).length})`}</>}
                    </Button>
                  </>
                )
              )}
              {isAdmin && (
                <>
                  <Button onClick={handleExportData} disabled={exporting} variant="outline" size="sm" style={{ borderColor: 'rgba(34, 197, 94, 0.5)', color: '#86efac', background: 'rgba(255,255,255,0.04)' }} className="hover:bg-green-500/20">
                    {exporting ? <><Loader2 className="w-4 h-4 ml-1.5 animate-spin" />מייצא...</> : <><Download className="w-4 h-4 ml-1.5" />ייצוא</>}
                  </Button>
                  <Button onClick={() => { loadParticipantStats(); setShowDeleteDialog(true); }} variant="outline" size="sm" style={{ borderColor: 'rgba(239, 68, 68, 0.5)', color: '#fca5a5', background: 'rgba(255,255,255,0.04)' }} className="hover:bg-red-500/20">
                    <Trash2 className="w-4 h-4 ml-1.5" />ניהול
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', backdropFilter: 'blur(10px)' }}>
              <CardContent className="p-3 flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: 'var(--tp)' }}>משתתף:</span>
                <Select onValueChange={setSelectedParticipant} value={selectedParticipant || ''}>
                  <SelectTrigger className="w-48 h-8 text-sm" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--tp-30)', color: '#f8fafc' }}>
                    <SelectValue placeholder="בחר שם..." />
                  </SelectTrigger>
                  <SelectContent style={{ background: 'var(--bg2)', border: '1px solid var(--tp-30)' }}>
                    {allParticipants.map(p => (
                      <SelectItem key={p} value={p} style={{ color: '#f8fafc' }}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {selectedParticipant && (
              <Card style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', backdropFilter: 'blur(10px)' }}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--tp)' }}>פרטי המשתתף</span>
                    <ParticipantTotalScore participantName={selectedParticipant} gameId={currentGame?.id} />
                  </div>
                  {participantQuestions.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {participantQuestions.map(q => { const isNameField = q.question_text?.includes("שם"); const displayValue = isNameField ? selectedParticipant : (participantDetails[q.id] || '-'); return (<div key={q.id} className="text-right"><label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>{q.question_text}</label><div className="rounded-md px-2 py-1 text-sm text-right" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--tp-20)' }}><span style={{ color: '#f8fafc' }}>{displayValue}</span></div></div>); })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {loadingPredictions && (<div className="flex items-center justify-center py-3 mt-3"><Loader2 className="w-5 h-5 animate-spin ml-2" style={{ color: 'var(--tp)' }} /><span style={{ color: 'var(--tp)' }}>טוען ניחושים...</span></div>)}
        </div>
      </div>

      {/* ===== BODY: SIDEBAR + CONTENT ===== */}
      <div className="flex max-w-7xl mx-auto" style={{ alignItems: 'flex-start' }}>

        {/* Desktop sidebar */}
        {selectedParticipant && !loadingPredictions && hasStages && (
          <aside className="hidden md:block flex-shrink-0 p-4" style={{ width: '215px', position: 'sticky', top: '70px', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
            {renderStageSidebar(allButtons, openSections, toggleSection)}
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 p-3 md:p-5">
          {/* Mobile chips */}
          {selectedParticipant && !loadingPredictions && hasStages && (
            <div className="md:hidden mb-4">
              {renderStageChips(allButtons, openSections, toggleSection)}
            </div>
          )}

          {!selectedParticipant && !loadingPredictions && (
            <Alert className="mt-2" style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', color: '#f8fafc' }}>
              <FileText className="w-4 h-4" style={{ color: 'var(--tp)' }} />
              <AlertDescription style={{ color: '#94a3b8' }}>בחר משתתף כדי לראות את הניחושים שלו.</AlertDescription>
            </Alert>
          )}

          {renderContent()}
        </main>
      </div>

      {/* ===== DIALOGS ===== */}
      {isAdmin && (
        <>
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent className="max-w-2xl" dir="rtl" style={{ background: 'var(--bg2)', border: '1px solid var(--tp-30)' }}>
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: '#f8fafc' }}><AlertTriangle className="w-6 h-6" style={{ color: '#ef4444' }} />ניהול משתתפים</DialogTitle>
                <DialogDescription className="text-slate-300">לחץ על כפתור המחיקה כדי למחוק את כל הניחושים של משתתף.<strong className="text-red-300"> פעולה זו אינה הפיכה!</strong></DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto">
                {participantStats.length === 0 ? (<div className="text-center py-8 flex flex-col items-center justify-center"><Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color: '#94a3b8' }} /><span style={{ color: '#94a3b8' }}>טוען נתונים...</span></div>) : (
                  <div className="space-y-2">
                    {participantStats.map(stat => (<div key={stat.name} className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-700/50" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--tp-20)' }}><div><p className="font-medium" style={{ color: '#f8fafc' }}>{stat.name}</p><p className="text-sm" style={{ color: '#94a3b8' }}>{stat.predictionsCount} ניחושים</p></div><Button onClick={() => handleDeleteParticipant(stat.name)} disabled={deletingParticipant === stat.name} variant="destructive" size="sm">{deletingParticipant === stat.name ? <><Loader2 className="w-4 h-4 ml-2" />מוחק...</> : <><Trash2 className="w-4 h-4 ml-2" />מחק</>}</Button></div>))}
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
