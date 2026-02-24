import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Loader2, Database, CheckCircle } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";

export default function ImportData() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [importStats, setImportStats] = useState(null);
  const [fileData, setFileData] = useState(null);
  const { toast } = useToast();
  const { refreshGames } = useGame();

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setFileData(data);
        setImportStats(data.stats);
        toast({
          title: "קובץ נטען!",
          description: `מוכן לייבוא: ${data.stats.predictions} ניחושים, ${data.stats.questions} שאלות, ${data.stats.users} משתמשים`,
          className: "bg-green-100 text-green-800"
        });
      } catch (error) {
        toast({
          title: "שגיאה",
          description: "הקובץ לא תקין. ודא שזה קובץ JSON שיוצא מעמוד הייצוא.",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const importAllData = async () => {
    if (!fileData) {
      toast({
        title: "שגיאה",
        description: "נא להעלות קובץ תחילה",
        variant: "destructive"
      });
      return;
    }

    setImporting(true);
    const { data } = fileData;

    try {
      // שלב 1: יצירת משחק חדש
      setProgress("יוצר משחק חדש...");
      
      // בניית teams_data מהקבוצות המיובאות
      const teamsData = (data.teams || []).map(t => ({
        name: t.name,
        logo_url: t.logo_url
      }));
      
      // בניית validation_lists מהרשימות המיובאות
      const validationListsData = (data.validationLists || []).map(vl => ({
        list_name: vl.list_name,
        options: vl.options
      }));
      
      const newGame = await db.Game.create({
        game_name: "טוטו ליגת אלופות (מיובא)",
        game_subtitle: "מיובא מהמערכת הישנה",
        game_description: "נתונים מלאים מטוטו ליגת אלופות",
        game_type: "mixed",
        game_icon: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909e559d350b14a5fc224bb/755e92965_2025-11-06120813.png",
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0],
        teams_data: teamsData,
        validation_lists: validationListsData,
        status: "active"
      });
      const newGameId = newGame.id;

      // שלב 2: ייבוא שאלות
      setProgress(`מייבא ${data.questions.length} שאלות...`);
      const questionMapping = {}; // מיפוי ID ישן -> ID חדש
      
      const questionsToCreate = data.questions.map(q => ({
        game_id: newGameId,
        table_id: q.table_id,
        table_text: q.table_text,
        table_description: q.table_description,
        question_id: q.question_id,
        validation_list: q.validation_list,
        game_date: q.game_date,
        possible_points: q.possible_points,
        question_text: q.question_text,
        home_team: q.home_team,
        away_team: q.away_team,
        actual_result: q.actual_result,
        actual_points: q.actual_points,
        stage_name: q.stage_name,
        round_number: q.round_number,
        stage_order: q.stage_order
      }));

      // יבוא ב-batches של 50 עם השהיות
      for (let i = 0; i < questionsToCreate.length; i += 50) {
        const batch = questionsToCreate.slice(i, i + 50);
        const created = await db.Question.bulkCreate(batch);
        
        // שמירת המיפוי
        batch.forEach((q, idx) => {
          const oldQuestion = data.questions.find(oq => 
            oq.question_id === q.question_id && oq.table_id === q.table_id
          );
          if (oldQuestion && created[idx]) {
            questionMapping[oldQuestion.id] = created[idx].id;
          }
        });
        
        setProgress(`מייבא שאלות... ${Math.min(i + 50, questionsToCreate.length)}/${questionsToCreate.length}`);
        
        // המתנה של 2 שניות בין באצ'ים
        if (i + 50 < questionsToCreate.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // שלב 3: בדיקת משתמשים קיימים
      setProgress("בודק משתמשים קיימים...");
      const existingUsers = await db.GameParticipant.filter({});
      const existingEmails = new Set(existingUsers.map(u => u.email));
      
      // יצירת מיפוי מייל -> שם מלא
      const emailToNameMap = {};
      data.users.forEach(u => {
        emailToNameMap[u.email] = u.full_name;
      });
      
      const newUsersCount = data.users.filter(u => !existingEmails.has(u.email)).length;
      
      if (newUsersCount > 0) {
        toast({
          title: "📧 משתמשים חדשים זוהו",
          description: `${newUsersCount} משתמשים יצטרכו להירשם. הניחושים שלהם כבר יהיו במערכת!`,
          className: "bg-blue-100 text-blue-800",
          duration: 8000
        });
      }

      // שלב 4: ייבוא כל הניחושים - גם למשתמשים שעדיין לא נרשמו
      setProgress(`מייבא ${data.predictions.length} ניחושים...`);
      
      const predictionsToCreate = data.predictions
        .filter(p => questionMapping[p.question_id]) // רק ניחושים לשאלות שיובאו
        .map(p => ({
          game_id: newGameId,
          question_id: questionMapping[p.question_id],
          participant_name: p.participant_name, // שומר את השם כמו שהוא!
          home_prediction: p.home_prediction,
          away_prediction: p.away_prediction,
          text_prediction: p.text_prediction,
          points_earned: p.points_earned,
          calculated_score: p.calculated_score,
          table_id: p.table_id
        }));

      // יבוא ב-batches של 200 עם השהיות
      for (let i = 0; i < predictionsToCreate.length; i += 200) {
        const batch = predictionsToCreate.slice(i, i + 200);
        await db.Prediction.bulkCreate(batch);
        setProgress(`מייבא ניחושים... ${Math.min(i + 200, predictionsToCreate.length)}/${predictionsToCreate.length}`);
        
        // המתנה של 3 שניות בין באצ'ים
        if (i + 200 < predictionsToCreate.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // שלב 5: ייבוא GameParticipants למשתמשים קיימים
      setProgress("מייבא משתתפים קיימים...");
      const participantsToCreate = data.users
        .filter(u => existingEmails.has(u.email))
        .map(u => ({
          game_id: newGameId,
          user_email: u.email,
          role_in_game: "predictor",
          joined_date: new Date().toISOString(),
          is_active: true,
          has_paid: false
        }));

      if (participantsToCreate.length > 0) {
        await db.GameParticipant.bulkCreate(participantsToCreate);
      }

      // סיום
      setProgress("ייבוא הושלם בהצלחה! ✓");
      await refreshGames();

      toast({
        title: "ייבוא הושלם!",
        description: `יובאו ${predictionsToCreate.length} ניחושים מ-${data.users.length} משתמשים, ${questionsToCreate.length} שאלות, ${teamsData.length} קבוצות ו-${validationListsData.length} רשימות אימות`,
        className: "bg-green-100 text-green-800",
        duration: 10000
      });

    } catch (error) {
      console.error("Import error:", error);
      setProgress("שגיאה בייבוא!");
      toast({
        title: "שגיאה",
        description: "הייבוא נכשל. בדוק את הקונסול לפרטים.",
        variant: "destructive"
      });
    }
    
    setImporting(false);
  };

  return (
    <div className="min-h-screen p-6" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3" style={{ 
          color: '#f8fafc',
          textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
        }}>
          <Database className="w-10 h-10" style={{ color: '#06b6d4' }} />
          ייבוא נתונים
        </h1>
        <p className="mb-8" style={{ color: '#94a3b8' }}>
          ייבא משחק מלא מקובץ JSON
        </p>

        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader>
            <CardTitle style={{ color: '#06b6d4' }}>ייבוא מלא</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert style={{
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <AlertDescription style={{ color: '#94a3b8' }}>
                <p className="font-semibold mb-2" style={{ color: '#06b6d4' }}>הוראות:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>העלה את קובץ ה-JSON שיוצא מהמערכת השנייה</li>
                  <li>בדוק את סטטיסטיקת הייבוא</li>
                  <li>לחץ "התחל ייבוא"</li>
                  <li>המערכת תיצור משחק חדש עם כל הנתונים</li>
                  <li><strong style={{ color: '#06b6d4' }}>הניחושים יישמרו גם למשתמשים שעדיין לא נרשמו!</strong></li>
                </ol>
              </AlertDescription>
            </Alert>

            <Alert style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <AlertDescription style={{ color: '#10b981' }}>
                <p className="font-semibold mb-2">💡 איך זה עובד עם משתמשים חדשים:</p>
                <ul className="text-sm space-y-1">
                  <li>✅ כל הניחושים מיובאים (גם של מי שעדיין לא נרשם)</li>
                  <li>✅ כשמשתמש יירשם עם <strong>אותו מייל</strong> - הניחושים שלו יופיעו אוטומטית</li>
                  <li>📧 ההתאמה מתבצעת לפי <strong>כתובת המייל</strong> ולא לפי שם</li>
                  <li>⚠️ חשוב: בהזמנת משתמשים - השתמש באותו מייל שהיה במערכת הקודמת</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div>
              <label 
                htmlFor="import-file" 
                className="block text-sm font-medium mb-2"
                style={{ color: '#94a3b8' }}
              >
                בחר קובץ JSON
              </label>
              <input
                id="import-file"
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                disabled={importing}
                className="w-full p-3 rounded-lg"
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  color: '#f8fafc'
                }}
              />
            </div>

            {importStats && (
              <Alert style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <AlertDescription style={{ color: '#10b981' }}>
                  <p className="font-semibold mb-2">הקובץ מכיל:</p>
                  <ul className="text-sm space-y-1">
                    <li>✓ {importStats.questions} שאלות</li>
                    <li>✓ {importStats.teams} קבוצות</li>
                    <li>✓ {importStats.validationLists} רשימות אימות</li>
                    <li>✓ {importStats.users} משתמשים</li>
                    <li>✓ {importStats.predictions} ניחושים</li>
                    {importStats.scoreTable && <li>✓ {importStats.scoreTable} רשומות ניקוד</li>}
                    {importStats.rankings && <li>✓ {importStats.rankings} דירוגים</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {progress && (
              <Alert style={{
                background: importing ? 'rgba(6, 182, 212, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                border: importing ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <AlertDescription 
                  style={{ color: importing ? '#06b6d4' : '#10b981' }} 
                  className="flex items-center gap-2"
                >
                  {importing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {progress}
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={importAllData}
              disabled={importing || !fileData}
              size="lg"
              className="w-full"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
              }}
            >
              {importing ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  מייבא נתונים...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 ml-2" />
                  התחל ייבוא
                </>
              )}
            </Button>

            <Alert style={{
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.3)'
            }}>
              <AlertDescription style={{ color: '#fbbf24' }}>
                <strong>⚠️ שים לב:</strong> הייבוא יכול לקחת מספר דקות. אל תסגור את הדף!
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}