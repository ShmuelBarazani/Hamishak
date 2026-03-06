import React, { createContext, useState, useContext, useCallback } from 'react';
import { Question } from "@/entities/Question";
import { Prediction } from "@/entities/Prediction";
import { ValidationList } from "@/entities/ValidationList";
import { Team } from "@/entities/Team";
import { useToast } from "@/components/ui/use-toast";

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

  const startProcessing = useCallback(async (files, existingData) => {
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
            const participantNames = headerLine.slice(8).map(name => name.trim()).filter(name => name);
            const dataRows = lines.slice(1);
            
            const questionsToCreate = [];
            const predictionsToCreate = [];
            const teamsSet = new Set();
            
            dataRows.forEach((line, index) => {
              const cells = line.split('\t');
              if (cells.length < 7 || !cells[0]?.trim() || !cells[2]?.trim()) {
                addWarning(`שורה ${index + 2} לא עובדה: חסר מידע חיוני.`);
                return;
              }
              const question = {
                table_id: cells[0]?.trim(), table_description: cells[1]?.trim(), question_id: cells[2]?.trim(),
                validation_list: cells[3]?.trim(), game_date: cells[4]?.trim() || null, possible_points: parseInt(cells[5]?.trim(), 10) || 0,
                question_text: cells[6]?.trim(), actual_result: cells[7]?.trim() || null, home_team: null, away_team: null,
              };
              if (question.question_text?.includes('נגד')) {
                const teams = question.question_text.split('נגד').map(t => t.trim());
                if (teams.length === 2) { question.home_team = teams[0]; question.away_team = teams[1]; teamsSet.add(teams[0]); teamsSet.add(teams[1]); }
              }
              questionsToCreate.push(question);
              participantNames.forEach(name => {
                const pIndex = headerLine.indexOf(name);
                if (pIndex >= 8 && cells[pIndex]?.trim()) {
                  const predData = { question_id: question.question_id, table_id: question.table_id, participant_name: name, text_prediction: cells[pIndex].trim() };
                  if (predData.text_prediction.includes('-')) {
                    const parts = predData.text_prediction.split('-');
                    if (parts.length === 2) {
                      const home = parseInt(parts[0], 10), away = parseInt(parts[1], 10);
                      if (!isNaN(home) && !isNaN(away)) { predData.home_prediction = home; predData.away_prediction = away; }
                    }
                  }
                  predictionsToCreate.push(predData);
                }
              });
            });

            setStatus(prev => ({ ...prev, message: `יוצר ${questionsToCreate.length} שאלות...`, progress: 30 }));
            const savedQuestions = await Question.bulkCreate(questionsToCreate);
            const questionIdMap = new Map(savedQuestions.map(q => [`${q.table_id}|${q.question_id}`, q.id]));
            const finalPredictions = predictionsToCreate.map(p => ({ ...p, question_id: questionIdMap.get(`${p.table_id}|${p.question_id}`) })).filter(p => p.question_id);
            
            if(finalPredictions.length > 0) {
              setStatus(prev => ({ ...prev, message: `יוצר ${finalPredictions.length} ניחושים...`, progress: 50 }));
              await Prediction.bulkCreate(finalPredictions);
            }
            const teamsToSave = Array.from(teamsSet).map(name => ({ name }));
            if (teamsToSave.length > 0) {
              setStatus(prev => ({ ...prev, message: `שומר ${teamsToSave.length} קבוצות...`, progress: 60 }));
              await Team.bulkCreate(teamsToSave);
            }
            
            finalResults.paste = `נשמרו ${savedQuestions.length} שאלות ו-${finalPredictions.length} ניחושים.`;
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
                await Promise.all(updatePromises);
                
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
