import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  FileText,
  Save,
  Loader2,
  Trophy,
  Upload as UploadIcon,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Pencil,
  ChevronDown
} from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";

export default function FormBuilder() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [game, setGame] = useState(null);

  // שלבי הבניה
  const [currentStep, setCurrentStep] = useState(1); // 1 = בחירת סוג, 2 = טעינת משחקים או יצירת שאלות
  const [selectedStageType, setSelectedStageType] = useState(null); // 'league', 'groups', 'playoff', 'custom'

  // טעינת משחקים מקובץ
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [stageName, setStageName] = useState('');
  const [stageDescription, setStageDescription] = useState(''); // 🆕 תיאור השלב
  const [stageOrder, setStageOrder] = useState(''); // 🆕 מספר השלב
  
  // 🆕 ניקוד לשאלות
  const [defaultPoints, setDefaultPoints] = useState(10);

  // שאלות שנוצרו
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [stagesList, setStagesList] = useState([]); // רשימת השלבים שנוצרו

  // 🆕 State עבור יצירת שאלות ידנית
  const [customQuestions, setCustomQuestions] = useState([]);
  const [newCustomQuestion, setNewCustomQuestion] = useState({
    question_number: '',
    question_text: '',
    validation_list: null, // Changed to null for better Select component integration
    max_points: 10
  });
  
  // 🆕 State לעריכת שאלות ושלבים
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [showEditQuestionDialog, setShowEditQuestionDialog] = useState(false);
  const [showEditStageDialog, setShowEditStageDialog] = useState(false);
  
  // 🆕 State להעתקה ממשחקים אחרים
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [availableGames, setAvailableGames] = useState([]);
  const [selectedGameToCopy, setSelectedGameToCopy] = useState(null);
  const [stagesFromOtherGame, setStagesFromOtherGame] = useState([]);
  const [selectedQuestionsToCopy, setSelectedQuestionsToCopy] = useState([]);
  const [expandedStages, setExpandedStages] = useState([]);

  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentGame } = useGame();

  useEffect(() => {
    loadGame();
    loadAvailableGames();
  }, [currentGame]);

  const loadGame = async () => {
    setLoading(true);
    try {
      if (!currentGame) {
        toast({
          title: "שגיאה",
          description: "לא נבחר משחק",
          variant: "destructive"
        });
        navigate(createPageUrl("SystemOverview"));
        return;
      }

      setGame(currentGame);

      // טען שאלות קיימות של המשחק, ממוינות לפי סדר השלב
      const allExistingQuestions = await db.Question.filter({ game_id: currentGame.id }, 'stage_order', 1000);
      
      // 🔥 סינון שאלות T1 - לא להציג ב-FormBuilder!
      const existingQuestions = allExistingQuestions.filter(q => q.table_id !== 'T1');
      console.log(`📋 סוננו ${allExistingQuestions.length - existingQuestions.length} שאלות T1`);
      
      setGeneratedQuestions(existingQuestions);

      // קבץ לפי שלבים - עם איחוד שלבים מיוחדים לפי stage_order
      const stages = {};
      existingQuestions.forEach(q => {
        let stageKey;
        
        // אם זה שלב מיוחד (custom) עם stage_order זהה - נאחד אותם
        if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order) {
          stageKey = `custom_order_${q.stage_order}`;
        } else {
          stageKey = q.table_id || q.stage_name;
        }
        
        if (!stages[stageKey]) {
          stages[stageKey] = {
            name: q.stage_name || stageKey,
            order: q.stage_order || 999,
            type: q.table_description?.includes('שאלות מיוחדות') ? 'custom' : 
                  (q.table_description?.includes('מחזורים') ? 'league' : 
                  (q.table_description?.includes('בתים') ? 'groups' : 
                  (q.table_description?.includes('פלייאוף') ? 'playoff' : 'unknown'))),
            questions: []
          };
        }
        stages[stageKey].questions.push(q);
      });

      // מיין את השלבים לפי stage_order
      const sortedStages = Object.values(stages).sort((a, b) => (a.order || 999) - (b.order || 999));
      setStagesList(sortedStages);

    } catch (error) {
      console.error("Error loading game:", error);
      toast({
        title: "שגיאה",
        description: "טעינת המשחק נכשלה",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const loadAvailableGames = async () => {
    try {
      const allGames = await db.Game.filter({}, '-created_at', 100);
      setAvailableGames(allGames.filter(g => g.id !== currentGame?.id));
    } catch (error) {
      console.error("Error loading games:", error);
    }
  };

  // 🆕 טעינת שלבים ממשחק אחר
  const loadStagesFromGame = async (gameId) => {
    try {
      const allQuestions = await db.Question.filter({ game_id: gameId }, 'stage_order', 1000);
      
      // 🔥 סינון שאלות T1 (פרטי משתתף) - לעולם לא להעתיק!
      const questions = allQuestions.filter(q => q.table_id !== 'T1');
      console.log(`📋 סוננו ${allQuestions.length - questions.length} שאלות T1 מתוך ${allQuestions.length}`);
      
      const stages = {};
      questions.forEach(q => {
        let stageKey;
        
        if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order) {
          stageKey = `custom_order_${q.stage_order}`;
        } else {
          stageKey = q.table_id || q.stage_name;
        }
        
        if (!stages[stageKey]) {
          stages[stageKey] = {
            name: q.stage_name || stageKey,
            order: q.stage_order || 999,
            type: q.table_description?.includes('שאלות מיוחדות') ? 'custom' : 
                  (q.table_description?.includes('מחזורים') ? 'league' : 
                  (q.table_description?.includes('בתים') ? 'groups' : 
                  (q.table_description?.includes('פלייאוף') ? 'playoff' : 'unknown'))),
            questions: [],
            table_id: q.table_id,
            table_description: q.table_description
          };
        }
        stages[stageKey].questions.push(q);
      });

      // 🔥 מיין שאלות בתוך כל שלב לפי question_id בסדר עולה
      Object.values(stages).forEach(stage => {
        stage.questions.sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
      });

      const sortedStages = Object.values(stages).sort((a, b) => (a.order || 999) - (b.order || 999));
      setStagesFromOtherGame(sortedStages);
    } catch (error) {
      console.error("Error loading stages:", error);
      toast({
        title: "שגיאה",
        description: "טעינת השלבים נכשלה",
        variant: "destructive"
      });
    }
  };

  // 🆕 בחירה/ביטול של כל שאלות שלב
  const toggleStageQuestions = (stageIdx) => {
    const stage = stagesFromOtherGame[stageIdx];
    const stageQuestionIds = stage.questions.map(q => `${stageIdx}_${q.id}`);
    
    const allSelected = stageQuestionIds.every(id => selectedQuestionsToCopy.includes(id));
    
    if (allSelected) {
      setSelectedQuestionsToCopy(prev => prev.filter(id => !stageQuestionIds.includes(id)));
    } else {
      setSelectedQuestionsToCopy(prev => [...new Set([...prev, ...stageQuestionIds])]);
    }
  };

  // 🆕 העתקת שאלות נבחרות
  const copySelectedQuestions = async () => {
    if (selectedQuestionsToCopy.length === 0) {
      toast({
        title: "שגיאה",
        description: "נא לבחור לפחות שאלה אחת להעתקה",
        variant: "destructive"
      });
      return;
    }

    try {
      const questionsToCreate = [];
      
      // 🔥 קבץ שאלות לפי שלב כדי ליצור table_id אחיד לכל שלב
      const stageTableIds = {};
      
      stagesFromOtherGame.forEach((stage, stageIdx) => {
        // 🔥 מיין שאלות לפי question_id בסדר עולה לפני ההעתקה
        const sortedQuestions = [...stage.questions].sort((a, b) => 
          parseFloat(a.question_id) - parseFloat(b.question_id)
        );
        
        sortedQuestions.forEach((q) => {
          const questionKey = `${stageIdx}_${q.id}`;
          if (selectedQuestionsToCopy.includes(questionKey)) {
            // צור table_id אחיד לכל שלב (לא לכל שאלה)
            if (!stageTableIds[stageIdx]) {
              stageTableIds[stageIdx] = `COPY_${game.id}_${Date.now()}_${stageIdx}`;
            }
            
            questionsToCreate.push({
              game_id: game.id,
              table_id: stageTableIds[stageIdx], // 🔥 table_id אחיד לכל השאלות באותו שלב
              table_text: q.table_text,
              table_description: q.table_description,
              question_id: q.question_id,
              question_text: q.question_text,
              home_team: q.home_team || null,
              away_team: q.away_team || null,
              game_date: q.game_date || null,
              possible_points: q.possible_points || 10,
              validation_list: q.validation_list || null,
              stage_name: q.stage_name,
              round_number: q.round_number,
              stage_order: q.stage_order || null
            });
          }
        });
      });

      const savedQuestions = await db.Question.bulkCreate(questionsToCreate);

      toast({
        title: "הצלחה!",
        description: `הועתקו ${savedQuestions.length} שאלות`,
        className: "bg-green-100 text-green-800"
      });

      setShowCopyDialog(false);
      setSelectedGameToCopy(null);
      setStagesFromOtherGame([]);
      setSelectedQuestionsToCopy([]);
      setExpandedStages([]);
      await loadGame();

    } catch (error) {
      console.error("Error copying questions:", error);
      toast({
        title: "שגיאה",
        description: "העתקת השאלות נכשלה",
        variant: "destructive"
      });
    }
  };

  // טעינה והמרה של נתונים מהאקסל
  const handlePasteGames = async () => {
    if (!pasteData.trim() || !stageName.trim() || !selectedStageType) {
      toast({
        title: "שגיאה",
        description: "נא למלא שם שלב, לבחור סוג ולהדביק נתונים",
        variant: "destructive"
      });
      return;
    }

    // 🆕 בדיקת מספר שלב
    const stageOrderNum = stageOrder ? parseInt(stageOrder) : null;

    try {
      const lines = pasteData.split(/\r\n|\r|\n/).filter(line => line.trim());

      if (lines.length < 2) {
        toast({
          title: "שגיאה",
          description: "נדרשת לפחות שורת כותרת ושורת נתונים אחת",
          variant: "destructive"
        });
        return;
      }

      const dataLines = lines.slice(1);
      let newQuestions = [];
      const groupedByHouse = {};

      dataLines.forEach((line, index) => {
        const cells = line.split('\t');

        let roundInfo, matchDate, homeTeam, awayTeam;

        if (selectedStageType === 'league') {
          roundInfo = cells[0]?.trim();
          matchDate = cells[1]?.trim();
          homeTeam = cells[2]?.trim();
          awayTeam = cells[3]?.trim();
        } else if (selectedStageType === 'groups') {
          // 🏠 בתים - מספר הבית בעמודה הראשונה
          const houseRaw = cells[0]?.trim();
          matchDate = cells[1]?.trim();
          homeTeam = cells[2]?.trim();
          awayTeam = cells[3]?.trim();
          
          // נרמל את שם הבית - תמיד בפורמט "בית X"
          if (houseRaw) {
            // אם כבר כולל "בית"
            if (houseRaw.includes('בית')) {
              roundInfo = houseRaw;
            } 
            // אם זה מספר (1, 2, 3) והוא בטווח של אותיות עבריות
            else if (!isNaN(houseRaw) && parseInt(houseRaw) > 0 && parseInt(houseRaw) <= 8) {
              const hebrewLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];
              const letter = hebrewLetters[parseInt(houseRaw) - 1];
              roundInfo = `בית ${letter}`;
            }
            // אחרת - השתמש בערך כמו שהוא וצרף "בית"
            else {
              roundInfo = `בית ${houseRaw}`;
            }
          }
        } else if (selectedStageType === 'playoff') {
          roundInfo = cells[0]?.trim();
          matchDate = cells[1]?.trim();
          homeTeam = cells[2]?.trim();
          awayTeam = cells[3]?.trim();
        }

        if (!homeTeam || !awayTeam) {
          console.warn(`Skipping line ${index + 2} due to missing team data: ${line}`);
          return;
        }

        // 🏠 עבור בתים - קבץ לפי מספר הבית
        if (selectedStageType === 'groups') {
          const houseKey = roundInfo;
          if (!groupedByHouse[houseKey]) {
            groupedByHouse[houseKey] = [];
          }
          groupedByHouse[houseKey].push({
            roundInfo: houseKey,
            matchDate,
            homeTeam,
            awayTeam,
            originalIndex: index
          });
        } else {
          newQuestions.push({
            roundInfo,
            matchDate,
            homeTeam,
            awayTeam,
            originalIndex: index
          });
        }
      });

      // 🏠 יצירת שאלות עבור בתים (table_id ייחודי לכל בית!)
      if (selectedStageType === 'groups') {
        const questionsForGroups = [];
        
        // מיין את הבתים לפי סדר אלפביתי עברי
        const sortedHouses = Object.keys(groupedByHouse).sort((a, b) => {
          return a.localeCompare(b, 'he');
        });
        
        sortedHouses.forEach(houseName => {
          const matches = groupedByHouse[houseName];
          // כל בית מקבל table_id ייחודי משלו!
          const tableId = `G_${game.id}_${houseName}`; // משתמש בשם הבית כ-table_id, עם game_id כדי לוודא ייחודיות גלובלית
          
          matches.forEach((match, idx) => {
            const question = {
              game_id: game.id,
              table_id: tableId, // ייחודי לבית!
              table_text: houseName,
              table_description: houseName,
              question_id: `${idx + 1}`, // question_id for specific match within a stage
              question_text: `${match.homeTeam} נגד ${match.awayTeam}`,
              home_team: match.homeTeam,
              away_team: match.awayTeam,
              game_date: match.matchDate || null,
              possible_points: defaultPoints, // 🆕 משתמש בניקוד שנבחר
              validation_list: null,
              stage_name: houseName, // חשוב! זה מה שמזהה בתים
              round_number: idx + 1,
              stage_order: stageOrderNum // 🆕 הוספת מספר השלב
            };
            questionsForGroups.push(question);
          });
        });
        
        newQuestions = questionsForGroups;
        
      } else {
        const tableId = `T${Math.floor(Math.random() * 1000000)}`;
        const selectedTypeDescription = stageTypes.find(t => t.id === selectedStageType)?.title;

        newQuestions = newQuestions.map((match, idx) => {
          return {
            game_id: game.id,
            table_id: tableId,
            table_text: stageName,
            table_description: `${stageName} - ${selectedTypeDescription}`,
            question_id: `${idx + 1}`, // question_id for specific match within a stage
            question_text: `${match.homeTeam} נגד ${match.awayTeam}`,
            home_team: match.homeTeam,
            away_team: match.awayTeam,
            game_date: match.matchDate || null,
            possible_points: defaultPoints, // 🆕 משתמש בניקוד שנבחר
            validation_list: null,
            stage_name: match.roundInfo || stageName,
            round_number: idx + 1,
            stage_order: stageOrderNum // 🆕 הוספת מספר השלב
          };
        });
      }

      if (newQuestions.length === 0) {
        toast({
          title: "שגיאה",
          description: "לא נמצאו משחקים תקינים בנתונים",
          variant: "destructive"
        });
        return;
      }

      const savedQuestions = await db.Question.bulkCreate(newQuestions);

      setGeneratedQuestions(prev => [...prev, ...savedQuestions]);

      const newStage = {
        name: stageName,
        order: stageOrderNum || 999, // 🆕 שמירת הסדר
        type: selectedStageType,
        questions: savedQuestions
      };
      setStagesList(prev => {
        const updated = [...prev, newStage];
        return updated.sort((a, b) => (a.order || 999) - (b.order || 999)); // 🆕 מיון
      });

      toast({
        title: "הצלחה!",
        description: `נוצרו ${savedQuestions.length} שאלות משחק${selectedStageType === 'groups' ? ` ב-${Object.keys(groupedByHouse).length} בתים` : ` בשלב ${stageName}`}`,
        className: "bg-green-100 text-green-800"
      });

      setPasteData('');
      setStageName('');
      setStageDescription(''); // 🆕 איפוס
      setStageOrder(''); // 🆕 איפוס
      setDefaultPoints(10); // 🆕 איפוס הניקוד
      setShowUploadDialog(false);
      setCurrentStep(1);

    } catch (error) {
      console.error("Error creating questions:", error);
      toast({
        title: "שגיאה",
        description: "יצירת השאלות נכשלה",
        variant: "destructive"
      });
    }
  };

  // 🆕 פונקציה להוספת שאלה מותאמת אישית
  const addCustomQuestion = () => {
    if (!newCustomQuestion.question_number || !newCustomQuestion.question_text) {
      toast({
        title: "שגיאה",
        description: "נא למלא מספר שאלה ותיאור",
        variant: "destructive"
      });
      return;
    }
    // Check for duplicate question numbers within the current customQuestions list
    if (customQuestions.some(q => q.question_number === newCustomQuestion.question_number)) {
      toast({
        title: "שגיאה",
        description: "מספר שאלה זה כבר קיים ברשימה הנוכחית. נא לבחור מספר אחר.",
        variant: "destructive"
      });
      return;
    }

    setCustomQuestions(prev => [...prev, { ...newCustomQuestion }]);
    setNewCustomQuestion({
      question_number: '',
      question_text: '',
      validation_list: null, // Reset to null
      max_points: 10
    });
  };

  // 🆕 פונקציה לשמירת שאלות מותאמות אישית
  const saveCustomQuestions = async () => {
    if (customQuestions.length === 0) {
      toast({
        title: "שגיאה",
        description: "נא להוסיף לפחות שאלה אחת",
        variant: "destructive"
      });
      return;
    }

    if (!stageName.trim()) {
      toast({
        title: "שגיאה",
        description: "נא למלא שם שלב",
        variant: "destructive"
      });
      return;
    }

    // 🆕 בדיקת מספר שלב
    const stageOrderNum = stageOrder ? parseInt(stageOrder) : null;

    try {
      // 🔥 בדיקה אם כבר קיים שלב עם אותו stage_order (עבור שאלות מיוחדות)
      let tableId;
      if (stageOrderNum) {
        const existingStageQuestions = generatedQuestions.filter(
          q => q.table_description?.includes('שאלות מיוחדות') && q.stage_order === stageOrderNum
        );
        
        if (existingStageQuestions.length > 0) {
          // 🎯 שלב קיים - השתמש ב-table_id שלו
          tableId = existingStageQuestions[0].table_id;
          console.log(`✅ משתמש בשלב קיים עם table_id: ${tableId}`);
        } else {
          // ✨ שלב חדש - צור table_id חדש
          tableId = `C_${game.id}_${Math.floor(Math.random() * 1000000)}`;
          console.log(`✨ יצירת שלב חדש עם table_id: ${tableId}`);
        }
      } else {
        // אין stage_order - צור table_id חדש
        tableId = `C_${game.id}_${Math.floor(Math.random() * 1000000)}`;
      }
      
      const questionsToCreate = customQuestions.map((q, index) => ({
        game_id: game.id,
        table_id: tableId,
        table_text: stageName,
        table_description: `${stageName} - שאלות מיוחדות`,
        question_id: q.question_number,
        question_text: q.question_text,
        validation_list: q.validation_list || null,
        possible_points: q.max_points,
        stage_name: stageName,
        round_number: index + 1,
        stage_order: stageOrderNum
      }));

      const savedQuestions = await db.Question.bulkCreate(questionsToCreate);

      setGeneratedQuestions(prev => [...prev, ...savedQuestions]);

      const newStage = {
        name: stageName,
        order: stageOrderNum || 999,
        type: 'custom',
        questions: savedQuestions
      };
      setStagesList(prev => {
        const updated = [...prev, newStage];
        return updated.sort((a, b) => (a.order || 999) - (b.order || 999));
      });

      toast({
        title: "הצלחה!",
        description: `נוצרו ${savedQuestions.length} שאלות מיוחדות בשלב ${stageName}`,
        className: "bg-green-100 text-green-800"
      });

      setCustomQuestions([]);
      setStageName('');
      setStageDescription(''); // 🆕 איפוס
      setStageOrder('');
      setCurrentStep(1);
      setSelectedStageType(null);

    } catch (error) {
      console.error("Error creating custom questions:", error);
      toast({
        title: "שגיאה",
        description: "יצירת השאלות נכשלה",
        variant: "destructive"
      });
    }
  };

  // מחיקת שאלה
  const deleteQuestion = async (questionId) => {
    if (!window.confirm("האם למחוק שאלה זו?")) return;

    try {
      // נסה למחוק - אם השאלה לא קיימת, נתעלם מהשגיאה
      try {
        await db.Question.delete(questionId);
      } catch (deleteError) {
        // אם השגיאה היא "not found", נמשיך כרגיל (השאלה כבר נמחקה)
        if (deleteError.message?.includes('not found')) {
          console.log(`שאלה ${questionId} כבר נמחקה, מסיר מה-state`);
        } else {
          throw deleteError; // אם זו שגיאה אחרת, נזרוק אותה
        }
      }

      // עדכן את generatedQuestions - הסר את השאלה שנמחקה
      setGeneratedQuestions(prev => {
        const remaining = prev.filter(q => q.id !== questionId);
        
        // עדכן גם את stagesList
        const stages = {};
        remaining.forEach(q => {
          let stageKey;
          
          // אם זה שלב מיוחד (custom) עם stage_order זהה - נאחד אותם
          if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order) {
            stageKey = `custom_order_${q.stage_order}`;
          } else {
            stageKey = q.table_id || q.stage_name;
          }
          
          if (!stages[stageKey]) {
            stages[stageKey] = {
              name: q.stage_name || stageKey,
              order: q.stage_order || 999,
              type: q.table_description?.includes('שאלות מיוחדות') ? 'custom' : 
                    (q.table_description?.includes('מחזורים') ? 'league' : 
                    (q.table_description?.includes('בתים') ? 'groups' : 
                    (q.table_description?.includes('פלייאוף') ? 'playoff' : 'unknown'))),
              questions: []
            };
          }
          stages[stageKey].questions.push(q);
        });
        
        const sortedStages = Object.values(stages).sort((a, b) => (a.order || 999) - (b.order || 999));
        setStagesList(sortedStages);
        
        return remaining;
      });
      
      toast({
        title: "נמחק!",
        description: "השאלה נמחקה בהצלחה", // Corrected typo
      });
    } catch (error) {
      console.error("Error deleting question:", error);
      toast({
        title: "שגיאה",
        description: error.message || "מחיקת השאלה נכשלה",
        variant: "destructive"
      });
    }
  };

  // 🆕 פונקציה לעריכת שאלה
  const handleEditQuestion = (question) => {
    setEditingQuestion({
      ...question,
      question_number: question.question_id, // Map question_id from DB to question_number for UI
      max_points: question.possible_points || 10
    });
    setShowEditQuestionDialog(true);
  };

  const saveEditedQuestion = async () => {
    if (!editingQuestion) return;

    try {
      await db.Question.update(editingQuestion.id, {
        question_id: editingQuestion.question_number,
        question_text: editingQuestion.question_text,
        validation_list: editingQuestion.validation_list || null,
        possible_points: editingQuestion.max_points
      });

      toast({
        title: "עודכן!",
        description: "השאלה עודכנה בהצלחה",
        className: "bg-green-100 text-green-800"
      });

      setShowEditQuestionDialog(false);
      setEditingQuestion(null);
      await loadGame(); // Reload all data to reflect changes

    } catch (error) {
      console.error("Error updating question:", error);
      toast({
        title: "שגיאה",
        description: "עדכון השאלה נכשל",
        variant: "destructive"
      });
    }
  };

  // 🆕 פונקציה לעריכת שלב
  const handleEditStage = (stage) => {
    setEditingStage({
      originalName: stage.name, // Keep original name for reference if needed
      name: stage.name,
      order: stage.order || '', // 🆕 הוספת הסדר
      type: stage.type, // Make sure to pass the type for accurate description generation
      questions: stage.questions // Keep questions list to know which questions belong to this stage
    });
    setShowEditStageDialog(true);
  };

  const saveEditedStage = async () => {
    if (!editingStage || !editingStage.name.trim()) {
      toast({
        title: "שגיאה",
        description: "שם שלב לא יכול להיות ריק",
        variant: "destructive"
      });
      return;
    }

    try {
      const stageOrderNum = editingStage.order ? parseInt(editingStage.order) : null;

      // Find the corresponding stage type to update table_description correctly
      const stageTypeInfo = stageTypes.find(t => t.id === editingStage.type);
      let newTableDescription = editingStage.name;
      if (editingStage.type === 'custom') {
        newTableDescription = `${editingStage.name} - שאלות מיוחדות`;
      } else if (stageTypeInfo) {
        newTableDescription = `${editingStage.name} - ${stageTypeInfo.title}`;
      }
      // If type is unknown, default to just the stage name

      // Update all questions belonging to this stage
      const updates = editingStage.questions.map(q => db.Question.update(q.id, {
        stage_name: editingStage.name,
        table_text: editingStage.name,
        table_description: newTableDescription,
        stage_order: stageOrderNum // 🆕 עדכון הסדר
      }));
      await Promise.all(updates);

      toast({
        title: "עודכן!",
        description: "תיאור וסדר השלב עודכנו בהצלחה",
        className: "bg-green-100 text-green-800"
      });

      setShowEditStageDialog(false);
      setEditingStage(null);
      await loadGame(); // Reload all data to reflect changes

    } catch (error) {
      console.error("Error updating stage:", error);
      toast({
        title: "שגיאה",
        description: "עדכון השלב נכשל",
        variant: "destructive"
      });
    }
  };

  // שמירה סופית
  const saveForm = async () => {
    if (generatedQuestions.length === 0) {
      toast({
        title: "שגיאה",
        description: "נא להוסיף לפחות שאלה אחת",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      await db.Game.update(game.id, {
        status: "active"
      });

      toast({
        title: "הצלחה!",
        description: "השאלון נשמר והמשחק הופעל",
        className: "bg-green-100 text-green-800"
      });

      setTimeout(() => {
        navigate(createPageUrl("SystemOverview"));
      }, 1500);

    } catch (error) {
      console.error("Error saving form:", error);
      toast({
        title: "שגיאה",
        description: "שמירת השאלון נכשלה",
        variant: "destructive"
      });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-screen" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען...</span>
      </div>
    );
  }

  const stageTypes = [
    {
      id: 'league',
      title: 'ליגה',
      description: 'מחזורים עם משחקי הליגה',
      icon: Trophy,
      format: 'מחזור | תאריך | קבוצה בית | קבוצה חוץ'
    },
    {
      id: 'groups',
      title: 'בתים',
      description: 'שלב הבתים',
      icon: FileText,
      format: 'בית | תאריך | קבוצה בית | קבוצה חוץ'
    },
    {
      id: 'playoff',
      title: 'פלייאוף',
      description: 'שלבי הפלייאוף',
      icon: Trophy,
      format: 'שלב | תאריך | קבוצה בית | קבוצה חוץ'
    },
    {
      id: 'custom',
      title: 'שאלות מיוחדות',
      description: 'הוסף שאלות ידנית, כגון בונוסים או שאלות כלליות',
      icon: Sparkles,
      format: 'יצירה ידנית של שאלות'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl" style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      minHeight: '100vh'
    }}>
      {/* כותרת */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3" style={{
              color: '#f8fafc',
              textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
            }}>
              <FileText className="w-10 h-10" style={{ color: '#06b6d4' }} />
              בניית שאלון ניחוש
            </h1>
            <p style={{ color: '#94a3b8' }}>
              משחק: <strong style={{ color: '#06b6d4' }}>{game?.game_name}</strong>
              {game?.game_subtitle && <span> - {game.game_subtitle}</span>}
            </p>
          </div>
          <Button
            onClick={() => setShowCopyDialog(true)}
            size="lg"
            variant="outline"
            style={{
              borderColor: 'rgba(139, 92, 246, 0.5)',
              color: '#8b5cf6',
              background: 'rgba(139, 92, 246, 0.1)'
            }}
            className="hover:bg-purple-500/20"
          >
            <Plus className="w-5 h-5 ml-2" />
            העתק ממשחק אחר
          </Button>
        </div>
      </div>

      {/* 🆕 הצגת שלבים ושאלות קיימות - יופיע תמיד אם יש שלבים */}
      {stagesList.length > 0 && (
        <Card className="mb-6" style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader>
            <CardTitle style={{ color: '#06b6d4' }}>שלבים ושאלות שנבנו ({generatedQuestions.length} שאלות)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stagesList.map((stage, idx) => {
              // מיון שאלות בסדר עולה לפי question_id
              const sortedQuestions = [...stage.questions].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));

              return (
                <div key={idx} className="p-4 rounded-lg" style={{
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid rgba(6, 182, 212, 0.2)'
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {stage.order && (
                        <Badge style={{ 
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          #{stage.order}
                        </Badge>
                      )}
                      {stage.type === 'league' && <Trophy className="w-5 h-5" style={{ color: '#06b6d4' }} />}
                      {stage.type === 'groups' && <FileText className="w-5 h-5" style={{ color: '#06b6d4' }} />}
                      {stage.type === 'playoff' && <Trophy className="w-5 h-5" style={{ color: '#06b6d4' }} />}
                      {stage.type === 'custom' && <Sparkles className="w-5 h-5" style={{ color: '#06b6d4' }} />}
                      <h3 className="font-bold text-lg" style={{ color: '#f8fafc' }}>{stage.name}</h3>
                      <Badge style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4' }}>
                        {stage.questions.length} שאלות
                      </Badge>
                    </div>
                    <Button
                      onClick={() => handleEditStage(stage)}
                      size="sm"
                      variant="outline"
                      style={{
                        borderColor: 'rgba(6, 182, 212, 0.5)',
                        color: '#06b6d4'
                      }}
                      className="hover:bg-cyan-500/20"
                    >
                      <Pencil className="w-4 h-4 ml-1" />
                      ערוך שלב
                    </Button>
                  </div>
                  
                  <div className="mt-3 max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0" style={{ background: 'rgba(15, 23, 42, 0.95)' }}>
                        <tr style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.3)' }}>
                          <th className="text-right p-2" style={{ color: '#06b6d4', fontSize: '11px' }}>מס'</th>
                          <th className="text-right p-2" style={{ color: '#06b6d4', fontSize: '11px' }}>שאלה</th>
                          <th className="text-center p-2" style={{ color: '#06b6d4', fontSize: '11px' }}>רשימת אימות</th>
                          {stage.type !== 'custom' && stage.table_id !== 'T_TOP_FINISHERS' && (
                            <th className="text-center p-2" style={{ color: '#06b6d4', fontSize: '11px' }}>תאריך</th>
                          )}
                          <th className="text-center p-2" style={{ color: '#06b6d4', fontSize: '11px' }}>נק'</th>
                          <th className="text-center p-2" style={{ color: '#06b6d4', fontSize: '11px' }}>פעולות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedQuestions.map((q, qIdx) => (
                          <tr key={q.id || qIdx} className="hover:bg-cyan-900/10" style={{
                            borderBottom: '1px solid rgba(6, 182, 212, 0.1)'
                          }}>
                            <td className="p-2">
                              <Badge variant="outline" style={{ borderColor: 'rgba(6, 182, 212, 0.3)', color: '#06b6d4', fontSize: '10px' }}>
                                {q.question_id}
                              </Badge>
                            </td>
                            <td className="p-2" style={{ color: '#94a3b8' }}>{q.question_text}</td>
                            <td className="text-center p-2 text-xs" style={{ color: '#8b5cf6' }}>
                              {q.validation_list || '-'}
                            </td>
                            {stage.type !== 'custom' && q.table_id !== 'T_TOP_FINISHERS' && (
                              <td className="text-center p-2 text-xs" style={{ color: '#64748b' }}>
                                {q.game_date || '-'}
                              </td>
                            )}
                            <td className="text-center p-2">
                              {q.possible_points && (
                                <Badge variant="outline" style={{ borderColor: 'rgba(251, 191, 36, 0.5)', color: '#fbbf24', fontSize: '10px' }}>
                                  {q.possible_points}
                                </Badge>
                              )}
                            </td>
                            <td className="text-center p-2">
                              <div className="flex gap-2 justify-center">
                                <Button
                                  onClick={() => handleEditQuestion(q)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-cyan-400 hover:text-cyan-300"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  onClick={() => deleteQuestion(q.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* אינדיקטור שלבים */}
      <Card className="mb-6" style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-cyan-600' : 'bg-gray-600'}`}>
                  {currentStep > 1 ? <CheckCircle className="w-5 h-5 text-white" /> : <span className="text-white font-bold">1</span>}
                </div>
                <span style={{ color: currentStep >= 1 ? '#06b6d4' : '#64748b' }} className="font-medium">בחירת סוג</span>
              </div>

              <ArrowLeft className="w-5 h-5" style={{ color: '#64748b' }} />

              <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-cyan-600' : 'bg-gray-600'}`}>
                  <span className="text-white font-bold">2</span>
                </div>
                <span style={{ color: currentStep >= 2 ? '#06b6d4' : '#64748b' }} className="font-medium">
                  {selectedStageType === 'custom' ? 'יצירת שאלות' : 'טעינת משחקים'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* שלב 1: בחירת סוג */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <Card style={{
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            backdropFilter: 'blur(10px)'
          }}>
            <CardHeader>
              <CardTitle style={{ color: '#06b6d4' }}>בחר סוג שלב</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {stageTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedStageType(type.id)}
                    className="p-6 rounded-lg text-right transition-all"
                    style={{
                      background: selectedStageType === type.id
                        ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(14, 165, 233, 0.3) 100%)'
                        : 'rgba(15, 23, 42, 0.4)',
                      border: selectedStageType === type.id
                        ? '2px solid rgba(6, 182, 212, 0.8)'
                        : '1px solid rgba(6, 182, 212, 0.2)',
                      boxShadow: selectedStageType === type.id
                        ? '0 0 20px rgba(6, 182, 212, 0.3)'
                        : 'none'
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <type.icon className="w-8 h-8" style={{ color: '#06b6d4' }} />
                      <h3 className="text-xl font-bold" style={{ color: '#f8fafc' }}>{type.title}</h3>
                    </div>
                    <p className="text-sm mb-3" style={{ color: '#94a3b8' }}>{type.description}</p>
                    <div className="text-xs p-2 rounded" style={{
                      background: 'rgba(6, 182, 212, 0.1)',
                      color: '#06b6d4'
                    }}>
                      {type.format}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (!selectedStageType) {
                  toast({
                    title: "שגיאה",
                    description: "נא לבחור סוג שלב",
                    variant: "destructive"
                  });
                  return;
                }
                setCurrentStep(2);
              }}
              size="lg"
              style={{
                background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                color: 'white'
              }}
            >
              המשך
              <ArrowRight className="w-5 h-5 mr-2" />
            </Button>
          </div>
        </div>
      )}

      {/* שלב 2: יצירת שאלות מותאמות אישית */}
      {currentStep === 2 && selectedStageType === 'custom' && (
        <div className="space-y-6">
          <Card style={{
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            backdropFilter: 'blur(10px)'
          }}>
            <CardHeader>
              <CardTitle style={{ color: '#06b6d4' }}>יצירת שאלות מיוחדות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 🆕 שדות שם ומספר שלב */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>שם השלב</label>
                <Input
                  placeholder="שאלות כלליות, בונוסים..."
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>תיאור השלב (כותרת משנה)</label>
                <Input
                  placeholder="תיאור מפורט של השלב..."
                  value={stageDescription}
                  onChange={(e) => setStageDescription(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>מספר שלב (לסדר תצוגה)</label>
                <Input
                  type="number"
                  placeholder="1, 2, 3..."
                  value={stageOrder}
                  onChange={(e) => setStageOrder(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
              </div>

              <div className="border rounded-lg p-4" style={{
                background: 'rgba(15, 23, 42, 0.4)',
                borderColor: 'rgba(6, 182, 212, 0.2)'
              }}>
                <h3 className="font-bold mb-3" style={{ color: '#06b6d4' }}>הוסף שאלה</h3>
                
                {/* 🆕 תוויות מעל השדות */}
                <div className="grid grid-cols-4 gap-3 mb-2">
                  <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>מס' שאלה</label>
                  <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>תיאור שאלה</label>
                  <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>ניקוד</label>
                  <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>רשימת אימות</label>
                </div>
                
                <div className="grid grid-cols-4 gap-3">
                  <Input
                    placeholder="1"
                    value={newCustomQuestion.question_number}
                    onChange={(e) => setNewCustomQuestion({...newCustomQuestion, question_number: e.target.value})}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />
                  <Input
                    placeholder="נסח את השאלה..."
                    value={newCustomQuestion.question_text}
                    onChange={(e) => setNewCustomQuestion({...newCustomQuestion, question_text: e.target.value})}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />
                  <Input
                    type="number"
                    placeholder="10"
                    value={newCustomQuestion.max_points}
                    onChange={(e) => setNewCustomQuestion({...newCustomQuestion, max_points: parseInt(e.target.value) || 10})}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />
                  <Select
                    value={newCustomQuestion.validation_list || ""}
                    onValueChange={(value) => setNewCustomQuestion({...newCustomQuestion, validation_list: value === "" ? null : value})}
                  >
                    <SelectTrigger style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}>
                      <SelectValue placeholder="אופציונלי" style={{color: newCustomQuestion.validation_list ? '#f8fafc' : '#94a3b8'}}/>
                    </SelectTrigger>
                    <SelectContent style={{
                      background: '#1e293b',
                      border: '1px solid rgba(6, 182, 212, 0.3)'
                    }}>
                      <SelectItem value={null} style={{ color: '#f8fafc' }}>ללא</SelectItem> {/* Value "" maps to null */}
                      {game?.validation_lists?.map(list => (
                        <SelectItem key={list.list_name} value={list.list_name} style={{ color: '#f8fafc' }}>
                          {list.list_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  onClick={addCustomQuestion}
                  className="mt-3 w-full"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white'
                  }}
                >
                  <Plus className="w-4 h-4 ml-2" />
                  הוסף שאלה
                </Button>
              </div>

              {customQuestions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-bold" style={{ color: '#06b6d4' }}>שאלות שנוספו ({customQuestions.length})</h3>
                  {customQuestions.map((q, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg flex items-center justify-between"
                      style={{
                        background: 'rgba(15, 23, 42, 0.4)',
                        border: '1px solid rgba(6, 182, 212, 0.1)'
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Badge style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4' }}>
                          {q.question_number}
                        </Badge>
                        <span style={{ color: '#f8fafc' }}>{q.question_text}</span>
                        {q.validation_list && (
                          <Badge variant="outline" style={{ borderColor: 'rgba(139, 92, 246, 0.5)', color: '#8b5cf6' }}>
                            {q.validation_list}
                          </Badge>
                        )}
                        <Badge variant="outline" style={{ borderColor: 'rgba(16, 185, 129, 0.5)', color: '#10b981' }}>
                          {q.max_points} נק'
                        </Badge>
                      </div>
                      <Button
                        onClick={() => setCustomQuestions(prev => prev.filter((_, i) => i !== index))}
                        variant="ghost"
                        size="sm"
                        className="text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between gap-3">
            <Button
              onClick={() => {
                setCurrentStep(1);
                setSelectedStageType(null); // Clear selected type when going back
                setStageName(''); // Clear stage name
                setStageDescription(''); // 🆕 איפוס
                setStageOrder(''); // 🆕 איפוס
                setCustomQuestions([]); // Clear custom questions
              }}
              variant="outline"
              size="lg"
              style={{
                borderColor: 'rgba(6, 182, 212, 0.3)',
                color: '#94a3b8'
              }}
            >
              <ArrowRight className="w-5 h-5 ml-2" />
              חזור
            </Button>

            <div className="flex gap-3">
              <Button
                onClick={saveCustomQuestions}
                disabled={customQuestions.length === 0 || !stageName.trim()}
                size="lg"
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  color: 'white'
                }}
              >
                <Save className="w-5 h-5 ml-2" />
                שמור שאלות והמשך
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* שלב 2: טעינת משחקים (ליגה/בתים/פלייאוף) */}
      {currentStep === 2 && selectedStageType !== 'custom' && (
        <div className="space-y-6">
          <Card style={{
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            backdropFilter: 'blur(10px)'
          }}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
                  <UploadIcon className="w-6 h-6" />
                  טעינת משחקים - {stageTypes.find(t => t.id === selectedStageType)?.title}
                </CardTitle>
                <Button
                  onClick={() => setShowUploadDialog(true)}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white'
                  }}
                >
                  <Plus className="w-4 h-4 ml-1" />
                  הדבק משחקים
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Alert style={{
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.3)'
              }}>
                <AlertDescription style={{ color: '#94a3b8' }}>
                  <p className="font-semibold mb-1" style={{ color: '#06b6d4' }}>איך זה עובד:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>הכן באקסל טבלה לפי הפורמט: <strong>{stageTypes.find(t => t.id === selectedStageType)?.format}</strong></li>
                    <li>בחר הכל (Ctrl+A) והעתק (Ctrl+C)</li>
                    <li>לחץ "הדבק משחקים" והדבק את הנתונים</li>
                    <li>השאלות ייווצרו אוטומטית!</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <div className="flex justify-between gap-3">
            <Button
              onClick={() => {
                setCurrentStep(1);
                setSelectedStageType(null); // Clear selected type when going back
              }}
              variant="outline"
              size="lg"
              style={{
                borderColor: 'rgba(6, 182, 212, 0.3)',
                color: '#94a3b8'
              }}
            >
              <ArrowRight className="w-5 h-5 ml-2" />
              חזור
            </Button>

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setCurrentStep(1); // Allow adding another stage by returning to step 1
                  setSelectedStageType(null); // Reset selection
                }}
                size="lg"
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  color: 'white'
                }}
              >
                הוסף שלב נוסף
              </Button>

              <Button
                onClick={saveForm}
                disabled={saving || generatedQuestions.length === 0}
                size="lg"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                  color: 'white'
                }}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin ml-2" />
                    שומר...
                  </>
                ) : (
                  <>
                    <Save className="w-6 h-6 ml-2" />
                    שמור והפעל משחק
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* דיאלוג הדבקת משחקים */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          maxWidth: '800px'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', fontSize: '20px' }}>
              הדבקת משחקים - {stageTypes.find(t => t.id === selectedStageType)?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 🆕 שדות שם ומספר שלב */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: '#94a3b8' }}>שם השלב</label>
              <Input
                placeholder="מחזור 1, בית A..."
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  color: '#f8fafc'
                }}
              />
            </div>

            <div>
              <label className="text-xs mb-1 block" style={{ color: '#94a3b8' }}>תיאור השלב (כותרת משנה)</label>
              <Input
                placeholder="תיאור מפורט של השלב..."
                value={stageDescription}
                onChange={(e) => setStageDescription(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  color: '#f8fafc'
                }}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#94a3b8' }}>מספר שלב</label>
                <Input
                  type="number"
                  placeholder="1, 2, 3..."
                  value={stageOrder}
                  onChange={(e) => setStageOrder(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
              </div>
              
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#94a3b8' }}>ניקוד לשאלה</label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  placeholder="10"
                  value={defaultPoints}
                  onChange={(e) => setDefaultPoints(parseInt(e.target.value) || 10)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
              </div>
            </div>

            <Alert style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <AlertDescription style={{ color: '#94a3b8' }}>
                <p className="font-semibold mb-1" style={{ color: '#10b981' }}>✅ פורמט הנתונים:</p>
                <p className="text-sm"><strong>{stageTypes.find(t => t.id === selectedStageType)?.format}</strong></p>
              </AlertDescription>
            </Alert>

            <textarea
              className="w-full h-64 p-4 border rounded-lg font-mono text-sm"
              placeholder="הדבק כאן את הנתונים מהאקסל..."
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                color: '#f8fafc'
              }}
            />

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadDialog(false);
                  setPasteData('');
                  setStageName('');
                  setStageDescription(''); // 🆕 איפוס
                  setStageOrder(''); // 🆕 איפוס
                  setDefaultPoints(10);
                }}
                style={{
                  borderColor: 'rgba(6, 182, 212, 0.3)',
                  color: '#94a3b8'
                }}
              >
                ביטול
              </Button>
              <Button
                onClick={handlePasteGames}
                disabled={!pasteData.trim() || !stageName.trim()}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  color: 'white',
                  boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                }}
              >
                <Sparkles className="w-5 h-5 ml-2" />
                צור שאלות
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🆕 דיאלוג עריכת שאלה */}
      <Dialog open={showEditQuestionDialog} onOpenChange={setShowEditQuestionDialog}>
        <DialogContent style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          maxWidth: '600px'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', fontSize: '20px' }}>
              עריכת שאלה
            </DialogTitle>
          </DialogHeader>

          {editingQuestion && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>מס' שאלה</label>
                  <Input
                    value={editingQuestion.question_number}
                    onChange={(e) => setEditingQuestion({...editingQuestion, question_number: e.target.value})}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>ניקוד</label>
                  <Input
                    type="number"
                    value={editingQuestion.max_points}
                    onChange={(e) => setEditingQuestion({...editingQuestion, max_points: parseInt(e.target.value) || 10})}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>תיאור שאלה</label>
                <Input
                  value={editingQuestion.question_text}
                  onChange={(e) => setEditingQuestion({...editingQuestion, question_text: e.target.value})}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>רשימת אימות</label>
                <Select
                  value={editingQuestion.validation_list || ""}
                  onValueChange={(value) => setEditingQuestion({...editingQuestion, validation_list: value === "" ? null : value})}
                >
                  <SelectTrigger style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}>
                    <SelectValue placeholder="ללא רשימת אימות" />
                  </SelectTrigger>
                  <SelectContent style={{
                    background: '#1e293b',
                    border: '1px solid rgba(6, 182, 212, 0.3)'
                  }}>
                    <SelectItem value={null} style={{ color: '#f8fafc' }}>ללא</SelectItem>
                    {game?.validation_lists?.map(list => (
                      <SelectItem key={list.list_name} value={list.list_name} style={{ color: '#f8fafc' }}>
                        {list.list_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditQuestionDialog(false);
                    setEditingQuestion(null);
                  }}
                  style={{
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#94a3b8'
                  }}
                >
                  ביטול
                </Button>
                <Button
                  onClick={saveEditedQuestion}
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                    color: 'white'
                  }}
                >
                  <Save className="w-4 h-4 ml-2" />
                  שמור שינויים
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 🆕 דיאלוג העתקה ממשחק אחר */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          maxWidth: '900px',
          maxHeight: '80vh',
          overflow: 'auto'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#8b5cf6', fontSize: '20px' }}>
              העתקת שלבים ושאלות ממשחק אחר
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* בחירת משחק */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>
                בחר משחק להעתקה ממנו
              </label>
              <Select
                value={selectedGameToCopy || ""}
                onValueChange={(gameId) => {
                  setSelectedGameToCopy(gameId);
                  loadStagesFromGame(gameId);
                  setSelectedQuestionsToCopy([]);
                  setExpandedStages([]);
                }}
              >
                <SelectTrigger style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  color: '#f8fafc'
                }}>
                  <SelectValue placeholder="בחר משחק..." />
                </SelectTrigger>
                <SelectContent className="[&>div]:bg-slate-800" style={{
                  background: '#1e293b !important',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  backgroundColor: '#1e293b'
                }}>
                  {availableGames.map(g => (
                    <SelectItem key={g.id} value={g.id} className="text-slate-200 hover:bg-purple-900/20 focus:bg-purple-900/20" style={{ 
                      color: '#f8fafc',
                      backgroundColor: 'transparent'
                    }}>
                      {g.game_name} {g.game_subtitle && `- ${g.game_subtitle}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* רשימת שלבים ושאלות */}
            {stagesFromOtherGame.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>
                  בחר שאלות להעתקה ({selectedQuestionsToCopy.length} נבחרו)
                </label>
                <div className="space-y-2 max-h-[500px] overflow-y-auto p-2" style={{
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '8px'
                }}>
                  {stagesFromOtherGame.map((stage, stageIdx) => {
                    const stageQuestionIds = stage.questions.map(q => `${stageIdx}_${q.id}`);
                    const selectedCount = stageQuestionIds.filter(id => selectedQuestionsToCopy.includes(id)).length;
                    const isExpanded = expandedStages.includes(stageIdx);
                    
                    return (
                      <div
                        key={stageIdx}
                        className="rounded-lg transition-all"
                        style={{
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid rgba(139, 92, 246, 0.2)'
                        }}
                      >
                        {/* כותרת השלב */}
                        <div 
                          className="p-3 cursor-pointer hover:bg-purple-900/20 transition-colors rounded-t-lg"
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedStages(prev => prev.filter(i => i !== stageIdx));
                            } else {
                              setExpandedStages(prev => [...prev, stageIdx]);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-4 h-4" style={{ color: '#8b5cf6' }} /> : <ArrowRight className="w-4 h-4" style={{ color: '#8b5cf6' }} />}
                              {stage.order && (
                                <Badge style={{
                                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                  color: 'white',
                                  fontSize: '11px'
                                }}>
                                  #{stage.order}
                                </Badge>
                              )}
                              <span className="font-bold" style={{ color: '#f8fafc' }}>
                                {stage.name}
                              </span>
                              <Badge variant="outline" style={{
                                borderColor: 'rgba(139, 92, 246, 0.5)',
                                color: '#8b5cf6',
                                fontSize: '11px'
                              }}>
                                {stage.questions.length} שאלות
                              </Badge>
                              {selectedCount > 0 && (
                                <Badge style={{
                                  background: 'rgba(16, 185, 129, 0.2)',
                                  color: '#10b981',
                                  fontSize: '11px'
                                }}>
                                  {selectedCount} נבחרו
                                </Badge>
                              )}
                            </div>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStageQuestions(stageIdx);
                              }}
                              size="sm"
                              variant="outline"
                              style={{
                                borderColor: 'rgba(139, 92, 246, 0.5)',
                                color: '#8b5cf6',
                                fontSize: '11px',
                                padding: '4px 8px'
                              }}
                            >
                              {selectedCount === stage.questions.length ? 'בטל הכל' : 'בחר הכל'}
                            </Button>
                          </div>
                        </div>
                        
                        {/* רשימת שאלות */}
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-1">
                            {stage.questions.map((q) => {
                              const questionKey = `${stageIdx}_${q.id}`;
                              const isSelected = selectedQuestionsToCopy.includes(questionKey);
                              
                              return (
                                <div
                                  key={q.id}
                                  className="p-2 rounded cursor-pointer transition-all flex items-center gap-2"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedQuestionsToCopy(prev => prev.filter(id => id !== questionKey));
                                    } else {
                                      setSelectedQuestionsToCopy(prev => [...prev, questionKey]);
                                    }
                                  }}
                                  style={{
                                    background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'rgba(15, 23, 42, 0.4)',
                                    border: isSelected ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent'
                                  }}
                                >
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0`} style={{
                                    borderColor: isSelected ? '#8b5cf6' : '#64748b',
                                    background: isSelected ? '#8b5cf6' : 'transparent'
                                  }}>
                                    {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                                  </div>
                                  <Badge variant="outline" style={{ 
                                    borderColor: 'rgba(6, 182, 212, 0.3)', 
                                    color: '#06b6d4', 
                                    fontSize: '10px',
                                    flexShrink: 0
                                  }}>
                                    {q.question_id}
                                  </Badge>
                                  <span className="text-sm" style={{ color: '#f8fafc' }}>
                                    {q.question_text}
                                  </span>
                                  {q.possible_points && (
                                    <Badge variant="outline" style={{ 
                                      borderColor: 'rgba(251, 191, 36, 0.5)', 
                                      color: '#fbbf24', 
                                      fontSize: '10px',
                                      marginRight: 'auto',
                                      flexShrink: 0
                                    }}>
                                      {q.possible_points} נק'
                                    </Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* כפתורים */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCopyDialog(false);
                  setSelectedGameToCopy(null);
                  setStagesFromOtherGame([]);
                  setSelectedQuestionsToCopy([]);
                  setExpandedStages([]);
                }}
                style={{
                  borderColor: 'rgba(139, 92, 246, 0.3)',
                  color: '#94a3b8'
                }}
              >
                ביטול
              </Button>
              <Button
                onClick={copySelectedQuestions}
                disabled={selectedQuestionsToCopy.length === 0}
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  color: 'white',
                  boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)'
                }}
              >
                <Plus className="w-5 h-5 ml-2" />
                העתק {selectedQuestionsToCopy.length} שאלות
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🆕 דיאלוג עריכת שלב */}
      <Dialog open={showEditStageDialog} onOpenChange={setShowEditStageDialog}>
        <DialogContent style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          maxWidth: '500px'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', fontSize: '20px' }}>
              עריכת שלב
            </DialogTitle>
          </DialogHeader>

          {editingStage && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>שם השלב</label>
                <Input
                  value={editingStage.name}
                  onChange={(e) => setEditingStage({...editingStage, name: e.target.value})}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                  placeholder="הזן שם שלב..."
                />
              </div>

              {/* 🆕 שדה מספר שלב */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>מספר שלב (לסדר תצוגה)</label>
                <Input
                  type="number"
                  value={editingStage.order || ''}
                  onChange={(e) => setEditingStage({...editingStage, order: e.target.value})}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                  placeholder="1, 2, 3..."
                />
              </div>

              <Alert style={{
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.3)'
              }}>
                <AlertDescription style={{ color: '#94a3b8' }}>
                  שינוי זה יעדכן את כל {editingStage.questions.length} השאלות בשלב
                </AlertDescription>
              </Alert>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditStageDialog(false);
                    setEditingStage(null);
                  }}
                  style={{
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#94a3b8'
                  }}
                >
                  ביטול
                </Button>
                <Button
                  onClick={saveEditedStage}
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                    color: 'white'
                  }}
                >
                  <Save className="w-4 h-4 ml-2" />
                  שמור שינויים
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}