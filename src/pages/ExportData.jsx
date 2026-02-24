import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Loader2, Database, CheckCircle } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";

export default function ExportData() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");
  const { toast } = useToast();

  const exportAllData = async () => {
    setExporting(true);
    setProgress("מתחיל ייצוא...");

    try {
      // שלב 1: משחק
      setProgress("טוען נתוני משחק...");
      const games = await db.Game.list(null, 100);
      
      // שלב 2: שאלות
      setProgress("טוען שאלות...");
      const questions = await db.Question.list(null, 5000);
      
      // שלב 3: קבוצות
      setProgress("טוען קבוצות...");
      const teams = await db.Team.list(null, 100);
      
      // שלב 4: רשימות אימות
      setProgress("טוען רשימות אימות...");
      const validationLists = await db.ValidationList.list(null, 100);
      
      // שלב 5: משתמשים
      setProgress("טוען משתמשים...");
      const users = await db.GameParticipant.filter({});
      
      // שלב 6: ניחושים
      setProgress("טוען ניחושים... (זה יכול לקחת זמן)");
      const predictions = await db.Prediction.list(null, 30000);
      
      // שלב 7: GameParticipants
      setProgress("טוען משתתפי משחק...");
      const gameParticipants = await db.GameParticipant.list(null, 200);

      // שלב 8: Rankings
      setProgress("טוען דירוגים...");
      let rankings = [];
      try {
        rankings = await db.Ranking.list(null, 200);
      } catch (e) {
        console.log("No rankings found");
      }

      // יצירת אובייקט הנתונים
      const exportData = {
        export_date: new Date().toISOString(),
        export_source: "טוטו ליגת אלופות",
        data: {
          games,
          questions,
          teams,
          validationLists,
          users,
          predictions,
          gameParticipants,
          rankings
        },
        stats: {
          games: games.length,
          questions: questions.length,
          teams: teams.length,
          validationLists: validationLists.length,
          users: users.length,
          predictions: predictions.length,
          gameParticipants: gameParticipants.length,
          rankings: rankings.length
        }
      };

      // יצירת קובץ להורדה
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `toto-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProgress("הייצוא הושלם! הקובץ הורד בהצלחה ✓");
      
      toast({
        title: "ייצוא הושלם!",
        description: `יוצאו ${predictions.length} ניחושים, ${questions.length} שאלות, ${users.length} משתמשים ועוד...`,
        className: "bg-green-100 text-green-800"
      });

    } catch (error) {
      console.error("Export error:", error);
      setProgress("שגיאה בייצוא!");
      toast({
        title: "שגיאה",
        description: "הייצוא נכשל. בדוק את הקונסול לפרטים.",
        variant: "destructive"
      });
    }
    
    setExporting(false);
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
          ייצוא נתונים
        </h1>
        <p className="mb-8" style={{ color: '#94a3b8' }}>
          ייצא את כל נתוני המערכת לקובץ JSON
        </p>

        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <CardHeader>
            <CardTitle style={{ color: '#06b6d4' }}>ייצוא מלא</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert style={{
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <AlertDescription style={{ color: '#94a3b8' }}>
                <p className="font-semibold mb-2" style={{ color: '#06b6d4' }}>מה יוצא?</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>כל המשחקים והגדרותיהם</li>
                  <li>כל השאלות (כולל תוצאות אמת)</li>
                  <li>כל הקבוצות והלוגואים</li>
                  <li>רשימות אימות</li>
                  <li>כל המשתמשים</li>
                  <li>כל הניחושים של כל המשתתפים</li>
                  <li>משתתפי משחק ותפקידיהם</li>
                  <li>דירוגים</li>
                </ul>
              </AlertDescription>
            </Alert>

            {progress && (
              <Alert style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <AlertDescription style={{ color: '#10b981' }} className="flex items-center gap-2">
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {progress}
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={exportAllData}
              disabled={exporting}
              size="lg"
              className="w-full"
              style={{
                background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
              }}
            >
              {exporting ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  מייצא נתונים...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 ml-2" />
                  התחל ייצוא
                </>
              )}
            </Button>

            <Alert style={{
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.3)'
            }}>
              <AlertDescription style={{ color: '#fbbf24' }}>
                <strong>⚠️ שים לב:</strong> הייצוא יכול לקחת מספר דקות בגלל כמות הנתונים הגדולה!
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}