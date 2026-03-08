import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Prediction, Question, Team, ValidationList, User, SystemSettings } from "@/entities/all";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities'; // 🔧 Fixed import path
import { Users, Loader2, ChevronDown, ChevronUp, FileText, Trash2, AlertTriangle, Trophy, Pencil, Save, Download, Award, CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RoundTableReadOnly from "../components/predictions/RoundTableReadOnly";
import { calculateQuestionScore, calculateLocationBonus } from "@/components/scoring/ScoreService";
import StandingsTable from "../components/predictions/StandingsTable";
import { useGame } from "@/components/contexts/GameContext";

// 🆕 קומפוננטה להצגת סך הניקוד של המשתתף - חישוב בזמן אמת!
function ParticipantTotalScore({ participantName, gameId }) {
  const [totalScore, setTotalScore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadScore = async () => {
      if (!participantName || !gameId) {
        setLoading(false);
        return;
      }
      
      try {
        // 🔥 טען שאלות וניחושים לחישוב בזמן אמת
        const [allQuestions, allPredictions] = await Promise.all([
          db.Question.filter({ game_id: gameId }, null, 10000),
          db.Prediction.filter({ 
            participant_name: participantName,
            game_id: gameId 
          }, null, 10000)
        ]);
        
        // בנה מפת ניחושים - רק את האחרון של כל שאלה
        const tempPredictions = {};
        for (const p of allPredictions) {
          const existing = tempPredictions[p.question_id];
          if (!existing || new Date(p.created_date) > new Date(existing.created_date)) {
            tempPredictions[p.question_id] = {
              text_prediction: p.text_prediction,
              created_date: p.created_date
            };
          }
        }
        
        // המר למפה פשוטה
        const predictionsMap = {};
        for (const [qid, data] of Object.entries(tempPredictions)) {
          predictionsMap[qid] = data.text_prediction;
        }
        
        // חשב ניקוד בזמן אמת
        const { calculateTotalScore } = await import('@/components/scoring/ScoreService');
        const { total } = calculateTotalScore(allQuestions, predictionsMap);
        
        setTotalScore(total);
      } catch (error) {
        console.error("Failed to load participant score:", error);
        setTotalScore(null);
      }
      setLoading(false);
    };
    
    loadScore();
  }, [participantName, gameId]);

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#06b6d4' }} />;
  }

  if (totalScore === null) {
    return null;
  }

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
  const [allParticipants, setAllParticipants] = useState([]);

  // 🆕 מצב עריכה למנהלים
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPredictions, setEditedPredictions] = useState({});
  const [savingChanges, setSavingChanges] = useState(false);

  // 🔥 State חדש לרשימת קבוצות מרשימת האימות
  const [teamValidationList, setTeamValidationList] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [showMissingReport, setShowMissingReport] = useState(false);
  const [missingPredictions, setMissingPredictions] = useState([]);
  const [loadingMissing, setLoadingMissing] = useState(false);

  const { toast } = useToast();
  const { currentGame } = useGame();

  // 🔥 חשוב: isAdmin חייב להיות מחושב לפני כל השימושים בו
  const isAdmin = currentUser?.role === 'admin';

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

  useEffect(() => {
    const loadData = async () => {
      if (!currentGame) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // 🎯 טען רק נתונים של המשחק הנוכחי
        const [samplePredictions, questions] = await Promise.all([
          Prediction.filter({ game_id: currentGame.id }, null, 10000),
          Question.filter({ game_id: currentGame.id }, "-created_date", 10000)
        ]);

        // 🎯 השתמש בנתוני המשחק עצמו במקום entities נפרדות
        const teamsData = currentGame.teams_data || [];
        const validationListsData = currentGame.validation_lists || [];

        const teamsMap = teamsData.reduce((acc, team) => { acc[team.name] = team; return acc; }, {});
        const listsMap = validationListsData.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {});

        // 🔥 שמור את רשימת הקבוצות מרשימת האימות
        const teamListObj = validationListsData.find(list =>
          list.list_name?.toLowerCase().includes('קבוצ') &&
          !list.list_name?.toLowerCase().includes('מוקדמות')
        );

        if (teamListObj) {
          console.log(`✅ נמצאה רשימת אימות של קבוצות: ${teamListObj.list_name} עם ${teamListObj.options.length} קבוצות`);
          setTeamValidationList(teamListObj.options);
        }

        const uniqueParticipants = [...new Set(samplePredictions.map(p => p.participant_name))].sort();
        setAllParticipants(uniqueParticipants);

        const rTables = {}, sTables = {};
        questions.forEach(q => {
          if (!q.table_id) return;
          
          if (q.table_id === 'T20' && q.question_text) {
            let teams = null;
            if (q.question_text.includes(' נגד ')) {
              teams = q.question_text.split(' נגד ').map(t => t.trim());
            } else if (q.question_text.includes(' - ')) {
              teams = q.question_text.split(' - ').map(t => t.trim());
            }
            if (teams && teams.length === 2) {
              q.home_team = teams[0];
              q.away_team = teams[1];
            }
          }

          const tableCollection = (q.home_team && q.away_team) ? rTables : sTables;
          
          // 🎯 קביעת מזהה ותיאור טבלה
          let tableId = q.table_id;
          let tableDescription = q.table_description;
          
          // אם זה בית - קבץ לפי stage_name
          if (q.stage_name && q.stage_name.includes('בית')) {
            tableId = q.stage_name;
            tableDescription = q.stage_name;
          }
          // 🔥 אם זה שלב מיוחד עם stage_order - קבץ לפי stage_order
          else if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order) {
            tableId = `custom_order_${q.stage_order}`;
            tableDescription = q.stage_name || q.table_description;
          }
          
          if (q.table_id === 'T12') {
            tableDescription = 'שלב הליגה - פינת הגאווה הישראלית - 7 בוםםםםםםםםםם !!!';
          } else if (q.table_id === 'T13') {
            tableDescription = 'שלב ראש בראש - "מבול מטאורים של כוכבים (*)"';
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

        const t20Table = rTables['T20'];
        delete rTables['T20'];
        setIsraeliTable(t20Table || null);

        const participantQns = sTables['T1'] ? sTables['T1'].questions : [];
        const uniqueParticipantQns = participantQns.reduce((acc, current) => {
            if (!acc.find(item => item.question_text === current.question_text)) {
                acc.push(current);
            }
            return acc;
        }, []);
        setParticipantQuestions(uniqueParticipantQns);
        delete sTables['T1'];

        // 🔄 מיון בתים בסדר עברי נכון (א', ב', ג' וכו')
        const sortedRoundTables = Object.values(rTables).sort((a,b) => {
          const aIsGroup = a.id.includes('בית');
          const bIsGroup = b.id.includes('בית');

          if (aIsGroup && !bIsGroup) return -1; // בתים קודם
          if (!aIsGroup && bIsGroup) return 1;

          if (aIsGroup && bIsGroup) {
            // מיון לפי האות האחרונה (א', ב', ג')
            const aLetter = a.id.charAt(a.id.length - 1);
            const bLetter = b.id.charAt(b.id.length - 1);
            return aLetter.localeCompare(bLetter, 'he');
          }

          const aNum = parseInt(a.id.replace('T','')) || 0;
          const bNum = parseInt(b.id.replace('T','')) || 0;
          return aNum - bNum;
        });
        setRoundTables(sortedRoundTables);

        // 🔥 הפרדה: T9, T14-T17 במיקומים
        const locationTableIds = ['T9', 'T14', 'T15', 'T16', 'T17'];
        const locationGroup = Object.values(sTables)
            .filter(table => locationTableIds.includes(table.id))
            .sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0));
        setLocationTables(locationGroup);

        // 🆕 T19 נפרד
        const t19Table = sTables['T19'];
        setPlayoffWinnersTable(t19Table || null);

        // 🔥 כל השאר (ללא T19 וללא בתים) - מיון לפי stage_order
        const allSpecialTables = Object.values(sTables).filter(table => {
            const desc = table.description?.trim();
            const isGroup = table.id.includes('בית') || desc?.includes('בית');
            return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && table.id !== 'T19' && !isGroup;
        }).sort((a,b) => {
            // מיון לפי stage_order
            const orderA = a.questions[0]?.stage_order || 999;
            const orderB = b.questions[0]?.stage_order || 999;
            if (orderA !== orderB) return orderA - orderB;
            return (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0);
        });

        setSpecialTables(allSpecialTables);

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
        setEditedPredictions({}); // Reset edited predictions
        setIsEditMode(false); // Exit edit mode
        return;
      }
      
      // 🔐 אורחים יכולים לצפות בכל הניחושים ללא הגבלה
      
      setLoadingPredictions(true);
      try {
        const predictions = await Prediction.filter({ 
          participant_name: selectedParticipant,
          game_id: currentGame.id 
        }, null, 10000);
        setData(prev => ({ ...prev, predictions }));
        setEditedPredictions({}); // Reset edited predictions after loading
        setIsEditMode(false); // Exit edit mode after loading
      } catch (error) {
        console.error("Error loading participant predictions:", error);
      }
      setLoadingPredictions(false);
    };

    loadParticipantPredictions();
  }, [selectedParticipant, currentUser]);

  // 🔥 useMemo חייב להיות לפני כל פונקציה שמשתמשת בו
  const participantPredictions = useMemo(() => {
    if (!selectedParticipant) return {};
    
    // 🔥 קבץ רק את הניחוש האחרון של כל שאלה לפי created_date
    const tempPreds = {};
    data.predictions.forEach(p => {
      const existing = tempPreds[p.question_id];
      if (!existing || new Date(p.created_date) > new Date(existing.created_date)) {
        tempPreds[p.question_id] = {
          text_prediction: p.text_prediction,
          created_date: p.created_date
        };
      }
    });
    
    // המר למפה פשוטה
    const predMap = {};
    for (const [qid, data] of Object.entries(tempPreds)) {
      predMap[qid] = data.text_prediction;
    }
    
    return predMap;
  }, [selectedParticipant, data.predictions]);

  // Helper function to get the currently displayed prediction value (original or edited)
  const getPredictionValueForDisplay = useCallback((questionId) => {
    return editedPredictions[questionId] !== undefined
      ? editedPredictions[questionId]
      : participantPredictions[questionId];
  }, [editedPredictions, participantPredictions]);

  // 🆕 Function to combine original and edited predictions for components that need a full map
  const getCombinedPredictionsMap = useCallback(() => {
    return {
      ...participantPredictions, // Start with all original predictions
      ...editedPredictions,     // Overlay with any edited predictions
    };
  }, [participantPredictions, editedPredictions]);

  const participantDetails = useMemo(() => {
    if (!selectedParticipant) return {};
    const details = { name: selectedParticipant };
    participantQuestions.forEach(q => {
      const pred = data.predictions.find(p => 
        p.question_id === q.id
      );
      if (pred) {
        details[q.id] = pred.text_prediction;
      }
    });
    return details;
  }, [selectedParticipant, participantQuestions, data.predictions]);

  const loadParticipantStats = async () => {
    if (!currentGame) return;
    
    try {
      const allPredictions = await Prediction.filter({ game_id: currentGame.id }, null, 10000);
      const stats = {};
      
      allPredictions.forEach(pred => {
        if (!stats[pred.participant_name]) {
          stats[pred.participant_name] = 0;
        }
        stats[pred.participant_name]++;
      });

      const statsArray = Object.entries(stats).map(([name, count]) => ({
        name,
        predictionsCount: count
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));

      setParticipantStats(statsArray);
    } catch (error) {
      console.error("Error loading participant stats:", error);
      toast({
        title: "שגיאה",
        description: "טעינת נתוני משתתפים נכשלה.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteParticipant = async (participantName) => {
    if (!currentGame) return;
    
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את כל הניחושים של "${participantName}"? פעולה זו אינה הפיכה!`)) {
      return;
    }

    setDeletingParticipant(participantName);
    try {
      // טען את כל הניחושים
      const predictionsToDelete = await Prediction.filter({ 
        participant_name: participantName,
        game_id: currentGame.id 
      }, null, 10000);
      
      console.log(`🗑️ מוחק ${predictionsToDelete.length} ניחושים של ${participantName}...`);
      
      // מחיקה בקבוצות של 10 עם delay
      const BATCH_SIZE = 10;
      const DELAY_MS = 500;
      
      for (let i = 0; i < predictionsToDelete.length; i += BATCH_SIZE) {
        const batch = predictionsToDelete.slice(i, i + BATCH_SIZE);
        console.log(`   מוחק batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(predictionsToDelete.length / BATCH_SIZE)}`);
        
        await Promise.all(batch.map(pred => Prediction.delete(pred.id)));
        
        // עדכן toast
        toast({
          title: "מוחק...",
          description: `נמחקו ${Math.min(i + BATCH_SIZE, predictionsToDelete.length)}/${predictionsToDelete.length}`,
          className: "bg-yellow-900/30 border-yellow-500 text-yellow-200"
        });
        
        // delay בין batches
        if (i + BATCH_SIZE < predictionsToDelete.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      toast({
        title: "נמחק בהצלחה!",
        description: `נמחקו ${predictionsToDelete.length} ניחושים של ${participantName}.`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });

      setAllParticipants(prev => prev.filter(p => p !== participantName));
      
      if (selectedParticipant === participantName) {
        setSelectedParticipant(null);
      }

      await loadParticipantStats();

    } catch (error) {
      console.error("Error deleting participant:", error);
      toast({
        title: "שגיאה",
        description: "מחיקת המשתתף נכשלה: " + error.message,
        variant: "destructive"
      });
    } finally {
      setDeletingParticipant(null);
    }
  };

  // 🆕 פונקציה לעדכון ניחוש במצב עריכה
  const handlePredictionEdit = (questionId, newValue) => {
    if (!isEditMode) return;
    
    // בדוק אם השתנה מהמקורי
    const originalValue = participantPredictions[questionId] || '';
    if (newValue === originalValue) {
      // חזר למקורי - הסר מהעריכות
      setEditedPredictions(prev => {
        const newState = { ...prev };
        delete newState[questionId];
        return newState;
      });
    } else {
      setEditedPredictions(prev => ({
        ...prev,
        [questionId]: newValue
      }));
    }
  };

  // 🆕 שמירת שינויים
  const handleSaveChanges = async () => {
    const changedPredictions = Object.entries(editedPredictions);
    
    if (changedPredictions.length === 0) {
      toast({
        title: "אין שינויים",
        description: "לא בוצעו שינויים בניחושים",
        className: "bg-blue-900/30 border-blue-500 text-blue-200"
      });
      return;
    }

    setSavingChanges(true);
    try {
      let updatedCount = 0;
      
      for (const [questionId, newValue] of changedPredictions) {
        const prediction = data.predictions.find(p => p.question_id === questionId);
        
        // Only update if it's an existing prediction and the value has actually changed
        // from the *original* value. The 'editedPredictions' state already ensures this.
        if (prediction) { // Update existing prediction
          await Prediction.update(prediction.id, {
            text_prediction: newValue
          });
          updatedCount++;
        } else { // Create new prediction if it didn't exist
          await Prediction.create({
            question_id: questionId,
            participant_name: selectedParticipant,
            text_prediction: newValue
          });
          updatedCount++;
        }
      }

      toast({
        title: "שינויים נשמרו!",
        description: `עודכנו ${updatedCount} ניחושים עבור ${selectedParticipant}`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });

      // טען מחדש את הניחושים
      const predictions = await Prediction.filter({ 
        participant_name: selectedParticipant,
        game_id: currentGame.id 
      }, null, 10000);
      setData(prev => ({ ...prev, predictions }));
      setEditedPredictions({});
      setIsEditMode(false);

    } catch (error) {
      console.error("Error saving changes:", error);
      toast({
        title: "שגיאה",
        description: "שמירת השינויים נכשלה",
        variant: "destructive"
      });
    }
    setSavingChanges(false);
  };

  const toggleSection = (sectionId) => {
    setOpenSections(prev => ({...prev, [sectionId]: !prev[sectionId]}));
  };

  // 🆕 דוח ניחושים חסרים
  const handleMissingReport = async () => {
    if (!currentGame) return;
    
    setLoadingMissing(true);
    setShowMissingReport(true);
    
    try {
      console.log('🔍 מתחיל חישוב דוח חסרים...');
      
      // טען את כל הניחושים
      let allPredictions = [];
      let skip = 0;
      while (true) {
        const batch = await Prediction.filter({ game_id: currentGame.id }, null, 10000, skip);
        allPredictions = [...allPredictions, ...batch];
        if (batch.length < 10000) break;
        skip += 10000;
      }
      
      console.log(`✅ נטענו ${allPredictions.length} ניחושים`);
      console.log(`✅ ${data.questions.length} שאלות במשחק`);
      
      // קבץ ניחושים לפי משתתף - רק את האחרון של כל שאלה
      const predictionsByParticipant = {};
      allPredictions.forEach(pred => {
        if (!predictionsByParticipant[pred.participant_name]) {
          predictionsByParticipant[pred.participant_name] = {};
        }
        
        const existing = predictionsByParticipant[pred.participant_name][pred.question_id];
        if (!existing || new Date(pred.created_date) > new Date(existing.created_date)) {
          predictionsByParticipant[pred.participant_name][pred.question_id] = pred;
        }
      });
      
      // מצא ניחושים חסרים
      const missing = [];
      const participants = Object.keys(predictionsByParticipant).sort();
      
      console.log(`👥 ${participants.length} משתתפים`);
      
      // 🔄 קבוצה לפי שאלה (ולא לפי משתתף!)
      const missingByQuestion = {};
      
      data.questions.forEach(q => {
        // דלג על פרטי משתתף (T1)
        if (q.table_id === 'T1') return;
        
        const questionKey = `${q.table_id}.${q.question_id}`;
        const missingParticipants = [];
        
        participants.forEach(participant => {
          const participantPredictions = predictionsByParticipant[participant];
          const pred = participantPredictions[q.id];
          
          // 🔍 לוג לבדיקה
          if (questionKey === 'T12.7') {
            console.log(`🔍 ${participant} - T12.7:`, {
              hasPred: !!pred,
              value: pred?.text_prediction,
              trimmed: pred?.text_prediction?.trim(),
              isEmpty: !pred?.text_prediction || pred.text_prediction.trim() === ''
            });
          }
          
          // ✅ בדיקה: האם חסר ניחוש?
          const hasPrediction = pred && 
                                pred.text_prediction !== null &&
                                pred.text_prediction !== undefined &&
                                pred.text_prediction.toString().trim() !== '' && 
                                pred.text_prediction !== '__CLEAR__';
          
          if (!hasPrediction) {
            missingParticipants.push(participant);
          }
        });
        
        if (missingParticipants.length > 0) {
          missingByQuestion[questionKey] = {
            table_id: q.table_id,
            table_description: q.table_description || q.stage_name || '',
            question_id: q.question_id,
            question_text: q.question_text || `${q.home_team || ''} נגד ${q.away_team || ''}`,
            stage_order: q.stage_order || 0,
            missing_count: missingParticipants.length,
            missing_participants: missingParticipants.sort((a, b) => a.localeCompare(b, 'he'))
          };
        }
      });
      
      // המרה למערך וממיין לפי סדר השאלות
      const missingArray = Object.entries(missingByQuestion)
        .map(([key, data]) => ({ ...data, full_id: key }))
        .sort((a, b) => {
          if (a.stage_order !== b.stage_order) {
            return a.stage_order - b.stage_order;
          }
          const tableA = parseInt(a.table_id.replace('T', '')) || 0;
          const tableB = parseInt(b.table_id.replace('T', '')) || 0;
          if (tableA !== tableB) return tableA - tableB;
          return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0);
        });
      
      console.log(`❌ נמצאו ${missingArray.length} שאלות עם ניחושים חסרים`);
      missingArray.forEach(m => {
        console.log(`   ${m.full_id}: ${m.missing_count} משתתפים - ${m.question_text}`);
      });
      
      setMissingPredictions(missingArray);
      
    } catch (error) {
      console.error("Error generating missing report:", error);
      toast({
        title: "שגיאה",
        description: "יצירת הדוח נכשלה",
        variant: "destructive"
      });
    }
    setLoadingMissing(false);
  };

  // 🆕 ייצוא נתונים לקובץ CSV
  const handleExportData = async () => {
    if (!currentGame) return;
    
    setExporting(true);
    try {
      // טען את כל הניחושים למשחק בקבוצות של 10000
      let allPredictions = [];
      let skip = 0;
      const batchSize = 10000;
      
      while (true) {
        const batch = await Prediction.filter({ game_id: currentGame.id }, null, batchSize, skip);
        allPredictions = [...allPredictions, ...batch];
        if (batch.length < batchSize) break;
        skip += batchSize;
      }
      
      // מפה של question_id ל-question
      const questionsMap = {};
      data.questions.forEach(q => {
        questionsMap[q.id] = q;
      });
      
      // מצא את כל המשתתפים הייחודיים
      const participants = [...new Set(allPredictions.map(p => p.participant_name))].sort();
      
      // בנה את הכותרות: שלב, מס' שאלה, שאלה, רשימת אימות, [שמות משתתפים]
      const headers = ['שלב', 'מס\' שאלה', 'שאלה', 'רשימת אימות', ...participants];
      
      // קבץ ניחושים לפי שאלה
      const predictionsByQuestion = {};
      allPredictions.forEach(p => {
        if (!predictionsByQuestion[p.question_id]) {
          predictionsByQuestion[p.question_id] = {};
        }
        predictionsByQuestion[p.question_id][p.participant_name] = p.text_prediction || '';
      });
      
      // מיין שאלות לפי stage_order ואז question_id
      const sortedQuestions = [...data.questions].sort((a, b) => {
        const stageOrderA = a.stage_order || 0;
        const stageOrderB = b.stage_order || 0;
        if (stageOrderA !== stageOrderB) return stageOrderA - stageOrderB;
        return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0);
      });
      
      // בנה שורות
      const rows = sortedQuestions.map(q => {
        const stageName = q.stage_name || q.table_description || q.table_id || '';
        const questionId = q.question_id || '';
        const questionText = q.question_text || `${q.home_team || ''} נגד ${q.away_team || ''}`;
        const validationList = q.validation_list || '';
        
        const participantValues = participants.map(p => {
          let pred = predictionsByQuestion[q.id]?.[p] || '';
          // 🔥 הוסף גרש בתחילת כל תא שמכיל מקף כדי למנוע המרה לתאריך באקסל
          if (pred && pred.includes('-')) {
            pred = "'" + pred;
          }
          return pred;
        });
        
        // 🔥 תקן גם את טקסט השאלה
        let safeQuestionText = questionText;
        if (safeQuestionText && safeQuestionText.includes('-')) {
          safeQuestionText = "'" + safeQuestionText;
        }
        
        return [stageName, questionId, safeQuestionText, validationList, ...participantValues];
      });
      
      // המר ל-CSV
      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      
      // הוסף BOM לתמיכה בעברית
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      
      // הורד את הקובץ
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `predictions_export_${currentGame.game_name}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      toast({
        title: "ייצוא הושלם!",
        description: `יוצאו ${sortedQuestions.length} שאלות עבור ${participants.length} משתתפים`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });
      
    } catch (error) {
      console.error("Error exporting data:", error);
      toast({
        title: "שגיאה",
        description: "ייצוא הנתונים נכשל",
        variant: "destructive"
      });
    }
    setExporting(false);
  };

  // 🔥 פונקציה חדשה - מחפשת את השם המתאים ברשימת האימות
  const findMatchedTeamName = useCallback((predictionName) => {
    if (!predictionName || teamValidationList.length === 0) return predictionName;
    
    const trimmedPrediction = predictionName.trim();
    
    // בדיקה 1: התאמה מדויקת
    if (teamValidationList.includes(trimmedPrediction)) {
      return trimmedPrediction;
    }
    
    // בדיקה 2: התאמה לפי שם בסיסי (ללא סוגריים)
    const baseName = trimmedPrediction.split('(')[0].trim();
    
    // 🔥 טבלת החלפות לווריאציות שונות
    const normalizeTeamName = (name) => {
      // Replace variations with a standard form
      return name
        .replace(/קרבאך/g, 'קרבאח')
        .replace(/קראבח/g, 'קרבאח')
        .replace(/קראבך/g, 'קרבאח')
        .replace(/ת"א/g, 'תל אביב')
        .replace(/ת.א/g, 'תל אביב');
    };
    
    const normalizedBaseName = normalizeTeamName(baseName);
    
    // חפש בכל רשימת האימות
    for (const validName of teamValidationList) {
      const validBaseName = validName.split('(')[0].trim();
      const normalizedValidName = normalizeTeamName(validBaseName);
      
      // השווה את השמות המנורמלים
      if (normalizedBaseName === normalizedValidName) {
        console.log(`✅ נמצאה התאמה: "${trimmedPrediction}" → "${validName}"`);
        return validName; // החזר את השם המלא מרשימת האימות
      }
    }
    
    // אם לא נמצאה התאמה - החזר את המקורי
    console.log(`⚠️ לא נמצאה התאמה עבור: "${trimmedPrediction}"`);
    return trimmedPrediction;
  }, [teamValidationList]);

  // Helper function to get maximum possible score for a question
  const getMaxPossibleScore = (question) => {
    const isIsraeliTableMatchQuestion = question.table_id === 'T20' && question.home_team && question.away_team;
    if (isIsraeliTableMatchQuestion) {
      return 6; // Israeli League matches have 6 potential points for correct score
    }
    if (question.possible_points != null && question.possible_points > 0) {
      return question.possible_points;
    }
    // If actual_result is present, it's scorable. If possible_points is missing/0,
    // we should assume a default for display based on typical special question points.
    // This heuristic ensures correct max score display for questions that are scorable but lack explicit possible_points.
    if (question.actual_result != null && question.actual_result !== '') {
      return 10; 
    }
    // Fallback for non-scorable or truly 0-point questions
    return 0;
  };

  const renderReadOnlySelect = (question, originalValue) => {
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ');
    const locationTableIds = ['T14', 'T15', 'T16', 'T17', 'T19'];
    const isLocationQuestion = locationTableIds.includes(question.table_id);

    let displayTeamNameForReadonly = originalValue;
    if (isTeamsList && originalValue && isLocationQuestion) {
      displayTeamNameForReadonly = findMatchedTeamName(originalValue);
    }
    const team = isTeamsList ? data.teams[displayTeamNameForReadonly] : null; 
    
    const maxScore = getMaxPossibleScore(question);
    const hasValue = originalValue && originalValue.trim() !== '';
    
    const hasActualResult = question.actual_result && 
                           question.actual_result.trim() !== '' && 
                           question.actual_result !== '__CLEAR__';
    
    const textColor = hasActualResult ? '#06b6d4' : '#f8fafc';
    
    const isQuestion11_1 = question.question_id === '11.1';
    const isQuestion11_2 = question.question_id === '11.2';
    const boxWidth = isQuestion11_1 ? 'min-w-[60px] max-w-[65px]' : isQuestion11_2 ? 'min-w-[145px] max-w-[150px]' : 'min-w-[135px] max-w-[140px]';
    
    // 🔥 במצב עריכה - הצג Select שמציג את הערך המקורי!
    if (isEditMode && isAdmin && question.validation_list && data.validationLists[question.validation_list]) {
      const options = data.validationLists[question.validation_list] || [];
      
      // הערך המוצג: אם יש עריכה - הצג את העריכה, אחרת הצג את המקור
      const editedValue = editedPredictions[question.id];
      const currentValue = editedValue !== undefined ? editedValue : originalValue;
      const selectValue = currentValue || "__CLEAR__";

      let displayCurrentTeamNameForEdit = currentValue;
      if (isTeamsList && currentValue && isLocationQuestion) {
          displayCurrentTeamNameForEdit = findMatchedTeamName(currentValue);
      }
      const currentTeam = isTeamsList ? data.teams[displayCurrentTeamNameForEdit] : null;
      
      return (
        <>
          <Select 
            value={selectValue} 
            onValueChange={(val) => handlePredictionEdit(question.id, val === "__CLEAR__" ? "" : val)}
          >
            <SelectTrigger className={`${boxWidth} h-10`} style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              color: '#f8fafc'
            }}>
              {/* 🔥 הצג את הערך הנוכחי כטקסט */}
              {currentValue ? (
                <div className="flex items-center gap-2 w-full">
                  {currentTeam?.logo_url && (
                    <img 
                      src={currentTeam.logo_url} 
                      alt={displayCurrentTeamNameForEdit} 
                      className="w-4 h-4 rounded-full" 
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                  <span className="truncate">{displayCurrentTeamNameForEdit}</span>
                </div>
              ) : (
                <span className="text-slate-400">{isQuestion11_1 || isQuestion11_2 ? "" : "- בחר -"}</span>
              )}
            </SelectTrigger>
            <SelectContent style={{
              background: '#1e293b',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <SelectItem value="__CLEAR__" className="hover:bg-cyan-700/20" style={{ color: '#94a3b8' }}>
                -
              </SelectItem>
              {options.map(opt => {
                const optTeam = isTeamsList ? data.teams[opt] : null;
                return (
                  <SelectItem key={opt} value={opt} className="hover:bg-cyan-700/20" style={{ color: '#f8fafc' }}>
                    <div className="flex items-center gap-2">
                      {optTeam?.logo_url && (
                        <img 
                          src={optTeam.logo_url} 
                          alt={opt} 
                          className="w-4 h-4 rounded-full" 
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      )}
                      <span>{opt}</span>
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
    
    // If it's a free-text field and in edit mode
    if (isEditMode && isAdmin && (!question.validation_list || !data.validationLists[question.validation_list])) {
      const valueForInput = editedPredictions[question.id] !== undefined ? editedPredictions[question.id] : originalValue;
      return (
        <div className="flex items-center gap-2">
            <input
                type="text"
                value={valueForInput}
                onChange={(e) => handlePredictionEdit(question.id, e.target.value)}
                className="rounded-md px-3 py-2 min-w-[120px] h-10"
                style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    color: '#f8fafc'
                }}
            />
            <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">
                ?/{maxScore}
            </Badge>
        </div>
      );
    }

    // מצב צפייה רגיל (גם עבור Select וגם עבור Free-Text)
    if (!hasValue) {
      return (
        <>
          <div className={`rounded-md px-2 py-2 ${boxWidth} flex items-center gap-1`} style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(6, 182, 212, 0.2)'
          }}>
            <span style={{ color: '#94a3b8', fontSize: isQuestion11_1 ? '0.65rem' : '0.875rem' }}>-</span>
          </div>
          <div className="w-12"></div>
        </>
      );
    }

    const score = calculateQuestionScore(question, originalValue);

    let badgeColor = 'bg-slate-600 text-slate-300';
    if (score !== null) {
      if (score === maxScore && maxScore > 0) {
        badgeColor = 'bg-green-700 text-green-100';
      } else if (score === 0) {
        badgeColor = 'bg-red-700 text-red-100';
      } else if (maxScore > 0 && score >= maxScore * 0.7) {
        badgeColor = 'bg-blue-700 text-blue-100';
      } else if (score > 0) {
        badgeColor = 'bg-yellow-500 text-white';
      }
    }

    return (
      <>
        <div className={`rounded-md px-2 py-2 ${boxWidth} flex items-center gap-1`} style={{
          background: hasActualResult ? 'rgba(6, 182, 212, 0.2)' : 'rgba(15, 23, 42, 0.6)',
          border: hasActualResult ? '1px solid #06b6d4' : '1px solid rgba(6, 182, 212, 0.2)',
          boxShadow: hasActualResult ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none'
        }}>
          {team?.logo_url && (
            <img 
              src={team.logo_url} 
              alt={displayTeamNameForReadonly} 
              className="w-4 h-4 rounded-full flex-shrink-0" 
              onError={(e) => e.target.style.display = 'none'}
            />
          )}
          <span style={{ color: textColor, fontSize: isQuestion11_1 ? '0.65rem' : '0.875rem', fontWeight: hasActualResult ? '700' : 'normal' }}>{displayTeamNameForReadonly}</span>
        </div>
        {score !== null ? (
          <Badge className={`${badgeColor} text-xs font-bold px-1.5 py-0.5 min-w-[45px] justify-center`}>
            {score}/{maxScore}
          </Badge>
        ) : (
          <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">
            ?/{maxScore}
          </Badge>
        )}
      </>
    );
  };

  const renderT10Questions = (table) => {
    const questions = table.questions;
    const grouped = {};
    
    questions.forEach(q => {
      const mainId = Math.floor(parseFloat(q.question_id));
      if (!grouped[mainId]) {
        grouped[mainId] = { main: null, subs: [] };
      }
      if (q.question_id.includes('.')) {
        grouped[mainId].subs.push(q);
      } else {
        grouped[mainId].main = q;
      }
    });

    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    // 🔥 פונקציה עזר להחלפת שם ולוגו עבור שאלות T10 שהן קבוצות
    // פונקציה זו אינה תומכת במצב עריכה - עבור T10 שאלות קבוצה במצב עריכה יופיעו כתיבת טקסט רגילה דרך renderReadOnlySelect
    const renderTeamPrediction = (questionId, originalValue) => {
      // Use edited value if exists, otherwise original
      const valueToDisplay = editedPredictions[questionId] !== undefined 
        ? editedPredictions[questionId] 
        : originalValue;

      if (!valueToDisplay || valueToDisplay.trim() === '') {
        return (
          <>
            <div className="rounded-md px-2 py-2 min-w-[135px] max-w-[140px] flex items-center gap-1" style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)'
            }}>
              <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>-</span>
            </div>
            <div className="w-12"></div>
          </>
        );
      }

      // 🔥 החלף לשם מרשימת האימות
      const matchedName = findMatchedTeamName(valueToDisplay);
      const team = data.teams[matchedName];
      
      // 🔥 בדוק אם יש תוצאה אמיתית עבור T10
      const q = questions.find(question => question.id === questionId);
      const hasActualResult = q?.actual_result && 
                             q.actual_result.trim() !== '' && 
                             q.actual_result !== '__CLEAR__';
      const textColor = hasActualResult ? '#06b6d4' : '#f8fafc';
      
      return (
        <>
          <div className="rounded-md px-2 py-2 min-w-[135px] max-w-[140px] flex items-center gap-1" style={{
            background: hasActualResult ? 'rgba(6, 182, 212, 0.2)' : 'rgba(15, 23, 42, 0.6)',
            border: hasActualResult ? '1px solid #06b6d4' : '1px solid rgba(6, 182, 212, 0.2)',
            boxShadow: hasActualResult ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none'
          }}>
            {team?.logo_url && (
              <img 
                src={team.logo_url} 
                alt={matchedName} 
                className="w-4 h-4 rounded-full flex-shrink-0" 
                onError={(e) => e.target.style.display = 'none'}
              />
            )}
            <span style={{ color: textColor, fontSize: '0.875rem', fontWeight: hasActualResult ? '700' : 'normal' }}>{matchedName}</span>
          </div>
          <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">
            ?/10
          </Badge>
        </>
      );
    };

    return (
      <Card className="bg-slate-800/40 border-slate-700 shadow-lg shadow-slate-900/20">
        <CardHeader className="py-3">
          <CardTitle className="text-cyan-400">{table.description}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-3">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;

              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              const mainNumericId = parseFloat(main.question_id);
              const isGroup1 = (mainNumericId >= 1 && mainNumericId <= 2) || (mainNumericId >= 14 && mainNumericId <= 26);
              const isTeamQuestion = (mainNumericId >= 5 && mainNumericId <= 10) || (mainNumericId >= 12 && mainNumericId <= 13);

              // שאלה ללא תתי-שאלות - 4 עמודות
              if (sortedSubs.length === 0) {
                return (
                  <div 
                    key={main.id} 
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: '50px 1fr 160px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px'
                    }}
                    className="bg-slate-700/20 border border-slate-600/30"
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                    <div className="contents">{renderReadOnlySelect(main, participantPredictions[main.id] || "")}</div>
                  </div>
                );
              }

              // שאלה עם תת-שאלה אחת - 9 עמודות
              if (sortedSubs.length === 1) {
                return (
                  <div 
                    key={main.id} 
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: '50px minmax(250px, 2fr) 160px 50px 1fr 50px minmax(180px, 1.5fr) 160px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px'
                    }}
                    className="bg-slate-700/20 border border-slate-600/30"
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{main.question_text}</span>
                    <div className="contents">
                      {isTeamQuestion ? renderTeamPrediction(main.id, participantPredictions[main.id] || "") : renderReadOnlySelect(main, participantPredictions[main.id] || "")}
                    </div>
                    
                    <div></div>

                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sortedSubs[0].question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{sortedSubs[0].question_text}</span>
                    <div className="contents">
                      {isTeamQuestion ? renderTeamPrediction(sortedSubs[0].id, participantPredictions[sortedSubs[0].id] || "") : renderReadOnlySelect(sortedSubs[0], participantPredictions[sortedSubs[0].id] || "")}
                    </div>
                  </div>
                );
              }

              // שאלה עם 2 תתי-שאלות - 12 עמודות
              return (
                <div 
                  key={main.id} 
                  style={{ 
                    display: 'grid',
                    gridTemplateColumns: '45px 1fr 140px 45px 45px 1fr 140px 45px 45px 1fr 140px 45px',
                    gap: '6px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '6px'
                  }}
                  className="bg-slate-700/20 border border-slate-600/30"
                >
                  <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                  <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                  <div className="contents">
                    {isTeamQuestion ? renderTeamPrediction(main.id, participantPredictions[main.id] || "") : renderReadOnlySelect(main, participantPredictions[main.id] || "")}
                  </div>

                  {sortedSubs.map(sub => (
                    <React.Fragment key={sub.id}>
                      <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sub.question_id}</Badge>
                      <span className="text-right font-medium text-sm text-blue-100 truncate">{sub.question_text}</span>
                      <div className="contents">
                        {isTeamQuestion ? renderTeamPrediction(sub.id, participantPredictions[sub.id] || "") : renderReadOnlySelect(sub, participantPredictions[sub.id] || "")}
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

  const renderSpecialQuestions = (table) => {
    const isT10 = table.description.includes('T10') || table.id === 'T10' || table.id.includes('custom_order');
    
    if (isT10) {
      return renderT10Questions(table);
    }

    // קיבוץ שאלות עם תת-שאלות
    const grouped = {};
    table.questions.forEach(q => {
      const mainId = Math.floor(parseFloat(q.question_id));
      if (!grouped[mainId]) {
        grouped[mainId] = { main: null, subs: [] };
      }
      if (q.question_id.includes('.')) {
        grouped[mainId].subs.push(q);
      } else {
        grouped[mainId].main = q;
      }
    });

    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    let bonusInfo = null;
    const isLocationTable = ['T14', 'T15', 'T16', 'T17', 'T19'].includes(table.id);
    if (selectedParticipant) {
      // 🔥 לחישוב בונוס - שלב את הניחושים המקוריים עם העריכות
      const predForBonus = {};
      table.questions.forEach(q => {
          const editedValue = editedPredictions[q.id];
          predForBonus[q.id] = editedValue !== undefined ? editedValue : (participantPredictions[q.id] || "");
      });
      bonusInfo = calculateLocationBonus(table.id, table.questions, predForBonus);
    }

    let teamsBonusPotential = 0;
    let orderBonusPotential = 0;
    if (isLocationTable) {
      if (table.id === 'T17') {
        teamsBonusPotential = 30;
        orderBonusPotential = 50;
      } else if (table.id === 'T19') {
        teamsBonusPotential = 20;
        orderBonusPotential = 0;
      } else {
        teamsBonusPotential = 20;
        orderBonusPotential = 40;
      }
    }

    return (
      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        <CardHeader className="py-3">
          <CardTitle style={{ color: '#06b6d4' }}>{table.description}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-2">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;

              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              const mainOriginalValue = participantPredictions[main.id] || '';

              // שאלה ללא תתי-שאלות - 4 עמודות
              if (sortedSubs.length === 0) {
                return (
                  <div 
                    key={main.id} 
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: '50px 1fr 160px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(6, 182, 212, 0.1)'
                    }}
                  >
                    <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm truncate" style={{ color: '#f8fafc' }}>{main.question_text}</span>
                    <div className="flex items-center gap-2">{renderReadOnlySelect(main, mainOriginalValue)}</div>
                  </div>
                );
              }

              // שאלה עם תת-שאלה אחת - 9 עמודות
              if (sortedSubs.length === 1) {
                const subOriginalValue = participantPredictions[sortedSubs[0].id] || '';
                return (
                  <div 
                    key={main.id} 
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: '50px minmax(250px, 2fr) 160px 50px 1fr 50px minmax(180px, 1.5fr) 160px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(6, 182, 212, 0.1)'
                    }}
                  >
                    <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{main.question_text}</span>
                    <div className="flex items-center gap-2">{renderReadOnlySelect(main, mainOriginalValue)}</div>
                    
                    <div></div>
                    
                    <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{sortedSubs[0].question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{sortedSubs[0].question_text}</span>
                    <div className="flex items-center gap-2">{renderReadOnlySelect(sortedSubs[0], subOriginalValue)}</div>
                  </div>
                );
              }

              // שאלה עם 2 תתי-שאלות - 12 עמודות
              return (
                <div 
                  key={main.id} 
                  style={{ 
                    display: 'grid',
                    gridTemplateColumns: '45px 1fr 140px 45px 45px 1fr 140px 45px 45px 1fr 140px 45px',
                    gap: '6px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid rgba(6, 182, 212, 0.1)'
                  }}
                >
                  <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{main.question_id}</Badge>
                  <span className="text-right font-medium text-sm truncate" style={{ color: '#f8fafc' }}>{main.question_text}</span>
                  <div className="flex items-center gap-2">{renderReadOnlySelect(main, mainOriginalValue)}</div>

                  {sortedSubs.map(sub => {
                    const subOriginalValue = participantPredictions[sub.id] || '';
                    return (
                      <React.Fragment key={sub.id}>
                        <Badge variant="outline" className="justify-center text-xs h-6 w-full" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{sub.question_id}</Badge>
                        <span className="text-right font-medium text-sm truncate" style={{ color: '#f8fafc' }}>{sub.question_text}</span>
                        <div className="flex items-center gap-2">{renderReadOnlySelect(sub, subOriginalValue)}</div>
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {isLocationTable && selectedParticipant && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg border ${
                bonusInfo?.allCorrect 
                  ? 'bg-gradient-to-r from-green-900/40 to-emerald-900/40 border-green-600/50' 
                  : bonusInfo !== null
                    ? 'bg-gradient-to-r from-red-900/40 to-red-800/40 border-red-600/50'
                    : 'bg-gradient-to-r from-slate-800/40 to-slate-700/40 border-slate-600/50'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className={`w-5 h-5 ${bonusInfo?.allCorrect ? 'text-green-400' : bonusInfo !== null ? 'text-red-400' : 'text-slate-400'}`} />
                    <div>
                      <p className={`font-bold text-sm ${bonusInfo?.allCorrect ? 'text-green-200' : bonusInfo !== null ? 'text-red-200' : 'text-slate-300'}`}>
                        {bonusInfo?.allCorrect ? '✅' : bonusInfo !== null ? '❌' : '⏳'} בונוס עולות
                      </p>
                      <p className={`text-xs ${bonusInfo?.allCorrect ? 'text-green-300' : bonusInfo !== null ? 'text-red-300' : 'text-slate-400'}`}>
                        {bonusInfo?.allCorrect 
                          ? 'כל הקבוצות נכונות!' 
                          : bonusInfo !== null
                            ? 'לא כל הקבוצות'
                            : 'ממתין לתוצאות...'}
                      </p>
                    </div>
                  </div>
                  <Badge className={`text-lg font-bold px-3 py-1 ${
                    bonusInfo?.allCorrect 
                      ? 'bg-green-600 text-white' 
                      : bonusInfo !== null
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-600 text-slate-300'
                  }`}>
                    {bonusInfo?.allCorrect ? `+${bonusInfo.teamsBonus}` : bonusInfo !== null ? '0' : '?'}/{teamsBonusPotential}
                  </Badge>
                </div>
              </div>

              {table.id !== 'T19' && (
                <div className={`p-3 rounded-lg border ${
                  bonusInfo?.perfectOrder 
                    ? 'bg-gradient-to-r from-yellow-900/40 to-orange-900/40 border-yellow-600/50' 
                    : bonusInfo?.allCorrect && !bonusInfo?.perfectOrder
                      ? 'bg-gradient-to-r from-red-900/40 to-red-800/40 border-red-600/50'
                      : bonusInfo !== null
                        ? 'bg-gradient-to-r from-red-900/40 to-red-800/40 border-red-600/50'
                        : 'bg-gradient-to-r from-slate-800/40 to-slate-700/40 border-slate-600/50'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className={`w-5 h-5 ${bonusInfo?.perfectOrder ? 'text-yellow-400' : bonusInfo !== null ? 'text-red-400' : 'text-slate-400'}`} />
                      <div>
                        <p className={`font-bold text-sm ${bonusInfo?.perfectOrder ? 'text-yellow-200' : bonusInfo !== null ? 'text-red-200' : 'text-slate-300'}`}>
                          {bonusInfo?.perfectOrder ? '✨' : bonusInfo !== null ? '❌' : '⏳'} בונוס מיקום
                        </p>
                        <p className={`text-xs ${bonusInfo?.perfectOrder ? 'text-yellow-300' : bonusInfo !== null ? 'text-red-300' : 'text-slate-400'}`}>
                          {bonusInfo?.perfectOrder 
                            ? 'סדר מושלם!' 
                            : bonusInfo?.allCorrect
                              ? 'לא בסדר המדויק'
                              : bonusInfo !== null
                                ? 'לא כל הקבוצות'
                                : 'ממתין לתוצאות...'}
                        </p>
                      </div>
                    </div>
                    <Badge className={`text-lg font-bold px-3 py-1 ${
                      bonusInfo?.perfectOrder 
                        ? 'bg-yellow-600 text-white' 
                        : bonusInfo !== null
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-600 text-slate-300'
                    }`}>
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
      <div className="flex items-center justify-center h-screen" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="ml-3" style={{ color: '#06b6d4' }}>טוען נתונים...</span>
      </div>
    );
  }

  const hasChanges = Object.keys(editedPredictions).length > 0; // 🆕 Track if there are pending changes

  const TEXT_LENGTH_THRESHOLD = 18; // Define a threshold for long text

  const allButtons = [];

  if (roundTables.length > 0) {
    // בדוק אם כל הטבלאות הן בתים
    const allAreGroups = roundTables.every(table => 
      table.id.includes('בית') || table.description?.includes('בית')
    );
    
    const firstRoundTableId = roundTables[0]?.id || 'T2'; 
    const description = allAreGroups ? 'שלב הבתים' : 'מחזורי המשחקים';
    allButtons.push({
      numericId: parseInt(firstRoundTableId.replace('T', '').replace(/\D/g, ''), 10),
      key: 'rounds',
      description: description,
      sectionKey: 'rounds',
      isLongText: description.length > TEXT_LENGTH_THRESHOLD
    });
  }

  specialTables.forEach(table => {
    const description = table.description;
    allButtons.push({
      numericId: table.questions[0]?.stage_order || parseInt(table.id.replace('T', '').replace(/\D/g, ''), 10),
      key: table.id,
      description: description,
      sectionKey: table.id,
      isLongText: description.length > TEXT_LENGTH_THRESHOLD
    });
  });

  if (locationTables.length > 0) {
    const firstLocationTableId = locationTables[0]?.id || 'T14';
    const description = 'מיקומים בתום שלב הבתים';
    allButtons.push({
      numericId: parseInt(firstLocationTableId.replace('T', ''), 10),
      key: 'locations',
      description: description,
      sectionKey: 'locations',
      isLongText: description.length > TEXT_LENGTH_THRESHOLD
    });
  }

  if (israeliTable) {
    const description = israeliTable.description;
    allButtons.push({
      numericId: parseInt(israeliTable.id.replace('T', ''), 10),
      key: israeliTable.id,
      description: description,
      sectionKey: 'israeli',
      isLongText: description.length > TEXT_LENGTH_THRESHOLD
    });
  }

  // 🆕 כפתור נפרד ל-T19
  if (playoffWinnersTable) {
    const description = playoffWinnersTable.description;
    allButtons.push({
      numericId: parseInt(playoffWinnersTable.id.replace('T', ''), 10),
      key: playoffWinnersTable.id,
      description: description,
      sectionKey: 'playoffWinners',
      isLongText: description.length > TEXT_LENGTH_THRESHOLD
    });
  }

  // Sort by numericId - this ensures correct order (rounds first, then by table number)
  allButtons.sort((a, b) => {
    if (a.sectionKey === 'rounds' && b.sectionKey !== 'rounds') return -1;
    if (b.sectionKey === 'rounds' && a.sectionKey !== 'rounds') return 1;

    return a.numericId - b.numericId;
  });

  return (
    <div className="min-h-screen" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }}>
      <div className="sticky top-0 z-30 backdrop-blur-sm shadow-lg" style={{ 
        background: 'rgba(15, 23, 42, 0.95)',
        borderBottom: '1px solid rgba(6, 182, 212, 0.2)'
      }}>
        <div className="p-3 md:p-6 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-2 md:gap-0 mb-3 md:mb-4">
            <div>
              <h1 className="text-xl md:text-3xl font-bold mb-1 md:mb-2 flex items-center gap-2 md:gap-3" style={{ 
                color: '#f8fafc',
                textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
              }}>
                <Users className="w-5 h-5 md:w-8 md:h-8" style={{ color: '#06b6d4' }} />
                צפייה בניחושים
              </h1>
              <p className="text-xs md:text-base" style={{ color: '#94a3b8' }}>בחר משתתף כדי לראות את הניחושים שלו.</p>
            </div>
            <div className="flex gap-1.5 md:gap-3 flex-wrap w-full md:w-auto">
              {isAdmin && selectedParticipant && !loadingPredictions && (
                <>
                  {!isEditMode ? (
                    <Button
                      onClick={() => setIsEditMode(true)}
                      variant="outline"
                      style={{ 
                        borderColor: 'rgba(6, 182, 212, 0.5)',
                        color: '#06b6d4',
                        background: 'rgba(30, 41, 59, 0.4)'
                      }}
                      className="hover:bg-cyan-500/20"
                    >
                      <Pencil className="w-4 h-4 ml-2" />
                      ערוך ניחושים
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() => {
                          setEditedPredictions({});
                          setIsEditMode(false);
                        }}
                        variant="outline"
                        style={{ 
                          borderColor: 'rgba(148, 163, 184, 0.5)',
                          color: '#94a3b8',
                          background: 'rgba(30, 41, 59, 0.4)'
                        }}
                        className="hover:bg-slate-500/20"
                        disabled={savingChanges}
                      >
                        ביטול
                      </Button>
                      <Button
                        onClick={handleSaveChanges}
                        disabled={Object.keys(editedPredictions).length === 0 || savingChanges}
                        style={{
                          background: Object.keys(editedPredictions).length > 0 ? 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)' : 'rgba(71, 85, 105, 0.5)',
                          boxShadow: Object.keys(editedPredictions).length > 0 ? '0 0 20px rgba(6, 182, 212, 0.4)' : 'none',
                          color: Object.keys(editedPredictions).length > 0 ? 'white' : '#64748b'
                        }}
                        className={Object.keys(editedPredictions).length > 0 ? 'hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]' : ''}
                      >
                        {savingChanges ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin ml-2" />
                            שומר...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 ml-2" />
                            שמור שינויים {Object.keys(editedPredictions).length > 0 && `(${Object.keys(editedPredictions).length})`}
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </>
              )}
              {isAdmin && (
                <>
                  <Button
                    onClick={handleExportData}
                    disabled={exporting}
                    variant="outline"
                    style={{ 
                      borderColor: 'rgba(34, 197, 94, 0.5)',
                      color: '#86efac',
                      background: 'rgba(30, 41, 59, 0.4)'
                    }}
                    className="hover:bg-green-500/20"
                  >
                    {exporting ? (
                      <>
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                        מייצא...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 ml-2" />
                        ייצוא לקובץ
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      loadParticipantStats();
                      setShowDeleteDialog(true);
                    }}
                    variant="outline"
                    style={{ 
                      borderColor: 'rgba(239, 68, 68, 0.5)',
                      color: '#fca5a5',
                      background: 'rgba(30, 41, 59, 0.4)'
                    }}
                    className="hover:bg-red-500/20"
                  >
                    <Trash2 className="w-4 h-4 ml-2" />
                    ניהול משתתפים
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              backdropFilter: 'blur(10px)'
            }}>
              <CardHeader className="py-2">
                <CardTitle className="text-sm" style={{ color: '#06b6d4' }}>בחר משתתף</CardTitle>
              </CardHeader>
              <CardContent className="p-3 flex justify-start">
                <Select onValueChange={setSelectedParticipant} value={selectedParticipant || ''}>
                  <SelectTrigger className="w-48 h-8 text-sm" style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    color: '#f8fafc'
                  }}>
                    <SelectValue 
                      placeholder="בחר שם..." 
                      className="text-right"
                    />
                  </SelectTrigger>
                  <SelectContent 
                    className="max-w-[200px]"
                    position="popper"
                    align="start"
                    style={{
                      background: '#1e293b',
                      border: '1px solid rgba(6, 182, 212, 0.3)'
                    }}
                  >
                    {allParticipants.map(p => (
                      <SelectItem 
                        key={p} 
                        value={p} 
                        className="hover:bg-cyan-500/20 text-right pr-8"
                        style={{ color: '#f8fafc' }}
                      >
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {selectedParticipant && (
              <Card style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                backdropFilter: 'blur(10px)'
              }}>
                <CardHeader className="py-2">
                  <CardTitle className="text-sm flex items-center justify-between" style={{ color: '#06b6d4' }}>
                    <span>פרטי המשתתף</span>
                    <ParticipantTotalScore participantName={selectedParticipant} gameId={currentGame?.id} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  {participantQuestions.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {participantQuestions.map(q => {
                      const isNameField = q.question_text?.includes("שם");
                      const displayValue = isNameField ? selectedParticipant : (participantDetails[q.id] || '-');
                      
                      return (
                        <div key={q.id} className="text-right">
                          <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>
                            {q.question_text}
                          </label>
                          <div className="rounded-md px-2 py-1 text-sm text-right" style={{
                            background: 'rgba(15, 23, 42, 0.6)',
                            border: '1px solid rgba(6, 182, 212, 0.2)'
                          }}>
                            <span style={{ color: '#f8fafc' }}>{displayValue}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>

          {loadingPredictions && (
            <div className="flex items-center justify-center py-4 mt-4">
              <Loader2 className="w-6 h-6 animate-spin ml-2" style={{ color: '#06b6d4' }} />
              <span style={{ color: '#06b6d4' }}>טוען ניחושים...</span>
            </div>
          )}

          {selectedParticipant && !loadingPredictions && (specialTables.length > 0 || roundTables.length > 0 || locationTables.length > 0 || israeliTable || playoffWinnersTable) && (
            <Card className="mt-4" style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              backdropFilter: 'blur(10px)'
            }}>
               <CardHeader className="py-2">
                  <CardTitle className="text-sm" style={{ color: '#06b6d4' }}>בחירת שלב לצפייה</CardTitle>
               </CardHeader>
               <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-3 p-2 md:p-3">
                  {allButtons.map(button => (
                      <Button 
                        key={button.key} 
                        onClick={() => toggleSection(button.sectionKey)} 
                        variant={openSections[button.sectionKey] ? "default" : "outline"} 
                        className={`h-12 md:h-20 p-1 md:p-2 flex-col gap-1 md:gap-2 whitespace-normal ${
                          openSections[button.sectionKey] 
                            ? 'bg-cyan-600 hover:bg-cyan-700 text-white' 
                            : 'bg-slate-700/50 hover:bg-cyan-600/20 border-cyan-400 text-cyan-200'
                        }`}
                      >
                          <span 
                            className="font-medium text-center leading-tight"
                            style={{
                              fontSize: button.isLongText ? '0.5rem' : '0.6rem',
                              lineHeight: button.isLongText ? '0.65rem' : '0.8rem'
                            }}
                          >
                            {button.description}
                          </span>
                          {openSections[button.sectionKey] ? <ChevronUp className="w-2 h-2 md:w-3 md:h-3" /> : <ChevronDown className="w-2 h-2 md:w-3 md:h-3" />}
                      </Button>
                  ))}
               </CardContent>
            </Card>
          )}

          {!selectedParticipant && !loadingPredictions && (
            <Alert className="mt-4" style={{ 
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              color: '#f8fafc'
            }}>
              <FileText className="w-4 h-4" style={{ color: '#06b6d4' }} />
              <AlertDescription style={{ color: '#94a3b8' }}>
                בחר משתתף כדי לראות את הניחושים שלו.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="p-3 md:p-6 max-w-7xl mx-auto">
        {selectedParticipant && !loadingPredictions ? (
          <>
            {allButtons.map(button => {
                if (!openSections[button.sectionKey]) return null;

                if (button.sectionKey === 'rounds') {
                    return (
                        <div key="rounds-section" className="mb-6 space-y-6"> {/* Added space-y-6 for spacing between tables */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {roundTables.map(table => (
                                <RoundTableReadOnly
                                    key={table.id}
                                    table={table}
                                    teams={data.teams}
                                    predictions={getCombinedPredictionsMap()} // This will use the current/edited predictions for display
                                    isEditMode={isEditMode && isAdmin}
                                    handlePredictionEdit={handlePredictionEdit}
                                />
                            ))}
                          </div>
                          {/* Added StandingsTable component */}
                          <StandingsTable 
                            roundTables={roundTables}
                            teams={data.teams}
                            data={getCombinedPredictionsMap()} // Pass combined predictions
                            type="predictions"
                          />
                        </div>
                    );
                } else if (button.sectionKey === 'israeli' && israeliTable) {
                    return (
                        <div key="israeli-section" className="mb-6">
                            <RoundTableReadOnly
                                table={israeliTable}
                                teams={data.teams}
                                predictions={getCombinedPredictionsMap()} // This will use the current/edited predictions for display
                                isEditMode={isEditMode && isAdmin}
                                handlePredictionEdit={handlePredictionEdit}
                            />
                        </div>
                    );
                } else if (button.sectionKey === 'locations') {
                    return (
                        <div key="locations-section" className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {locationTables.map(table => <div key={table.id}>{renderSpecialQuestions(table)}</div>)}
                        </div>
                    );
                } else if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) {
                    return (
                        <div key="playoffWinners-section" className="mb-6">
                            {renderSpecialQuestions(playoffWinnersTable)}
                        </div>
                    );
                } else {
                    const specificSpecialTable = specialTables.find(t => t.id === button.key);
                    if (specificSpecialTable) {
                        return (
                            <div key={specificSpecialTable.id} className="mb-6">
                                {renderSpecialQuestions(specificSpecialTable)}
                            </div>
                        );
                    }
                }
                return null;
            })}
          </>
        ) : null}
      </div>

      {isAdmin && (
        <>
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent className="max-w-2xl" dir="rtl" style={{
              background: '#1e293b',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <DialogHeader>
                <DialogTitle className="2xl font-bold flex items-center gap-2" style={{ color: '#f8fafc' }}>
                  <AlertTriangle className="w-6 h-6" style={{ color: '#ef4444' }} />
                  ניהול משתתפים
                </DialogTitle>
                <DialogDescription className="text-slate-300">
                  לחץ על כפתור המחיקה כדי למחוק את כל הניחושים של משתתף.
                  <strong className="text-red-300"> פעולה זו אינה הפיכה!</strong>
                </DialogDescription>
              </DialogHeader>
              
              <div className="max-h-[60vh] overflow-y-auto">
                {participantStats.length === 0 ? (
                  <div className="text-center py-8 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color: '#94a3b8' }} />
                    <span style={{ color: '#94a3b8' }}>טוען נתונים...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {participantStats.map(stat => (
                      <div key={stat.name} className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-700/50" style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(6, 182, 212, 0.2)'
                      }}>
                        <div>
                          <p className="font-medium" style={{ color: '#f8fafc' }}>{stat.name}</p>
                          <p className="text-sm" style={{ color: '#94a3b8' }}>{stat.predictionsCount} ניחושים</p>
                        </div>
                        <Button
                          onClick={() => handleDeleteParticipant(stat.name)}
                          disabled={deletingParticipant === stat.name}
                          variant="destructive"
                          size="sm"
                        >
                          {deletingParticipant === stat.name ? (
                            <>
                              <Loader2 className="w-4 h-4 ml-2" />
                              מוחק...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 ml-2" />
                              מחק
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showMissingReport} onOpenChange={setShowMissingReport}>
            <DialogContent className="max-w-6xl max-h-[90vh]" dir="rtl" style={{
              background: '#1e293b',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: '#f8fafc' }}>
                  <AlertTriangle className="w-6 h-6" style={{ color: '#fcd34d' }} />
                  דוח ניחושים חסרים
                </DialogTitle>
                <DialogDescription className="text-slate-300">
                  שאלות עם ניחושים חסרים, ממוינות לפי סדר השלבים
                </DialogDescription>
              </DialogHeader>
              
              <div className="overflow-y-auto max-h-[70vh]">
                {loadingMissing ? (
                  <div className="text-center py-8 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color: '#94a3b8' }} />
                    <span style={{ color: '#94a3b8' }}>מחשב...</span>
                  </div>
                ) : missingPredictions.length === 0 ? (
                  <div className="text-center py-8" style={{ color: '#10b981' }}>
                    <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#10b981' }} />
                    <p className="text-lg font-bold">מצוין! כל המשתתפים ענו על כל השאלות!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg" style={{
                      background: 'rgba(251, 191, 36, 0.1)',
                      border: '1px solid rgba(251, 191, 36, 0.3)'
                    }}>
                      <p className="text-sm font-bold" style={{ color: '#fcd34d' }}>
                        נמצאו {missingPredictions.length} שאלות עם ניחושים חסרים (סה"כ {missingPredictions.reduce((sum, m) => sum + m.missing_count, 0)} ניחושים)
                      </p>
                    </div>
                    
                    <table className="w-full">
                      <thead style={{ 
                        position: 'sticky', 
                        top: 0, 
                        zIndex: 10,
                        background: '#1e293b',
                        borderBottom: '2px solid rgba(6, 182, 212, 0.3)'
                      }}>
                        <tr>
                          <th className="text-center p-2 text-sm" style={{ color: '#94a3b8', width: '80px' }}>טבלה</th>
                          <th className="text-center p-2 text-sm" style={{ color: '#94a3b8', width: '60px' }}>מס׳</th>
                          <th className="text-right p-2 text-sm" style={{ color: '#94a3b8' }}>שאלה</th>
                          <th className="text-center p-2 text-sm" style={{ color: '#94a3b8', width: '80px' }}>חסרים</th>
                          <th className="text-right p-2 text-sm" style={{ color: '#94a3b8', width: '200px' }}>משתתפים</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missingPredictions.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-700/50" style={{
                            borderBottom: '1px solid rgba(6, 182, 212, 0.1)'
                          }}>
                            <td className="text-center p-2">
                              <Badge variant="outline" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>
                                {item.table_id}
                              </Badge>
                            </td>
                            <td className="text-center p-2">
                              <Badge variant="outline" style={{ borderColor: '#0ea5e9', color: '#0ea5e9' }}>
                                {item.question_id}
                              </Badge>
                            </td>
                            <td className="text-right p-2 text-sm" style={{ color: '#f8fafc' }}>
                              {item.question_text}
                            </td>
                            <td className="text-center p-2">
                              <Badge className="text-white font-bold" style={{ 
                                background: '#ef4444',
                                boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)'
                              }}>
                                {item.missing_count}
                              </Badge>
                            </td>
                            <td className="text-right p-2 text-xs" style={{ color: '#94a3b8' }}>
                              {item.missing_participants.slice(0, 3).join(', ')}
                              {item.missing_participants.length > 3 && ` ועוד ${item.missing_participants.length - 3}...`}
                            </td>
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