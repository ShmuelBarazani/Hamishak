
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Question } from "@/entities/Question";
import { Prediction } from "@/entities/Prediction";
import { ValidationList } from "@/entities/ValidationList";
import { Loader2, CheckCircle, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// 🔥 פונקציה לנורמליזציה של שמות קבוצות
const normalizeTeamName = (name) => {
  if (!name) return name;
  return name
    .replace(/קרבאך/g, 'קרבאח')
    .replace(/קראבח/g, 'קרבאח')
    .replace(/קראבך/g, 'קרבאח')
    .trim();
};

export default function TeamComparison() {
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState([]);
  const [validationTeams, setValidationTeams] = useState([]);
  const [stats, setStats] = useState({ total: 0, matched: 0, unmatched: 0 });
  const { toast } = useToast();

  useEffect(() => {
    loadComparison();
  }, []);

  const loadComparison = async () => {
    setLoading(true);
    try {
      const predictions = await Prediction.list(null, 10000);
      console.log('📦 טעון', predictions.length, 'ניחושים');
      console.log('🔍 דוגמת ניחוש:', predictions[0]);
      
      const validationLists = await ValidationList.list(null, 1000);
      console.log('📋 טעון', validationLists.length, 'רשימות אימות');
      
      const teamList = validationLists.find(list => 
        list.list_name?.toLowerCase().includes('קבוצ') && 
        !list.list_name?.toLowerCase().includes('מוקדמות')
      );
      
      if (!teamList) {
        toast({
          title: "שגיאה",
          description: "לא נמצאה רשימת אימות של קבוצות",
          variant: "destructive"
        });
        return;
      }

      setValidationTeams(teamList.options);
      console.log('📋 רשימת האימות:', teamList.list_name, 'עם', teamList.options.length, 'קבוצות');

      const questions = await Question.list(null, 10000);
      console.log('❓ טעון', questions.length, 'שאלות');
      console.log('🔍 דוגמת שאלה:', questions[0]);
      
      const locationTableIds = ['T14', 'T15', 'T16', 'T17', 'T19'];
      const locationQuestions = questions.filter(q => locationTableIds.includes(q.table_id));
      console.log('📍 נמצאו', locationQuestions.length, 'שאלות מיקומים (T14-T17, T19)');
      console.log('📍 3 שאלות מיקומים:', locationQuestions.slice(0, 3));

      const questionIdToTable = {};
      questions.forEach(q => {
        questionIdToTable[q.question_id] = q.table_id;
      });

      console.log('🗺️ דוגמאות מהמפה:', Object.entries(questionIdToTable).slice(0, 5));
      
      console.log('🔍 10 ניחושים ראשונים עם המיפוי:');
      predictions.slice(0, 10).forEach(pred => {
        const tableId = questionIdToTable[pred.question_id];
        console.log({
          question_id: pred.question_id,
          tableId: tableId,
          prediction: pred.text_prediction,
          isLocation: locationTableIds.includes(tableId)
        });
      });

      const uniqueTeamNames = new Set();
      predictions.forEach(pred => {
        const tableId = questionIdToTable[pred.question_id];
        if (locationTableIds.includes(tableId) && pred.text_prediction) {
          // 🔥 נרמל את השם לפני הוספה ל-Set
          const normalized = normalizeTeamName(pred.text_prediction.trim());
          uniqueTeamNames.add(normalized);
        }
      });

      console.log('🔍 נמצאו', uniqueTeamNames.size, 'שמות קבוצות ייחודיים בניחושים');
      console.log('דוגמאות:', Array.from(uniqueTeamNames).slice(0, 10));

      const comparisonData = [];
      
      // 🔥 נרמל גם את רשימת האימות
      const validationTeamsSet = new Set(teamList.options.map(opt => normalizeTeamName(String(opt))));
      
      Array.from(uniqueTeamNames).forEach(predictionName => {
        let matchedName = null;
        let matchType = 'none';

        // 🔥 השוואה ישירה עם נורמליזציה
        if (validationTeamsSet.has(predictionName)) {
          // Find the original name from teamList.options that normalizes to predictionName
          // This is to display the original name from the validation list if there's an exact normalized match
          matchedName = teamList.options.find(opt => normalizeTeamName(String(opt)) === predictionName);
          matchType = 'exact';
        } else {
          const baseName = predictionName.split('(')[0].trim();
          const normalizedBaseName = normalizeTeamName(baseName); // Already normalized here from predictionName
          
          for (const validName of teamList.options) {
            const validBaseName = String(validName).split('(')[0].trim();
            const normalizedValidName = normalizeTeamName(validBaseName);
            
            // 🔥 השוואה עם נורמליזציה
            if (normalizedBaseName === normalizedValidName) {
              matchedName = validName;
              matchType = 'base_match';
              break;
            }
          }
        }

        const count = predictions.filter(p => {
          const tableId = questionIdToTable[p.question_id];
          // 🔥 השוואה עם נורמליזציה
          const normalizedPred = normalizeTeamName(p.text_prediction?.trim() || '');
          return locationTableIds.includes(tableId) && normalizedPred === predictionName;
        }).length;

        comparisonData.push({
          predictionName,
          matchedName,
          matchType,
          count
        });
      });

      console.log('📊 סה"כ', comparisonData.length, 'שמות להשוואה');

      comparisonData.sort((a, b) => {
        if (a.matchType === 'none' && b.matchType !== 'none') return -1;
        if (a.matchType !== 'none' && b.matchType === 'none') return 1;
        return a.predictionName.localeCompare(b.predictionName, 'he');
      });

      setComparison(comparisonData);

      const matched = comparisonData.filter(c => c.matchType !== 'none').length;
      const unmatched = comparisonData.filter(c => c.matchType === 'none').length;
      
      const newStats = {
        total: comparisonData.length,
        matched,
        unmatched
      };
      setStats(newStats);
      console.log('✅ סטטיסטיקות:', newStats);

    } catch (error) {
      console.error("Error loading comparison:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לטעון את הנתונים",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const performConversion = async () => {
    if (stats.unmatched > 0) {
      toast({
        title: "לא ניתן להמיר",
        description: `יש ${stats.unmatched} קבוצות ללא התאמה. תקן אותן תחילה.`,
        variant: "destructive"
      });
      return;
    }

    if (!window.confirm(`האם להמיר ${stats.matched} שמות קבוצות? פעולה זו תשנה את הניחושים!`)) {
      return;
    }

    toast({
      title: "מתחיל המרה...",
      description: "זה עשוי לקחת זמן",
      className: "bg-blue-100 text-blue-800"
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <Loader2 className="w-8 h-8 animate-spin ml-3" style={{ color: '#06b6d4' }} />
        <span style={{ color: '#06b6d4' }}>טוען נתונים...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      minHeight: '100vh'
    }}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" style={{ 
          color: '#f8fafc',
          textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
        }}>
          השוואת שמות קבוצות
        </h1>
        <p style={{ color: '#94a3b8' }}>
          בדוק את ההתאמות לפני המרת הניחושים
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)'
        }}>
          <CardContent className="p-4 text-center">
            <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>סה"כ שמות</p>
            <p className="text-3xl font-bold" style={{ color: '#06b6d4' }}>{stats.total}</p>
          </CardContent>
        </Card>

        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(16, 185, 129, 0.2)'
        }}>
          <CardContent className="p-4 text-center">
            <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>עם התאמה</p>
            <p className="text-3xl font-bold" style={{ color: '#10b981' }}>{stats.matched}</p>
          </CardContent>
        </Card>

        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          <CardContent className="p-4 text-center">
            <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>ללא התאמה</p>
            <p className="text-3xl font-bold" style={{ color: '#ef4444' }}>{stats.unmatched}</p>
          </CardContent>
        </Card>
      </div>

      {stats.unmatched > 0 && (
        <Alert className="mb-4" style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          <AlertTriangle className="w-4 h-4" style={{ color: '#ef4444' }} />
          <AlertDescription style={{ color: '#fca5a5' }}>
            יש {stats.unmatched} שמות ללא התאמה! תקן את רשימת האימות לפני המרה.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 mb-6">
        <Button
          onClick={loadComparison}
          variant="outline"
          style={{
            borderColor: 'rgba(6, 182, 212, 0.5)',
            color: '#06b6d4'
          }}
        >
          <RefreshCw className="w-4 h-4 ml-2" />
          רענן נתונים
        </Button>

        <Button
          onClick={performConversion}
          disabled={stats.unmatched > 0}
          style={{
            background: stats.unmatched === 0 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : 'rgba(71, 85, 105, 0.5)',
            color: stats.unmatched === 0 ? 'white' : '#64748b'
          }}
        >
          <CheckCircle className="w-4 h-4 ml-2" />
          בצע המרה ({stats.matched} שמות)
        </Button>
      </div>

      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)'
      }}>
        <CardHeader>
          <CardTitle style={{ color: '#06b6d4' }}>טבלת השוואה</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(6, 182, 212, 0.3)' }}>
                  <th className="p-3 text-right" style={{ color: '#94a3b8' }}>שם בניחושים</th>
                  <th className="p-3 text-center" style={{ color: '#94a3b8' }}>→</th>
                  <th className="p-3 text-right" style={{ color: '#94a3b8' }}>שם ברשימת אימות</th>
                  <th className="p-3 text-center" style={{ color: '#94a3b8' }}>סטטוס</th>
                  <th className="p-3 text-center" style={{ color: '#94a3b8' }}>כמות</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((item, idx) => (
                  <tr key={idx} style={{ 
                    borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
                    background: item.matchType === 'none' 
                      ? 'rgba(239, 68, 68, 0.1)' 
                      : 'transparent'
                  }}>
                    <td className="p-3" style={{ color: '#f8fafc' }}>
                      {item.predictionName}
                    </td>
                    <td className="p-3 text-center">
                      <ArrowRight className="w-4 h-4 mx-auto" style={{ 
                        color: item.matchType === 'none' ? '#ef4444' : '#06b6d4' 
                      }} />
                    </td>
                    <td className="p-3" style={{ 
                      color: item.matchType === 'none' ? '#fca5a5' : '#10b981',
                      fontWeight: item.matchType !== 'none' ? 'bold' : 'normal'
                    }}>
                      {item.matchedName || '❌ אין התאמה'}
                    </td>
                    <td className="p-3 text-center">
                      {item.matchType === 'exact' && (
                        <Badge style={{ background: '#10b981', color: 'white' }}>
                          ✓ זהה
                        </Badge>
                      )}
                      {item.matchType === 'base_match' && (
                        <Badge style={{ background: '#0ea5e9', color: 'white' }}>
                          ✓ מותאם
                        </Badge>
                      )}
                      {item.matchType === 'none' && (
                        <Badge style={{ background: '#ef4444', color: 'white' }}>
                          ✗ לא נמצא
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>
                        {item.count}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
