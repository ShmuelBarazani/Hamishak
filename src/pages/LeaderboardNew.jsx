import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Trophy, Loader2, Crown, TrendingUp, TrendingDown, Minus,
  Users, Target, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useGame } from "@/components/contexts/GameContext";
import { calculateTotalScore } from "@/components/scoring/ScoreService";

// 🏆 טבלת הפרסים לפי מיקום (₪)
const PRIZE_TABLE = { 1:8000, 2:4500, 3:3000, 4:2500, 5:2000, 6:1500, 7:1000, 8:800, 9:500, 10:300 };
const LUCKY_LOSER = 100;

// 🎁 פרסים לא-כספיים לפי מיקום (מתוך קובץ הניקוד — 14/6/26).
// מקומות 11–27 = טווחים רציפים ; מ-28 ואילך = מיקום מדויק בלבד (מיקומי ביניים ללא פרס).
// מקום אחרון (242) = לאקי לוזר, מטופל ב-computePrize.
const NON_CASH_PRIZES = [
  { min: 11, max: 12,  short: "🍱 ג'פניקה זוגית",     title: "ארוחה זוגית — מסעדת ג'פניקה",  full: "ארוחה זוגית במסעדת ג'פניקה, בחיפה או בקיסריה (לבחירתכם).", color: '#ec4899' },
  { min: 13, max: 16,  short: '🍔 בורגר סאלון זוגית', title: 'ארוחה זוגית — בורגר סאלון',     full: 'ארוחה זוגית במסעדת בורגר סאלון, באצטדיון סמי עופר בחיפה.', color: '#f59e0b' },
  { min: 17, max: 22,  short: '🎵 הופעה בביט',        title: 'הופעה זוגית — מועדון הביט',     full: "כרטיס זוגי למופע במועדון הביט — בית הספר למוזיקה ומועדון, שד' הנשיא 124, חיפה.", color: '#8b5cf6' },
  { min: 23, max: 25,  short: '🥩 אבו שקארה (מגש)',   title: 'מגש — אבו שקארה',               full: 'מגש מאבו שקארה.', color: '#22c55e' },
  { min: 26, max: 27,  short: "🥃 סקאץ' - א.בוקר",     title: "סקאץ' — א.בוקר",                full: "פרס סקאץ' - א.בוקר.", color: '#06b6d4' },
  { min: 28, max: 28,  short: '☕ לוקאל קפה',          title: 'לוקאל קפה',                     full: 'פרס לוקאל קפה.', color: '#a3a3a3' },
  { min: 29, max: 29,  short: '🥖 באגט נשר',           title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 30, max: 30,  short: '🍮 כנאפה תלפיות',       title: 'כנאפה תלפיות',                  full: 'פרס כנאפה תלפיות.', color: '#a3a3a3' },
  { min: 35, max: 35,  short: '🎳 באולינג',            title: 'באולינג',                       full: 'פרס באולינג.', color: '#a3a3a3' },
  { min: 40, max: 40,  short: '🥖 באגט נשר',           title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 45, max: 45,  short: '☕ קפה עוספיה',         title: 'קפה עוספיה',                    full: 'פרס קפה עוספיה.', color: '#a3a3a3' },
  { min: 50, max: 50,  short: '☕ לוקאל קפה',          title: 'לוקאל קפה',                     full: 'פרס לוקאל קפה.', color: '#a3a3a3' },
  { min: 55, max: 55,  short: '🍮 כנאפה תלפיות',       title: 'כנאפה תלפיות',                  full: 'פרס כנאפה תלפיות.', color: '#a3a3a3' },
  { min: 60, max: 60,  short: '🥖 באגט נשר',           title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 67, max: 67,  short: '☕ קפה עוספיה',         title: 'קפה עוספיה',                    full: 'פרס קפה עוספיה.', color: '#a3a3a3' },
  { min: 70, max: 70,  short: '🍮 כנאפה תלפיות',       title: 'כנאפה תלפיות',                  full: 'פרס כנאפה תלפיות.', color: '#a3a3a3' },
  { min: 75, max: 75,  short: "🥃 סקאץ'",              title: "סקאץ'",                         full: "פרס סקאץ'.", color: '#a3a3a3' },
  { min: 80, max: 80,  short: '🥖 באגט נשר',           title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 85, max: 85,  short: '☕ קפה עוספיה',         title: 'קפה עוספיה',                    full: 'פרס קפה עוספיה.', color: '#a3a3a3' },
  { min: 90, max: 90,  short: '☕ לוקאל קפה',          title: 'לוקאל קפה',                     full: 'פרס לוקאל קפה.', color: '#a3a3a3' },
  { min: 95, max: 95,  short: '🍮 כנאפה תלפיות',       title: 'כנאפה תלפיות',                  full: 'פרס כנאפה תלפיות.', color: '#a3a3a3' },
  { min: 100, max: 100, short: '🥖 באגט נשר',          title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 104, max: 104, short: '☕ קפה עוספיה',        title: 'קפה עוספיה',                    full: 'פרס קפה עוספיה.', color: '#a3a3a3' },
  { min: 105, max: 105, short: "🥃 סקאץ'",             title: "סקאץ'",                         full: "פרס סקאץ'.", color: '#a3a3a3' },
  { min: 110, max: 110, short: '🥩 אבו שקארה',         title: 'אבו שקארה',                     full: 'פרס אבו שקארה.', color: '#a3a3a3' },
  { min: 115, max: 115, short: '🍮 כנאפה תלפיות',      title: 'כנאפה תלפיות',                  full: 'פרס כנאפה תלפיות.', color: '#a3a3a3' },
  { min: 120, max: 120, short: '🥖 באגט נשר',          title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 125, max: 125, short: '🥩 אבו שקארה',         title: 'אבו שקארה',                     full: 'פרס אבו שקארה.', color: '#a3a3a3' },
  { min: 130, max: 130, short: '🍮 כנאפה תלפיות',      title: 'כנאפה תלפיות',                  full: 'פרס כנאפה תלפיות.', color: '#a3a3a3' },
  { min: 135, max: 135, short: '🥩 אבו שקארה',         title: 'אבו שקארה',                     full: 'פרס אבו שקארה.', color: '#a3a3a3' },
  { min: 140, max: 140, short: '🥖 באגט נשר',          title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 145, max: 145, short: '🎳 באולינג',           title: 'באולינג',                       full: 'פרס באולינג.', color: '#a3a3a3' },
  { min: 150, max: 150, short: "🥃 סקאץ'",             title: "סקאץ'",                         full: "פרס סקאץ'.", color: '#a3a3a3' },
  { min: 155, max: 155, short: '🥩 אבו שקארה',         title: 'אבו שקארה',                     full: 'פרס אבו שקארה.', color: '#a3a3a3' },
  { min: 160, max: 160, short: '🍔 BBB',               title: 'BBB',                           full: 'פרס BBB.', color: '#a3a3a3' },
  { min: 165, max: 165, short: '☕ לוקאל קפה',         title: 'לוקאל קפה',                     full: 'פרס לוקאל קפה.', color: '#a3a3a3' },
  { min: 170, max: 170, short: '🎳 באולינג',           title: 'באולינג',                       full: 'פרס באולינג.', color: '#a3a3a3' },
  { min: 175, max: 175, short: '🍮 כנאפה תלפיות',      title: 'כנאפה תלפיות',                  full: 'פרס כנאפה תלפיות.', color: '#a3a3a3' },
  { min: 180, max: 180, short: '🥖 באגט נשר',          title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 185, max: 185, short: '☕ לוקאל קפה',         title: 'לוקאל קפה',                     full: 'פרס לוקאל קפה.', color: '#a3a3a3' },
  { min: 190, max: 190, short: '🥩 אבו שקארה',         title: 'אבו שקארה',                     full: 'פרס אבו שקארה.', color: '#a3a3a3' },
  { min: 195, max: 195, short: '☕ קפה עוספיה',        title: 'קפה עוספיה',                    full: 'פרס קפה עוספיה.', color: '#a3a3a3' },
  { min: 200, max: 200, short: '🎳 באולינג',           title: 'באולינג',                       full: 'פרס באולינג.', color: '#a3a3a3' },
  { min: 205, max: 205, short: "🥃 סקאץ'",             title: "סקאץ'",                         full: "פרס סקאץ'.", color: '#a3a3a3' },
  { min: 210, max: 210, short: '🥖 באגט נשר',          title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 215, max: 215, short: '☕ קפה עוספיה',        title: 'קפה עוספיה',                    full: 'פרס קפה עוספיה.', color: '#a3a3a3' },
  { min: 220, max: 220, short: '🍔 BBB',               title: 'BBB',                           full: 'פרס BBB.', color: '#a3a3a3' },
  { min: 225, max: 225, short: "🥃 סקאץ'",             title: "סקאץ'",                         full: "פרס סקאץ'.", color: '#a3a3a3' },
  { min: 230, max: 230, short: '🥖 באגט נשר',          title: 'באגט נשר',                      full: 'פרס באגט נשר.', color: '#a3a3a3' },
  { min: 235, max: 235, short: '🎳 באולינג',           title: 'באולינג',                       full: 'פרס באולינג.', color: '#a3a3a3' },
  { min: 240, max: 240, short: '☕ קפה עוספיה',        title: 'קפה עוספיה',                    full: 'פרס קפה עוספיה.', color: '#a3a3a3' },
  { min: 241, max: 241, short: '🍔 BBB',               title: 'BBB',                           full: 'פרס BBB.', color: '#a3a3a3' },
];
// 🎨 צבע ייחודי לכל סוג פרס (לפי שם — מזוהה מתוך ה-short ללא אימוג'י/מספר)
const PRIZE_COLORS = {
  "ג'פניקה":      '#ec4899', // ורוד
  'בורגר סאלון':  '#f59e0b', // כתום
  'הופעה בביט':   '#8b5cf6', // סגול
  'אבו שקארה':    '#ef4444', // אדום (סטייק)
  "סקאץ' - א.בוקר": '#14b8a6', // טורקיז
  "סקאץ'":        '#2dd4bf', // טורקיז בהיר
  'לוקאל קפה':    '#d97706', // ענבר
  'באגט נשר':     '#eab308', // צהוב
  'כנאפה תלפיות': '#f97316', // כתום-אדום
  'באולינג':      '#3b82f6', // כחול
  'קפה עוספיה':   '#a16207', // חום
  'BBB':          '#22c55e', // ירוק
};
const prizeColorFor = (shortLabel) => {
  if (!shortLabel) return '#cbd5e1';
  // מסיר אימוג'י/סוגריים/מספרים ומשאיר את שם הפרס
  const clean = shortLabel.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\(.*?\)/g, '').replace(/זוגית/g,'').trim();
  for (const [name, col] of Object.entries(PRIZE_COLORS)) {
    if (clean.includes(name)) return col;
  }
  return '#cbd5e1';
};
// פרס לא-כספי לפי מיקום ייחודי (אחרי שבירת שוויון א-ב). מיקום מדויק בלבד מ-28 ואילך.
const nonCashPrizeForPos = (pos) => {
  if (!pos) return null;
  const p = NON_CASH_PRIZES.find(p => pos >= p.min && pos <= p.max);
  if (!p) return null;
  return { ...p, color: prizeColorFor(p.short) }; // 🎨 צבע לפי סוג הפרס
};

