import React, { createContext, useState, useContext, useCallback } from 'react';
import * as db from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";

const UploadStatusContext = createContext();
export const useUploadStatus = () => useContext(UploadStatusContext);

const parseCSV = (csvContent) => {
  const lines = csvContent.split(/\r\n|\r|\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const firstLine = lines[0];
  const separator = firstLine.includes('\t') ? '\t' : ',';
  const header = firstLine.split(separator).map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(separator);
    const obj = {};
    header.forEach((col, index) => { obj[col] = values[index]?.trim().replace(/"/g, '') || ''; });
    return obj;
  });
};

export const UploadStatusProvider = ({ children }) => {
  const [status, setStatus] = useState({
    inProgress: false, message: '', progress: 0, error: null, warnings: [], results: {},
  });
  const { toast } = useToast();

  const startProcessing = useCallback(async (files, existingData, currentGame) => {
    if (status.inProgress) {
      toast({ title: "עיבוד כבר מתבצע", variant: "destructive" });
      return;
    }
    if (!currentGame) {
      toast({ title: "שגיאה", description: "נא לבחור משחק תחילה", variant: "destructive" });
      return;
    }

    setStatus({ inProgress: true, message: 'מתחיל עיבוד...', progress: 0, error: null, warnings: [], results: {} });

    const addWarning = (msg) => setStatus(prev => ({ ...prev, warnings: [...prev.warnings, msg] }));

    try {
      let finalResults = {};

      // Handle pasted data
      if (files.pasteData) {
        setStatus(prev => ({ ...prev, message: 'מפענח נתונים...', progress: 10 }));
        const lines = files.pasteData.split(/\r\n|\r|\n/).filter(line => line.trim());
        if (lines.length < 2) throw new Error("לא מספיק נתונים. נדרשת לפחות שורת כותרת ושורת נתונים אחת.");

        const headerLine = lines[0].split('\t');
        const participantNames = headerLine.slice(2).map(name => name.trim()).filter(name => name);
        const dataRows = lines.slice(1);

        setStatus(prev => ({ ...prev, message: 'טוען נתונים קיימים...', progress: 15 }));

        const existingQuestions = await db.Question.filter({ game_id: currentGame.id }, null, 10000);

        let existingPredictions = [];
        let skip = 0;
        while (true) {
          const batch = await db.Prediction.filter({ game_id: currentGame.id }, null, 10000, skip);
          if (batch.length === 0) break;
          existingPredictions = existingPredictions.concat(batch);
          skip += batch.length;
        }

        const normalizeParticipantName = (name) => name?.trim().replace(/\s+/g, ' ').toLowerCase() || '';

        const existingQuestionsMap = new Map(existingQuestions.map(q => [`${q.table_id}|${q.question_id}`, q]));
        const existingPredMap = new Map(existingPredictions.map(p => [`${p.question_id}|${normalizeParticipantName(p.participant_name)}`, true]));

        const predictionsToCreate = [];

        dataRows.forEach((line) => {
          const cells = line.split('\t').map(cell => cell?.trim() || '');
          if (cells.length < 3 || !cells[0] || !cells[1]) return;

          const tableId = cells[0];
          const questionId = cells[1];
          const existingQ = existingQuestionsMap.get(`${tableId}|${questionId}`);
          if (!existingQ) return;

          participantNames.forEach((name, pIdx) => {
            const predValue = cells[pIdx + 2]?.trim();
            if (predValue) {
              const predData = {
                question_id: existingQ.id,
                table_id: tableId,
                participant_name: name.trim(),
                text_prediction: predValue,
                game_id: currentGame.id
              };
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
            }
          });
        });

        setStatus(prev => ({ ...prev, message: 'מסנן ניחושים חסרים...', progress: 40 }));

        const finalPredictions = predictionsToCreate.filter(p => {
          const normalizedName = normalizeParticipantName(p.participant_name);
          return p.question_id && !existingPredMap.has(`${p.question_id}|${normalizedName}`);
        });

        const skippedCount = predictionsToCreate.length - finalPredictions.length;

        if (finalPredictions.length > 0) {
          const BATCH_SIZE = 50;
          let savedCount = 0;
          for (let i = 0; i < finalPredictions.length; i += BATCH_SIZE) {
            const batch = finalPredictions.slice(i, i + BATCH_SIZE);
            await db.Prediction.bulkCreate(batch);
            savedCount += batch.length;
            const progress = 50 + Math.floor((savedCount / finalPredictions.length) * 40);
            setStatus(prev => ({ ...prev, message: `שומר ניחושים: ${savedCount}/${finalPredictions.length}`, progress }));
            if (i + BATCH_SIZE < finalPredictions.length) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }

        finalResults.paste = `נשמרו ${finalPredictions.length} ניחושים חדשים${skippedCount > 0 ? ` (${skippedCount} כבר היו קיימים)` : ''}.`;
      }

      // Handle validation lists
      if (files.validation) {
        setStatus(prev => ({ ...prev, message: 'מעבד רשימות אימות...', progress: 70 }));
        const fileContent = await files.validation.text();
        const parsedData = parseCSV(fileContent);

        if (parsedData.length > 0) {
          const groupedLists = {};
          parsedData.forEach(row => {
            const listName = row.list_name || row['שם רשימה'];
            const option = row.option || row['אפשרות'];
            if (listName && option) {
              if (!groupedLists[listName]) groupedLists[listName] = [];
              groupedLists[listName].push(option);
            }
          });

          const listsToCreate = Object.entries(groupedLists).map(([list_name, options]) => ({ list_name, options }));
          if (listsToCreate.length > 0) {
            await db.ValidationList.bulkCreate(listsToCreate);
            finalResults.validation = `נשמרו ${listsToCreate.length} רשימות אימות.`;
          } else {
            addWarning('לא נמצאו רשימות אימות תקינות בקובץ.');
          }
        }
      }

      // Handle logos
      if (files.logos) {
        setStatus(prev => ({ ...prev, message: 'מעבד לוגואים...', progress: 85 }));
        const fileContent = await files.logos.text();
        const parsedData = parseCSV(fileContent);

        if (parsedData.length > 0) {
          const existingTeams = await db.Team.list(null, 5000);
          const teamsMap = new Map(existingTeams.map(t => [t.name, t]));
          const teamsToCreate = [];
          const updatePromises = [];

          for (const row of parsedData) {
            const teamName = row.name || row["שם הקבוצה"];
            const logoUrl = row.logo_url || row["URL"];
            if (teamName && logoUrl) {
              if (teamsMap.has(teamName)) {
                const team = teamsMap.get(teamName);
                if (team.logo_url !== logoUrl) updatePromises.push(db.Team.update(team.id, { logo_url: logoUrl }));
              } else {
                teamsToCreate.push({ name: teamName, logo_url: logoUrl });
              }
            }
          }

          if (teamsToCreate.length > 0) await db.Team.bulkCreate(teamsToCreate);
          if (updatePromises.length > 0) await Promise.all(updatePromises);
          finalResults.logos = `נוצרו ${teamsToCreate.length} קבוצות ועודכנו ${updatePromises.length} לוגואים.`;
        }
      }

      setStatus(prev => ({ ...prev, inProgress: false, message: 'העיבוד הסתיים!', progress: 100, error: null, results: finalResults }));
      toast({ title: "הקבצים עובדו בהצלחה!" });

    } catch (err) {
      console.error("Upload processing error:", err);
      setStatus(prev => ({ ...prev, inProgress: false, error: err.message, progress: 0 }));
      toast({ title: "שגיאה בעיבוד", description: err.message, variant: "destructive" });
    }
  }, [toast, status.inProgress]);

  const setUploadStatus = (newStatus) => setStatus(prev => ({ ...prev, ...newStatus }));

  return (
    <UploadStatusContext.Provider value={{ status, startProcessing, setUploadStatus }}>
      {children}
    </UploadStatusContext.Provider>
  );
};
