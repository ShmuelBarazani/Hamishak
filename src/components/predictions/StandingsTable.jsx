import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

export default function StandingsTable({ roundTables, teams, data, type = "predictions" }) {
  const [selectedRounds, setSelectedRounds] = useState("all");

  // 🏠 בדיקה אם כל הטבלאות הן בתים
  const isGroupStage = roundTables && roundTables.length > 0 && 
                       roundTables.every(table => table.id?.includes('בית') || table.description?.includes('בית'));

  // 🏠 חישוב טבלאות נפרדות לכל בית
  const groupStandings = useMemo(() => {
    if (!roundTables || roundTables.length === 0 || !isGroupStage) return null;

    const groupTables = {};

    roundTables.forEach(table => {
      const groupName = table.id;
      const teamStats = {};

      table.questions.forEach(q => {
        if (!q.home_team || !q.away_team) return;

        let homeScore = null, awayScore = null;

        if (type === "predictions") {
          const prediction = data[q.id];
          if (prediction && prediction.includes('-')) {
            const parts = prediction.split('-').map(x => parseInt(x.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              homeScore = parts[0];
              awayScore = parts[1];
            }
          }
        } else {
          const actual = q.actual_result;
          if (actual && actual.trim() !== '' && actual !== '__CLEAR__' && actual.includes('-')) {
            const parts = actual.split('-').map(x => parseInt(x.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              homeScore = parts[0];
              awayScore = parts[1];
            }
          }
        }

        if (homeScore === null || awayScore === null) return;

        if (!teamStats[q.home_team]) {
          teamStats[q.home_team] = {
            name: q.home_team,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0
          };
        }
        if (!teamStats[q.away_team]) {
          teamStats[q.away_team] = {
            name: q.away_team,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0
          };
        }

        teamStats[q.home_team].played++;
        teamStats[q.away_team].played++;
        
        teamStats[q.home_team].goalsFor += homeScore;
        teamStats[q.home_team].goalsAgainst += awayScore;
        
        teamStats[q.away_team].goalsFor += awayScore;
        teamStats[q.away_team].goalsAgainst += homeScore;

        if (homeScore > awayScore) {
          teamStats[q.home_team].wins++;
          teamStats[q.home_team].points += 3;
          teamStats[q.away_team].losses++;
        } else if (homeScore < awayScore) {
          teamStats[q.away_team].wins++;
          teamStats[q.away_team].points += 3;
          teamStats[q.home_team].losses++;
        } else {
          teamStats[q.home_team].draws++;
          teamStats[q.home_team].points += 1;
          teamStats[q.away_team].draws++;
          teamStats[q.away_team].points += 1;
        }
      });

      const sortedStandings = Object.values(teamStats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        
        const goalDiffA = a.goalsFor - a.goalsAgainst;
        const goalDiffB = b.goalsFor - b.goalsAgainst;
        if (goalDiffB !== goalDiffA) return goalDiffB - goalDiffA;
        
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        
        return a.name.localeCompare(b.name, 'he');
      });

      groupTables[groupName] = sortedStandings;
    });

    return groupTables;
  }, [roundTables, data, type, isGroupStage]);

  // חישוב טבלה רגילה (ליגה)
  const leagueStandings = useMemo(() => {
    if (!roundTables || roundTables.length === 0 || isGroupStage) return [];

    const teamStats = {};

    const tablesToProcess = selectedRounds === "all" 
      ? roundTables 
      : roundTables.slice(0, parseInt(selectedRounds) + 1);

    tablesToProcess.forEach(table => {
      table.questions.forEach(q => {
        if (!q.home_team || !q.away_team) return;

        let homeScore = null, awayScore = null;

        if (type === "predictions") {
          const prediction = data[q.id];
          if (prediction && prediction.includes('-')) {
            const parts = prediction.split('-').map(x => parseInt(x.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              homeScore = parts[0];
              awayScore = parts[1];
            }
          }
        } else {
          const actual = q.actual_result;
          if (actual && actual.trim() !== '' && actual !== '__CLEAR__' && actual.includes('-')) {
            const parts = actual.split('-').map(x => parseInt(x.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              homeScore = parts[0];
              awayScore = parts[1];
            }
          }
        }

        if (homeScore === null || awayScore === null) return;

        if (!teamStats[q.home_team]) {
          teamStats[q.home_team] = {
            name: q.home_team,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0
          };
        }
        if (!teamStats[q.away_team]) {
          teamStats[q.away_team] = {
            name: q.away_team,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0
          };
        }

        teamStats[q.home_team].played++;
        teamStats[q.away_team].played++;
        
        teamStats[q.home_team].goalsFor += homeScore;
        teamStats[q.home_team].goalsAgainst += awayScore;
        
        teamStats[q.away_team].goalsFor += awayScore;
        teamStats[q.away_team].goalsAgainst += homeScore;

        if (homeScore > awayScore) {
          teamStats[q.home_team].wins++;
          teamStats[q.home_team].points += 3;
          teamStats[q.away_team].losses++;
        } else if (homeScore < awayScore) {
          teamStats[q.away_team].wins++;
          teamStats[q.away_team].points += 3;
          teamStats[q.home_team].losses++;
        } else {
          teamStats[q.home_team].draws++;
          teamStats[q.home_team].points += 1;
          teamStats[q.away_team].draws++;
          teamStats[q.away_team].points += 1;
        }
      });
    });

    const sortedStandings = Object.values(teamStats).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      
      const goalDiffA = a.goalsFor - a.goalsAgainst;
      const goalDiffB = b.goalsFor - b.goalsAgainst;
      if (goalDiffB !== goalDiffA) return goalDiffB - goalDiffA;
      
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      
      return a.name.localeCompare(b.name, 'he');
    });

    return sortedStandings;
  }, [roundTables, data, selectedRounds, type, isGroupStage]);

  if (!roundTables || roundTables.length === 0) return null;

  const renderStandingsTable = (standings, title = null) => {
    const hasAnyData = standings.length > 0 && standings.some(s => s.played > 0);

    return (
      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        {title && (
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-1.5 text-sm" style={{ color: '#06b6d4' }}>
              <Trophy className="w-4 h-4" />
              {title}
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="p-2">
          {!hasAnyData ? (
            <div className="text-center py-4 text-xs" style={{ color: '#94a3b8' }}>
              {type === "predictions" 
                ? "אין ניחושים" 
                : "אין תוצאות"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.2)' }}>
                    <TableHead className="text-center py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>#</TableHead>
                    <TableHead className="text-right py-1 px-0.5 md:px-1 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>קבוצה</TableHead>
                    <TableHead className="text-center py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>מש</TableHead>
                    <TableHead className="text-center py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>נ</TableHead>
                    <TableHead className="text-center py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>ת</TableHead>
                    <TableHead className="text-center py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>ה</TableHead>
                    <TableHead className="hidden md:table-cell text-center py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>שערים</TableHead>
                    <TableHead className="text-center py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>+/-</TableHead>
                    <TableHead className="text-center py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#06b6d4' }}>נק'</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standings.map((team, index) => {
                    const teamData = teams[team.name];
                    const goalDiff = team.goalsFor - team.goalsAgainst;
                    
                    let positionColor = '';
                    if (isGroupStage) {
                      if (index === 0) positionColor = 'bg-yellow-600';
                      else if (index === 1) positionColor = 'bg-green-600';
                      else if (index <= 3) positionColor = 'bg-blue-600';
                    } else {
                      if (index === 0) positionColor = 'bg-yellow-600';
                      else if (index <= 7) positionColor = 'bg-green-600';
                      else if (index <= 23) positionColor = 'bg-blue-600';
                    }

                    return (
                      <TableRow 
                        key={team.name} 
                        className="hover:bg-cyan-900/20 transition-colors"
                        style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}
                      >
                        <TableCell className="text-center py-0.5 md:py-1 px-0.5">
                            <Badge 
                              className={`${positionColor} text-white font-bold text-[8px] md:text-xs px-1 md:px-1.5 py-0`}
                              style={{ minWidth: '16px' }}
                            >
                              {index + 1}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-0.5 md:py-1 px-0.5 md:px-1">
                            <div className="flex items-center gap-0.5 md:gap-1">
                              {teamData?.logo_url && (
                                <img 
                                  src={teamData.logo_url} 
                                  alt={team.name} 
                                  className="w-4 h-4 md:w-5 md:h-5 rounded-full flex-shrink-0" 
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              )}
                              <span className="text-[8px] md:text-xs truncate max-w-[50px] md:max-w-[100px]" style={{ color: '#f8fafc' }}>{team.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-0.5 md:py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#94a3b8' }}>
                            {team.played}
                          </TableCell>
                          <TableCell className="text-center py-0.5 md:py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#4ade80' }}>
                            {team.wins}
                          </TableCell>
                          <TableCell className="text-center py-0.5 md:py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#fbbf24' }}>
                            {team.draws}
                          </TableCell>
                          <TableCell className="text-center py-0.5 md:py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#f87171' }}>
                            {team.losses}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-center py-0.5 md:py-1 px-0.5 text-[8px] md:text-xs" style={{ color: '#94a3b8' }}>
                            {team.goalsAgainst}:{team.goalsFor}
                          </TableCell>
                          <TableCell className="text-center py-0.5 md:py-1 px-0.5">
                            <span className="text-[8px] md:text-xs font-semibold" style={{ 
                              color: goalDiff > 0 ? '#4ade80' : goalDiff < 0 ? '#f87171' : '#94a3b8'
                            }}>
                              {goalDiff > 0 ? '+' : ''}{goalDiff}
                            </span>
                          </TableCell>
                          <TableCell className="text-center py-0.5 md:py-1 px-0.5">
                            <Badge 
                              className="bg-cyan-600 text-white font-bold text-[8px] md:text-xs px-1 md:px-2 py-0"
                              style={{ minWidth: '18px' }}
                            >
                              {team.points}
                            </Badge>
                          </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // 🏠 רינדור בתים - טבלה נפרדת לכל בית!
  if (isGroupStage && groupStandings) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(groupStandings)
          .sort((a, b) => a[0].localeCompare(b[0], 'he'))
          .map(([groupName, standings]) => renderStandingsTable(standings, groupName))}
      </div>
    );
  }

  // רינדור ליגה רגילה עם סלקטור מחזורים
  const hasAnyData = leagueStandings.length > 0 && leagueStandings.some(s => s.played > 0);

  return (
    <Card style={{
      background: 'rgba(30, 41, 59, 0.6)',
      border: '1px solid rgba(6, 182, 212, 0.2)',
      backdropFilter: 'blur(10px)'
    }}>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm" style={{ color: '#06b6d4' }}>
            <Trophy className="w-4 h-4" />
            טבלת דירוג קבוצות
          </CardTitle>
          <Select value={selectedRounds} onValueChange={setSelectedRounds}>
            <SelectTrigger className="w-32 h-7 text-xs" style={{
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
              <SelectItem value="all" style={{ color: '#f8fafc' }}>
                כל המחזורים
              </SelectItem>
              {roundTables.map((table, index) => (
                <SelectItem key={table.id} value={String(index)} style={{ color: '#f8fafc' }}>
                  עד מחזור {index + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {!hasAnyData ? (
          <div className="text-center py-4 text-xs" style={{ color: '#94a3b8' }}>
            {type === "predictions" 
              ? "אין ניחושים למחזורים שנבחרו" 
              : "אין תוצאות למחזורים שנבחרו"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.2)' }}>
                  <TableHead className="text-center py-1 px-0.5 text-xs" style={{ color: '#06b6d4' }}>#</TableHead>
                  <TableHead className="text-right py-1 px-1 text-xs" style={{ color: '#06b6d4' }}>קבוצה</TableHead>
                  <TableHead className="text-center py-1 px-0.5 text-xs" style={{ color: '#06b6d4' }}>מש</TableHead>
                  <TableHead className="text-center py-1 px-0.5 text-xs" style={{ color: '#06b6d4' }}>נ</TableHead>
                  <TableHead className="text-center py-1 px-0.5 text-xs" style={{ color: '#06b6d4' }}>ת</TableHead>
                  <TableHead className="text-center py-1 px-0.5 text-xs" style={{ color: '#06b6d4' }}>ה</TableHead>
                  <TableHead className="text-center py-1 px-0.5 text-xs" style={{ color: '#06b6d4' }}>שערים</TableHead>
                  <TableHead className="text-center py-1 px-0.5 text-xs" style={{ color: '#06b6d4' }}>הפרש</TableHead>
                  <TableHead className="text-center py-1 px-0.5 text-xs" style={{ color: '#06b6d4' }}>נק'</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leagueStandings.map((team, index) => {
                  const teamData = teams[team.name];
                  const goalDiff = team.goalsFor - team.goalsAgainst;

                  let positionColor = '';
                  if (index === 0) {
                    positionColor = 'bg-yellow-600';
                  } else if (index <= 7) {
                    positionColor = 'bg-green-600';
                  } else if (index <= 23) {
                    positionColor = 'bg-blue-600';
                  }

                  return (
                    <TableRow 
                      key={team.name} 
                      className="hover:bg-cyan-900/20 transition-colors"
                      style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}
                    >
                      <TableCell className="text-center py-1 px-0.5">
                        <Badge 
                          className={`${positionColor} text-white font-bold text-xs px-1.5 py-0`}
                          style={{ minWidth: '20px' }}
                        >
                          {index + 1}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1 px-1">
                        <div className="flex items-center gap-1">
                          {teamData?.logo_url && (
                            <img 
                              src={teamData.logo_url} 
                              alt={team.name} 
                              className="w-5 h-5 rounded-full flex-shrink-0" 
                              onError={(e) => e.target.style.display = 'none'}
                            />
                          )}
                          <span className="text-xs truncate max-w-[100px]" style={{ color: '#f8fafc' }}>{team.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center py-1 px-0.5 text-xs" style={{ color: '#94a3b8' }}>
                        {team.played}
                      </TableCell>
                      <TableCell className="text-center py-1 px-0.5 text-xs" style={{ color: '#4ade80' }}>
                        {team.wins}
                      </TableCell>
                      <TableCell className="text-center py-1 px-0.5 text-xs" style={{ color: '#fbbf24' }}>
                        {team.draws}
                      </TableCell>
                      <TableCell className="text-center py-1 px-0.5 text-xs" style={{ color: '#f87171' }}>
                        {team.losses}
                      </TableCell>
                      <TableCell className="text-center py-1 px-0.5 text-xs" style={{ color: '#94a3b8' }}>
                        {team.goalsAgainst}:{team.goalsFor}
                      </TableCell>
                      <TableCell className="text-center py-1 px-0.5">
                        <span className="text-xs font-semibold" style={{ 
                          color: goalDiff > 0 ? '#4ade80' : goalDiff < 0 ? '#f87171' : '#94a3b8'
                        }}>
                          {goalDiff > 0 ? '+' : ''}{goalDiff}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-1 px-0.5">
                        <Badge 
                          className="bg-cyan-600 text-white font-bold text-xs px-2 py-0"
                          style={{ minWidth: '24px' }}
                        >
                          {team.points}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}