// מחשב לכל מיקום כמה שותפים יש בו (לחלוקת פרס בשוויון)
function buildPositionCounts(rankings) {
  const counts = {};
  rankings.forEach(r => { const p = r.current_position; if (p) counts[p] = (counts[p] || 0) + 1; });
  return counts;
}

// פרס למשתתף: בשוויון מיקום — סוכמים את פרסי כל המקומות שהקבוצה "תופסת"
// ומחלקים שווה בשווה. לדוגמה: 5 שותפים למקום 1 → (8000+4500+3000+2500+2000)/5 = 4,000 ₪ לכל אחד.
// מקום אחרון = לאקי לוזר (100 ₪).
function computePrize(rank, positionCounts, lastPosition) {
  const pos = rank.current_position;
  if (pos === lastPosition && lastPosition > 10) {
    return { amount: LUCKY_LOSER, lucky: true, share: 1 };
  }
  const share = positionCounts[pos] || 1;
  // סכום הפרסים של המקומות pos .. pos+share-1
  let sum = 0;
  for (let i = 0; i < share; i++) sum += (PRIZE_TABLE[pos + i] || 0);
  if (sum <= 0) return { amount: 0, lucky: false, share };
  return { amount: Math.round(sum / share), lucky: false, share };
}

const fmtPrize = n => n.toLocaleString('he-IL') + ' ₪';

