import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Question } from "@/entities/Question";
import { ValidationList } from "@/entities/ValidationList";
import { AlertTriangle, CheckCircle, Loader2, Database } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function FixValidationLists() {
  const [loading, setLoading] = useState(true);
  const [validationLists, setValidationLists] = useState([]);
  const [questions, setQuestions] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [lists, qs] = await Promise.all([
        ValidationList.list(null, 1000),
        Question.list(null, 10000)
      ]);

      setValidationLists(lists);
      setQuestions(qs);

    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לטעון נתונים",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // 🔍 מצא רשימות קבוצות
  const teamLists = validationLists.filter(list => 
    list.list_name?.toLowerCase().includes('קבוצ')
  );

  // 🔍 מצא שאלות T14-T17 ובדוק איזו רשימה הן משתמשות
  const locationQuestions = questions.filter(q => 
    ['T14', 'T15', 'T16', 'T17'].includes(q.table_id)
  );

  const usedListsInLocations = [...new Set(locationQuestions.map(q => q.validation_list).filter(Boolean))];

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl" style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      minHeight: '100vh'
    }}>
      <h1 className="text-3xl font-bold mb-6 text-cyan-400">
        <Database className="w-8 h-8 inline ml-2" />
        בדיקת רשימות אימות
      </h1>

      <Card className="mb-6 bg-slate-800/50 border-cyan-500/30">
        <CardHeader>
          <CardTitle className="text-cyan-400">סיכום רשימות קבוצות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-white">
            <p className="mb-4">נמצאו <strong>{teamLists.length}</strong> רשימות קבוצות במערכת:</p>
            
            {teamLists.map(list => (
              <div key={list.id} className="mb-4 p-4 bg-slate-700/30 rounded border border-cyan-500/20">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-cyan-300 text-lg">{list.list_name}</h3>
                  <span className="text-sm text-slate-400">{list.options.length} קבוצות</span>
                </div>
                
                <div className="text-xs text-slate-300 space-y-1 max-h-60 overflow-y-auto">
                  {list.options.map((opt, idx) => (
                    <div key={idx} className="p-1 bg-slate-800/50 rounded">
                      {idx + 1}. {opt}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 bg-slate-800/50 border-cyan-500/30">
        <CardHeader>
          <CardTitle className="text-cyan-400">רשימות בשימוש בשאלות T14-T17</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-white">
            <p className="mb-4">שאלות מיקומים (T14-T17) משתמשות ב-<strong>{usedListsInLocations.length}</strong> רשימות:</p>
            
            {usedListsInLocations.length === 0 ? (
              <Alert className="bg-red-900/20 border-red-500/50">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <AlertDescription className="text-red-200">
                  לא נמצאו רשימות אימות לשאלות T14-T17!
                </AlertDescription>
              </Alert>
            ) : usedListsInLocations.length > 1 ? (
              <Alert className="bg-yellow-900/20 border-yellow-500/50">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <AlertDescription className="text-yellow-200">
                  <strong>בעיה!</strong> שאלות שונות משתמשות ברשימות שונות:
                  <ul className="list-disc list-inside mt-2">
                    {usedListsInLocations.map(listName => (
                      <li key={listName}>{listName}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-green-900/20 border-green-500/50">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <AlertDescription className="text-green-200">
                  כל השאלות משתמשות ברשימה: <strong>{usedListsInLocations[0]}</strong>
                </AlertDescription>
              </Alert>
            )}

            <div className="mt-4 text-sm text-slate-300">
              <p className="font-bold mb-2">פירוט שאלות:</p>
              {locationQuestions.map(q => (
                <div key={q.id} className="p-2 mb-1 bg-slate-700/20 rounded">
                  <span className="text-cyan-300">{q.table_id}</span> - 
                  <span className="text-slate-400 mr-2">שאלה {q.question_id}</span> - 
                  <span className="text-white mr-2">רשימה: {q.validation_list || "❌ אין"}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
