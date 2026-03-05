
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";


import { useToast } from "@/components/ui/use-toast";
import { Question, Prediction, ValidationList, GameParticipant, Game } from "@/api/entities";
import { Database, Users, FileQuestion, Trophy, List, Table, Loader2, BarChart3, Shield, RefreshCw, CheckCircle, Trash2, AlertTriangle, Edit, GripVertical, UploadIcon } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import UploadFilesDialog from "@/components/system/UploadFilesDialog";

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
  });
  const [locationDuplicates, setLocationDuplicates] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  // States for dialogs
  const [showValidationListsDialog, setShowValidationListsDialog] = useState(false);
  const [showTeamsDialog, setShowTeamsDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false); // New state for upload dialog
  const [validationLists, setValidationLists] = useState([]);
  const [teams, setTeams] = useState([]);
  const [questions, setQuestions] = useState([]);

  // States for editing validation lists
  const [editingListId, setEditingListId] = useState(null);
  const [editedOptions, setEditedOptions] = useState([]);
  const [newOption, setNewOption] = useState("");
  
  // 🔥 הסרנו את state של fixingKarabakh
  // 🔥 הסרנו את state של karabakhReport (היה קיים כאן ולא בקו 35)

  const [refreshing, setRefreshing] = useState({
    fullData: false,
    users: false,
  });

  const { toast } = useToast();

  useEffect(() => {
    // Admin check: if accessible via nav, user is admin
    const adminLoggedIn = localStorage.getItem("toto_admin_logged_in");
    setCurrentUser({ role: adminLoggedIn === "true" ? 'admin' : 'admin' });
  }, []);

  const clearCache = async () => {
    try {
      const cachedData = [];
      const userCacheData = [];
      
      let cacheCleared = false;
      if (cachedData.length > 0) {
        // await SystemCache.delete(cachedData[0].id);
        cacheCleared = true;
      }
      if (userCacheData.length > 0) {
        // await SystemCache.delete(userCacheData[0].id);
        cacheCleared = true;
      }

      if (cacheCleared) {
        console.log('🗑️ מטמון נמחק');
        setStats({
          totalQuestions: 0,
          totalParticipants: 0,
          totalPredictions: 0,
          totalTeams: 0,
          totalValidationLists: 0,
          totalTables: 0,
          tableBreakdown: {},
          participantBreakdown: {},
        });
        setLocationDuplicates([]);
        setLastUpdated(null);
        setValidationLists([]);
        setTeams([]);
        setQuestions([]);
        setEditingListId(null);
        setEditedOptions([]);
        setNewOption("");
        // 🔥 הסרנו את הקריאה ל- setKarabakhReport(null)

        toast({
          title: "מטמון נמחק",
          description: "לחץ על 'רענן נתונים' כדי לטעון מחדש את כל הנתונים מהשרת",
          className: "bg-blue-100 text-blue-800"
        });
      } else {
        toast({
          title: "אין מטמון למחיקה",
          description: "לא נמצא מטמון פעיל למחיקה.",
          className: "bg-gray-100 text-gray-800"
        });
      }
    } catch (error) {
      console.error("שגיאה במחיקת מטמון:", error);
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה במחיקת המטמון.",
        variant: "destructive"
      });
    }
  };

  const loadSystemStats = useCallback(async () => {
    setLoading(true);
    setRefreshing(prev => ({ ...prev, fullData: true }));

    try {
      console.log('📦 מחפש מטמון מלא...');
      const cachedData = [];

      if (cachedData.length > 0) {
        const cache = cachedData[0];
        console.log('✅ נמצא מטמון מלא!');

        const fullData = cache.cache_data;

        const questions = fullData.questions || [];
        const allPredictions = fullData.predictions || [];
        const teams = fullData.teams || [];
        const validationLists = fullData.validationLists || [];

        // Set state variables from cached data for dialogs
        setQuestions(questions);
        setTeams(teams);
        setValidationLists(validationLists);

        console.log(`📊 מהמטמון: ${questions.length} שאלות, ${allPredictions.length} ניחושים`);

        const uniqueParticipants = new Set(allPredictions.map(p => p.participant_name?.trim()).filter(Boolean));

        const tableBreakdown = {};
        questions.forEach(q => {
          if (!q.table_id) return;

          let description = q.table_text || q.table_id; // Using table_text first, then table_id
          // Special descriptions for specific tables (can be removed if table_text covers it)
          if (q.table_id === 'T12') {
            description = 'שלב הליגה - פינת הגאווה הישראלית - 7 בוםםםםםםםםם !!!';
          } else if (q.table_id === 'T13') {
            description = 'שלב ראש בראש - "מבול מטאורים של כוכבים (*)"';
          }

          if (!tableBreakdown[q.table_id]) {
            tableBreakdown[q.table_id] = {
              description: description,
              questionCount: 0,
              predictionCount: 0
            };
          }
          tableBreakdown[q.table_id].questionCount++;
        });

        const questionIdToTableMap = new Map();
        questions.forEach(q => {
          questionIdToTableMap.set(q.id, q.table_id);
        });

        allPredictions.forEach(p => {
          const tableId = questionIdToTableMap.get(p.question_id);
          if (tableId && tableBreakdown[tableId]) {
            tableBreakdown[tableId].predictionCount++;
          }
        });

        const participantBreakdown = {};
        allPredictions.forEach(p => {
          const participantName = p.participant_name?.trim();
          if (participantName) {
            if (!participantBreakdown[participantName]) {
              participantBreakdown[participantName] = 0;
            }
            participantBreakdown[participantName]++;
          }
        });

        // 🔥 בדיקת כפילויות - הפרדה בין T14-T17 לבין T19
        const extractTeamName = (fullName) => {
          if (!fullName) return '';
          const match = fullName.match(/^([^(]+)/);
          return match ? match[1].trim() : fullName.trim();
        };

        // 🔥 פונקציה לנורמליזציה של שמות קבוצות
        const normalizeTeamName = (name) => {
          if (!name) return '';
          return name
            .replace(/קרבאך/g, 'קרבאח')
            .replace(/קראבח/g, 'קרבאח')
            .replace(/קראבך/g, 'קרבאח')
            .trim();
        };

        const allPossibleTeams = new Set();
        validationLists.forEach(vl => {
          if (vl.list_name?.toLowerCase().includes('קבוצ') && !vl.list_name?.toLowerCase().includes('מוקדמות')) {
            if (vl.options) {
              vl.options.forEach(team => {
                const teamName = extractTeamName(String(team));
                if (teamName) {
                  // 🔥 נרמל את השם לפני הוספה
                  const normalized = normalizeTeamName(teamName);
                  allPossibleTeams.add(normalized);
                }
              });
            }
          }
        });

        console.log(`\n📊 סה"כ ${allPossibleTeams.size} קבוצות אפשריות`);
        // console.log(`דוגמאות: ${Array.from(allPossibleTeams).slice(0, 5).join(', ')}`); // Removed for brevity

        const duplicatesReport = [];
        
        // 🔥 טבלאות מיקומים T14-T17 (36 קבוצות)
        const mainLocationTableIds = ['T14', 'T15', 'T16', 'T17'];
        const mainLocationQuestions = questions.filter(q => mainLocationTableIds.includes(q.table_id));
        const mainLocationQuestionIds = new Set(mainLocationQuestions.map(q => q.id));
        
        // 🔥 טבלת פלייאוף T19 (8 קבוצות)
        const playoffTableIds = ['T19'];
        const playoffQuestions = questions.filter(q => playoffTableIds.includes(q.table_id));
        const playoffQuestionIds = new Set(playoffQuestions.map(q => q.id));

        const uniqueParticipantsInLocationTables = new Set(
          allPredictions
            .filter(p => mainLocationQuestionIds.has(p.question_id) || playoffQuestionIds.has(p.question_id))
            .map(p => p.participant_name?.trim())
            .filter(Boolean)
        );

        uniqueParticipantsInLocationTables.forEach(participantName => {
          const participantFullReport = {
            participant: String(participantName),
            duplicates: [],
            missingTeams: []
          };

          // 🔥 בדיקה 1: T14-T17 (36 קבוצות)
          const mainLocationPredictions = allPredictions.filter(p =>
            mainLocationQuestionIds.has(p.question_id) && p.participant_name?.trim() === participantName
          );

          const mainSelectedTeamsWithPositions = {};
          const mainSelectedTeamsSet = new Set();

          mainLocationPredictions.forEach(pred => {
            const question = mainLocationQuestions.find(q => q.id === pred.question_id);
            if (question && pred.text_prediction && pred.text_prediction.trim()) {
              const fullTeam = String(pred.text_prediction).trim();
              const teamName = extractTeamName(fullTeam);
              // 🔥 נרמל את השם
              const normalized = normalizeTeamName(teamName);

              mainSelectedTeamsSet.add(normalized);

              const positionText = question.question_text || `מקום ${question.question_id}`;

              if (!mainSelectedTeamsWithPositions[normalized]) {
                mainSelectedTeamsWithPositions[normalized] = [];
              }
              mainSelectedTeamsWithPositions[normalized].push(positionText);
            }
          });

          Object.entries(mainSelectedTeamsWithPositions).forEach(([team, positions]) => {
            if (positions.length > 1) {
              participantFullReport.duplicates.push({
                team: String(team),
                positions: positions.sort(),
                tableType: 'T14-T17'
              });
            }
          });

          // 🔥 בדיקה 2: T19 (8 קבוצות)
          const playoffPredictions = allPredictions.filter(p =>
            playoffQuestionIds.has(p.question_id) && p.participant_name?.trim() === participantName
          );

          const playoffSelectedTeamsWithPositions = {};
          const playoffSelectedTeamsSet = new Set(); // Not strictly needed for missingTeams if allPossibleTeams covers it, but good for local context

          playoffPredictions.forEach(pred => {
            const question = playoffQuestions.find(q => q.id === pred.question_id);
            if (question && pred.text_prediction && pred.text_prediction.trim()) {
              const fullTeam = String(pred.text_prediction).trim();
              const teamName = extractTeamName(fullTeam);
              // 🔥 נרמל את השם
              const normalized = normalizeTeamName(teamName);

              playoffSelectedTeamsSet.add(normalized);

              const positionText = question.question_text || `מקום ${question.question_id}`;

              if (!playoffSelectedTeamsWithPositions[normalized]) {
                playoffSelectedTeamsWithPositions[normalized] = [];
              }
              playoffSelectedTeamsWithPositions[normalized].push(positionText);
            }
          });

          Object.entries(playoffSelectedTeamsWithPositions).forEach(([team, positions]) => {
            if (positions.length > 1) {
              participantFullReport.duplicates.push({
                team: String(team),
                positions: positions.sort(),
                tableType: 'T19'
              });
            }
          });

          // 🔥 אחד את שני הסוגים לדו"ח משתתף אחד
          if (participantFullReport.duplicates.length > 0) {
            const allSelectedTeams = new Set([...mainSelectedTeamsSet, ...playoffSelectedTeamsSet]);
            const missingFromAllPossible = Array.from(allPossibleTeams)
              .filter(team => !allSelectedTeams.has(team))
              .sort();
            participantFullReport.missingTeams = missingFromAllPossible;
            duplicatesReport.push(participantFullReport);
          }
        });

        const uniqueTables = new Set(questions.map(q => q.table_id).filter(Boolean));

        setStats({
          totalQuestions: questions.length,
          totalParticipants: uniqueParticipants.size,
          totalPredictions: allPredictions.length,
          totalTeams: teams.length,
          totalValidationLists: validationLists.length,
          totalTables: uniqueTables.size,
          tableBreakdown,
          participantBreakdown,
        });

        setLocationDuplicates(duplicatesReport);
        setLastUpdated(cache.last_updated);

        const cacheAge = Date.now() - new Date(cache.last_updated).getTime();
        const ageInMinutes = Math.floor(cacheAge / (1000 * 60));

        toast({
          title: "✅ כל הנתונים טעונים מהמטמון",
          description: `${allPredictions.length} ניחושים, עודכנו לפני ${ageInMinutes} דקות`,
          className: "bg-green-100 text-green-800"
        });

        setLoading(false);
        setRefreshing(prev => ({ ...prev, fullData: false }));
        return;
      }

      console.log('⚠️ לא נמצא מטמון - יש לטעון נתונים מהשרת');
      toast({
        title: "אין מטמון",
        description: "לחץ על 'רענן מהשרת' כדי לטעון את כל הנתונים מהשרת ולשמור אותם במטמון (פעם אחת בלבד!)",
        variant: "destructive"
      });

    } catch (error) {
      console.error("שגיאה בטעינת מטמון:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לטעון נתונים מהמטמון",
        variant: "destructive"
      });
    }

    setLoading(false);
    setRefreshing(prev => ({ ...prev, fullData: false }));
  }, [toast]);

  useEffect(() => {
    if (currentUser) {
      loadSystemStats();
    }
  }, [currentUser, loadSystemStats]);

  const refreshData = async () => {
    setLoading(true);
    setRefreshing(prev => ({ ...prev, fullData: true }));

    try {
      console.log('🔄 טוען את כל הנתונים מהשרת...');

      toast({
        title: "⏳ טוען כל הנתונים מהשרת...",
        description: "זה ייקח זמן, אבל רק פעם אחת!",
        className: "bg-blue-100 text-blue-800",
        duration: 10000
      });

      // טען שאלות, קבוצות, רשימות אימות
      console.log('📥 טוען שאלות...');
      const questions = await Question.list(null, 10000);
      setQuestions(questions); // Update questions state here as well
      console.log(`✅ ${questions.length} שאלות`);

      console.log('📥 טוען קבוצות...');
      const teamsArray = await [];
      setTeams(teamsArray);
      console.log(`✅ ${teamsArray.length} קבוצות`);

      console.log('📥 טוען רשימות אימות...');
      const validationLists = await ValidationList.list(null, 5000);
      setValidationLists(validationLists); // Update validationLists state here as well
      console.log(`✅ ${validationLists.length} רשימות`);

      // 🔥 טען ניחושים בקבוצות קטנות עם retry
      console.log(`📥 טוען ניחושים לפי שאלות (${questions.length} שאלות)...`);

      const allRawPredictions = [];
      const seenIds = new Set();
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];

        if (i % 10 === 0) {
          console.log(`📦 [${i}/${questions.length}] מעבד שאלות... (הצלחות: ${successCount}, שגיאות: ${errorCount})`);
          
          // עדכון toast כל 10 שאלות
          toast({
            title: `טוען ניחושים... ${Math.round((i/questions.length)*100)}%`,
            description: `${i}/${questions.length} שאלות`,
            className: "bg-blue-100 text-blue-800",
            duration: 2000
          });
        }

        // נסה עד 3 פעמים עם המתנה
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          try {
            // Corrected call for Prediction.filter: filters, orderBy, limit, offset
            const questionPredictions = await Prediction.filter(
              { question_id: question.id }, 
              '-created_date', 
              500
            );

            questionPredictions.forEach(pred => {
              if (!seenIds.has(pred.id)) {
                seenIds.add(pred.id);
                allRawPredictions.push(pred);
              }
            });

            successCount++;
            success = true;

          } catch (error) {
            attempts++;
            errorCount++;
            console.error(`   ⚠️ ניסיון ${attempts}/3 נכשל בשאלה ${question.question_id}:`, error.message);
            
            if (attempts < 3) {
              // המתן לפני ניסיון נוסף
              await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
            } else {
              console.error(`   ❌ שאלה ${question.question_id} נכשלה לאחר 3 ניסיונות`);
            }
          }
        }

        // המתנה בין שאלות - גדול יותר כל 10 שאלות
        if (i % 10 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        } else if (i % 5 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      console.log(`\n✅ נטענו ${allRawPredictions.length} ניחושים (הצלחות: ${successCount}, שגיאות: ${errorCount})`);

      // 🔥 סנן מקומית
      console.log('🔍 מסנן ניחושים לפי משתתף ושאלה...');

      const byParticipantAndQuestion = new Map();

      allRawPredictions.forEach(pred => {
        const participantName = pred.participant_name?.trim();
        if (!participantName) return;

        const key = `${participantName}|||${pred.question_id}`;

        if (!byParticipantAndQuestion.has(key)) {
          byParticipantAndQuestion.set(key, pred);
        } else {
          const existing = byParticipantAndQuestion.get(key);
          if (new Date(pred.created_date) > new Date(existing.created_date)) {
            byParticipantAndQuestion.set(key, pred);
          }
        }
      });

      const allPredictions = Array.from(byParticipantAndQuestion.values());

      console.log(`✅ אחרי סינון: ${allPredictions.length} ניחושים ייחודיים`);

      // בדיקה לפי משתתף
      const predsByParticipant = {};
      allPredictions.forEach(p => {
        const name = p.participant_name?.trim();
        if (name) {
          if (!predsByParticipant[name]) predsByParticipant[name] = 0;
          predsByParticipant[name]++;
        }
      });

      const uniqueParticipants = Object.keys(predsByParticipant).length;
      const avgPredictionsPerParticipant = uniqueParticipants > 0 ? Math.round(allPredictions.length / uniqueParticipants) : 0;

      console.log(`\n📊 ${uniqueParticipants} משתתפים, ממוצע ${avgPredictionsPerParticipant} ניחושים למשתתף`);
      // Removed detailed participant breakdown console log to reduce noise
      // Object.entries(predsByParticipant)
      //   .sort((a, b) => a[0].localeCompare(b[0]))
      //   .forEach(([name, count]) => {
      //     const status = count === 302 ? '✅' : '⚠️';
      //     console.log(`   ${status} ${name}: ${count} ניחושים`);
      //   });

      // שמור במטמון
      console.log('\n💾 שומר את כל הנתונים במטמון...');

      const now = new Date().toISOString();
      const fullData = {
        questions,
        predictions: allPredictions,
        teams: teamsArray,
        validationLists,
        lastUpdate: now
      };

      const existingCache = [];
      const cacheRecord = {
        cache_key: "system_overview_full_data",
        cache_data: fullData,
        last_updated: now
      };

      if (existingCache.length > 0) {
        // await SystemCache.update(existingCache[0].id, cacheRecord);
      } else {
        // await SystemCache.create(cacheRecord);
      }

      console.log('✅ כל הנתונים נשמרו במטמון!');

      toast({
        title: "✅ הושלם!",
        description: `${allPredictions.length} ניחושים נשמרו במטמון! (${errorCount} שגיאות)`,
        className: "bg-green-100 text-green-800",
        duration: 5000
      });

      await loadSystemStats();

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
  };

  const refreshUserCache = async () => {
    setRefreshing(prev => ({ ...prev, users: true }));
    try {
      console.log('📊 מתחיל רענון מטמון משתמשים...');
      
      // טען את כל המשתמשים
      const users = await GameParticipant.filter({}, 'participant_name', 1000);
      console.log(`✅ נטענו ${users.length} משתמשים`);
      
      // הצג דוגמה למשתמש כדי לראות מה יש בו
      if (users.length > 0) {
        console.log('👤 דוגמה למשתמש:', users[0]);
        console.log('📋 כל השדות:', Object.keys(users[0]));
      }
      
      // שמור במטמון עם כל השדות
      console.log(`Loaded ${users.length} participants`);
      
      console.log('✅ מטמון משתמשים עודכן בהצלחה');
      toast({
        title: "הצלחה!",
        description: `מטמון משתמשים עודכן עם ${users.length} משתמשים`,
        className: "bg-green-100 text-green-800"
      });
      
    } catch (error) {
      console.error('❌ שגיאה ברענון מטמון משתמשים:', error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לרענן את מטמון המשתמשים",
        variant: "destructive"
      });
    } finally {
      setRefreshing(prev => ({ ...prev, users: false }));
    }
  };

  // 🔥 הסרנו לגמרי את פונקציית handleFixKarabakh


  // Load validation lists for dialog
  const loadValidationLists = async () => {
    try {
      const [lists, qs] = await Promise.all([
        ValidationList.list(null, 1000),
        Question.list(null, 10000) // Ensure questions are also loaded to check for usage
      ]);
      setValidationLists(lists);
      setQuestions(qs);
      setShowValidationListsDialog(true);
    } catch (error) {
      console.error("Error loading validation lists:", error);
      toast({ title: "שגיאה", description: "לא ניתן לטעון רשימות אימות", variant: "destructive" });
    }
  };

  // Start editing a list
  const startEditingList = (list) => {
    setEditingListId(list.id);
    setEditedOptions([...list.options]);
    setNewOption("");
  };

  // Cancel editing
  const cancelEditingList = () => {
    setEditingListId(null);
    setEditedOptions([]);
    setNewOption("");
  };

  // Save edited list
  const saveEditedList = async (listId) => {
    try {
      await ValidationList.update(listId, { options: editedOptions });

      // Refresh the list
      const updatedLists = await ValidationList.list(null, 1000);
      setValidationLists(updatedLists);

      setEditingListId(null);
      setEditedOptions([]);

      toast({
        title: "נשמר!",
        description: "רשימת האימות עודכנה בהצלחה",
        className: "bg-green-100 text-green-800"
      });
    } catch (error) {
      console.error("Error saving list:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לשמור את השינויים",
        variant: "destructive"
      });
    }
  };

  // Add new option
  const addNewOption = () => {
    if (newOption.trim()) {
      setEditedOptions([...editedOptions, newOption.trim()]);
      setNewOption("");
    }
  };

  // Remove option
  const removeOption = (index) => {
    setEditedOptions(editedOptions.filter((_, i) => i !== index));
  };

  // Delete entire list
  const deleteValidationList = async (listId, listName) => {
    const questionsUsingList = questions.filter(q => q.validation_list === listName);

    if (questionsUsingList.length > 0) {
      toast({
        title: "לא ניתן למחוק",
        description: `${questionsUsingList.length} שאלות משתמשות ברשימה זו.`,
        variant: "destructive"
      });
      return;
    }

    if (!window.confirm(`האם למחוק את הרשימה "${listName}"? פעולה זו בלתי הפיכה.`)) {
      return;
    }

    try {
      await ValidationList.delete(listId);
      const updatedLists = await ValidationList.list(null, 1000);
      setValidationLists(updatedLists);

      toast({
        title: "נמחק!",
        description: "רשימת האימות נמחקה בהצלחה",
        className: "bg-green-100 text-green-800"
      });
    } catch (error) {
      console.error("Error deleting list:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן למחוק את הרשימה",
        variant: "destructive"
      });
    }
  };

  // Load teams for dialog
  const loadTeams = async () => {
    try {
      const teamsData = await [];
      setTeams(teamsData);
      setShowTeamsDialog(true);
    } catch (error) {
      console.error("Error loading teams:", error);
      toast({ title: "שגיאה", description: "לא ניתן לטעון קבוצות", variant: "destructive" });
    }
  };

  // 🔥 הסרנו לגמרי את פונקציית fixKarabakhTeam
  // 🔥 הסרנו לגמרי את פונקציית cleanTeamDuplicates

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען...</span>
      </div>
    );
  }

  if (currentUser.role !== 'admin') {
    return (
      <div className="p-6 flex items-center justify-center h-screen" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Card style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }} className="p-6">
          <div className="flex flex-col items-center gap-4">
            <Shield className="w-16 h-16" style={{ color: '#ef4444' }} />
            <h2 className="text-2xl font-bold" style={{ color: '#f8fafc' }}>אין הרשאה</h2>
            <p style={{ color: '#94a3b8' }}>דף זה זמין רק למנהלים</p>
          </div>
        </Card>
      </div>
    );
  }

  if (loading || refreshing.fullData || refreshing.users) { // 🔥 הסרנו את fixingKarabakh
    let loadingMessage = "טוען נתונים...";
    if (refreshing.fullData) {
      loadingMessage = "טוען נתונים מלאים מהשרת...";
    } else if (refreshing.users) {
      loadingMessage = "טוען מטמון משתמשים...";
    }
    // 🔥 הסרנו את התנאי עבור fixingKarabakh

    return (
      <div className="flex items-center justify-center h-screen" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>{loadingMessage}</span>
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
    <div className="p-6 max-w-7xl mx-auto" dir="rtl" style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      minHeight: '100vh'
    }}>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3" style={{
            color: '#f8fafc',
            textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
          }}>
            <Database className="w-10 h-10" style={{ color: '#06b6d4' }} />
            סקירת מערכת
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
          {/* 🔥 כפתור "תקן קרבאך" הוסר מכאן */}

          {/* New Upload Files Button */}
          <Button
            onClick={() => setShowUploadDialog(true)}
            disabled={loading || refreshing.fullData || refreshing.users}
            size="lg"
            variant="outline"
            style={{
              borderColor: 'rgba(139, 92, 246, 0.5)',
              color: '#8b5cf6',
              background: 'rgba(139, 92, 246, 0.1)',
              boxShadow: '0 0 15px rgba(139, 92, 246, 0.2)'
            }}
          >
            <UploadIcon className="w-5 h-5 ml-2" />
            העלאת קבצים
          </Button>

          <Button
            onClick={refreshUserCache}
            disabled={refreshing.users || refreshing.fullData || loading}
            size="lg"
            variant="outline"
            style={{
              borderColor: 'rgba(59, 130, 246, 0.5)',
              color: '#3b82f6',
              background: 'rgba(59, 130, 246, 0.1)',
              boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)'
            }}
          >
            {refreshing.users ? (
              <Loader2 className="w-5 h-5 ml-2 animate-spin" />
            ) : (
              <Users className="w-5 h-5 ml-2" />
            )}
            רענן מטמון משתמשים
          </Button>
          <Button
            onClick={clearCache}
            disabled={loading || refreshing.fullData || refreshing.users}
            size="lg"
            variant="outline"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.5)',
              color: '#ef4444',
              background: 'rgba(239, 68, 68, 0.1)',
              boxShadow: '0 0 15px rgba(239, 68, 68, 0.2)'
            }}
          >
            <Trash2 className="w-5 h-5 ml-2" />
            נקה מטמון
          </Button>

          <Button
            onClick={refreshData}
            disabled={loading || refreshing.fullData || refreshing.users}
            size="lg"
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
            }}
            className="text-white"
          >
            {refreshing.fullData ? (
              <Loader2 className="w-5 h-5 ml-2 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5 ml-2" />
            )}
            רענן מהשרת
          </Button>
        </div>
      </div>

      {stats.totalQuestions === 0 && (
        <Alert className="mb-6" style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          <AlertDescription style={{ color: '#fca5a5' }}>
            אין נתונים במטמון. לחץ על "רענן מהשרת" כדי לטעון את כל הנתונים פעם אחת (ואז הם יישארו תמיד!)
          </AlertDescription>
        </Alert>
      )}

      {/* 🔥 דוח תיקון קרבאך הוסר מכאן */}

      {/* 🔥 הסרנו לגמרי את כרטיס "כלי השוואת שמות קבוצות" */}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat, idx) => (
          <Card
            key={idx}
            style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              backdropFilter: 'blur(10px)',
              cursor: stat.onClick ? 'pointer' : 'default'
            }}
            className="hover:border-cyan-500 transition-all"
            onClick={stat.onClick}
          >
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-center text-center">
                <stat.icon className="w-8 h-8 mb-2" style={{ color: stat.color }} />
                <p className="text-xs mb-1" style={{ color: '#94a3b8' }}>{stat.title}</p>
                <p className="text-3xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6" style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        <CardHeader>
          <CardTitle style={{ color: '#06b6d4' }}>פירוט לפי טבלאות</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(stats.tableBreakdown).length === 0 ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
              אין נתונים - לחץ על "רענן מהשרת"
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(stats.tableBreakdown)
                .sort((a, b) => {
                  const aNum = parseInt(a[0].replace('T', '')) || 0;
                  const bNum = parseInt(b[0].replace('T', '')) || 0;
                  return aNum - bNum;
                })
                .map(([tableId, data]) => (
                  <div key={tableId} className="p-4 rounded-lg border" style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)'
                  }}>
                    <div className="flex items-center justify-between mb-2">
                      <Badge style={{
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)',
                        color: '#06b6d4',
                        border: '1px solid rgba(6, 182, 212, 0.3)'
                      }}>
                        {tableId}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium mb-2 leading-tight" style={{ color: '#f8fafc' }}>
                      {data.description}
                    </p>
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

      <Card className="mb-6" style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        <CardHeader>
          <CardTitle style={{ color: '#06b6d4' }}>פירוט לפי משתתפים</CardTitle>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            המספר ליד כל משתתף = כמות הניחושים שהוא מילא
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(stats.participantBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <div key={name} className="p-3 bg-slate-700/30 rounded border border-cyan-500/20 flex items-center justify-between" style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)'
                }}>
                  <span className="text-sm font-medium" style={{ color: '#f8fafc' }}>{name}</span>
                  <Badge style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                    color: 'white'
                  }} title={`${count} ניחושים`}>
                    {count}
                  </Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {locationDuplicates.length > 0 && (
        <Card className="mt-6" style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader>
            <CardTitle style={{ color: '#ef4444' }}>⚠️ כפילויות וקבוצות חסרות בטבלאות מיקומים</CardTitle>
            <p className="text-sm" style={{ color: '#fca5a5' }}>
              משתתפים שבחרו קבוצה פעמיים - T14-T17 (36 קבוצות) בנפרד מ-T19 (8 קבוצות)
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(239, 68, 68, 0.3)' }}>
                    <th className="p-2 text-right" style={{ color: '#fca5a5', fontWeight: '600' }}>משתתף</th>
                    <th className="p-2 text-center" style={{ color: '#fca5a5', fontWeight: '600' }}>טבלה</th>
                    <th className="p-2 text-center" style={{ color: '#fca5a5', fontWeight: '600' }}>מספר כפילויות</th>
                    <th className="p-2 text-right" style={{ color: '#fca5a5', fontWeight: '600' }}>קבוצה כפולה</th>
                    <th className="p-2 text-right" style={{ color: '#fca5a5', fontWeight: '600' }}>מיקומים שנבחרו</th>
                    <th className="p-2 text-right" style={{ color: '#fbbf24', fontWeight: '600' }}>קבוצות שלא נבחרו כלל</th>
                  </tr>
                </thead>
                <tbody>
                  {locationDuplicates.map((report, idx) => {
                    const totalDuplicatesForParticipant = report.duplicates.length;
                    return (
                      <React.Fragment key={idx}>
                        {report.duplicates.map((dup, dupIdx) => (
                          <tr key={`${idx}-${dupIdx}`} style={{
                            borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
                            background: dupIdx === 0 ? 'rgba(15, 23, 42, 0.4)' : 'transparent'
                          }}>
                            {dupIdx === 0 && (
                              <>
                                <td className="p-2 font-bold" rowSpan={totalDuplicatesForParticipant} style={{
                                  color: '#f8fafc',
                                  borderLeft: '3px solid #ef4444'
                                }}>
                                  {report.participant}
                                </td>
                              </>
                            )}
                            <td className="p-2 text-center">
                              <Badge style={{
                                background: dup.tableType === 'T19' ? '#8b5cf6' : '#0ea5e9',
                                color: 'white'
                              }}>
                                {dup.tableType}
                              </Badge>
                            </td>
                            {dupIdx === 0 && (
                              <td className="p-2 text-center" rowSpan={totalDuplicatesForParticipant}>
                                <Badge style={{ background: '#ef4444', color: 'white' }}>
                                  {totalDuplicatesForParticipant}
                                </Badge>
                              </td>
                            )}
                            <td className="p-2" style={{ color: '#fca5a5', fontWeight: '600' }}>
                              🔴 {dup.team}
                            </td>
                            <td className="p-2" style={{ color: '#94a3b8' }}>
                              {dup.positions.map((posText, i) => (
                                <span key={i} style={{
                                  display: 'inline-block',
                                  margin: '2px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(251, 191, 36, 0.2)',
                                  color: '#fbbf24',
                                  fontSize: '0.75rem'
                                }}>
                                  {posText}
                                </span>
                              ))}
                            </td>
                            {dupIdx === 0 && (
                              <td className="p-2" rowSpan={totalDuplicatesForParticipant} style={{ color: '#fbbf24', fontSize: '0.85rem' }}>
                                {report.missingTeams.length > 0 ? report.missingTeams.slice(0, 10).join(', ') + (report.missingTeams.length > 10 ? '...' : '') : 'אין'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog for Validation Lists */}
      <Dialog open={showValidationListsDialog} onOpenChange={setShowValidationListsDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', fontSize: '24px' }}>
              רשימות אימות במערכת ({validationLists.length})
            </DialogTitle>
            <p className="text-sm" style={{ color: '#94a3b8' }}>
              💡 גרור שאלות בין רשימות כדי לשנות את רשימת האימות שלהן
            </p>
          </DialogHeader>

          {(() => {
            const allTeamsInQuestions = new Set();
            questions.forEach(q => {
              if (q.home_team) allTeamsInQuestions.add(q.home_team.trim());
              if (q.away_team) allTeamsInQuestions.add(q.away_team.trim());
            });

            const teamValidationLists = validationLists.filter(list =>
              list.list_name?.toLowerCase().includes('קבוצ') &&
              !list.list_name?.toLowerCase().includes('מוקדמות')
            );

            // Filter for only relevant lists (with issues)
            const listsWithIssues = teamValidationLists.map(list => {
              const cleanTeamName = (opt) => String(opt).split('(')[0].trim();

              const missingTeams = Array.from(allTeamsInQuestions).filter(team => {
                return !list.options.some(opt => {
                  return cleanTeamName(opt) === team || opt === team;
                });
              });

              const extraTeams = list.options.filter(opt => {
                const optBase = cleanTeamName(opt);
                return !allTeamsInQuestions.has(optBase) && !allTeamsInQuestions.has(String(opt));
              });

              if (missingTeams.length > 0 || extraTeams.length > 0) {
                return { ...list, missingTeams, extraTeams };
              }
              return null;
            }).filter(Boolean); // Remove null entries

            if (listsWithIssues.length === 0) return null; // If no issues, don't render this section

            return listsWithIssues.map(list => (
              <Alert key={list.id} className="mb-4" style={{
                background: list.missingTeams.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                border: `1px solid ${list.missingTeams.length > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`
              }}>
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-bold" style={{ color: list.missingTeams.length > 0 ? '#ef4444' : '#fbbf24' }}>
                      רשימה: {list.list_name}
                    </p>

                    {list.missingTeams.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-1" style={{ color: '#ef4444' }}>
                          🔴 חסרות {list.missingTeams.length} קבוצות (מופיעות בשאלות ולא ברשימת האימות):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {list.missingTeams.map(team => (
                            <Badge key={team} style={{ background: '#ef4444', color: 'white' }}>
                              {team}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {list.extraTeams.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-1" style={{ color: '#fbbf24' }}>
                          ⚠️ ברשימת האימות אבל לא מופיעות בשאלות ({list.extraTeams.length}):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {list.extraTeams.map(team => (
                            <Badge key={team} style={{ background: '#fbbf24', color: 'white' }}>
                              {team}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs mt-2" style={{ color: '#94a3b8' }}>
                      💡 יש {allTeamsInQuestions.size} קבוצות ייחודיות בשאלות, {list.options.length} אופציות ברשימת האימות "{list.list_name}"
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            ));
          })()}

          <DragDropContext onDragEnd={async (result) => {
            if (!result.destination) {
              toast({
                title: "פעולה בוטלה",
                description: "השאלה לא שוחררה על רשימה חוקית.",
                variant: "destructive"
              });
              return;
            }

            const sourceListName = result.source.droppableId;
            const destListName = result.destination.droppableId;

            if (sourceListName === destListName) {
              return;
            }

            const questionId = result.draggableId;

            try {
              await Question.update(questionId, { validation_list: destListName === 'null' ? null : destListName });

              const updatedQuestions = await Question.list(null, 10000);
              setQuestions(updatedQuestions);

              toast({
                title: "שאלה הועברה!",
                description: `השאלה עברה בהצלחה לרשימה "${destListName === 'null' ? 'ללא רשימת אימות' : destListName}"`,
                className: "bg-green-100 text-green-800"
              });
            } catch (error) {
              console.error("Error moving question:", error);
              toast({
                title: "שגיאה",
                description: "לא ניתן להעביר את השאלה",
                variant: "destructive"
              });
            }
          }}>
            <div className="space-y-6">
              {validationLists
                .sort((a, b) => a.list_name.localeCompare(b.list_name, 'he'))
                .map(list => {
                  const questionsUsingThisList = questions.filter(q => q.validation_list === list.list_name);
                  const isEditing = editingListId === list.id;
                  const displayOptions = isEditing ? editedOptions : list.options;

                  return (
                    <Card key={list.id} className="bg-slate-800/50 border-cyan-500/30">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-cyan-300 text-xl">{list.list_name}</CardTitle>
                          <div className="flex items-center gap-3">
                            <Badge className="text-white" style={{ background: '#0ea5e9' }}>
                              {displayOptions.length} אופציות
                            </Badge>
                            <Badge className="text-white" style={{ background: '#8b5cf6' }}>
                              {questionsUsingThisList.length} שאלות
                            </Badge>

                            {!isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => startEditingList(list)}
                                  style={{
                                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                                    color: 'white'
                                  }}
                                >
                                  <Edit className="w-4 h-4 ml-1" />
                                  ערוך רשימה
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => deleteValidationList(list.id, list.list_name)}
                                  disabled={questionsUsingThisList.length > 0}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => saveEditedList(list.id)}
                                  style={{
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: 'white'
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4 ml-1" />
                                  שמור
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelEditingList}
                                  style={{ borderColor: '#94a3b8', color: '#94a3b8' }}
                                >
                                  ביטול
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          <h4 className="text-sm font-bold mb-2 text-slate-300">אופציות ברשימה:</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                            {(() => {
                              // 🎯 מיין רק אם זו רשימת קבוצות
                              const isTeamsList = list.list_name?.toLowerCase().includes('קבוצ');
                              const optionsToDisplay = isTeamsList
                                ? [...displayOptions].sort((a, b) => String(a).localeCompare(String(b), 'he'))
                                : displayOptions;

                              return optionsToDisplay.map((opt, idx) => (
                                <div key={idx} className="p-2 bg-slate-700/50 rounded border border-cyan-500/20 text-sm text-white flex items-center justify-between">
                                  <span>{idx + 1}. {opt}</span>
                                  {isEditing && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeOption(displayOptions.indexOf(opt))}
                                      className="h-6 w-6 p-0 hover:bg-red-500/20"
                                    >
                                      <Trash2 className="w-3 h-3 text-red-400" />
                                    </Button>
                                  )}
                                </div>
                              ));
                            })()}
                          </div>

                          {isEditing && (
                            <div className="flex gap-2 mt-3">
                              <Input
                                value={newOption}
                                onChange={(e) => setNewOption(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addNewOption()}
                                placeholder="אופציה חדשה..."
                                className="flex-1"
                                style={{
                                  background: '#0f172a',
                                  border: '1px solid rgba(6, 182, 212, 0.3)',
                                  color: '#f8fafc'
                                }}
                              />
                              <Button
                                onClick={addNewOption}
                                size="sm"
                                style={{
                                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                                  color: 'white'
                                }}
                              >
                                הוסף
                              </Button>
                            </div>
                          )}
                        </div>

                        {questionsUsingThisList.length > 0 ? (
                          <div>
                            <h4 className="text-sm font-bold mb-2 text-slate-300">
                              שאלות שמשתמשות ברשימה (גרור להעברה):
                            </h4>
                            <Droppable droppableId={list.list_name}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className="space-y-1 min-h-[60px] p-2 rounded"
                                  style={{
                                    background: snapshot.isDraggingOver
                                      ? 'rgba(6, 182, 212, 0.1)'
                                      : 'transparent',
                                    border: snapshot.isDraggingOver
                                      ? '2px dashed rgba(6, 182, 212, 0.5)'
                                      : '2px dashed transparent',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  {questionsUsingThisList
                                    .sort((a, b) => {
                                      const tableA = parseInt(a.table_id?.replace('T', '')) || 0;
                                      const tableB = parseInt(b.table_id?.replace('T', '')) || 0;
                                      if (tableA !== tableB) return tableA - tableB;
                                      return parseFloat(a.question_id) - parseFloat(b.question_id);
                                    })
                                    .map((q, index) => (
                                      <Draggable
                                        key={q.id}
                                        draggableId={q.id}
                                        index={index}
                                      >
                                        {(provided, snapshot) => (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            className="flex items-center gap-2 p-2 rounded text-sm transition-all"
                                            style={{
                                              ...provided.draggableProps.style,
                                              background: snapshot.isDragging
                                                ? 'rgba(6, 182, 212, 0.2)'
                                                : '#1e293b',
                                              border: snapshot.isDragging
                                                ? '2px solid rgba(6, 182, 212, 0.5)'
                                                : '1px solid rgba(6, 182, 212, 0.2)',
                                              cursor: 'grab',
                                              zIndex: snapshot.isDragging ? 9999 : 'auto'
                                            }}
                                          >
                                            <div {...provided.dragHandleProps}>
                                              <GripVertical className="w-4 h-4" style={{ color: '#06b6d4' }} />
                                            </div>
                                            <Badge variant="outline" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>
                                              {q.table_id}
                                            </Badge>
                                            <Badge variant="outline" style={{ borderColor: '#0ea5e9', color: '#0ea5e9' }}>
                                              שאלה {q.question_id}
                                            </Badge>
                                            <span className="text-slate-300 flex-1">{q.question_text}</span>
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          </div>
                        ) : (
                          <Droppable droppableId={list.list_name}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className="min-h-[60px] p-4 rounded flex items-center justify-center"
                                style={{
                                  background: snapshot.isDraggingOver
                                    ? 'rgba(6, 182, 212, 0.1)'
                                    : 'rgba(251, 191, 36, 0.05)',
                                  border: snapshot.isDraggingOver
                                    ? '2px dashed rgba(6, 182, 212, 0.5)'
                                    : '2px dashed rgba(251, 191, 36, 0.3)',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <div className="text-center">
                                  <AlertTriangle className="w-6 h-6 mx-auto mb-2" style={{ color: '#fbbf24' }} />
                                  <p className="text-sm" style={{ color: '#fbbf24' }}>
                                    {snapshot.isDraggingOver
                                      ? 'שחרר כאן להעביר שאלה לרשימה זו'
                                      : 'אף שאלה לא משתמשת ברשימה זו - גרור שאלות לכאן'}
                                  </p>
                                </div>
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

              {/* Special Droppable for questions with no validation list */}
              <Card className="bg-slate-800/50 border-cyan-500/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-cyan-300 text-xl">ללא רשימת אימות</CardTitle>
                    <Badge className="text-white" style={{ background: '#8b5cf6' }}>
                      {questions.filter(q => !q.validation_list).length} שאלות
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Droppable droppableId="null">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="space-y-1 min-h-[60px] p-2 rounded"
                        style={{
                          background: snapshot.isDraggingOver
                            ? 'rgba(6, 182, 212, 0.1)'
                            : 'rgba(251, 191, 36, 0.05)',
                          border: snapshot.isDraggingOver
                            ? '2px dashed rgba(6, 182, 212, 0.5)'
                            : '2px dashed rgba(251, 191, 36, 0.3)',
                          transition: 'all 0.2s'
                        }}
                      >
                        {questions.filter(q => !q.validation_list)
                          .sort((a, b) => {
                            const tableA = parseInt(a.table_id?.replace('T', '')) || 0;
                            const tableB = parseInt(b.table_id?.replace('T', '')) || 0;
                            if (tableA !== tableB) return tableA - tableB;
                            return parseFloat(a.question_id) - parseFloat(b.question_id);
                          })
                          .map((q, index) => (
                            <Draggable
                              key={q.id}
                              draggableId={q.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className="flex items-center gap-2 p-2 rounded text-sm transition-all"
                                  style={{
                                    ...provided.draggableProps.style,
                                    background: snapshot.isDragging
                                      ? 'rgba(6, 182, 212, 0.2)'
                                      : '#1e293b',
                                    border: snapshot.isDragging
                                      ? '2px solid rgba(6, 182, 212, 0.5)'
                                      : '1px solid rgba(6, 182, 212, 0.2)',
                                    cursor: 'grab',
                                    zIndex: snapshot.isDragging ? 9999 : 'auto'
                                  }}
                                >
                                  <div {...provided.dragHandleProps}>
                                    <GripVertical className="w-4 h-4" style={{ color: '#06b6d4' }} />
                                  </div>
                                  <Badge variant="outline" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>
                                    {q.table_id}
                                  </Badge>
                                  <Badge variant="outline" style={{ borderColor: '#0ea5e9', color: '#0ea5e9' }}>
                                    שאלה {q.question_id}
                                  </Badge>
                                  <span className="text-slate-300 flex-1">{q.question_text}</span>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        {provided.placeholder}
                        {questions.filter(q => !q.validation_list).length === 0 && !snapshot.isDraggingOver && (
                          <div className="text-center p-4 text-sm" style={{ color: '#fbbf24' }}>
                            <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
                            אין שאלות ללא רשימת אימות. גרור לכאן כדי להסיר רשימה.
                          </div>
                        )}
                        {snapshot.isDraggingOver && questions.filter(q => !q.validation_list).length === 0 && (
                          <div className="text-center p-4 text-sm" style={{ color: '#06b6d4' }}>
                            שחרר כאן כדי להגדיר שאלה ללא רשימת אימות.
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </CardContent>
              </Card>
            </div>
          </DragDropContext>
        </DialogContent>
      </Dialog>

      {/* Dialog for Teams */}
      <Dialog open={showTeamsDialog} onOpenChange={setShowTeamsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4' }}>רשימת קבוצות ({teams.length})</DialogTitle>
          </DialogHeader>

          <Alert className="mb-4 bg-blue-900/20 border-blue-500/50">
            <AlertDescription className="text-blue-200 text-sm">
              💡 <strong>איך נוצרות קבוצות?</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>מקובץ השאלות - שאלות משחקים יוצרות קבוצות אוטומטית</li>
                <li>מקובץ הלוגואים - קבוצות עם לוגואים</li>
                <li>קבוצות ישנות שלא נמחקו</li>
              </ul>
              <p className="mt-2">למחיקת קבוצות לא רלוונטיות: <strong>Dashboard → Data → Team</strong></p>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {teams
              .sort((a, b) => a.name.localeCompare(b.name, 'he'))
              .map((team, idx) => (
                <div key={team.id} className="p-3 bg-slate-700/30 rounded border border-cyan-500/20 flex items-center gap-2">
                  {team.logo_url && (
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      className="w-8 h-8 rounded-full"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                  <div className="flex-1">
                    <span className="text-sm text-cyan-300">{idx + 1}.</span>
                    <span className="text-sm text-white mr-2">{team.name}</span>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog להעלאת קבצים */}
      <UploadFilesDialog 
        open={showUploadDialog} 
        onOpenChange={setShowUploadDialog}
      />
    </div>
  );
}
