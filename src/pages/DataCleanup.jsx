
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Question, Prediction, ValidationList, Team, ScoreTable } from "@/entities/all";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, CheckCircle, AlertTriangle, Database, RefreshCw } from "lucide-react";

export default function DataCleanup() {
  const [deleting, setDeleting] = useState({});
  const [results, setResults] = useState({});
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const loadCounts = async () => {
    setLoading(true);
    try {
      const [questions, predictions, validationLists, teams, scoreTables] = await Promise.all([
        Question.list(null, 10000).then(res => res.length),
        Prediction.list(null, 10000).then(res => res.length),
        ValidationList.list(null, 1000).then(res => res.length),
        Team.list(null, 1000).then(res => res.length),
        ScoreTable.list(null, 10000).then(res => res.length)
      ]);

      setCounts({
        'שאלות': questions,
        'ניחושים': predictions,
        'רשימות אימות': validationLists,
        'קבוצות': teams,
        'טבלת ניקוד': scoreTables
      });
    } catch (error) {
      console.error("Error loading counts:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCounts();
  }, []);

  const deleteEntity = async (entityName, entityClass) => {
    const totalCount = counts[entityName] || 0;
    
    if (totalCount === 0) {
      alert(`אין ${entityName} למחיקה!`);
      return;
    }

    const confirmMessage = `האם אתה בטוח שברצונך למחוק את כל ${totalCount} ה${entityName}? פעולה זו אינה הפיכה!`;
    
    if (!window.confirm(confirmMessage)) return;
    
    setDeleting(prev => ({ ...prev, [entityName]: true }));
    setResults(prev => ({ 
      ...prev, 
      [entityName]: { 
        progress: true, 
        deleted: 0,
        total: totalCount,
        percentage: 0
      } 
    }));
    
    try {
      let deletedCount = 0;
      let recordsToDelete;
      let loopGuard = 0;

      do {
        loopGuard++;
        recordsToDelete = await entityClass.list(null, 50);
        
        if (recordsToDelete.length > 0) {
          for (const record of recordsToDelete) {
             try {
                await entityClass.delete(record.id);
                deletedCount++;
             } catch (err) {
                 // אם הרשומה כבר לא קיימת - זה בסדר, ממשיכים
                 const isNotFound = err.response?.status === 404 || 
                                   err.message?.includes('not found') ||
                                   err.response?.data?.message?.includes('not found');
                 
                 if (isNotFound) {
                    deletedCount++;
                    console.log(`רשומה ${record.id} כבר נמחקה, ממשיכים...`);
                 } else {
                    console.error(`שגיאה במחיקת רשומה ${record.id}:`, err.message);
                    throw err;
                 }
             }

             const percentage = totalCount > 0 ? Math.min(100, Math.round((deletedCount / totalCount) * 100)) : 100;
              
             setResults(prev => ({ 
                ...prev, 
                [entityName]: { 
                  ...prev[entityName],
                  deleted: deletedCount,
                  percentage: percentage
                } 
             }));

             await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      } while (recordsToDelete.length > 0 && loopGuard < 1000);

      setResults(prev => ({ 
        ...prev, 
        [entityName]: { success: true, count: deletedCount } 
      }));
      
    } catch (error) {
      console.error(`Error deleting ${entityName}:`, error);
      const errorMessage = error.response?.data?.message || error.message;
      setResults(prev => ({ 
        ...prev, 
        [entityName]: { success: false, error: errorMessage } 
      }));
    } finally {
        await loadCounts();
        setDeleting(prev => ({ ...prev, [entityName]: false }));
    }
  };

  const deleteAllData = async () => {
    const totalItems = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (totalItems === 0) {
      alert("אין נתונים למחיקה במערכת.");
      return;
    }
    
    const confirmAll = window.confirm(`האם אתה בטוח שברצונך למחוק את כל הנתונים מכל הסוגים? (${totalItems} פריטים בסך הכל). הפעולה אינה הפיכה!`);
    if (confirmAll) {
      await deleteEntity('טבלת ניקוד', ScoreTable);
      await deleteEntity('ניחושים', Prediction);
      await deleteEntity('שאלות', Question);
      await deleteEntity('רשימות אימות', ValidationList);
      await deleteEntity('קבוצות', Team);
      alert("מחיקת כל הנתונים הושלמה!");
    }
  };

  const CleanupCard = ({ title, entityClass, entityName }) => {
    const result = results[entityName];
    const count = counts[entityName] || 0;
    const isDeleting = deleting[entityName];

    return (
      <Card className="h-full flex flex-col bg-slate-800/40 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-slate-200">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              <span>{title}</span>
            </div>
            <Badge 
              variant={count > 0 ? "destructive" : "secondary"} 
              className={count > 0 ? "bg-red-800/50 text-red-200 border-red-700" : ""}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : count}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col justify-between">
           <p className="text-sm text-slate-400 mb-4">
             יש כרגע {loading ? '...' : `${count} `}
             {title.toLowerCase()} במערכת.
          </p>
          
          {isDeleting && result?.progress && (
            <div className="space-y-2 mb-4">
              <Progress value={result.percentage} className="w-full" />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{`נמחק: ${result.deleted} / ${result.total}`}</span>
                <span>{result.percentage}%</span>
              </div>
            </div>
          )}

          {!isDeleting && result && (
            <Alert className={`mb-4 ${result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <div className="flex items-center gap-2">
                {result.success ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-green-800 text-sm">{`נמחקו ${result.count} פריטים`}</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-red-800 text-xs">שגיאה: {result.error}</span>
                  </>
                )}
              </div>
            </Alert>
          )}

          <Button
            onClick={() => deleteEntity(entityName, entityClass)}
            disabled={isDeleting || count === 0}
            variant="destructive"
            className="w-full"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
                מוחק...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 ml-2" />
                מחק את כל ה{title}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-red-300 mb-2">מחיקת נתונים</h1>
          <p className="text-slate-400">מחיקה יסודית של כל הנתונים. <strong>הפעולה אינה הפיכה!</strong></p>
        </div>
        <Button onClick={loadCounts} disabled={loading} variant="outline" className="border-red-400 text-red-200 bg-slate-700/50 hover:bg-red-600/20">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          רענן ספירה
        </Button>
      </div>

      <Alert variant="destructive" className="mb-6 bg-red-900/50 border-red-700 text-red-200">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>אזהרה חמורה!</AlertTitle>
        <AlertDescription>
           כל כפתור מחיקה יתחיל תהליך שימחק את <strong>כל</strong> הנתונים מאותו סוג, אחד אחרי השני. התהליך לוקח זמן ואין דרך חזרה.
        </AlertDescription>
      </Alert>

      <Card className="mb-8 bg-red-900/20 border-red-800">
        <CardHeader>
          <CardTitle className="text-red-200">מחיקה כללית</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-red-300">הכפתור הבא יפעיל מחיקה של כל הנתונים מכל הסוגים, אחד אחרי השני. יש להשתמש בזהירות רבה.</p>
          <Button
            variant="destructive"
            onClick={deleteAllData}
            disabled={Object.values(deleting).some(v => v)}
            className="w-full md:w-auto"
          >
            <Trash2 className="w-5 h-5 ml-2"/>
            מחק את כל נתוני המערכת
          </Button>
        </CardContent>
      </Card>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <CleanupCard title="טבלת ניקוד" entityClass={ScoreTable} entityName="טבלת ניקוד" />
        <CleanupCard title="ניחושים" entityClass={Prediction} entityName="ניחושים" />
        <CleanupCard title="שאלות" entityClass={Question} entityName="שאלות" />
        <CleanupCard title="רשימות אימות" entityClass={ValidationList} entityName="רשימות אימות" />
        <CleanupCard title="קבוצות" entityClass={Team} entityName="קבוצות" />
      </div>
    </div>
  );
}
