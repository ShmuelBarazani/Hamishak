import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Prediction, Question, ValidationList, Ranking, GameParticipant, Game } from "@/api/entities";
import { Users, Loader2, ChevronDown, ChevronUp, FileText, Trash2, AlertTriangle, Trophy, Pencil, Save, Award } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RoundTableReadOnly from "../components/predictions/RoundTableReadOnly";
import { calculateQuestionScore, calculateLocationTableBonus } from "@/components/scoring/ScoreCalculator";
import StandingsTable from "../components/predictions/StandingsTable"; // Added import

// 🚀 Cache גלובלי לשיפור ביצועים
const MAX_SCORE_CACHE = new Map();
const NORMALIZE_TEAM_CACHE = new Map();
const TEAM_NAME_CLEAN_CACHE = new Map();

// 🚀 Helper function to get maximum possible score - WITH CACHE
const getMaxPossibleScore = (question) => {
  if (MAX_SCORE_CACHE.has(question.id)) {
    return MAX_SCORE_CACHE.get(question.id);
  }
  
  const isIsraeliTableMatchQuestion = question.table_id === 'T20' && question.home_team && question.away_team;
  let score;
  
  if (isIsraeliTableMatchQuestion) {
    score = 6;
  } else if (question.possible_points != null && question.possible_points > 0) {
    score = question.possible_points;
  } else if (question.actual_result != null && question.actual_result !== '') {
    score = 10; 
  } else {
    score = 0;
  }
  
  MAX_SCORE_CACHE.set(question.id, score);
  return score;
};

// 🚀 Cache לנורמליזציה
const normalizeTeamNameCached = (name) => {
  if (!name) return name;
  if (NORMALIZE_TEAM_CACHE.has(name)) return NORMALIZE_TEAM_CACHE.get(name);
  
  const result = name
    .replace(/קרבאך/g, 'קרבאח')
    .replace(/קראבח/g, 'קרבאח')
    .replace(/קראבך/g, 'קרבאח')
    .trim();
  
  NORMALIZE_TEAM_CACHE.set(name, result);
  return result;
};

