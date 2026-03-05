
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const scoreOptions = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// 🚀 Cache לנורמליזציה
const NORMALIZE_CACHE = new Map();
const FORMAT_CACHE = new Map();

// פונקציה לנורמליזציה של שמות קבוצות
const normalizeTeamName = (name) => {
  if (!name) return name;
  if (NORMALIZE_CACHE.has(name)) return NORMALIZE_CACHE.get(name);
  
  const result = name
    .replace(/קרבאך/g, 'קרבאח')
    .replace(/קראבח/g, 'קרבאח')
    .replace(/קראבך/g, 'קרבאח')
    .trim();
  
  NORMALIZE_CACHE.set(name, result);
  return result;
};

export default function RoundTableReadOnly({ table, teams, predictions, isEditMode = false, handlePredictionEdit = null }) {
    const formatScore = (score) => {
        if (!score || score === '__CLEAR__') return '';
        if (FORMAT_CACHE.has(score)) return FORMAT_CACHE.get(score);
        
        let result;
        if (score.includes('-')) {
            const parts = score.split('-').map(x => x.trim());
            result = parts.join(' - ');
        } else {
            result = score;
        }
        
        FORMAT_CACHE.set(score, result);
        return result;
    };

    const calculateScore = (question, prediction) => {
        if (!prediction || prediction.trim() === '') {
            return null;
        }

        if (!question.actual_result || 
            question.actual_result.trim() === '' || 
            question.actual_result === '__CLEAR__') {
            return null;
        }

        if (question.actual_result.includes('-') && prediction.includes('-')) {
            const actualParts = question.actual_result.split('-').map(x => parseInt(x.trim()));
            const predParts = prediction.split('-').map(x => parseInt(x.trim()));
            
            if (actualParts.length === 2 && predParts.length === 2 && 
                !isNaN(actualParts[0]) && !isNaN(actualParts[1]) && 
                !isNaN(predParts[0]) && !isNaN(predParts[1])) {
                const actualHome = actualParts[0];
                const actualAway = actualParts[1];
                const predHome = predParts[0];
                const predAway = predParts[1];
                
                const isIsraeliTable = question.table_id === 'T20'; // Assuming table_id is correct here
                
                if (isIsraeliTable) {
                    if (actualHome === predHome && actualAway === predAway) {
                        return 6;
                    }
                    
                    const actualResult = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
                    const predResult = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';
                    
                    if (actualResult !== predResult) {
                        return 0;
                    }
                    
                    const actualDiff = actualHome - actualAway;
                    const predDiff = predHome - predAway;
                    if (actualDiff === predDiff) {
                        return 4;
                    }
                    
                    return 2;
                } else {
                    if (actualHome === predHome && actualAway === predAway) {
                        return 10;
                    }
                    
                    const actualResult = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
                    const predResult = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';
                    
                    if (actualResult !== predResult) {
                        return 0;
                    }
                    
                    const actualDiff = actualHome - actualAway;
                    const predDiff = predHome - predAway;
                    if (actualDiff === predDiff) {
                        return 7;
                    }
                    
                    return 5;
                }
            }
        }
        return null;
    };

    const sortedQuestions = useMemo(() => {
        return [...table.questions].sort((a, b) => {
            const parseDate = (dateStr) => {
                if (!dateStr) return null;
                const formats = [
                    /^(\d{1,2})-(\d{1,2})$/,
                    /^(\d{1,2})\/(\d{1,2})$/,
                    /^(\d{1,2})\.(\d{1,2})$/
                ];
                for (const format of formats) {
                    const match = dateStr.match(format);
                    if (match) {
                        const day = parseInt(match[1], 10);
                        const month = parseInt(match[2], 10);
                        return new Date(2000, month - 1, day); 
                    }
                }
                const parsed = new Date(dateStr);
                if (!isNaN(parsed.getTime())) return parsed;
                return null;
            };

            const dateA = parseDate(a.game_date);
            const dateB = parseDate(b.game_date);
            
            if (dateA && dateB) return dateA.getTime() - dateB.getTime();
            if (dateA && !dateB) return -1;
            if (!dateA && dateB) return 1;
            
            return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0);
        });
    }, [table.questions]);

    // 🚀 useMemo לחישובים כבדים
    const processedQuestions = useMemo(() => {
        return sortedQuestions.map(q => {
            let homeTeamName = q.home_team;
            let awayTeamName = q.away_team;
            
            if ((!homeTeamName || !awayTeamName) && q.question_text?.includes('נגד')) {
                const teamNames = q.question_text.split('נגד').map(t => t.trim());
                if (teamNames.length === 2) {
                    homeTeamName = homeTeamName || teamNames[0]; // Use existing if available
                    awayTeamName = awayTeamName || teamNames[1]; // Use existing if available
                }
            }
            
            const normalizedHome = normalizeTeamName(homeTeamName);
            const normalizedAway = normalizeTeamName(awayTeamName);
            
            return {
                ...q,
                normalizedHome,
                normalizedAway,
                homeTeam: teams[normalizedHome],
                awayTeam: teams[normalizedAway]
            };
        });
    }, [sortedQuestions, teams]);

    const isIsraeliTable = table.id === 'T20';
    const maxScoreForTable = isIsraeliTable ? 6 : 10;

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
        
        // If either value is '__CLEAR__', it means the select was cleared.
        // We should clear the whole prediction if both are cleared, or just set one part.
        if (value === '__CLEAR__') {
            if (part === 'home') {
                home = '';
            } else {
                away = '';
            }
        }

        if (home !== '' && away !== '') {
            handlePredictionEdit(questionId, `${home}-${away}`);
        } else if (home === '' && away === '') {
            handlePredictionEdit(questionId, '');
        } else { // One is empty, the other is not. This means we're in an incomplete state, keep it.
             handlePredictionEdit(questionId, `${home || ''}-${away || ''}`);
        }
    };

    return (
        <Card className="h-full bg-slate-800/50 border-slate-600">
            <CardHeader className="bg-gradient-to-r from-blue-800/50 to-blue-700/50 py-3">
                <CardTitle className="text-center text-blue-100">{table.description}</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
                <div className="overflow-auto max-h-[600px]">
                    <Table>
                        <thead className="sticky top-0 bg-slate-800 z-10">
                            <tr className="border-b-2 border-slate-600">
                                <th className="text-center py-2 px-1 text-blue-300 text-xs font-semibold">#</th>
                                <th className="text-center py-2 px-2 text-blue-300 text-xs font-semibold">בית</th>
                                <th className="text-center py-2 px-2 text-blue-300 text-xs font-semibold w-20">ניחוש</th>
                                <th className="text-center py-2 px-2 text-blue-300 text-xs font-semibold">חוץ</th>
                                <th className="text-center py-2 px-2 text-blue-300 text-xs font-semibold w-20">תוצאה</th>
                                <th className="text-center py-2 px-1 text-blue-300 text-xs font-semibold w-16">ניקוד</th>
                            </tr>
                        </thead>
                        <TableBody>
                            {processedQuestions.map((q) => {
                                const { id, question_id, homeTeam, awayTeam, normalizedHome, normalizedAway } = q;
                                const prediction = predictions[id] || "";
                                const score = calculateScore(q, prediction);

                                const hasActualResult = q.actual_result && 
                                                       q.actual_result.trim() !== '' && 
                                                       q.actual_result !== '__CLEAR__';
                                
                                const predictionColor = hasActualResult ? '#06b6d4' : '#f8fafc';
                                const predictionWeight = hasActualResult ? '600' : 'normal';

                                let badgeColor = 'bg-slate-600 text-slate-300';
                                if (score !== null) {
                                    if (score === maxScoreForTable) {
                                        badgeColor = 'bg-green-700 text-green-100';
                                    } else if (score === 0) {
                                        badgeColor = 'bg-red-700 text-red-100';
                                    } else if (score >= maxScoreForTable * 0.7) {
                                        badgeColor = 'bg-blue-700 text-blue-100';
                                    } else {
                                        badgeColor = 'bg-yellow-700 text-yellow-100';
                                    }
                                }

                                let homeScore = '', awayScore = '';
                                if (prediction && prediction.includes('-')) {
                                    [homeScore, awayScore] = prediction.split('-').map(x => x.trim());
                                }

                                return (
                                    <TableRow key={id} className="hover:bg-slate-700/30 border-b border-slate-700">
                                        <TableCell className="text-center py-2 px-1 w-12">
                                            <Badge variant="outline" className="border-blue-400 text-blue-200 text-xs">
                                                {question_id}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center py-2 px-2">
                                            <div className="flex flex-col items-center gap-1">
                                                {homeTeam?.logo_url && (
                                                    <img src={homeTeam.logo_url} alt={normalizedHome} className="w-6 h-6 rounded-full" />
                                                )}
                                                <span className="text-slate-200 text-xs">{normalizedHome}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center py-2 px-2 w-20">
                                            {isEditMode ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <Select value={homeScore || ''} onValueChange={(val) => handleScoreChange(id, 'home', val)}>
                                                        <SelectTrigger className="h-7 w-12 text-xs" style={{
                                                            background: 'rgba(15, 23, 42, 0.6)',
                                                            border: '1px solid rgba(6, 182, 212, 0.3)',
                                                            color: '#f8fafc',
                                                            paddingLeft: '6px',
                                                            paddingRight: '20px'
                                                        }}>
                                                            <SelectValue placeholder="-" />
                                                        </SelectTrigger>
                                                        <SelectContent style={{
                                                            background: '#1e293b',
                                                            border: '1px solid rgba(6, 182, 212, 0.3)'
                                                        }}>
                                                            <SelectItem value="__CLEAR__" className="text-center hover:bg-cyan-500/20 text-xs" style={{ color: '#f8fafc' }}>
                                                                -
                                                            </SelectItem>
                                                            {scoreOptions.map(opt => (
                                                                <SelectItem key={`home-${id}-${opt}`} value={opt} className="text-center hover:bg-cyan-500/20 text-xs" style={{ color: '#f8fafc' }}>
                                                                    {opt}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <span className="text-blue-300 font-bold text-xs">-</span>
                                                    <Select value={awayScore || ''} onValueChange={(val) => handleScoreChange(id, 'away', val)}>
                                                        <SelectTrigger className="h-7 w-12 text-xs" style={{
                                                            background: 'rgba(15, 23, 42, 0.6)',
                                                            border: '1px solid rgba(6, 182, 212, 0.3)',
                                                            color: '#f8fafc',
                                                            paddingLeft: '6px',
                                                            paddingRight: '20px'
                                                        }}>
                                                            <SelectValue placeholder="-" />
                                                        </SelectTrigger>
                                                        <SelectContent style={{
                                                            background: '#1e293b',
                                                            border: '1px solid rgba(6, 182, 212, 0.3)'
                                                        }}>
                                                            <SelectItem value="__CLEAR__" className="text-center hover:bg-cyan-500/20 text-xs" style={{ color: '#f8fafc' }}>
                                                                -
                                                            </SelectItem>
                                                            {scoreOptions.map(opt => (
                                                                <SelectItem key={`away-${id}-${opt}`} value={opt} className="text-center hover:bg-cyan-500/20 text-xs" style={{ color: '#f8fafc' }}>
                                                                    {opt}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            ) : (
                                                <span style={{ color: predictionColor, fontWeight: predictionWeight }}>{formatScore(prediction) || "-"}</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center py-2 px-2">
                                            <div className="flex flex-col items-center gap-1">
                                                {awayTeam?.logo_url && (
                                                    <img src={awayTeam.logo_url} alt={normalizedAway} className="w-6 h-6 rounded-full" />
                                                )}
                                                <span className="text-slate-200 text-xs">{normalizedAway}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center py-2 px-2 w-20">
                                            {q.actual_result && q.actual_result !== '__CLEAR__' ? (
                                                <span className="text-green-300 font-medium">{formatScore(q.actual_result)}</span>
                                            ) : (
                                                <span className="text-slate-500 text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center py-2 px-1 w-16">
                                            {prediction && prediction.trim() !== '' ? (
                                                <Badge className={`${badgeColor} text-xs font-bold px-2 py-1`}>
                                                    {score !== null ? score : '?'}/{maxScoreForTable}
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-500 text-xs">-</span>
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
