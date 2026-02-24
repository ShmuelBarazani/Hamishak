import React, { createContext, useState, useContext, useCallback } from 'react';
import { ValidationList, Team } from "@/entities/all";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

const UploadStatusContext = createContext();

export const useUploadStatus = () => useContext(UploadStatusContext);

// Enhanced CSV parser that handles both comma and tab separation
const parseCSV = (csvContent) => {
    const lines = csvContent.split(/\r\n|\r|\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    // Try to detect separator
    const firstLine = lines[0];
    const separator = firstLine.includes('\t') ? '\t' : ',';
    
    const header = firstLine.split(separator).map(h => h.trim().replace(/"/g, ''));
    const data = lines.slice(1).map(line => {
        const values = line.split(separator);
        const obj = {};
        header.forEach((col, index) => {
            obj[col] = values[index]?.trim().replace(/"/g, '') || '';
        });
        return obj;
    });
    return data;
};


export const UploadStatusProvider = ({ children }) => {
  const [status, setStatus] = useState({
    inProgress: false,
    message: '',
    progress: 0,
    error: null,
    warnings: [],
    results: {},
  });
  
  const { toast } = useToast();

  const startProcessing = useCallback(async (files, existingData, currentGame) => {
    // Prevent multiple simultaneous processing
    if (status.inProgress) {
        console.warn("Processing already in progress. Ignoring new request.");
        toast({
            title: "עיבוד כבר מתבצע",
            description: "נא להמתין לסיום הפעולה הנוכחית.",
            variant: "destructive"
        });
        return;
    }

    if (!currentGame) {
        toast({
            title: "שגיאה",
            description: "נא לבחור משחק תחילה",
            variant: "destructive"
        });
        return;
    }

    setStatus({
      inProgress: true,
      message: 'מתחיל עיבוד...',
      progress: 0,
      error: null,
      warnings: [],
      results: {},
    });

    const addWarning = (message) => {
      setStatus(prev => ({ ...prev, warnings: [...prev.warnings, message] }));
    };

    try {
        let finalResults = {};
        
        // Handle pasted data (Questions & Predictions)
        if (files.pasteData) {
            setStatus(prev => ({ ...prev, message: 'מפענח נתונים מהדבקה...', progress: 10 }));
            const lines = files.pasteData.split(/\r\n|\r|\n/).filter(line => line.trim());
            if (lines.length < 2) throw new Error("לא מספיק נתונים להעלאה. נדרשת לפחות שורת כותרת ושורת נתונים אחת.");

            const headerLine = lines[0].split('\t');
            const participantNames = headerLine.slice(2).map(name => name.trim()).filter(name => name);
            const dataRows = lines.slice(1);

            console.log('📋 מבנה הקובץ:', {
              totalColumns: headerLine.length,
              participants: participantNames.length,
              participantNames: participantNames.slice(0, 5)
            });
            
            // 🔍 זיהוי כפילויות פוטנציאליות
            const normalizedToOriginal = new Map();
            const duplicates = [];
            participantNames.forEach(name => {
              const normalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
              if (normalizedToOriginal.has(normalized)) {
                duplicates.push({
                  original1: normalizedToOriginal.get(normalized),
                  original2: name,
                  normalized
                });
              } else {
                normalizedToOriginal.set(normalized, name);
              }
            });
            
            if (duplicates.length > 0) {
              console.warn('⚠️ נמצאו כפילויות פוטנציאליות:', duplicates);
              addWarning(`נמצאו ${duplicates.length} כפילויות: ${duplicates.map(d => `"${d.original1}" ↔ "${d.original2}"`).join(', ')}`);
            }

            // 🔥 טען שאלות וניחושים קיימים - רק למשחק הנוכחי!
            setStatus(prev => ({ ...prev, message: 'טוען נתונים קיימים...', progress: 15 }));
            console.log(`📥 טוען ניחושים קיימים למשחק ${currentGame.id}...`);

            const existingQuestions = await base44.entities.Question.filter({ game_id: currentGame.id }, null, 10000);

            // טען את כל הניחושים במשחק - עם batching מתקדם
            let existingPredictions = [];
            let skip = 0;
            const batchSize = 10000;

            while (true) {
              console.log(`   📦 טוען batch מ-skip=${skip}...`);
              const batch = await base44.entities.Prediction.filter(
                { game_id: currentGame.id }, 
                null, 
                batchSize, 
                skip
              );

              console.log(`   ← קיבלנו ${batch.length} רשומות`);

              if (batch.length === 0) {
                console.log(`   ✅ Batch ריק - סיימנו`);
                break;
              }

              existingPredictions = existingPredictions.concat(batch);
              console.log(`   📊 סה"כ עד כה: ${existingPredictions.length} ניחושים`);

              skip += batch.length; // תמיד התקדם לפי מה שקיבלנו
            }

            console.log(`✅ סה"כ נטענו ${existingPredictions.length} ניחושים קיימים`);

            const existingQuestionsMap = new Map(
              existingQuestions.map(q => [`${q.table_id}|${q.question_id}`, q])
            );
            
            // נרמול שמות משתתפים - הסרת רווחים מיותרים ואחידות
            const normalizeParticipantName = (name) => {
              if (!name) return '';
              return name.trim().replace(/\s+/g, ' ').toLowerCase();
            };
            
            const existingPredMap = new Map(
              existingPredictions.map(p => [`${p.question_id}|${normalizeParticipantName(p.participant_name)}`, true])
            );
            console.log(`✅ ${existingQuestions.length} שאלות קיימות, ${existingPredictions.length} ניחושים קיימים`);

            const questionsToCreate = [];
            const predictionsToCreate = [];
            const teamsSet = new Set();
            
            dataRows.forEach((line, index) => {
              const cells = line.split('\t').map(cell => cell?.trim() || '');
              
              // מבנה פשוט: עמודה 0=טבלה, עמודה 1=שאלה, עמודות 2+=ניחושים
              if (cells.length < 3 || !cells[0] || !cells[1]) {
                if (index < 5) console.log(`⚠️ שורה ${index + 2}: חסר - cells.length=${cells.length}, [0]="${cells[0]}", [1]="${cells[1]}"`);
                return;
              }
              
              const tableId = cells[0];
              const questionId = cells[1];
              
              // מצא שאלה קיימת במערכת
              const existingQ = existingQuestionsMap.get(`${tableId}|${questionId}`);
              
              if (!existingQ) {
                if (index < 3) console.log(`❌ שורה ${index + 2}: שאלה "${tableId}|${questionId}" לא נמצאה במערכת`);
                return;
              }
              
              if (index < 3) {
                console.log(`✅ שורה ${index + 2}: שאלה "${tableId}|${questionId}" -> ID ${existingQ.id}`);
              }

              // לולאה על משתתפים
              participantNames.forEach((name, pIdx) => {
                const cellIndex = pIdx + 2; // עמודות 0,1 = טבלה+שאלה
                const predValue = cells[cellIndex]?.trim();
                
                if (predValue) {
                  const predData = { 
                    question_id: existingQ.id, 
                    table_id: tableId, 
                    participant_name: name.trim(), // ✅ וודא שהשם נקי
                    text_prediction: predValue,
                    game_id: currentGame.id // ✅ הוסף game_id
                  };
                  
                  // תוצאת משחק X-Y
                  if (predValue.includes('-')) {
                    const parts = predValue.split('-');
                    if (parts.length === 2) {
                      const home = parseInt(parts[0], 10);
                      const away = parseInt(parts[1], 10);
                      if (!isNaN(home) && !isNaN(away)) { 
                        predData.home_prediction = home; 
                        predData.away_prediction = away; 
                      }
                    }
                  }
                  
                  predictionsToCreate.push(predData);
                  
                  if (index < 2 && pIdx < 2) {
                    console.log(`📝 ניחוש: ${name} -> ${tableId}-${questionId} = "${predValue}"`);
                  }
                }
              });
            });

            let savedQuestions = [];
            if (questionsToCreate.length > 0) {
              setStatus(prev => ({ ...prev, message: `יוצר ${questionsToCreate.length} שאלות חדשות...`, progress: 30 }));
              savedQuestions = await base44.entities.Question.bulkCreate(questionsToCreate);
            }

            setStatus(prev => ({ ...prev, message: 'מסנן ניחושים חסרים...', progress: 40 }));
            const questionIdMap = new Map(savedQuestions.map(q => [`${q.table_id}|${q.question_id}`, q.id]));

            // סנן רק ניחושים שחסרים במערכת
            let debugCount = 0;
            const finalPredictions = predictionsToCreate
              .map(p => {
                const qId = questionIdMap.get(`${p.table_id}|${p.question_id}`) || p.question_id;
                return { ...p, question_id: qId };
              })
              .filter(p => {
                const normalizedName = normalizeParticipantName(p.participant_name);
                const key = `${p.question_id}|${normalizedName}`;
                const exists = existingPredMap.has(key);
                
                // דבאג: הצג 10 ניחושים ראשונים
                if (debugCount < 10) {
                  console.log(`🔍 ניחוש: ${p.table_id} | שאלה ${p.question_id} | משתתף "${p.participant_name}" → "${normalizedName}" | qId=${p.question_id?.substring(0, 8)}... | exists=${exists}`);
                  debugCount++;
                }
                
                return p.question_id && !exists;
              });

            const skippedCount = predictionsToCreate.length - finalPredictions.length;
            console.log(`📊 סה"כ ניחושים:`, {
              total: predictionsToCreate.length,
              new: finalPredictions.length,
              skipped: skippedCount,
              existingInSystem: existingPredictions.length
            });

            if(finalPredictions.length > 0) {
              setStatus(prev => ({ ...prev, message: `שומר ${finalPredictions.length} ניחושים חדשים...`, progress: 50 }));
              
              // 🔥 שמור בקבוצות של 50 עם delay
              const BATCH_SIZE = 50;
              const DELAY_MS = 500;
              let savedCount = 0;
              
              for (let i = 0; i < finalPredictions.length; i += BATCH_SIZE) {
                const batch = finalPredictions.slice(i, i + BATCH_SIZE);
                console.log(`💾 שומר batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalPredictions.length / BATCH_SIZE)}: ${batch.length} ניחושים`);
                
                try {
                  await base44.entities.Prediction.bulkCreate(batch);
                  savedCount += batch.length;
                  console.log(`   ✅ נשמרו ${batch.length} ניחושים (סה"כ ${savedCount}/${finalPredictions.length})`);
                  
                  // עדכון progress
                  const progress = 50 + Math.floor((savedCount / finalPredictions.length) * 40);
                  setStatus(prev => ({ ...prev, message: `שומר ניחושים: ${savedCount}/${finalPredictions.length}`, progress }));
                  
                  // delay בין batches
                  if (i + BATCH_SIZE < finalPredictions.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                  }
                } catch (error) {
                  console.error(`❌ שגיאה בשמירת batch:`, error);
                  throw new Error(`נכשל batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
                }
              }
              
              console.log(`✅ הסתיים! נשמרו ${savedCount} ניחושים חדשים`);
            }

            const teamsToSave = Array.from(teamsSet).map(name => ({ name }));
            if (teamsToSave.length > 0) {
              setStatus(prev => ({ ...prev, message: `שומר ${teamsToSave.length} קבוצות...`, progress: 60 }));
              await base44.entities.Team.bulkCreate(teamsToSave);
            }

            finalResults.paste = `נשמרו ${savedQuestions.length} שאלות חדשות ו-${finalPredictions.length} ניחושים חדשים${skippedCount > 0 ? ` (${skippedCount} ניחושים כבר היו קיימים)` : ''}.`;
            }

        // Enhanced Validation Lists File handling
        if (files.validation) {
            setStatus(prev => ({ ...prev, message: 'מעבד רשימות אימות...', progress: 70 }));
            const fileContent = await files.validation.text();
            const parsedData = parseCSV(fileContent);
            
            console.log('Parsed validation data:', parsedData);

            if (parsedData.length > 0) {
                const groupedLists = {};
                
                parsedData.forEach(row => {
                    // Try different possible column names
                    const listName = row.list_name || row['list_name'] || row.רשימה || row.שם_רשימה || row['שם רשימה'];
                    const option = row.option || row.אפשרות || row.ערך || row.value;
                    
                    if (listName && option) {
                        if (!groupedLists[listName]) {
                            groupedLists[listName] = [];
                        }
                        groupedLists[listName].push(option);
                    }
                });

                console.log('Grouped validation lists:', groupedLists);

                const validationListsToCreate = Object.entries(groupedLists).map(([list_name, options]) => ({
                    list_name,
                    options,
                }));
                
                if (validationListsToCreate.length > 0) {
                    await ValidationList.bulkCreate(validationListsToCreate);
                    finalResults.validation = `נשמרו ${validationListsToCreate.length} רשימות אימות עם ${Object.values(groupedLists).flat().length} אפשרויות.`;
                } else {
                    addWarning('לא נמצאו רשימות אימות תקינות בקובץ. ודא שיש עמודות list_name ו-option.');
                }
            }
        }
        
        // Handle Logos File
        if (files.logos) {
            setStatus(prev => ({ ...prev, message: 'מעבד לוגואים...', progress: 85 }));
            const fileContent = await files.logos.text();
            const parsedData = parseCSV(fileContent);

            if(parsedData.length > 0) {
                const existingTeams = await Team.list(null, 5000);
                const teamsMap = new Map(existingTeams.map(t => [t.name, t]));
                
                const teamsToCreate = [];
                const updatePromises = [];

                for (const row of parsedData) {
                    const teamName = row.name || row["שם הקבוצה"];
                    const logoUrl = row.logo_url || row["URL"];

                    if (teamName && logoUrl) {
                        if (teamsMap.has(teamName)) {
                            const team = teamsMap.get(teamName);
                            if(team.logo_url !== logoUrl) {
                               updatePromises.push(Team.update(team.id, { logo_url: logoUrl }));
                            }
                        } else {
                            teamsToCreate.push({ name: teamName, logo_url: logoUrl });
                        }
                    }
                }
                
                if (teamsToCreate.length > 0) {
                    await Team.bulkCreate(teamsToCreate);
                }
                
                if (updatePromises.length > 0) {
                    await Promise.all(updatePromises);
                }
                
                finalResults.logos = `נוצרו ${teamsToCreate.length} קבוצות ועודכנו ${updatePromises.length} לוגואים.`;
            }
        }

        setStatus(prev => ({
          ...prev,
          inProgress: false,
          message: 'העיבוד הסתיים!',
          progress: 100,
          error: null,
          results: finalResults,
        }));
        toast({ title: "הקבצים עובדו בהצלחה!" });

    } catch (err) {
        console.error("Upload processing error:", err);
        setStatus(prev => ({ 
          ...prev, 
          inProgress: false, 
          error: err.message, 
          progress: 0 
        }));
        toast({ title: "שגיאה בעיבוד", description: err.message, variant: "destructive" });
    }
  }, [toast, status.inProgress]);

  return (
    <UploadStatusContext.Provider value={{ status, startProcessing }}>
      {children}
    </UploadStatusContext.Provider>
  );
};