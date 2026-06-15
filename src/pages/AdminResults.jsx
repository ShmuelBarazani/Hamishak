import React, { useState, useEffect, useCallback, startTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { Trophy, FileText, Save, Loader2, Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RoundTableResults from "@/components/predictions/RoundTableResults";
import { useGame } from "@/components/contexts/GameContext";
import { calculateTotalScore } from "@/components/scoring/ScoreService";

// 🌍 מונדיאל 2026 — לוגיקה ייעודית
const WC_GAME_ID = '30032806-6216-496f-ac32-fb628e181742';

const MULTI_ANSWER_QUESTIONS = new Set([
  'T2_1', 'T2_2', 'T2_3', 'T2_8', 'T2_10',
]);

// 🌍 מונדיאל — שאלות עם אפשרות לתשובות מרובות (שוויון אפשרי)
const WC_MULTI_ANSWER_QUESTIONS = new Set([
  // T14 — שלב הבתים
  'T14_5',  // הבית עם מס' השערים הנמוך ביותר
  'T14_6',  // הבית עם מס' השערים הרב ביותר
  'T14_7',  // הנבחרת שתבקיע הכי הרבה שערים
  'T14_8',  // הנבחרת שתספוג הכי הרבה שערים
  'T14_9',  // הנבחרת שתבקיע הכי מעט שערים
  'T14_10', // הנבחרת שתספוג הכי מעט שערים
  'T14_11', // הנבחרת עם הכי הרבה תיקו
  'T14_13', // הנבחרת שתספוג הכי הרבה כרטיסים אדומים
  'T14_15', // מלך השערים בבתים
  'T14_16', // הנבחרת עם הכי הרבה פנדלים לזכותה
  'T14_17', // הנבחרת עם הכי הרבה פנדלים לחובתה
  // T26 — הטורניר
  'T26_1',  // מלך השערים של הטורניר
  'T26_2',  // מלך הבישולים של הטורניר
  'T26_3',  // הנבחרת עם הכי הרבה פנדלים לזכותה
  'T26_4',  // הנבחרת עם הכי הרבה פנדלים לחובתה
  'T26_5',  // הנבחרת שתכבוש הכי הרבה שערים
  'T26_13', // תוצאת התיקו השכיחה
  'T26_14', // התוצאה השכיחה ביותר
  // T15 — ראש בראש "התותחים הכבדים" (שחקנים + יבשות)
  'T15_1',  // מי יבקיע יותר שערים (שחקן)
  'T15_2',  // מאיזו יבשת יבקיעו יותר (יבשת)
  'T15_4',  // מי יבקיע יותר בנגיחה (שחקן)
  'T15_5',  // מאיזו יבשת בנגיחה (יבשת)
  'T15_7',  // מי יבשל יותר (שחקן)
  'T15_8',  // מאיזו יבשת יבשלו יותר (יבשת)
  'T15_11', // מי יכבוש צמד+ ביותר משחקים (שחקן)
  'T15_12', // שחקנים מאיזו יבשת צמד+ (יבשת)
  'T15_14', // מי יחליף/יוחלף הכי הרבה (שחקן)
  'T15_15', // שחקנים מאיזו יבשת יוחלפו יותר (יבשת)
  'T15_16', // לאיזו יבשת יותר ניצחונות (יבשת)
]);

const isMultiAnswerQuestion = (q) => {
  const key = `${q.table_id}_${q.question_id}`;
  // 🌍 מונדיאל — סט ייעודי של שאלות מרובות
  if (q.game_id === WC_GAME_ID) return WC_MULTI_ANSWER_QUESTIONS.has(key);
  return MULTI_ANSWER_QUESTIONS.has(key);
};

export default function AdminResults() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState('');
  const [results, setResults] = useState({});
  const [teams, setTeams] = useState({});
  const [validationLists, setValidationLists] = useState({});
  const [openSections, setOpenSections] = useState({});
  const [openMenuGroups, setOpenMenuGroups] = useState({ rounds:true, groups:true, playoff:true, league:true, special:false, qualifiers:false, other:true });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // 🆕 תפריט נייד מתקפל
  const toggleMenuGroup = k => setOpenMenuGroups(prev=>({...prev,[k]:!prev[k]}));

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
  // 🌍 דגל מונדיאל
  const isWC = currentGame?.id === WC_GAME_ID;

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
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('predictions').select('*').eq('game_id', gameId).range(from, from + PAGE - 1);
      if (error) { console.error('predictions fetch error:', error); break; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const loadAllRankings = async (gameId) => {
    let all = [], from = 0;
    const PAGE = 500;
    while (true) {
      const { data, error } = await supabase
        .from('rankings').select('*').eq('game_id', gameId).range(from, from + PAGE - 1);
      if (error) { console.error('rankings fetch error:', error); break; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const loadData = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    const wcGame = currentGame.id === WC_GAME_ID;
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
        // 🌍 פיצול שמות קבוצות מטקסט — לא במונדיאל
        if (!wcGame && q.table_id === 'T3' && q.question_text && !q.home_team) {
          const parts = q.question_text.split(' - ');
          if (parts.length === 2) { q.home_team = parts[0].trim(); q.away_team = parts[1].trim(); }
        }
        if (!wcGame && q.table_id === 'T20' && q.question_text && !q.home_team) {
          const sep = q.question_text.includes(' נגד ') ? ' נגד ' : q.question_text.includes(' - ') ? ' - ' : null;
          if (sep) { const p = q.question_text.split(sep).map(t => t.trim()); if (p.length === 2) { q.home_team = p[0]; q.away_team = p[1]; } }
        }

        const isKnockoutMatch = !wcGame && q.table_id === 'T3' && q.home_team && q.away_team;
        // 🌍 startsWith — רק בתים אמיתיים ("בית א'")
        const collection = (q.stage_name?.startsWith('בית') || q.table_description?.startsWith('בית') || isKnockoutMatch || (q.home_team && q.away_team)) ? rTables : sTables;

        let tableId = q.table_id;
        let tableDesc = q.table_description || q.stage_name;
        if (q.stage_name?.startsWith('בית')) { tableId = q.stage_name; tableDesc = q.stage_name; }
        else if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order) { tableId = `custom_order_${q.stage_order}`; tableDesc = q.stage_name || q.table_description; }

        if (!collection[tableId]) collection[tableId] = { id: tableId, description: tableDesc || tableId, questions: [], stage_order: q.stage_order || 0 };
        collection[tableId].questions.push(q);
      });

      let t20Table = null;
      if (!wcGame) { t20Table = rTables['T20']; delete rTables['T20']; }
      setIsraeliTable(t20Table || null);
      delete sTables['T1'];

      const sortedRoundTables = Object.values(rTables).sort((a, b) => {
        const aG = a.id.startsWith('בית'), bG = b.id.startsWith('בית');
        if (aG && !bG) return -1; if (!aG && bG) return 1;
        // 🌍 מיון בתים לפי stage_order (א'=1 ... יב'=12)
        if (aG && bG) return (a.stage_order || 0) - (b.stage_order || 0);
        return (parseInt(a.id.replace('T','').replace(/\D/g,'')) || 0) - (parseInt(b.id.replace('T','').replace(/\D/g,'')) || 0);
      });
      setRoundTables(sortedRoundTables);

      // 🌍 במונדיאל אין טבלאות מיקומים ואין "מנצחות פלייאוף"
      const locationTableIds = wcGame ? [] : ['T9','T14','T15','T16','T17'];
      setLocationTables(Object.values(sTables).filter(t => locationTableIds.includes(t.id)).sort((a,b) => parseInt(a.id.replace('T','')) - parseInt(b.id.replace('T',''))));
      setPlayoffWinnersTable(wcGame ? null : (sTables['T19'] || null));

      const allSpecialTables = Object.values(sTables).filter(t => {
        const desc = t.description?.trim();
        return desc && !/^\d+$/.test(desc)
          && !locationTableIds.includes(t.id)
          && (wcGame || t.id !== 'T19')
          && !t.id.startsWith('בית')
          && t.id !== 'T1'
          && (wcGame || t.id !== 'T9');
      }).sort((a,b) => ((a.stage_order||0) - (b.stage_order||0)) || (parseInt(a.id.replace('T','').replace(/\D/g,'')) - parseInt(b.id.replace('T','').replace(/\D/g,''))));
      setSpecialTables(allSpecialTables);

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

  useEffect(() => {
    // 🌍 סימון נבחרות שנבחרו — רלוונטי לנוקאאוט UCL בלבד
    if (isWC) { setSelectedT11Teams(new Set()); setSelectedT12Teams(new Set()); setSelectedT13Teams(new Set()); return; }
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
  }, [results, allQuestions, isWC]);

  const handleResultChange = (questionId, value) => {
    if (!isAdmin) return;
    setResults(prev => ({ ...prev, [questionId]: value === '' ? '__CLEAR__' : value }));
  };

  const handleMultiAnswerAdd = (questionId, newAnswer, currentValue) => {
    if (!newAnswer.trim()) return;
    const existing = (currentValue && currentValue !== '__CLEAR__')
      ? currentValue.split('|||').map(v => v.trim()).filter(Boolean)
      : [];
    if (existing.includes(newAnswer.trim())) return;
    const updated = [...existing, newAnswer.trim()].join('|||');
    handleResultChange(questionId, updated);
  };

  const handleMultiAnswerRemove = (questionId, removeAnswer, currentValue) => {
    const existing = (currentValue && currentValue !== '__CLEAR__')
      ? currentValue.split('|||').map(v => v.trim()).filter(Boolean)
      : [];
    const updated = existing.filter(v => v !== removeAnswer);
    handleResultChange(questionId, updated.length > 0 ? updated.join('|||') : '__CLEAR__');
  };

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

  const recalculateRankings = async () => {
    if (!currentGame) return;
    setRecalculating(true);
    setRecalcProgress('טוען שאלות...');
    try {
      let qs = await loadAllQuestions(currentGame.id);
      qs = qs.filter(q => q.table_id && q.table_id !== 'T1');
      // 🌍 פיצול שמות מטקסט — לא במונדיאל
      if (!isWC) {
        qs.forEach(q => {
          if (!q.home_team && !q.away_team && q.question_text) {
            const sep = q.question_text.includes(' נגד ') ? ' נגד ' : q.question_text.includes(' - ') ? ' - ' : null;
            if (sep) { const p = q.question_text.split(sep).map(t => t.trim()); if (p.length === 2) { q.home_team = p[0]; q.away_team = p[1]; } }
          }
        });
      }
      setRecalcProgress('טוען ניחושים...');
      const preds = await loadAllPredictions(currentGame.id);
      const byParticipant = {};
      preds.forEach(p => {
        if (!p.participant_name?.trim()) return;
        if (!byParticipant[p.participant_name]) byParticipant[p.participant_name] = [];
        byParticipant[p.participant_name].push(p);
      });
      const participants = Object.keys(byParticipant);
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
      setRecalcProgress('טוען דירוג קיים...');
      const existingRankings = await loadAllRankings(currentGame.id);
      const baselineMap = {};
      existingRankings.forEach(r => { baselineMap[r.participant_name] = r; });
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
        await new Promise(r => setTimeout(r, 100));
      }
      setRecalcProgress('');
      toast({ title: "✅ דירוג עודכן!", description: `חושב ניקוד עבור ${scores.length} משתתפים`, className: "bg-green-900/30 border-green-500 text-green-200", duration: 4000 });
    } catch (error) {
      console.error("שגיאה בחישוב דירוג:", error);
      setRecalcProgress('');
      toast({ title: "שגיאה בדירוג", description: error.message, variant: "destructive" });
    }
    setRecalculating(false);
  };

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
      for (let i = 0; i < changedQuestions.length; i++) {
        const q = changedQuestions[i];
        const val = (results[q.id] === '__CLEAR__' || !results[q.id]) ? null : results[q.id];
        await db.Question.update(q.id, { actual_result: val });
        if ((i + 1) % 3 === 0) await new Promise(r => setTimeout(r, 300));
      }
      toast({ title: "נשמר!", description: `עודכנו ${changedQuestions.length} תוצאות — מחשב דירוג...`, className: "bg-cyan-900/30 border-cyan-500 text-cyan-200", duration: 3000 });
      await loadData();
      await recalculateRankings();
    } catch (error) {
      console.error("שגיאה בשמירה:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleSection = (sectionId) => { startTransition(() => { setOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] })); }); };

  const shortLabel = (desc) => {
    if (!desc) return '';
    const raw = String(desc);

    // ראש בראש / מיוחדות / מסלול
    if (raw.includes('ראש בראש') || raw.includes('התותחים') || raw.includes('מבול')) return 'ראש בראש';
    if (raw.includes('הניחושים המיוחדים')) return 'הניחושים המיוחדים';
    if (raw.includes('המסלול המהיר')) return 'המסלול המהיר';

    // ── רשימות העולות — מזוהות לפי "רשימת הנבחרות" / "העולות" / "ראש בית וסגנית" / "נבחרות המקום" ──
    const isQualifierList = raw.includes('רשימת הנבחרות') || raw.includes('הנבחרות שתסיימנה') ||
                            raw.includes('הנבחרות שיעלו') || raw.includes('העולות') ||
                            (raw.includes('ראש בית') && raw.includes('סגנית')) || raw.includes('נבחרות המקום');
    if (isQualifierList) {
      if (raw.includes('ראש בית') && raw.includes('סגנית')) return 'עולות · ראש בית וסגנית';
      if (raw.includes('מקום השלישי') || raw.includes('המקום השלישי') || raw.includes('שלישי')) return 'עולות · מקום שלישי';
      if (raw.includes('שמינית')) return 'עולות · שמינית גמר';
      if (raw.includes('רבע')) return 'עולות · רבע גמר';
      if (raw.includes('חצי')) return 'עולות · חצי גמר';
      if (raw.includes('גמר')) return 'עולות · גמר מונדיאל';
    }

    // שלב הבתים
    if (raw.includes('שלב הבתים')) return 'שלב הבתים';

    // ברירת מחדל — ניקוי וקיצור
    let s = raw.replace(/\(\*+\)/g, '').replace(/["'״]/g, '').replace(/^בית\s*/, 'בית ').trim();
    return s.length > 16 ? s.slice(0, 15).trim() + '…' : s;
  };

  // 📱 ניווט נייד — בורר נפתח (Bottom Sheet). שורה אחת קבועה, בחירה פותחת חלון מלא.
  const renderMobileNav = (allButtonsList, openSectionsMap, toggleSectionFn) => {
    const typeColors = {
      playoff:'#3b82f6', league:'#3b82f6', groups:'#06b6d4', rounds:'#06b6d4',
      special:'#8b5cf6', qualifiers:'#f97316', other:'#64748b',
    };
    const groupLabels = {
      groups:'🏠 בתים', rounds:'⚽ מחזורים', playoff:'⚔️ נוקאאוט', league:'⚽ ליגה',
      special:'✨ הניחושים המיוחדים', qualifiers:'📋 רשימות העולות', other:'📌 נוסף',
    };

    const grouped = {};
    allButtonsList.forEach(b => {
      const t = b.stageType || 'special';
      (grouped[t] = grouped[t] || []).push(b);
    });
    const orderedTypes = ['groups','rounds','playoff','league','special','qualifiers','other']
      .filter(t => grouped[t]?.length);

    // השלבים הפתוחים כרגע (לתווית בכפתור)
    const openButtons = allButtonsList.filter(b => openSectionsMap[b.sectionKey]);
    const triggerLabel = openButtons.length === 0 ? 'בחר שלב לצפייה'
      : openButtons.length === 1 ? shortLabel(openButtons[0].houseGrid ? (openButtons[0].fullDescription || openButtons[0].description) : openButtons[0].description)
      : `${openButtons.length} שלבים נבחרו`;

    return (
      <div>
        <style>{`.vs-sheet-scroll::-webkit-scrollbar{width:0}`}</style>

        {/* שורת ניווט אחת — כפתור הבורר */}
        <button onClick={() => setMobileMenuOpen(true)} style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 16px', borderRadius:'12px', cursor:'pointer',
          background:'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(6,182,212,0.07))',
          border:'1.5px solid rgba(6,182,212,0.5)', fontFamily:'Rubik,Heebo,sans-serif',
          WebkitTapHighlightColor:'transparent', touchAction:'manipulation', minHeight:'48px',
        }}>
          <span style={{ display:'flex', alignItems:'center', gap:9 }}>
            <span style={{ fontSize:'1.15rem' }}>🗂️</span>
            <span style={{ color:'#f8fafc', fontWeight:700, fontSize:'0.98rem' }}>{triggerLabel}</span>
          </span>
          <span style={{ color:'#22d3ee', fontSize:'0.9rem', fontWeight:600 }}>החלף ▾</span>
        </button>

        {/* בורר נפתח מלמטה */}
        {mobileMenuOpen && (
          <div onClick={() => setMobileMenuOpen(false)} style={{
            position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.65)',
            display:'flex', alignItems:'flex-end', backdropFilter:'blur(2px)',
          }}>
            <div onClick={e => e.stopPropagation()} className="vs-sheet-scroll" style={{
              width:'100%', maxHeight:'82vh', overflowY:'auto',
              background:'#0b1220', borderTopLeftRadius:'22px', borderTopRightRadius:'22px',
              border:'1px solid rgba(6,182,212,0.3)', borderBottom:'none',
              padding:'10px 16px calc(28px + env(safe-area-inset-bottom,0px))',
              boxShadow:'0 -10px 40px rgba(0,0,0,0.8)',
            }}>
              {/* ידית + כותרת */}
              <div style={{ display:'flex', justifyContent:'center', padding:'4px 0 12px' }}>
                <div style={{ width:'42px', height:'5px', borderRadius:'3px', background:'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <span style={{ fontSize:'1.05rem', fontWeight:700, color:'#f8fafc' }}>בחר שלב לצפייה</span>
                <button onClick={() => setMobileMenuOpen(false)} aria-label="סגור" style={{
                  background:'rgba(255,255,255,0.06)', border:'none', borderRadius:'50%',
                  width:'32px', height:'32px', color:'#94a3b8', cursor:'pointer', fontSize:'1.1rem', lineHeight:1,
                }}>✕</button>
              </div>

              {orderedTypes.map(type => {
                const c = typeColors[type];
                const isGroups = type === 'groups';
                return (
                  <div key={type} style={{ marginBottom:18 }}>
                    <div style={{ fontSize:'0.78rem', color:c, marginBottom:9, fontWeight:700 }}>{groupLabels[type] || type}</div>
                    <div style={{ display:'grid', gridTemplateColumns: isGroups ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap:8 }}>
                      {grouped[type].map(b => {
                        const active = openSectionsMap[b.sectionKey];
                        return (
                          <button key={b.key}
                            onClick={() => {
                              Object.keys(openSectionsMap).forEach(k => { if (openSectionsMap[k] && k !== b.sectionKey) toggleSectionFn(k); });
                              if (!openSectionsMap[b.sectionKey]) toggleSectionFn(b.sectionKey);
                              setMobileMenuOpen(false);
                              setTimeout(() => {
                                const main = document.querySelector('.lm-page');
                                if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
                                else window.scrollTo({ top: 0, behavior: 'smooth' });
                              }, 60);
                            }}
                            title={b.fullDescription || b.description}
                            style={{
                              display:'flex', alignItems:'center', justifyContent:'center',
                              padding:'13px 8px', borderRadius:'12px',
                              fontSize:'0.86rem', fontWeight: active ? 700 : 500,
                              color: active ? '#0f172a' : '#e2e8f0',
                              background: active ? c : 'rgba(255,255,255,0.04)',
                              border:`1.5px solid ${active ? c : `${c}40`}`, cursor:'pointer',
                              fontFamily:'Rubik,Heebo,sans-serif', textAlign:'center',
                              WebkitTapHighlightColor:'transparent', touchAction:'manipulation', minHeight:'52px',
                              whiteSpace:'normal', lineHeight:1.25,
                            }}>
                            {shortLabel(b.houseGrid ? (b.fullDescription || b.description) : b.description)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const findTeam = (name) => {
    if (!name) return null;
    if (teams[name]) return teams[name];
    const base = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return teams[base] || null;
  };

  const renderMultiAnswerInput = (question, value) => {
    const currentAnswers = (value && value !== '__CLEAR__')
      ? value.split('|||').map(v => v.trim()).filter(Boolean)
      : [];
    const options = validationLists[question.validation_list] || [];
    const hasOptions = options.length > 0;

    const toggle = (opt) => {
      if (currentAnswers.includes(opt)) handleMultiAnswerRemove(question.id, opt, value);
      else handleMultiAnswerAdd(question.id, opt, value);
    };
    const clearAll = () => handleResultChange(question.id, '__CLEAR__');
    const triggerLabel = currentAnswers.length === 0
      ? 'בחר...'
      : currentAnswers.map(a => a.replace(/\s*\([^)]+\)\s*$/, '').trim()).join(', ');

    if (!hasOptions) {
      return (
        <div style={{ width: '100%', minWidth: '140px' }}>
          {currentAnswers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {currentAnswers.map((ans, i) => (
                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--tp-20)', border: '1px solid var(--tp)', borderRadius: '999px', padding: '2px 8px', fontSize: '0.78rem', color: 'var(--tp)' }}>
                  <span>{ans}</span>
                  {isAdmin && <button onClick={() => handleMultiAnswerRemove(question.id, ans, value)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, lineHeight: 1 }}>✕</button>}
                </div>
              ))}
              {isAdmin && <button onClick={clearAll} style={{ background: 'none', border: '1px solid #ef4444', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', color: '#ef4444', cursor: 'pointer' }}>נקה הכל</button>}
            </div>
          )}
          {isAdmin && <MultiAnswerTextInput currentAnswers={currentAnswers} onAdd={(ans) => handleMultiAnswerAdd(question.id, ans, value)} />}
        </div>
      );
    }

    return (
      <MultiCheckboxDropdown
        options={options} selected={currentAnswers} onToggle={toggle} onClear={clearAll}
        findTeam={findTeam} isAdmin={isAdmin} triggerLabel={triggerLabel}
      />
    );
  };

  const renderSelectWithLogos = (question, value, onChange, selectClassName = "w-[200px]") => {
    if (isMultiAnswerQuestion(question)) return renderMultiAnswerInput(question, value);

    const options = validationLists[question.validation_list] || [];
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ') || question.validation_list?.toLowerCase().includes('נבחר');
    const hasResult = value && value !== '__CLEAR__';

    if (!question.validation_list || options.length === 0) {
      return (
        <Input
          value={value === '__CLEAR__' ? '' : (value || '')}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', maxWidth: '180px', background: hasResult ? 'var(--tp-20)' : 'rgba(51,65,85,0.5)', borderColor: hasResult ? 'var(--tp)' : 'rgba(100,116,139,1)', color: hasResult ? 'var(--tp)' : '#f8fafc', fontWeight: hasResult ? '700' : 'normal' }}
          placeholder="הזן תוצאה..."
          readOnly={!isAdmin}
        />
      );
    }

    const safeValue = (!value || value === 'null' || value === 'undefined' || value.toLowerCase?.().includes('null')) ? '__CLEAR__' : value;

    return (
      <Select value={safeValue} onValueChange={onChange} disabled={!isAdmin}>
        <SelectTrigger className={selectClassName} style={{ background: hasResult ? 'var(--tp-20)' : 'rgba(51,65,85,0.5)', borderColor: hasResult ? 'var(--tp)' : 'rgba(100,116,139,1)', color: hasResult ? 'var(--tp)' : '#94a3b8', fontWeight: hasResult ? '700' : 'normal' }}>
          <SelectValue placeholder="בחר...">
            {!hasResult ? 'בחר...' : (
              <div className="flex items-center gap-2">
                {isTeamsList && findTeam(value)?.logo_url && <img src={findTeam(value).logo_url} alt={value} className="w-5 h-5 rounded-full" onError={e => e.target.style.display='none'} />}
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
            const isS11 = !isWC && (sn.includes('רבע גמר') || td.includes('רבע גמר'));
            const isS12 = !isWC && (sn.includes('חצי גמר') || td.includes('חצי גמר'));
            const isS13 = !isWC && ((sn.includes('גמר') && !sn.includes('רבע') && !sn.includes('חצי')) || (td.includes('גמר') && !td.includes('רבע') && !td.includes('חצי')));
            const alreadySelected = isTeamsList && (
              (isS11 && selectedT11Teams.has(opt) && safeVal !== opt) ||
              (isS12 && selectedT12Teams.has(opt) && safeVal !== opt) ||
              (isS13 && selectedT13Teams.has(opt) && safeVal !== opt)
            );
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
    <div key={q.id} style={{ display: 'grid', gridTemplateColumns: isMultiAnswerQuestion(q) ? `40px 1fr auto 44px` : `40px 1fr ${widths.select} 44px`, gap: '5px', alignItems: 'center', padding: '7px 8px', borderRadius: '6px', position: 'relative', overflow: 'visible' }} className="border border-cyan-600/30 bg-slate-700/20">
      <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{q.question_id}</Badge>
      <span className="text-right font-medium text-sm text-blue-100" style={{ minWidth: 0, lineHeight: '1.35' }}>{q.question_text}</span>
      {renderSelectWithLogos(q, results[q.id] || '', val => handleResultChange(q.id, val === '__CLEAR__' ? '' : val), `w-full`)}
      <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', background: 'var(--tp-10)' }}>{q.possible_points || 0}</Badge>
    </div>
  );

  // ── בונוסי שלבים — נוקאאוט UCL ──────────────────────────────────────────────
  const STAGE_BONUSES = {
    T3: { points: 16, desc: 'ניקוד בכל משחקי שמינית הגמר' },
    T4: { points: 16, desc: 'ניחוש כל 8 קבוצות רבע הגמר'  },
    T6: { points: 12, desc: 'ניחוש כל 4 קבוצות חצי הגמר'  },
    T8: { points: 6,  desc: 'ניחוש שתי קבוצות הגמר'        },
  };

  // 🌍 בונוסי שלבים — מונדיאל 2026
  const WC_STAGE_BONUSES = {
    T16: { points: 24, desc: 'בונוס מיקום +12 (כל 24 בול) ובונוס עולות +12' },
    T17: { points: 6,  desc: 'ניחוש כל 12 נבחרות המקום השלישי' },
    T19: { points: 16, desc: 'ניחוש כל 16 העולות לשמינית הגמר' },
    T21: { points: 16, desc: 'ניחוש כל 8 העולות לרבע הגמר' },
    T23: { points: 8,  desc: 'ניחוש כל 4 העולות לחצי הגמר' },
    T25: { points: 8,  desc: 'ניחוש שתי העולות לגמר' },
  };

  const renderBonusBanner = (tableId) => {
    let bonus = null;
    if (isWC) {
      if (String(tableId).startsWith('בית')) bonus = { points: 6, desc: 'פגיעה (בול/כיוון) בכל ששת משחקי הבית' };
      else bonus = WC_STAGE_BONUSES[tableId];
    } else {
      bonus = STAGE_BONUSES[tableId];
    }
    if (!bonus) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', padding: '8px 16px', borderRadius: '8px', marginBottom: '8px', background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.40)' }}>
        <span style={{ fontSize: '1.1rem' }}>🏆</span>
        <span style={{ color: '#fde68a', fontSize: '0.82rem', fontWeight: '600' }}>בונוס שלב: +{bonus.points} נקודות</span>
        <span style={{ color: '#fbbf24', fontSize: '0.75rem', opacity: 0.85 }}>— {bonus.desc}</span>
      </div>
    );
  };

  const ADVANCING_CONFIG = { T4: 8, T6: 4, T8: 2 };

  const renderAdvancingTeamTable = (table) => {
    const count = ADVANCING_CONFIG[table.id];
    const seenIds = new Set();
    const slots = table.questions
      .filter(q => {
        const n = parseFloat(q.question_id);
        if (!Number.isInteger(n) || n < 1 || n > count) return false;
        if (seenIds.has(n)) return false;
        seenIds.add(n);
        return true;
      })
      .sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
    return (
      <Card className="bg-slate-800/40 border-cyan-700 shadow-lg shadow-cyan-900/20">
        <CardHeader className="py-3"><CardTitle className="text-cyan-400">{table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          {renderBonusBanner(table.id)}
          <div className="space-y-2">{slots.map(q => renderQuestionRow(q))}</div>
        </CardContent>
      </Card>
    );
  };

  // 🌍 מונדיאל: ראש בית וסגנית — שורה אחת לכל בית
  const renderWCGroupLeaders = (table) => {
    const groupName = (q) => (q?.question_text || '').split('—')[0].trim();
    const rows = [];
    for (let g = 1; g <= 12; g++) {
      const winner = table.questions.find(q => q.question_id === String(g * 2 - 1));
      const runner = table.questions.find(q => q.question_id === String(g * 2));
      if (winner || runner) rows.push({ g, winner, runner });
    }
    const pts = table.questions[0]?.possible_points || 15;
    return (
      <Card className="bg-slate-800/40 shadow-lg" style={{ border: '1px solid rgba(249,115,22,0.35)' }}>
        <CardHeader className="py-3"><CardTitle style={{ color: '#f97316' }}>📋 {table.description}</CardTitle></CardHeader>
        <CardContent className="p-3">
          {renderBonusBanner(table.id)}
          <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1fr', gap: '6px', alignItems: 'center', padding: '4px 8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>בית</span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textAlign: 'center' }}>ראש בית ({pts} נק')</span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textAlign: 'center' }}>סגנית ({pts} נק')</span>
          </div>
          <div className="space-y-2">
            {rows.map(({ g, winner, runner }) => (
              <div key={g} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1fr', gap: '6px', alignItems: 'center', padding: '7px 8px', borderRadius: '8px', border: '1px solid rgba(249,115,22,0.15)', background: 'rgba(0,0,0,0.22)' }}>
                <Badge variant="outline" className="justify-center text-xs h-6" style={{ borderColor: 'rgba(249,115,22,0.5)', color: '#fb923c' }}>{groupName(winner || runner)}</Badge>
                <div style={{ minWidth: 0 }}>{winner ? renderSelectWithLogos(winner, results[winner.id] || '', val => handleResultChange(winner.id, val === '__CLEAR__' ? '' : val), 'w-full') : <span />}</div>
                <div style={{ minWidth: 0 }}>{runner ? renderSelectWithLogos(runner, results[runner.id] || '', val => handleResultChange(runner.id, val === '__CLEAR__' ? '' : val), 'w-full') : <span />}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSpecialQuestions = (table) => {
    if (!isWC && ADVANCING_CONFIG[table.id]) return renderAdvancingTeamTable(table);
    // 🌍 ראש בית וסגנית — תצוגת שורה לבית
    if (isWC && table.id === 'T16') return renderWCGroupLeaders(table);

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
        <CardHeader className="py-3">
          <CardTitle className="text-cyan-400">{table.description}</CardTitle>
          {table.questions.some(q => isMultiAnswerQuestion(q)) && (
            <p style={{ fontSize: '0.72rem', color: '#f97316', marginTop: '4px' }}>✦ שאלות מסומנות תומכות בריבוי תשובות נכונות — לחץ + להוספה</p>
          )}
        </CardHeader>
        <CardContent className="p-3" style={{ overflow: 'visible' }}>
          {renderBonusBanner(table.id)}
          <div className="space-y-2" style={{ overflow: 'visible' }}>
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id || a.stage_order) - parseFloat(b.question_id || b.stage_order));
              if (sortedSubs.length === 0) return renderQuestionRow(main);
              // ✅ שאלה + תת-שאלה בשורה אחת (פריסת גריד צפופה)
              if (sortedSubs.length === 1) {
                const sub = sortedSubs[0];
                // 🌍 שאלה ראשית מרובת-תשובות צריכה יותר רוחב לתיבת הבחירה —
                //    מקצים לה עמודת תשובה רחבה יותר, אך נשארים בשורה אחת
                const mainIsMulti = isMultiAnswerQuestion(main);
                const rowCols = mainIsMulti
                  ? '32px minmax(150px, 2fr) minmax(150px, 1.4fr) 40px 30px minmax(120px, 1.3fr) 80px 40px'
                  : '38px minmax(110px, 1.3fr) 130px 44px 38px minmax(90px, 1fr) 110px 44px';
                return (
                  <div key={main.id} style={{ display: 'grid', gridTemplateColumns: rowCols, gap: '5px', alignItems: 'center', padding: '7px 8px', borderRadius: '8px', border: '1px solid var(--tp-12)', background: 'rgba(0,0,0,0.22)', position: 'relative', overflow: 'visible' }}>
                    <Badge variant="outline" style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', fontSize: '0.7rem' }} className="justify-center h-6">{main.question_id}</Badge>
                    <span style={{ fontSize: '0.82rem', color: '#f1f5f9', fontWeight: '500', textAlign: 'right', minWidth: 0, lineHeight: '1.35' }}>{main.question_text}</span>
                    <div style={{ minWidth: 0 }}>{renderSelectWithLogos(main, results[main.id] || '', val => handleResultChange(main.id, val === '__CLEAR__' ? '' : val), 'w-full')}</div>
                    <Badge style={{ borderColor: 'var(--tp-35)', color: 'var(--tp)', background: 'var(--tp-08)', fontSize: '0.66rem', whiteSpace: 'nowrap', padding: '2px 4px', justifySelf: 'center' }}>{main.possible_points || 0} נק'</Badge>
                    <Badge variant="outline" style={{ borderColor: 'rgba(139,92,246,0.45)', color: '#a78bfa', fontSize: '0.7rem' }} className="justify-center h-6">{sub.question_id}</Badge>
                    <span style={{ fontSize: '0.8rem', color: '#cbd5e1', textAlign: 'right', minWidth: 0, lineHeight: '1.35' }}>{sub.question_text}</span>
                    <div style={{ minWidth: 0 }}>{renderSelectWithLogos(sub, results[sub.id] || '', val => handleResultChange(sub.id, val === '__CLEAR__' ? '' : val), 'w-full')}</div>
                    <Badge style={{ borderColor: 'rgba(139,92,246,0.35)', color: '#a78bfa', background: 'rgba(139,92,246,0.08)', fontSize: '0.66rem', whiteSpace: 'nowrap', padding: '2px 4px', justifySelf: 'center' }}>{sub.possible_points || 0} נק'</Badge>
                  </div>
                );
              }
              return (
                <div key={main.id} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--tp-12)', background: 'rgba(0,0,0,0.22)', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Badge variant="outline" style={{ borderColor: 'var(--tp-50)', color: 'var(--tp)', minWidth: '36px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{main.question_id}</Badge>
                    <span style={{ flex: 1, fontSize: '0.85rem', color: '#f1f5f9', fontWeight: '500', textAlign: 'right' }}>{main.question_text}</span>
                    {renderSelectWithLogos(main, results[main.id] || '', val => handleResultChange(main.id, val === '__CLEAR__' ? '' : val), 'w-[160px]')}
                    {main.possible_points && <Badge style={{ borderColor: 'var(--tp-35)', color: 'var(--tp)', background: 'var(--tp-08)', fontSize: '0.68rem', flexShrink: 0, whiteSpace: 'nowrap' }}>{main.possible_points} נק'</Badge>}
                  </div>
                  {sortedSubs.map((sub) => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '42px', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <Badge variant="outline" style={{ borderColor: 'rgba(139,92,246,0.45)', color: '#a78bfa', minWidth: '36px', textAlign: 'center', flexShrink: 0, fontSize: '0.72rem' }}>{sub.question_id}</Badge>
                      <span style={{ flex: 1, fontSize: '0.82rem', color: '#cbd5e1', textAlign: 'right' }}>{sub.question_text}</span>
                      {renderSelectWithLogos(sub, results[sub.id] || '', val => handleResultChange(sub.id, val === '__CLEAR__' ? '' : val), 'w-[150px]')}
                      {sub.possible_points && <Badge style={{ borderColor: 'rgba(139,92,246,0.35)', color: '#a78bfa', background: 'rgba(139,92,246,0.08)', fontSize: '0.68rem', flexShrink: 0, whiteSpace: 'nowrap' }}>{sub.possible_points} נק'</Badge>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderStageChips = (buttons) => {
    const groupMap = {
      playoff:    { label: '⚽ פלייאוף',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)' },
      league:     { label: '⚽ ליגה',        color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)' },
      groups:     { label: isWC ? '🏠 שלב הבתים' : '🏠 שלב הליגה',   color: 'var(--tp)', bg: 'var(--tp-12)', border: 'var(--tp-35)' },
      rounds:     { label: '⚽ מחזורים',     color: 'var(--tp)', bg: 'var(--tp-12)', border: 'var(--tp-35)' },
      special:    { label: '✨ מיוחדות',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)' },
      qualifiers: { label: '📋 עולות',       color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.35)' },
      other:      { label: '📌 נוסף',        color: '#64748b', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)' },
    };
    const grouped = {};
    buttons.forEach(btn => { const t = btn.stageType || 'special'; if (!grouped[t]) grouped[t] = []; grouped[t].push(btn); });
    const order = ['playoff','league','groups','rounds','special','qualifiers','other'];
    const openCount = buttons.filter(b => openSections[b.sectionKey]).length;
    return (
      <div style={{ marginBottom: '16px' }}>
        {/* בר בחירה מתקפל — חוסך מקום במסך */}
        <button onClick={() => setMobileMenuOpen(o => !o)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:'12px', background:'linear-gradient(135deg, var(--tp-15), var(--tp-05))', border:'1.5px solid var(--tp-45)', cursor:'pointer', WebkitTapHighlightColor:'transparent', touchAction:'manipulation', fontFamily:'Rubik, Heebo, sans-serif' }}>
          <span style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:'1.1rem' }}>📋</span>
            <span style={{ color:'#f8fafc', fontWeight:700, fontSize:'0.95rem' }}>בחירת שלב{openCount>0?` (${openCount} פתוחים)`:''}</span>
          </span>
          <span style={{ color:'var(--tp)', fontSize:'0.8rem', transform:mobileMenuOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>▼</span>
        </button>
        {mobileMenuOpen && (
          <div style={{ marginTop:8, padding: '12px 10px', background: 'rgba(0,0,0,0.55)', borderRadius: '12px', border: '1px solid var(--tp-12)', maxHeight:'70vh', overflowY:'auto', boxShadow:'0 12px 32px rgba(0,0,0,0.6)' }}>
            {order.filter(t => grouped[t]).map(type => {
              const info = groupMap[type] || groupMap.other;
              const gridBtns = type==='groups' ? grouped[type].filter(b => String(b.description||'').startsWith('בית')) : [];
              const listBtns = grouped[type].filter(b => !gridBtns.includes(b));
              return (
                <div key={type} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '800', color: info.color, marginBottom: '6px' }}>{info.label}</div>
                  {gridBtns.length > 0 && (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, marginBottom: listBtns.length>0?6:0 }}>
                      {gridBtns.map(btn => {
                        const active = openSections[btn.sectionKey];
                        const short = String(btn.description).replace(/^בית\s*/, '').trim() || btn.description;
                        return (
                          <button key={btn.key} onClick={() => toggleSection(btn.sectionKey)} title={btn.description} style={{ textAlign:'center', padding:'9px 4px', borderRadius:8, fontSize:'0.82rem', fontWeight:active?800:500, color:active?'#fff':info.color, background:active?info.color:info.bg, border:`1.5px solid ${active?info.color:info.border}`, cursor:'pointer', transition:'all 0.15s', fontFamily:'Rubik, Heebo, sans-serif', WebkitTapHighlightColor:'transparent', touchAction:'manipulation' }}>{short}</button>
                        );
                      })}
                    </div>
                  )}
                  {listBtns.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {listBtns.map(btn => {
                        const active = openSections[btn.sectionKey];
                        return (
                          <button key={btn.key} onClick={() => toggleSection(btn.sectionKey)} style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 12px', borderRadius: '999px', fontSize: '0.82rem', fontWeight: active ? '800' : '500', color: active ? 'white' : info.color, background: active ? info.color : info.bg, border: `1.5px solid ${active ? info.color : info.border}`, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'Rubik, Heebo, sans-serif', WebkitTapHighlightColor:'transparent', touchAction:'manipulation', lineHeight:1.3 }}>{btn.description}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <span className="mr-3 text-cyan-300">טוען נתונים...</span>
      </div>
    );
  }

  const allButtons = [];
  roundTables.forEach(t => {
    const st = t.questions[0]?.stage_type;
    // 🌍 בתים אמיתיים מסומנים כקבוצת בתים
    const isGroupTable = t.id.startsWith('בית');
    const stageType = isGroupTable ? 'groups' : st === 'groups' ? 'groups' : st === 'rounds' ? 'rounds' : st === 'league' ? 'league' : 'playoff';
    allButtons.push({ numericId: t.stage_order || parseInt(t.id.replace('T','').replace(/\D/g,''))||0, stageType, key: `round_${t.id}`, description: t.description || t.id, sectionKey: `round_${t.id}` });
  });
  specialTables.forEach(t => {
    const st = t.questions[0]?.stage_type;
    const stageType = st && ['playoff','groups','rounds','league','qualifiers','other'].includes(st) ? st : 'special';
    allButtons.push({ numericId: t.stage_order || parseInt(t.id.replace('T','').replace(/\D/g,''))||0, stageType, key: t.id, description: t.description, sectionKey: t.id });
  });
  if (locationTables.length > 0) allButtons.push({ numericId: 99, stageType: 'qualifiers', key: 'locations', description: 'מיקומים בתום שלב הליגה', sectionKey: 'locations' });
  if (israeliTable) allButtons.push({ numericId: parseInt(israeliTable.id.replace('T','')||'0'), stageType: israeliTable.questions?.[0]?.stage_type || 'special', key: israeliTable.id, description: israeliTable.description, sectionKey: 'israeli' });
  if (playoffWinnersTable) allButtons.push({ numericId: parseInt(playoffWinnersTable.id.replace('T','')||'0'), stageType: 'qualifiers', key: playoffWinnersTable.id, description: playoffWinnersTable.description, sectionKey: 'playoffWinners' });
  allButtons.sort((a, b) => {
    const order = ['rounds','league','groups','playoff','special','qualifiers','other'];
    const ai = order.indexOf(a.stageType), bi = order.indexOf(b.stageType);
    if (ai !== bi) return ai - bi;
    return a.numericId - b.numericId;
  });

  const renderSidebar = () => {
    const groupMap = {
      playoff:    { label: '⚔️ נוקאאוט',        color: '#3b82f6', activeBg: '#2563eb' },
      league:     { label: '⚽ משחקי ליגה',     color: '#3b82f6', activeBg: '#2563eb' },
      groups:     { label: isWC ? '🏠 שלב הבתים' : '🏠 שלב הליגה', color: '#06b6d4', activeBg: '#0891b2' },
      rounds:     { label: '⚽ מחזורים',        color: '#06b6d4', activeBg: '#0891b2' },
      special:    { label: '✨ שאלות מיוחדות', color: '#8b5cf6', activeBg: '#7c3aed' },
      qualifiers: { label: '📋 רשימות עולות',  color: '#f97316', activeBg: '#ea580c' },
      other:      { label: '📌 נוסף',           color: '#64748b', activeBg: '#475569' },
    };
    const grouped = {};
    allButtons.forEach(btn => { const t = btn.stageType || 'other'; if (!grouped[t]) grouped[t] = []; grouped[t].push(btn); });
    const order = ['rounds','league','groups','playoff','special','qualifiers','other'];
    const sortedGroups = order.filter(t => grouped[t]);
    return (
      <aside style={{ width: '250px', flexShrink: 0, position: 'sticky', top: '70px', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 90px)', overflowY: 'auto', paddingBottom: '16px' }}>
        <div style={{ background: 'rgba(13,18,30,0.92)', borderRadius: '14px', border: '1px solid var(--tp-12)', padding: '12px 10px', backdropFilter: 'blur(10px)' }}>
          <div style={{ fontSize: '0.55rem', fontWeight: '800', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#334155', marginBottom: '10px', paddingRight: '2px' }}>בחירת שלב</div>
          {sortedGroups.map(type => {
            const info = groupMap[type] || groupMap.other;
            const open = openMenuGroups[type] !== false;
            const gridBtns = type==='groups' ? grouped[type].filter(b => String(b.description||'').startsWith('בית')) : [];
            const listBtns = grouped[type].filter(b => !gridBtns.includes(b));
            return (
              <div key={type} style={{ marginBottom: '8px' }}>
                <div onClick={() => toggleMenuGroup(type)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', borderRadius:10, cursor:'pointer', userSelect:'none', fontWeight:700, fontSize:'0.85rem', color:info.color, background:`${info.color}1A`, border:`1px solid ${info.color}40` }}>
                  <span>{info.label}</span>
                  <span style={{ fontSize:'0.6rem', transform:open?'rotate(90deg)':'none', transition:'transform 0.2s' }}>◀</span>
                </div>
                {open && (
                  <div style={{ padding: '8px 2px 2px' }}>
                    {gridBtns.length > 0 && (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, marginBottom: listBtns.length>0?6:0 }}>
                        {gridBtns.map(btn => {
                          const active = openSections[btn.sectionKey];
                          const short = String(btn.description).replace(/^בית\s*/, '').trim() || btn.description;
                          return (
                            <button key={btn.key} onClick={() => toggleSection(btn.sectionKey)} title={btn.description} style={{ textAlign:'center', padding:'7px 0', borderRadius:8, fontSize:'0.8rem', fontWeight:active?700:500, color:active?'#fff':'#67e8f9', background:active?info.activeBg:'rgba(6,182,212,0.08)', border:`1px solid ${active?info.color:'rgba(6,182,212,0.25)'}`, cursor:'pointer', transition:'all 0.12s', boxShadow:active?`0 0 8px ${info.color}80`:'none', fontFamily:'Rubik,Heebo,sans-serif' }}>
                              {short}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {listBtns.map(btn => {
                      const active = openSections[btn.sectionKey];
                      return (
                        <button key={btn.key} onClick={() => toggleSection(btn.sectionKey)} style={{ display: 'block', width: '100%', textAlign: 'right', padding: '7px 10px', marginBottom: 4, borderRadius: '8px', fontSize: '0.78rem', fontWeight: active ? '700' : '400', color: active ? 'white' : info.color, background: active ? info.activeBg : `${info.color}12`, border: `1px solid ${active ? info.color : `${info.color}40`}`, cursor: 'pointer', transition: 'all 0.15s', boxShadow: active ? `0 0 10px ${info.color}55` : 'none', fontFamily: 'Rubik, Heebo, sans-serif', lineHeight: '1.35' }}>{shortLabel(btn.description)}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    );
  };

  const renderContent = () => (
    <div style={{ flex: 1, minWidth: 0 }}>
      {allButtons.length === 0 ? (
        <Alert variant="destructive" className="bg-cyan-900/50 border-cyan-700 text-cyan-200">
          <FileText className="w-4 h-4" />
          <AlertDescription>לא נמצאו שאלות במערכת.</AlertDescription>
        </Alert>
      ) : (
        allButtons.map(button => {
          if (!openSections[button.sectionKey]) return null;
          if (button.sectionKey.startsWith('round_')) {
            const tableId = button.sectionKey.replace('round_', '');
            const table = roundTables.find(t => t.id === tableId);
            if (!table) return null;
            return (
              <div key={button.key} className="mb-4 space-y-3">
                {renderBonusBanner(table.id)}
                {String(table.id).startsWith('בית') ? (
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,360px)] gap-3 items-start">
                    <RoundTableResults table={table} teams={teams} results={results} onResultChange={handleResultChange} isAdmin={isAdmin} />
                    <GroupStandings table={table} teams={teams} results={results} />
                  </div>
                ) : (
                  <RoundTableResults table={table} teams={teams} results={results} onResultChange={handleResultChange} isAdmin={isAdmin} />
                )}
                {table.specialQuestions?.length > 0 && <div className="mt-4">{renderSpecialQuestions({ ...table, questions: table.specialQuestions })}</div>}
              </div>
            );
          }
          if (button.sectionKey === 'israeli' && israeliTable) return <div key="israeli" className="mb-4"><RoundTableResults table={israeliTable} teams={teams} results={results} onResultChange={handleResultChange} isAdmin={isAdmin} /></div>;
          if (button.sectionKey === 'locations') return <div key="locations" className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">{locationTables.map(t => renderSpecialQuestions(t))}</div>;
          if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) return <div key="playoffWinners" className="mb-6">{renderSpecialQuestions(playoffWinnersTable)}</div>;
          const t = specialTables.find(t => t.id === button.key);
          if (t) return <div key={t.id} className="mb-6">{renderSpecialQuestions(t)}</div>;
          return null;
        })
      )}
    </div>
  );

  return (
    <div dir="rtl" style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)', minHeight: '100vh' }}>
      <div className="ar-header" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--tp-15)', padding: '10px 20px' }}>
        <style>{`@media (max-width: 767px) { .ar-header { position: relative !important; top: auto !important; } }`}</style>
        <div className="flex flex-row justify-between items-center gap-3 w-full">
          <div>
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2" style={{ color: '#f8fafc' }}>
              <Trophy className="w-5 h-5 md:w-7 md:h-7" style={{ color: 'var(--tp)' }} />
              {isAdmin ? 'עדכון תוצאות אמת' : 'תוצאות אמת'}
            </h1>
            <p className="text-xs" style={{ color: '#94a3b8' }}>{isAdmin ? 'עדכן תוצאות ואז לחץ "שמור תוצאות"' : 'צפייה בתוצאות האמיתיות'}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" onClick={recalculateRankings} disabled={saving || recalculating} variant="outline" style={{ borderColor: 'rgba(16,185,129,0.5)', color: '#34d399', background: 'rgba(30,41,59,0.4)' }}>
                {recalculating ? <><Loader2 className="w-4 h-4 animate-spin ml-1" />מחשב...</> : <><Trophy className="w-4 h-4 ml-1" />חשב דירוג</>}
              </Button>
              <Button size="sm" onClick={handleSaveResults} disabled={saving || recalculating} className="text-white" style={{ background: recalculating ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, var(--tp) 0%, var(--tp) 100%)' }}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin ml-1" />שומר...</> : recalculating ? <><Loader2 className="w-4 h-4 animate-spin ml-1" />מחשב...</> : <><Save className="w-4 h-4 ml-1" />שמור תוצאות</>}
              </Button>
            </div>
          )}
        </div>
      </div>
      {recalculating && recalcProgress && (
        <div className="mx-4 mt-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>⏳ {recalcProgress}</div>
      )}
      <div className="md:hidden p-3">{renderMobileNav(allButtons.map(b=>b.houseGrid?{...b,description:b.fullDescription||b.description}:b), openSections, toggleSection)}</div>
      <div className="hidden md:flex flex-row gap-4 p-4 w-full" style={{ alignItems: 'flex-start' }}>
        {renderSidebar()}
        {renderContent()}
      </div>
      <div className="md:hidden p-3">{renderContent()}</div>
    </div>
  );
}

function MultiCheckboxDropdown({ options, selected, onToggle, onClear, findTeam, isAdmin, triggerLabel }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const hasSelected = selected.length > 0;
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', minWidth: '140px' }}>
      <button onClick={() => isAdmin && setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '6px 10px', borderRadius: '6px', cursor: isAdmin ? 'pointer' : 'default', background: hasSelected ? 'var(--tp-20)' : 'rgba(51,65,85,0.5)', border: `1px solid ${hasSelected ? 'var(--tp)' : 'rgba(100,116,139,1)'}`, color: hasSelected ? 'var(--tp)' : '#94a3b8', fontSize: '0.82rem', fontWeight: hasSelected ? '700' : '400', textAlign: 'right', fontFamily: 'Rubik, Heebo, sans-serif' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{triggerLabel}</span>
        <span style={{ marginRight: '6px', fontSize: '0.7rem', opacity: 0.6 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, minWidth: '220px', maxHeight: '280px', overflowY: 'auto', background: '#1e293b', border: '1px solid #06b6d4', borderRadius: '8px', marginTop: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
          <div onClick={() => { onClear(); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(6,182,212,0.2)', color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }} className="hover:bg-red-900/20">
            <span>נקה הכל</span><span style={{ fontSize: '0.85rem' }}>✕</span>
          </div>
          {options.map(opt => {
            const isChecked = selected.includes(opt);
            const team = findTeam?.(opt);
            const label = opt.replace(/\s*\([^)]+\)\s*$/, '').trim();
            return (
              <div key={opt} onClick={() => onToggle(opt)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', cursor: 'pointer', background: isChecked ? 'rgba(6,182,212,0.15)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="hover:bg-cyan-700/20">
                <div style={{ width: 16, height: 16, borderRadius: '4px', flexShrink: 0, border: `2px solid ${isChecked ? 'var(--tp)' : '#475569'}`, background: isChecked ? 'var(--tp)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isChecked && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                </div>
                {team?.logo_url && <img src={team.logo_url} alt={label} style={{ width: 18, height: 18, borderRadius: '50%' }} onError={e => e.target.style.display = 'none'} />}
                <span style={{ fontSize: '0.85rem', color: isChecked ? 'var(--tp)' : '#f8fafc', fontWeight: isChecked ? 600 : 400 }}>{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══ 🆕 טבלת בית מחושבת לפי תוצאות עד כה ═══
function GroupStandings({ table, teams, results }) {
  const matches = (table.questions || []).filter(q => q.home_team && q.away_team);
  if (matches.length === 0) return null;

  // צבירת סטטיסטיקה לכל נבחרת
  const stats = {};
  const ensure = name => { if (!stats[name]) stats[name] = { name, P:0, W:0, D:0, L:0, GF:0, GA:0, Pts:0 }; return stats[name]; };
  let playedAny = false;
  matches.forEach(q => {
    ensure(q.home_team); ensure(q.away_team);
    const r = results[q.id];
    if (!r || r === '__CLEAR__' || !r.includes('-')) return;
    const [hs, as] = r.split('-').map(x => parseInt(x.trim()));
    if (isNaN(hs) || isNaN(as)) return;
    playedAny = true;
    const H = stats[q.home_team], A = stats[q.away_team];
    H.P++; A.P++; H.GF+=hs; H.GA+=as; A.GF+=as; A.GA+=hs;
    if (hs>as) { H.W++; H.Pts+=3; A.L++; }
    else if (hs<as) { A.W++; A.Pts+=3; H.L++; }
    else { H.D++; A.D++; H.Pts++; A.Pts++; }
  });

  const rows = Object.values(stats).sort((a,b) =>
    b.Pts-a.Pts || (b.GF-b.GA)-(a.GF-a.GA) || b.GF-a.GF || a.name.localeCompare(b.name,'he')
  );

  return (
    <div style={{ background: 'rgba(13,18,30,0.6)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
        <span style={{ fontSize:'0.92rem', fontWeight:700, color:'#22d3ee' }}>📊 טבלת {table.description}</span>
        {!playedAny && <span style={{ fontSize:'0.68rem', color:'#64748b' }}>(טרם הוזנו תוצאות)</span>}
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }} dir="rtl">
        <thead>
          <tr style={{ color:'#94a3b8', fontSize:'0.66rem', textAlign:'center' }}>
            <th style={{ textAlign:'right', padding:'3px 4px', fontWeight:600 }}>#</th>
            <th style={{ textAlign:'right', padding:'3px 4px', fontWeight:600 }}>נבחרת</th>
            <th style={{ padding:'3px 3px', fontWeight:600 }} title="משחקים">מש'</th>
            <th style={{ padding:'3px 3px', fontWeight:600 }} title="ניצחונות">נ</th>
            <th style={{ padding:'3px 3px', fontWeight:600 }} title="תיקו">ת</th>
            <th style={{ padding:'3px 3px', fontWeight:600 }} title="הפסדים">ה</th>
            <th style={{ padding:'3px 3px', fontWeight:600 }} title="הפרש שערים">+/-</th>
            <th style={{ padding:'3px 3px', fontWeight:700, color:'#22d3ee' }} title="נקודות">נק'</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const team = teams[row.name];
            const gd = row.GF - row.GA;
            const qualifies = i < 2; // ראש בית + סגנית
            return (
              <tr key={row.name} style={{ borderTop:'1px solid rgba(255,255,255,0.05)', textAlign:'center', background: qualifies && playedAny ? 'rgba(16,185,129,0.07)' : 'transparent' }}>
                <td style={{ textAlign:'right', padding:'4px', color: qualifies?'#34d399':'#64748b', fontWeight:700 }}>{i+1}</td>
                <td style={{ textAlign:'right', padding:'4px' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                    {team?.logo_url && <img src={team.logo_url} alt="" style={{ width:16, height:16, borderRadius:'50%' }} onError={e=>e.target.style.display='none'} />}
                    <span style={{ color:'#f8fafc' }}>{row.name}</span>
                  </span>
                </td>
                <td style={{ padding:'4px', color:'#94a3b8' }}>{row.P}</td>
                <td style={{ padding:'4px', color:'#94a3b8' }}>{row.W}</td>
                <td style={{ padding:'4px', color:'#94a3b8' }}>{row.D}</td>
                <td style={{ padding:'4px', color:'#94a3b8' }}>{row.L}</td>
                <td style={{ padding:'4px', color: gd>0?'#34d399':gd<0?'#f87171':'#94a3b8' }}>{gd>0?`+${gd}`:gd}</td>
                <td style={{ padding:'4px', color:'#22d3ee', fontWeight:700 }}>{row.Pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {playedAny && <p style={{ fontSize:'0.62rem', color:'#475569', marginTop:6 }}>🟢 2 הראשונות מעפילות אוטומטית (ראש בית + סגנית)</p>}
    </div>
  );
}

function MultiAnswerTextInput({ currentAnswers, onAdd }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', width: '100%', minWidth: 0 }}>
      <Input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal(''); } }} placeholder="תשובה..." style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', background: 'rgba(51,65,85,0.5)', borderColor: 'rgba(100,116,139,1)', color: '#f8fafc' }} />
      <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(''); } }} style={{ flexShrink: 0, background: 'var(--tp)', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'white', fontSize: '0.8rem' }}>+</button>
    </div>
  );
}
