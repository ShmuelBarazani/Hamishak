import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, Users, TrendingUp, Target, Network, Zap } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import * as db from "@/api/entities";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, ZAxis
} from 'recharts';

const COLORS = {
  english: '#1e40af',
  spanish: '#dc2626', 
  italian: '#10b981',
  german: '#f59e0b',
  french: '#8b5cf6',
  israeli: '#0ea5e9',
  other: '#64748b'
};

const normalizeTeamName = (name) => {
  if (!name) return name;
  return name.replace(/קרבאך/g, 'קרבאח').replace(/קראבח/g, 'קרבאח').replace(/קראבך/g, 'קרבאח').trim();
};

const cleanTeamName = (name) => {
  if (!name) return name;
  return name.split('(')[0].trim();
};

export default function InsightsAnalyzer({ allQuestions, allPredictions }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [insights, setInsights] = useState(null);

  const analyzeLeagueCamps = () => {
    const countryTeams = {
      english: ['מנצ\'סטר סיטי', 'ארסנל', 'ליברפול', 'אסטון וילה', 'צ\'לסי', 'מנצ\'סטר יונייטד', 'ניוקאסל'],
      spanish: ['ריאל מדריד', 'ברצלונה', 'אתלטיקו מדריד', 'ג\'ירונה', 'אתלטיק בילבאו'],
      italian: ['אינטר', 'מילאן', 'יובנטוס', 'אטלנטה', 'בולוניה'],
      german: ['באיירן מינכן', 'ליברקוזן', 'דורטמונד', 'לייפציג', 'שטוטגרט'],
      french: ['פ.ס.ז\'', 'מונקו', 'ברסט', 'ליל'],
      israeli: ['מכבי תל אביב', 'מכבי חיפה']
    };

    const participants = {};
    
    allPredictions.forEach(pred => {
      if (!participants[pred.participant_name]) {
        participants[pred.participant_name] = {
          english: 0, spanish: 0, italian: 0, 
          german: 0, french: 0, israeli: 0, other: 0, total: 0
        };
      }
      
      const cleanPred = cleanTeamName(normalizeTeamName(pred.text_prediction || ''));
      
      let found = false;
      Object.entries(countryTeams).forEach(([country, teams]) => {
        if (teams.some(t => cleanPred.includes(t))) {
          participants[pred.participant_name][country]++;
          participants[pred.participant_name].total++;
          found = true;
        }
      });
      
      if (!found && cleanPred && cleanPred.length > 0) {
        participants[pred.participant_name].other++;
        participants[pred.participant_name].total++;
      }
    });

    const camps = { english: 0, spanish: 0, italian: 0, german: 0, french: 0, israeli: 0, balanced: 0 };
    const campDetails = [];

    Object.entries(participants).forEach(([name, data]) => {
      if (data.total > 0) {
        const ratios = {
          english: data.english / data.total,
          spanish: data.spanish / data.total,
          italian: data.italian / data.total,
          german: data.german / data.total,
          french: data.french / data.total,
          israeli: data.israeli / data.total
        };

        const dominant = Object.entries(ratios).reduce((a, b) => b[1] > a[1] ? b : a);
        
        if (dominant[1] > 0.4) {
          camps[dominant[0]]++;
          campDetails.push({ name, camp: dominant[0], ratio: (dominant[1] * 100).toFixed(1) });
        } else {
          camps.balanced++;
          campDetails.push({ name, camp: 'balanced', ratio: '0' });
        }
      }
    });

    const chartData = [
      { name: 'אנגליה', value: camps.english, color: COLORS.english },
      { name: 'ספרד', value: camps.spanish, color: COLORS.spanish },
      { name: 'איטליה', value: camps.italian, color: COLORS.italian },
      { name: 'גרמניה', value: camps.german, color: COLORS.german },
      { name: 'צרפת', value: camps.french, color: COLORS.french },
      { name: 'ישראל', value: camps.israeli, color: COLORS.israeli },
      { name: 'מאוזנים', value: camps.balanced, color: COLORS.other }
    ].filter(item => item.value > 0);

    return { camps, campDetails, chartData, totalParticipants: Object.keys(participants).length };
  };

  const analyzeParticipantStyles = () => {
    const participants = {};
    
    allPredictions.forEach(pred => {
      if (!participants[pred.participant_name]) {
        participants[pred.participant_name] = {
          draws: 0,
          highScores: 0,
          lowScores: 0,
          yesAnswers: 0,
          noAnswers: 0,
          totalGames: 0,
          totalAnswers: 0
        };
      }
      
      if (pred.text_prediction && pred.text_prediction.includes('-')) {
        const [home, away] = pred.text_prediction.split('-').map(x => parseInt(x));
        if (!isNaN(home) && !isNaN(away)) {
          participants[pred.participant_name].totalGames++;
          const totalGoals = home + away;
          
          if (home === away) participants[pred.participant_name].draws++;
          if (totalGoals >= 5) participants[pred.participant_name].highScores++;
          if (totalGoals <= 1) participants[pred.participant_name].lowScores++;
        }
      }
      
      if (pred.text_prediction === 'כן') {
        participants[pred.participant_name].yesAnswers++;
        participants[pred.participant_name].totalAnswers++;
      } else if (pred.text_prediction === 'לא') {
        participants[pred.participant_name].noAnswers++;
        participants[pred.participant_name].totalAnswers++;
      }
    });
    
    const styles = { conservative: [], gambler: [], optimist: [], realistic: [] };
    
    Object.entries(participants).forEach(([name, data]) => {
      if (data.totalGames > 0) {
        const drawRatio = data.draws / data.totalGames;
        const highScoreRatio = data.highScores / data.totalGames;
        const lowScoreRatio = data.lowScores / data.totalGames;
        const yesRatio = data.totalAnswers > 0 ? data.yesAnswers / data.totalAnswers : 0;
        
        const optimismScore = (highScoreRatio * 50) + (yesRatio * 50);
        const conservatismScore = (drawRatio * 40) + (lowScoreRatio * 60);
        
        let style = 'realistic';
        if (conservatismScore > 30) {
          style = 'conservative';
          styles.conservative.push({ name, score: conservatismScore });
        } else if (optimismScore > 40) {
          style = 'optimist';
          styles.optimist.push({ name, score: optimismScore });
        } else if (highScoreRatio > 0.35) {
          style = 'gambler';
          styles.gambler.push({ name, score: highScoreRatio * 100 });
        } else {
          styles.realistic.push({ name, score: 50 });
        }
      }
    });
    
    const chartData = [
      { name: 'שמרנים', value: styles.conservative.length, color: COLORS.other },
      { name: 'הימוריים', value: styles.gambler.length, color: COLORS.german },
      { name: 'אופטימיים', value: styles.optimist.length, color: COLORS.italian },
      { name: 'ריאליסטים', value: styles.realistic.length, color: COLORS.french }
    ].filter(item => item.value > 0);

    return { styles, chartData };
  };

  const analyzeQuestionCorrelations = () => {
    const questionPairs = [];
    
    // 🔥 הגבלת מספר השאלות לבדיקה למניעת תקיעה
    const questionsToCheck = allQuestions.slice(0, 50);
    
    questionsToCheck.forEach((q1, i) => {
      questionsToCheck.slice(i + 1, i + 20).forEach(q2 => {
        const q1Predictions = allPredictions.filter(p => p.question_id === q1.id);
        const q2Predictions = allPredictions.filter(p => p.question_id === q2.id);
        
        let matches = 0;
        q1Predictions.forEach(p1 => {
          const p2 = q2Predictions.find(p => p.participant_name === p1.participant_name);
          if (p2 && p1.text_prediction && p2.text_prediction) {
            if (cleanTeamName(p1.text_prediction) === cleanTeamName(p2.text_prediction)) {
              matches++;
            }
          }
        });
        
        const correlation = q1Predictions.length > 0 ? matches / q1Predictions.length : 0;
        
        if (correlation > 0.4) {
          questionPairs.push({
            q1: q1.question_text,
            q2: q2.question_text,
            strength: (correlation * 100).toFixed(1)
          });
        }
      });
    });
    
    return questionPairs.slice(0, 10);
  };

  const analyzeOptimismVsConservatism = () => {
    const participants = {};
    
    allPredictions.forEach(pred => {
      if (!participants[pred.participant_name]) {
        participants[pred.participant_name] = {
          highScores: 0,
          draws: 0,
          totalGames: 0
        };
      }
      
      if (pred.text_prediction && pred.text_prediction.includes('-')) {
        const [home, away] = pred.text_prediction.split('-').map(x => parseInt(x));
        if (!isNaN(home) && !isNaN(away)) {
          participants[pred.participant_name].totalGames++;
          if (home + away >= 5) participants[pred.participant_name].highScores++;
          if (home === away) participants[pred.participant_name].draws++;
        }
      }
    });
    
    const scatterData = [];
    Object.entries(participants).forEach(([name, data]) => {
      if (data.totalGames > 5) {
        const optimism = (data.highScores / data.totalGames) * 100;
        const conservatism = (data.draws / data.totalGames) * 100;
        scatterData.push({ name, optimism, conservatism, z: data.totalGames });
      }
    });
    
    return scatterData;
  };

  const generateDeepNarrative = async (analysisData) => {
    try {
      const { leagueCamps, participantStyles, correlations, optimismVsConservatism } = analysisData;
      
      const prompt = `
אתה אנליסט ספורט מומחה. נתח את הנתונים הבאים על ${leagueCamps.totalParticipants} משתתפים בטוטו ליגת האלופות וצור תובנות מעמיקות:

**מחנות לפי ליגות:**
- מחנה אנגלי: ${leagueCamps.camps.english} משתתפים (${((leagueCamps.camps.english / leagueCamps.totalParticipants) * 100).toFixed(1)}%)
- מחנה ספרדי: ${leagueCamps.camps.spanish} משתתפים (${((leagueCamps.camps.spanish / leagueCamps.totalParticipants) * 100).toFixed(1)}%)
- מחנה איטלקי: ${leagueCamps.camps.italian} משתתפים (${((leagueCamps.camps.italian / leagueCamps.totalParticipants) * 100).toFixed(1)}%)
- מחנה גרמני: ${leagueCamps.camps.german} משתתפים (${((leagueCamps.camps.german / leagueCamps.totalParticipants) * 100).toFixed(1)}%)
- מחנה ישראלי: ${leagueCamps.camps.israeli} משתתפים (${((leagueCamps.camps.israeli / leagueCamps.totalParticipants) * 100).toFixed(1)}%)
- מאוזנים: ${leagueCamps.camps.balanced} משתתפים

**סגנונות ניחוש:**
- שמרנים: ${participantStyles.styles.conservative.length}
- הימוריים: ${participantStyles.styles.gambler.length}
- אופטימיים: ${participantStyles.styles.optimist.length}
- ריאליסטים: ${participantStyles.styles.realistic.length}

**קורלציות מעניינות:**
${correlations.map(c => `- "${c.q1}" ↔ "${c.q2}" (קשר: ${c.strength}%)`).join('\n')}

צור 5-7 תובנות מעמיקות ומפתיעות בעברית:
1. תובנה על המחנות הדומיננטיים
2. תובנה על קשר בין סגנון לבחירת קבוצות
3. תובנה על הקורלציות המעניינות ביותר
4. תובנה על משתתפים ייחודיים
5. תובנה כללית על דפוסי החשיבה הקולקטיבית

כתוב בצורה אנליטית אך מעניינת, עם מספרים ואחוזים.
`;

      // InvokeLLM removed - needs backend
      const response = { content: "תכונה זו דורשת הגדרת backend" }; /*
        prompt: prompt,
        add_context_from_internet: false
      });
      
      return response || 'מתבצע ניתוח...';
      
    } catch (error) {
      console.error('Error generating narrative:', error);
      return 'לא ניתן ליצור תובנות כרגע';
    }
  };

  const analyzeData = async () => {
    setAnalyzing(true);
    try {
      console.log('🧠 מתחיל ניתוח תובנות מתקדם...');
      
      // 1️⃣ זיהוי מחנות לפי מדינות
      console.log('📊 מנתח מחנות...');
      const leagueCamps = analyzeLeagueCamps();
      
      // 2️⃣ סיווג משתתפים לפי סגנון ניחוש
      console.log('🎯 מנתח סגנונות...');
      const participantStyles = analyzeParticipantStyles();
      
      // 3️⃣ ניתוח קורלציות בין שאלות
      console.log('🔗 מנתח קורלציות...');
      const correlations = analyzeQuestionCorrelations();
      
      // 4️⃣ דפוסי אופטימיות מול שמרנות
      console.log('📈 מנתח דפוסים...');
      const optimismVsConservatism = analyzeOptimismVsConservatism();
      
      // 5️⃣ הפקת תובנות נרטיביות
      console.log('🧠 יוצר תובנות...');
      const narrative = await generateDeepNarrative({
        leagueCamps,
        participantStyles,
        correlations,
        optimismVsConservatism
      });
      
      setInsights({
        leagueCamps,
        participantStyles,
        correlations,
        optimismVsConservatism,
        narrative
      });
      
      console.log('✅ הניתוח הושלם!');
      
    } catch (error) {
      console.error('❌ Error analyzing insights:', error);
      alert('שגיאה בניתוח: ' + error.message);
    }
    setAnalyzing(false);
  };

  if (!insights) {
    return (
      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
            <Brain className="w-6 h-6" />
            ניתוח תובנות AI מתקדם
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <Brain className="w-16 h-16 mx-auto mb-4" style={{ color: '#06b6d4', opacity: 0.5 }} />
          <p className="text-slate-400 mb-6">
            ניתוח מעמיק של מחנות, קורלציות, דפוסי חשיבה וסגנונות ניחוש
          </p>
          <Button
            onClick={analyzeData}
            disabled={analyzing}
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
            }}
            className="text-white hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin ml-2" />
                מנתח...
              </>
            ) : (
              <>
                <Brain className="w-5 h-5 ml-2" />
                התחל ניתוח מתקדם
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* תובנות נרטיביות */}
      <Card style={{
        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%)',
        border: '1px solid rgba(6, 182, 212, 0.3)'
      }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
            <Brain className="w-6 h-6" />
            תובנות מרכזיות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-slate-200 leading-relaxed whitespace-pre-line text-lg">
            {insights.narrative}
          </div>
        </CardContent>
      </Card>

      {/* גרף מחנות ליגות */}
      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)'
      }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
            <Network className="w-5 h-5" />
            חלוקת מחנות לפי ליגות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={insights.leagueCamps.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {insights.leagueCamps.chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* גרף סגנונות */}
      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)'
      }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
            <Target className="w-5 h-5" />
            סגנונות ניחוש
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={insights.participantStyles.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {insights.participantStyles.chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* אופטימיות מול שמרנות */}
      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)'
      }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
            <TrendingUp className="w-5 h-5" />
            אופטימיות מול שמרנות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid stroke="#334155" />
              <XAxis 
                type="number" 
                dataKey="optimism" 
                name="אופטימיות" 
                unit="%"
                stroke="#94a3b8"
                label={{ value: 'אופטימיות (%)', position: 'insideBottom', offset: -10, fill: '#94a3b8' }}
              />
              <YAxis 
                type="number" 
                dataKey="conservatism" 
                name="שמרנות" 
                unit="%"
                stroke="#94a3b8"
                label={{ value: 'שמרנות (%)', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
              />
              <ZAxis type="number" dataKey="z" range={[100, 400]} />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  background: '#1e293b',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  borderRadius: '8px'
                }}
                formatter={(value, name) => {
                  if (name === 'אופטימיות' || name === 'שמרנות') {
                    return `${value.toFixed(1)}%`;
                  }
                  return value;
                }}
              />
              <Scatter name="משתתפים" data={insights.optimismVsConservatism} fill="#06b6d4" />
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* קורלציות */}
      {insights.correlations.length > 0 && (
        <Card style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)'
        }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
              <Zap className="w-5 h-5" />
              קורלציות מעניינות בין שאלות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.correlations.map((corr, idx) => (
                <div key={idx} className="p-3 rounded-lg" style={{
                  background: 'rgba(6, 182, 212, 0.1)',
                  border: '1px solid rgba(6, 182, 212, 0.2)'
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-300">{corr.q1}</span>
                    <Badge style={{ background: '#06b6d4' }}>{corr.strength}%</Badge>
                  </div>
                  <div className="text-sm text-slate-400">↕️ {corr.q2}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* סטטיסטיקות מפורטות */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card style={{
          background: 'linear-gradient(135deg, rgba(30, 100, 175, 0.2) 0%, rgba(30, 100, 175, 0.1) 100%)',
          border: '1px solid rgba(30, 100, 175, 0.3)'
        }}>
          <CardContent className="p-4">
            <Users className="w-8 h-8 mb-2" style={{ color: COLORS.english }} />
            <p className="text-sm text-slate-400">מחנה אנגלי</p>
            <p className="text-3xl font-bold text-white">{insights.leagueCamps.camps.english}</p>
            <p className="text-xs text-slate-500">
              {((insights.leagueCamps.camps.english / insights.leagueCamps.totalParticipants) * 100).toFixed(1)}% מהמשתתפים
            </p>
          </CardContent>
        </Card>

        <Card style={{
          background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
          border: '1px solid rgba(220, 38, 38, 0.3)'
        }}>
          <CardContent className="p-4">
            <Users className="w-8 h-8 mb-2" style={{ color: COLORS.spanish }} />
            <p className="text-sm text-slate-400">מחנה ספרדי</p>
            <p className="text-3xl font-bold text-white">{insights.leagueCamps.camps.spanish}</p>
            <p className="text-xs text-slate-500">
              {((insights.leagueCamps.camps.spanish / insights.leagueCamps.totalParticipants) * 100).toFixed(1)}% מהמשתתפים
            </p>
          </CardContent>
        </Card>

        <Card style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(14, 165, 233, 0.1) 100%)',
          border: '1px solid rgba(14, 165, 233, 0.3)'
        }}>
          <CardContent className="p-4">
            <Users className="w-8 h-8 mb-2" style={{ color: COLORS.israeli }} />
            <p className="text-sm text-slate-400">מחנה ישראלי</p>
            <p className="text-3xl font-bold text-white">{insights.leagueCamps.camps.israeli}</p>
            <p className="text-xs text-slate-500">
              {((insights.leagueCamps.camps.israeli / insights.leagueCamps.totalParticipants) * 100).toFixed(1)}% מהמשתתפים
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}