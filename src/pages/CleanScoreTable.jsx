
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScoreTable } from "@/entities/ScoreTable";
import { Question } from "@/entities/Question";
import { Trash2, Loader2, AlertTriangle, Database } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function CleanScoreTable() {
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [t20Records, setT20Records] = useState(0);
  const { toast } = useToast();

  const loadCount = async () => {
    setLoading(true);
    try {
      // טען את כל שאלות T20
      const allQuestions = await Question.list(null, 5000);
      const t20Questions = allQuestions.filter(q => q.table_id === 'T20');
      const t20QuestionIds = t20Questions.map(q => q.id);
      
      console.log(`📊 נמצאו ${t20Questions.length} שאלות T20`);
      
      // טען את כל רשומות הניקוד
      let allScores = [];
      let offset = 0;
      while (true) {
        const batch = await ScoreTable.list(null, 5000, offset);
        allScores = allScores.concat(batch);
        if (batch.length < 5000) break;
        offset += 5000;
      }
      
      // סנן רק רשומות T20
      const t20Scores = allScores.filter(s => t20QuestionIds.includes(s.question_id));
      setT20Records(t20Scores.length);
      
      console.log(`📊 נמצאו ${t20Scores.length} רשומות ניקוד של T20`);
    } catch (error) {
      console.error("Error loading count:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCount();
  }, []);

  const deleteT20Scores = async () => {
    if (t20Records === 0) {
      toast({ title: "אין מה למחוק", description: "אין רשומות T20.", variant: "default" });
      return;
    }

    if (!window.confirm(`האם למחוק את כל ${t20Records} רשומות הניקוד של T20?\n\nהמחיקה תארך כמה דקות.\nהפעולה אינה הפיכה!`)) {
      return;
    }

    setDeleting(true);
    // Initial progress estimate, will be updated with actual count to delete
    setProgress({ current: 0, total: t20Records }); 
    
    try {
      // 🔥 טען את כל שאלות T20 וכל רשומות הניקוד של T20
      console.log("📊 טוען שאלות ורשומות T20...");
      const allQuestions = await Question.list(null, 5000);
      const t20Questions = allQuestions.filter(q => q.table_id === 'T20');
      const t20QuestionIds = t20Questions.map(q => q.id);
      
      // טען את כל רשומות הניקוד
      let allScores = [];
      let offset = 0;
      while (true) {
        const batch = await ScoreTable.list(null, 5000, offset);
        allScores = allScores.concat(batch);
        if (batch.length < 5000) break;
        offset += 5000;
      }
      
      // סנן רק רשומות T20
      const t20ScoresToDelete = allScores.filter(s => t20QuestionIds.includes(s.question_id));
      console.log(`🗑️ נמצאו ${t20ScoresToDelete.length} רשומות T20 למחיקה`);

      setProgress({ current: 0, total: t20ScoresToDelete.length });
      
      if (t20ScoresToDelete.length === 0) {
        toast({
          title: "אין מה למחוק",
          description: "לא נמצאו רשומות T20.",
          className: "bg-blue-100 text-blue-800"
        });
        setDeleting(false);
        return;
      }
      
      // 🔥 מחק אחד אחד עם delay
      let deletedCount = 0;
      for (const record of t20ScoresToDelete) {
        try {
          await ScoreTable.delete(record.id);
          deletedCount++;
          setProgress({ current: deletedCount, total: t20ScoresToDelete.length });
          
          // delay של 500ms בין מחיקות
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // הדפס כל 10 מחיקות
          if (deletedCount % 10 === 0) {
            console.log(`✅ נמחקו ${deletedCount}/${t20ScoresToDelete.length} רשומות T20`);
          }
        } catch (err) {
          if (err.response?.status === 404) {
            // הרשומה כבר לא קיימת
            console.warn(`רשומה ID ${record.id} לא נמצאה (כנראה נמחקה כבר).`);
            deletedCount++;
            setProgress({ current: deletedCount, total: t20ScoresToDelete.length });
            continue;
          }
          
          if (err.response?.status === 429) {
            // Rate limit - חכה יותר
            console.log("⏳ Rate limit - מחכה 5 שניות...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // נסה שוב
            try {
              await ScoreTable.delete(record.id);
              deletedCount++;
              setProgress({ current: deletedCount, total: t20ScoresToDelete.length });
            } catch (retryErr) {
              console.error("שגיאה גם אחרי ניסיון חוזר:", retryErr);
              throw retryErr; // אם נכשל שוב, זרוק את השגיאה
            }
          } else {
            console.error(`שגיאה במחיקת רשומה ID ${record.id}:`, err);
            throw err;
          }
        }
      }
      
      console.log(`🎉 סיום! נמחקו ${deletedCount} רשומות T20`);
      
      toast({
        title: "הצלחה!",
        description: `נמחקו ${deletedCount} רשומות ניקוד של T20.`,
        className: "bg-green-100 text-green-800"
      });
      
      await loadCount(); // Reload count to update UI
      
    } catch (error) {
      console.error("Error during deletion process:", error);
      toast({
        title: "שגיאה",
        description: `נמחקו ${progress.current} רשומות מתוך ${progress.total}. לחץ שוב כדי להמשיך!`,
        variant: "destructive"
      });
    }
    
    setDeleting(false);
  };

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-red-300 mb-2">ניקוי רשומות T20</h1>
        <p className="text-slate-400">מחיקה איטית ובטוחה של רשומות ניקוד T20 בלבד</p>
      </div>

      <Alert variant="destructive" className="mb-6 bg-red-900/50 border-red-700 text-red-200">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>אזהרה!</strong> מחיקה זו תימחק רק את רשומות הניקוד של <strong>T20</strong>.<br/>
          המחיקה תארך כמה דקות (500ms delay בין כל רשומה למניעת Rate Limit).
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800/40 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-slate-200">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              <span>רשומות ניקוד T20</span>
            </div>
            <Badge variant={t20Records > 0 ? "destructive" : "secondary"} className={t20Records > 0 ? "bg-red-800/50 text-red-200" : ""}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t20Records}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-300 mb-4">
            {loading ? 'טוען...' : `יש כרגע ${t20Records} רשומות ניקוד T20 במערכת.`}
          </p>

          {deleting && (
            <div className="space-y-3 mb-4">
              <Progress value={percentage} className="w-full h-3" />
              <div className="flex justify-between text-sm text-slate-300">
                <span>נמחק: {progress.current} / {progress.total}</span>
                <span>{percentage}%</span>
              </div>
              <p className="text-xs text-slate-400">
                ⏳ זמן משוער: ~{Math.ceil((progress.total - progress.current) * 0.5 / 60)} דקות
              </p>
            </div>
          )}

          <Button
            onClick={deleteT20Scores}
            disabled={deleting || t20Records === 0}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            {deleting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin ml-2" />
                מוחק... ({progress.current}/{progress.total})
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5 ml-2" />
                מחק רשומות T20 בלבד
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Alert className="mt-6 bg-blue-900/50 border-blue-700 text-blue-200">
        <AlertDescription>
          💡 <strong>טיפ:</strong> אחרי המחיקה, חזור ל"תוצאות אמת" ולחץ "בנה ניקוד T20 מחדש"
        </AlertDescription>
      </Alert>
    </div>
  );
}
