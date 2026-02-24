import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateQuestionScore } from "@/components/scoring/ScoreService";

const scoreOptions = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const normalizeTeamName = (name) => {
  if (!name) return name;
  return name
    .replace(/קרבאך/g, 'קרבאח')
    .replace(/קראבח/g, 'קרבאח')
    .replace(/קראבך/g, 'קרבאח')
    .trim();
};

export default function RoundTableReadOnly({ table, teams, predictions, isEditMode = false, handlePredictionEdit = null }) {
    const formatScore = (score) => {
        if (!score || score === '__CLEAR__') return '';
        if (score.includes('-')) {
            const parts = score.split('-').map(x => x.trim());
            return parts.join(' - ');
        }
        return score;
    };



    // 🔥 מיון לפי מספר שאלה בלבד - סדר עולה תמיד
    const sortedQuestions = [...table.questions].sort((a, b) => {
        return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0);
    });

    const isIsraeliTable = table.id === 'T20';
    const maxScoreForTable = isIsraeliTable ? 6 : (table.questions[0]?.possible_points || 10);

    const handleScoreChange = (questionId, part, value) => {
        if (!isEditMode || !handlePredictionEdit) return;
        
        const currentPrediction = predictions[questionId] || '';
        let home = '', away = '';
        
        if (currentPrediction.includes('-')) {
            [home, away] = currentPrediction.split('-').map(x => x.trim());
        }
        
        if (part === 'home') {
            home = value;
        } else {
            away = value;
        }
        
        if (home !== '' && away !== '') {
            handlePredictionEdit(questionId, `${home}-${away}`);
        } else if (home === '' && away === '') {
            handlePredictionEdit(questionId, '');
        }
    };

    return (
        <Card className="h-full bg-slate-800/50 border-slate-600">
            <CardHeader className="bg-gradient-to-r from-blue-800/50 to-blue-700/50 py-2 md:py-3">
                <CardTitle className="text-center text-blue-100 text-sm md:text-base">{table.description}</CardTitle>
            </CardHeader>
            <CardContent className="p-1 md:p-2">
                <div className="overflow-auto max-h-[600px]">
                    <Table>
                        <thead className="sticky top-0 bg-slate-800 z-10">
                            <tr className="border-b-2 border-slate-600">
                                <th className="text-center py-1 md:py-2 px-0.5 md:px-1 text-blue-300 text-[8px] md:text-xs font-semibold">#</th>
                                <th className="hidden md:table-cell text-center py-1 md:py-2 px-0.5 md:px-1 text-blue-300 text-[8px] md:text-xs font-semibold w-12">תאריך</th>
                                <th className="text-center py-1 md:py-2 px-1 md:px-2 text-blue-300 text-[8px] md:text-xs font-semibold">בית</th>
                                <th className="text-center py-1 md:py-2 px-1 md:px-2 text-blue-300 text-[8px] md:text-xs font-semibold w-14 md:w-20">ניחוש</th>
                                <th className="text-center py-1 md:py-2 px-1 md:px-2 text-blue-300 text-[8px] md:text-xs font-semibold">חוץ</th>
                                <th className="hidden md:table-cell text-center py-1 md:py-2 px-1 md:px-2 text-blue-300 text-[8px] md:text-xs font-semibold w-20">תוצאה</th>
                                <th className="text-center py-1 md:py-2 px-0.5 md:px-1 text-blue-300 text-[8px] md:text-xs font-semibold w-10 md:w-16">נק'</th>
                            </tr>
                        </thead>
                        <TableBody>
                            {sortedQuestions.map((q) => {
                                const normalizedHome = normalizeTeamName(q.home_team);
                                const normalizedAway = normalizeTeamName(q.away_team);
                                
                                const homeTeam = teams[normalizedHome];
                                const awayTeam = teams[normalizedAway];
                                const prediction = predictions[q.id] || "";
                                const score = calculateQuestionScore(q, prediction);

                                const hasActualResult = q.actual_result && 
                                                       q.actual_result.trim() !== '' && 
                                                       q.actual_result !== '__CLEAR__';
                                
                                const predictionColor = hasActualResult ? '#06b6d4' : '#f8fafc';
                                const predictionWeight = hasActualResult ? '600' : 'normal';

                                const maxScore = maxScoreForTable; // תמיד השתמש ב-maxScore של הטבלה (10 או 6)
                                let badgeColor = 'bg-slate-600 text-white';
                                
                                if (score !== null) {
                                    if (score === maxScore) {
                                        // פגיעה מדויקת - ירוק
                                        badgeColor = 'bg-green-600 text-white';
                                    } else if (score === 0) {
                                        // 0 נקודות - אדום
                                        badgeColor = 'bg-red-600 text-white';
                                    } else if (score >= 7) {
                                        // 7 נקודות (תוצאה + הפרש) - כחול
                                        badgeColor = 'bg-blue-600 text-white';
                                    } else {
                                        // 5 נקודות (תוצאה בלבד) או 2-4 נקודות - צהוב
                                        badgeColor = 'bg-yellow-500 text-white';
                                    }
                                }

                                let homeScore = '', awayScore = '';
                                if (prediction && prediction.includes('-')) {
                                    [homeScore, awayScore] = prediction.split('-').map(x => x.trim());
                                }

                                return (
                                    <TableRow key={q.id} className="hover:bg-slate-700/30 border-b border-slate-700">
                                        <TableCell className="text-center py-1 md:py-2 px-0.5 md:px-1 w-8 md:w-12">
                                            <Badge variant="outline" className="border-blue-400 text-blue-200 text-[8px] md:text-xs px-1 md:px-2">
                                                {q.question_id}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell text-center py-1 md:py-2 px-0.5 md:px-1 w-12">
                                            {q.game_date ? (
                                                <span className="text-slate-400 text-[10px]">{q.game_date}</span>
                                            ) : (
                                                <span className="text-slate-600 text-[10px]">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center py-1 md:py-2 px-1 md:px-2">
                                            <div className="flex flex-col items-center gap-0.5 md:gap-1">
                                                {homeTeam?.logo_url && (
                                                    <img 
                                                        src={homeTeam.logo_url} 
                                                        alt={normalizedHome} 
                                                        className="w-4 h-4 md:w-6 md:h-6 rounded-full" 
                                                        onError={(e) => e.target.style.display = 'none'}
                                                    />
                                                )}
                                                <span className="text-slate-200 text-[8px] md:text-xs truncate max-w-[40px] md:max-w-none">{normalizedHome}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center py-1 md:py-2 px-1 md:px-2 w-14 md:w-20">
                                            {isEditMode ? (
                                                <div className="flex items-center justify-center gap-0.5 md:gap-1">
                                                    <Select value={homeScore} onValueChange={(val) => handleScoreChange(q.id, 'home', val)}>
                                                        <SelectTrigger className="h-5 md:h-7 w-8 md:w-12 text-[10px] md:text-xs" style={{
                                                            background: 'rgba(15, 23, 42, 0.6)',
                                                            border: '1px solid rgba(6, 182, 212, 0.3)',
                                                            color: '#f8fafc',
                                                            paddingLeft: '4px',
                                                            paddingRight: '14px'
                                                        }}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent style={{
                                                            background: '#1e293b',
                                                            border: '1px solid rgba(6, 182, 212, 0.3)'
                                                        }}>
                                                            {scoreOptions.map(opt => (
                                                                <SelectItem 
                                                                    key={`home-${opt}`} 
                                                                    value={opt} 
                                                                    className="text-center hover:bg-cyan-500/20 text-xs" 
                                                                    style={{ color: '#f8fafc' }}
                                                                >
                                                                    {opt}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <span className="text-blue-300 font-bold text-[10px] md:text-xs">-</span>
                                                    <Select value={awayScore} onValueChange={(val) => handleScoreChange(q.id, 'away', val)}>
                                                        <SelectTrigger className="h-5 md:h-7 w-8 md:w-12 text-[10px] md:text-xs" style={{
                                                            background: 'rgba(15, 23, 42, 0.6)',
                                                            border: '1px solid rgba(6, 182, 212, 0.3)',
                                                            color: '#f8fafc',
                                                            paddingLeft: '4px',
                                                            paddingRight: '14px'
                                                        }}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent style={{
                                                            background: '#1e293b',
                                                            border: '1px solid rgba(6, 182, 212, 0.3)'
                                                        }}>
                                                            {scoreOptions.map(opt => (
                                                                <SelectItem 
                                                                    key={`away-${opt}`} 
                                                                    value={opt} 
                                                                    className="text-center hover:bg-cyan-500/20 text-xs" 
                                                                    style={{ color: '#f8fafc' }}
                                                                >
                                                                    {opt}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] md:text-sm" style={{ color: predictionColor, fontWeight: predictionWeight }}>{formatScore(prediction) || "-"}</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center py-1 md:py-2 px-1 md:px-2">
                                            <div className="flex flex-col items-center gap-0.5 md:gap-1">
                                                {awayTeam?.logo_url && (
                                                    <img 
                                                        src={awayTeam.logo_url} 
                                                        alt={normalizedAway} 
                                                        className="w-4 h-4 md:w-6 md:h-6 rounded-full" 
                                                        onError={(e) => e.target.style.display = 'none'}
                                                    />
                                                )}
                                                <span className="text-slate-200 text-[8px] md:text-xs truncate max-w-[40px] md:max-w-none">{normalizedAway}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell text-center py-1 md:py-2 px-1 md:px-2 w-20">
                                            {q.actual_result && q.actual_result !== '__CLEAR__' ? (
                                                <Badge variant="outline" className="px-2 py-1" style={{
                                                    background: 'rgba(6, 182, 212, 0.2)',
                                                    borderColor: '#06b6d4',
                                                    color: '#06b6d4',
                                                    fontWeight: '700',
                                                    boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)'
                                                }}>
                                                    {formatScore(q.actual_result)}
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-500 text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center py-1 md:py-2 px-0.5 md:px-1 w-10 md:w-16">
                                            {prediction && prediction.trim() !== '' ? (
                                                <Badge className="text-[8px] md:text-xs font-bold px-1 md:px-2 py-0.5 md:py-1" style={{
                                                    backgroundColor: score === null ? '#475569' : score === maxScore ? '#16a34a' : score === 0 ? '#dc2626' : score >= 7 ? '#2563eb' : score > 0 ? '#facc15' : '#475569',
                                                    color: 'white'
                                                }}>
                                                    {score !== null ? score : '?'}/{maxScore}
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-500 text-[8px] md:text-xs">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}