export default function LeaderboardNew() {
  const [rankings,            setRankings           ] = useState([]);
  const [loading,             setLoading            ] = useState(true);
  const [settingBaseline,     setSettingBaseline    ] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantDetails,  setParticipantDetails ] = useState(null);
  const [loadingDetails,      setLoadingDetails     ] = useState(false);
  const [currentUser,         setCurrentUser        ] = useState(null);
  const [avgScore,            setAvgScore           ] = useState(0);
  const [maxScore,            setMaxScore           ] = useState(0);
  const [prizeView,           setPrizeView          ] = useState(null); // 🎁 חלון פרס צף
  const [minScore,            setMinScore           ] = useState(0);
  const [sortColumn,          setSortColumn         ] = useState('current_position');
  const [sortDirection,       setSortDirection      ] = useState('asc');
  const [showPrizes,          setShowPrizes         ] = useState(true); // 🎁 נטען מ-DB (games.show_prizes)
  const { toast }       = useToast();
  const { currentGame } = useGame();

  // 🎁 סנכרון הצגת הפרסים מה-DB (games.show_prizes) — הגדרה גלובלית למשחק, ברירת מחדל true
  useEffect(() => {
    if (currentGame) setShowPrizes(currentGame.show_prizes !== false);
  }, [currentGame]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: { user } } = await supabase.auth.getUser();
          setCurrentUser(user);
        } else setCurrentUser(null);
      } catch { setCurrentUser(null); }
    };
    loadUser();
  }, []);

  const formatScore = (score) => {
    if (!score || score === '__CLEAR__') return '';
    return score.includes('-')
      ? score.split('-').map(x => x.trim()).join(' - ')
      : score;
  };

  const loadAllRankings = async (gameId, orderBy = '-current_score') => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      let q = supabase.from('rankings').select('*')
        .eq('game_id', gameId).range(from, from + PAGE - 1);
      if (orderBy === '-current_score')
        q = q.order('current_score', { ascending: false });
      else if (orderBy)
        q = q.order(orderBy.replace('-', ''), { ascending: !orderBy.startsWith('-') });
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const loadQuestionsForGame = async (gameId) => {
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('questions').select('*')
        .eq('game_id', gameId)
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all.filter(q => q.table_id && q.table_id !== 'T1');
  };

  const loadPredictionsForGame = async (gameId, participantName, allQuestions) => {
    const knownIds = new Set(allQuestions.map(q => q.id));
    let all = [], from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('predictions').select('*')
        .eq('game_id', gameId)
        .eq('participant_name', participantName)
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all.filter(p => knownIds.has(p.question_id));
  };

  const calcScore = (allQuestions, predictions) => {
    const latest = {};
    predictions.forEach(pred => {
      const ex = latest[pred.question_id];
      if (!ex || new Date(pred.created_at) > new Date(ex.created_at))
        latest[pred.question_id] = pred;
    });
    const predMap = {};
    for (const [qid, pred] of Object.entries(latest)) {
      if (
        pred.home_prediction !== null && pred.home_prediction !== undefined &&
        pred.away_prediction !== null && pred.away_prediction !== undefined
      ) {
        predMap[qid] = `${pred.home_prediction}-${pred.away_prediction}`;
      } else {
        predMap[qid] = pred.text_prediction;
      }
    }
    return calculateTotalScore(allQuestions, predMap);
  };

  const loadRankings = useCallback(async () => {
    if (!currentGame) { setLoading(false); return; }
    setLoading(true);
    try {
      const rankingsData = await loadAllRankings(currentGame.id, '-current_score');
      if (rankingsData.length > 0) {
        let position = 1;
        for (let i = 0; i < rankingsData.length; i++) {
          if (i > 0 && rankingsData[i].current_score !== rankingsData[i - 1].current_score)
            position = i + 1;
          rankingsData[i].current_position = position;
        }
        setRankings(rankingsData);
        const scores = rankingsData.map(r => Number(r.current_score) || 0);
        setAvgScore(scores.reduce((a, b) => a + b, 0) / scores.length);
        setMaxScore(Math.max(...scores));
        setMinScore(Math.min(...scores));
      } else setRankings([]);
    } catch (error) {
      console.error("Error loading rankings:", error);
      toast({ title: "שגיאה", description: "טעינת הדירוג נכשלה", variant: "destructive" });
    }
    setLoading(false);
  }, [currentGame, toast]);

  useEffect(() => { loadRankings(); }, [loadRankings]);

  const handleSetBaseline = async () => {
    if (!currentGame) return;
    if (!window.confirm(
      '📌 האם לקבוע את הדירוג הנוכחי כנקודת ייחוס?\n\nהחישוב הבא יציג שינויים ביחס לנקודה זו.'
    )) return;
    setSettingBaseline(true);
    try {
      const allRankings = await loadAllRankings(currentGame.id, '-current_score');
      // 🔧 חישוב מיקום מחדש לפי ניקוד (כולל שוויון) — לפני שמירת ה-baseline,
      //    אחרת baseline_position נשמר עם מיקום מיושן/שגוי.
      let pos = 1;
      for (let i = 0; i < allRankings.length; i++) {
        if (i > 0 && allRankings[i].current_score !== allRankings[i - 1].current_score) pos = i + 1;
        allRankings[i].current_position = pos;
      }
      const now = new Date().toISOString();
      // ⚡ שמירת כל ה-baseline בבקשה אחת (bulkUpsert) במקום לולאה — מהיר דרמטית
      const baselineRows = allRankings.map(r => ({
        id: r.id,
        baseline_score:    r.current_score,
        baseline_position: r.current_position,
        last_baseline_set: now,
      }));
      const BL_CHUNK = 200;
      for (let i = 0; i < baselineRows.length; i += BL_CHUNK) {
        const chunk = baselineRows.slice(i, i + BL_CHUNK);
        try {
          await db.Ranking.bulkUpsert(chunk, 'id');
        } catch (err) {
          console.error('שגיאה בקיבוע ניקוד (גוש)', err);
          await Promise.all(chunk.map(row =>
            db.Ranking.update(row.id, row).catch(e => console.error('שגיאה בקיבוע', row.id, e))
          ));
        }
      }
      toast({
        title: "נקודת ייחוס נקבעה!",
        description: `${allRankings.length} משתתפים עודכנו`,
        className: "bg-green-900/30 border-green-500 text-green-200"
      });
      await loadRankings();
    } catch (error) {
      console.error("Error setting baseline:", error);
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    }
    setSettingBaseline(false);
  };

  const loadParticipantDetails = async (participantName) => {
    if (!currentGame) return;
    setSelectedParticipant(participantName);
    setParticipantDetails(null);
    setLoadingDetails(true);

    try {
      const allQuestions   = await loadQuestionsForGame(currentGame.id);
      const allPredictions = await loadPredictionsForGame(currentGame.id, participantName, allQuestions);

      const teamsMap = (currentGame.teams_data || [])
        .reduce((acc, t) => { acc[t.name] = t; return acc; }, {});

      const { total: calcTotal, breakdown } = calcScore(allQuestions, allPredictions);

      let totalScore = calcTotal;
      try {
        const { data: rankRow } = await supabase
          .from('rankings')
          .select('current_score')
          .eq('game_id', currentGame.id)
          .eq('participant_name', participantName)
          .single();
        if (rankRow?.current_score != null) totalScore = rankRow.current_score;
      } catch { /* fallback to calcTotal */ }

      // 🌍 במונדיאל אין טבלאות מיקומים — T14/T15/T19 הן שאלות רגילות/עולות
      const isWC = currentGame?.id === '30032806-6216-496f-ac32-fb628e181742';
      const LOCATION_TABLE_IDS = isWC ? [] : ['T14', 'T15', 'T16', 'T17', 'T19'];
      const LOCATION_DEFAULTS  = {
        T14: 'מקומות 1-8 — שלב הבתים',
        T15: 'מקומות 9-16 — שלב הבתים',
        T16: 'מקומות 17-24 — שלב הבתים',
        T17: 'מקומות 1-24 — טבלה כוללת',
        T19: 'רשימת העולות לשמינית הגמר',
      };
      const locationDesc = { ...LOCATION_DEFAULTS };
      allQuestions.forEach(q => {
        if (LOCATION_TABLE_IDS.includes(q.table_id) && q.table_description?.trim())
          locationDesc[q.table_id] = q.table_description.trim();
      });

      const latestPred = {};
      allPredictions.forEach(p => {
        const ex = latestPred[p.question_id];
        if (!ex || new Date(p.created_at) > new Date(ex.created_at))
          latestPred[p.question_id] = p;
      });

      const getPredDisplay = (qid) => {
        const p = latestPred[qid];
        if (!p) return '';
        if (p.home_prediction !== null && p.home_prediction !== undefined &&
            p.away_prediction !== null && p.away_prediction !== undefined)
          return formatScore(`${p.home_prediction}-${p.away_prediction}`);
        return formatScore(p.text_prediction || '');
      };

      const locationSums     = {};
      const regularBreakdown = [];
      const bonusRows        = [];

      breakdown.forEach(item => {
        if (LOCATION_TABLE_IDS.includes(item.table_id)) {
          locationSums[item.table_id] = (locationSums[item.table_id] || 0) + item.score;
        } else if (item.isBonus === true || !allQuestions.find(x => x.id === item.question_id)) {
          if (item.score > 0) {
            bonusRows.push({
              score:               item.score,
              max_score:           item.max_score || item.score,
              table_id:            item.table_id || '?',
              question_id_display: '',
              question_text:       item.question_id_text || item.bonusDescription || `בונוס שלב ${item.table_id}`,
              home_team: null, away_team: null,
              actual_result: '', prediction: '',
              home_team_display: null, away_team_display: null,
              home_team_logo: null, away_team_logo: null,
              isLocationSummary: false, isStageBonusRow: true,
            });
          }
        } else if (item.score > 0) {
          const q = allQuestions.find(x => x.id === item.question_id);
          if (!q) return;
          regularBreakdown.push({
            score:               item.score,
            max_score:           item.max_score,
            table_id:            item.table_id || '?',
            question_id_display: item.question_id_text || q.question_id || '?',
            question_text:       q.question_text || '',
            home_team:           q.home_team,
            away_team:           q.away_team,
            actual_result:       formatScore(q.actual_result || ''),
            prediction:          getPredDisplay(item.question_id),
            home_team_display:   q.home_team?.replace(/\s*\([^)]+\)\s*$/, '').trim() || null,
            away_team_display:   q.away_team?.replace(/\s*\([^)]+\)\s*$/, '').trim() || null,
            home_team_logo:      q.home_team
              ? (teamsMap[q.home_team]?.logo_url || teamsMap[q.home_team.replace(/\s*\([^)]+\)\s*$/, '').trim()]?.logo_url)
              : null,
            away_team_logo:      q.away_team
              ? (teamsMap[q.away_team]?.logo_url || teamsMap[q.away_team.replace(/\s*\([^)]+\)\s*$/, '').trim()]?.logo_url)
              : null,
            isLocationSummary: false, isStageBonusRow: false,
          });
        }
      });

      const locationRows = Object.entries(locationSums)
        .filter(([, s]) => s > 0)
        .map(([tid, s]) => ({
          score: s, max_score: null, table_id: tid,
          question_id_display: '',
          question_text: locationDesc[tid] || tid,
          home_team: null, away_team: null,
          actual_result: '', prediction: '',
          home_team_display: null, away_team_display: null,
          home_team_logo: null, away_team_logo: null,
          isLocationSummary: true,
        }));

      const enriched = [...regularBreakdown, ...locationRows, ...bonusRows];
      enriched.sort((a, b) => {
        const tA = parseInt(a.table_id.replace('T', '')) || 999;
        const tB = parseInt(b.table_id.replace('T', '')) || 999;
        if (tA !== tB) return tA - tB;
        return (parseFloat(a.question_id_display) || 999) - (parseFloat(b.question_id_display) || 999);
      });

      // ── qualifying sections ────────────────────────────────────────────────
      const normT = n => (n || '')
        .replace(/\s*\([^)]+\)\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const qualTableMap = {};
      allQuestions.forEach(q => {
        if (q.stage_type !== 'qualifiers') return;
        const n = parseFloat(q.question_id);
        if (!Number.isInteger(n) || n < 1) return;
        if (!qualTableMap[q.table_id]) qualTableMap[q.table_id] = [];
        qualTableMap[q.table_id].push(q);
      });

      // שלב 1: בנה advSet לכל טבלה
      const sortedTableIds = Object.keys(qualTableMap)
        .sort((a, b) => (parseInt(a.replace('T', '')) || 0) - (parseInt(b.replace('T', '')) || 0));

      const tableMetaMap = {};
      sortedTableIds.forEach(tableId => {
        const tSlots = qualTableMap[tableId];
        tSlots.sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
        const advSet = new Set(
          tSlots
            .filter(q => q.actual_result && q.actual_result !== '__CLEAR__')
            .map(q => normT(q.actual_result))
        );
        const allResultsIn = tSlots.every(
          q => q.actual_result && q.actual_result !== '__CLEAR__'
        );
        tableMetaMap[tableId] = { tSlots, advSet, allResultsIn };
      });

      // שלב 2: לכל טבלה, חשב isElim + bonusImpossible
      const qualifyingSections = sortedTableIds.map((tableId, idx) => {
        const { tSlots, advSet, allResultsIn } = tableMetaMap[tableId];
        const count = tSlots.length;
        // 🌍 בונוסים במונדיאל לפי טבלה; אחרת לפי גודל (UCL)
        const WC_BONUS = { T16: 24, T17: 6, T19: 16, T21: 16, T23: 8, T25: 8 };
        const bonusPoints = isWC
          ? (WC_BONUS[tableId] || 0)
          : (count >= 8 ? 16 : count >= 4 ? 12 : count >= 2 ? 6 : 0);
        const cfg = { count, bonus: bonusPoints };

        const prevCompleteTables = sortedTableIds
          .slice(0, idx)
          .map(tid => tableMetaMap[tid])
          .filter(meta => meta.allResultsIn && meta.advSet.size > 0);

        const preds = tSlots.map(q => {
          const disp = getPredDisplay(q.id);
          const norm = normT(disp);
          const isAdv = disp && advSet.has(norm);
          const isElim = disp && !isAdv && (
            allResultsIn ||
            prevCompleteTables.some(prevMeta => !prevMeta.advSet.has(norm))
          );
          return { pred: disp, isAdv, isElim, pts: q.possible_points || 0 };
        });

        const guessedSet = new Set(preds.map(p => normT(p.pred)).filter(Boolean));
        const bonusEarned = allResultsIn && [...advSet].every(t => guessedSet.has(t));

        // ✅ בונוס בלתי אפשרי — יש ניחוש שנפל → אדום עם 0
        const bonusImpossible = !bonusEarned && preds.some(p => p.isElim);

        return {
          tableId,
          tableDesc: tSlots[0]?.table_description || tableId,
          preds, advSet, cfg, bonusEarned, bonusImpossible,
          hasAnyResult: advSet.size > 0,
          allResultsIn,
        };
      });

      setParticipantDetails({ name: participantName, scores: enriched, totalScore, qualifyingSections });
    } catch (error) {
      console.error("Error loading participant details:", error);
      toast({ title: "שגיאה", description: "טעינת הפרטים נכשלה", variant: "destructive" });
    }
    setLoadingDetails(false);
  };

  const handleSort = (column) => {
    if (sortColumn === column) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setSortColumn(column);
      setSortDirection(
        ['current_score','previous_score','score_change','position_change'].includes(column) ? 'desc' : 'asc'
      );
    }
  };

  const getSortedRankings = () => [...rankings].sort((a, b) => {
    if (sortColumn === 'participant_name') {
      const aV = String(a.participant_name || '');
      const bV = String(b.participant_name || '');
      return sortDirection === 'asc' ? aV.localeCompare(bV, 'he') : bV.localeCompare(aV, 'he');
    }
    const aV = Number(a[sortColumn]) || 0;
    const bV = Number(b[sortColumn]) || 0;
    const diff = sortDirection === 'asc' ? aV - bV : bV - aV;
    // 🎁 בשוויון — שובר לפי שם (א-ב עולה), כדי שסדר התצוגה יתאים לחלוקת פרסי המשנה
    if (diff !== 0) return diff;
    return String(a.participant_name || '').localeCompare(String(b.participant_name || ''), 'he');
  });

  const SortIcon = ({ column }) => {
    if (sortColumn !== column)
      return <ArrowUpDown className="w-2.5 h-2.5 md:w-4 md:h-4 opacity-30" />;
    return sortDirection === 'asc'
      ? <ArrowUp   className="w-2.5 h-2.5 md:w-4 md:h-4" style={{ color: 'var(--tp)' }} />
      : <ArrowDown className="w-2.5 h-2.5 md:w-4 md:h-4" style={{ color: 'var(--tp)' }} />;
  };

  const getPositionIcon = (p) => {
    if (p === 1) return <Crown  className="w-5 h-5 text-yellow-400" />;
    if (p === 2) return <Trophy className="w-5 h-5 text-gray-400"   />;
    if (p === 3) return <Trophy className="w-5 h-5 text-orange-400" />;
    return null;
  };

  const getPositionChangeIcon = (c) => {
    if (c > 0) return <TrendingUp   className="w-3 h-3 md:w-4 md:h-4 text-green-400" />;
    if (c < 0) return <TrendingDown className="w-3 h-3 md:w-4 md:h-4 text-red-400"   />;
    return          <Minus         className="w-3 h-3 md:w-4 md:h-4 text-gray-400"  />;
  };

  // 🎁 מיקום ייחודי לפרס הלא-כספי: שוברים שוויון לפי שם (א-ב עולה) רק עבור
  //    מי שמעבר לפרסים הכספיים (current_position ≥ 11). מי שבמקום כספי (1-10)
  //    מקבל כספי ולא נכלל כאן. כך מי ש"במקום 11" בשוויון מתפצל ל-11,12,13...
  //    ומקבל את הפרס של המקום הספציפי. (הפרס הכספי לא מושפע — נשאר מסכם+מחלק.)
  //    ⚠️ ה-hook חייב להיות לפני כל return מותנה (חוקי ה-Hooks).
  const effectivePrizePos = useMemo(() => {
    const beyondCash = rankings.filter(r => (r.current_position || 0) > 10);
    const arr = [...beyondCash].sort((a, b) =>
      (Number(b.current_score) || 0) - (Number(a.current_score) || 0) ||
      String(a.participant_name || '').localeCompare(String(b.participant_name || ''), 'he')
    );
    const map = {};
    const startPos = arr.length ? Math.min(...arr.map(r => r.current_position || 11)) : 11;
    arr.forEach((r, i) => { map[r.participant_name] = startPos + i; });
    return map;
  }, [rankings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen"
        style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--tp)' }} />
        <span className="mr-3" style={{ color: 'var(--tp)' }}>טוען דירוג...</span>
      </div>
    );
  }

  const isAdmin        = currentUser?.role === 'admin' || currentUser?.user_metadata?.role === 'admin';

  // 🎁 החלפת הצגת הפרסים — נשמר ב-DB ומשפיע על כל המשתמשים (מנהל בלבד)
  const togglePrizes = async () => {
    if (!currentGame || !isAdmin) return;
    const next = !showPrizes;
    setShowPrizes(next); // עדכון מיידי בתצוגה
    try {
      await db.Game.update(currentGame.id, { show_prizes: next });
      toast({
        title: next ? 'הפרסים מוצגים' : 'הפרסים מוסתרים',
        description: 'השינוי חל על כל המשתמשים',
        className: 'bg-green-900/30 border-green-500 text-green-200'
      });
    } catch (err) {
      console.error('שגיאה בשמירת הצגת פרסים', err);
      setShowPrizes(!next); // החזרה אם נכשל
      toast({ title: 'שגיאה בשמירה', variant: 'destructive' });
    }
  };
  const sortedRankings = getSortedRankings();
  // 🏆 חישוב פרסים: כמה שותפים בכל מיקום + המיקום האחרון (לאקי לוזר)
  const positionCounts = buildPositionCounts(rankings);
  const lastPosition   = rankings.reduce((mx, r) => Math.max(mx, r.current_position || 0), 0);

  return (
    <div className="min-h-screen p-3 md:p-6" dir="rtl"
      style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)' }}>
      <div className="max-w-7xl mx-auto">

        <div className="flex flex-col md:flex-row justify-between items-start gap-3 mb-4 md:mb-8">
          <div>
            <h1 className="text-xl md:text-4xl font-bold mb-1 md:mb-2 flex items-center gap-2 md:gap-3"
              style={{ color: '#f8fafc', textShadow: '0 0 10px var(--tp-30)' }}>
              <Trophy className="w-6 h-6 md:w-10 md:h-10" style={{ color: 'var(--tp)' }} />
              טבלת דירוג
            </h1>
            <p className="text-xs md:text-base" style={{ color: '#94a3b8' }}>
              מצב העמידה הנוכחי של המשתתפים
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2 md:gap-3 w-full md:w-auto flex-wrap">
              <Button
                onClick={handleSetBaseline}
                disabled={settingBaseline}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 0 20px rgba(16,185,129,0.4)'
                }}
                className="text-white flex-1 md:flex-none h-8 md:h-10 text-[10px] md:text-sm"
              >
                {settingBaseline
                  ? <><Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin ml-1"/>קובע...</>
                  : <><CheckCircle className="w-3 h-3 md:w-4 md:h-4 ml-1"/>קבע דירוג</>}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
          {[
            { label: 'סה"כ משתתפים', value: rankings.length,     icon: Users,       color: 'var(--tp)' },
            { label: 'ניקוד ממוצע',   value: avgScore.toFixed(1), icon: Target,      color: 'var(--tp)' },
            { label: 'ניקוד מקסימלי', value: maxScore.toFixed(1), icon: TrendingUp,  color: '#8b5cf6'   },
            { label: 'ניקוד מינימלי', value: minScore.toFixed(1), icon: TrendingDown,color: '#94a3b8'   },
          ].map((stat, idx) => (
            <Card key={idx} style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', backdropFilter: 'blur(10px)' }}>
              <CardContent className="p-2 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] md:text-sm" style={{ color: '#94a3b8' }}>{stat.label}</p>
                    <p className="text-lg md:text-3xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                  </div>
                  <stat.icon className="w-6 h-6 md:w-10 md:h-10" style={{ color: stat.color, opacity: 0.5 }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card style={{ background: 'var(--bg3-60)', border: '1px solid var(--tp-20)', backdropFilter: 'blur(10px)' }}>
          <CardHeader className="py-2 md:py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm md:text-lg" style={{ color: 'var(--tp)' }}>הדירוג הנוכחי</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {isAdmin && (
                  <button
                    onClick={togglePrizes}
                    className="text-[10px] md:text-xs font-bold rounded-lg transition-colors"
                    style={{
                      padding: '5px 12px',
                      color: showPrizes ? '#fbbf24' : '#94a3b8',
                      background: showPrizes ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${showPrizes ? 'rgba(251,191,36,0.45)' : 'rgba(148,163,184,0.3)'}`,
                      cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >
                    {showPrizes ? '🏆 הסתר פרסים' : '🏆 הצג פרסים'}
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div style={{ maxHeight: '640px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ borderBottom: '2px solid var(--tp-30)' }}>
                    {[
                      { key: 'current_position', label: '#',            mobile: '#',   align: 'center' },
                      { key: 'participant_name',  label: 'שם',           mobile: 'שם',  align: 'right'  },
                      { key: 'current_score',     label: "נק'",          mobile: "נק'", align: 'center' },
                      { key: 'previous_position', label: 'מיקום קודם',  mobile: null,  align: 'center' },
                      { key: 'previous_score',    label: 'ניקוד קודם',  mobile: null,  align: 'center' },
                      { key: 'score_change',      label: 'שינוי בניקוד', mobile: '+/-', align: 'center' },
                      { key: 'position_change',   label: 'שינוי במיקום', mobile: '↕',  align: 'center' },
                      ...(showPrizes ? [{ key: 'prize', label: '🏆 פרס', mobile: '🏆', align: 'center', noSort: true }] : []),
                    ].map(col => (
                      <th
                        key={col.key}
                        className={`px-1.5 py-1.5 md:px-3 md:py-2 ${col.noSort ? '' : 'cursor-pointer hover:bg-cyan-900/20'} transition-colors text-[8px] md:text-xs font-bold uppercase tracking-wide text-${col.align} ${col.mobile === null ? 'hidden md:table-cell' : ''}`}
                        style={{ background: 'linear-gradient(180deg, var(--tp-12), var(--bg3))', color: '#67e8f9', whiteSpace: 'nowrap' }}
                        onClick={col.noSort ? undefined : () => handleSort(col.key)}
                      >
                        <div className={`flex items-center ${col.align === 'right' ? 'justify-start' : 'justify-center'} gap-0.5 md:gap-1.5`}>
                          {col.mobile !== null && col.mobile !== col.label
                            ? <><span className="hidden md:inline">{col.label}</span><span className="md:hidden">{col.mobile}</span></>
                            : <span>{col.label}</span>}
                          {!col.noSort && <SortIcon column={col.key} />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRankings.map((rank, idx) => {
                    const prize = computePrize(rank, positionCounts, lastPosition);
                    const isTop3 = rank.current_position <= 3;
                    return (
                    <tr key={rank.id} className="hover:bg-cyan-500/5 transition-colors"
                      style={{ borderBottom: '1px solid var(--tp-10)', background: isTop3 ? 'rgba(251,191,36,0.05)' : (idx % 2 ? 'rgba(255,255,255,0.015)' : 'transparent') }}>
                      <td className="text-center px-1.5 py-1 md:px-3 md:py-1.5">
                        <div className="flex items-center justify-center gap-0.5 md:gap-1">
                          <span className="hidden md:inline">{getPositionIcon(rank.current_position)}</span>
                          <span className="font-extrabold text-xs md:text-sm" style={{ color: rank.current_position === 1 ? '#fbbf24' : rank.current_position === 2 ? '#cbd5e1' : rank.current_position === 3 ? '#f59e0b' : '#94a3b8' }}>
                            {rank.current_position}
                          </span>
                        </div>
                      </td>
                      <td
                        className="font-semibold text-[10px] md:text-sm cursor-pointer hover:underline text-right px-1.5 py-1 md:px-3 md:py-1.5"
                        style={{ color: '#f1f5f9' }}
                        onClick={() => loadParticipantDetails(rank.participant_name)}
                      >
                        {rank.participant_name}
                      </td>
                      <td className="text-center px-1.5 py-1 md:px-3 md:py-1.5">
                        <span className="font-extrabold text-[11px] md:text-sm" style={{ color: 'var(--tp)' }}>{rank.current_score}</span>
                      </td>
                      <td className="hidden md:table-cell text-center px-3 py-1.5 text-xs" style={{ color: '#64748b' }}>{rank.previous_position || '-'}</td>
                      <td className="hidden md:table-cell text-center px-3 py-1.5 text-xs" style={{ color: '#64748b' }}>{rank.previous_score || '0'}</td>
                      <td className="text-center px-1.5 py-1 md:px-3 md:py-1.5">
                        {rank.score_change > 0  && <span className="text-[9px] md:text-xs font-bold" style={{ color: '#34d399' }}>+{rank.score_change}</span>}
                        {rank.score_change < 0  && <span className="text-[9px] md:text-xs font-bold" style={{ color: '#f87171' }}>{rank.score_change}</span>}
                        {(!rank.score_change || rank.score_change === 0) && <span className="text-[9px] md:text-xs" style={{ color: '#475569' }}>—</span>}
                      </td>
                      <td className="text-center px-1.5 py-1 md:px-3 md:py-1.5">
                        <div className="flex items-center justify-center gap-0.5">
                          {getPositionChangeIcon(rank.position_change)}
                          <span className={`font-semibold text-[9px] md:text-xs ${rank.position_change > 0 ? 'text-green-400' : rank.position_change < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {rank.position_change !== 0 ? Math.abs(rank.position_change) : '—'}
                          </span>
                        </div>
                      </td>
                      {showPrizes && (
                      <td className="text-center px-1.5 py-1 md:px-3 md:py-1.5" style={{ whiteSpace: 'nowrap' }}>
                        {prize.lucky
                          ? <span title="לאקי לוזר — מחזיר את דמי ההשתתפות 🃏" className="text-[9px] md:text-xs font-bold" style={{ color: '#a78bfa' }}>{fmtPrize(prize.amount)} 🃏</span>
                          : prize.amount > 0
                            ? <span className="text-[10px] md:text-sm font-extrabold" style={{ color: '#fbbf24' }} title={prize.share > 1 ? `מתחלק בין ${prize.share} שותפים` : ''}>
                                {fmtPrize(prize.amount)}{prize.share > 1 ? <span className="text-[8px] md:text-[10px]" style={{ color: '#94a3b8' }}> (÷{prize.share})</span> : null}
                              </span>
                            : (() => {
                                const ncp = nonCashPrizeForPos(effectivePrizePos[rank.participant_name]);
                                return ncp
                                  ? <span onClick={() => setPrizeView(ncp)} title="לחץ לפרטי הפרס" className="text-[11px] md:text-sm font-bold" style={{ color: ncp.color, cursor: 'pointer', whiteSpace: 'nowrap' }}>{ncp.short}</span>
                                  : <span className="text-[9px] md:text-xs" style={{ color: '#475569' }}>—</span>;
                              })()}
                      </td>
                      )}
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={selectedParticipant !== null}
        onOpenChange={() => { setSelectedParticipant(null); setParticipantDetails(null); }}
      >
        <DialogContent
          dir="rtl"
          className="[&>button]:left-4 [&>button]:right-auto [&>button]:top-4"
          style={{
            maxWidth: '52vw', width: '52vw',
            maxHeight: '82vh', height: '82vh',
            display: 'flex', flexDirection: 'column',
            background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg3) 100%)',
            border: '1px solid var(--tp-20)',
            boxShadow: '0 0 30px var(--tp-25)',
            borderRadius: '14px', padding: '0', overflow: 'hidden',
          }}
        >
          <DialogHeader style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--tp-20)', flexShrink: 0 }}>
            <DialogTitle style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', textAlign: 'right', marginBottom: '8px' }}>
              {selectedParticipant}
            </DialogTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
              {loadingDetails ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: 'var(--tp)' }} />
                  <span style={{ fontSize: '0.9rem', color: 'var(--tp)' }}>מחשב ניקוד עדכני...</span>
                </div>
              ) : (
                <>
                  <Badge style={{ background: 'var(--tp)', color: 'white', fontSize: '1rem', fontWeight: 700, padding: '5px 16px', borderRadius: '999px' }}>
                    סה"כ: {participantDetails?.totalScore} נקודות
                  </Badge>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    {participantDetails?.scores?.length || 0} שאלות עם ניקוד
                  </span>
                </>
              )}
            </div>
          </DialogHeader>

          <div style={{ flex: 1, overflow: 'auto', padding: '4px 0 8px' }}>
            {loadingDetails ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px' }}>
                <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--tp)' }} />
              </div>
            ) : (
              <>
              {participantDetails?.qualifyingSections?.filter(s => s.hasAnyResult).length > 0 && (
                <div style={{ padding:'8px 16px 4px' }}>
                  {participantDetails.qualifyingSections.filter(s => s.hasAnyResult).map(sec => {
                    const { bonusEarned, bonusImpossible } = sec;

                    // ✅ צבע וטקסט בונוס:
                    // ירוק = הרוויח | אדום = אי אפשר (bonusImpossible) או כל תוצאות ידועות ולא הרוויח | אפור = עדיין לא ידוע
                    const bonusBg = bonusEarned
                      ? '#059669'
                      : (sec.allResultsIn || bonusImpossible)
                        ? '#dc2626'
                        : 'rgba(100,116,139,0.3)';
                    const bonusText = bonusEarned
                      ? `🏆 +${sec.cfg.bonus}`
                      : (sec.allResultsIn || bonusImpossible)
                        ? `בונוס: 0/${sec.cfg.bonus}`
                        : `בונוס: ?/${sec.cfg.bonus}`;

                    return (
                      <div key={sec.tableId} style={{ marginBottom:'12px', background:'rgba(30,41,59,0.5)', border:'1px solid var(--tp-20)', borderRadius:'10px', padding:'10px 12px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                          <span style={{ fontSize:'0.82rem', fontWeight:700, color:'#f97316' }}>📋 {sec.tableDesc}</span>
                          <span style={{ fontSize:'0.75rem', padding:'2px 8px', borderRadius:'999px', background: bonusBg, color:'white', fontWeight:700 }}>
                            {bonusText}
                          </span>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'4px' }}>
                          {sec.preds.map((p, i) => {
                            const icon  = p.pred ? (p.isAdv ? '✅' : p.isElim ? '❌' : '❓') : '—';
                            const color = p.isAdv ? '#34d399' : p.isElim ? '#f87171' : '#94a3b8';
                            const bg    = p.isAdv ? 'rgba(16,185,129,0.10)' : p.isElim ? 'rgba(239,68,68,0.08)' : 'rgba(15,23,42,0.3)';

                            // ✅ ניקוד: isElim → 0 (גם בלי תוצאת אמת בשלב הנוכחי)
                            const score = !p.pred
                              ? `?/${p.pts}`
                              : p.isAdv
                                ? `+${p.pts}`
                                : p.isElim
                                  ? '0'
                                  : `?/${p.pts}`;

                            return (
                              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 8px', borderRadius:'6px', background: bg, border:`1px solid ${p.isAdv ? 'rgba(16,185,129,0.25)' : p.isElim ? 'rgba(239,68,68,0.20)' : 'rgba(71,85,105,0.3)'}` }}>
                                <span style={{ fontSize:'0.82rem', color, fontWeight: p.isAdv ? 700 : 400 }}>{icon} {p.pred || <span style={{color:'#475569'}}>—</span>}</span>
                                <span style={{ fontSize:'0.72rem', fontWeight:700, color: p.isAdv ? '#34d399' : p.isElim ? '#f87171' : '#64748b', marginRight:'6px' }}>{score}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ height:'1px', background:'var(--tp-15)', margin:'4px 0 8px' }}/>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    {[
                      { label: 'טבלה',  w: '64px'  },
                      { label: 'מס׳',   w: '54px'  },
                      { label: 'שאלה',  w: 'auto'  },
                      { label: 'ניחוש', w: '110px' },
                      { label: 'תוצאה', w: '80px'  },
                      { label: 'ניקוד', w: '74px'  },
                    ].map(h => (
                      <th key={h.label} style={{ width: h.w, background: 'var(--bg1)', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textAlign: 'center', padding: '8px 6px', letterSpacing: '0.04em', borderBottom: '1px solid var(--tp-15)' }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {participantDetails?.scores?.map((s, i) => {

                    if (s.isStageBonusRow) {
                      return (
                        <tr key={i} style={{ background: 'rgba(16,185,129,0.08)', borderRight: '3px solid #10b981' }}>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', border: '1px solid #10b981', color: '#10b981', background: 'rgba(16,185,129,0.1)' }}>{s.table_id}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.85rem' }}>🏆</td>
                          <td colSpan={3} style={{ padding: '8px 6px', textAlign: 'right' }}>
                            <span style={{ color: '#6ee7b7', fontSize: '0.88rem', fontWeight: 600 }}>{s.question_text}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', background: '#059669', color: 'white', fontSize: '0.85rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' }}>+{s.score}</span>
                          </td>
                        </tr>
                      );
                    }

                    if (s.isLocationSummary) {
                      return (
                        <tr key={i} style={{ background: 'rgba(249,115,22,0.08)', borderRight: '3px solid #f97316' }}>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', border: '1px solid #f97316', color: '#f97316', background: 'rgba(249,115,22,0.1)' }}>{s.table_id}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>📋</td>
                          <td colSpan={3} style={{ padding: '8px 6px', textAlign: 'right' }}>
                            <span style={{ color: '#fdba74', fontSize: '0.88rem', fontWeight: 600 }}>{s.question_text}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', background: '#ea580c', color: 'white', fontSize: '0.85rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' }}>+{s.score}</span>
                          </td>
                        </tr>
                      );
                    }

                    let badgeBg = '#475569';
                    if (s.score === s.max_score && s.max_score > 0) badgeBg = '#16a34a';
                    else if (s.score >= 7)  badgeBg = '#2563eb';
                    else if (s.score > 0)   badgeBg = '#ca8a04';

                    return (
                      <tr key={i}
                        style={{ background: 'rgba(30,41,59,0.5)', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.045)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(30,41,59,0.5)'}
                      >
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', border: '1px solid var(--tp)', color: 'var(--tp)', background: 'var(--tp-10)' }}>{s.table_id}</span>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', border: '1px solid var(--tp)', color: 'var(--tp)', background: 'var(--tp-10)' }}>{s.question_id_display}</span>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                          {s.home_team && s.away_team ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.88rem', color: '#f1f5f9' }}>
                              <span>{s.home_team_display || s.home_team}</span>
                              {s.home_team_logo && <img src={s.home_team_logo} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} onError={e => e.target.style.display = 'none'} />}
                              <span style={{ color: '#475569', fontSize: '0.78rem' }}>נגד</span>
                              {s.away_team_logo && <img src={s.away_team_logo} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} onError={e => e.target.style.display = 'none'} />}
                              <span>{s.away_team_display || s.away_team}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.88rem', color: '#f1f5f9' }}>{s.question_text}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.88rem', color: '#94a3b8' }}>{s.prediction || '—'}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.88rem', color: '#f1f5f9', fontWeight: 600 }}>{s.actual_result || '—'}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: badgeBg, color: 'white', fontSize: '0.85rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', minWidth: '52px', textAlign: 'center' }}>
                            {s.score}/{s.max_score}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 🎁 חלון צף — תיאור מלא של פרס לא-כספי */}
      <Dialog open={!!prizeView} onOpenChange={(o) => { if (!o) setPrizeView(null); }}>
        <DialogContent className="[&>button]:left-4 [&>button]:right-auto [&>button]:top-4" style={{ background: '#0b1220', border: `1px solid ${prizeView?.color || '#334155'}66`, maxWidth: 400 }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#f8fafc', textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: prizeView?.color, fontWeight: 700, marginBottom: 4 }}>
                🎁 פרס · {prizeView?.min === prizeView?.max ? `מקום ${prizeView?.min}` : `מקומות ${prizeView?.min}–${prizeView?.max}`}
              </span>
              {prizeView?.title}
            </DialogTitle>
          </DialogHeader>
          <div style={{ padding: 14, borderRadius: 10, background: `${prizeView?.color || '#334155'}12`, border: `1px solid ${prizeView?.color || '#334155'}33` }}>
            <p style={{ fontSize: '0.92rem', color: '#e2e8f0', lineHeight: 1.6, margin: 0, textAlign: 'right' }}>{prizeView?.full}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
