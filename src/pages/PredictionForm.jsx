import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trophy, FileText, Save, Loader2, ChevronDown, ChevronUp, Lock, Unlock } from "lucide-react";
import { Question, Prediction, User, Team, ValidationList, SystemSettings } from "@/entities/all";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities'; // Changed import for base44
import { useToast } from "@/components/ui/use-toast";
import RoundTable from "../components/predictions/RoundTable";
import StandingsTable from "../components/predictions/StandingsTable";
import { useGame } from "@/components/contexts/GameContext";
import { createPageUrl } from "@/utils"; // Added import for createPageUrl

export default function PredictionForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isFormLocked, setIsFormLocked] = useState(true);
  const [teams, setTeams] = useState({});
  const [validationLists, setValidationLists] = useState({});
  const [predictions, setPredictions] = useState({});
  const [participantDetails, setParticipantDetails] = useState({});
  
  const [participantQuestions, setParticipantQuestions] = useState([]);
  const [roundTables, setRoundTables] = useState([]);
  const [israeliTable, setIsraeliTable] = useState(null);
  const [specialTables, setSpecialTables] = useState([]);
  const [locationTables, setLocationTables] = useState([]);
  const [playoffWinnersTable, setPlayoffWinnersTable] = useState(null);

  const [participantName, setParticipantName] = useState("");
  const [openSections, setOpenSections] = useState({});
  const { toast } = useToast();
  const { currentGame } = useGame();
  const [selectedLocationTeams, setSelectedLocationTeams] = useState(new Set());
  const [selectedPlayoffTeams, setSelectedPlayoffTeams] = useState(new Set());
  const [selectedTopFinishersAndThirdTeams, setSelectedTopFinishersAndThirdTeams] = useState(new Set()); // כל ראש בית + סגנית + מקום 3
  const [thirdPlaceYesCount, setThirdPlaceYesCount] = useState(0);
  const [thirdPlaceNoCount, setThirdPlaceNoCount] = useState(0);
  const [selectedT11Teams, setSelectedT11Teams] = useState(new Set()); // נבחרות רבע גמר
  const [selectedT12Teams, setSelectedT12Teams] = useState(new Set()); // נבחרות חצי גמר
  const [selectedT13Teams, setSelectedT13Teams] = useState(new Set()); // נבחרות גמר
  const [allQuestions, setAllQuestions] = useState([]); // כל השאלות (לא כולל T1)

  const loadInitialData = useCallback(async () => {
    if (!currentGame) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 🔐 בדיקת משתמש מחובר - חובה!
      let user = null;
      try {
        const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
        if (!isAuth) {
          // אם לא מחובר - הפנה להתחברות
          toast({
            title: "נדרשת התחברות",
            description: "עליך להתחבר כדי למלא ניחושים",
            variant: "destructive",
            duration: 2000
          });
          setTimeout(() => {
            window.location.href = '/login'; //window.location.href);
          }, 1500);
          setLoading(false);
          return;
        }
        
        user = await supabase.auth.getUser().then(r => r.data.user);
        setCurrentUser(user);
        
        // 🔍 מנהלים כלליים תמיד מקבלים גישה
        if (user.role === 'admin') {
          console.log('✅ משתמש מנהל - גישה מלאה');
        } else {
          // 🆕 בדוק אם המשתמש שייך למשחק
          const gameParticipants = await db.GameParticipant.filter({
            game_id: currentGame.id,
            user_email: user.email
          }, null, 1);
          
          console.log('🔍 GameParticipant למשתמש:', gameParticipants);
          
          // אם לא שייך למשחק → הפנה להצטרפות
          if (gameParticipants.length === 0) {
            toast({
              title: "נדרשת הצטרפות",
              description: "מעביר אותך לדף הצטרפות למשחק...",
              className: "bg-cyan-900/30 border-cyan-500 text-cyan-200",
              duration: 2000
            });
            setTimeout(() => {
              window.location.href = createPageUrl("JoinGame") + `?gameId=${currentGame.id}`;
            }, 1500);
            setLoading(false);
            return;
          }
          
          // בדוק תפקיד במשחק
          const participant = gameParticipants[0];
          console.log('👤 תפקיד במשחק:', participant.role_in_game);
          
          // רק צופים לא יכולים למלא ניחושים
          if (participant.role_in_game === 'viewer') {
            toast({
              title: "אין הרשאה למילוי ניחושים",
              description: "התפקיד שלך במשחק הוא 'צופה' - אין אפשרות למלא ניחושים",
              variant: "destructive",
              duration: 2000
            });
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error("Authentication error:", e);
        toast({
          title: "שגיאת התחברות",
          description: "אנא התחבר למערכת",
          variant: "destructive",
          duration: 2000
        });
        setTimeout(() => {
          window.location.href = '/login'; //window.location.href);
        }, 1500);
        setLoading(false);
        return;
      }

      // טען סטטוס נעילה
      const settings = await db.SystemSettings.filter({ setting_key: "prediction_form_status" }, null, 1);
      if (settings.length > 0) {
        setIsFormLocked(settings[0].setting_value === "locked");
      } else {
        // Default to locked if setting not found
        setIsFormLocked(true);
      }

      // Changed: filter questions by game_id
      const loadedQuestions = await db.Question.filter({ game_id: currentGame.id }, "-created_date", 5000);
      
      // 🔥 סינון שאלות T1 - לא להציג בטופס ניחושים!
      const filteredQuestions = loadedQuestions.filter(q => q.table_id !== 'T1');
      console.log(`📋 סוננו ${loadedQuestions.length - filteredQuestions.length} שאלות T1`);
      setAllQuestions(filteredQuestions);

      // 🔥 טען ניחושים קיימים של המשתמש
      const userPredictions = await db.Prediction.filter({
        game_id: currentGame.id,
        participant_name: user.full_name
      }, '-created_date', 5000);

      console.log('📥 נטענו ניחושים קיימים:', userPredictions.length);

      // מיפוי הניחושים לפי question_id - רק את האחרון של כל שאלה
      const predictionsByQuestion = {};
      userPredictions.forEach(pred => {
        if (!predictionsByQuestion[pred.question_id] || 
            new Date(pred.created_date) > new Date(predictionsByQuestion[pred.question_id].created_date)) {
          predictionsByQuestion[pred.question_id] = pred;
        }
      });

      const loadedPredictions = {};
      const loadedDetails = {};

      Object.values(predictionsByQuestion).forEach(pred => {
        const question = filteredQuestions.find(q => q.id === pred.question_id);

        if (pred.text_prediction) {
          // אם זה ניחוש של משחק עם תוצאה
          if (pred.home_prediction !== undefined && pred.away_prediction !== undefined) {
            loadedPredictions[pred.question_id] = `${pred.home_prediction}-${pred.away_prediction}`;
          } else {
            loadedPredictions[pred.question_id] = pred.text_prediction;
          }
        }

        // אם זה פרט משתתף (T1)
        if (question?.table_id === 'T1' || pred.question_id.startsWith('temp_')) {
          loadedDetails[pred.question_id] = pred.text_prediction;
        }
      });

      console.log('✅ הועלו ניחושים:', Object.keys(loadedPredictions).length);
      setPredictions(loadedPredictions);
      setParticipantDetails(loadedDetails);
      
      // New: Load teams and validation lists from currentGame
      const teamsData = currentGame.teams_data || [];
      const validationListsData = currentGame.validation_lists || [];
      
      const teamsMap = teamsData.reduce((acc, team) => { acc[team.name] = team; return acc; }, {});
      setTeams(teamsMap);

      const listsMap = validationListsData.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {});
      setValidationLists(listsMap);

      const rTables = {}, sTables = {};
      filteredQuestions.forEach(q => {
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
        
        // 🎯 שימוש ב-stage_name בתור מזהה ייחודי לבתים
        let tableId = q.table_id; // Default to q.table_id
        let tableDescription = q.table_description; // Default to q.table_description
        
        // אם זה משחק בתים - קבץ לפי stage_name
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
        } else if (q.table_id === 'T20') { // Added T20 description
          tableDescription = 'המסלול "הישראלי" - פצצת אנרגיה (אירופית) צהובה';
        }
        
        if (!tableCollection[tableId]) { // Use modified tableId
          tableCollection[tableId] = {
            id: tableId, // Use modified tableId
            description: tableDescription || (q.home_team && q.away_team ? `מחזור ${tableId.replace('T','')}` : `שאלות ${tableId.replace('T','')}`),
            questions: []
          };
        }
        tableCollection[tableId].questions.push(q);
      });

      const t20Table = rTables['T20'];
      delete rTables['T20'];
      setIsraeliTable(t20Table || null);

      // 🔥 שדות פרטי משתתף קבועים - תמיד!
      const defaultQuestions = [
        { id: 'temp_name', question_text: 'שם מלא', table_id: 'T1' },
        { id: 'temp_email', question_text: 'אימייל', table_id: 'T1' },
        { id: 'temp_phone', question_text: 'טלפון', table_id: 'T1' },
        { id: 'temp_profession', question_text: 'מקצוע', table_id: 'T1' },
        { id: 'temp_age', question_text: 'גיל', table_id: 'T1' }
      ];
      setParticipantQuestions(defaultQuestions);
      
      delete sTables['T1'];

      // 🆕 Extract T19 (playoffWinnersTable)
      const t19Table = sTables['T19'];
      delete sTables['T19'];
      setPlayoffWinnersTable(t19Table || null);

      // 🔄 מיון טבלאות המחזורים - בתים יופיעו ראשונים
      const sortedRoundTables = Object.values(rTables).sort((a,b) => {
        const aIsGroup = a.id.includes('בית');
        const bIsGroup = b.id.includes('בית');
        
        if (aIsGroup && !bIsGroup) return -1; // 'בית' tables come first
        if (!aIsGroup && bIsGroup) return 1; // 'בית' tables come first
        
        if (aIsGroup && bIsGroup) {
          return a.id.localeCompare(b.id, 'he'); // Sort Hebrew group names alphabetically
        }
        
        const aNum = parseInt(a.id.replace('T','').replace(/\D/g,'')) || 0; // Handle T-prefixed numbers
        const bNum = parseInt(b.id.replace('T','').replace(/\D/g,'')) || 0;
        return aNum - bNum;
      });
      setRoundTables(sortedRoundTables);

      const locationTableIds = ['T9', 'T14', 'T15', 'T16', 'T17'];
      const locationGroup = Object.values(sTables)
          .filter(table => locationTableIds.includes(table.id))
          .sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0));
      setLocationTables(locationGroup);

      const allSpecialTables = Object.values(sTables).filter(table => {
          const desc = table.description?.trim();
          // 🔥 סינון T1, T19, T9 וטבלאות בתים - אבל לא אם יש stage_order גבוה (שלבים מיוחדים)
          const isGroupTable = (table.id.includes('בית') || desc?.includes('בית')) && !table.questions[0]?.stage_order; // רק אם אין stage_order
          const isParticipantTable = table.id === 'T1';
          const isT9 = table.id === 'T9'; // T9 היא טבלת מיקומים
          return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && table.id !== 'T19' && !isGroupTable && !isParticipantTable && !isT9;
      }).sort((a,b) => {
        // 🔥 מיון לפי stage_order ראשית, ואז לפי מספר שלב
        const orderA = a.questions[0]?.stage_order || 999;
        const orderB = b.questions[0]?.stage_order || 999;
        if (orderA !== orderB) return orderA - orderB;
        return (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0);
      });
      
      setSpecialTables(allSpecialTables);

      if (user && user.full_name) {
        setParticipantName(user.full_name);
        setParticipantDetails(prev => ({ ...prev, 'temp_name': user.full_name }));
      }
      
    } catch (error) {
      console.error("שגיאה בטעינת הנתונים:", error);
      toast({ title: "שגיאה", description: "טעינת הנתונים נכשלה.", variant: "destructive", duration: 2000 });
    }
    setLoading(false);
  }, [toast, currentGame]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 🔥 עדכון קבוצות שנבחרו בטבלאות מיקומים T9, T14-T17
  useEffect(() => {
    const mainLocationTableIds = ['T9', '9', 'T14', 'T15', 'T16', 'T17'];
    const allLocationQuestions = locationTables.flatMap(t => t.questions).filter(q => mainLocationTableIds.includes(q.table_id));

    const selected = new Set();
    allLocationQuestions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction && prediction.trim() !== '' && prediction !== '__CLEAR__') {
        selected.add(prediction);
      }
    });

    setSelectedLocationTeams(selected);
  }, [predictions, locationTables]);

  // 🔥 עדכון קבוצות שנבחרו ב-T19 (8 קבוצות) - בנפרד לגמרי!
  useEffect(() => {
    if (!playoffWinnersTable) return;
    
    const selected = new Set();
    playoffWinnersTable.questions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction && prediction.trim() !== '' && prediction !== '__CLEAR__') {
        selected.add(prediction);
      }
    });

    setSelectedPlayoffTeams(selected);
  }, [predictions, playoffWinnersTable]);

  // 🔥 עדכון קבוצות שנבחרו ב-T_TOP_FINISHERS + T_THIRD_PLACE (בדיוק כמו שלב המיקומים)
  useEffect(() => {
    const topFinishersQuestions = specialTables
      .flatMap(t => t.questions)
      .filter(q => (q.table_id === 'T_TOP_FINISHERS' || q.table_id === 'T_THIRD_PLACE') && !q.question_id.includes('.'));
    
    const selected = new Set();
    topFinishersQuestions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction && prediction.trim() !== '' && prediction !== '__CLEAR__') {
        selected.add(prediction);
      }
    });

    setSelectedTopFinishersAndThirdTeams(selected);
  }, [predictions, specialTables]);

  // 🔥 ספירת תשובות כן/לא בתתי שאלות מקום שלישי
  useEffect(() => {
    const thirdPlaceSubQuestions = specialTables
      .flatMap(t => t.questions)
      .filter(q => q.table_id === 'T_THIRD_PLACE' && q.question_id.includes('.'));
    
    let yesCount = 0;
    let noCount = 0;
    
    thirdPlaceSubQuestions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction === 'כן') yesCount++;
      if (prediction === 'לא') noCount++;
    });

    setThirdPlaceYesCount(yesCount);
    setThirdPlaceNoCount(noCount);
  }, [predictions, specialTables]);

  // 🔥 עדכון נבחרות שנבחרו בשלב 11 (רבע גמר) - זיהוי לפי תיאור השלב
  useEffect(() => {
    // חפש שאלות שהשלב שלהן מכיל "רבע גמר"
    const t11Questions = allQuestions.filter(q => 
      q.table_id === 'T11' || 
      q.table_id === '11' ||
      q.stage_name?.includes('רבע גמר') ||
      q.table_description?.includes('רבע גמר')
    );
    
    const selected = new Set();
    t11Questions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction && prediction.trim() !== '' && prediction !== '__CLEAR__') {
        selected.add(prediction);
      }
    });

    console.log('🔍 Stage 11 (רבע גמר) - total questions:', t11Questions.length, 'selected teams:', Array.from(selected));
    setSelectedT11Teams(selected);
  }, [predictions, allQuestions]);

  // 🔥 עדכון נבחרות שנבחרו בשלב 12 (חצי גמר) - זיהוי לפי תיאור השלב
  useEffect(() => {
    // חפש שאלות שהשלב שלהן מכיל "חצי גמר"
    const t12Questions = allQuestions.filter(q => 
      q.table_id === 'T12' || 
      q.table_id === '12' ||
      q.stage_name?.includes('חצי גמר') ||
      q.table_description?.includes('חצי גמר')
    );
    
    const selected = new Set();
    t12Questions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction && prediction.trim() !== '' && prediction !== '__CLEAR__') {
        selected.add(prediction);
      }
    });

    console.log('🔍 Stage 12 (חצי גמר) - total questions:', t12Questions.length, 'selected teams:', Array.from(selected));
    setSelectedT12Teams(selected);
  }, [predictions, allQuestions]);

  // 🔥 עדכון נבחרות שנבחרו בשלב 13 (גמר) - זיהוי לפי תיאור השלב
  useEffect(() => {
    // חפש שאלות שהשלב שלהן מכיל "גמר" אבל לא "רבע גמר" או "חצי גמר"
    const t13Questions = allQuestions.filter(q => {
      const stageName = q.stage_name || '';
      const tableDesc = q.table_description || '';
      
      return (
        q.table_id === 'T13' || 
        q.table_id === '13' ||
        (stageName.includes('גמר') && !stageName.includes('רבע') && !stageName.includes('חצי')) ||
        (tableDesc.includes('גמר') && !tableDesc.includes('רבע') && !tableDesc.includes('חצי'))
      );
    });
    
    const selected = new Set();
    t13Questions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction && prediction.trim() !== '' && prediction !== '__CLEAR__') {
        selected.add(prediction);
      }
    });

    console.log('🔍 Stage 13 (גמר) - total questions:', t13Questions.length, 'selected teams:', Array.from(selected));
    setSelectedT13Teams(selected);
  }, [predictions, allQuestions]);

  const toggleFormLock = async () => {
    try {
      const settings = await db.SystemSettings.filter({ setting_key: "prediction_form_status" }, null, 1);
          const newStatus = isFormLocked ? "open" : "locked";

          if (settings.length > 0) {
            await db.SystemSettings.update(settings[0].id, {
              setting_value: newStatus
            });
          } else {
            await db.SystemSettings.create({
              setting_key: "prediction_form_status",
              setting_value: newStatus,
              description: "סטטוס טופס מילוי ניחושים"
            });
          }
      
      setIsFormLocked(!isFormLocked);
      toast({
        title: isFormLocked ? "הטופס נפתח!" : "הטופס ננעל!",
        description: isFormLocked ? "משתתפים יכולים למלא ניחושים" : "הטופס נעול למילוי"
      });
    } catch (error) {
      console.error("Error toggling lock:", error);
      toast({ title: "שגיאה", description: "עדכון הסטטוס נכשל", variant: "destructive" });
    }
  };

  const handlePredictionChange = (questionId, value) => {
    // אם זה __CLEAR__ - מסמן כמחוק (מחרוזת ריקה)
    setPredictions(prev => ({ ...prev, [questionId]: value === "__CLEAR__" ? "" : value }));
  };
  
  const handleDetailsChange = (questionId, value) => {
    const nameQuestion = participantQuestions.find(q => q.question_text?.includes("שם"));
    if (nameQuestion && nameQuestion.id === questionId) {
      setParticipantName(value);
    }
    setParticipantDetails(prev => ({ ...prev, [questionId]: value }));
  };

  const saveAllPredictions = async () => {
    // בדיקה אם המשחק נעול
    if (currentGame?.status === 'locked' && !isAdmin) {
      toast({
        title: "המשחק נעול",
        description: "לא ניתן לשמור ניחושים במשחק נעול",
        variant: "destructive",
        duration: 2000
      });
      return;
    }
    
    if (!participantName.trim()) {
      toast({ title: "שגיאה", description: "נא למלא שם בפרטי המשתתף.", variant: "destructive", duration: 2000 });
      return;
    }

    setSaving(true);
    try {
      // 🔥 שלב 1: טען את כל הניחושים הקיימים
      const existingPredictions = await db.Prediction.filter({
        game_id: currentGame.id,
        participant_name: participantName.trim()
      }, null, 5000);
      
      const existingMap = {};
      existingPredictions.forEach(p => {
        existingMap[p.question_id] = p;
      });
      
      const allPredictionsToSave = [];
      const predictionsToDelete = [];

      // 🔥 תחילה - עבור על כל הניחושים הקיימים ובדוק אם יש להם ערך חדש
      Object.values(existingMap).forEach(existingPred => {
        const questionId = existingPred.question_id;

        // בדוק אם זה פרט משתתף או ניחוש משחק
        const isParticipantDetail = participantDetails.hasOwnProperty(questionId);
        const isPrediction = predictions.hasOwnProperty(questionId);

        if (isParticipantDetail) {
          const value = participantDetails[questionId];
          const hasValue = value && String(value).trim() && String(value).trim() !== '__CLEAR__';
          if (!hasValue) {
            predictionsToDelete.push(existingPred.id);
          }
        } else if (isPrediction) {
          const value = predictions[questionId];
          const hasValue = value && String(value).trim() && String(value).trim() !== '__CLEAR__';
          if (!hasValue) {
            predictionsToDelete.push(existingPred.id);
          }
        }
      });

      // פרטי משתתף - שמור רק את אלו שיש להם ערך
      Object.entries(participantDetails).forEach(([questionId, value]) => {
        const hasValue = value && String(value).trim() && String(value).trim() !== '__CLEAR__';

        if (hasValue) {
          allPredictionsToSave.push({
            question_id: questionId,
            participant_name: participantName.trim(),
            text_prediction: String(value).trim(),
            game_id: currentGame.id,
          });
        }
      });

      // ניחושי משחקים - שמור רק את אלו שיש להם ערך
      Object.entries(predictions).forEach(([questionId, value]) => {
         const hasValue = value && String(value).trim() && String(value).trim() !== '__CLEAR__';

         if (hasValue) {
           const predictionData = {
              question_id: questionId,
              participant_name: participantName.trim(),
              text_prediction: String(value).trim(),
              game_id: currentGame.id,
           };
           const parts = String(value).split('-');
           if(parts.length === 2) {
              const home = parseInt(parts[0], 10);
              const away = parseInt(parts[1], 10);
              if(!isNaN(home) && !isNaN(away)){
                predictionData.home_prediction = home;
                predictionData.away_prediction = away;
              }
           }
           allPredictionsToSave.push(predictionData);
         }
      });
      
      // 🔥 שלב 2: מחק ניחושים שהוסרו
      for (const id of predictionsToDelete) {
        await db.Prediction.delete(id);
      }
      
      // 🔥 שלב 3: שמור ניחושים חדשים
      if (allPredictionsToSave.length > 0) {
        await db.Prediction.bulkCreate(allPredictionsToSave);
      }
      
      const totalChanges = allPredictionsToSave.length + predictionsToDelete.length;
      if (totalChanges > 0) {
        toast({
          title: "נשמר בהצלחה!",
          description: `נשמרו ${allPredictionsToSave.length} ניחושים, נמחקו ${predictionsToDelete.length}.`,
          className: "bg-green-100 text-green-800",
          duration: 2000
        });
      } else {
        toast({ title: "אין שינויים", description: "לא בוצעו שינויים.", variant: "warning", duration: 2000 });
      }
    } catch (error) {
      console.error("Error saving predictions:", error);
      toast({ title: "שגיאה", description: "שמירת הניחושים נכשלה.", variant: "destructive", duration: 2000 });
    }
    setSaving(false);
  };
  
  const toggleSection = (sectionId) => {
    setOpenSections(prev => ({...prev, [sectionId]: !prev[sectionId]}));
  };

  const renderSelectWithLogos = (question, value, onChange, customWidth = "w-[180px]") => {
    const options = validationLists[question.validation_list] || [];
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ');
    const isNationalTeams = question.validation_list?.toLowerCase().includes('נבחר');

    // 🔍 בדיקה אם זו שאלת מיקום ב-T9, T14-T17
    const isLocationQuestion = ['T9', '9', 'T14', 'T15', 'T16', 'T17'].includes(question.table_id);
    
    // 🆕 בדיקה אם זו שאלה ב-T19
    const isPlayoffWinnersQuestion = question.table_id === 'T19';
    
    // 🔥 בדיקות לשלבים 11-13 - זיהוי גם לפי שם/תיאור השלב
    const isT11Question = question.table_id === 'T11' || 
                          question.table_id === '11' || 
                          question.stage_name?.includes('רבע גמר') || 
                          question.table_description?.includes('רבע גמר');
                          
    const isT12Question = question.table_id === 'T12' || 
                          question.table_id === '12' || 
                          question.stage_name?.includes('חצי גמר') || 
                          question.table_description?.includes('חצי גמר');
                          
    const isT13Question = question.table_id === 'T13' || 
                          question.table_id === '13' || 
                          (question.stage_name?.includes('גמר') && !question.stage_name?.includes('רבע') && !question.stage_name?.includes('חצי')) ||
                          (question.table_description?.includes('גמר') && !question.table_description?.includes('רבע') && !question.table_description?.includes('חצי'));
    
    // 🔥 בדיקות למניעת כפילויות בשלבי ראש בית/סגנית/מקום 3
    const isTopFinishersQuestion = question.table_id === 'T_TOP_FINISHERS';
    const isThirdPlaceQuestion = question.table_id === 'T_THIRD_PLACE' && !question.question_id.includes('.');
    
    // 🔥 בדיקה אם זו תת-שאלה של מקום שלישי
    const isThirdPlaceSubQuestion = question.table_id === 'T_THIRD_PLACE' && question.question_id.includes('.');

    // 🔥 נקה ערכים לא תקינים - NULL, null-null, וכו'
    const cleanValue = (!value || value === 'null' || value === 'undefined' || value.toLowerCase?.().includes('null')) ? '__CLEAR__' : value;

    return (
      <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <Select value={cleanValue} onValueChange={onChange}>
          <SelectTrigger className={customWidth} style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            color: '#f8fafc',
          }}>
            <SelectValue placeholder="בחר...">
              {cleanValue && cleanValue !== "__CLEAR__" ? (
                <div className="flex items-center gap-2">
                  {(isTeamsList || isNationalTeams) && teams[cleanValue]?.logo_url && (
                    <img 
                      src={teams[cleanValue].logo_url} 
                      alt={cleanValue} 
                      className="w-5 h-5 rounded-full inline-block" 
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                  <span>{cleanValue}</span>
                </div>
              ) : 'בחר...'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent style={{
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            color: '#f8fafc',
            backdropFilter: 'blur(5px)'
          }}>
            <SelectItem value="__CLEAR__" style={{ color: '#94a3b8' }} className="hover:bg-cyan-900/30">
              &nbsp;
            </SelectItem>
            {options.map(opt => {
              const team = (isTeamsList || isNationalTeams) ? teams[opt] : null;
              
              let isAlreadySelected = false;
              let isDisabled = false;
              
              // 🔍 בדיקה אם הקבוצה כבר נבחרה בטבלאות מיקומים
              if (isLocationQuestion && selectedLocationTeams.has(opt) && value !== opt) {
                isAlreadySelected = true;
              }
              
              // 🆕 בדיקה אם הקבוצה כבר נבחרה ב-T19
              if (isPlayoffWinnersQuestion && selectedPlayoffTeams.has(opt) && value !== opt) {
                isAlreadySelected = true;
              }
              
              // 🔥 בדיקה אם הקבוצה כבר נבחרה ב-T11
              if (isT11Question && selectedT11Teams.has(opt) && value !== opt) {
                isAlreadySelected = true;
              }
              
              // 🔥 בדיקה אם הקבוצה כבר נבחרה ב-T12
              if (isT12Question && selectedT12Teams.has(opt) && value !== opt) {
                isAlreadySelected = true;
              }
              
              // 🔥 בדיקה אם הקבוצה כבר נבחרה ב-T13
              if (isT13Question && selectedT13Teams.has(opt) && value !== opt) {
                isAlreadySelected = true;
              }
              
              // 🔥 חלץ את הבית מהשאלה הנוכחית
              const groupMatch = question.validation_list?.match(/בית\s+([א-ת]'?)/);
              const currentGroup = groupMatch ? groupMatch[0] : null;
              
              // 🔥 בדיקה לראש בית/סגנית/מקום 3 - בדיוק כמו שלב המיקומים!
              if ((isTopFinishersQuestion || isThirdPlaceQuestion) && 
                  selectedTopFinishersAndThirdTeams.has(opt) && 
                  value !== opt) {
                isAlreadySelected = true;
              }
              
              // 🔥 בדיקה מיוחדת לתתי שאלות מקום שלישי
              if (isThirdPlaceSubQuestion) {
                // אם מולאו 4 כן - נעל את "כן"
                if (opt === 'כן' && thirdPlaceYesCount >= 4 && value !== 'כן') {
                  isDisabled = true;
                }
                // אם מולאו 2 לא - נעל את "לא"
                if (opt === 'לא' && thirdPlaceNoCount >= 2 && value !== 'לא') {
                  isDisabled = true;
                }
              }

              return (
                <SelectItem 
                  key={opt} 
                  value={opt} 
                  className="hover:bg-cyan-900/30"
                  disabled={isAlreadySelected || isDisabled}
                  style={{
                    opacity: (isAlreadySelected || isDisabled) ? 0.4 : 1,
                    cursor: (isAlreadySelected || isDisabled) ? 'not-allowed' : 'pointer'
                  }}
                >
                  <div className={`flex items-center gap-2 ${(isTeamsList || isNationalTeams) ? 'pl-2' : ''}`} style={(isTeamsList || isNationalTeams) ? { justifyContent: 'flex-start' } : {}}>
                    {team?.logo_url && (
                      <img 
                        src={team.logo_url} 
                        alt={opt} 
                        className="w-5 h-5 rounded-full flex-shrink-0" 
                        onError={(e) => e.target.style.display = 'none'}
                        style={{ opacity: (isAlreadySelected || isDisabled) ? 0.4 : 1 }}
                      />
                    )}
                    <span style={{ color: (isAlreadySelected || isDisabled) ? '#64748b' : '#f8fafc' }}>{opt}</span>
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
          <div className="space-y-3">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;

              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              
              return (
                <div 
                  key={main.id} 
                  style={{
                    display: 'grid',
                    gridTemplateColumns: sortedSubs.length > 0 ? '60px 180px 140px 60px 180px 140px auto' : '60px 1fr 180px auto',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid rgba(6, 182, 212, 0.1)',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  className="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                >
                  {/* שאלה ראשית */}
                  <Badge variant="outline" style={{
                    borderColor: 'rgba(6, 182, 212, 0.5)',
                    color: '#06b6d4',
                    minWidth: '50px'
                  }} className="justify-center">
                    {main.question_id}
                  </Badge>
                  <span className="font-medium text-sm" style={{ color: '#94a3b8' }}>
                    {main.question_text}
                  </span>
                  <span>
                    {renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[120px]")}
                  </span>

                  {/* תת-שאלות */}
                  {sortedSubs.length > 0 && sortedSubs.map(sub => (
                    <React.Fragment key={sub.id}>
                      <Badge variant="outline" style={{
                        borderColor: 'rgba(6, 182, 212, 0.5)',
                        color: '#06b6d4',
                        minWidth: '45px'
                      }} className="justify-center">
                        {sub.question_id}
                      </Badge>
                      <span className="font-medium text-sm" style={{ color: '#94a3b8' }}>
                        {sub.question_text}
                      </span>
                      <span>
                        {renderSelectWithLogos(sub, predictions[sub.id] || "", (val) => handlePredictionChange(sub.id, val), "w-[120px]")}
                      </span>
                    </React.Fragment>
                  ))}
                  
                  {main.possible_points && (
                    <Badge variant="outline" className="text-xs px-2 py-1 justify-self-end" style={{
                      borderColor: 'rgba(6, 182, 212, 0.5)',
                      color: '#06b6d4',
                      background: 'rgba(6, 182, 212, 0.1)',
                      minWidth: '50px'
                    }}>
                      {main.possible_points} נק'
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
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
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                    {renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{main.possible_points || 0}</Badge>
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
                      borderRadius: '6px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(6, 182, 212, 0.1)'
                    }}
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{main.question_text}</span>
                    {renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{main.possible_points || 0}</Badge>
                    
                    <div></div>
                    
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sortedSubs[0].question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100">{sortedSubs[0].question_text}</span>
                    {renderSelectWithLogos(sortedSubs[0], predictions[sortedSubs[0].id] || "", (val) => handlePredictionChange(sortedSubs[0].id, val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{sortedSubs[0].possible_points || 0}</Badge>
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
                  <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                  <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                  {renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[140px]")}
                  <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{main.possible_points || 0}</Badge>
                  
                  {sortedSubs.map(sub => (
                    <React.Fragment key={sub.id}>
                      <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sub.question_id}</Badge>
                      <span className="text-right font-medium text-sm text-blue-100 truncate">{sub.question_text}</span>
                      {renderSelectWithLogos(sub, predictions[sub.id] || "", (val) => handlePredictionChange(sub.id, val), "w-[140px]")}
                      <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{sub.possible_points || 0}</Badge>
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
    const isT10 = table.description.includes('T10') || table.id === 'T10';
    const isTopFinishers = table.id === 'T_TOP_FINISHERS';
    const isThirdPlace = table.id === 'T_THIRD_PLACE';

    if (isTopFinishers || isThirdPlace) {
      return renderTopFinishersOrThirdPlace(table);
    }

    if (isT10) {
      return renderT10Questions(table);
    }

    // 🔥 קיבוץ שאלות עם תת-שאלות
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
          <div className="space-y-3">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;

              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));

              // 🔥 אם יש תת-שאלות - הצג הכל באותה שורה עם grid מסודר
              if (sortedSubs.length > 0) {
                const gridCols = sortedSubs.length === 1 
                  ? '50px minmax(250px, 2fr) 140px 50px 1fr 50px minmax(180px, 1.5fr) 140px 50px'
                  : sortedSubs.length === 2
                  ? '50px 150px 140px 50px 1fr 50px 150px 140px 50px 50px 150px 140px 50px'
                  : '50px 1fr auto';

                return (
                  <div 
                    key={main.id} 
                    style={{
                      display: 'grid',
                      gridTemplateColumns: gridCols,
                      gap: '8px',
                      alignItems: 'center',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(6, 182, 212, 0.1)',
                      transition: 'all 0.2s ease-in-out'
                    }}
                    className="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                  >
                    {/* שאלה ראשית */}
                    <Badge variant="outline" style={{
                      borderColor: 'rgba(6, 182, 212, 0.5)',
                      color: '#06b6d4'
                    }} className="justify-center text-xs">
                      {main.question_id}
                    </Badge>
                    <span className="font-medium text-xs" style={{ color: '#94a3b8' }}>
                      {main.question_text}
                    </span>
                    <span>
                      {main.validation_list && validationLists[main.validation_list] ? 
                        renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[130px]") :
                        <Input
                          value={predictions[main.id] || ""}
                          onChange={(e) => handlePredictionChange(main.id, e.target.value)}
                          className="h-8 text-xs"
                          placeholder="הזן תשובה..."
                          style={{
                            background: 'rgba(15, 23, 42, 0.6)',
                            border: '1px solid rgba(6, 182, 212, 0.2)',
                            color: '#f8fafc',
                            width: '130px'
                          }}
                        />
                      }
                    </span>
                    {main.possible_points && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0.5" style={{
                        borderColor: 'rgba(6, 182, 212, 0.5)',
                        color: '#06b6d4',
                        background: 'rgba(6, 182, 212, 0.1)'
                      }}>
                        {main.possible_points}
                      </Badge>
                    )}
                    
                    <div></div>

                    {/* תת-שאלות */}
                    {sortedSubs.map(sub => (
                      <React.Fragment key={sub.id}>
                        <Badge variant="outline" style={{
                          borderColor: 'rgba(6, 182, 212, 0.5)',
                          color: '#06b6d4'
                        }} className="justify-center text-xs">
                          {sub.question_id}
                        </Badge>
                        <span className="font-medium text-xs" style={{ color: '#94a3b8' }}>
                          {sub.question_text}
                        </span>
                        <span>
                          {sub.validation_list && validationLists[sub.validation_list] ? 
                            renderSelectWithLogos(sub, predictions[sub.id] || "", (val) => handlePredictionChange(sub.id, val), "w-[130px]") :
                            <Input
                              value={predictions[sub.id] || ""}
                              onChange={(e) => handlePredictionChange(sub.id, e.target.value)}
                              className="h-8 text-xs"
                              placeholder="הזן תשובה..."
                              style={{
                                background: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid rgba(6, 182, 212, 0.2)',
                                color: '#f8fafc',
                                width: '130px'
                              }}
                            />
                          }
                        </span>
                        {sub.possible_points && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5" style={{
                            borderColor: 'rgba(6, 182, 212, 0.5)',
                            color: '#06b6d4',
                            background: 'rgba(6, 182, 212, 0.1)'
                          }}>
                            {sub.possible_points}
                          </Badge>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                );
              }

              // 🔥 שאלה ללא תת-שאלות
              return (
                <div 
                  key={main.id} 
                  style={{ 
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 180px auto',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid rgba(6, 182, 212, 0.1)',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  className="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                >
                  <Badge variant="outline" style={{
                    borderColor: 'rgba(6, 182, 212, 0.5)',
                    color: '#06b6d4',
                    minWidth: '50px'
                  }} className="justify-center">
                    {main.question_id}
                  </Badge>
                  <span className="font-medium text-sm" style={{ color: '#94a3b8' }}>{main.question_text}</span>
                  <div>
                    {main.validation_list && validationLists[main.validation_list] ? 
                      renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[180px]") :
                      <Input
                        value={predictions[main.id] || ""}
                        onChange={(e) => handlePredictionChange(main.id, e.target.value)}
                        className="h-9"
                        placeholder="הזן תשובה..."
                        style={{
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid rgba(6, 182, 212, 0.2)',
                          color: '#f8fafc'
                        }}
                      />
                    }
                  </div>
                  {main.possible_points && (
                    <Badge variant="outline" className="text-xs px-2 py-1 justify-self-end" style={{
                      borderColor: 'rgba(6, 182, 212, 0.5)',
                      color: '#06b6d4',
                      background: 'rgba(6, 182, 212, 0.1)',
                      minWidth: '50px'
                    }}>
                      {main.possible_points} נק'
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        minHeight: '100vh'
      }}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
        <span className="text-blue-600">טוען נתונים...</span>
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin';
  const isGameLocked = currentGame?.status === 'locked';

  // אם הטופס נעול והמשתמש לא מנהל - הצג הודעה ברורה
  if ((isFormLocked || isGameLocked) && !isAdmin) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-6" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        minHeight: '100vh'
      }}>
        <Card style={{ 
          background: 'rgba(30, 41, 59, 0.8)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          maxWidth: '600px',
          boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)'
        }}>
          <CardHeader>
            <div className="flex items-center gap-3 justify-center">
              <Lock className="w-8 h-8" style={{ color: '#ef4444' }} />
              <CardTitle className="text-2xl" style={{ color: '#ef4444' }}>
                מילוי ניחושים נעול
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-lg" style={{ color: '#fca5a5' }}>
              {isGameLocked 
                ? "המשחק נעול - לא ניתן למלא ניחושים"
                : "מילוי הניחושים נעול כרגע על ידי מנהל המערכת"}
            </p>
            <p style={{ color: '#94a3b8' }}>
              {isGameLocked
                ? "ניתן לצפות בניחושים ובתוצאות, אך לא למלא ניחושים חדשים"
                : "אנא פנה למנהל המערכת לקבלת הרשאת גישה"}
            </p>
            <Alert style={{ 
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              textAlign: 'right'
            }}>
              <AlertDescription style={{ color: '#06b6d4' }}>
                💡 <strong>למה הטופס נעול?</strong>
                <br />
                הטופס נעול בדרך כלל לפני תחילת התחרות או לאחר המועד האחרון למילוי ניחושים.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allButtons = [];

  if (roundTables.length > 0) {
    // בדוק אם כל הטבלאות הן בתים
    const allAreGroups = roundTables.every(table => 
      table.id.includes('בית') || table.description?.includes('בית')
    );
    
    const firstRoundTableId = roundTables[0]?.id || 'T2'; 
    allButtons.push({
      numericId: parseInt(firstRoundTableId.replace('T', '').replace(/\D/g, ''), 10),
      key: 'rounds',
      description: allAreGroups ? 'שלב הבתים' : 'מחזורי המשחקים',
      sectionKey: 'rounds'
    });
  }

  specialTables.forEach(table => {
    allButtons.push({
      numericId: table.questions[0]?.stage_order || parseInt(table.id.replace('T', ''), 10), // 🔥 שימוש ב-stage_order
      key: table.id,
      description: table.description,
      sectionKey: table.id
    });
  });

  if (locationTables.length > 0) {
    const firstLocationTableId = locationTables[0]?.id || 'T14';
    allButtons.push({
      numericId: parseInt(firstLocationTableId.replace('T', ''), 10),
      key: 'locations',
      description: 'מיקומים בתום שלב הבתים',
      sectionKey: 'locations'
    });
  }

  if (israeliTable) {
    allButtons.push({
      numericId: parseInt(israeliTable.id.replace('T', ''), 10),
      key: israeliTable.id,
      description: israeliTable.description,
      sectionKey: 'israeli'
    });
  }

  // 🆕 Add button for T19 (playoffWinnersTable)
  if (playoffWinnersTable) {
    allButtons.push({
      numericId: parseInt(playoffWinnersTable.id.replace('T', ''), 10),
      key: playoffWinnersTable.id,
      description: playoffWinnersTable.description,
      sectionKey: 'playoffWinners' 
    });
  }

  // Sort by numericId - this ensures correct order (rounds first, then by table number)
  allButtons.sort((a, b) => {
    if (a.sectionKey === 'rounds' && b.sectionKey !== 'rounds') return -1;
    if (b.sectionKey === 'rounds' && a.sectionKey !== 'rounds') return 1;

    return a.numericId - b.numericId;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      minHeight: '100vh'
    }}>
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3 drop-shadow-lg" style={{ 
              color: '#f8fafc',
              textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
            }}>
              <Trophy className="w-8 h-8" style={{ color: '#06b6d4' }} />
              מילוי ניחושים
            </h1>
            <p style={{ color: '#94a3b8' }}>מלא את פרטיך ובחר שלב למילוי הניחושים.</p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <Button
              onClick={toggleFormLock}
              variant={isFormLocked ? "destructive" : "default"}
              className={`h-12 px-4 py-2 ${isFormLocked ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} text-white`}
            >
              {isFormLocked ? (
                <>
                  <Lock className="w-5 h-5 ml-2" />
                  נעול - לחץ לפתיחה
                </>
              ) : (
                <>
                  <Unlock className="w-5 h-5 ml-2" />
                  פתוח - לחץ לנעילה
                </>
              )}
            </Button>
          )}
          <Button onClick={saveAllPredictions} disabled={saving} size="lg" style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
            boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
          }} className="text-white hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]">
            {saving ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Save className="w-5 h-5 ml-2" />}
            {saving ? "שומר..." : "שמור הכל"}
          </Button>
        </div>
      </div>

      {participantQuestions.length === 0 && roundTables.length === 0 && specialTables.length === 0 && locationTables.length === 0 && !israeliTable && !playoffWinnersTable ? (
        <Alert style={{ 
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5'
        }}>
          <FileText className="w-4 h-4" />
          <AlertDescription>
            לא נמצאו שאלות במערכת עבור המשחק הנבחר. אנא העלה קבצים תחילה בעמוד "העלאת קבצים".
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {participantQuestions.length > 0 && (
            <Card className="mb-4" style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              backdropFilter: 'blur(10px)'
            }}>
              <CardHeader className="py-2">
                <CardTitle style={{ color: '#06b6d4' }}>פרטי המשתתף</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid md:grid-cols-3 gap-3">
                  {participantQuestions.map(q => (
                    <div key={q.id}>
                      <label htmlFor={`participant-detail-${q.id}`} className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>
                        {q.question_text}
                      </label>
                      <Input
                        id={`participant-detail-${q.id}`}
                        placeholder={q.question_text}
                        value={participantDetails[q.id] || ""}
                        onChange={(e) => handleDetailsChange(q.id, e.target.value)}
                        className="h-8"
                        style={{
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid rgba(6, 182, 212, 0.2)',
                          color: '#f8fafc'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(specialTables.length > 0 || roundTables.length > 0 || locationTables.length > 0 || israeliTable || playoffWinnersTable) && (
            <Card className="mb-4" style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              backdropFilter: 'blur(10px)'
            }}>
               <CardHeader className="py-2">
                  <CardTitle style={{ color: '#06b6d4' }}>בחירת שלב לניחוש</CardTitle>
               </CardHeader>
               <CardContent className="grid grid-cols-4 gap-3 p-3">
                  {allButtons.map(button => (
                      <Button 
                        key={button.key} 
                        onClick={() => toggleSection(button.sectionKey)} 
                        variant={openSections[button.sectionKey] ? "default" : "outline"} 
                        className={`h-20 p-2 flex-col gap-2 whitespace-normal`}
                        style={openSections[button.sectionKey] ? {
                          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(14, 165, 233, 0.3) 100%)',
                          border: '1px solid rgba(6, 182, 212, 0.5)',
                          color: '#06b6d4',
                          boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)'
                        } : {
                          background: 'rgba(30, 41, 59, 0.4)',
                          border: '1px solid rgba(6, 182, 212, 0.2)',
                          color: '#94a3b8'
                        }}
                      >
                          <span className="text-sm font-medium">{button.description}</span>
                          {openSections[button.sectionKey] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </Button>
                  ))}
               </CardContent>
            </Card>
          )}

          {allButtons.map(button => {
              if (!openSections[button.sectionKey]) return null;

              if (button.sectionKey === 'rounds') {
                  return (
                      <div key="rounds-section" className="mb-6 space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {roundTables.map(table => (
                                  <RoundTable
                                      key={table.id}
                                      table={table}
                                      teams={teams}
                                      predictions={predictions}
                                      onPredictionChange={handlePredictionChange}
                                      cardStyle={{
                                        background: 'rgba(30, 41, 59, 0.6)',
                                        border: '1px solid rgba(6, 182, 212, 0.2)',
                                        backdropFilter: 'blur(10px)'
                                      }}
                                      titleStyle={{ color: '#06b6d4' }}
                                      questionRowStyle={{
                                        background: 'rgba(15, 23, 42, 0.4)',
                                        border: '1px solid rgba(6, 182, 212, 0.1)',
                                        transition: 'all 0.2s ease-in-out'
                                      }}
                                      questionRowHoverClass="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                                      badgeStyle={{
                                        borderColor: 'rgba(6, 182, 212, 0.5)',
                                        color: '#06b6d4'
                                      }}
                                      questionTextStyle={{ color: '#94a3b8' }}
                                      inputStyle={{
                                        background: 'rgba(15, 23, 42, 0.6)',
                                        border: '1px solid rgba(6, 182, 212, 0.2)',
                                        color: '#f8fafc'
                                      }}
                                  />
                              ))}
                          </div>
                          <StandingsTable 
                            roundTables={roundTables}
                            teams={teams}
                            data={predictions}
                            type="predictions"
                          />
                      </div>
                  );
              } else if (button.sectionKey === 'israeli' && israeliTable) {
                  return (
                      <div key="israeli-section" className="mb-6">
                          <RoundTable
                              table={israeliTable}
                              teams={teams}
                              predictions={predictions}
                              onPredictionChange={handlePredictionChange}
                              cardStyle={{
                                background: 'rgba(30, 41, 59, 0.6)',
                                border: '1px solid rgba(6, 182, 212, 0.2)',
                                backdropFilter: 'blur(10px)'
                              }}
                              titleStyle={{ color: '#06b6d4' }}
                              questionRowStyle={{
                                background: 'rgba(15, 23, 42, 0.4)',
                                border: '1px solid rgba(6, 182, 212, 0.1)',
                                transition: 'all 0.2s ease-in-out'
                              }}
                              questionRowHoverClass="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                              badgeStyle={{
                                borderColor: 'rgba(6, 182, 212, 0.5)',
                                color: '#06b6d4'
                              }}
                              questionTextStyle={{ color: '#94a3b8' }}
                              inputStyle={{
                                background: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid rgba(6, 182, 212, 0.2)',
                                color: '#f8fafc'
                              }}
                          />
                      </div>
                  );
              } else if (button.sectionKey === 'locations') {
                  return (
                      <div key="locations-section" className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                          {locationTables.map(table => renderSpecialQuestions(table))}
                      </div>
                  );
              } else if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) {
                  return (
                      <div key="playoff-winners-section" className="mb-6">
                          {renderSpecialQuestions(playoffWinnersTable)}
                      </div>
                  );
              }
              else {
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
      )}
    </div>
  );
}