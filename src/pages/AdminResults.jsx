import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { Trophy, FileText, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RoundTableResults from "@/components/predictions/RoundTableResults";
import { useGame } from "@/components/contexts/GameContext";
import { calculateTotalScore } from "@/components/scoring/ScoreService";

export default function AdminResults() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState('');
  const [results, setResults] = useState({});
  const [teams, setTeams] = useState({});
  const [validationLists, setValidationLists] = useState({});
  const [openSections, setOpenSections] = useState({});

  const [allQuestions, setAllQuestions] = useState([]);
  const [roundTables, setRoundTables] = useState([]);
  const [israeliTable, setIsraeliTable] = useState(null);
  const [specialTables, setSpecialTables] = useState([]);
  const [locationTables, setLocationTables] = useState([]);
  const [playoffWinnersTable, setPlayoffWinnersTable] = useState(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [selectedT11Teams, setSelectedT11Teams] = useState(new Set());
  const [selectedT12Teams, setSelectedT12Teams] = useState(new Set());
  const [selectedT13Teams, setSelectedT13Teams] = useState(new Set());

  const { toast } = useToast();
  const { currentGame } = useGame();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
        if (isAuth) setCurrentUser(await supabase.auth.getUser().then(r => r.data.user));
      } catch (e) { console.error("Failed to load user:", e); }
    };
    loadUser();
  }, []);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';

  // ── Helpers ───────────────────────────────────────────────────────────────
  const loadAllQuestions = async (gameId) => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('questions').select('*').eq('game_id', gameId).range(from, from + PAGE - 1);
      if (error) { console.error('questions fetch error:', error); break; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const loadAllPredictions = async (gameId) => {
    // db.Prediction.filter מוגבל ל-1000 — משתמשים ב-supabase ישיר עם range()
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('game_id', gameId)
        .range(from, from + PAGE - 1);
      if (error) { console.error('predictions fetch error:', error); break; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      console.log(`   📊 ניחושים: נטענו ${data.length}, סה"כ ${all.length}`);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const loadAllRankings = async (gameId) => {
    // db.Ranking.filter מוגבל — משתמשים ב-supabase ישיר עם range()
    let all = [], from = 0;
    const PAGE = 500;
    while (true) {
      const { data, error } = await supabase
        .from('rankings')
        .select('*')
        .eq('game_id', gameId)
        .range(from, from + PAGE - 1);
      if (error) { console.error('rankings fetch error:', error); break; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  // ── Load page data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      const questions = await loadAllQuestions(currentGame.id);
      setAllQuestions(questions);

      const teamsData = currentGame.teams_data || [];
      const teamsMap = teamsData.reduce((acc, t) => { acc[t.name] = t; return acc; }, {});
      setTeams(teamsMap);

      const listsData = currentGame.validation_lists || [];
      const listsMap = listsData.reduce((acc, l) => { acc[l.list_name] = l.options; return acc; }, {});
      listsMap['כן/לא'] = ['כן', 'לא'];
      setValidationLists(listsMap);

      const rTables = {}, sTables = {};
      questions.forEach(q => {
        if (!q.table_id) return;
        if (q.table_id === 'T3' && q.question_text && !q.home_team) {
          const parts = q.question_text.split(' - ');
          if (parts.length === 2) { q.home_team = parts[0].trim(); q.away_team = parts[1].trim(); }
        }
        if (q.table_id === 'T20' && q.question_text && !q.home_team) {
          const sep = q.question_text.includes(' נגד ') ? ' נגד ' : q.question_text.includes(' - ') ? ' - ' : null;
          if (sep) { const p = q.question_text.split(sep).map(t => t.trim()); if (p.length === 2) { q.home_team = p[0]; q.away_team = p[1]; } }
        }

        const isKnockoutMatch = q.table_id === 'T3' && q.home_team && q.away_team;
        const collection = (q.stage_name?.includes('בית') || q.table_description?.includes('בית') || isKnockoutMatch || (q.home_team && q.away_team)) ? rTables : sTables;

        let tableId = q.table_id;
        let tableDesc = q.table_description;
        if (q.stage_name?.includes('בית')) { tableId = q.stage_name; tableDesc = q.stage_name; }
        else if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order) { tableId = `custom_order_${q.stage_order}`; tableDesc = q.stage_name || q.table_description; }

        if (!collection[tableId]) collection[tableId] = { id: tableId, description: tableDesc || tableId, questions: [], stage_order: q.stage_order || 0 };
        collection[tableId].questions.push(q);
      });

      const t20Table = rTables['T20']; delete rTables['T20'];
      setIsraeliTable(t20Table || null);
      delete sTables['T1'];

      const sortedRoundTables = Object.values(rTables).sort((a, b) => {
        const aG = a.id.includes('בית'), bG = b.id.includes('בית');
        if (aG && !bG) return -1; if (!aG && bG) return 1;
        if (aG && bG) return a.id.localeCompare(b.id, 'he');
        return (parseInt(a.id.replace('T','').replace(/\D/g,'')) || 0) - (parseInt(b.id.replace('T','').replace(/\D/g,'')) || 0);
      });
      setRoundTables(sortedRoundTables);

      const locationTableIds = ['T9','T14','T15','T16','T17'];
      setLocationTables(Object.values(sTables).filter(t => locationTableIds.includes(t.id)).sort((a,b) => parseInt(a.id.replace('T','')) - parseInt(b.id.replace('T',''))));
      setPlayoffWinnersTable(sTables['T19'] || null);

      const allSpecialTables = Object.values(sTables).filter(t => {
        if (t.id === 'T10') return false;
        const desc = t.description?.trim();
        return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(t.id) && t.id !== 'T19' && !t.id.includes('בית') && t.id !== 'T1' && t.id !== 'T9';
      }).sort((a,b) => ((a.stage_order||0) - (b.stage_order||0)) || (parseInt(a.id.replace('T','').replace(/\D/g,'')) - parseInt(b.id.replace('T','').replace(/\D/g,''))));
      setSpecialTables(allSpecialTables);

      const t10Special = sTables['T10'];
      if (t10Special) {
        const t10Round = sortedRoundTables.find(t => t.id === 'T10');
        if (t10Round) t10Round.specialQuestions = t10Special.questions;
      }

      const initialResults = questions.reduce((acc, q) => {
        const r = q.actual_result;
        acc[q.id] = (!r || r === '__CLEAR__' || r.toLowerCase().includes('null')) ? '__CLEAR__' : r;
        return acc;
      }, {});
      setResults(initialResults);
    } catch (error) {
      console.error("שגיאה בטעינה:", error);
      toast({ title: "שגיאה", description: "טעינת הנתונים נכשלה.", variant: "destructive" });
    }
    setLoading(false);
  }, [currentGame, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // T11/T12/T13 selected teams
  useEffect(() => {
    const filter = (include, exclude=[]) => {
      const qs = allQuestions.filter(q => {
        const sn = q.stage_name || '', td = q.table_description || '';
        return include.some(k => sn.includes(k) || td.includes(k)) && !exclude.some(k => sn.includes(k) || td.includes(k));
      });
      const s = new Set();
      qs.forEach(q => { const r = results[q.id]; if (r && r.trim() && r !== '__CLEAR__') s.add(r); });
      return s;
    };
    setSelectedT11Teams(filter(['רבע גמר']));
    setSelectedT12Teams(filter(['חצי גמר']));
    setSelectedT13Teams(filter(['גמר'],['רבע','חצי']));
  }, [results, allQuestions]);

  const handleResultChange = (questionId, value) => {
    if (!isAdmin) return;
    setResults(prev => ({ ...prev, [questionId]: value === '' ? '__CLEAR__' : value }));
  };

  // ── Calculate participant score ────────────────────────────────────────────
  const calcParticipantScore = (qs, predictions) => {
    const latest = {};
    predictions.forEach(p => {
      const ex = latest[p.question_id];
      if (!ex || new Date(p.created_at) > new Date(ex.created_at)) latest[p.question_id] = p;
    });
    const predMap = {};
    for (const [qid, p] of Object.entries(latest)) predMap[qid] = p.text_prediction;
    const { total } = calculateTotalScore(qs, predMap);
    return total;
  };

  // ── Recalculate rankings for ALL participants ──────────────────────────────
  const recalculateRankings = async () => {
    if (!currentGame) return;
    setRecalculating(true);
    setRecalcProgress('טוען שאלות...');
    try {
      // 1. שאלות
      let qs = await loadAllQuestions(currentGame.id);
      qs = qs.filter(q => q.table_id && q.table_id !== 'T1');
      qs.forEach(q => {
        if (!q.home_team && !q.away_team && q.question_text) {
          const sep = q.question_text.includes(' נגד ') ? ' נגד ' : q.question_text.includes(' - ') ? ' - ' : null;
          if (sep) { const p = q.question_text.split(sep).map(t => t.trim()); if (p.length === 2) { q.home_team = p[0]; q.away_team = p[1]; } }
        }
      });
      console.log(`✅ ${qs.length} שאלות`);

      // 2. ניחושים — כולם
      setRecalcProgress('טוען ניחושים...');
      const preds = await loadAllPredictions(currentGame.id);
      console.log(`✅ ${preds.length} ניחושים`);

      // 3. קיבוץ לפי משתתף
      const byParticipant = {};
      preds.forEach(p => {
        if (!p.participant_name?.trim()) return;
        if (!byParticipant[p.participant_name]) byParticipant[p.participant_name] = [];
        byParticipant[p.participant_name].push(p);
      });
      const participants = Object.keys(byParticipant);
      console.log(`✅ ${participants.length} משתתפים`);

      // 4. חישוב ניקוד
      setRecalcProgress(`מחשב ניקוד עבור ${participants.length} משתתפים...`);
      const scores = participants.map(name => ({
        participant_name: name,
        current_score: calcParticipantScore(qs, byParticipant[name])
      }));
      scores.sort((a, b) => b.current_score - a.current_score);
      let pos = 1;
      scores.forEach((s, i) => {
        if (i > 0 && scores[i].current_score !== scores[i-1].current_score) pos = i + 1;
        s.current_position = pos;
      });

      // 5. טען baselines קיימות — עם pagination מלאה!
      setRecalcProgress('טוען דירוג קיים...');
      const existingRankings = await loadAllRankings(currentGame.id);
      console.log(`✅ ${existingRankings.length} שורות דירוג קיימות`);
      const baselineMap = {};
      existingRankings.forEach(r => { baselineMap[r.participant_name] = r; });

      // 6. שמור
      let saved = 0;
      for (const s of scores) {
        const base = baselineMap[s.participant_name];
        setRecalcProgress(`שומר ${++saved}/${scores.length}: ${s.participant_name}`);
        const data = {
          participant_name: s.participant_name,
          game_id: currentGame.id,
          current_score: s.current_score,
          current_position: s.current_position,
          previous_score: base?.current_score || 0,
          previous_position: base?.current_position || 0,
          baseline_score: base?.baseline_score || 0,
          baseline_position: base?.baseline_position || 0,
          score_change: s.current_score - (base?.baseline_score || 0),
          position_change: (base?.baseline_position || 0) - s.current_position,
          last_updated: new Date().toISOString(),
          last_baseline_set: base?.last_baseline_set || null
        };
        try {
          if (base) await db.Ranking.update(base.id, data);
          else await db.Ranking.create(data);
        } catch (err) { console.error('שגיאה בדירוג', s.participant_name, err); }
        // rate limit — 100ms בין כל שמירה
        await new Promise(r => setTimeout(r, 100));
      }

      setRecalcProgress('');
      toast({
        title: "✅ דירוג עודכן!",
        description: `חושב ניקוד עבור ${scores.length} משתתפים`,
        className: "bg-green-900/30 border-green-500 text-green-200",
        duration: 4000
      });
    } catch (error) {
      console.error("שגיאה בחישוב דירוג:", error);
      setRecalcProgress('');
      toast({ title: "שגיאה בדירוג", description: error.message, variant: "destructive" });
    }
    setRecalculating(false);
  };

  // ── Save results ──────────────────────────────────────────────────────────
  const handleSaveResults = async () => {
    setSaving(true);
    try {
      const changedQuestions = allQuestions.filter(q => {
        const nv = (results[q.id] === '__CLEAR__' || !results[q.id]) ? null : results[q.id];
        const ov = q.actual_result || null;
        return nv !== ov;
      });

      if (changedQuestions.length === 0) {
        toast({ title: "לא בוצעו שינויים", description: "אין שינויים לשמור" });
        setSaving(false);
        return;
      }

      console.log(`💾 שומר ${changedQuestions.length} שאלות...`);
      for (let i = 0; i < changedQuestions.length; i++) {
        const q = changedQuestions[i];
        const val = (results[q.id] === '__CLEAR__' || !results[q.id]) ? null : results[q.id];
        await db.Question.update(q.id, { actual_result: val });
        if ((i + 1) % 3 === 0) await new Promise(r => setTimeout(r, 300));
      }

      toast({
        title: "נשמר!",
        description: `עודכנו ${changedQuestions.length} תוצאות — מחשב דירוג...`,
        className: "bg-cyan-900/30 border-cyan-500 text-cyan-200",
        duration: 3000
      });

      await loadData();
      await recalculateRankings();
    } catch (error) {
      console.error("שגיאה בשמירה:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleSection = (sectionId) => setOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));

  const findTeam = (name) => {
    if (!name) return null;
    if (teams[name]) return teams[name];
    const base = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return teams[base] || null;
  };

  const renderSelectWithLogos = (question, value, onChange, selectClassName = "w-[200px]") => {
    const options = validationLists[question.validation_list] || [];
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ') || question.validation_list?.toLowerCase().includes('נבחר');
    const hasResult = value && value !== '__CLEAR__';

    if (!question.validation_list || options.length === 0) {
      return (
        <Input
          value={value === '__CLEAR__' ? '' : (value || '')}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '180px',
            background: hasResult ? 'rgba(6,182,212,0.2)' : 'rgba(51,65,85,0.5)',
            borderColor: hasResult ? '#06b6d4' : 'rgba(100,116,139,1)',
            color: hasResult ? '#06b6d4' : '#f8fafc',
            fontWeight: hasResult ? '700' : 'normal'
          }}
          placeholder="הזן תוצאה..."
          readOnly={!isAdmin}
        />
      );
    }

    const safeValue = (!value || value === 'null' || value === 'undefined' || value.toLowerCase?.().includes('null')) ? '__CLEAR__' : value;

    return (
      <Select value={safeValue} onValueChange={onChange} disabled={!isAdmin}>
        <SelectTrigger className={selectClassName} style={{
          background: hasResult ? 'rgba(6,182,212,0.2)' : 'rgba(51,65,85,0.5)',
          borderColor: hasResult ? '#06b6d4' : 'rgba(100,116,139,1)',
          color: hasResult ? '#06b6d4' : '#94a3b8',
          fontWeight: hasResult ? '700' : 'normal'
        }}>
          <SelectValue placeholder="בחר...">
            {!hasResult ? 'בחר...' : (
              <div className="flex items-center gap-2">
                {isTeamsList && findTeam(value)?.logo_url && (
                  <img src={findTeam(value).logo_url} alt={value} className="w-5 h-5 rounded-full" onError={e => e.target.style.display='none'} />
                )}
                <span>{value.replace(/\s*\([^)]+\)\s*$/, '').trim()}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-cyan-600 text-slate-200">
          <SelectItem value="__CLEAR__" className="hover:bg-cyan-700/20 text-blue-300">בחר...</SelectItem>
          {options.map(opt => {
            const team = isTeamsList ? findTeam(opt) : null;
            const safeVal = (!value || value === '__CLEAR__') ? '' : value;
            const sn = question.stage_name || '', td = question.table_description || '';
            const isS11 = sn.includes('רבע גמר') || td.includes('רבע גמר');
            const isS12 = sn.includes('חצי גמר') || td.includes('חצי גמר');
            const isS13 = (sn.includes('גמר') && !sn.includes('רבע') && !sn.includes('חצי')) || (td.includes('גמר') && !td.includes('רבע') && !td.includes('חצי'));
            const alreadySelected =
              (isS11 && selectedT11Teams.has(opt) && safeVal !== opt) ||
              (isS12 && selectedT12Teams.has(opt) && safeVal !== opt) ||
              (isS13 && selectedT13Teams.has(opt) && safeVal !== opt);
            return (
              <SelectItem key={opt} value={opt} className="hover:bg-cyan-700/20" disabled={alreadySelected} style={{ opacity: alreadySelected ? 0.4 : 1 }}>
                <div className="flex items-center gap-2">
                  {team?.logo_url && <img src={team.logo_url} alt={opt} className="w-5 h-5 rounded-full" onError={e => e.target.style.display='none'} style={{ opacity: alreadySelected ? 0.4 : 1 }} />}
                  <span style={{ color: alreadySelected ? '#64748b' : '#f8fafc' }}>{opt.replace(/\s*\([^)]+\)\s*$/, '').trim()}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  };

  const renderQuestionRow = (q, cols = 4, widths = { select: '160px' }) => (
    <div key={q.id} style={{
      display: 'grid',
      gridTemplateColumns: cols === 4 ? `50px 1fr ${widths.select} 50px` : `50px 1fr ${widths.select} 50px`,
      gap: '8px', alignItems: 'center', padding: '8px 12px', borderRadius: '6px'
    }} className="border border-cyan-600/30 bg-slate-700/20">
      <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{q.question_id}</Badge>
      <span className="text-right font-medium text-sm text-blue-100 truncate">{q.question_text}</span>
      {renderSelectWithLogos(q, results[q.id] || '', val => handleResultChange(q.id, val === '__CLEAR__' ? '' : val), `w-[${widths.select}]`)}
      <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6,182,212,0.5)', color: '#06b6d4', background: 'rgba(6,182,212,0.1)' }}>{q.possible_points || 0}</Badge>
    </div>
  );

  const renderSpecialQuestions = (table) => {
    const grouped = {};
    table.questions.forEach((q, idx) => {
      const qId = q.question_id != null ? String(q.question_id) : String(q.stage_order || idx);
      const mainId = Math.floor(parseFloat(qId)) || (q.stage_order || idx);
      if (!grouped[mainId]) grouped[mainId] = { main: null, subs: [] };
      if (qId.includes('.')) grouped[mainId].subs.push(q);
      else grouped[mainId].main = q;
    });
    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    return (
      <Card className="bg-slate-800/40 border-cyan-700 shadow-lg shadow-cyan-900/20">
        <CardHeader className="py-3"><CardTitle className="text-cyan-400">{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          <div className="space-y-2">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id || a.stage_order) - parseFloat(b.question_id || b.stage_order));

              if (sortedSubs.length === 0) return renderQuestionRow(main);

              if (sortedSubs.length === 1) {
                return (
                  <div key={main.id} style={{ display: 'grid', gridTemplateColumns: '50px minmax(250px,2fr) 160px 50px 1fr 50px minmax(180px,1.5fr) 160px 50px', gap: '8px', alignItems: 'center', padding: '8px 12px', borderRadius: '6px' }} className="border border-cyan-600/30 bg-slate-700/20">
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <label className="text-right font-medium text-sm text-blue-100">{main.question_text}</label>
                    {renderSelectWithLogos(main, results[main.id] || '', val => handleResultChange(main.id, val === '__CLEAR__' ? '' : val), 'w-[160px]')}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6,182,212,0.5)', color: '#06b6d4', background: 'rgba(6,182,212,0.1)' }}>{main.possible_points || 0}</Badge>
                    <div />
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sortedSubs[0].question_id}</Badge>
                    <label className="text-right font-medium text-sm text-blue-100">{sortedSubs[0].question_text}</label>
                    {renderSelectWithLogos(sortedSubs[0], results[sortedSubs[0].id] || '', val => handleResultChange(sortedSubs[0].id, val === '__CLEAR__' ? '' : val), 'w-[160px]')}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6,182,212,0.5)', color: '#06b6d4', background: 'rgba(6,182,212,0.1)' }}>{sortedSubs[0].possible_points || 0}</Badge>
                  </div>
                );
              }

              return (
                <div key={main.id} style={{ display: 'grid', gridTemplateColumns: '45px 1fr 140px 45px 45px 1fr 140px 45px 45px 1fr 140px 45px', gap: '6px', alignItems: 'center', padding: '8px 12px', borderRadius: '6px' }} className="border border-cyan-600/30 bg-slate-700/20">
                  <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                  <label className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</label>
                  {renderSelectWithLogos(main, results[main.id] || '', val => handleResultChange(main.id, val === '__CLEAR__' ? '' : val), 'w-[140px]')}
                  <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6,182,212,0.5)', color: '#06b6d4', background: 'rgba(6,182,212,0.1)' }}>{main.possible_points || 0}</Badge>
                  {sortedSubs.map(sub => (
                    <React.Fragment key={sub.id}>
                      <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sub.question_id}</Badge>
                      <label className="text-right font-medium text-sm text-blue-100 truncate">{sub.question_text}</label>
                      {renderSelectWithLogos(sub, results[sub.id] || '', val => handleResultChange(sub.id, val === '__CLEAR__' ? '' : val), 'w-[140px]')}
                      <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6,182,212,0.5)', color: '#06b6d4', background: 'rgba(6,182,212,0.1)' }}>{sub.possible_points || 0}</Badge>
                    </React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Stage chips ───────────────────────────────────────────────────────────
  const renderStageChips = (buttons) => {
    const groupMap = {
      playoff:    { label: '⚽ משחקי פלייאוף',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)' },
      special:    { label: '✨ שאלות מיוחדות',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)' },
      qualifiers: { label: '📋 רשימות עולות',   color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.35)' },
      other:      { label: '📌 נוסף',             color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)' },
    };
    const grouped = {};
    buttons.forEach(btn => {
      const t = btn.stageType || (btn.sectionKey.startsWith('round_') ? 'playoff' : (btn.stageType === 'qualifiers' ? 'qualifiers' : 'special'));
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(btn);
    });
    const order = ['playoff','special','qualifiers','other'];
    return (
      <div style={{ padding: '14px 12px', background: 'rgba(17,24,39,0.7)', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.12)', marginBottom: '16px' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569', marginBottom: '10px' }}>בחירת שלב</div>
        {order.filter(t => grouped[t]).map(type => {
          const info = groupMap[type] || groupMap.other;
          return (
            <div key={type} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '0.58rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: info.color, marginBottom: '5px' }}>{info.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {grouped[type].map(btn => {
                  const active = openSections[btn.sectionKey];
                  return (
                    <button key={btn.key} onClick={() => toggleSection(btn.sectionKey)} style={{
                      display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: '999px',
                      fontSize: '0.78rem', fontWeight: active ? '700' : '400',
                      color: active ? 'white' : info.color, background: active ? info.color : info.bg,
                      border: `1px solid ${active ? info.color : info.border}`, cursor: 'pointer',
                      transition: 'all 0.15s', boxShadow: active ? `0 0 10px ${info.color}66` : 'none',
                      fontFamily: 'Rubik, Heebo, sans-serif', whiteSpace: 'nowrap'
                    }}>{btn.description}</button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <span className="mr-3 text-cyan-300">טוען נתונים...</span>
      </div>
    );
  }

  // Build nav buttons
  const allButtons = [];
  roundTables.forEach(t => allButtons.push({ numericId: t.stage_order || parseInt(t.id.replace('T','').replace(/\D/g,''))||0, stageType: 'playoff', key: `round_${t.id}`, description: t.description || t.id, sectionKey: `round_${t.id}` }));
  specialTables.forEach(t => allButtons.push({ numericId: t.stage_order || parseInt(t.id.replace('T','').replace(/\D/g,''))||0, stageType: 'special', key: t.id, description: t.description, sectionKey: t.id }));
  if (locationTables.length > 0) allButtons.push({ numericId: 99, stageType: 'other', key: 'locations', description: 'מיקומים', sectionKey: 'locations' });
  if (israeliTable) allButtons.push({ numericId: parseInt(israeliTable.id.replace('T','')||'0'), stageType: 'special', key: israeliTable.id, description: israeliTable.description, sectionKey: 'israeli' });
  if (playoffWinnersTable) allButtons.push({ numericId: parseInt(playoffWinnersTable.id.replace('T','')||'0'), stageType: 'qualifiers', key: playoffWinnersTable.id, description: playoffWinnersTable.description, sectionKey: 'playoffWinners' });
  allButtons.sort((a, b) => a.numericId - b.numericId);

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto" dir="rtl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', minHeight: '100vh' }}>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-3 mb-4 md:mb-8">
        <div>
          <h1 className="text-xl md:text-3xl font-bold mb-1 flex items-center gap-2" style={{ color: '#f8fafc', textShadow: '0 0 10px rgba(6,182,212,0.3)' }}>
            <Trophy className="w-6 h-6 md:w-8 md:h-8" style={{ color: '#06b6d4' }} />
            {isAdmin ? 'עדכון תוצאות אמת' : 'תוצאות אמת'}
          </h1>
          <p className="text-xs md:text-base" style={{ color: '#94a3b8' }}>
            {isAdmin ? 'עדכן תוצאות ואז לחץ "שמור תוצאות"' : 'צפייה בתוצאות האמיתיות'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleSaveResults} disabled={saving || recalculating} className="h-10 px-6 text-white" style={{
            background: recalculating ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
            boxShadow: recalculating ? '0 0 20px rgba(16,185,129,0.4)' : '0 0 20px rgba(6,182,212,0.4)'
          }}>
            {saving ? <><Loader2 className="w-5 h-5 animate-spin ml-2" />שומר...</>
              : recalculating ? <><Loader2 className="w-5 h-5 animate-spin ml-2" />מחשב דירוג...</>
              : <><Save className="w-5 h-5 ml-2" />שמור תוצאות</>}
          </Button>
        )}
      </div>

      {/* Progress */}
      {recalculating && recalcProgress && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
          ⏳ {recalcProgress}
        </div>
      )}

      {allButtons.length === 0 ? (
        <Alert variant="destructive" className="bg-cyan-900/50 border-cyan-700 text-cyan-200">
          <FileText className="w-4 h-4" />
          <AlertDescription>לא נמצאו שאלות במערכת.</AlertDescription>
        </Alert>
      ) : (
        <>
          {renderStageChips(allButtons)}
          {allButtons.map(button => {
            if (!openSections[button.sectionKey]) return null;
            if (button.sectionKey.startsWith('round_')) {
              const tableId = button.sectionKey.replace('round_', '');
              const table = roundTables.find(t => t.id === tableId);
              if (!table) return null;
              return (
                <div key={button.key} className="mb-4 space-y-3">
                  <RoundTableResults table={table} teams={teams} results={results} onResultChange={handleResultChange} isAdmin={isAdmin} />
                  {table.specialQuestions?.length > 0 && (
                    <div className="mt-4">{renderSpecialQuestions({ ...table, questions: table.specialQuestions })}</div>
                  )}
                </div>
              );
            }
            if (button.sectionKey === 'israeli' && israeliTable) return <div key="israeli" className="mb-4"><RoundTableResults table={israeliTable} teams={teams} results={results} onResultChange={handleResultChange} isAdmin={isAdmin} /></div>;
            if (button.sectionKey === 'locations') return <div key="locations" className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">{locationTables.map(t => renderSpecialQuestions(t))}</div>;
            if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) return <div key="playoffWinners" className="mb-6">{renderSpecialQuestions(playoffWinnersTable)}</div>;
            const t = specialTables.find(t => t.id === button.key);
            if (t) return <div key={t.id} className="mb-6">{renderSpecialQuestions(t)}</div>;
            return null;
          })}
        </>
      )}
    </div>
  );
}
