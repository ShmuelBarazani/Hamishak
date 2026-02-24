import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const scoreOptions = ['__EMPTY__', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const normalizeTeamName = (name) => {
  if (!name) return name;
  return name
    .replace(/קרבאך/g, 'קרבאח')
    .replace(/קראבח/g, 'קרבאח')
    .replace(/קראבך/g, 'קרבאח')
    .trim();
};

export default function RoundTableResults({ table, teams, results, onResultChange, isAdmin }) {
    const [gameScores, setGameScores] = useState({});
    const prevResultsRef = useRef({});

    // 🔥 מיון לפי מספר שאלה בלבד - סדר עולה תמיד
    const sortedQuestions = [...table.questions].sort((a, b) => {
        return (parseFloat(a.question_id) || 0) - (parseFloat(b.question_id) || 0);
    });

    useEffect(() => {
        const hasChanges = sortedQuestions.some(q => {
            return prevResultsRef.current[q.id] !== results[q.id];
        });

        if (!hasChanges) return;

        const initialScores = {};
        sortedQuestions.forEach(q => {
            const existingResult = results[q.id];
            if (existingResult && existingResult !== '__CLEAR__' && existingResult.includes('-')) {
                const [home, away] = existingResult.split('-');
                initialScores[q.id] = { home: home.trim(), away: away.trim() };
            } else {
                initialScores[q.id] = { home: '', away: '' };
            }
        });
        
        setGameScores(initialScores);
        prevResultsRef.current = { ...results };
    }, [results, sortedQuestions]);

    const handleScoreChange = (questionId, part, value) => {
        if (!onResultChange) return;
        
        const actualValue = value === '__EMPTY__' ? '' : value;
        const updatedScores = {
            ...gameScores,
            [questionId]: {
                ...gameScores[questionId],
                [part]: actualValue
            }
        };
        setGameScores(updatedScores);

        const { home, away } = updatedScores[questionId];
        
        if (home === '' && away === '') {
            onResultChange(questionId, '');
        }
        else if (home !== '' && away !== '') {
            onResultChange(questionId, `${home}-${away}`);
        }
    };

    // 🔍 DEBUG - הדפס מידע על teams שמועברים
    useEffect(() => {
        console.log('🔍 RoundTableResults - teams prop:', {
            isObject: typeof teams === 'object',
            keysCount: Object.keys(teams || {}).length,
            sampleKeys: Object.keys(teams || {}).slice(0, 10),
            sampleTeams: Object.entries(teams || {}).slice(0, 3).map(([name, team]) => ({
                name,
                hasLogo: !!team?.logo_url,
                logo: team?.logo_url
            }))
        });
    }, [teams]);

    return (
        <Card className="h-full bg-slate-800/50 border-slate-600">
            <CardHeader className="bg-gradient-to-r from-blue-800/50 to-blue-700/50 py-2 md:py-3">
                <CardTitle className="text-center text-blue-100 text-sm md:text-base">{table.description}</CardTitle>
            </CardHeader>
            <CardContent className="p-1 md:p-2">
                <Table>
                    <thead className="sticky top-0 bg-slate-800 z-10">
                        <tr className="border-b-2 border-slate-600">
                            <th className="text-center py-1 md:py-2 px-0.5 md:px-1 text-blue-300 text-[8px] md:text-xs font-semibold">#</th>
                            <th className="hidden md:table-cell text-center py-1 md:py-2 px-0.5 md:px-1 text-blue-300 text-[8px] md:text-xs font-semibold w-12">תאריך</th>
                            <th className="text-center py-1 md:py-2 px-1 md:px-2 text-blue-300 text-[8px] md:text-xs font-semibold">בית</th>
                            <th className="text-center py-1 md:py-2 px-1 md:px-2 text-blue-300 text-[8px] md:text-xs font-semibold w-12 md:w-16"></th>
                            <th className="text-center py-1 md:py-2 px-1 md:px-2 text-blue-300 text-[8px] md:text-xs font-semibold">חוץ</th>
                            <th className="hidden md:table-cell text-center py-1 md:py-2 px-0.5 md:px-1 text-blue-300 text-[8px] md:text-xs font-semibold w-12">נק'</th>
                        </tr>
                    </thead>
                    <TableBody>
                        {sortedQuestions.map((q) => {
                            let homeTeamName = q.home_team;
                            let awayTeamName = q.away_team;
                            
                            if (!homeTeamName && !awayTeamName && q.question_text?.includes('נגד')) {
                                const teamNames = q.question_text.split('נגד').map(t => t.trim());
                                if (teamNames.length === 2) {
                                    homeTeamName = teamNames[0];
                                    awayTeamName = teamNames[1];
                                }
                            }
                            
                            const normalizedHome = normalizeTeamName(homeTeamName);
                            const normalizedAway = normalizeTeamName(awayTeamName);
                            
                            const homeTeam = teams[normalizedHome];
                            const awayTeam = teams[normalizedAway];
                            const currentScores = gameScores[q.id] || { home: '', away: '' };

                            const hasActualResult = q.actual_result && 
                                                   q.actual_result.trim() !== '' && 
                                                   q.actual_result !== '__CLEAR__';

                            // 🔍 DEBUG - לוג מפורט לכל שורה
                            if (!homeTeam?.logo_url || !awayTeam?.logo_url) {
                                console.log(`⚠️ שאלה ${q.question_id} - חסרים לוגואים:`, {
                                    questionId: q.question_id,
                                    homeTeamName: homeTeamName,
                                    awayTeamName: awayTeamName,
                                    normalizedHome,
                                    normalizedAway,
                                    homeTeam: homeTeam ? { name: homeTeam.name, hasLogo: !!homeTeam.logo_url, logo: homeTeam.logo_url } : null,
                                    awayTeam: awayTeam ? { name: awayTeam.name, hasLogo: !!awayTeam.logo_url, logo: awayTeam.logo_url } : null,
                                    availableInTeams: {
                                        hasHome: !!teams[normalizedHome],
                                        hasAway: !!teams[normalizedAway]
                                    }
                                });
                            }

                            return (
                                <TableRow key={q.id} className="border-slate-600 hover:bg-slate-700/30">
                                    <TableCell className="w-6 md:w-8 p-0.5 md:p-1 text-center text-[8px] md:text-xs text-slate-400 align-middle">
                                        <span className="text-blue-300 font-semibold">{q.question_id}</span>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell w-12 p-1 text-center align-middle">
                                        {q.game_date ? (
                                            <span className="text-slate-400 text-[10px]">{q.game_date}</span>
                                        ) : (
                                            <span className="text-slate-600 text-[10px]">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="p-1 md:p-2 text-center font-medium align-middle min-w-[50px] md:min-w-[100px]">
                                        <div className="flex flex-col items-center gap-0.5 md:gap-1">
                                            {homeTeam?.logo_url && (
                                                <img 
                                                    src={homeTeam.logo_url} 
                                                    alt={normalizedHome} 
                                                    className="w-5 h-5 md:w-8 md:h-8 rounded-full object-cover flex-shrink-0" 
                                                    style={{ border: '1px solid rgba(6, 182, 212, 0.3)' }}
                                                    onError={(e) => {
                                                        console.log(`❌ שגיאה בטעינת לוגו של ${normalizedHome}: ${homeTeam.logo_url}`);
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            )}
                                            <span className="text-slate-200 text-[8px] md:text-xs text-center truncate max-w-[50px] md:max-w-none">{normalizedHome}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="p-0.5 md:p-1 w-10 md:w-16">
                                        <Select 
                                            value={currentScores.home === '' ? '__EMPTY__' : currentScores.home} 
                                            onValueChange={(val) => handleScoreChange(q.id, 'home', val)}
                                            disabled={!onResultChange}
                                        >
                                            <SelectTrigger className="h-6 md:h-8 text-center text-[10px] md:text-sm" style={{
                                                background: hasActualResult ? 'rgba(6, 182, 212, 0.2)' : 'rgba(51, 65, 85, 0.5)',
                                                borderColor: hasActualResult ? '#06b6d4' : 'rgba(100, 116, 139, 1)',
                                                color: hasActualResult ? '#06b6d4' : '#f8fafc',
                                                fontWeight: hasActualResult ? '700' : 'normal',
                                                boxShadow: hasActualResult ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none'
                                            }}>
                                                <SelectValue>
                                                    {currentScores.home === '' ? '-' : currentScores.home}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-600">
                                                {scoreOptions.map(opt => (
                                                    <SelectItem 
                                                        key={`home-${opt}`} 
                                                        value={opt} 
                                                        className={`text-slate-200 hover:bg-slate-700 justify-center ${opt === '__EMPTY__' ? 'text-slate-400' : ''}`}
                                                    >
                                                        {opt === '__EMPTY__' ? 'ריק' : opt}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="p-0 w-2 md:w-4 text-center font-bold align-middle text-slate-300 text-[10px] md:text-sm">-</TableCell>
                                    <TableCell className="p-0.5 md:p-1 w-10 md:w-16">
                                        <Select 
                                            value={currentScores.away === '' ? '__EMPTY__' : currentScores.away} 
                                            onValueChange={(val) => handleScoreChange(q.id, 'away', val)}
                                            disabled={!onResultChange}
                                        >
                                            <SelectTrigger className="h-6 md:h-8 text-center text-[10px] md:text-sm" style={{
                                                background: hasActualResult ? 'rgba(6, 182, 212, 0.2)' : 'rgba(51, 65, 85, 0.5)',
                                                borderColor: hasActualResult ? '#06b6d4' : 'rgba(100, 116, 139, 1)',
                                                color: hasActualResult ? '#06b6d4' : '#f8fafc',
                                                fontWeight: hasActualResult ? '700' : 'normal',
                                                boxShadow: hasActualResult ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none'
                                            }}>
                                                <SelectValue>
                                                    {currentScores.away === '' ? '-' : currentScores.away}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-600">
                                                {scoreOptions.map(opt => (
                                                    <SelectItem 
                                                        key={`away-${opt}`} 
                                                        value={opt} 
                                                        className={`text-slate-200 hover:bg-slate-700 justify-center ${opt === '__EMPTY__' ? 'text-slate-400' : ''}`}
                                                    >
                                                        {opt === '__EMPTY__' ? 'ריק' : opt}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="p-1 md:p-2 text-center font-medium align-middle min-w-[50px] md:min-w-[100px]">
                                       <div className="flex flex-col items-center gap-0.5 md:gap-1">
                                            {awayTeam?.logo_url && (
                                                <img 
                                                    src={awayTeam.logo_url} 
                                                    alt={normalizedAway} 
                                                    className="w-5 h-5 md:w-8 md:h-8 rounded-full object-cover flex-shrink-0" 
                                                    style={{ border: '1px solid rgba(6, 182, 212, 0.3)' }}
                                                    onError={(e) => {
                                                        console.log(`❌ שגיאה בטעינת לוגו של ${normalizedAway}: ${awayTeam.logo_url}`);
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            )}
                                            <span className="text-slate-200 text-[8px] md:text-xs text-center truncate max-w-[50px] md:max-w-none">{normalizedAway}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell p-1 text-center align-middle w-12">
                                        {q.possible_points && (
                                            <Badge variant="outline" className="text-xs px-2 py-1" style={{
                                                borderColor: 'rgba(251, 191, 36, 0.5)',
                                                color: '#fbbf24',
                                                background: 'rgba(251, 191, 36, 0.1)'
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