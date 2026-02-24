
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, Crown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { calculateQuestionScore } from "@/components/scoring/ScoreCalculator";

export default function Leaderboard() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantDetails, setParticipantDetails] = useState(null);
  const { toast } = useToast();

  const loadAllData = async (entityClass, maxTotal = 40000) => {
    const allData = [];
    const batchSize = 1000;
    let offset = 0;
    
    while (offset < maxTotal) {
      const batch = await entityClass.list(null, batchSize);
      if (batch.length === 0) break;
      allData.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
      await new Promise(resolve => setTimeout(resolve, 100)); // המתנה קצרה בין אצוות
    }
    
    return allData;
  };

  const loadRankings = useCallback(async () => {
    setLoading(true);
    try {
      const allRankings = await Ranking.list("-current_score", 1000);
      allRankings.sort((a, b) => a.current_position - b.current_position);
      setRankings(allRankings);
    } catch (error) {
      console.error("Error loading rankings:", error);
      toast({ title: "שגיאה", description: "טעינת הדירוג נכשלה", variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadRankings();
  }, [loadRankings]);

  const calculateScores = async () => {
    setCalculating(true);
    try {
      console.log("טוען שאלות...");
      const allQuestions = await loadAllData(Question);
      console.log(`נטענו ${allQuestions.length} שאלות`);
      
      console.log("טוען ניחושים...");
      const allPredictions = await loadAllData(Prediction);
      console.log(`נטענו ${allPredictions.length} ניחושים`);

      const scores = {};
      
      for (const pred of allPredictions) {
        const question = allQuestions.find(q => q.id === pred.question_id);
        if (!question) continue;
        
        const score = calculateQuestionScore(question, pred.text_prediction);
        
        if (score > 0) {
          if (!scores[pred.participant_name]) {
            scores[pred.participant_name] = 0;
          }
          scores[pred.participant_name] += score;
        }
      }

      console.log("ניקודים סופיים:", scores);

      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const existingRankings = await Ranking.list(null, 1000);
      const existingMap = {};
      existingRankings.forEach(r => { existingMap[r.participant_name] = r; });

      for (let i = 0; i < sorted.length; i++) {
        const [name, score] = sorted[i];
        const position = i + 1;
        const existing = existingMap[name];
        
        const data = {
          participant_name: name,
          current_score: score,
          current_position: position,
          previous_score: existing ? existing.current_score : 0,
          previous_position: existing ? existing.current_position : 0,
          score_change: existing ? score - existing.current_score : score,
          position_change: existing ? existing.current_position - position : 0,
          last_updated: new Date().toISOString()
        };

        if (existing) {
          await Ranking.update(existing.id, data);
        } else {
          await Ranking.create(data);
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      toast({ title: "הצלחה!", description: `עודכן עבור ${sorted.length} משתתפים` });
      loadRankings();
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    }
    setCalculating(false);
  };

  const loadParticipantDetails = async (participantName) => {
    try {
      const allQuestions = await loadAllData(Question);
      const predictions = await Prediction.filter({ participant_name: participantName }, null, 10000);
      
      const scoredQuestions = [];

      for (const pred of predictions) {
        const question = allQuestions.find(q => q.id === pred.question_id);
        if (!question || !question.actual_result || question.actual_result === '__CLEAR__') continue;
        
        const score = calculateQuestionScore(question, pred.text_prediction);
        if (score === null || score === 0) continue;
        
        const isIsraeliTable = question.table_id === 'T20';
        const maxScore = (question?.home_team && question?.away_team) ? (isIsraeliTable ? 6 : 10) : (question?.possible_points || 10);

        scoredQuestions.push({
          questionId: question.question_id,
          tableId: question.table_id,
          questionText: question.question_text,
          prediction: pred.text_prediction,
          actualResult: question.actual_result,
          gameDate: question.game_date,
          score: score,
          maxScore: maxScore
        });
      }

      scoredQuestions.sort((a, b) => {
        const tableA = a.tableId || '';
        const tableB = b.tableId || '';
        if (tableA !== tableB) {
          return (parseInt(tableA.replace('T', '')) || 0) - (parseInt(tableB.replace('T', '')) || 0);
        }
        return (parseFloat(a.questionId) || 0) - (parseFloat(b.questionId) || 0);
      });

      const totalScore = scoredQuestions.reduce((sum, q) => sum + q.score, 0);

      setParticipantDetails({
        name: participantName,
        questions: scoredQuestions,
        totalScore: totalScore
      });
      setSelectedParticipant(participantName);
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "שגיאה", description: "טעינת הפרטים נכשלה", variant: "destructive" });
    }
  };

  const getPositionIcon = (position) => {
    if (position === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (position === 2) return <Trophy className="w-5 h-5 text-gray-400" />;
    if (position === 3) return <Trophy className="w-5 h-5 text-orange-400" />;
    return null;
  };

  const getPositionChangeIcon = (change) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const formatScore = (score) => {
    if (!score || score === '__CLEAR__') return '';
    if (score.includes('-')) {
      const parts = score.split('-').map(x => x.trim());
      return parts.join(' - ');
    }
    return score;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="mr-3 text-blue-300">טוען דירוג...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" />
            טבלת הדירוג
          </h1>
        </div>
        <Button onClick={calculateScores} disabled={calculating} size="lg" className="bg-blue-600 hover:bg-blue-700">
          {calculating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin ml-2" />
              מחשב...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5 ml-2" />
              חשב ניקוד מחדש
            </>
          )}
        </Button>
      </div>

      {rankings.length === 0 ? (
        <Card className="bg-slate-800/40 border-slate-700">
          <CardContent className="p-8 text-center">
            <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">אין דירוג. לחץ על "חשב ניקוד מחדש"</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-800/40 border-slate-700">
          <CardHeader>
            <CardTitle className="text-blue-200">הדירוג הנוכחי</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div style={{ maxHeight: '600px', overflow: 'auto' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#334155' }}>
                  <tr style={{ borderBottom: '2px solid #475569' }}>
                    <th className="text-blue-200 text-right p-3" style={{ backgroundColor: '#334155' }}>מיקום</th>
                    <th className="text-blue-200 text-right p-3" style={{ backgroundColor: '#334155' }}>שם</th>
                    <th className="text-blue-200 text-right p-3" style={{ backgroundColor: '#334155' }}>ניקוד נוכחי</th>
                    <th className="text-blue-200 text-right p-3" style={{ backgroundColor: '#334155' }}>מיקום קודם</th>
                    <th className="text-blue-200 text-right p-3" style={{ backgroundColor: '#334155' }}>ניקוד קודם</th>
                    <th className="text-blue-200 text-right p-3" style={{ backgroundColor: '#334155' }}>שינוי בניקוד</th>
                    <th className="text-blue-200 text-right p-3" style={{ backgroundColor: '#334155' }}>שינוי במיקום</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((rank) => (
                    <tr key={rank.id} className="hover:bg-slate-700/30" style={{ borderBottom: '1px solid #475569' }}>
                      <td className="text-right p-3">
                        <div className="flex items-center justify-end gap-2">
                          {getPositionIcon(rank.current_position)}
                          <span className="text-slate-200 font-bold text-lg">{rank.current_position}</span>
                        </div>
                      </td>
                      <td className="font-medium text-slate-200 text-lg cursor-pointer hover:text-blue-300 hover:underline text-right p-3" onClick={() => loadParticipantDetails(rank.participant_name)}>
                        {rank.participant_name}
                      </td>
                      <td className="text-right p-3">
                        <Badge className="bg-blue-600 text-white text-lg px-4 py-2">{rank.current_score}</Badge>
                      </td>
                      <td className="text-right text-slate-300 p-3">{rank.previous_position || '-'}</td>
                      <td className="text-right text-slate-300 p-3">{rank.previous_score || '0'}</td>
                      <td className="text-right p-3">
                        <div className="flex items-center justify-end gap-1">
                          {rank.score_change > 0 && <Badge className="bg-green-700/50 text-green-200">+{rank.score_change}</Badge>}
                          {rank.score_change < 0 && <Badge className="bg-red-700/50 text-red-200">{rank.score_change}</Badge>}
                          {rank.score_change === 0 && <Badge variant="secondary" className="bg-slate-600 text-slate-300">0</Badge>}
                        </div>
                      </td>
                      <td className="text-right p-3">
                        <div className="flex items-center justify-end gap-1">
                          {rank.position_change > 0 ? getPositionChangeIcon(1) : rank.position_change < 0 ? getPositionChangeIcon(-1) : getPositionChangeIcon(0)}
                          <span className={`font-medium ${rank.position_change > 0 ? 'text-green-400' : rank.position_change < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            {rank.position_change !== 0 ? Math.abs(rank.position_change) : '-'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={selectedParticipant !== null} onOpenChange={() => setSelectedParticipant(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] bg-slate-800 border-slate-700 flex flex-col" dir="rtl">
          <DialogHeader className="flex-shrink-0 pb-4 border-b border-slate-700">
            <DialogTitle className="text-2xl font-bold text-blue-200 text-right">{participantDetails?.name}</DialogTitle>
            <div className="flex items-center gap-4 mt-2">
              <Badge className="bg-blue-600 text-white text-lg px-4 py-2">סה"כ: {participantDetails?.totalScore} נקודות</Badge>
              <span className="text-slate-300">{participantDetails?.questions.length} שאלות עם ניקוד</span>
            </div>
          </DialogHeader>
          <div className="flex-1" style={{ overflow: 'auto' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#1e293b' }}>
                <tr style={{ borderBottom: '2px solid #475569' }}>
                  <th className="text-blue-200 text-right p-2" style={{ backgroundColor: '#1e293b' }}>טבלה</th>
                  <th className="text-blue-200 text-right p-2" style={{ backgroundColor: '#1e293b' }}>מס'</th>
                  <th className="text-blue-200 text-right p-2" style={{ backgroundColor: '#1e293b' }}>שאלה</th>
                  <th className="text-blue-200 text-right p-2" style={{ backgroundColor: '#1e293b' }}>ניחוש</th>
                  <th className="text-blue-200 text-right p-2" style={{ backgroundColor: '#1e293b' }}>תוצאה</th>
                  <th className="text-blue-200 text-center p-2" style={{ backgroundColor: '#1e293b' }}>ניקוד</th>
                </tr>
              </thead>
              <tbody>
                {participantDetails?.questions.map((q, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #475569' }}>
                    <td className="text-right p-2">
                      <Badge variant="outline" className="border-purple-400 text-purple-200 text-xs">{q.tableId}</Badge>
                    </td>
                    <td className="text-right p-2">
                      <Badge variant="outline" className="border-blue-400 text-blue-200 text-xs">{q.questionId}</Badge>
                    </td>
                    <td className="text-slate-200 text-sm text-right p-2">{q.questionText}</td>
                    <td className="font-medium text-slate-100 text-right p-2">{formatScore(q.prediction)}</td>
                    <td className="font-medium text-green-300 text-right p-2">{formatScore(q.actualResult)}</td>
                    <td className="text-center p-2">
                      <Badge className={`${q.score === q.maxScore ? 'bg-green-700 text-green-100' : q.score >= q.maxScore * 0.7 ? 'bg-blue-700 text-blue-100' : 'bg-orange-700 text-orange-100'} text-sm font-bold px-3 py-1`}>
                        {q.score}/{q.maxScore}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
