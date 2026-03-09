import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const scoreOptions = ['__EMPTY__', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// פונקציה לנורמליזציה של שמות קבוצות
const normalizeTeamName = (name) => {
  if (!name) return name;
  return name
    .replace(/קרבאך/g, 'קרבאח')
    .replace(/קראבח/g, 'קרבאח')
    .replace(/קראבך/g, 'קרבאח')
    .trim();
};

// Strip country suffix "(ספרד)" etc. for clean display and logo lookup
const stripCountry = (name) => {
  if (!name) return name;
  return name.replace(/\s*\([^)]+\)\s*$/, '').trim();
};

export default function RoundTable({ table, teams, predictions, onPredictionChange }) {
    const [gameScores, setGameScores] = useState({});

    // 🔥 מיון לפי מספר שאלה בלבד - סדר עולה תמיד
    const sortedQuestions = [...table.questions].sort((a, b) => {
        return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0);
    });

    // Initialize and sync local state with predictions
    useEffect(() => {
        const newScores = {};
        sortedQuestions.forEach(q => {
            const existingPrediction = predictions[q.id];
            const currentLocal = gameScores[q.id];
            
            // Only update if prediction from parent is different from local state
            if (existingPrediction && existingPrediction.includes('-')) {
                const [home, away] = existingPrediction.split('-');
                const localPrediction = currentLocal ? `${currentLocal.home}-${currentLocal.away}` : '';
                
                // Don't override if local state already has this value
                if (localPrediction !== existingPrediction) {
                    newScores[q.id] = { home, away };
                } else {
                    newScores[q.id] = currentLocal || { home: '', away: '' };
                }
            } else {
                newScores[q.id] = currentLocal || { home: '', away: '' };
            }
        });
        
        // Only update if there's actually a change
        const hasChanges = sortedQuestions.some(q => {
            const newScore = newScores[q.id];
            const oldScore = gameScores[q.id];
            return !oldScore || newScore.home !== oldScore.home || newScore.away !== oldScore.away;
        });
        
        if (hasChanges || Object.keys(gameScores).length === 0) {
            setGameScores(newScores);
        }
    }, [sortedQuestions, predictions]);

    const handleScoreChange = (questionId, part, value) => {
        const actualValue = value === '__EMPTY__' ? '' : value;
        const updatedScores = {
            ...gameScores,
            [questionId]: {
                ...gameScores[questionId],
                [part]: actualValue
            }
        };
        setGameScores(updatedScores);

        // If both scores are selected, update the parent state
        const { home, away } = updatedScores[questionId];
        if (home !== '' && away !== '') {
            onPredictionChange(questionId, `${home}-${away}`);
        } else {
            // If one or both are empty, send an empty prediction to clear it
            onPredictionChange(questionId, '');
        }
    };

    return (
        <Card className="h-full" style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
            <CardHeader className="py-3" style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)',
              borderBottom: '1px solid rgba(6, 182, 212, 0.2)'
            }}>
                <CardTitle className="text-center" style={{ color: '#06b6d4' }}>{table.description}</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
                <Table>
                    <TableBody>
                        {sortedQuestions.map((q) => {
                            // If we don't have home_team/away_team from the data but have question_text with "נגד"
                            let homeTeamName = q.home_team;
                            let awayTeamName = q.away_team;
                            
                            if (!homeTeamName && !awayTeamName && q.question_text?.includes('נגד')) {
                                const teamNames = q.question_text.split('נגד').map(t => t.trim());
                                if (teamNames.length === 2) {
                                    homeTeamName = teamNames[0]; // keep full name e.g. "גלאטסראיי (טורקיה)"
                                    awayTeamName = teamNames[1];
                                }
                            }
                            
                            // שם מלא (כולל מדינה) לחיפוש לוגו, שם נקי לתצוגה
                            const fullHome = normalizeTeamName(homeTeamName);
                            const fullAway = normalizeTeamName(awayTeamName);
                            const displayHome = stripCountry(fullHome);
                            const displayAway = stripCountry(fullAway);
                            
                            // 🔍 חיפוש קבוצה: קודם שם מלא (עם מדינה), גיבוי שם נקי
                            const homeTeam = teams[fullHome] || teams[displayHome];
                            const awayTeam = teams[fullAway] || teams[displayAway];
                            
                            // 🔍 DEBUG - הדפס אם לא נמצאה קבוצה
                            if (!homeTeam) {
                              console.log(`⚠️ לא נמצאה קבוצת בית: "${normalizedHome}" במשחק ${q.question_id}`);
                            }
                            if (!awayTeam) {
                              console.log(`⚠️ לא נמצאה קבוצת חוץ: "${normalizedAway}" במשחק ${q.question_id}`);
                            }
                            
                            const currentScores = gameScores[q.id] || { home: '', away: '' };

                            return (
                                <TableRow key={q.id} className="hover:bg-cyan-500/10" style={{ 
                                  borderBottom: '1px solid rgba(6, 182, 212, 0.1)'
                                }}>
                                    <TableCell className="w-8 p-1 text-center text-xs align-middle" style={{ color: '#94a3b8' }}>
                                        <span className="font-semibold" style={{ color: '#06b6d4' }}>{q.question_id}</span>
                                    </TableCell>
                                    <TableCell className="w-16 p-1 text-center text-xs align-middle whitespace-nowrap" style={{ color: '#94a3b8' }}>
                                        {q.game_date}
                                    </TableCell>
                                    <TableCell className="p-2 text-right font-medium align-middle min-w-[140px]">
                                        <div className="flex items-center justify-end gap-2">
                                            <span style={{ color: '#f8fafc' }} className="text-sm truncate">{displayHome}</span>
                                            {homeTeam?.logo_url && (
                                                <img 
                                                    src={homeTeam.logo_url} 
                                                    alt={normalizedHome} 
                                                    className="w-6 h-6 rounded-full object-cover flex-shrink-0" 
                                                    style={{ border: '1px solid rgba(6, 182, 212, 0.3)' }}
                                                    onError={(e) => {
                                                        console.log(`❌ שגיאה בטעינת לוגו: ${homeTeam.logo_url}`);
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="p-1 w-16">
                                        <Select value={currentScores.home === '' ? '__EMPTY__' : currentScores.home} onValueChange={(val) => handleScoreChange(q.id, 'home', val)}>
                                            <SelectTrigger className="h-8 text-center" style={{
                                              background: 'rgba(15, 23, 42, 0.6)',
                                              border: '1px solid rgba(6, 182, 212, 0.3)',
                                              color: '#f8fafc'
                                            }}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent style={{
                                              background: '#1e293b',
                                              border: '1px solid rgba(6, 182, 212, 0.3)'
                                            }}>
                                                {scoreOptions.map(opt => (
                                                    <SelectItem key={`home-${opt}`} value={opt} className="justify-center hover:bg-cyan-500/20" style={{ color: '#f8fafc' }}>
                                                        {opt === '__EMPTY__' ? 'ריק' : opt}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="p-1 w-4 text-center font-bold align-middle" style={{ color: '#06b6d4' }}>-</TableCell>
                                     <TableCell className="p-1 w-16">
                                        <Select value={currentScores.away === '' ? '__EMPTY__' : currentScores.away} onValueChange={(val) => handleScoreChange(q.id, 'away', val)}>
                                            <SelectTrigger className="h-8 text-center" style={{
                                              background: 'rgba(15, 23, 42, 0.6)',
                                              border: '1px solid rgba(6, 182, 212, 0.3)',
                                              color: '#f8fafc'
                                            }}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent style={{
                                              background: '#1e293b',
                                              border: '1px solid rgba(6, 182, 212, 0.3)'
                                            }}>
                                                {scoreOptions.map(opt => (
                                                    <SelectItem key={`away-${opt}`} value={opt} className="justify-center hover:bg-cyan-500/20" style={{ color: '#f8fafc' }}>
                                                        {opt === '__EMPTY__' ? 'ריק' : opt}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="p-2 text-left font-medium align-middle min-w-[140px]">
                                       <div className="flex items-center justify-start gap-2">
                                            {awayTeam?.logo_url && (
                                                <img 
                                                    src={awayTeam.logo_url} 
                                                    alt={normalizedAway} 
                                                    className="w-6 h-6 rounded-full object-cover flex-shrink-0" 
                                                    style={{ border: '1px solid rgba(6, 182, 212, 0.3)' }}
                                                    onError={(e) => {
                                                        console.log(`❌ שגיאה בטעינת לוגו: ${awayTeam.logo_url}`);
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            )}
                                            <span style={{ color: '#f8fafc' }} className="text-sm truncate">{displayAway}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="p-1 text-center align-middle w-12">
                                        {q.possible_points && (
                                            <Badge variant="outline" className="text-xs px-2 py-1" style={{
                                                borderColor: 'rgba(6, 182, 212, 0.5)',
                                                color: '#06b6d4',
                                                background: 'rgba(6, 182, 212, 0.1)'
                                            }}>
                                                {q.possible_points}
                                            </Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
