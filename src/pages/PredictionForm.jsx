import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trophy, FileText, Save, Loader2, Lock, Unlock } from "lucide-react";
import { Question, Prediction, User, Team, ValidationList, SystemSettings } from "@/entities/all";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import RoundTable from "../components/predictions/RoundTable";
import StandingsTable from "../components/predictions/StandingsTable";
import { useGame } from "@/components/contexts/GameContext";
import { createPageUrl } from "@/utils";

export default function PredictionForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [teams, setTeams] = useState({});
  const [validationLists, setValidationLists] = useState({});
  const [predictions, setPredictions] = useState({});
  const [participantDetails, setParticipantDetails] = useState({});

  const [participantQuestions, setParticipantQuestions] = useState([]);
  const [roundTables, setRoundTables] = useState([]);
  const [israeliTable, setIsraeliTable] = useState(null);
  const [specialTables, setSpecialTables] = useState([]);
  const [locationTables, setLocationTables] = useState([]);
  const [qualifiersTables, setQualifiersTables] = useState([]);
  const [playoffWinnersTable, setPlayoffWinnersTable] = useState(null);

  const [participantName, setParticipantName] = useState("");
  const [participantRecord, setParticipantRecord] = useState(null);
  const [openSections, setOpenSections] = useState({});
  const { toast } = useToast();
  const { currentGame } = useGame();
  const [selectedLocationTeams, setSelectedLocationTeams] = useState(new Set());
  const [selectedPlayoffTeams, setSelectedPlayoffTeams] = useState(new Set());
  const [selectedTopFinishersAndThirdTeams, setSelectedTopFinishersAndThirdTeams] = useState(new Set());
  const [thirdPlaceYesCount, setThirdPlaceYesCount] = useState(0);
  const [thirdPlaceNoCount, setThirdPlaceNoCount] = useState(0);
  const [selectedT11Teams, setSelectedT11Teams] = useState(new Set());
  const [selectedT12Teams, setSelectedT12Teams] = useState(new Set());
  const [selectedT13Teams, setSelectedT13Teams] = useState(new Set());
  const [allQuestions, setAllQuestions] = useState([]);

  const loadInitialData = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      let user = null;
      let gpDetails = {};
      try {
        const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
        if (!isAuth) {
          toast({ title: "נדרשת התחברות", description: "עליך להתחבר כדי למלא ניחושים", variant: "destructive", duration: 2000 });
          setTimeout(() => { window.location.href = '/login'; }, 1500);
          setLoading(false); return;
        }
        user = await supabase.auth.getUser().then(r => r.data.user);
        setCurrentUser(user);
        if (user.user_metadata?.role === 'admin') {
          const adminParticipants = await db.GameParticipant.filter({ game_id: currentGame.id, user_email: user.email }, null, 1);
          if (adminParticipants.length > 0) {
            const p = adminParticipants[0];
            setParticipantRecord(p);
            if (p.participant_name) setParticipantName(p.participant_name);
            gpDetails = { 'temp_name': p.participant_name || user.user_metadata?.full_name || user.email || '', 'temp_email': p.user_email || user.email || '', 'temp_phone': p.phone || '', 'temp_profession': p.profession || '', 'temp_age': p.age || '' };
          }
        } else {
          const gameParticipants = await db.GameParticipant.filter({ game_id: currentGame.id, user_email: user.email }, null, 1);
          if (gameParticipants.length === 0) {
            toast({ title: "נדרשת הצטרפות", description: "מעביר אותך לדף הצטרפות למשחק...", className: "bg-cyan-900/30 border-cyan-500 text-cyan-200", duration: 2000 });
            setTimeout(() => { window.location.href = createPageUrl("JoinGame") + `?gameId=${currentGame.id}`; }, 1500);
            setLoading(false); return;
          }
          const participant = gameParticipants[0];
          setParticipantRecord(participant);
          if (participant.participant_name) setParticipantName(participant.participant_name);
          let phone = participant.phone, profession = participant.profession, age = participant.age;
          if (!phone && !profession && !age) {
            try {
              const otherRecords = await db.GameParticipant.filter({ user_email: user.email }, '-created_at', 10);
              const withDetails = otherRecords.find(r => r.id !== participant.id && (r.phone || r.profession || r.age));
              if (withDetails) { phone = withDetails.phone; profession = withDetails.profession; age = withDetails.age; }
            } catch (_) {}
          }
          gpDetails = { 'temp_name': participant.participant_name || '', 'temp_email': participant.user_email || '', 'temp_phone': phone || '', 'temp_profession': profession || '', 'temp_age': age || '' };
          if (participant.role_in_game === 'viewer') {
            toast({ title: "אין הרשאה למילוי ניחושים", description: "התפקיד שלך במשחק הוא 'צופה' - אין אפשרות למלא ניחושים", variant: "destructive", duration: 2000 });
            setLoading(false); return;
          }
        }
      } catch (e) {
        toast({ title: "שגיאת התחברות", description: "אנא התחבר למערכת", variant: "destructive", duration: 2000 });
        setTimeout(() => { window.location.href = '/login'; }, 1500);
        setLoading(false); return;
      }

      const loadedQuestions = await db.Question.filter({ game_id: currentGame.id }, "-created_at", 5000);
      const filteredQuestions = loadedQuestions.filter(q => q.table_id !== 'T1');
      setAllQuestions(filteredQuestions);

      const fullName = gpDetails['temp_name'] || user.user_metadata?.full_name || '';
      const emailUser = user.email?.split('@')[0] || '';
      const searchNames = [...new Set([fullName, user.email, emailUser].filter(Boolean))];
      const allPredResults = await Promise.all(searchNames.map(name => db.Prediction.filter({ game_id: currentGame.id, participant_name: name }, '-created_at', 5000)));
      const seenPredIds = new Set();
      const userPredictions = allPredResults.flat().filter(p => { if (seenPredIds.has(p.id)) return false; seenPredIds.add(p.id); return true; });

      const predictionsByQuestion = {};
      userPredictions.forEach(pred => { if (!predictionsByQuestion[pred.question_id] || new Date(pred.created_at) > new Date(predictionsByQuestion[pred.question_id].created_date)) predictionsByQuestion[pred.question_id] = pred; });

      const loadedPredictions = {}, loadedDetails = {};
      Object.values(predictionsByQuestion).forEach(pred => {
        const question = filteredQuestions.find(q => q.id === pred.question_id);
        if (pred.text_prediction) {
          if (pred.home_prediction !== undefined && pred.away_prediction !== undefined) loadedPredictions[pred.question_id] = `${pred.home_prediction}-${pred.away_prediction}`;
          else loadedPredictions[pred.question_id] = pred.text_prediction;
        }
        if (question?.table_id === 'T1' || pred.question_id.startsWith('temp_')) loadedDetails[pred.question_id] = pred.text_prediction;
      });

      setPredictions(loadedPredictions);
      setParticipantDetails({
        ...loadedDetails,
        ...(gpDetails['temp_name']       ? { 'temp_name':       gpDetails['temp_name']       } : {}),
        ...(gpDetails['temp_email']      ? { 'temp_email':      gpDetails['temp_email']      } : {}),
        ...(gpDetails['temp_phone']      ? { 'temp_phone':      gpDetails['temp_phone']      } : {}),
        ...(gpDetails['temp_profession'] ? { 'temp_profession': gpDetails['temp_profession'] } : {}),
        ...(gpDetails['temp_age']        ? { 'temp_age':        gpDetails['temp_age']        } : {}),
      });

      const teamsData = currentGame.teams_data || [];
      const validationListsData = currentGame.validation_lists || [];
      setTeams(teamsData.reduce((acc, team) => { acc[team.name] = team; return acc; }, {}));
      setValidationLists(validationListsData.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {}));

      const rTables = {}, sTables = {};
      filteredQuestions.forEach(q => {
        if (!q.table_id) return;
        if (q.table_id === 'T20' && q.question_text) {
          let t = null;
          if (q.question_text.includes(' נגד ')) t = q.question_text.split(' נגד ').map(s => s.trim());
          else if (q.question_text.includes(' - ')) t = q.question_text.split(' - ').map(s => s.trim());
          if (t && t.length === 2) { q.home_team = t[0]; q.away_team = t[1]; }
        }
        if (q.table_id === 'T3' && q.question_text && !q.home_team) {
          const parts = q.question_text.split(' - ');
          if (parts.length === 2) { q.home_team = parts[0].trim(); q.away_team = parts[1].trim(); }
        }
        const isGroupStage = q.stage_name?.includes('בית') || q.table_description?.includes('בית');
        const isMatchQuestion = q.home_team && q.away_team && ['playoff','league','groups'].includes(q.stage_type);
        const tableCollection = (isGroupStage || isMatchQuestion) ? rTables : sTables;
        let tableId = q.table_id, tableDescription = q.table_description;
        if (q.stage_name && q.stage_name.includes('בית')) { tableId = q.stage_name; tableDescription = q.stage_name; }
        else if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order && q.table_id !== 'T10') { tableId = `custom_order_${q.stage_order}`; tableDescription = q.stage_name || q.table_description; }
        if (q.table_id === 'T12') tableDescription = 'שלב הליגה - פינת הגאווה הישראלית - 7 בוםםםםםםםםםם !!!';
        else if (q.table_id === 'T13') tableDescription = 'שלב ראש בראש - "מבול מטאורים של כוכבים (*)"';
        else if (q.table_id === 'T20') tableDescription = 'המסלול "הישראלי" - פצצת אנרגיה (אירופית) צהובה';
        if (!tableCollection[tableId]) tableCollection[tableId] = { id: tableId, description: tableDescription || (q.home_team && q.away_team ? `מחזור ${tableId.replace('T','')}` : `שאלות ${tableId.replace('T','')}`), questions: [] };
        tableCollection[tableId].questions.push(q);
      });

      const t20Table = rTables['T20']; delete rTables['T20']; setIsraeliTable(t20Table || null);
      setParticipantQuestions([
        { id: 'temp_name', question_text: 'שם מלא', table_id: 'T1' },
        { id: 'temp_email', question_text: 'אימייל', table_id: 'T1' },
        { id: 'temp_phone', question_text: 'טלפון', table_id: 'T1' },
        { id: 'temp_profession', question_text: 'מקצוע', table_id: 'T1' },
        { id: 'temp_age', question_text: 'גיל', table_id: 'T1' }
      ]);
      delete sTables['T1'];
      const t19Table = sTables['T19']; delete sTables['T19']; setPlayoffWinnersTable(t19Table || null);

      const sortedRoundTables = Object.values(rTables).sort((a,b) => {
        const aIsGroup = a.id.includes('בית'), bIsGroup = b.id.includes('בית');
        if (aIsGroup && !bIsGroup) return -1; if (!aIsGroup && bIsGroup) return 1;
        if (aIsGroup && bIsGroup) return a.id.localeCompare(b.id, 'he');
        return (parseInt(a.id.replace('T','').replace(/\D/g,'')) || 0) - (parseInt(b.id.replace('T','').replace(/\D/g,'')) || 0);
      });
      setRoundTables(sortedRoundTables);

      const locationTableIds = ['T9', 'T14', 'T15', 'T16', 'T17'];
      setLocationTables(Object.values(sTables).filter(table => locationTableIds.includes(table.id)).sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0)));

      const allSpecialTables = Object.values(sTables).filter(table => {
        const desc = table.description?.trim();
        const isGroupTable = (table.id.includes('בית') || desc?.includes('בית')) && !table.questions[0]?.stage_order;
        const stageType = table.questions[0]?.stage_type;
        if (table.id === 'T10') return false;
        return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && table.id !== 'T19' && !isGroupTable && table.id !== 'T1' && stageType !== 'qualifiers';
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

      setQualifiersTables(Object.values(sTables).filter(table => table.questions[0]?.stage_type === 'qualifiers').sort((a,b) => (a.questions[0]?.stage_order || 999) - (b.questions[0]?.stage_order || 999)));

      if (user && !participantRecord) {
        const fallbackName = user.user_metadata?.full_name || user.email;
        setParticipantName(prev => prev || fallbackName);
        setParticipantDetails(prev => ({ ...prev, 'temp_name': prev['temp_name'] || fallbackName, 'temp_email': prev['temp_email'] || user.email || '' }));
      }
    } catch (error) {
      console.error("שגיאה בטעינת הנתונים:", error);
      toast({ title: "שגיאה", description: "טעינת הנתונים נכשלה.", variant: "destructive", duration: 2000 });
    }
    setLoading(false);
  }, [toast, currentGame]);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  useEffect(() => {
    const mainLocationTableIds = ['T9', '9', 'T14', 'T15', 'T16', 'T17'];
    const allLocationQuestions = locationTables.flatMap(t => t.questions).filter(q => mainLocationTableIds.includes(q.table_id));
    const selected = new Set();
    allLocationQuestions.forEach(q => { const p = predictions[q.id]; if (p && p.trim() !== '' && p !== '__CLEAR__') selected.add(p); });
    setSelectedLocationTeams(selected);
  }, [predictions, locationTables]);

  useEffect(() => {
    if (!playoffWinnersTable) return;
    const selected = new Set();
    playoffWinnersTable.questions.forEach(q => { const p = predictions[q.id]; if (p && p.trim() !== '' && p !== '__CLEAR__') selected.add(p); });
    setSelectedPlayoffTeams(selected);
  }, [predictions, playoffWinnersTable]);

  useEffect(() => {
    const topFinishersQuestions = specialTables.flatMap(t => t.questions).filter(q => (q.table_id === 'T_TOP_FINISHERS' || q.table_id === 'T_THIRD_PLACE') && !q.question_id.includes('.'));
    const selected = new Set();
    topFinishersQuestions.forEach(q => { const p = predictions[q.id]; if (p && p.trim() !== '' && p !== '__CLEAR__') selected.add(p); });
    setSelectedTopFinishersAndThirdTeams(selected);
  }, [predictions, specialTables]);

  useEffect(() => {
    const thirdPlaceSubQuestions = specialTables.flatMap(t => t.questions).filter(q => q.table_id === 'T_THIRD_PLACE' && q.question_id.includes('.'));
    let yes = 0, no = 0;
    thirdPlaceSubQuestions.forEach(q => { if (predictions[q.id] === 'כן') yes++; if (predictions[q.id] === 'לא') no++; });
    setThirdPlaceYesCount(yes); setThirdPlaceNoCount(no);
  }, [predictions, specialTables]);

  useEffect(() => {
    const t11Questions = allQuestions.filter(q => q.table_id === 'T11' || q.table_id === '11' || q.stage_name?.includes('רבע גמר') || q.table_description?.includes('רבע גמר'));
    const selected = new Set();
    t11Questions.forEach(q => { const p = predictions[q.id]; if (p && p.trim() !== '' && p !== '__CLEAR__') selected.add(p); });
    setSelectedT11Teams(selected);
  }, [predictions, allQuestions]);

  useEffect(() => {
    const t12Questions = allQuestions.filter(q => q.table_id === 'T12' || q.table_id === '12' || q.stage_name?.includes('חצי גמר') || q.table_description?.includes('חצי גמר'));
    const selected = new Set();
    t12Questions.forEach(q => { const p = predictions[q.id]; if (p && p.trim() !== '' && p !== '__CLEAR__') selected.add(p); });
    setSelectedT12Teams(selected);
  }, [predictions, allQuestions]);

  useEffect(() => {
    const t13Questions = allQuestions.filter(q => {
      const sn = q.stage_name || '', td = q.table_description || '';
      return q.table_id === 'T13' || q.table_id === '13' || (sn.includes('גמר') && !sn.includes('רבע') && !sn.includes('חצי')) || (td.includes('גמר') && !td.includes('רבע') && !td.includes('חצי'));
    });
    const selected = new Set();
    t13Questions.forEach(q => { const p = predictions[q.id]; if (p && p.trim() !== '' && p !== '__CLEAR__') selected.add(p); });
    setSelectedT13Teams(selected);
  }, [predictions, allQuestions]);

  const toggleFormLock = async () => {
    try {
      const newStatus = isFormLocked ? "active" : "locked";
      await db.Game.update(currentGame.id, { status: newStatus });
      toast({ title: isFormLocked ? "הטופס נפתח!" : "הטופס ננעל!", description: isFormLocked ? "משתתפים יכולים למלא ניחושים" : "הטופס נעול למילוי" });
    } catch (error) {
      toast({ title: "שגיאה", description: "עדכון הסטטוס נכשל", variant: "destructive" });
    }
  };

  const handlePredictionChange = (questionId, value) => { setPredictions(prev => ({ ...prev, [questionId]: value === "__CLEAR__" ? "" : value })); };
  const handleDetailsChange = (questionId, value) => {
    const nameQuestion = participantQuestions.find(q => q.question_text?.includes("שם"));
    if (nameQuestion && nameQuestion.id === questionId) setParticipantName(value);
    setParticipantDetails(prev => ({ ...prev, [questionId]: value }));
  };

  const saveAllPredictions = async () => {
    if (currentGame?.status === 'locked' && !isAdmin) {
      toast({ title: "המשחק נעול", description: "לא ניתן לשמור ניחושים במשחק נעול", variant: "destructive", duration: 2000 }); return;
    }
    if (!participantName.trim()) { toast({ title: "שגיאה", description: "נא למלא שם בפרטי המשתתף.", variant: "destructive", duration: 2000 }); return; }
    setSaving(true);
    try {
      const existingPredictions = await db.Prediction.filter({ game_id: currentGame.id, participant_name: participantName.trim() }, null, 5000);
      const existingMap = {};
      existingPredictions.forEach(p => { existingMap[p.question_id] = p; });
      const allPredictionsToSave = [], predictionsToDelete = [];
      Object.values(existingMap).forEach(existingPred => {
        const qid = existingPred.question_id;
        if (participantDetails.hasOwnProperty(qid)) { const v = participantDetails[qid]; if (!v || !String(v).trim() || String(v).trim() === '__CLEAR__') predictionsToDelete.push(existingPred.id); }
        else if (predictions.hasOwnProperty(qid)) { const v = predictions[qid]; if (!v || !String(v).trim() || String(v).trim() === '__CLEAR__') predictionsToDelete.push(existingPred.id); }
      });
      Object.entries(participantDetails).forEach(([qid, value]) => { if (value && String(value).trim() && String(value).trim() !== '__CLEAR__') allPredictionsToSave.push({ question_id: qid, participant_name: participantName.trim(), text_prediction: String(value).trim(), game_id: currentGame.id }); });
      Object.entries(predictions).forEach(([qid, value]) => {
        if (value && String(value).trim() && String(value).trim() !== '__CLEAR__') {
          const pData = { question_id: qid, participant_name: participantName.trim(), text_prediction: String(value).trim(), game_id: currentGame.id };
          const parts = String(value).split('-');
          if (parts.length === 2) { const h = parseInt(parts[0], 10), a = parseInt(parts[1], 10); if (!isNaN(h) && !isNaN(a)) { pData.home_prediction = h; pData.away_prediction = a; } }
          allPredictionsToSave.push(pData);
        }
      });
      for (const id of predictionsToDelete) await db.Prediction.delete(id);
      if (allPredictionsToSave.length > 0) await db.Prediction.bulkCreate(allPredictionsToSave);
      try {
        const gpRecords = await db.GameParticipant.filter({ game_id: currentGame.id, user_email: currentUser?.email }, null, 1);
        if (gpRecords.length > 0) await db.GameParticipant.update(gpRecords[0].id, { participant_name: (participantDetails['temp_name']?.trim() || participantName.trim()) || gpRecords[0].participant_name, phone: participantDetails['temp_phone']?.trim() || null, profession: participantDetails['temp_profession']?.trim() || null, age: participantDetails['temp_age']?.trim() || null });
      } catch (syncErr) { console.warn('Sync to game_participants failed (non-critical):', syncErr); }
      const totalChanges = allPredictionsToSave.length + predictionsToDelete.length;
      if (totalChanges > 0) toast({ title: "נשמר בהצלחה!", description: `נשמרו ${allPredictionsToSave.length} ניחושים, נמחקו ${predictionsToDelete.length}.`, className: "bg-green-100 text-green-800", duration: 2000 });
      else toast({ title: "אין שינויים", description: "לא בוצעו שינויים.", variant: "warning", duration: 2000 });
    } catch (error) {
      toast({ title: "שגיאה", description: "שמירת הניחושים נכשלה.", variant: "destructive", duration: 2000 });
    }
    setSaving(false);
  };

  const toggleSection = (sectionId) => { setOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] })); };

  const renderSelectWithLogos = (question, value, onChange, customWidth = "w-[180px]") => {
    const options = validationLists[question.validation_list] || [];
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ');
    const isNationalTeams = question.validation_list?.toLowerCase().includes('נבחר');
    const isLocationQuestion = ['T9', '9', 'T14', 'T15', 'T16', 'T17'].includes(question.table_id);
    const isPlayoffWinnersQuestion = question.table_id === 'T19';
    const isT11Question = question.table_id === 'T11' || question.table_id === '11' || question.stage_name?.includes('רבע גמר') || question.table_description?.includes('רבע גמר');
    const isT12Question = question.table_id === 'T12' || question.table_id === '12' || question.stage_name?.includes('חצי גמר') || question.table_description?.includes('חצי גמר');
    const isT13Question = question.table_id === 'T13' || question.table_id === '13' || (question.stage_name?.includes('גמר') && !question.stage_name?.includes('רבע') && !question.stage_name?.includes('חצי')) || (question.table_description?.includes('גמר') && !question.table_description?.includes('רבע') && !question.table_description?.includes('חצי'));
    const isTopFinishersQuestion = question.table_id === 'T_TOP_FINISHERS';
    const isThirdPlaceQuestion = question.table_id === 'T_THIRD_PLACE' && !question.question_id.includes('.');
    const isThirdPlaceSubQuestion = question.table_id === 'T_THIRD_PLACE' && question.question_id.includes('.');
    const cleanValue = (!value || value === 'null' || value === 'undefined' || value.toLowerCase?.().includes('null')) ? '__CLEAR__' : value;
    return (
      <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <Select value={cleanValue} onValueChange={onChange}>
          <SelectTrigger className={customWidth} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', color: '#f8fafc' }}>
            <SelectValue placeholder="בחר...">
              {cleanValue && cleanValue !== "__CLEAR__" ? (
                <div className="flex items-center gap-2">
                  {(() => { const displayName = cleanValue.replace(/\s*\([^)]+\)\s*$/, '').trim(); const logo = (isTeamsList || isNationalTeams) ? (teams[cleanValue]?.logo_url || teams[displayName]?.logo_url) : null; return (<>{logo && <img src={logo} alt={displayName} className="w-5 h-5 rounded-full inline-block" onError={(e) => e.target.style.display='none'} />}<span>{displayName}</span></>); })()}
                </div>
              ) : 'בחר...'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(6, 182, 212, 0.3)', color: '#f8fafc', backdropFilter: 'blur(5px)' }}>
            <SelectItem value="__CLEAR__" style={{ color: '#94a3b8' }} className="hover:bg-cyan-900/30">&nbsp;</SelectItem>
            {options.map(opt => {
              const cleanOptName = opt.replace(/\s*\([^)]+\)\s*$/, '').trim();
              const team = (isTeamsList || isNationalTeams) ? (teams[cleanOptName] || teams[opt]) : null;
              let isAlreadySelected = false, isDisabled = false;
              if (isLocationQuestion && selectedLocationTeams.has(opt) && value !== opt) isAlreadySelected = true;
              if (isPlayoffWinnersQuestion && selectedPlayoffTeams.has(opt) && value !== opt) isAlreadySelected = true;
              if (isT11Question && selectedT11Teams.has(opt) && value !== opt) isAlreadySelected = true;
              if (isT12Question && selectedT12Teams.has(opt) && value !== opt) isAlreadySelected = true;
              if (isT13Question && selectedT13Teams.has(opt) && value !== opt) isAlreadySelected = true;
              if ((isTopFinishersQuestion || isThirdPlaceQuestion) && selectedTopFinishersAndThirdTeams.has(opt) && value !== opt) isAlreadySelected = true;
              if (isThirdPlaceSubQuestion) { if (opt === 'כן' && thirdPlaceYesCount >= 4 && value !== 'כן') isDisabled = true; if (opt === 'לא' && thirdPlaceNoCount >= 2 && value !== 'לא') isDisabled = true; }
              return (
                <SelectItem key={opt} value={opt} className="hover:bg-cyan-900/30" disabled={isAlreadySelected || isDisabled} style={{ opacity: (isAlreadySelected || isDisabled) ? 0.4 : 1, cursor: (isAlreadySelected || isDisabled) ? 'not-allowed' : 'pointer' }}>
                  <div className={`flex items-center gap-2 ${(isTeamsList || isNationalTeams) ? 'pl-2' : ''}`}>
                    {team?.logo_url && <img src={team.logo_url} alt={opt} className="w-5 h-5 rounded-full flex-shrink-0" onError={(e) => e.target.style.display = 'none'} style={{ opacity: (isAlreadySelected || isDisabled) ? 0.4 : 1 }} />}
                    <span style={{ color: (isAlreadySelected || isDisabled) ? '#64748b' : '#f8fafc' }}>{cleanOptName}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </span>
    );
  };

  const renderTopFinishersOrThirdPlace = (table) => {
    const questions = table.questions, grouped = {};
    questions.forEach(q => { const mainId = Math.floor(parseFloat(q.question_id)); if (!grouped[mainId]) grouped[mainId] = { main: null, subs: [] }; if (q.question_id.includes('.')) grouped[mainId].subs.push(q); else grouped[mainId].main = q; });
    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
    return (
      <Card style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', backdropFilter: 'blur(10px)' }}>
        <CardHeader className="py-3"><CardTitle style={{ color: '#06b6d4' }}>{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div className="space-y-3">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              return (
                <div key={main.id} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(6,182,212,0.12)', background: 'rgba(15,23,42,0.45)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', minWidth: 0 }}>
                    <Badge variant="outline" style={{ borderColor: 'var(--tp)', color: 'var(--tp)', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{main.question_id}</Badge>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', color: '#94a3b8', textAlign: 'right' }}>{main.question_text}</span>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[120px]")}
                      {main.possible_points && <Badge style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', background: 'var(--tp-10)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{main.possible_points} נק'</Badge>}
                    </div>
                  </div>
                  {sortedSubs.map((sub, idx) => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px 7px 22px', borderTop: '1px solid rgba(6,182,212,0.07)', background: 'rgba(0,0,0,0.18)', minWidth: 0 }}>
                      <span style={{ color: 'var(--tp)', fontSize: '0.7rem', flexShrink: 0, opacity: 0.5 }}>{idx === sortedSubs.length-1 ? '└' : '├'}</span>
                      <Badge variant="outline" style={{ borderColor: 'rgba(139,92,246,0.5)', color: '#a78bfa', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{sub.question_id}</Badge>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: '#cbd5e1', textAlign: 'right' }}>{sub.question_text}</span>
                      <div style={{ flexShrink: 0 }}>{renderSelectWithLogos(sub, predictions[sub.id] || "", (val) => handlePredictionChange(sub.id, val), "w-[120px]")}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderT10Questions = (table) => {
    const questions = table.questions, grouped = {};
    questions.forEach(q => { const mainId = Math.floor(parseFloat(q.question_id)); if (!grouped[mainId]) grouped[mainId] = { main: null, subs: [] }; if (q.question_id.includes('.')) grouped[mainId].subs.push(q); else grouped[mainId].main = q; });
    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
    return (
      <Card style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', backdropFilter: 'blur(10px)' }}>
        <CardHeader className="py-3"><CardTitle style={{ color: '#06b6d4' }}>{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div className="space-y-2">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              // ── רינדור שאלה — מבנה אנכי ──
              return (
                <div key={main.id} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(6,182,212,0.12)', background: 'rgba(15,23,42,0.45)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', minWidth: 0 }}>
                    <Badge variant="outline" style={{ borderColor: 'var(--tp)', color: 'var(--tp)', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{main.question_id}</Badge>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', color: '#f1f5f9', fontWeight: '500', textAlign: 'right' }}>{main.question_text}</span>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[160px]")}
                      {main.possible_points && <Badge style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', background: 'var(--tp-10)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{main.possible_points} נק'</Badge>}
                    </div>
                  </div>
                  {sortedSubs.map((sub, idx) => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px 7px 22px', borderTop: '1px solid rgba(6,182,212,0.07)', background: 'rgba(0,0,0,0.18)', minWidth: 0 }}>
                      <span style={{ color: 'var(--tp)', fontSize: '0.7rem', flexShrink: 0, opacity: 0.5 }}>{idx === sortedSubs.length-1 ? '└' : '├'}</span>
                      <Badge variant="outline" style={{ borderColor: 'rgba(139,92,246,0.5)', color: '#a78bfa', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{sub.question_id}</Badge>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: '#cbd5e1', textAlign: 'right' }}>{sub.question_text}</span>
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {renderSelectWithLogos(sub, predictions[sub.id] || "", (val) => handlePredictionChange(sub.id, val), "w-[160px]")}
                        {sub.possible_points && <Badge style={{ borderColor: 'rgba(139,92,246,0.4)', color: '#a78bfa', background: 'rgba(139,92,246,0.1)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{sub.possible_points} נק'</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSpecialQuestions = (table) => {
    if (table.id === 'T_TOP_FINISHERS' || table.id === 'T_THIRD_PLACE') return renderTopFinishersOrThirdPlace(table);
    if (table.description.includes('T10') || table.id === 'T10') return renderT10Questions(table);
    const questions = table.questions, grouped = {};
    questions.forEach(q => { const mainId = Math.floor(parseFloat(q.question_id)); if (!grouped[mainId]) grouped[mainId] = { main: null, subs: [] }; if (q.question_id.includes('.')) grouped[mainId].subs.push(q); else grouped[mainId].main = q; });
    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
    return (
      <Card style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', backdropFilter: 'blur(10px)' }}>
        <CardHeader className="py-3"><CardTitle style={{ color: '#06b6d4' }}>{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div className="space-y-3">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              const renderControl = (q) => q.validation_list && validationLists[q.validation_list]
                ? renderSelectWithLogos(q, predictions[q.id] || "", (val) => handlePredictionChange(q.id, val), "w-[160px]")
                : <Input value={predictions[q.id] || ""} onChange={(e) => handlePredictionChange(q.id, e.target.value)} className="h-8 text-sm" placeholder="הזן תשובה..." style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)', color: '#f8fafc', width: '160px' }} />;
              return (
                <div key={main.id} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(6,182,212,0.12)', background: 'rgba(15,23,42,0.45)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', minWidth: 0 }}>
                    <Badge variant="outline" style={{ borderColor: 'var(--tp)', color: 'var(--tp)', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{main.question_id}</Badge>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', color: '#94a3b8', textAlign: 'right' }}>{main.question_text}</span>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {renderControl(main)}
                      {main.possible_points && <Badge style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', background: 'var(--tp-10)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{main.possible_points} נק'</Badge>}
                    </div>
                  </div>
                  {sortedSubs.map((sub, idx) => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px 7px 22px', borderTop: '1px solid rgba(6,182,212,0.07)', background: 'rgba(0,0,0,0.18)', minWidth: 0 }}>
                      <span style={{ color: 'var(--tp)', fontSize: '0.7rem', flexShrink: 0, opacity: 0.5 }}>{idx === sortedSubs.length-1 ? '└' : '├'}</span>
                      <Badge variant="outline" style={{ borderColor: 'rgba(139,92,246,0.5)', color: '#a78bfa', minWidth: '44px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{sub.question_id}</Badge>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: '#cbd5e1', textAlign: 'right' }}>{sub.question_text}</span>
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {renderControl(sub)}
                        {sub.possible_points && <Badge style={{ borderColor: 'rgba(139,92,246,0.4)', color: '#a78bfa', background: 'rgba(139,92,246,0.1)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{sub.possible_points} נק'</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) return (<div className="p-6 flex items-center justify-center h-64" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', minHeight: '100vh' }}><Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" /><span className="text-blue-600">טוען נתונים...</span></div>);

  const isAdmin = currentUser?.user_metadata?.role === 'admin';
  const isFormLocked = currentGame?.status === 'locked';

  if (isFormLocked && !isAdmin) return (
    <div className="p-6 flex flex-col items-center justify-center gap-6" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', minHeight: '100vh' }}>
      <Card style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(239, 68, 68, 0.4)', maxWidth: '600px', boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)' }}>
        <CardHeader><div className="flex items-center gap-3 justify-center"><Lock className="w-8 h-8" style={{ color: '#ef4444' }} /><CardTitle className="text-2xl" style={{ color: '#ef4444' }}>מילוי ניחושים נעול</CardTitle></div></CardHeader>
        <CardContent className="text-center space-y-4"><p className="text-lg" style={{ color: '#fca5a5' }}>המשחק נעול - לא ניתן למלא ניחושים</p><p style={{ color: '#94a3b8' }}>ניתן לצפות בניחושים ובתוצאות, אך לא למלא ניחושים חדשים</p><Alert style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', textAlign: 'right' }}><AlertDescription style={{ color: '#06b6d4' }}>💡 <strong>למה הטופס נעול?</strong><br />הטופס נעול בדרך כלל לפני תחילת התחרות או לאחר המועד האחרון למילוי ניחושים.</AlertDescription></Alert></CardContent>
      </Card>
    </div>
  );

  // ========= BUILD allButtons =========
  const allButtons = [];
  if (roundTables.length > 0) roundTables.forEach(table => { allButtons.push({ numericId: table.questions[0]?.stage_order || parseInt((table.id || '').replace('T', '').replace(/\D/g, ''), 10) || 0, key: `round_${table.id}`, stageType: table.questions[0]?.stage_type || 'playoff', description: table.description || table.id, sectionKey: `round_${table.id}` }); });
  specialTables.forEach(table => { allButtons.push({ numericId: table.questions[0]?.stage_order || parseInt(table.id.replace('T', ''), 10), key: table.id, stageType: table.questions[0]?.stage_type || 'special', description: table.description, sectionKey: table.id }); });
  qualifiersTables.forEach(table => { allButtons.push({ numericId: table.questions[0]?.stage_order || parseInt(table.id.replace('T','')) || 0, key: `qual_${table.id}`, description: table.description || table.id, stageType: 'qualifiers', sectionKey: `qual_${table.id}` }); });
  if (locationTables.length > 0) allButtons.push({ numericId: parseInt((locationTables[0]?.id || 'T14').replace('T', ''), 10), key: 'locations', stageType: 'other', description: 'מיקומים בתום שלב הבתים', sectionKey: 'locations' });
  if (israeliTable) allButtons.push({ numericId: parseInt(israeliTable.id.replace('T', ''), 10), key: israeliTable.id, description: israeliTable.description, stageType: 'special', sectionKey: 'israeli' });
  if (playoffWinnersTable) allButtons.push({ numericId: parseInt(playoffWinnersTable.id.replace('T', ''), 10), key: playoffWinnersTable.id, description: playoffWinnersTable.description, stageType: 'qualifiers', sectionKey: 'playoffWinners' });
  allButtons.sort((a, b) => a.numericId - b.numericId);

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
      if (!type) { if (btn.sectionKey.startsWith('round_')) type = 'playoff'; else if (btn.sectionKey.startsWith('qual_') || btn.sectionKey === 'playoffWinners') type = 'qualifiers'; else type = 'special'; }
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(btn);
    });
    const order = ['rounds','league','groups','playoff','special','qualifiers','other'];
    const sortedGroups = order.filter(t => grouped[t]);
    return (
      <div style={{ background: 'rgba(13,18,30,0.9)', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.12)', padding: '14px 10px', backdropFilter: 'blur(10px)' }}>
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

  // ========= MOBILE HORIZONTAL CHIPS =========
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
      <div style={{ padding: '12px', background: 'rgba(17,24,39,0.7)', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.12)', marginBottom: '16px' }}>
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

  const hasStages = roundTables.length > 0 || specialTables.length > 0 || locationTables.length > 0 || israeliTable || playoffWinnersTable || qualifiersTables.length > 0;

  const renderContent = () => allButtons.map(button => {
    if (!openSections[button.sectionKey]) return null;
    if (button.sectionKey.startsWith('round_')) {
      const tableId = button.sectionKey.replace('round_', '');
      const table = roundTables.find(t => t.id === tableId);
      if (!table) return null;
      return (<div key={button.key} className="mb-6"><RoundTable table={table} teams={teams} predictions={predictions} onPredictionChange={handlePredictionChange} cardStyle={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', backdropFilter: 'blur(10px)' }} titleStyle={{ color: '#06b6d4' }} questionRowStyle={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(6, 182, 212, 0.1)', transition: 'all 0.2s ease-in-out' }} questionRowHoverClass="hover:bg-cyan-900/20 hover:border-cyan-700/50" badgeStyle={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4' }} questionTextStyle={{ color: '#94a3b8' }} inputStyle={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', color: '#f8fafc' }} />{table.specialQuestions && table.specialQuestions.length > 0 && (<div className="mt-4">{renderSpecialQuestions({ ...table, questions: table.specialQuestions })}</div>)}</div>);
    }
    if (button.sectionKey === 'israeli' && israeliTable) return (<div key="israeli-section" className="mb-6"><RoundTable table={israeliTable} teams={teams} predictions={predictions} onPredictionChange={handlePredictionChange} cardStyle={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', backdropFilter: 'blur(10px)' }} titleStyle={{ color: '#06b6d4' }} questionRowStyle={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(6, 182, 212, 0.1)' }} questionRowHoverClass="hover:bg-cyan-900/20 hover:border-cyan-700/50" badgeStyle={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4' }} questionTextStyle={{ color: '#94a3b8' }} inputStyle={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', color: '#f8fafc' }} /></div>);
    if (button.sectionKey === 'locations') return (<div key="locations-section" className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">{locationTables.map(table => renderSpecialQuestions(table))}</div>);
    if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) return (<div key="playoff-winners-section" className="mb-6">{renderSpecialQuestions(playoffWinnersTable)}</div>);
    if (button.sectionKey.startsWith('qual_')) { const tableId = button.sectionKey.replace('qual_', ''); const table = qualifiersTables.find(t => t.id === tableId); if (!table) return null; return (<div key={button.sectionKey} className="mb-6">{renderSpecialQuestions(table)}</div>); }
    const specificSpecialTable = specialTables.find(t => t.id === button.key);
    if (specificSpecialTable) return (<div key={specificSpecialTable.id} className="mb-6">{renderSpecialQuestions(specificSpecialTable)}</div>);
    return null;
  });

  return (
    <div dir="rtl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', minHeight: '100vh' }}>

      {/* ===== STICKY HEADER ===== */}
      <div className="sticky top-0 z-30 backdrop-blur-sm shadow-lg" style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(6, 182, 212, 0.2)' }}>
        <div className="p-3 md:p-4 max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2" style={{ color: '#f8fafc', textShadow: '0 0 10px rgba(6, 182, 212, 0.3)' }}>
              <Trophy className="w-5 h-5 md:w-7 md:h-7" style={{ color: '#06b6d4' }} />
              מילוי ניחושים
            </h1>
            {currentGame?.game_name && <p className="text-xs font-medium" style={{ color: '#06b6d4' }}>{currentGame.game_name}</p>}
            {participantName && <p className="text-xs" style={{ color: '#94a3b8' }}>משתתף: <strong style={{ color: '#f8fafc' }}>{participantName}</strong></p>}
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button onClick={toggleFormLock} variant={isFormLocked ? "destructive" : "default"} size="sm" className={`${isFormLocked ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} text-white`}>
                {isFormLocked ? <><Lock className="w-4 h-4 ml-1.5" />נעול</> : <><Unlock className="w-4 h-4 ml-1.5" />פתוח</>}
              </Button>
            )}
            <Button onClick={saveAllPredictions} disabled={saving} style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)', boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)' }} className="text-white" size="sm">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin ml-1.5" />שומר...</> : <><Save className="w-4 h-4 ml-1.5" />שמור הכל</>}
            </Button>
          </div>
        </div>
      </div>

      {/* ===== BODY: SIDEBAR + CONTENT ===== */}
      {hasStages ? (
        <div className="flex max-w-7xl mx-auto" style={{ alignItems: 'flex-start' }}>
          {/* Desktop sidebar */}
          <aside className="hidden md:block flex-shrink-0 p-4" style={{ width: '215px' }}>
            <div style={{ position: 'sticky', top: '70px', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
              {renderStageSidebar(allButtons, openSections, toggleSection)}
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 p-3 md:p-5">
            {/* Mobile chips */}
            <div className="md:hidden mb-4">
              {renderStageChips(allButtons, openSections, toggleSection)}
            </div>
            {renderContent()}
          </main>
        </div>
      ) : (
        <div className="p-6 max-w-7xl mx-auto">
          <Alert style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
            <FileText className="w-4 h-4" />
            <AlertDescription>לא נמצאו שאלות במערכת עבור המשחק הנבחר. אנא העלה קבצים תחילה בעמוד "העלאת קבצים".</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