const cleanTeamNameCached = (name) => {
  if (!name) return name;
  if (TEAM_NAME_CLEAN_CACHE.has(name)) return TEAM_NAME_CLEAN_CACHE.get(name);
  
  const result = name.split('(')[0].trim();
  TEAM_NAME_CLEAN_CACHE.set(name, result);
  return result;
};

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

  // 🆕 ניקוד המשתתף הנבחר - מחושב
  const [participantScore, setParticipantScore] = useState(null);

  const { toast } = useToast();

  // 🔥 חשוב: isAdmin חייב להיות מחושב לפני כל השימושים בו
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    // בדיקת admin לפי localStorage (כמו AdminResults)
    const adminLoggedIn = localStorage.getItem("toto_admin_logged_in");
    setCurrentUser(adminLoggedIn === "true" ? { role: 'admin' } : null);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [gameParticipants, questions, validationLists, games] = await Promise.all([
          GameParticipant.filter({}, 'participant_name', 500),
          Question.filter({}, 'question_id', 10000),
          ValidationList.filter({}, null, 5000),
          Game.filter({}, null, 10)
        ]);

        // בנה teamsMap מ-games.teams_data
        const currentGame = games[0] || {};
        const teamsMap = (currentGame.teams_data || []).reduce((acc, team) => { acc[team.name] = team; return acc; }, {});
        const listsMap = validationLists.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {});

        // 🔥 שמור את רשימת הקבוצות מרשימת האימות
        const teamListObj = validationLists.find(list =>
          list.list_name?.toLowerCase().includes('קבוצ') &&
          !list.list_name?.toLowerCase().includes('מוקדמות')
        );

        if (teamListObj) {
          setTeamValidationList(teamListObj.options);
        }

        const uniqueParticipants = gameParticipants
          .filter(p => p.is_active !== false)
          .map(p => p.participant_name)
          .filter(Boolean)
          .sort();
        console.log('✅ Loaded participants:', uniqueParticipants.length, uniqueParticipants.slice(0,3));
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
          
          // 🎯 שינוי שמות T12 ו-T13 לשמות קצרים
          let tableDescription = q.table_description;
          if (q.table_id === 'T12') {
            tableDescription = 'שלב הליגה - פינת הגאווה הישראלית - 7 בוםםםםםםםםםם !!!';
          } else if (q.table_id === 'T13') {
            tableDescription = 'שלב ראש בראש - "מבול מטאורים של כוכבים (*)"';
          }
          
          if (!tableCollection[q.table_id]) {
            tableCollection[q.table_id] = {
              id: q.table_id,
              description: tableDescription || (q.home_team && q.away_team ? `מחזור ${q.table_id.replace('T','')}` : `שאלות ${q.table_id.replace('T','')}`),
              questions: []
            };
          }
          tableCollection[q.table_id].questions.push(q);
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

        const sortedRoundTables = Object.values(rTables).sort((a,b) => {
          const aNum = parseInt(a.id.replace('T','')) || 0;
          const bNum = parseInt(b.id.replace('T','')) || 0;
          return aNum - bNum;
        });
        setRoundTables(sortedRoundTables);

        // 🔥 הפרדה: T14-T17 בלבד במיקומים
        const locationTableIds = ['T14', 'T15', 'T16', 'T17'];
        const locationGroup = Object.values(sTables)
            .filter(table => locationTableIds.includes(table.id))
            .sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0));
        setLocationTables(locationGroup);

        // 🆕 T19 נפרד
        const t19Table = sTables['T19'];
        setPlayoffWinnersTable(t19Table || null);

        // 🔥 כל השאר (ללא T19)
        const allSpecialTables = Object.values(sTables).filter(table => {
            const desc = table.description?.trim();
            return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && table.id !== 'T19';
        }).sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0));
        
        setSpecialTables(allSpecialTables);

        setData(prev => ({ ...prev, questions, teams: teamsMap, validationLists: listsMap }));
      } catch (error) {
        console.error("Error loading data:", error);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    const loadParticipantPredictions = async () => {
      if (!selectedParticipant) {
        setData(prev => ({ ...prev, predictions: [] }));
        setEditedPredictions({});
        setIsEditMode(false);
        setParticipantScore(null);
        return;
      }
      
      setLoadingPredictions(true);
      try {
        // 🚀 טען ניחושים, שאלות, וניקוד מ-Ranking
        const [predictions, allQuestions, rankingEntries] = await Promise.all([
          Prediction.filter({ participant_name: selectedParticipant }, null, 10000),
          Question.filter({}, null, 5000),
          Ranking.filter({ participant_name: selectedParticipant }, null, 1)
        ]);
        
        // 🔥 חשב ניקוד בזמן אמת (כמו ב-LeaderboardNew)
        let totalScore = 0;
        
        // סנן שאלות עם תוצאות אמיתיות
        const questionsWithResults = allQuestions.filter(q => {
          if (!q.actual_result) return false;
          const result = String(q.actual_result).trim();
          return result !== '' && result !== '__CLEAR__' && result !== '-' && result !== 'null' && !result.toLowerCase().includes('null');
        });
        
        // בנה map של ניחושים
        const predictionsMap = new Map(predictions.map(p => [p.question_id, p.text_prediction]));
        
        // חשב ניקוד לכל שאלה רגילה (לא טבלאות מיקום)
        questionsWithResults.forEach(question => {
          const prediction = predictionsMap.get(question.id);
          if (!prediction) return;
          
          const score = calculateQuestionScore(question, prediction);
          if (score !== null) {
            totalScore += score;
          }
        });
        
        // 🎁 חשב בונוסים מטבלאות מיקומים (רק פעם אחת לכל טבלה!)
        const locationTableIds = ['T14', 'T15', 'T16', 'T17', 'T19'];
        for (const tableId of locationTableIds) {
          const tableQuestions = questionsWithResults.filter(q => q.table_id === tableId);
          if (tableQuestions.length === 0) continue;
          
          const tablePredictions = {};
          tableQuestions.forEach(q => {
            const pred = predictionsMap.get(q.id);
            if (pred) tablePredictions[q.id] = pred;
          });
          
          const bonusResult = calculateLocationTableBonus(tableId, tableQuestions, tablePredictions);
          if (bonusResult) {
            totalScore += (bonusResult.basicScore || 0) + (bonusResult.teamsBonus || 0) + (bonusResult.orderBonus || 0);
          }
        }
        
        console.log(`✅ ניקוד מחושב בזמן אמת עבור ${selectedParticipant}: ${totalScore}`);
        
        setData(prev => ({ ...prev, predictions }));
        setEditedPredictions({});
        setIsEditMode(false);
        setParticipantScore(totalScore);
      } catch (error) {
        console.error("Error loading participant predictions:", error);
        setParticipantScore(null);
      }
      setLoadingPredictions(false);
    };

    loadParticipantPredictions();
  }, [selectedParticipant, data.questions]);

  // 🚀 useMemo - נחשב רק כשמשתנה selectedParticipant או predictions
  const participantPredictions = useMemo(() => {
    if (!selectedParticipant) return {};
    return data.predictions.reduce((acc, p) => {
      acc[p.question_id] = p.text_prediction;
      return acc;
    }, {});
  }, [selectedParticipant, data.predictions]);

  // 🚀 useMemo ל-existingPredictionsMap
  const existingPredictionsMap = useMemo(() => 
    new Map(data.predictions.map(p => [p.question_id, p])),
  [data.predictions]);

  // Helper function to get the currently displayed prediction value (original or edited)
  const getPredictionValueForDisplay = useCallback((questionId) => {
    return editedPredictions[questionId] !== undefined
      ? editedPredictions[questionId]
      : participantPredictions[questionId];
  }, [editedPredictions, participantPredictions]);

  // 🚀 useMemo ל-combinedPredictionsMap
  const combinedPredictionsMap = useMemo(() => ({
    ...participantPredictions,
    ...editedPredictions,
  }), [participantPredictions, editedPredictions]);

  // 🆕 Function to combine original and edited predictions for components that need a full map
  const getCombinedPredictionsMap = useCallback(() => combinedPredictionsMap, [combinedPredictionsMap]);

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
    try {
      const allPredictions = await Prediction.filter({}, null, 10000);
      
      // 🚀 reduce במקום forEach
      const stats = allPredictions.reduce((acc, pred) => {
        if (!acc[pred.participant_name]) {
          acc[pred.participant_name] = 0;
        }
        acc[pred.participant_name]++;
        return acc;
      }, {});

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
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את כל הניחושים של "${participantName}"? פעולה זו אינה הפיכה!`)) {
      return;
    }

    setDeletingParticipant(participantName);
    try {
      const predictionsToDelete = await Prediction.filter({ participant_name: participantName }, null, 10000);
      
      // 🚀 מחיקה במקביל בקבוצות של 20
      const batchSize = 20;
      for (let i = 0; i < predictionsToDelete.length; i += batchSize) {
        const batch = predictionsToDelete.slice(i, i + batchSize);
        await Promise.all(batch.map(pred => Prediction.delete(pred.id)));
      }

      toast({
        title: "נמחק בהצלחה!",
        description: `נמחקו ${predictionsToDelete.length} ניחושים של ${participantName}.`,
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
        description: "מחיקת המשתתף נכשלה.",
        variant: "destructive"
      });
    } finally {
      setDeletingParticipant(null);
    }
  };

  // 🆕 פונקציה לעדכון ניחוש במצב עריכה
  const handlePredictionEdit = useCallback((questionId, newValue) => {
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
  }, [isEditMode, participantPredictions]);

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
      // 🚀 Map של predictions קיימים
      // existingPredictionsMap כבר מחושב ב-useMemo

      const updatePromises = [];
      const createData = [];
      
      for (const [questionId, newValue] of changedPredictions) {
        const prediction = existingPredictionsMap.get(questionId);
        
        if (prediction) {
          updatePromises.push(
            Prediction.update(prediction.id, { text_prediction: newValue })
          );
        } else {
          createData.push({
            question_id: questionId,
            participant_name: selectedParticipant,
            text_prediction: newValue
          });
        }
      }

      // 🚀 ביצוע במקביל
      await Promise.all(updatePromises);
      
      if (createData.length > 0) {
        await Prediction.bulkCreate(createData);
      }
      
      toast({
        title: "שינויים נשמרו!",
        description: `עודכנו ${changedPredictions.length} ניחושים עבור ${selectedParticipant}`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });

      // טען מחדש את הניחושים
      const predictions = await Prediction.filter({ participant_name: selectedParticipant }, null, 10000);
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

  // 🚀 TEAM_NAME_MAPPING עם useMemo
  const TEAM_NAME_MAPPING = useMemo(() => {
    const mapping = new Map();
    teamValidationList.forEach(validName => {
      const normalizedBaseName = normalizeTeamNameCached(cleanTeamNameCached(validName));
      mapping.set(normalizedBaseName, validName);
      
      // Add variations that might exist in user input
      const variants = [
        validName.replace(/קרבאח/g, 'קרבאך'),
        validName.replace(/קרבאח/g, 'קראבח'),
        validName.replace(/קרבאח/g, 'קראבך'),
        validName.replace(/ת"א/g, 'תל אביב'),
        validName.replace(/ת.א/g, 'תל אביב'),
      ];
      variants.forEach(v => {
        const normalizedVariantBaseName = normalizeTeamNameCached(cleanTeamNameCached(v));
        mapping.set(normalizedVariantBaseName, validName);
      });
    });
    return mapping;
  }, [teamValidationList]);

  // 🔥 פונקציה חדשה - מחפשת את השם המתאים ברשימת האימות
  const findMatchedTeamName = useCallback((predictionName) => {
    if (!predictionName || teamValidationList.length === 0) return predictionName;
    
    const trimmedPrediction = predictionName.trim();
    
    // בדיקה 1: התאמה מדויקת
    if (teamValidationList.includes(trimmedPrediction)) {
      return trimmedPrediction;
    }
    
    // בדיקה 2: התאמה לפי שם בסיסי מנורמל
    const normalizedBaseName = normalizeTeamNameCached(cleanTeamNameCached(trimmedPrediction));
    
    // חפש במפת המיפוי
    const matched = TEAM_NAME_MAPPING.get(normalizedBaseName);
    if (matched) {
      // console.log(`✅ נמצאה התאמה: "${trimmedPrediction}" → "${matched}"`);
      return matched;
    }
    
    // אם לא נמצאה התאמה - החזר את המקורי
    // console.log(`⚠️ לא נמצאה התאמה עבור: "${trimmedPrediction}"`);
    return trimmedPrediction;
  }, [teamValidationList, TEAM_NAME_MAPPING]);

  // 🚀 Pre-calculate bonusInfo for each location table outside render
  const locationTableBonuses = useMemo(() => {
    if (!selectedParticipant) return {};
    
    const bonuses = {};
    const allLocationTables = [...locationTables];
    if (playoffWinnersTable) {
      allLocationTables.push(playoffWinnersTable);
    }
    
    allLocationTables.forEach(table => {
      const sortedQuestions = [...table.questions].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
      const predForBonus = {};
      sortedQuestions.forEach(q => {
        predForBonus[q.id] = editedPredictions[q.id] !== undefined 
          ? editedPredictions[q.id] 
          : (participantPredictions[q.id] || "");
      });
      bonuses[table.id] = calculateLocationTableBonus(table.id, sortedQuestions, predForBonus);
    });
    
    return bonuses;
  }, [selectedParticipant, locationTables, playoffWinnersTable, participantPredictions, editedPredictions]);

  // 🚀 renderReadOnlySelect עם useCallback
  const renderReadOnlySelect = useCallback((question, originalValue) => {
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ');
    const locationTableIds = ['T14', 'T15', 'T16', 'T17', 'T19'];
    const isLocationQuestion = locationTableIds.includes(question.table_id);

    let displayTeamNameForReadonly = originalValue;
    if (isTeamsList && originalValue && isLocationQuestion) {
      displayTeamNameForReadonly = findMatchedTeamName(originalValue);
    }
    const team = isTeamsList ? data.teams[displayTeamNameForReadonly] : null; 
    
    const qMaxScore = getMaxPossibleScore(question);
    const hasValue = originalValue && originalValue.trim() !== '';
    
    const qHasActualResult = question.actual_result && 
                            question.actual_result.trim() !== '' && 
                            question.actual_result !== '__CLEAR__';
    
    const qTextColor = qHasActualResult ? '#06b6d4' : '#f8fafc';
    
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
              {currentValue ? (
                <div className="flex items-center gap-2 w-full">
                  {currentTeam?.logo_url && (
                    <img 
                      src={currentTeam.logo_url} 
                      alt={displayCurrentTeamNameForEdit} 
                      className="w-4 h-4 rounded-full" 
                      loading="lazy"
                      decoding="async"
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
                          loading="lazy"
                          decoding="async"
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
                ?/{qMaxScore}
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

    // 🔥 טיפול מיוחד לשאלות מטבלאות מיקומים
    const isLocationTableQuestion = ['T14', 'T15', 'T16', 'T17', 'T19'].includes(question.table_id);
    
    // חישוב מידע לטבלאות מיקומים
    let locationInfo = null;
    if (isLocationTableQuestion && originalValue && question.actual_result && 
        question.actual_result.trim() !== '' && question.actual_result !== '__CLEAR__') {
      
      // נורמליזציה של הניחוש והתוצאה האמיתית
      const normalizeScore = (score) => {
        if (!score) return '';
        return score.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '').trim();
      };
      
      const normalizedPred = normalizeScore(originalValue);
      const normalizedActual = normalizeScore(question.actual_result);
      
      // בדוק אם הניחוש תואם לתוצאה האמיתית (מיקום מדויק)
      const isPerfectPosition = normalizedPred === normalizedActual;
      
      // בדוק אם הקבוצה המנוחשת נמצאת בכלל בטבלה הזו
      // צריך לבדוק מול כל השאלות של הטבלה
      const tableQuestions = data.questions.filter(q => q.table_id === question.table_id);
      const allActualResults = tableQuestions
        .filter(q => q.actual_result && q.actual_result.trim() !== '' && q.actual_result !== '__CLEAR__')
        .map(q => normalizeScore(q.actual_result));
      
      const isInCorrectTable = allActualResults.includes(normalizedPred);
      
      // חישוב הניקוד הבסיסי (20 או 30 לפי הטבלה)
      const isT19 = question.table_id === 'T19';
      const pointsPerTeam = isT19 ? 30 : 20;
      
      locationInfo = {
        isPerfectPosition,
        isInCorrectTable,
        points: isInCorrectTable ? pointsPerTeam : 0
      };
    }
    
    const score = isLocationTableQuestion ? null : calculateQuestionScore(question, originalValue);

    let badgeColor = 'bg-slate-600 text-slate-300';
    if (score !== null) {
      if (score === qMaxScore && qMaxScore > 0) {
        badgeColor = 'bg-green-700 text-green-100';
      } else if (score === 0) {
        badgeColor = 'bg-red-700 text-red-100';
      } else if (qMaxScore > 0 && score >= qMaxScore * 0.7) {
        badgeColor = 'bg-blue-700 text-blue-100';
      } else if (score > 0) {
        badgeColor = 'bg-yellow-700 text-yellow-100';
      }
    }

    return (
      <>
        <div className={`rounded-md px-2 py-2 ${boxWidth} flex items-center gap-1`} style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)'
        }}>
          {team?.logo_url && (
            <img 
              src={team.logo_url} 
              alt={displayTeamNameForReadonly} 
              className="w-4 h-4 rounded-full flex-shrink-0" 
              loading="lazy"
              decoding="async"
              onError={(e) => e.target.style.display = 'none'}
            />
          )}
          <span style={{ color: qTextColor, fontSize: isQuestion11_1 ? '0.65rem' : '0.875rem', fontWeight: qHasActualResult ? '600' : 'normal' }}>{displayTeamNameForReadonly}</span>
        </div>
        {/* 🔥 תצוגת ניקוד לטבלאות מיקומים */}
        {isLocationTableQuestion && locationInfo ? (
          <div className="flex items-center gap-1">
            <Badge className={`text-xs font-bold px-2 py-0.5 ${
              locationInfo.isInCorrectTable ? 'bg-green-700 text-green-100' : 'bg-red-700 text-red-100'
            }`}>
              {locationInfo.isInCorrectTable ? '✓' : '✗'} {locationInfo.points}
            </Badge>
            {locationInfo.isPerfectPosition && (
              <Badge className="bg-yellow-600 text-white text-xs px-1.5 py-0.5">
                ✨
              </Badge>
            )}
          </div>
        ) : isLocationTableQuestion ? (
          <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">
            ?
          </Badge>
        ) : score !== null ? (
          <Badge className={`${badgeColor} text-xs font-bold px-1.5 py-0.5 min-w-[45px] justify-center`}>
            {score}/{qMaxScore}
          </Badge>
        ) : (
          <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">
            ?/{qMaxScore}
          </Badge>
        )}
      </>
    );
  }, [data.teams, data.validationLists, findMatchedTeamName, isEditMode, isAdmin, editedPredictions, handlePredictionEdit, participantPredictions]);

  // 🚀 renderTeamPrediction עם useMemo פנימי (converted to useCallback)
  const renderTeamPrediction = useCallback((question, originalValue) => {
    const valueToDisplay = editedPredictions[question.id] !== undefined 
      ? editedPredictions[question.id] 
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

    const matchedName = findMatchedTeamName(valueToDisplay);
    const team = data.teams[matchedName];
    
    // 🔥 חישוב ניקוד עבור שאלות קבוצה
    const qMaxScore = getMaxPossibleScore(question);
    const score = calculateQuestionScore(question, valueToDisplay);
    
    let badgeColor = 'bg-slate-600 text-slate-300';
    if (score !== null) {
      if (score === qMaxScore && qMaxScore > 0) {
        badgeColor = 'bg-green-700 text-green-100';
      } else if (score === 0) {
        badgeColor = 'bg-red-700 text-red-100';
      } else if (qMaxScore > 0 && score >= qMaxScore * 0.7) {
        badgeColor = 'bg-blue-700 text-blue-100';
      } else if (score > 0) {
        badgeColor = 'bg-yellow-700 text-yellow-100';
      }
    }
    
    return (
      <>
        <div className="rounded-md px-2 py-2 min-w-[135px] max-w-[140px] flex items-center gap-1" style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)'
        }}>
          {team?.logo_url && (
            <img 
              src={team.logo_url} 
              alt={matchedName} 
              className="w-4 h-4 rounded-full flex-shrink-0" 
              loading="lazy"
              decoding="async"
              onError={(e) => e.target.style.display = 'none'}
            />
          )}
          <span style={{ color: '#f8fafc', fontSize: '0.875rem', fontWeight: 'normal' }}>{matchedName}</span>
        </div>
        {score !== null ? (
          <Badge className={`${badgeColor} text-xs font-bold px-1.5 py-0.5 min-w-[45px] justify-center`}>
            {score}/{qMaxScore}
          </Badge>
        ) : (
          <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 min-w-[45px] justify-center">
            ?/{qMaxScore}
          </Badge>
        )}
      </>
    );
  }, [editedPredictions, findMatchedTeamName, data.teams, data.questions]);

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
    // renderTeamPrediction is already a useCallback and handles edited state.

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

              const isQuestion11 = main.question_id === '11';
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              const mainNumericId = parseFloat(main.question_id);
              const isGroup1 = (mainNumericId >= 1 && mainNumericId <= 2) || (mainNumericId >= 14 && mainNumericId <= 26);
              
              // 🔥 זיהוי שאלות שצריכות החלפה - אלו שאלות קבוצה בתוך T10
              const isTeamQuestion = (mainNumericId >= 5 && mainNumericId <= 10) || (mainNumericId >= 12 && mainNumericId <= 13);
              
              if (isQuestion11 && sortedSubs.length > 0) {
                const sub11_1 = sortedSubs.find(s => s.question_id === '11.1');
                const sub11_2 = sortedSubs.find(s => s.question_id === '11.2');
                
                return (
                  <div 
                    key={main.id} 
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 140px 140px 50px 50px 100px 65px 50px 50px 180px 150px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '12px',
                      borderRadius: '8px'
                    }}
                    className="bg-slate-700/20 border border-slate-600/30"
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 w-[45px] justify-center text-xs">
                      {main.question_id}
                    </Badge>
                    <span className="font-medium text-blue-100 text-xs leading-tight" style={{ lineHeight: '1.2' }}>
                      {main.question_text}
                    </span>
                    <div className="contents">
                      {renderReadOnlySelect(main, participantPredictions[main.id] || "")}
                    </div>

                    {sub11_1 ? (
                      <>
                        <Badge variant="outline" className="border-cyan-400 text-cyan-200 w-[45px] justify-center text-xs">
                          {sub11_1.question_id}
                        </Badge>
                        <span className="font-medium text-blue-100 text-xs leading-tight break-words" style={{ lineHeight: '1.2', wordBreak: 'break-word' }}>
                          {sub11_1.question_text}
                        </span>
                        <div className="contents">
                          {renderReadOnlySelect(sub11_1, participantPredictions[sub11_1.id] || "")}
                        </div>
                      </>
                    ) : (
                      <>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                      </>
                    )}

                    {sub11_2 ? (
                      <>
                        <Badge variant="outline" className="border-cyan-400 text-cyan-200 w-[45px] justify-center text-xs">
                          {sub11_2.question_id}
                        </Badge>
                        <span className="font-medium text-blue-100 text-xs leading-tight break-words" style={{ lineHeight: '1.2', wordBreak: 'break-word' }}>
                          {sub11_2.question_text}
                        </span>
                        <div className="contents">
                          {renderReadOnlySelect(sub11_2, participantPredictions[sub11_2.id] || "")}
                        </div>
                      </>
                    ) : (
                      <>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                      </>
                    )}
                  </div>
                );
              }

              if (isGroup1 && sortedSubs.length === 0) {
                // 🔥 שאלות קבוצה 1 (1-2, 14-26) - אלו לא שאלות קבוצה המזוהות עם לוגo
                return (
                  <div 
                    key={main.id} 
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: '60px 1fr 180px 60px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '12px',
                      borderRadius: '8px'
                    }}
                    className="bg-slate-700/20 border border-slate-600/30"
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 w-[50px] justify-center">
                      {main.question_id}
                    </Badge>
                    <span className="font-medium text-blue-100 text-sm">{main.question_text}</span>
                    <div className="contents">
                      {renderReadOnlySelect(main, participantPredictions[main.id] || "")}
                    </div>
                  </div>
                );
              }

              return (
                <div 
                  key={main.id} 
                  style={{ 
                    display: 'grid',
                    gridTemplateColumns: '60px minmax(300px, 2fr) 180px 60px 50px minmax(150px, 1fr) 180px 60px',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '8px'
                  }}
                  className="bg-slate-700/20 border border-slate-600/30"
                >
                  <Badge variant="outline" className="border-cyan-400 text-cyan-200 w-[50px] justify-center">
                    {main.question_id}
                  </Badge>
                  
                  <span className="font-medium text-blue-100 text-sm">
                    {main.question_text}
                  </span>
                  
                  {/* 🔥 השאלה הראשית - אם זו שאלת קבוצה, השתמש ב-renderTeamPrediction. אחרת, renderReadOnlySelect */}
                  <div className="contents">
                    {isTeamQuestion 
                      ? renderTeamPrediction(main, participantPredictions[main.id] || "") 
                      : renderReadOnlySelect(main, participantPredictions[main.id] || "")}
                  </div>

                  {sortedSubs.length > 0 ? (
                    <>
                      <div className="flex flex-col gap-2">
                        {sortedSubs.map(sub => (
                          <Badge key={sub.id + "-id"} variant="outline" className="border-cyan-400 text-cyan-200 w-[45px] justify-center text-xs">
                            {sub.question_id}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {sortedSubs.map(sub => (
                          <span key={sub.id + "-text"} className="font-medium text-blue-100 text-sm">
                            {sub.question_text}
                          </span>
                        ))}
                      </div>
                      
                      {/* 🔥 התשובות המשניות - גם כאן החלף אם צריך */}
                      <div className="flex flex-col gap-2">
                        {sortedSubs.map(sub => {
                          const subValue = participantPredictions[sub.id] || "";
                          return (
                            <div key={sub.id + "-pred-score"} className="flex items-center gap-2">
                              {isTeamQuestion 
                                ? renderTeamPrediction(sub, subValue) 
                                : renderReadOnlySelect(sub, subValue)}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <div></div> {/* Empty cells for grid alignment if no subs */}
                      <div></div>
                      <div></div>
                      <div></div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSpecialQuestions = (table) => {
    const isT10 = table.description.includes('T10') || table.id === 'T10';
    
    if (isT10) {
      return renderT10Questions(table);
    }

    const sortedQuestions = [...table.questions].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));

    const isLocationTable = ['T14', 'T15', 'T16', 'T17', 'T19'].includes(table.id);
    
    // 🚀 שימוש ב-pre-calculated bonusInfo
    const bonusInfo = isLocationTable ? locationTableBonuses[table.id] : null;

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
            {sortedQuestions.map(q => {
              const qId = parseFloat(q.question_id);
              const isCompactQuestion = (qId >= 1 && qId <= 2) || (qId >= 14 && qId <= 17);
              
              const originalValue = participantPredictions[q.id] || '';

              const contentRightSide = (
                <div className="flex items-center gap-2">
                  {renderReadOnlySelect(q, originalValue)}
                </div>
              );

              if (isCompactQuestion) {
                return (
                  <div key={q.id} className="p-3 rounded-lg border" style={{ 
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)'
                  }}>
                    <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center">
                      <Badge variant="outline" className="min-w-[40px] justify-center" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{q.question_id}</Badge>
                      <label className="font-medium text-sm text-right" style={{ color: '#f8fafc' }}>{q.question_text}</label>
                      <div className="justify-self-start">{contentRightSide}</div>
                    </div>
                  </div>
                );
              }
              
              return (
                <div key={q.id} className="grid grid-cols-[auto,1fr,auto] items-center gap-3 p-3 rounded-lg border" style={{ 
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)'
                }}>
                  <Badge variant="outline" className="min-w-[40px] justify-center" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>{q.question_id}</Badge>
                  <label className="font-medium text-sm text-right" style={{ color: '#f8fafc' }}>{q.question_text}</label>
                  <div>{contentRightSide}</div>
                </div>
              );
            })}
          </div>

          {isLocationTable && selectedParticipant && (
            <>
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

              {/* 🔥 סה"כ ניקוד לטבלה */}
              <div className="mt-3 p-4 rounded-lg border-2" style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)',
                borderColor: '#06b6d4'
              }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-6 h-6" style={{ color: '#06b6d4' }} />
                    <p className="font-bold text-lg" style={{ color: '#06b6d4' }}>
                      סה"כ ניקוד טבלה
                    </p>
                  </div>
                  <Badge className="text-2xl font-bold px-4 py-2" style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                    color: 'white',
                    boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                  }}>
                    {bonusInfo !== null 
                      ? (bonusInfo.basicScore || 0) + (bonusInfo.teamsBonus || 0) + (bonusInfo.orderBonus || 0)
                      : '?'}
                  </Badge>
                </div>
                {bonusInfo !== null && (
                  <div className="mt-2 text-xs flex gap-3" style={{ color: '#94a3b8' }}>
                    <span>בסיסי: {bonusInfo.basicScore || 0}</span>
                    <span>עולות: {bonusInfo.teamsBonus || 0}</span>
                    {table.id !== 'T19' && <span>מיקום: {bonusInfo.orderBonus || 0}</span>}
                  </div>
                )}
              </div>
            </>
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
    const firstRoundTableId = roundTables[0]?.id || 'T2'; 
    const description = 'מחזורי המשחקים';
    allButtons.push({
      numericId: parseInt(firstRoundTableId.replace('T', ''), 10),
      key: 'rounds',
      description: description,
      sectionKey: 'rounds',
      isLongText: description.length > TEXT_LENGTH_THRESHOLD
    });
  }

  specialTables.forEach(table => {
    const description = table.description;
    allButtons.push({
      numericId: parseInt(table.id.replace('T', ''), 10),
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

  allButtons.sort((a, b) => a.numericId - b.numericId);

  return (
    <div className="min-h-screen" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }}>
      <div className="sticky top-0 z-30 backdrop-blur-sm shadow-lg" style={{ 
        background: 'rgba(15, 23, 42, 0.95)',
        borderBottom: '1px solid rgba(6, 182, 212, 0.2)'
      }}>
        <div className="p-6 max-w-7xl mx-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-3" style={{ 
                color: '#f8fafc',
                textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
              }}>
                <Users className="w-8 h-8" style={{ color: '#06b6d4' }} />
                צפייה בניחושים
              </h1>
              <p style={{ color: '#94a3b8' }}>בחר משתתף כדי לראות את הניחושים שלו.</p>
            </div>
            <div className="flex gap-3">
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

            {selectedParticipant && participantQuestions.length > 0 && (
              <Card style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                backdropFilter: 'blur(10px)'
              }}>
                <CardHeader className="py-2">
                  <CardTitle className="text-sm flex items-center justify-between" style={{ color: '#06b6d4' }}>
                    <span>פרטי המשתתף</span>
                    {participantScore !== null && (
                      <Badge className="text-white text-sm px-3 py-1 flex items-center gap-1" style={{ 
                        background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                        boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)'
                      }}>
                        <Award className="w-4 h-4" />
                        {participantScore} נקודות
                      </Badge>
                    )}
                    {participantScore === null && (
                      <span className="text-xs text-yellow-400">⚠️ לא חושב ניקוד</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
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
               <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
                  {allButtons.map(button => (
                      <Button 
                        key={button.key} 
                        onClick={() => toggleSection(button.sectionKey)} 
                        variant={openSections[button.sectionKey] ? "default" : "outline"} 
                        className={`h-20 p-2 flex-col gap-2 whitespace-normal ${
                          openSections[button.sectionKey] 
                            ? 'bg-cyan-600 hover:bg-cyan-700 text-white' 
                            : 'bg-slate-700/50 hover:bg-cyan-600/20 border-cyan-400 text-cyan-200'
                        }`}
                      >
                          <span 
                            className="font-medium"
                            style={{
                              fontSize: button.isLongText ? '0.65rem' : '0.9rem',
                              lineHeight: button.isLongText ? '0.9rem' : '1.25rem'
                            }}
                          >
                            {button.description}
                          </span>
                          {openSections[button.sectionKey] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
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

      <div className="p-6 max-w-7xl mx-auto">
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
                            questions={data.questions} // Pass all questions to the StandingsTable
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
      )}
    </div>
  );
}
