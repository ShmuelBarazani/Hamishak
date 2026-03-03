import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { Database, Users, FileQuestion, Trophy, List, Table, Loader2, BarChart3, Shield, RefreshCw, CheckCircle, Trash2, AlertTriangle, Edit, GripVertical, UploadIcon, Plus, Upload } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import UploadFilesDialog from "@/components/system/UploadFilesDialog";
import { useGame } from '@/components/contexts/GameContext';

const ADMIN_EMAILS = ["tropikan1@gmail.com"];

const isAdminUser = (user) => {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.app_metadata?.role === 'admin' ||
    ADMIN_EMAILS.includes(user.email)
  );
};

export default function SystemOverview() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [stats, setStats] = useState({
    totalQuestions: 0,
    totalParticipants: 0,
    totalPredictions: 0,
    totalTeams: 0,
    totalValidationLists: 0,
    totalTables: 0,
    tableBreakdown: {},
    participantBreakdown: {},
    missingPredictionsReport: [],
    allParticipants: [],
  });
  const [locationDuplicates, setLocationDuplicates] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [showValidationListsDialog, setShowValidationListsDialog] = useState(false);
  const [showTeamsDialog, setShowTeamsDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showUploadMissingDialog, setShowUploadMissingDialog] = useState(false);
  const [uploadingMissing, setUploadingMissing] = useState(false);
  const [validationLists, setValidationLists] = useState([]);
  const [teams, setTeams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [games, setGames] = useState([]);

  const [editingListId, setEditingListId] = useState(null);
  const [editedOptions, setEditedOptions] = useState([]);
  const [newOption, setNewOption] = useState("");
  const [editingOptionIndex, setEditingOptionIndex] = useState(null);
  const [editingOptionValue, setEditingOptionValue] = useState("");

  const [showCreateListDialog, setShowCreateListDialog] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListOptions, setNewListOptions] = useState([""]);

  const [refreshing, setRefreshing] = useState({
    fullData: false,
    users: false,
  });

  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentGame } = useGame();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await supabase.auth.getUser().then(r => r.data.user);
        setCurrentUser(user);
      } catch (error) {
        console.error("Error loading current user:", error);
        setCurrentUser(null);
      }
    };
    loadUser();
  }, []);

  const loadSystemStats = useCallback(async () => {
    if (!currentGame) {
      toast({ title: "נא בחר משחק", variant: "default" });
      return;
    }

    setLoading(true);
    setRefreshing(prev => ({ ...prev, fullData: true }));

    try {
      // טען שאלות
      const questionsForGame = await db.Question.filter({ game_id: currentGame.id }, null, 10000);
      setQuestions(questionsForGame);

      const teamsArray = currentGame.teams_data || [];
      setTeams(teamsArray);

      const validationListsArray = currentGame.validation_lists || [];
      setValidationLists(validationListsArray);
      setGames([currentGame]);

      // טען את כל הניחושים לפי game_id — הרבה יותר מהיר!
      toast({
        title: "טוען ניחושים...",
        className: "bg-blue-100 text-blue-800",
        duration: 3000
      });

      let allRawPredictions = [];
      let offset = 0;
      const batchSize = 1000;
      while (true) {
        const batch = await db.Prediction.filter(
          { game_id: currentGame.id },
          '-created_at',
          batchSize,
          offset
        );
        allRawPredictions = [...allRawPredictions, ...batch];
        if (batch.length < batchSize) break;
        offset += batchSize;
        toast({
          title: `טוען ניחושים... ${allRawPredictions.length.toLocaleString()}`,
          className: "bg-blue-100 text-blue-800",
          duration: 2000
        });
      }

      // נרמול: שמור רק ניחוש אחד לכל (משתתף, שאלה) — הכי עדכני
      const byParticipantAndQuestion = new Map();
      allRawPredictions.forEach(pred => {
        const participantName = pred.participant_name?.trim();
        if (!participantName) return;
        const key = `${participantName}|||${pred.question_id}`;
        if (!byParticipantAndQuestion.has(key)) {
          byParticipantAndQuestion.set(key, pred);
        } else {
          const existing = byParticipantAndQuestion.get(key);
          const predDate = new Date(pred.created_at || pred.created_date || 0);
          const existDate = new Date(existing.created_at || existing.created_date || 0);
          if (predDate > existDate) {
            byParticipantAndQuestion.set(key, pred);
          }
        }
      });

      const allPredictions = Array.from(byParticipantAndQuestion.values());
      const uniqueParticipants = new Set(
        allPredictions.map(p => p.participant_name?.trim()).filter(Boolean)
      );

      // בנה breakdown לפי טבלאות
      const tableBreakdown = {};
      questionsForGame.forEach(q => {
        const tableId = String(q.table_id || '').trim();
        if (!tableId) return;
        if (!tableBreakdown[tableId]) {
          tableBreakdown[tableId] = {
            description: q.table_description || tableId,
            questionCount: 0,
            predictionCount: 0
          };
        }
        tableBreakdown[tableId].questionCount++;
      });

      // map question uuid -> table_id
      const questionIdToTableMap = new Map();
      questionsForGame.forEach(q => questionIdToTableMap.set(q.id, q.table_id));

      allPredictions.forEach(p => {
        const tableId = questionIdToTableMap.get(p.question_id);
        if (tableId && tableBreakdown[tableId]) {
          tableBreakdown[tableId].predictionCount++;
        }
      });

      // breakdown לפי משתתפים
      const participantBreakdown = {};
      allPredictions.forEach(p => {
        const name = p.participant_name?.trim();
        if (name) {
          participantBreakdown[name] = (participantBreakdown[name] || 0) + 1;
        }
      });

      // ניחושים חסרים
      const gameQuestionIds = new Set(questionsForGame.map(q => q.id));
      const missingPredictionsReport = [];

      uniqueParticipants.forEach(participantName => {
        const participantPredictions = allPredictions.filter(
          p => p.participant_name?.trim() === participantName
        );
        const predictedQuestionIds = new Set(participantPredictions.map(p => p.question_id));
        const missingQuestions = questionsForGame.filter(q => !predictedQuestionIds.has(q.id));

        if (missingQuestions.length > 0) {
          missingPredictionsReport.push({
            participant: String(participantName),
            missing: missingQuestions.map(q => ({
              table_id: q.table_id,
              question_id: q.question_id,
              question_text: q.question_text
            })).sort((a, b) => {
              const tA = parseInt(String(a.table_id).replace('T', '')) || 0;
              const tB = parseInt(String(b.table_id).replace('T', '')) || 0;
              if (tA !== tB) return tA - tB;
              return parseFloat(a.question_id) - parseFloat(b.question_id);
            }),
            totalMissing: missingQuestions.length
          });
        }
      });

      // כפילויות מיקום
      const extractTeamName = (fullName) => {
        if (!fullName) return '';
        const match = fullName.match(/^([^(]+)/);
        return match ? match[1].trim() : fullName.trim();
      };
      const normalizeTeamName = (name) => {
        if (!name) return '';
        return name.replace(/קרבאך/g, 'קרבאח').replace(/קראבח/g, 'קרבאח').replace(/קראבך/g, 'קרבאח').trim();
      };

      const allPossibleTeams = new Set();
      teamsArray.forEach(team => {
        if (team.name) allPossibleTeams.add(normalizeTeamName(extractTeamName(team.name)));
      });
      validationListsArray.forEach(vl => {
        if (vl.options) {
          vl.options.forEach(team => allPossibleTeams.add(normalizeTeamName(extractTeamName(String(team)))));
        }
      });

      const duplicatesReport = [];
      uniqueParticipants.forEach(participantName => {
        const participantPredictions = allPredictions.filter(
          p => gameQuestionIds.has(p.question_id) && p.participant_name?.trim() === participantName
        );

        const selectedTeamsWithPositions = {};
        const selectedTeamsSet = new Set();

        participantPredictions.forEach(pred => {
          const question = questionsForGame.find(q => q.id === pred.question_id);
          if (question && pred.text_prediction && pred.text_prediction.trim()) {
            const fullTeam = String(pred.text_prediction).trim();
            const teamName = extractTeamName(fullTeam);
            const normalized = normalizeTeamName(teamName);
            selectedTeamsSet.add(normalized);
            const positionText = question.question_text || `שאלה ${question.question_id} (${question.table_id})`;
            if (!selectedTeamsWithPositions[normalized]) selectedTeamsWithPositions[normalized] = [];
            selectedTeamsWithPositions[normalized].push(positionText);
          }
        });

        const participantFullReport = { participant: String(participantName), duplicates: [], missingTeams: [] };
        Object.entries(selectedTeamsWithPositions).forEach(([team, positions]) => {
          if (positions.length > 1) {
            participantFullReport.duplicates.push({ team: String(team), positions: positions.sort() });
          }
        });

        if (participantFullReport.duplicates.length > 0) {
          participantFullReport.missingTeams = Array.from(allPossibleTeams)
            .filter(team => !selectedTeamsSet.has(team)).sort();
          duplicatesReport.push(participantFullReport);
        }
      });

      const uniqueTables = new Set(questionsForGame.map(q => q.table_id).filter(Boolean));

      setStats({
        totalQuestions: questionsForGame.length,
        totalParticipants: uniqueParticipants.size,
        totalPredictions: allPredictions.length,
        totalTeams: teamsArray.length,
        totalValidationLists: validationListsArray.length,
        totalTables: uniqueTables.size,
        tableBreakdown,
        participantBreakdown,
        missingPredictionsReport,
        allParticipants: Array.from(uniqueParticipants),
      });

      setLocationDuplicates(duplicatesReport);
      setLastUpdated(new Date().toISOString());

      // שמור ב-cache
      try {
        const cacheKey = `system_overview_${currentGame.id}`;
        localStorage.setItem(cacheKey, JSON.stringify({
          stats: {
            totalQuestions: questionsForGame.length,
            totalParticipants: uniqueParticipants.size,
            totalPredictions: allPredictions.length,
            totalTeams: teamsArray.length,
            totalValidationLists: validationListsArray.length,
            totalTables: uniqueTables.size,
            tableBreakdown,
            participantBreakdown,
            missingPredictionsReport,
            allParticipants: Array.from(uniqueParticipants),
          },
          locationDuplicates: duplicatesReport,
          validationLists: validationListsArray,
          teams: teamsArray,
          questions: questionsForGame,
          games: [currentGame],
          lastUpdated: new Date().toISOString()
        }));
      } catch (e) {
        console.log('לא ניתן לשמור ב-cache');
      }

      toast({
        title: "כל הנתונים נטענו בהצלחה!",
        description: `${allPredictions.length.toLocaleString()} ניחושים עבור ${currentGame.game_name}`,
        className: "bg-green-100 text-green-800"
      });

    } catch (error) {
      console.error("שגיאה בטעינת נתונים:", error);
      toast({
        title: "שגיאה",
        description: error.message || "לא ניתן לטעון נתונים מהשרת",
        variant: "destructive"
      });
    }

    setLoading(false);
    setRefreshing(prev => ({ ...prev, fullData: false }));
  }, [currentGame, toast]);

  useEffect(() => {
    if (!currentUser || !currentGame) return;
    const cacheKey = `system_overview_${currentGame.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        setStats(cachedData.stats);
        setLocationDuplicates(cachedData.locationDuplicates || []);
        setValidationLists(cachedData.validationLists || []);
        setTeams(cachedData.teams || []);
        setQuestions(cachedData.questions || []);
        setGames(cachedData.games || []);
        setLastUpdated(cachedData.lastUpdated);
      }
    } catch (e) {
      console.log('אין cache שמור');
    }
    setLoading(false);
  }, [currentUser, currentGame]);

  const loadValidationLists = () => setShowValidationListsDialog(true);
  const loadTeams = () => setShowTeamsDialog(true);

  const startEditingList = (list) => { setEditingListId(list.list_name); setEditedOptions([...list.options]); setNewOption(""); setEditingOptionIndex(null); setEditingOptionValue(""); };
  const cancelEditingList = () => { setEditingListId(null); setEditedOptions([]); setNewOption(""); setEditingOptionIndex(null); setEditingOptionValue(""); };
  const startEditingOption = (index, value) => { setEditingOptionIndex(index); setEditingOptionValue(value); };
  const saveEditingOption = () => { if (editingOptionValue.trim()) { const newOptions = [...editedOptions]; newOptions[editingOptionIndex] = editingOptionValue.trim(); setEditedOptions(newOptions); } setEditingOptionIndex(null); setEditingOptionValue(""); };
  const cancelEditingOption = () => { setEditingOptionIndex(null); setEditingOptionValue(""); };
  const addNewOption = () => { if (newOption.trim()) { setEditedOptions([...editedOptions, newOption.trim()]); setNewOption(""); } };
  const removeOption = (index) => setEditedOptions(editedOptions.filter((_, i) => i !== index));
  const addOptionToNewList = () => setNewListOptions([...newListOptions, ""]);
  const updateNewListOption = (index, value) => setNewListOptions(newListOptions.map((opt, i) => i === index ? value : opt));
  const removeNewListOption = (index) => { if (newListOptions.length === 1) return; setNewListOptions(newListOptions.filter((_, i) => i !== index)); };

  const saveEditedList = async (listName) => {
    try {
      if (!currentGame) { toast({ title: "שגיאה", description: "נא לבחור משחק תחילה", variant: "destructive" }); return; }
      const updatedValidationLists = (currentGame.validation_lists || []).map(list => list.list_name === listName ? { ...list, options: editedOptions } : list);
      await db.Game.update(currentGame.id, { validation_lists: updatedValidationLists });
      setValidationLists(prevLists => prevLists.map(list => list.list_name === listName ? { ...list, options: editedOptions } : list));
      setEditingListId(null); setEditedOptions([]); setEditingOptionIndex(null); setEditingOptionValue("");
      toast({ title: "נשמר!", description: "רשימת האימות עודכנה בהצלחה", className: "bg-green-100 text-green-800" });
    } catch (error) {
      toast({ title: "שגיאה", description: "לא ניתן לשמור את השינויים", variant: "destructive" });
    }
  };

  const deleteValidationList = async (listName) => {
    const questionsUsingList = questions.filter(q => q.validation_list === listName);
    if (questionsUsingList.length > 0) { toast({ title: "לא ניתן למחוק", description: `${questionsUsingList.length} שאלות משתמשות ברשימה זו.`, variant: "destructive" }); return; }
    if (!window.confirm(`האם למחוק את הרשימה "${listName}"?`)) return;
    try {
      if (!currentGame) { toast({ title: "שגיאה", description: "נא לבחור משחק תחילה", variant: "destructive" }); return; }
      const updatedValidationLists = (currentGame.validation_lists || []).filter(list => list.list_name !== listName);
      await db.Game.update(currentGame.id, { validation_lists: updatedValidationLists });
      setValidationLists(prevLists => prevLists.filter(list => list.list_name !== listName));
      toast({ title: "נמחק!", description: "רשימת האימות נמחקה בהצלחה", className: "bg-green-100 text-green-800" });
    } catch (error) {
      toast({ title: "שגיאה", description: "לא ניתן למחוק את הרשימה", variant: "destructive" });
    }
  };

  const createNewValidationList = async () => {
    if (!newListName.trim()) { toast({ title: "שגיאה", description: "נא למלא שם רשימה", variant: "destructive" }); return; }
    const validOptions = newListOptions.filter(opt => opt.trim());
    if (validOptions.length === 0) { toast({ title: "שגיאה", description: "נא להוסיף לפחות אופציה אחת", variant: "destructive" }); return; }
    if (!currentGame) { toast({ title: "שגיאה", description: "נא לבחור משחק תחילה", variant: "destructive" }); return; }
    try {
      const newList = { list_name: newListName, options: validOptions };
      const updatedValidationLists = [...(currentGame.validation_lists || []), newList];
      await db.Game.update(currentGame.id, { validation_lists: updatedValidationLists });
      setValidationLists(prev => [...prev, newList]);
      toast({ title: "נוצר!", description: `רשימת האימות "${newListName}" נוצרה בהצלחה`, className: "bg-green-100 text-green-800" });
      setShowCreateListDialog(false); setNewListName(""); setNewListOptions([""]);
    } catch (error) {
      toast({ title: "שגיאה", description: "לא ניתן ליצור את רשימת האימות", variant: "destructive" });
    }
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען...</span>
      </div>
    );
  }

  if (!isAdminUser(currentUser)) {
    return (
      <div className="p-6 flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <Card style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }} className="p-6">
          <div className="flex flex-col items-center gap-4">
            <Shield className="w-16 h-16" style={{ color: '#ef4444' }} />
            <h2 className="text-2xl font-bold" style={{ color: '#f8fafc' }}>אין הרשאה</h2>
            <p style={{ color: '#94a3b8' }}>דף זה זמין רק למנהלים</p>
          </div>
        </Card>
      </div>
    );
  }

  if (refreshing.fullData || refreshing.users) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>
          {refreshing.fullData ? `טוען נתונים עבור ${currentGame?.game_name || 'המשחק הנבחר'}...` : "טוען מטמון משתמשים..."}
        </span>
      </div>
    );
  }

  const statCards = [
    { title: "שאלות במערכת", value: stats.totalQuestions, icon: FileQuestion, color: '#06b6d4', onClick: null },
    { title: "משתתפים", value: stats.totalParticipants, icon: Users, color: '#0ea5e9', onClick: null },
    { title: "ניחושים", value: stats.totalPredictions, icon: BarChart3, color: '#8b5cf6', onClick: null },
    { title: "טבלאות", value: stats.totalTables, icon: Table, color: '#10b981', onClick: null },
    { title: "קבוצות", value: stats.totalTeams, icon: Trophy, color: '#f59e0b', onClick: loadTeams },
    { title: "רשימות אימות", value: stats.totalValidationLists, icon: List, color: '#ec4899', onClick: loadValidationLists }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', minHeight: '100vh' }}>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3" style={{ color: '#f8fafc', textShadow: '0 0 10px rgba(6, 182, 212, 0.3)' }}>
            <Database className="w-10 h-10" style={{ color: '#06b6d4' }} />
            סקירת מערכת {currentGame && <span className="text-xl text-cyan-300"> ({currentGame.game_name})</span>}
          </h1>
          <p style={{ color: '#94a3b8' }}>כל הנתונים במערכת - תמיד זמינים</p>
          {lastUpdated && (
            <p className="text-sm mt-1" style={{ color: '#64748b' }}>
              <CheckCircle className="w-3 h-3 inline ml-1" />
              עודכן לאחרונה: {new Date(lastUpdated).toLocaleString('he-IL')}
            </p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap justify-end">
          <Button onClick={() => setShowUploadDialog(true)} disabled={loading || refreshing.fullData} size="lg" variant="outline"
            style={{ borderColor: 'rgba(139, 92, 246, 0.5)', color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' }}>
            <UploadIcon className="w-5 h-5 ml-2" />העלאת קבצים
          </Button>
          <Button onClick={loadSystemStats} disabled={loading || refreshing.fullData || !currentGame} size="lg"
            style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)', boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)' }} className="text-white">
            {refreshing.fullData ? <Loader2 className="w-5 h-5 ml-2 animate-spin" /> : <RefreshCw className="w-5 h-5 ml-2" />}
            רענן נתוני משחק
          </Button>
        </div>
      </div>

      {stats.totalQuestions === 0 && currentGame && (
        <Alert className="mb-6" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <AlertDescription style={{ color: '#fca5a5' }}>לא נמצאו נתונים עבור המשחק הנבחר.</AlertDescription>
        </Alert>
      )}
      {!currentGame && (
        <Alert className="mb-6" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
          <AlertDescription style={{ color: '#fbbf24' }}>💡 בחר משחק מהתפריט העליון כדי לטעון נתונים.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat, idx) => (
          <Card key={idx} style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', cursor: stat.onClick ? 'pointer' : 'default' }}
            className="hover:border-cyan-500 transition-all" onClick={stat.onClick}>
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-center text-center">
                <stat.icon className="w-8 h-8 mb-2" style={{ color: stat.color }} />
                <p className="text-xs mb-1" style={{ color: '#94a3b8' }}>{stat.title}</p>
                <p className="text-3xl font-bold" style={{ color: stat.color }}>{stat.value.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* פירוט לפי טבלאות */}
      <Card className="mb-6" style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
        <CardHeader><CardTitle style={{ color: '#06b6d4' }}>פירוט לפי טבלאות</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(stats.tableBreakdown).length === 0 ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>אין נתונים - בחר משחק או רענן</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(stats.tableBreakdown)
                .sort((a, b) => { const aNum = parseInt(a[0].replace('T', '')) || 0; const bNum = parseInt(b[0].replace('T', '')) || 0; return aNum - bNum; })
                .map(([tableId, data]) => (
                  <div key={tableId} className="p-4 rounded-lg" style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' }}>{tableId}</Badge>
                    </div>
                    <p className="text-sm font-medium mb-2 leading-tight" style={{ color: '#f8fafc' }}>{data.description}</p>
                    <div className="flex justify-between text-xs" style={{ color: '#94a3b8' }}>
                      <span>שאלות: {data.questionCount}</span>
                      <span>ניחושים: {data.predictionCount}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* פירוט לפי משתתפים */}
      <Card className="mb-6" style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
        <CardHeader>
          <CardTitle style={{ color: '#06b6d4' }}>פירוט לפי משתתפים</CardTitle>
          <p className="text-sm" style={{ color: '#94a3b8' }}>המספר ליד כל משתתף = כמות הניחושים שהוא מילא</p>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(stats.participantBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <div key={name} className="p-3 rounded border flex items-center justify-between"
                  style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                  <span className="text-sm font-medium" style={{ color: '#f8fafc' }}>{name}</span>
                  <Badge style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)', color: 'white' }}>{count}</Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* מטריצת ניחושים חסרים */}
      {stats.missingPredictionsReport && stats.missingPredictionsReport.length > 0 && stats.allParticipants && stats.allParticipants.length > 0 && (() => {
        const allParticipants = [...stats.allParticipants].sort();
        const missingMap = new Map();
        stats.missingPredictionsReport.forEach(report => {
          report.missing.forEach(q => {
            const key = `${q.table_id}|${q.question_id}`;
            if (!missingMap.has(key)) missingMap.set(key, { table_id: q.table_id, question_id: q.question_id, question_text: q.question_text, participants: new Set() });
            missingMap.get(key).participants.add(report.participant);
          });
        });
        const sortedQuestions = Array.from(missingMap.values()).sort((a, b) => {
          const tA = parseInt(String(a.table_id).replace('T', '')) || 0;
          const tB = parseInt(String(b.table_id).replace('T', '')) || 0;
          if (tA !== tB) return tA - tB;
          return parseFloat(a.question_id) - parseFloat(b.question_id);
        });
        return (
          <Card className="mb-6" style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle style={{ color: '#06b6d4' }}>מטריצת ניחושים חסרים</CardTitle>
                  <p className="text-sm" style={{ color: '#94a3b8' }}>X = ניחוש חסר | {sortedQuestions.length} שאלות עם ניחושים חסרים</p>
                </div>
                <Button onClick={() => setShowUploadMissingDialog(true)} disabled={uploadingMissing}
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
                  {uploadingMissing ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Upload className="w-4 h-4 ml-2" />}
                  טען ניחושים
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ overflow: 'auto', maxHeight: '600px' }}>
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 10 }}>
                    <tr style={{ borderBottom: '2px solid rgba(6, 182, 212, 0.3)' }}>
                      <th className="p-2 text-right" style={{ color: '#94a3b8', position: 'sticky', right: 0, background: '#0f172a', zIndex: 11 }}>טבלה</th>
                      <th className="p-2 text-right" style={{ color: '#94a3b8', position: 'sticky', right: '60px', background: '#0f172a', zIndex: 11 }}>שאלה</th>
                      {allParticipants.map(p => (
                        <th key={p} className="p-1 text-center" style={{ color: '#94a3b8', minWidth: '40px', writingMode: 'vertical-rl' }}>{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedQuestions.map((q, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}>
                        <td className="p-2" style={{ position: 'sticky', right: 0, background: '#1e293b', zIndex: 1 }}>
                          <Badge style={{ background: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)', fontSize: '10px' }}>{q.table_id}</Badge>
                        </td>
                        <td className="p-2" style={{ position: 'sticky', right: '60px', background: '#1e293b', zIndex: 1 }}>
                          <Badge style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.3)', fontSize: '10px' }}>{q.question_id}</Badge>
                        </td>
                        {allParticipants.map(p => (
                          <td key={p} className="p-1 text-center" style={{ background: q.participants.has(p) ? 'rgba(239, 68, 68, 0.2)' : 'transparent' }}>
                            {q.participants.has(p) && <span style={{ color: '#ef4444', fontWeight: 'bold' }}>X</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* דיאלוג רשימות אימות */}
      <Dialog open={showValidationListsDialog} onOpenChange={setShowValidationListsDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto"
          style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(6, 182, 212, 0.3)' }} dir="rtl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle style={{ color: '#06b6d4', fontSize: '24px' }}>רשימות אימות ({validationLists.length})</DialogTitle>
              <Button onClick={() => setShowCreateListDialog(true)} size="sm" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
                <Plus className="w-4 h-4 ml-1" />רשימה חדשה
              </Button>
            </div>
          </DialogHeader>
          <DragDropContext onDragEnd={async (result) => {
            if (!result.destination) return;
            const destListName = result.destination.droppableId;
            const questionId = result.draggableId;
            if (result.source.droppableId === destListName) return;
            try {
              await db.Question.update(questionId, { validation_list: destListName === 'null' ? null : destListName });
              setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, validation_list: destListName === 'null' ? null : destListName } : q));
              toast({ title: "שאלה הועברה!", className: "bg-green-100 text-green-800" });
            } catch (error) {
              toast({ title: "שגיאה", variant: "destructive" });
            }
          }}>
            <div className="space-y-6">
              {validationLists.sort((a, b) => a.list_name.localeCompare(b.list_name, 'he')).map((list, listIndex) => {
                const questionsUsingThisList = questions.filter(q => q.validation_list === list.list_name);
                const isEditing = editingListId === list.list_name;
                const displayOptions = isEditing ? editedOptions : list.options;
                return (
                  <Card key={list.list_name} className="bg-slate-800/50 border-cyan-500/30">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge style={{ background: '#06b6d4', color: 'white' }}>{listIndex + 1}</Badge>
                          <CardTitle className="text-cyan-300 text-xl">{list.list_name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge style={{ background: '#0ea5e9', color: 'white' }}>{displayOptions.length} אופציות</Badge>
                          <Badge style={{ background: '#8b5cf6', color: 'white' }}>{questionsUsingThisList.length} שאלות</Badge>
                          {!isEditing ? (
                            <>
                              <Button size="sm" onClick={() => startEditingList(list)} style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)', color: 'white' }}>
                                <Edit className="w-4 h-4 ml-1" />ערוך
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteValidationList(list.list_name)} disabled={questionsUsingThisList.length > 0}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" onClick={() => saveEditedList(list.list_name)} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
                                <CheckCircle className="w-4 h-4 ml-1" />שמור
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEditingList} style={{ borderColor: '#94a3b8', color: '#94a3b8' }}>ביטול</Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto mb-3">
                        {displayOptions.map((opt, idx) => {
                          const isEditingThis = isEditing && editingOptionIndex === idx;
                          return (
                            <div key={idx} className="p-2 bg-slate-700/50 rounded border border-cyan-500/20 text-sm text-white flex items-center justify-between gap-2">
                              {isEditingThis ? (
                                <>
                                  <Input value={editingOptionValue} onChange={e => setEditingOptionValue(e.target.value)} onKeyPress={e => e.key === 'Enter' && saveEditingOption()} autoFocus className="flex-1 h-6 text-xs" style={{ background: '#0f172a', border: '1px solid rgba(6,182,212,.3)', color: '#f8fafc' }} />
                                  <Button size="sm" variant="ghost" onClick={saveEditingOption} className="h-6 w-6 p-0"><CheckCircle className="w-3 h-3 text-green-400" /></Button>
                                  <Button size="sm" variant="ghost" onClick={cancelEditingOption} className="h-6 w-6 p-0"><span className="text-xs text-gray-400">✕</span></Button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1">{idx + 1}. {opt}</span>
                                  {isEditing && (
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="ghost" onClick={() => startEditingOption(idx, opt)} className="h-6 w-6 p-0"><Edit className="w-3 h-3 text-cyan-400" /></Button>
                                      <Button size="sm" variant="ghost" onClick={() => removeOption(idx)} className="h-6 w-6 p-0"><Trash2 className="w-3 h-3 text-red-400" /></Button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {isEditing && (
                        <div className="flex gap-2 mb-3">
                          <Input value={newOption} onChange={e => setNewOption(e.target.value)} onKeyPress={e => e.key === 'Enter' && addNewOption()} placeholder="אופציה חדשה..." className="flex-1"
                            style={{ background: '#0f172a', border: '1px solid rgba(6,182,212,.3)', color: '#f8fafc' }} />
                          <Button onClick={addNewOption} size="sm" style={{ background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: 'white' }}>הוסף</Button>
                        </div>
                      )}
                      <Droppable droppableId={list.list_name}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 min-h-[60px] p-2 rounded"
                            style={{ background: snapshot.isDraggingOver ? 'rgba(6,182,212,.1)' : 'transparent', border: snapshot.isDraggingOver ? '2px dashed rgba(6,182,212,.5)' : '2px dashed transparent' }}>
                            {questionsUsingThisList.sort((a, b) => {
                              const tA = parseInt(a.table_id?.replace('T', '')) || 0;
                              const tB = parseInt(b.table_id?.replace('T', '')) || 0;
                              return tA !== tB ? tA - tB : parseFloat(a.question_id) - parseFloat(b.question_id);
                            }).map((q, index) => (
                              <Draggable key={q.id} draggableId={q.id} index={index}>
                                {(provided, snapshot) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2 p-2 rounded text-sm"
                                    style={{ ...provided.draggableProps.style, background: snapshot.isDragging ? 'rgba(6,182,212,.2)' : '#1e293b', border: '1px solid rgba(6,182,212,.2)', cursor: 'grab' }}>
                                    <div {...provided.dragHandleProps}><GripVertical className="w-4 h-4" style={{ color: '#06b6d4' }} /></div>
                                    <Badge variant="outline" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{q.table_id}</Badge>
                                    <Badge variant="outline" style={{ borderColor: '#0ea5e9', color: '#0ea5e9' }}>שאלה {q.question_id}</Badge>
                                    <span className="text-slate-300 flex-1">{q.question_text}</span>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            {questionsUsingThisList.length === 0 && !snapshot.isDraggingOver && (
                              <div className="text-center p-4"><AlertTriangle className="w-6 h-6 mx-auto mb-2" style={{ color: '#fbbf24' }} /><p className="text-sm" style={{ color: '#fbbf24' }}>אף שאלה לא משתמשת ברשימה זו</p></div>
                            )}
                          </div>
                        )}
                      </Droppable>
                    </CardContent>
                  </Card>
                );
              })}
              <Card className="bg-slate-800/50 border-cyan-500/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-cyan-300 text-xl">ללא רשימת אימות</CardTitle>
                    <Badge style={{ background: '#8b5cf6', color: 'white' }}>{questions.filter(q => !q.validation_list).length} שאלות</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Droppable droppableId="null">
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 min-h-[60px] p-2 rounded"
                        style={{ background: snapshot.isDraggingOver ? 'rgba(6,182,212,.1)' : 'rgba(251,191,36,.05)', border: snapshot.isDraggingOver ? '2px dashed rgba(6,182,212,.5)' : '2px dashed rgba(251,191,36,.3)' }}>
                        {questions.filter(q => !q.validation_list).sort((a, b) => {
                          const tA = parseInt(a.table_id?.replace('T', '')) || 0;
                          const tB = parseInt(b.table_id?.replace('T', '')) || 0;
                          return tA !== tB ? tA - tB : parseFloat(a.question_id) - parseFloat(b.question_id);
                        }).map((q, index) => (
                          <Draggable key={q.id} draggableId={q.id} index={index}>
                            {(provided, snapshot) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2 p-2 rounded text-sm"
                                style={{ ...provided.draggableProps.style, background: snapshot.isDragging ? 'rgba(6,182,212,.2)' : '#1e293b', border: '1px solid rgba(6,182,212,.2)', cursor: 'grab' }}>
                                <div {...provided.dragHandleProps}><GripVertical className="w-4 h-4" style={{ color: '#06b6d4' }} /></div>
                                <Badge variant="outline" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{q.table_id}</Badge>
                                <Badge variant="outline" style={{ borderColor: '#0ea5e9', color: '#0ea5e9' }}>שאלה {q.question_id}</Badge>
                                <span className="text-slate-300 flex-1">{q.question_text}</span>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </CardContent>
              </Card>
            </div>
          </DragDropContext>
        </DialogContent>
      </Dialog>

      {/* דיאלוג קבוצות */}
      <Dialog open={showTeamsDialog} onOpenChange={setShowTeamsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"
          style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(6, 182, 212, 0.3)' }} dir="rtl">
          <DialogHeader><DialogTitle style={{ color: '#06b6d4' }}>רשימת קבוצות ({teams.length})</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {teams.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')).map((team, idx) => (
              <div key={team.id || idx} className="p-3 bg-slate-700/30 rounded border border-cyan-500/20 flex items-center gap-2">
                {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-8 h-8 rounded-full" onError={e => e.target.style.display = 'none'} />}
                <span className="text-sm text-cyan-300">{idx + 1}.</span>
                <span className="text-sm text-white">{team.name}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <UploadFilesDialog open={showUploadDialog} onOpenChange={setShowUploadDialog} />

      {/* דיאלוג העלאת ניחושים חסרים */}
      <Dialog open={showUploadMissingDialog} onOpenChange={setShowUploadMissingDialog}>
        <DialogContent style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(6, 182, 212, 0.3)', maxWidth: '650px' }} dir="rtl">
          <DialogHeader><DialogTitle style={{ color: '#06b6d4' }}>העלאת ניחושים חסרים</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Alert style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
              <AlertDescription>
                <p className="font-semibold mb-2" style={{ color: '#06b6d4' }}>📋 פורמט הקובץ:</p>
                <ul className="list-disc list-inside space-y-1 text-sm" style={{ color: '#94a3b8' }}>
                  <li>עמודה 1: מזהה טבלה (T12, T13...)</li>
                  <li>עמודה 2: מספר שאלה</li>
                  <li>עמודות 3+: שמות משתתפים</li>
                </ul>
              </AlertDescription>
            </Alert>
            <input type="file" accept=".csv,.txt,.tsv" id="upload-missing" className="hidden" onChange={e => {
              const file = e.target.files[0];
              if (!file) return;
              (async () => {
                setUploadingMissing(true);
                try {
                  const text = await file.text();
                  const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim());
                  if (lines.length < 2) throw new Error("קובץ ריק");
                  const headers = lines[0].split('\t').map(h => h.trim());
                  const participantColumns = headers.slice(2);
                  const predictionsToCreate = [];
                  for (let i = 1; i < lines.length; i++) {
                    const cells = lines[i].split('\t').map(c => c?.trim() || '');
                    const tableId = cells[0]; const questionId = cells[1];
                    if (!tableId || !questionId) continue;
                    const question = questions.find(q => String(q.table_id).trim() === tableId && String(q.question_id).trim() === questionId);
                    if (!question) continue;
                    participantColumns.forEach((participantName, colIndex) => {
                      const value = cells[colIndex + 2];
                      if (value && value.trim()) {
                        predictionsToCreate.push({ game_id: currentGame.id, question_id: question.id, participant_name: participantName, text_prediction: value });
                      }
                    });
                  }
                  if (predictionsToCreate.length > 0) {
                    for (let i = 0; i < predictionsToCreate.length; i += 100) {
                      const chunk = predictionsToCreate.slice(i, i + 100);
                      await Promise.all(chunk.map(p => db.Prediction.create(p)));
                    }
                    toast({ title: "הצלחה!", description: `${predictionsToCreate.length} ניחושים נטענו`, className: "bg-green-100 text-green-800" });
                    await loadSystemStats();
                  } else {
                    toast({ title: "לא נמצאו נתונים", variant: "destructive" });
                  }
                } catch (error) {
                  toast({ title: "שגיאה", description: error.message, variant: "destructive" });
                }
                setUploadingMissing(false);
                setShowUploadMissingDialog(false);
              })();
            }} />
            <label htmlFor="upload-missing" className="flex items-center justify-center gap-2 w-full p-4 border rounded-lg cursor-pointer"
              style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.3)', color: '#06b6d4' }}>
              <Upload className="w-5 h-5" />בחר קובץ CSV
            </label>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג יצירת רשימה חדשה */}
      <Dialog open={showCreateListDialog} onOpenChange={setShowCreateListDialog}>
        <DialogContent style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(6, 182, 212, 0.3)', maxWidth: '600px' }} dir="rtl">
          <DialogHeader><DialogTitle style={{ color: '#06b6d4' }}>יצירת רשימת אימות חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="שם הרשימה" value={newListName} onChange={e => setNewListName(e.target.value)}
              style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', color: '#f8fafc' }} />
            <div className="space-y-2">
              {newListOptions.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input value={option} onChange={e => updateNewListOption(index, e.target.value)} placeholder={`אפשרות ${index + 1}...`}
                    style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(6, 182, 212, 0.2)', color: '#f8fafc' }} />
                  {newListOptions.length > 1 && <Button onClick={() => removeNewListOption(index)} variant="ghost" size="sm" className="text-red-400"><Trash2 className="w-4 h-4" /></Button>}
                </div>
              ))}
            </div>
            <Button onClick={addOptionToNewList} variant="outline" size="sm" style={{ borderColor: 'rgba(6, 182, 212, 0.3)', color: '#06b6d4' }}>
              <Plus className="w-4 h-4 ml-1" />הוסף אפשרות
            </Button>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => { setShowCreateListDialog(false); setNewListName(""); setNewListOptions([""]); }}
                style={{ borderColor: 'rgba(6, 182, 212, 0.3)', color: '#94a3b8' }}>ביטול</Button>
              <Button onClick={createNewValidationList} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
                <CheckCircle className="w-5 h-5 ml-2" />צור רשימה
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
