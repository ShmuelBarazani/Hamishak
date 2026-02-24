import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { Trophy, FileText, Save, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RoundTableResults from "@/components/predictions/RoundTableResults";
import StandingsTable from "@/components/predictions/StandingsTable";
import { useGame } from "@/components/contexts/GameContext";


export default function AdminResults() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  // טעינת משתמש
  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await supabase.auth.getSession().then(r => !!r.data.session);
        if (isAuth) {
          setCurrentUser(await supabase.auth.getUser().then(r => r.data.user));
        }
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  // טעינת נתונים
  const loadData = useCallback(async () => {
    if (!currentGame) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const questions = await db.Question.filter({ game_id: currentGame.id }, "-created_date", 5000);
      setAllQuestions(questions);

      // מיפוי קבוצות ורשימות
      const teamsData = currentGame.teams_data || [];
      const teamsMap = teamsData.reduce((acc, team) => { acc[team.name] = team; return acc; }, {});
      setTeams(teamsMap);

      const listsData = currentGame.validation_lists || [];
      const listsMap = listsData.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {});
      listsMap['כן/לא'] = ['כן', 'לא'];
      setValidationLists(listsMap);

      // סידור שאלות לטבלאות
      const rTables = {}, sTables = {};
      
      questions.forEach(q => {
        if (!q.table_id) return;
        
        // טיפול ב-T20
        if (q.table_id === 'T20' && q.question_text && !q.home_team) {
          const teams = q.question_text.includes(' נגד ') 
            ? q.question_text.split(' נגד ').map(t => t.trim())
            : q.question_text.includes(' - ') 
              ? q.question_text.split(' - ').map(t => t.trim())
              : null;
          if (teams && teams.length === 2) {
            q.home_team = teams[0];
            q.away_team = teams[1];
          }
        }

        const tableCollection = (q.home_team && q.away_team) ? rTables : sTables;
        let tableId = q.table_id;
        let tableDesc = q.table_description;
        
        // קיבוץ בתים
        if (q.stage_name && q.stage_name.includes('בית')) {
          tableId = q.stage_name;
          tableDesc = q.stage_name;
        }
        // 🔥 קיבוץ שאלות מיוחדות לפי stage_order (כמו במסך מילוי ניחושים)
        else if (q.table_description?.includes('שאלות מיוחדות') && q.stage_order) {
          tableId = `custom_order_${q.stage_order}`;
          tableDesc = q.stage_name || q.table_description;
        }
        
        if (!tableCollection[tableId]) {
          tableCollection[tableId] = { id: tableId, description: tableDesc || tableId, questions: [], stage_order: q.stage_order || 0 };
        }
        tableCollection[tableId].questions.push(q);
      });

      // הפרדת טבלאות
      const t20Table = rTables['T20'];
      delete rTables['T20'];
      setIsraeliTable(t20Table || null);

      delete sTables['T1'];

      // מיון מחזורים/בתים
      const sortedRoundTables = Object.values(rTables).sort((a, b) => {
        const aIsGroup = a.id.includes('בית');
        const bIsGroup = b.id.includes('בית');
        if (aIsGroup && !bIsGroup) return -1;
        if (!aIsGroup && bIsGroup) return 1;
        if (aIsGroup && bIsGroup) return a.id.localeCompare(b.id, 'he');
        return (parseInt(a.id.replace('T','').replace(/\D/g,'')) || 0) - (parseInt(b.id.replace('T','').replace(/\D/g,'')) || 0);
      });
      setRoundTables(sortedRoundTables);

      // טבלאות מיקומים (כולל T9)
      const locationTableIds = ['T9', 'T14', 'T15', 'T16', 'T17'];
      setLocationTables(Object.values(sTables).filter(t => locationTableIds.includes(t.id)).sort((a,b) => parseInt(a.id.replace('T','')) - parseInt(b.id.replace('T',''))));
      
      // T19 נפרד
      setPlayoffWinnersTable(sTables['T19'] || null);

      // שאלות מיוחדות - מיון לפי stage_order
      const allSpecialTables = Object.values(sTables).filter(t => {
        const desc = t.description?.trim();
        const isGroup = (t.id.includes('בית') || desc?.includes('בית')) && !t.questions[0]?.stage_order;
        const isParticipantTable = t.id === 'T1';
        const isT9 = t.id === 'T9';
        // 🔥 סנן T1, T19, T9 וטבלאות מיקומים וטבלאות בתים רגילות
        return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(t.id) && t.id !== 'T19' && !isGroup && !isParticipantTable && !isT9;
      }).sort((a,b) => {
        // 🔥 מיון לפי stage_order קודם כל
        if (a.stage_order !== b.stage_order) {
          return (a.stage_order || 0) - (b.stage_order || 0);
        }
        // אם אין stage_order או שווה - מיין לפי מספר טבלה
        return parseInt(a.id.replace('T','').replace(/\D/g,'')) - parseInt(b.id.replace('T','').replace(/\D/g,''));
      });
      setSpecialTables(allSpecialTables);

      // תוצאות נוכחיות - וודא שאף ערך לא יהיה null או undefined
      const initialResults = questions.reduce((acc, q) => {
        const actualResult = q.actual_result;
        // אם הערך הוא null, undefined, "NULL-NULL", או "__CLEAR__" - הצג כ-"__CLEAR__"
        if (!actualResult || actualResult === '__CLEAR__' || actualResult.toLowerCase().includes('null')) {
          acc[q.id] = '__CLEAR__';
        } else {
          acc[q.id] = actualResult;
        }
        return acc;
      }, {});
      setResults(initialResults);

    } catch (error) {
      console.error("שגיאה בטעינת הנתונים:", error);
      toast({ title: "שגיאה", description: "טעינת הנתונים נכשלה.", variant: "destructive", duration: 2000 });
    }
    setLoading(false);
  }, [currentGame, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 🔥 עדכון נבחרות שנבחרו בשלב 11 (רבע גמר) - זיהוי לפי תיאור השלב
  useEffect(() => {
    // חפש שאלות שהשלב שלהן מכיל "רבע גמר"
    const t11Questions = allQuestions.filter(q => 
      q.table_id === 'T11' || 
      q.table_id === '11' ||
      q.stage_name?.includes('רבע גמר') ||
      q.table_description?.includes('רבע גמר')
    );
    
    const selected = new Set();
    t11Questions.forEach(q => {
      const result = results[q.id];
      if (result && result.trim() !== '' && result !== '__CLEAR__') {
        selected.add(result);
      }
    });

    console.log('🔍 Stage 11 (רבע גמר) - total questions:', t11Questions.length, 'selected teams:', Array.from(selected));
    setSelectedT11Teams(selected);
  }, [results, allQuestions]);

  // 🔥 עדכון נבחרות שנבחרו בשלב 12 (חצי גמר) - זיהוי לפי תיאור השלב
  useEffect(() => {
    // חפש שאלות שהשלב שלהן מכיל "חצי גמר"
    const t12Questions = allQuestions.filter(q => 
      q.table_id === 'T12' || 
      q.table_id === '12' ||
      q.stage_name?.includes('חצי גמר') ||
      q.table_description?.includes('חצי גמר')
    );
    
    const selected = new Set();
    t12Questions.forEach(q => {
      const result = results[q.id];
      if (result && result.trim() !== '' && result !== '__CLEAR__') {
        selected.add(result);
      }
    });

    console.log('🔍 Stage 12 (חצי גמר) - total questions:', t12Questions.length, 'selected teams:', Array.from(selected));
    setSelectedT12Teams(selected);
  }, [results, allQuestions]);

  // 🔥 עדכון נבחרות שנבחרו בשלב 13 (גמר) - זיהוי לפי תיאור השלב
  useEffect(() => {
    // חפש שאלות שהשלב שלהן מכיל "גמר" אבל לא "רבע גמר" או "חצי גמר"
    const t13Questions = allQuestions.filter(q => {
      const stageName = q.stage_name || '';
      const tableDesc = q.table_description || '';
      
      return (
        q.table_id === 'T13' || 
        q.table_id === '13' ||
        (stageName.includes('גמר') && !stageName.includes('רבע') && !stageName.includes('חצי')) ||
        (tableDesc.includes('גמר') && !tableDesc.includes('רבע') && !tableDesc.includes('חצי'))
      );
    });
    
    const selected = new Set();
    t13Questions.forEach(q => {
      const result = results[q.id];
      if (result && result.trim() !== '' && result !== '__CLEAR__') {
        selected.add(result);
      }
    });

    console.log('🔍 Stage 13 (גמר) - total questions:', t13Questions.length, 'selected teams:', Array.from(selected));
    setSelectedT13Teams(selected);
  }, [results, allQuestions]);

  const handleResultChange = (questionId, value) => {
    if (!isAdmin) return;
    setResults(prev => ({ ...prev, [questionId]: value === '' ? '__CLEAR__' : value }));
  };

  // 🚀 שמירת תוצאות בלבד (ללא חישוב ניקוד!)
  const handleSaveResults = async () => {
    setSaving(true);
    try {
      // מצא שאלות שהשתנו
      const changedQuestions = allQuestions.filter(q => {
        const newResult = results[q.id];
        const newValue = (newResult === '__CLEAR__' || !newResult) ? null : newResult;
        const oldValue = q.actual_result || null;
        return newValue !== oldValue;
      });

      if (changedQuestions.length === 0) {
        toast({ title: "לא בוצעו שינויים", description: "אין שינויים לשמור", duration: 2000 });
        setSaving(false);
        return;
      }

      console.log(`💾 שומר ${changedQuestions.length} שאלות...`);

      // עדכון שאלות אחת אחת (עם השהייה למניעת rate limit)
      for (let i = 0; i < changedQuestions.length; i++) {
        const q = changedQuestions[i];
        const newResult = results[q.id];
        const valueToSave = (newResult === '__CLEAR__' || !newResult) ? null : newResult;
        
        await db.Question.update(q.id, { actual_result: valueToSave });
        
        // השהייה כל 3 שאלות
        if ((i + 1) % 3 === 0) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      toast({
        title: "נשמר!",
        description: `עודכנו ${changedQuestions.length} תוצאות`,
        className: "bg-cyan-900/30 border-cyan-500 text-cyan-200",
        duration: 2000
      });
      
      loadData();

    } catch (error) {
      console.error("שגיאה בשמירה:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive", duration: 2000 });
    }
    setSaving(false);
  };



  const toggleSection = (sectionId) => {
    setOpenSections(prev => ({...prev, [sectionId]: !prev[sectionId]}));
  };

  // רינדור Select עם לוגו
  const renderSelectWithLogos = (question, value, onChange, selectClassName = "w-[200px]") => {
    const options = validationLists[question.validation_list] || [];
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ');
    const isNationalTeams = question.validation_list?.toLowerCase().includes('נבחר');
    const hasResult = value && value !== '__CLEAR__';

    if (!question.validation_list || options.length === 0) {
      return (
        <Input
          value={value === '__CLEAR__' ? '' : (value || '')}
          onChange={(e) => onChange(e.target.value)}
          style={{ 
            width: '180px',
            background: hasResult ? 'rgba(6, 182, 212, 0.2)' : 'rgba(51, 65, 85, 0.5)',
            borderColor: hasResult ? '#06b6d4' : 'rgba(100, 116, 139, 1)',
            color: hasResult ? '#06b6d4' : '#f8fafc',
            fontWeight: hasResult ? '700' : 'normal'
          }}
          placeholder="הזן תוצאה..."
          readOnly={!isAdmin}
        />
      );
    }

    // 🔥 וודא שהערך תמיד תקין - לא null/undefined
    const safeValue = (!value || value === 'null' || value === 'undefined' || value.toLowerCase?.().includes('null')) ? '__CLEAR__' : value;

    return (
      <Select value={safeValue} onValueChange={onChange} disabled={!isAdmin}>
        <SelectTrigger className={selectClassName} style={{
          background: hasResult ? 'rgba(6, 182, 212, 0.2)' : 'rgba(51, 65, 85, 0.5)',
          borderColor: hasResult ? '#06b6d4' : 'rgba(100, 116, 139, 1)',
          color: hasResult ? '#06b6d4' : '#94a3b8',
          fontWeight: hasResult ? '700' : 'normal'
        }}>
          <SelectValue placeholder="בחר...">
            {!hasResult ? 'בחר...' : (
              <div className="flex items-center gap-2">
                {(isTeamsList || isNationalTeams) && teams[value]?.logo_url && (
                  <img src={teams[value].logo_url} alt={value} className="w-5 h-5 rounded-full" onError={(e) => e.target.style.display = 'none'} />
                )}
                <span>{value}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-cyan-600 text-slate-200">
          <SelectItem value="__CLEAR__" className="hover:bg-cyan-700/20 text-blue-300">בחר...</SelectItem>
          {options.map(opt => {
            const team = (isTeamsList || isNationalTeams) ? teams[opt] : null;

            // 🔥 בדיקה אם הנבחרת כבר נבחרה - לפי תיאור השלב (בדיוק כמו ב-PredictionForm)
            let isAlreadySelected = false;
            const safeValue = (!value || value === 'null' || value === 'undefined' || value === '__CLEAR__') ? '' : value;

            const stageName = question.stage_name || '';
            const tableDesc = question.table_description || '';

            // בדיקה לרבע גמר (שלב 11)
            const isStage11 = question.table_id === 'T11' || 
                              question.table_id === '11' || 
                              stageName.includes('רבע גמר') || 
                              tableDesc.includes('רבע גמר');

            // בדיקה לחצי גמר (שלב 12)
            const isStage12 = question.table_id === 'T12' || 
                              question.table_id === '12' || 
                              stageName.includes('חצי גמר') || 
                              tableDesc.includes('חצי גמר');

            // בדיקה לגמר (שלב 13) - רק "גמר" ללא "רבע" או "חצי"
            const isStage13 = question.table_id === 'T13' || 
                              question.table_id === '13' || 
                              ((stageName.includes('גמר') && !stageName.includes('רבע') && !stageName.includes('חצי')) ||
                               (tableDesc.includes('גמר') && !tableDesc.includes('רבע') && !tableDesc.includes('חצי')));

            if (isStage11 && selectedT11Teams.has(opt) && safeValue !== opt) {
              isAlreadySelected = true;
            }

            if (isStage12 && selectedT12Teams.has(opt) && safeValue !== opt) {
              isAlreadySelected = true;
            }

            if (isStage13 && selectedT13Teams.has(opt) && safeValue !== opt) {
              isAlreadySelected = true;
            }
            
            return (
              <SelectItem 
                key={opt} 
                value={opt} 
                className="hover:bg-cyan-700/20"
                disabled={isAlreadySelected}
                style={{
                  opacity: isAlreadySelected ? 0.4 : 1,
                  cursor: isAlreadySelected ? 'not-allowed' : 'pointer'
                }}
              >
                <div className="flex items-center gap-2">
                  {team?.logo_url && (
                    <img 
                      src={team.logo_url} 
                      alt={opt} 
                      className="w-5 h-5 rounded-full" 
                      onError={(e) => e.target.style.display = 'none'}
                      style={{ opacity: isAlreadySelected ? 0.4 : 1 }}
                    />
                  )}
                  <span style={{ color: isAlreadySelected ? '#64748b' : '#f8fafc' }}>{opt}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  };

  // רינדור שאלות מיוחדות (T10)
  const renderT10Questions = (table) => {
    const questions = table.questions;
    const grouped = {};
    
    questions.forEach(q => {
      const mainId = Math.floor(parseFloat(q.question_id));
      if (!grouped[mainId]) {
        grouped[mainId] = { main: null, subs: [] };
      }
      if (q.question_id.includes('.')) {
        grouped[mainId].subs.push(q);
      } else {
        grouped[mainId].main = q;
      }
    });

    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    return (
      <Card className="bg-slate-800/40 border-cyan-700 shadow-lg shadow-cyan-900/20">
        <CardHeader className="py-3">
          <CardTitle className="text-cyan-400">{table.description}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-2">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;

              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));

              // שאלה ללא תתי-שאלות - 4 עמודות
              if (sortedSubs.length === 0) {
                return (
                  <div 
                    key={main.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 1fr 160px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px'
                    }}
                    className="border border-cyan-600/30 bg-slate-700/20"
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                    {renderSelectWithLogos(main, results[main.id] || "", (val) => handleResultChange(main.id, val === "__CLEAR__" ? "" : val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{main.possible_points || 0}</Badge>
                  </div>
                );
              }

              // שאלה עם תת-שאלה אחת - 8 עמודות
              if (sortedSubs.length === 1) {
                return (
                  <div 
                    key={main.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 1fr 160px 50px 50px 1fr 160px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px'
                    }}
                    className="border border-cyan-600/30 bg-slate-700/20"
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                    {renderSelectWithLogos(main, results[main.id] || "", (val) => handleResultChange(main.id, val === "__CLEAR__" ? "" : val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{main.possible_points || 0}</Badge>
                    
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sortedSubs[0].question_id}</Badge>
                    <span className="text-right font-medium text-sm text-blue-100 truncate">{sortedSubs[0].question_text}</span>
                    {renderSelectWithLogos(sortedSubs[0], results[sortedSubs[0].id] || "", (val) => handleResultChange(sortedSubs[0].id, val === "__CLEAR__" ? "" : val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{sortedSubs[0].possible_points || 0}</Badge>
                  </div>
                );
              }

              // שאלה עם 2 תתי-שאלות - 12 עמודות
              return (
                <div 
                  key={main.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '45px 1fr 140px 45px 45px 1fr 140px 45px 45px 1fr 140px 45px',
                    gap: '6px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '6px'
                  }}
                  className="border border-cyan-600/30 bg-slate-700/20"
                >
                  <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                  <span className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</span>
                  {renderSelectWithLogos(main, results[main.id] || "", (val) => handleResultChange(main.id, val === "__CLEAR__" ? "" : val), "w-[140px]")}
                  <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ background: '#fbbf24', color: 'white' }}>{main.possible_points || 0}</Badge>
                  
                  {sortedSubs.map(sub => (
                    <React.Fragment key={sub.id}>
                      <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sub.question_id}</Badge>
                      <span className="text-right font-medium text-sm text-blue-100 truncate">{sub.question_text}</span>
                      {renderSelectWithLogos(sub, results[sub.id] || "", (val) => handleResultChange(sub.id, val === "__CLEAR__" ? "" : val), "w-[140px]")}
                      <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{sub.possible_points || 0}</Badge>
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

  // רינדור שאלות מיוחדות רגילות (לא T10)
  const renderSpecialQuestions = (table) => {
    const isT10 = table.description?.includes('T10') || table.id === 'T10' || table.id.includes('custom_order');
    
    if (isT10) {
      return renderT10Questions(table);
    }

    // קיבוץ שאלות עם תת-שאלות
    const grouped = {};
    table.questions.forEach(q => {
      const mainId = Math.floor(parseFloat(q.question_id));
      if (!grouped[mainId]) {
        grouped[mainId] = { main: null, subs: [] };
      }
      if (q.question_id.includes('.')) {
        grouped[mainId].subs.push(q);
      } else {
        grouped[mainId].main = q;
      }
    });

    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    return (
      <Card className="bg-slate-800/40 border-cyan-700 shadow-lg shadow-cyan-900/20">
        <CardHeader className="py-3">
          <CardTitle className="text-cyan-400">{table.description}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-2">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;

              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));

              // שאלה ללא תתי-שאלות - 4 עמודות
              if (sortedSubs.length === 0) {
                return (
                  <div 
                    key={main.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 1fr 160px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px'
                    }}
                    className="border border-cyan-600/30 bg-slate-700/20"
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <label className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</label>
                    {renderSelectWithLogos(main, results[main.id] || "", (val) => handleResultChange(main.id, val === "__CLEAR__" ? "" : val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{main.possible_points || 0}</Badge>
                  </div>
                );
              }

              // שאלה עם תת-שאלה אחת - 9 עמודות
              if (sortedSubs.length === 1) {
                return (
                  <div 
                    key={main.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '50px minmax(250px, 2fr) 160px 50px 1fr 50px minmax(180px, 1.5fr) 160px 50px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px'
                    }}
                    className="border border-cyan-600/30 bg-slate-700/20"
                  >
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                    <label className="text-right font-medium text-sm text-blue-100">{main.question_text}</label>
                    {renderSelectWithLogos(main, results[main.id] || "", (val) => handleResultChange(main.id, val === "__CLEAR__" ? "" : val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{main.possible_points || 0}</Badge>
                    
                    <div></div>
                    
                    <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sortedSubs[0].question_id}</Badge>
                    <label className="text-right font-medium text-sm text-blue-100">{sortedSubs[0].question_text}</label>
                    {renderSelectWithLogos(sortedSubs[0], results[sortedSubs[0].id] || "", (val) => handleResultChange(sortedSubs[0].id, val === "__CLEAR__" ? "" : val), "w-[160px]")}
                    <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{sortedSubs[0].possible_points || 0}</Badge>
                  </div>
                );
              }

              // שאלה עם 2 תתי-שאלות - 12 עמודות
              return (
                <div 
                  key={main.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '45px 1fr 140px 45px 45px 1fr 140px 45px 45px 1fr 140px 45px',
                    gap: '6px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '6px'
                  }}
                  className="border border-cyan-600/30 bg-slate-700/20"
                >
                  <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{main.question_id}</Badge>
                  <label className="text-right font-medium text-sm text-blue-100 truncate">{main.question_text}</label>
                  {renderSelectWithLogos(main, results[main.id] || "", (val) => handleResultChange(main.id, val === "__CLEAR__" ? "" : val), "w-[140px]")}
                  <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ background: '#fbbf24', color: 'white' }}>{main.possible_points || 0}</Badge>
                  
                  {sortedSubs.map(sub => (
                    <React.Fragment key={sub.id}>
                      <Badge variant="outline" className="border-cyan-400 text-cyan-200 justify-center text-xs h-6 w-full">{sub.question_id}</Badge>
                      <label className="text-right font-medium text-sm text-blue-100 truncate">{sub.question_text}</label>
                      {renderSelectWithLogos(sub, results[sub.id] || "", (val) => handleResultChange(sub.id, val === "__CLEAR__" ? "" : val), "w-[140px]")}
                      <Badge className="text-xs px-2 py-1 justify-center h-6 w-full" style={{ borderColor: 'rgba(6, 182, 212, 0.5)', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }}>{sub.possible_points || 0}</Badge>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <span className="mr-3 text-cyan-300">טוען נתונים...</span>
      </div>
    );
  }

  // בניית כפתורי ניווט
  const allButtons = [];

  if (roundTables.length > 0) {
    const allAreGroups = roundTables.every(t => t.id.includes('בית') || t.description?.includes('בית'));
    allButtons.push({
      numericId: parseInt(roundTables[0]?.id.replace('T', '').replace(/\D/g, ''), 10) || 0,
      key: 'rounds',
      description: allAreGroups ? 'שלב הבתים' : 'מחזורי המשחקים',
      sectionKey: 'rounds'
    });
  }

  specialTables.forEach(table => {
    allButtons.push({
      numericId: table.stage_order || parseInt(table.id.replace('T', '').replace(/\D/g, ''), 10),
      key: table.id,
      description: table.description,
      sectionKey: table.id
    });
  });

  if (locationTables.length > 0) {
    allButtons.push({
      numericId: parseInt(locationTables[0]?.id.replace('T', ''), 10),
      key: 'locations',
      description: 'מיקומים בתום שלב הבתים',
      sectionKey: 'locations'
    });
  }

  if (israeliTable) {
    allButtons.push({
      numericId: parseInt(israeliTable.id.replace('T', ''), 10),
      key: israeliTable.id,
      description: israeliTable.description,
      sectionKey: 'israeli'
    });
  }

  if (playoffWinnersTable) {
    allButtons.push({
      numericId: parseInt(playoffWinnersTable.id.replace('T', ''), 10),
      key: playoffWinnersTable.id,
      description: playoffWinnersTable.description,
      sectionKey: 'playoffWinners'
    });
  }

  allButtons.sort((a, b) => {
    if (a.sectionKey === 'rounds' && b.sectionKey !== 'rounds') return -1;
    if (b.sectionKey === 'rounds' && a.sectionKey !== 'rounds') return 1;
    return a.numericId - b.numericId;
  });

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto" dir="rtl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', minHeight: '100vh' }}>
      <div className="flex flex-col md:flex-row justify-between items-start gap-3 mb-4 md:mb-8">
        <div>
          <h1 className="text-xl md:text-3xl font-bold mb-1 flex items-center gap-2" style={{ color: '#f8fafc', textShadow: '0 0 10px rgba(6, 182, 212, 0.3)' }}>
            <Trophy className="w-6 h-6 md:w-8 md:h-8" style={{ color: '#06b6d4' }} />
            {isAdmin ? 'עדכון תוצאות אמת' : 'תוצאות אמת'}
          </h1>
          <p className="text-xs md:text-base" style={{ color: '#94a3b8' }}>
            {isAdmin ? 'עדכן תוצאות ואז לחץ "עדכן דירוג"' : 'צפייה בתוצאות האמיתיות'}
          </p>
        </div>
        
        {isAdmin && (
          <Button onClick={handleSaveResults} disabled={saving} className="h-10 px-6 text-white" style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
            boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
          }}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Save className="w-5 h-5 ml-2" />}
            שמור תוצאות
          </Button>
        )}
      </div>

      {roundTables.length === 0 && specialTables.length === 0 && locationTables.length === 0 && !israeliTable ? (
        <Alert variant="destructive" className="bg-cyan-900/50 border-cyan-700 text-cyan-200">
          <FileText className="w-4 h-4" />
          <AlertDescription>לא נמצאו שאלות במערכת.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card className="mb-4 bg-slate-800/40 border-cyan-700">
            <CardHeader className="py-2">
              <CardTitle className="text-sm md:text-lg text-cyan-400">בחירת שלב</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2">
              {allButtons.map(button => (
                <Button 
                  key={button.key}
                  onClick={() => toggleSection(button.sectionKey)}
                  variant={openSections[button.sectionKey] ? "default" : "outline"}
                  className={`h-14 md:h-20 p-1.5 flex-col gap-1 whitespace-normal ${
                    openSections[button.sectionKey] 
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white' 
                      : 'bg-slate-700/50 border-cyan-500 text-cyan-300'
                  }`}
                >
                  <span className="text-[9px] md:text-sm font-medium leading-tight text-center">{button.description}</span>
                  {openSections[button.sectionKey] ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                </Button>
              ))}
            </CardContent>
          </Card>

          {allButtons.map(button => {
            if (!openSections[button.sectionKey]) return null;

            if (button.sectionKey === 'rounds') {
              return (
                <div key="rounds-section" className="mb-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {roundTables.map(table => (
                      <RoundTableResults
                        key={table.id}
                        table={table}
                        teams={teams}
                        results={results}
                        onResultChange={handleResultChange}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                  <StandingsTable roundTables={roundTables} teams={teams} data={results} type="results" />
                </div>
              );
            }
            
            if (button.sectionKey === 'israeli' && israeliTable) {
              return (
                <div key="israeli-section" className="mb-4">
                  <RoundTableResults table={israeliTable} teams={teams} results={results} onResultChange={handleResultChange} isAdmin={isAdmin} />
                </div>
              );
            }
            
            if (button.sectionKey === 'locations') {
              return (
                <div key="locations-section" className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {locationTables.map(table => renderSpecialQuestions(table))}
                </div>
              );
            }
            
            if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) {
              return <div key="playoffWinners-section" className="mb-6">{renderSpecialQuestions(playoffWinnersTable)}</div>;
            }
            
            const specificTable = specialTables.find(t => t.id === button.key);
            if (specificTable) {
              return <div key={specificTable.id} className="mb-6">{renderSpecialQuestions(specificTable)}</div>;
            }
            
            return null;
          })}
        </>
      )}
    </div>
  );
}