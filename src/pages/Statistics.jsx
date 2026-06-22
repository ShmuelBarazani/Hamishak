import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Users, Target, Loader2, PieChart, TrendingUp,
  Award, AlertTriangle, Trophy, Brain, Zap, Star, ThumbsUp, ThumbsDown, Copy
} from "lucide-react";
import {
  PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer,
  Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useGame } from "@/components/contexts/GameContext";
import { useToast } from "@/components/ui/use-toast";
import html2canvas from "html2canvas";

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];

// 🌍 מונדיאל 2026
const WC_GAME_ID = '30032806-6216-496f-ac32-fb628e181742';

const ADVANCING_CONFIG = { T4:{count:8,bonus:16}, T5:{count:4,bonus:12}, T6:{count:2,bonus:6} };

// 📅 מיפוי קשיח של כל ימי מונדיאל 2026 → שלב (גם בלי משחקים מזוהים)
const WC_STAGE_BY_DAY = (() => {
  const m = {};
  const add = (mon, from, to, stage) => { for (let d = from; d <= to; d++) m[`${mon}-${d}`] = stage; };
  add(6, 11, 27, 'שלב הבתים');
  add(6, 28, 30, 'שלב 1/16');
  add(7, 1, 3,  'שלב 1/16');
  add(7, 4, 7,  'שמינית הגמר');
  add(7, 9, 11, 'רבע הגמר');
  add(7, 14, 15,'חצי הגמר');
  add(7, 18, 18,'משחק על המקום השלישי');
  add(7, 19, 19,'הגמר 🏆');
  return m;
})();

// 💼 קבוצות מקצוע — לפי סדר בדיקה (הראשון שתואם מנצח)
const PROFESSION_GROUPS = [
  { name:'כספים וכלכלה 💰',     keywords:['רו"ח','רו״ח','רואה חשבון','רואי חשבון','כלכלן','קלקלן','כספים','חשב','בנק','שוק ההון','השקעות','ביטוח','גזבר','פנסיוני','פיננס','נדל"ן','נדל״ן'] },
  { name:'הייטק וטכנולוגיה 💻', keywords:['מתכנת','תוכנה','מפתח','it','אינטל','intel','הייטק','היי טק','הייטקס','דאטה','אנליסט','r&d','מערכות מידע','טכנולוגיה','qa','סייבר','אפליסט'] },
  { name:'הנדסה 🛠️',            keywords:['מהנדס','מהנדל','הנדסאי','אדריכל'] },
  { name:'משפטים ⚖️',           keywords:['עורך דין','עו"ד','עו״ד','שופט','משפט'] },
  { name:'חינוך והוראה 🎓',     keywords:['מורה','מחנך','הוראה','מרצה','גננת','אנגלית'] },
  { name:'ביטחון וחירום 🪖',    keywords:['חייל','צה"ל','צה״ל','כבאי','שוטר','כוחות הביטחון','טייס','קצין','לוכד עריקים','מסווג'] },
  { name:'בריאות וטיפול 🩺',    keywords:['רופא','פסיכולוג','וטרינר','מטפל','רפואה','אח ','פיזיותרפ'] },
  { name:'סטודנטים ותלמידים 📚',keywords:['סטודנט','תלמיד'] },
  { name:'חקלאות וטבע 🌾',      keywords:['רפתן','רועה','כוורן','דייג','כבשים','חקלא'] },
  { name:'ספורט ⚽',             keywords:['מאמן','כדורגלן','כדורסל','מגן ימני','קפטן','ספורט'] },
  { name:'יצירה ועיצוב 🎨',     keywords:['מעצב','במאי','עורך וידאו','מתופף','דוגמן','צלם','מוזיק'] },
  { name:'ניהול ותפעול 📦',     keywords:['מנהל','סמנכ','דיירקטור','מנכ"ל','מנכ״ל','לוגיסטיקה','רכש','תפעול','ייצוא','שיווק','מרקטינג','מכירות','bd','עצמאי','בעלים','מסעדן'] },
  { name:'כפיים ושירותים 🔧',   keywords:['סנדלר','פחח','בנאי','נהג','דוור','הנדימן','מציל','הסעות','שיער','מסגר','חשמלאי','אינסטלטור','שיפוצ'] },
];
const OTHER_PROF_GROUP = 'מקצועות אחרים ויצירתיים 🃏';
const classifyProfession = raw => {
  if (!raw || !raw.trim()) return null;
  const t = raw.trim().toLowerCase().replace(/[״"]/g, '"');
  for (const g of PROFESSION_GROUPS) {
    if (g.keywords.some(k => t.includes(k.toLowerCase().replace(/[״"]/g, '"')))) return g.name;
  }
  return OTHER_PROF_GROUP;
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const NC = new Map(), CC = new Map(), PC = new Map();
const normalizeTeam = n => { if(!n) return n; if(NC.has(n)) return NC.get(n); const r=n.replace(/קרבאך/g,'קרבאח').replace(/קראבח/g,'קרבאח').replace(/קראבך/g,'קרבאח').trim(); NC.set(n,r); return r; };
const cleanTeam    = n => { if(!n) return n; if(CC.has(n)) return CC.get(n); const r=n.replace(/\s*\([^)]+\)\s*$/,'').trim(); CC.set(n,r); return r; };
const normPred     = s => s ? s.replace(/\s+/g,'').trim() : '';
// 🆕 מסיר קידומת "בית " מתשובות בית (למשל "בית ב" → "ב") — ממזג כפילויות ומנקה את התווית.
//    בטוח: תופס רק מחרוזת שמתחילה ב-"בית" + רווח, ולכן לא נוגע ב-"בית" (ניצחון בית) או בשמות נבחרות/תוצאות.
const stripGroupPrefix = a => String(a == null ? '' : a).replace(/^בית\s+/, '').trim();
const parseQId     = id => { if(!id) return 0; if(PC.has(id)) return PC.get(id); const r=parseFloat(id.replace(/[^\d.]/g,''))||0; PC.set(id,r); return r; };
const pct          = (n,d) => d>0 ? ((n/d)*100).toFixed(1) : '0.0';
const extractCountry = name => { const m=name?.match(/\(([^)]+)\)$/); return m?m[1]:null; };

// 📅 חילוץ תאריך מטקסט בפורמט "18/6 - 19:00" (יוני-יולי בלבד)
const parseMatchDate = txt => {
  if(!txt) return null;
  const s = String(txt);
  const m = s.match(/(\d{1,2})\/(\d{1,2})/);
  if(!m) return null;
  const day=+m[1], mon=+m[2];
  if(mon<6||mon>7||day<1||day>31) return null;
  // חילוץ שעה — תומך ב-HH:MM או HH.MM, עם מפריד אופציונלי (-, –, רווח)
  let time='';
  const tm = s.match(/(\d{1,2})[:\.](\d{2})/);
  if(tm){ const h=+tm[1], mm=tm[2]; if(h>=0&&h<=23) time=`${String(h).padStart(2,'0')}:${mm}`; }
  return { day, mon, time, key:`${mon}-${day}` };
};

const alternateSlice = data => {
  if(!data||data.length<=2) return data;
  const s=[...data].sort((a,b)=>(b.value||b.count||0)-(a.value||a.count||0));
  const mid=Math.ceil(s.length/2), L=s.slice(0,mid), R=s.slice(mid).reverse(), res=[];
  for(let i=0;i<Math.max(L.length,R.length);i++){if(i<L.length)res.push(L[i]);if(i<R.length)res.push(R[i]);}
  return res;
};

// ⚡ טעינה מקבילית — count ואז כל הצ'אנקים בבת אחת (פי ~20 מהיר יותר)
const PRED_COLS = 'id,question_id,participant_name,text_prediction,home_prediction,away_prediction,created_at';
const loadAllPreds = async gameId => {
  try {
    const { count, error: cErr } = await supabase.from('predictions')
      .select('id', { count: 'exact', head: true }).eq('game_id', gameId);
    if (cErr) throw cErr;
    if (!count) return [];
    const CHUNK = 1000;
    const jobs = [];
    for (let from = 0; from < count; from += CHUNK) {
      jobs.push(
        supabase.from('predictions').select(PRED_COLS).eq('game_id', gameId)
          .order('id', { ascending: true })
          .range(from, Math.min(from + CHUNK - 1, count - 1))
      );
    }
    const results = await Promise.all(jobs);
    let all = [];
    for (const r of results) {
      if (r.error) throw r.error;
      if (r.data?.length) all = all.concat(r.data);
    }
    if (all.length > 0) return all;
  } catch (e) { console.warn('parallel predictions fetch failed, falling back:', e.message); }
  // fallback סדרתי
  let allFb=[],off=0;const seen=new Set();let mx=80;
  while(mx-->0){const b=await db.Prediction.filter({game_id:gameId},null,1000,off);if(!b?.length)break;const n=b.filter(p=>!seen.has(p.id));if(!n.length)break;n.forEach(p=>seen.add(p.id));allFb=allFb.concat(n);if(b.length<1000)break;off+=1000;}
  return allFb;
};

const loadAllRankings = async gameId => {
  try {
    const { count, error: cErr } = await supabase.from('rankings')
      .select('participant_name', { count: 'exact', head: true }).eq('game_id', gameId);
    if (cErr) throw cErr;
    if (!count) return [];
    const CHUNK = 500;
    const jobs = [];
    for (let from = 0; from < count; from += CHUNK) {
      jobs.push(supabase.from('rankings').select('*').eq('game_id', gameId)
        .order('participant_name', { ascending: true })
        .range(from, Math.min(from + CHUNK - 1, count - 1)));
    }
    const results = await Promise.all(jobs);
    let all = [];
    for (const r of results) { if (!r.error && r.data?.length) all = all.concat(r.data); }
    return all;
  } catch (e) { console.warn('rankings fetch failed:', e.message); return []; }
};

// ─── Participant Panel (click-to-lock) ────────────────────────────────────────
function ParticipantPanel({ title, subtitle, count, percentage, participants, color, onClose }) {
  return (
    <div onClick={e=>e.stopPropagation()} style={{
      background:'rgba(10,15,26,0.97)', border:`2px solid ${color}`,
      borderRadius:10, padding:'12px 14px', margin:'10px 0', position:'relative',
    }}>
      <button onClick={onClose} style={{position:'absolute',top:8,left:8,background:'rgba(148,163,184,0.15)',border:'none',borderRadius:'50%',width:24,height:24,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#94a3b8',fontSize:14}}>✕</button>
      <div style={{marginBottom:8,paddingLeft:30}}>
        <span style={{color,fontWeight:700,fontSize:'0.9rem'}}>{title}</span>
        {subtitle&&<span style={{color:'#94a3b8',fontSize:'0.78rem',marginRight:8}}>{subtitle}</span>}
        <Badge style={{marginRight:8,background:color,color:'#fff',fontSize:'0.75rem',padding:'1px 8px'}}>
          {count}{percentage?` (${percentage}%)`:''}
        </Badge>
      </div>
      {participants.length>0?(
        <div style={{display:'flex',flexWrap:'wrap',gap:5,maxHeight:180,overflowY:'auto'}}>
          {participants.map((n,i)=><span key={i} style={{background:'#1e293b',color:'#f8fafc',padding:'3px 8px',borderRadius:4,fontSize:'0.78rem'}}>{n}</span>)}
        </div>
      ):<p style={{color:'#64748b',fontSize:'0.8rem'}}>אין משתתפים</p>}
    </div>
  );
}

// ─── AI Insights engine ───────────────────────────────────────────────────────
function computeInsights(allQuestions, allPredictions, teams, myPredByQid = {}) {
  const insights = [];
  if (!allPredictions.length || !allQuestions.length) return insights;

  const qById = Object.fromEntries(allQuestions.map(q=>[q.id,q]));
  const formatAns = a => a==null?'-':String(a).includes('-')&&/^\d+-\d+$/.test(String(a).trim())?String(a).split('-').map(x=>x.trim()).join(' - '):String(a);

  const latestPred = {};
  allPredictions.forEach(p => {
    const key = `${p.participant_name}_${p.question_id}`;
    const ex  = latestPred[key];
    if (!ex || new Date(p.created_at) > new Date(ex.created_at)) latestPred[key] = p;
  });
  const preds = Object.values(latestPred).map(p => {
    if ((!p.text_prediction || p.text_prediction === "") && p.home_prediction != null && p.away_prediction != null)
      return { ...p, text_prediction: `${p.home_prediction}-${p.away_prediction}` };
    return p;
  });

  const participants = [...new Set(preds.map(p=>p.participant_name))];
  const matchQs   = allQuestions.filter(q=>q.home_team&&q.away_team&&q.table_id!=='T1');
  const textQs    = allQuestions.filter(q=>!q.home_team&&!q.away_team&&q.table_id!=='T1');

  // ── 1. הטיית בית/חוץ/תיקו ──────────────────────────────────────────────
  if (matchQs.length > 0) {
    let homeW=0, draw=0, awayW=0, total=0;
    const qIds = new Set(matchQs.map(q=>q.id));
    preds.forEach(p=>{
      if(!qIds.has(p.question_id)||!p.text_prediction) return;
      const parts=p.text_prediction.split('-').map(x=>parseInt(x.trim()));
      if(parts.length!==2||isNaN(parts[0])||isNaN(parts[1])) return;
      total++;
      if(parts[0]>parts[1]) homeW++; else if(parts[0]<parts[1]) awayW++; else draw++;
    });
    if(total>0) {
      insights.push({
        id:'home_bias', icon:'⚽', title:'הטיית בית/חוץ/תיקו',
        category:'כללי',
        color:'#3b82f6',
        summary:`${pct(homeW,total)}% מהניחושים הם ניצחון בית — האם המנחשים אוהבים בית?`,
        chartData:[{name:'ניצחון בית',value:homeW,pct:parseFloat(pct(homeW,total))},{name:'תיקו',value:draw,pct:parseFloat(pct(draw,total))},{name:'ניצחון חוץ',value:awayW,pct:parseFloat(pct(awayW,total))}],
        chartType:'pie',
        detail:`מתוך ${total.toLocaleString()} ניחושי משחק: ${homeW.toLocaleString()} ניצחון בית (${pct(homeW,total)}%), ${draw.toLocaleString()} תיקו (${pct(draw,total)}%), ${awayW.toLocaleString()} ניצחון חוץ (${pct(awayW,total)}%)`,
      });
    }
  }

  // ── 2. יחס כן/לא ───────────────────────────────────────────────────────
  {
    const yesNoQIds = new Set(allQuestions.filter(q=>q.validation_list?.includes('כן_לא')||q.validation_list?.includes('כן/לא')).map(q=>q.id));
    let yes=0,no=0;
    preds.forEach(p=>{
      if(!yesNoQIds.has(p.question_id)) return;
      const v=p.text_prediction?.trim();
      if(v==='כן') yes++; else if(v==='לא') no++;
    });
    if(yes+no>0){
      insights.push({
        id:'yes_no', icon:'👍', title:'אופטימיות לעומת ספקנות',
        category:'כללי',
        color:'#f59e0b',
        summary:`${pct(yes,yes+no)}% מהניחושים "כן" — המנחשים ${yes>no?'אופטימיים':'פסימיים'}`,
        chartData:[{name:'כן ✅',value:yes},{name:'לא ❌',value:no}],
        chartType:'pie',
        detail:`מתוך ${yes+no} תשובות כן/לא: ${yes} כן (${pct(yes,yes+no)}%) לעומת ${no} לא (${pct(no,yes+no)}%). ${yes>no?'המנחשים נוטים לאופטימיות ונוחים להמר על "כן".':'המנחשים ספקנים ומעדיפים להגן על עצמם.'}`,
      });
    }
  }

  // ── 3. קונצנזוס לעומת מחלוקת ──────────────────────────────────────────
  {
    const qAgreement = [];
    allQuestions.filter(q=>q.table_id!=='T1').forEach(q=>{
      const qPreds = preds.filter(p => p.question_id === q.id && p.text_prediction?.trim());
      if (qPreds.length < 3) return;
      const counts = {};
      qPreds.forEach(p => { const v = p.text_prediction.trim(); counts[v] = (counts[v]||0)+1; });
      const vals = Object.values(counts);
      if (vals.length === 0) return;
      const top = Math.max(...vals);
      const [topAnswer] = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
      qAgreement.push({
        q, agreement: top/qPreds.length,
        topAnswer, total: qPreds.length, topCount: top,
        uniqueAnswers: vals.length
      });
    });
    qAgreement.sort((a,b)=>b.agreement-a.agreement);
    const highConsensus = qAgreement.slice(0,3);
    const byDiversity = [...qAgreement].sort((a,b)=>b.uniqueAnswers-a.uniqueAnswers);
    const highDispute  = byDiversity.slice(0,3);
    if (qAgreement.length > 0) {
      insights.push({
        id:'consensus', icon:'🤝', title:'קונצנזוס ומחלוקת',
        category:'ניתוח קהל',
        color:'#8b5cf6',
        summary:`הכי מוסכמת: ${(highConsensus[0]?.agreement*100||0).toFixed(0)}% הסכמה | הכי מגוונת: ${highDispute[0]?.uniqueAnswers||0} תשובות שונות`,
        consensusData: highConsensus.map(d=>({
          question: (d.q.home_team&&d.q.away_team) ? `${cleanTeam(d.q.home_team)} נגד ${cleanTeam(d.q.away_team)}` : (d.q.question_text||d.q.stage_name||`שאלה ${d.q.question_id}`),
          agreement: (d.agreement*100).toFixed(0),
          topAnswer: formatAns(d.topAnswer), total: d.total, topCount: d.topCount,
          myPick: myPredByQid[d.q.id] ? formatAns(myPredByQid[d.q.id]) : null
        })),
        disputeData: highDispute.map(d=>({
          question: (d.q.home_team&&d.q.away_team) ? `${cleanTeam(d.q.home_team)} נגד ${cleanTeam(d.q.away_team)}` : (d.q.question_text||d.q.stage_name||`שאלה ${d.q.question_id}`),
          agreement: (d.agreement*100).toFixed(0),
          topAnswer: formatAns(d.topAnswer), total: d.total, topCount: d.topCount, uniqueAnswers: d.uniqueAnswers,
          myPick: myPredByQid[d.q.id] ? formatAns(myPredByQid[d.q.id]) : null
        })),
        chartType:'consensus',
        detail:`נותחו ${qAgreement.length} שאלות. שאלות בעלות הסכמה גבוהה מלמדות על קונצנזוס. שאלות עם ריבוי תשובות מלמדות על אי-ודאות.`,
      });
    }
  }

  // ── 4. אינדיווידואליסטים לעומת עדר ─────────────────────────────────────
  {
    const qAnswerPop = {};
    allQuestions.filter(q=>q.table_id!=='T1').forEach(q=>{
      const qPreds=preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim());
      if(qPreds.length<5) return;
      const total=qPreds.length, counts={};
      qPreds.forEach(p=>{const v=p.text_prediction.trim();counts[v]=(counts[v]||0)+1;});
      qAnswerPop[q.id]={total, counts};
    });
    const participantRarity = {};
    preds.forEach(p=>{
      if(!p.text_prediction?.trim()) return;
      const pop=qAnswerPop[p.question_id];
      if(!pop) return;
      const cnt=pop.counts[p.text_prediction.trim()]||1;
      const rarity=1-(cnt/pop.total);
      if(!participantRarity[p.participant_name]) participantRarity[p.participant_name]={sum:0,count:0};
      participantRarity[p.participant_name].sum+=rarity;
      participantRarity[p.participant_name].count++;
    });
    const sorted=Object.entries(participantRarity)
      .filter(([,v])=>v.count>5)
      .map(([name,v])=>({name,avgRarity:(v.sum/v.count)*100}))
      .sort((a,b)=>b.avgRarity-a.avgRarity);
    if(sorted.length>0){
      const topOutsider=sorted[0];
      const topFollower=sorted[sorted.length-1];
      insights.push({
        id:'outsiders', icon:'🦄', title:'מי הולך נגד הזרם?',
        category:'ניתוח משתתפים',
        color:'#ec4899',
        summary:`${topOutsider.name} הכי "חתול שׁועל" — ${topOutsider.avgRarity.toFixed(0)}% מהניחושים שלו נדירים. ${topFollower.name} הכי "כבשה" — הולך עם הרוב.`,
        chartData:sorted.slice(0,10).map(d=>({name:d.name,value:parseFloat(d.avgRarity.toFixed(0))})),
        chartType:'bar_h',
        detail:'לכל ניחוש בודקים כמה אנשים אחרים בחרו אותו ערך. "נדירות" גבוהה = המשתתף בוחר תשובות מקוריות שמעטים בוחרים (אאוטסיידר/הימורים נועזים). נדירות נמוכה = בוחר תמיד את התשובה הפופולרית (הולך בטוח עם הקהל). הציון בגרף = אחוז הנדירות הממוצע על פני כל הניחושים שלו.',
        bottomData:sorted.slice(-5).reverse().map(d=>({name:d.name,value:parseFloat(d.avgRarity.toFixed(1))})),
      });
    }
  }

  // ── 5. דיוק העדר ──────────────────────────────────────────────────────
  {
    let herdRight=0, herdWrong=0;
    const herdDetails=[];
    allQuestions.filter(q=>q.table_id!=='T1'&&q.actual_result?.trim()&&q.actual_result!=='__CLEAR__').forEach(q=>{
      const qPreds=preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim());
      if(qPreds.length<5) return;
      const counts={};
      qPreds.forEach(p=>{const v=normPred(p.text_prediction.trim());counts[v]=(counts[v]||0)+1;});
      const [topAnswer,topCount]=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
      const actual=normPred(q.actual_result.trim());
      const isRight=topAnswer===actual;
      if(isRight) herdRight++; else herdWrong++;
      herdDetails.push({q,topAnswer,topCount,actual:q.actual_result,isRight,total:qPreds.length});
    });
    if(herdRight+herdWrong>0){
      insights.push({
        id:'herd_accuracy', icon:'🎯', title:'האם לעדר יש צדק?',
        category:'ניתוח קהל',
        color:'#14b8a6',
        summary:`בתשובות שיש תוצאה: העדר צדק ב-${pct(herdRight,herdRight+herdWrong)}% מהמקרים`,
        chartData:[{name:'העדר צדק ✅',value:herdRight},{name:'העדר טעה ❌',value:herdWrong}],
        chartType:'pie',
        detail:`מתוך ${herdRight+herdWrong} שאלות שיש להן תוצאה: העדר (הניחוש הפופולרי ביותר) היה נכון ${herdRight} פעמים (${pct(herdRight,herdRight+herdWrong)}%).`,
        examples:herdDetails.filter(d=>!d.isRight).slice(0,3).map(d=>({
          question:d.q.question_text||`שאלה ${d.q.question_id}`,
          topAnswer:d.topAnswer, actual:d.actual, topCount:d.topCount, total:d.total
        })),
      });
    }
  }

  // ── 6. המנחשים המפתיעים ──────────────────────────────────────────────
  {
    const surpriseScore = {};
    allQuestions.filter(q=>q.table_id!=='T1'&&q.actual_result?.trim()&&q.actual_result!=='__CLEAR__').forEach(q=>{
      const qPreds=preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim());
      if(qPreds.length<5) return;
      const total=qPreds.length, actual=normPred(q.actual_result.trim());
      const correctPreds=qPreds.filter(p=>normPred(p.text_prediction.trim())===actual);
      if(correctPreds.length===0) return;
      const rarity=1-(correctPreds.length/total);
      correctPreds.forEach(p=>{
        if(!surpriseScore[p.participant_name]) surpriseScore[p.participant_name]={score:0,count:0};
        surpriseScore[p.participant_name].score+=rarity;
        surpriseScore[p.participant_name].count++;
      });
    });
    const sorted=Object.entries(surpriseScore)
      .filter(([,v])=>v.count>=2)
      .map(([name,v])=>({name,score:v.score,count:v.count,avgSurprise:(v.score/v.count*100).toFixed(1)}))
      .sort((a,b)=>b.score-a.score)
      .slice(0,8);
    if(sorted.length>0){
      insights.push({
        id:'surprising', icon:'🌟', title:'המנחשים המפתיעים',
        category:'ניתוח משתתפים',
        color:'#f97316',
        summary:`${sorted[0].name} מוביל בניחושים נכונים כנגד הזרם — ${sorted[0].count} פעמים!`,
        chartData:sorted.map(d=>({name:d.name,value:d.count,avgSurprise:parseFloat(d.avgSurprise)})),
        chartType:'bar_h',
        detail:'ניקוד גבוה = ניחש נכון שאלות שמעט אנשים אחרים ניחשו נכון.',
      });
    }
  }

  // ── 7. שיאני הסיכון ───────────────────────────────────────────────────
  {
    const riskScore = {};
    const matchQIds = new Set(matchQs.map(q=>q.id));
    preds.forEach(p=>{
      if(!matchQIds.has(p.question_id)||!p.text_prediction?.trim()) return;
      const parts=p.text_prediction.split('-').map(x=>parseInt(x.trim()));
      if(parts.length!==2||isNaN(parts[0])||isNaN(parts[1])) return;
      const totalGoals=parts[0]+parts[1];
      const diff=Math.abs(parts[0]-parts[1]);
      const riskLevel=totalGoals+diff;
      if(!riskScore[p.participant_name]) riskScore[p.participant_name]={sum:0,count:0,examples:[]};
      riskScore[p.participant_name].sum+=riskLevel;
      riskScore[p.participant_name].count++;
      if(riskLevel>=7) riskScore[p.participant_name].examples.push(p.text_prediction);
    });
    const sorted=Object.entries(riskScore)
      .filter(([,v])=>v.count>3)
      .map(([name,v])=>({name,avg:v.sum/v.count,count:v.count,examples:v.examples.slice(0,3)}))
      .sort((a,b)=>b.avg-a.avg)
      .slice(0,8);
    if(sorted.length>0){
      insights.push({
        id:'risk_takers', icon:'🎲', title:'שיאני הסיכון',
        category:'ניתוח משתתפים',
        color:'#ef4444',
        summary:`${sorted[0].name} מהמר הכי הרבה על תוצאות קיצוניות (ממוצע ${sorted[0].avg.toFixed(1)})`,
        chartData:sorted.map(d=>({name:d.name,value:parseFloat(d.avg.toFixed(2))})),
        chartType:'bar_h',
        detail:'ציון גבוה = נוטה לנחש תוצאות עם הרבה שערים והפרש גדול (כמו 4-0, 5-1).',
      });
    }
  }

  // ── 8. ממוצע שערים ────────────────────────────────────────────────────
  if(matchQs.length>0){
    let predGoals=0, predCount=0, actualGoals=0, actualCount=0;
    const matchQIds=new Set(matchQs.map(q=>q.id));
    preds.forEach(p=>{
      if(!matchQIds.has(p.question_id)||!p.text_prediction?.trim()) return;
      const parts=p.text_prediction.split('-').map(x=>parseInt(x.trim()));
      if(parts.length===2&&!isNaN(parts[0])&&!isNaN(parts[1])){predGoals+=parts[0]+parts[1];predCount++;}
    });
    matchQs.forEach(q=>{
      if(!q.actual_result?.trim()||q.actual_result==='__CLEAR__') return;
      const parts=q.actual_result.split('-').map(x=>parseInt(x.trim()));
      if(parts.length===2&&!isNaN(parts[0])&&!isNaN(parts[1])){actualGoals+=parts[0]+parts[1];actualCount++;}
    });
    if(predCount>0){
      const avgPred=(predGoals/predCount).toFixed(2);
      const avgActual=actualCount>0?(actualGoals/actualCount).toFixed(2):null;
      insights.push({
        id:'goals_avg', icon:'⚡', title:'ממוצע שערים — ציפיות לעומת מציאות',
        category:'ניתוח משחקים',
        color:'#06b6d4',
        summary:`ממוצע מנוחש: ${avgPred} שערים למשחק${avgActual?` | בפועל: ${avgActual}`:''}`,
        chartData:[
          {name:'ממוצע ניחושים',value:parseFloat(avgPred)},
          ...(avgActual?[{name:'ממוצע בפועל',value:parseFloat(avgActual)}]:[]),
        ],
        chartType:'bar',
        detail:`המנחשים ניחשו ממוצע של ${avgPred} שערים למשחק${avgActual?`. בפועל היו ${avgActual} שערים.`:'. (עדיין אין תוצאות להשוואה)'}`,
      });
    }
  }

  // ── 9. הנביא ──────────────────────────────────────────────────────────
  {
    const correctCount = {};
    allQuestions.filter(q=>q.actual_result?.trim()&&q.actual_result!=='__CLEAR__'&&q.table_id!=='T1').forEach(q=>{
      const actual=normPred(q.actual_result.trim());
      preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim()).forEach(p=>{
        const name=p.participant_name;
        if(!correctCount[name]) correctCount[name]={correct:0,total:0};
        correctCount[name].total++;
        if(normPred(p.text_prediction.trim())===actual) correctCount[name].correct++;
      });
    });
    const sorted=Object.entries(correctCount)
      .filter(([,v])=>v.total>=5)
      .map(([name,v])=>({name,correct:v.correct,total:v.total,pct:parseFloat(pct(v.correct,v.total))}))
      .sort((a,b)=>b.pct-a.pct)
      .slice(0,10);
    if(sorted.length>0){
      insights.push({
        id:'prophet', icon:'🔮', title:'הנביא — דיוק כולל',
        category:'ניתוח משתתפים',
        color:'#a855f7',
        summary:`${sorted[0].name} מוביל בדיוק: ${sorted[0].correct}/${sorted[0].total} נכון (${sorted[0].pct}%)`,
        chartData:sorted.map(d=>({name:d.name,value:d.pct,correct:d.correct,total:d.total})),
        chartType:'bar_h',
        detail:'אחוז הניחושים הנכונים מסך כל השאלות שיש להן תוצאת אמת.',
      });
    }
  }

  // ── 10. מחויבות ──────────────────────────────────────────────────────
  // ── 🆕 11. שאלות הרצח 💀 ─────────────────────────────────────────────
  {
    const hard=[];
    allQuestions.filter(q=>q.table_id!=='T1'&&q.actual_result?.trim()&&q.actual_result!=='__CLEAR__').forEach(q=>{
      const qPreds=preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim());
      if(qPreds.length<10) return;
      const actual=normPred(q.actual_result.trim());
      const heroes=qPreds.filter(p=>normPred(p.text_prediction.trim())===actual).map(p=>p.participant_name);
      hard.push({q,total:qPreds.length,correct:heroes.length,rate:heroes.length/qPreds.length,heroes});
    });
    hard.sort((a,b)=>a.rate-b.rate);
    const top=hard.slice(0,5).filter(h=>h.rate<0.2);
    if(top.length>0){
      insights.push({
        id:'murder', icon:'💀', title:'שאלות הרצח',
        category:'אחרי תוצאות',
        color:'#ef4444',
        summary:`השאלה הקשה ביותר: רק ${pct(top[0].correct,top[0].total)}% צדקו — ${top[0].correct} גאונים מתוך ${top[0].total}`,
        chartType:'murder',
        murderData:top.map(h=>({
          question:(h.q.home_team&&h.q.away_team)?`${cleanTeam(h.q.home_team)} נגד ${cleanTeam(h.q.away_team)}`:(h.q.question_text||`שאלה ${h.q.question_id}`),
          actual:h.q.actual_result, correct:h.correct, total:h.total, pctVal:pct(h.correct,h.total),
          heroes:h.heroes.slice(0,15),
        })),
        detail:'השאלות עם אחוז הפגיעה הנמוך ביותר במערכת — והבודדים שצדקו בהן.',
      });
    }
  }

  // ── 🆕 12. מזל או חוכמה — בולים מול כיוונים 🍀 ──────────────────────
  {
    const split={};
    const sign=x=>x[0]>x[1]?1:x[0]<x[1]?-1:0;
    matchQs.filter(q=>q.actual_result?.trim()&&q.actual_result!=='__CLEAR__').forEach(q=>{
      const ap=q.actual_result.split('-').map(x=>parseInt(x.trim()));
      if(ap.length!==2||isNaN(ap[0])||isNaN(ap[1])) return;
      preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim()).forEach(p=>{
        const pp=p.text_prediction.split('-').map(x=>parseInt(x.trim()));
        if(pp.length!==2||isNaN(pp[0])||isNaN(pp[1])) return;
        const name=p.participant_name;
        if(!split[name]) split[name]={bull:0,dir:0};
        if(pp[0]===ap[0]&&pp[1]===ap[1]) split[name].bull++;
        else if(sign(pp)===sign(ap)) split[name].dir++;
      });
    });
    const arr=Object.entries(split)
      .map(([name,v])=>({name,bull:v.bull,dir:v.dir,score:v.bull*10+v.dir*5}))
      .filter(d=>d.score>0)
      .sort((a,b)=>b.score-a.score)
      .slice(0,12);
    if(arr.length>0){
      insights.push({
        id:'luck', icon:'🍀', title:'מזל או חוכמה — בולים מול כיוונים',
        category:'ניתוח משתתפים',
        color:'#84cc16',
        summary:`${arr[0].name} מוביל בניקוד משחקים: ${arr[0].bull} בולים 🎯 ו-${arr[0].dir} כיוונים ↗`,
        chartType:'stacked',
        stackedData:arr,
        detail:'בול = תוצאה מדויקת (10 נק׳). כיוון = מנצחת/תיקו נכון בלבד (5 נק׳). מי בנוי על דיוק ומי על כיוונים?',
      });
    }
  }

  // ── 🆕 13. תאומי ניחושים 👥 ─────────────────────────────────────────
  {
    const byPart={};
    preds.forEach(p=>{
      if(!p.text_prediction?.trim()) return;
      if(!byPart[p.participant_name]) byPart[p.participant_name]={};
      byPart[p.participant_name][p.question_id]=normPred(p.text_prediction.trim());
    });
    const names=Object.keys(byPart).filter(n=>Object.keys(byPart[n]).length>=40);
    const sims=[];
    for(let i=0;i<names.length;i++){
      const a=byPart[names[i]];
      const aKeys=Object.keys(a);
      for(let j=i+1;j<names.length;j++){
        const b=byPart[names[j]];
        let same=0,both=0;
        for(let k=0;k<aKeys.length;k++){
          const key=aKeys[k], bv=b[key];
          if(bv!==undefined){both++;if(a[key]===bv)same++;}
        }
        if(both>=40) sims.push({a:names[i],b:names[j],sim:same/both,both});
      }
    }
    if(sims.length>0){
      sims.sort((x,y)=>y.sim-x.sim);
      const avg={};
      sims.forEach(s=>{
        if(!avg[s.a])avg[s.a]={sum:0,c:0}; if(!avg[s.b])avg[s.b]={sum:0,c:0};
        avg[s.a].sum+=s.sim;avg[s.a].c++; avg[s.b].sum+=s.sim;avg[s.b].c++;
      });
      const loners=Object.entries(avg).map(([name,v])=>({name,avgSim:v.sum/v.c})).sort((a,b)=>a.avgSim-b.avgSim);
      insights.push({
        id:'twins', icon:'👥', title:'תאומי ניחושים',
        category:'ניתוח קהל',
        color:'#f97316',
        summary:`${sims[0].a} ו-${sims[0].b} הכי דומים: ${(sims[0].sim*100).toFixed(1)}% ניחושים זהים! הזאב הבודד: ${loners[0]?.name||'-'}`,
        chartType:'twins',
        twinsData:sims.slice(0,8).map(s=>({pair:`${s.a} + ${s.b}`,simPct:(s.sim*100).toFixed(1),both:s.both})),
        lonersData:loners.slice(0,5).map(l=>({name:l.name,simPct:(l.avgSim*100).toFixed(1)})),
        detail:'זוגות המשתתפים עם אחוז הניחושים הזהים הגבוה ביותר — האם העתיקו זה מזה? 😄 והזאבים הבודדים שלא דומים לאף אחד.',
      });
    }
  }

  // ── 🆕 14. דיוק בולים לפי בית 🎯 ────────────────────────────────────
  {
    const houseAcc={};
    allQuestions.filter(q=>q.stage_name?.startsWith('בית')&&q.home_team&&q.actual_result?.trim()&&q.actual_result!=='__CLEAR__').forEach(q=>{
      const actual=normPred(q.actual_result.trim());
      const qPreds=preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim());
      if(!qPreds.length) return;
      const correct=qPreds.filter(p=>normPred(p.text_prediction.trim())===actual).length;
      if(!houseAcc[q.stage_name]) houseAcc[q.stage_name]={correct:0,total:0};
      houseAcc[q.stage_name].correct+=correct;
      houseAcc[q.stage_name].total+=qPreds.length;
    });
    const arr=Object.entries(houseAcc).map(([name,v])=>({name,value:parseFloat(pct(v.correct,v.total)),correct:v.correct,total:v.total})).sort((a,b)=>b.value-a.value);
    if(arr.length>=2){
      insights.push({
        id:'house_acc', icon:'🎯', title:'דיוק בולים לפי בית',
        category:'ניתוח משחקים',
        color:'#06b6d4',
        summary:`הכי קל לנחש את ${arr[0].name} (${arr[0].value}% בולים) | הכי קשה: ${arr[arr.length-1].name} (${arr[arr.length-1].value}%)`,
        chartData:arr,
        chartType:'bar_h',
        detail:'אחוז הבולים מכלל הניחושים בכל בית שהושלמו בו משחקים — איפה הקהל קולע ואיפה מפספס.',
      });
    }
  }

  // ── 🆕 15. פילוח לפי מקצוע 💼 ──────────────────────────────────────
  {
    const profQ = allQuestions.find(q=>q.table_id==='T1'&&(q.question_text||'').includes('מקצוע'));
    if(profQ){
      const groups={};
      preds.filter(p=>p.question_id===profQ.id&&p.text_prediction?.trim()).forEach(p=>{
        const g=classifyProfession(p.text_prediction);
        if(!g) return;
        if(!groups[g]) groups[g]={count:0,members:[]};
        groups[g].count++;
        groups[g].members.push({name:p.participant_name,raw:p.text_prediction.trim()});
      });
      const arr=Object.entries(groups).map(([name,v])=>({name,value:v.count,members:v.members.sort((a,b)=>a.name.localeCompare(b.name,'he'))})).sort((a,b)=>b.value-a.value);
      const totalProf=arr.reduce((s,d)=>s+d.value,0);
      if(arr.length>=2){
        insights.push({
          id:'professions', icon:'💼', title:'פילוח המשתתפים לפי מקצוע',
          category:'ניתוח משתתפים',
          color:'#0ea5e9',
          summary:`הקבוצה הגדולה: ${arr[0].name} עם ${arr[0].value} משתתפים (${pct(arr[0].value,totalProf)}%)`,
          chartType:'profession',
          professionData:arr,
          detail:`${totalProf} משתתפים מילאו מקצוע. הסיווג אוטומטי לפי מילות מפתח — לחץ על קבוצה לרשימת החברים והמקצוע המקורי שלהם.`,
        });
      }
    }
  }

  // ── 🆕 16. פילוח לפי גיל 🎂 (אינטרוולים של 5 שנים, 7 עמודות) ──────────
  {
    const ageQ = allQuestions.find(q=>q.table_id==='T1'&&(q.question_text||'').includes('גיל'));
    if(ageQ){
      // 7 דליים: <25, 25-29, 30-34, 35-39, 40-44, 45-49, 50+
      const buckets=[
        {label:'עד 24',min:0,max:24},
        {label:'25–29',min:25,max:29},
        {label:'30–34',min:30,max:34},
        {label:'35–39',min:35,max:39},
        {label:'40–44',min:40,max:44},
        {label:'45–49',min:45,max:49},
        {label:'50+',min:50,max:200},
      ];
      const members=buckets.map(()=>[]);
      let valid=0, sum=0;
      preds.filter(p=>p.question_id===ageQ.id&&p.text_prediction?.trim()).forEach(p=>{
        const age=parseInt(String(p.text_prediction).replace(/[^\d]/g,''));
        if(isNaN(age)||age<5||age>120) return;
        valid++; sum+=age;
        const bi=buckets.findIndex(b=>age>=b.min&&age<=b.max);
        if(bi>=0) members[bi].push({name:p.participant_name,age});
      });
      if(valid>=3){
        const avg=(sum/valid).toFixed(1);
        const chartData=buckets.map((b,i)=>({name:b.label,value:members[i].length,members:members[i].sort((a,b)=>a.age-b.age)}));
        const biggest=chartData.reduce((a,b)=>b.value>a.value?b:a);
        insights.push({
          id:'ages', icon:'🎂', title:'פילוח המשתתפים לפי גיל',
          category:'ניתוח משתתפים',
          color:'#ec4899',
          summary:`גיל ממוצע: ${avg} • הקבוצה הגדולה: ${biggest.name} (${biggest.value} משתתפים)`,
          chartType:'agebars',
          ageData:chartData,
          detail:`${valid} משתתפים מילאו גיל. החלוקה לקבוצות גיל בקפיצות של 5 שנים. לחץ על עמודה לרשימת המשתתפים והגילאים.`,
        });
      }
    }
  }

  // 🔝 פילוחי המשתתפים (גיל + מקצוע) לראש הרשימה
  const TOP_ORDER = ['ages','professions'];
  insights.sort((a,b)=>{
    const ai=TOP_ORDER.indexOf(a.id), bi=TOP_ORDER.indexOf(b.id);
    if(ai!==-1||bi!==-1) return (ai===-1?99:ai)-(bi===-1?99:bi);
    return 0;
  });

  return insights;
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insight }) {
  const [expanded, setExpanded] = useState(false);

  const [profOpen, setProfOpen] = useState(null);

  const renderChart = () => {
    // 💼 professions — ברים לחיצים עם רשימת חברים
    if (insight.chartType === 'profession') {
      const max = Math.max(...insight.professionData.map(d=>d.value),1);
      return (
        <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:8}}>
          {insight.professionData.map((d,i)=>(
            <div key={i}>
              <div onClick={()=>setProfOpen(profOpen===d.name?null:d.name)} style={{display:'grid',gridTemplateColumns:'minmax(150px,42%) 1fr 34px',gap:8,alignItems:'center',cursor:'pointer',padding:'3px 4px',borderRadius:6,background:profOpen===d.name?'rgba(14,165,233,0.12)':'transparent'}}>
                <span style={{fontSize:'0.8rem',color:'#f8fafc',fontWeight:profOpen===d.name?700:400}}>{d.name}</span>
                <div style={{height:14,borderRadius:4,overflow:'hidden',background:'rgba(255,255,255,0.04)'}}>
                  <div style={{width:`${(d.value/max)*100}%`,height:'100%',background:COLORS[i%COLORS.length],borderRadius:4}}></div>
                </div>
                <span style={{fontSize:'0.74rem',color:'#94a3b8',textAlign:'left',fontWeight:700}}>{d.value}</span>
              </div>
              {profOpen===d.name&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:4,padding:'6px 8px',background:'rgba(10,15,26,0.6)',borderRadius:6,margin:'3px 0 5px',border:'1px solid rgba(14,165,233,0.25)'}}>
                  {d.members.map((m,k)=><span key={k} title={m.raw} style={{background:'#1e293b',color:'#f8fafc',padding:'3px 8px',borderRadius:4,fontSize:'0.72rem'}}>{m.name} <span style={{color:'#64748b'}}>({m.raw})</span></span>)}
                </div>
              )}
            </div>
          ))}
          <p style={{color:'#475569',fontSize:'0.68rem',marginTop:2}}>לחץ על קבוצה לרשימת המשתתפים</p>
        </div>
      );
    }

    // 🎂 age bars — 7 עמודות גיל, לחיצות
    if (insight.chartType === 'agebars') {
      const max = Math.max(...insight.ageData.map(d=>d.value),1);
      return (
        <div style={{marginTop:8}}>
          <div dir="ltr" style={{display:'flex',alignItems:'flex-end',gap:6,height:170,padding:'0 4px'}}>
            {insight.ageData.map((d,i)=>(
              <div key={i} onClick={()=>setProfOpen(profOpen===d.name?null:d.name)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',cursor:'pointer'}}>
                <span style={{fontSize:'0.72rem',color:'#f8fafc',fontWeight:700,marginBottom:3}}>{d.value}</span>
                <div style={{width:'100%',height:`${(d.value/max)*120}px`,minHeight:d.value>0?4:0,background:profOpen===d.name?'#f472b6':COLORS[i%COLORS.length],borderRadius:'5px 5px 0 0',transition:'all 0.15s'}}></div>
                <span style={{fontSize:'0.62rem',color:'#94a3b8',marginTop:4,direction:'rtl'}}>{d.name}</span>
              </div>
            ))}
          </div>
          {profOpen&&insight.ageData.find(d=>d.name===profOpen)&&(
            <div style={{display:'flex',flexWrap:'wrap',gap:4,padding:'8px 8px 2px',marginTop:8,borderTop:'1px solid #1e293b'}}>
              {insight.ageData.find(d=>d.name===profOpen).members.map((m,k)=>(
                <span key={k} style={{background:'#1e293b',color:'#f8fafc',padding:'3px 8px',borderRadius:4,fontSize:'0.72rem'}}>{m.name} <span style={{color:'#64748b'}}>({m.age})</span></span>
              ))}
            </div>
          )}
          <p style={{color:'#475569',fontSize:'0.68rem',marginTop:6}}>לחץ על עמודה לרשימת המשתתפים</p>
        </div>
      );
    }

    // 💀 murder list
    if (insight.chartType === 'murder') {
      return (
        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
          {insight.murderData?.map((d,i)=>(
            <div key={i} style={{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.28)',borderRadius:8,padding:'8px 10px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{color:'#f8fafc',fontSize:'0.84rem',fontWeight:600,flex:1}}>{d.question?.slice(0,60)}</span>
                <Badge style={{background:'#dc2626',color:'#fff',fontSize:'0.72rem'}}>{d.pctVal}% בלבד</Badge>
              </div>
              <p style={{color:'#94a3b8',fontSize:'0.74rem',marginTop:3}}>תוצאה: <b style={{color:'#fde68a'}}>{d.actual}</b> • צדקו {d.correct}/{d.total}</p>
              {d.heroes.length>0&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:5}}>
                  {d.heroes.map((h,k)=><span key={k} style={{background:'rgba(16,185,129,0.15)',color:'#6ee7b7',padding:'2px 7px',borderRadius:4,fontSize:'0.7rem'}}>🌟 {h}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    // 🍀 stacked bulls/directions
    if (insight.chartType === 'stacked') {
      const max = Math.max(...insight.stackedData.map(d=>d.score),1);
      return (
        <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:8}}>
          <div style={{display:'flex',gap:12,fontSize:'0.68rem',color:'#94a3b8',justifyContent:'center',marginBottom:2}}>
            <span><span style={{display:'inline-block',width:10,height:10,background:'#84cc16',borderRadius:2,marginLeft:4,verticalAlign:'middle'}}></span>בולים (10)</span>
            <span><span style={{display:'inline-block',width:10,height:10,background:'#3b82f6',borderRadius:2,marginLeft:4,verticalAlign:'middle'}}></span>כיוונים (5)</span>
          </div>
          {insight.stackedData.map((d,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'110px 1fr 60px',gap:6,alignItems:'center'}}>
              <span style={{fontSize:'0.76rem',color:'#f8fafc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</span>
              <div style={{display:'flex',height:16,borderRadius:4,overflow:'hidden',background:'rgba(255,255,255,0.04)'}}>
                <div style={{width:`${(d.bull*10/max)*100}%`,background:'#84cc16'}} title={`${d.bull} בולים`}></div>
                <div style={{width:`${(d.dir*5/max)*100}%`,background:'#3b82f6'}} title={`${d.dir} כיוונים`}></div>
              </div>
              <span style={{fontSize:'0.7rem',color:'#94a3b8',textAlign:'left'}}>{d.bull}🎯 {d.dir}↗</span>
            </div>
          ))}
        </div>
      );
    }

    // 👥 twins
    if (insight.chartType === 'twins') {
      return (
        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
          <div>
            <p style={{color:'#fb923c',fontWeight:700,fontSize:'0.8rem',marginBottom:5}}>👥 הזוגות הכי דומים:</p>
            {insight.twinsData?.map((d,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(249,115,22,0.07)',border:'1px solid rgba(249,115,22,0.22)',borderRadius:6,padding:'5px 9px',marginBottom:3}}>
                <span style={{color:'#f8fafc',fontSize:'0.78rem'}}>{d.pair}</span>
                <Badge style={{background:'#ea580c',color:'#fff',fontSize:'0.7rem'}}>{d.simPct}% זהים</Badge>
              </div>
            ))}
          </div>
          <div>
            <p style={{color:'#94a3b8',fontWeight:700,fontSize:'0.8rem',marginBottom:5}}>🐺 הזאבים הבודדים:</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {insight.lonersData?.map((d,i)=><span key={i} style={{background:'rgba(100,116,139,0.15)',color:'#cbd5e1',padding:'3px 8px',borderRadius:4,fontSize:'0.74rem'}}>{d.name} ({d.simPct}%)</span>)}
            </div>
          </div>
        </div>
      );
    }

    if (insight.chartType === 'consensus') {
      return (
        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
          <div>
            <p style={{color:'#10b981',fontWeight:700,fontSize:'0.8rem',marginBottom:6}}>🤝 הכי מוסכמות:</p>
            {insight.consensusData?.map((d,i)=>(
              <div key={i} style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.25)',borderRadius:6,padding:'6px 10px',marginBottom:4}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{color:'#f8fafc',fontSize:'0.82rem',flex:1,marginLeft:8}}>{d.question?.slice(0,50)}</span>
                  <Badge style={{background:'#059669',color:'#fff',fontSize:'0.72rem'}}>{d.agreement}% הסכמה</Badge>
                </div>
                <p style={{color:'#94a3b8',fontSize:'0.72rem',marginTop:2}}>"{d.topAnswer}" — {d.topCount}/{d.total}</p>
                {d.myPick!=null && (
                  <div style={{marginTop:4,display:'inline-flex',alignItems:'center',gap:5,background:'rgba(6,182,212,0.14)',border:'1px solid rgba(6,182,212,0.4)',borderRadius:5,padding:'2px 8px'}}>
                    <span style={{fontSize:'0.68rem',color:'#67e8f9',fontWeight:700}}>ההימור שלי:</span>
                    <span style={{fontSize:'0.74rem',color:'#f8fafc',fontWeight:600}}>{d.myPick}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div>
            <p style={{color:'#ef4444',fontWeight:700,fontSize:'0.8rem',marginBottom:6}}>⚡ הכי שנויות במחלוקת:</p>
            {insight.disputeData?.map((d,i)=>(
              <div key={i} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:6,padding:'6px 10px',marginBottom:4}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{color:'#f8fafc',fontSize:'0.82rem',flex:1,marginLeft:8}}>{d.question?.slice(0,50)}</span>
                  <Badge style={{background:'#dc2626',color:'#fff',fontSize:'0.72rem'}}>{d.agreement}% הסכמה</Badge>
                </div>
                <p style={{color:'#94a3b8',fontSize:'0.72rem',marginTop:2}}>"{d.topAnswer}" מוביל עם {d.topCount}/{d.total}</p>
                {d.myPick!=null && (
                  <div style={{marginTop:4,display:'inline-flex',alignItems:'center',gap:5,background:'rgba(6,182,212,0.14)',border:'1px solid rgba(6,182,212,0.4)',borderRadius:5,padding:'2px 8px'}}>
                    <span style={{fontSize:'0.68rem',color:'#67e8f9',fontWeight:700}}>ההימור שלי:</span>
                    <span style={{fontSize:'0.74rem',color:'#f8fafc',fontWeight:600}}>{d.myPick}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (!insight.chartData || insight.chartData.length === 0) return null;

    if (insight.chartType === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <RechartsPieChart>
            <Pie data={insight.chartData} cx="50%" cy="50%" outerRadius={80} dataKey="value" labelLine={false}
              label={({name,value,cx,cy,midAngle,outerRadius})=>{
                const R=Math.PI/180, r=outerRadius*0.65;
                const x=cx+r*Math.cos(-midAngle*R), y=cy+r*Math.sin(-midAngle*R);
                const tot=insight.chartData.reduce((s,d)=>s+d.value,0);
                const p=tot>0?((value/tot)*100).toFixed(0):'0';
                return <g><text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'11px',fontWeight:'bold'}}>{p}%</text></g>;
              }}>
              {insight.chartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Pie>
            <Tooltip content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:`1px solid ${insight.color}`,borderRadius:6,padding:'8px 12px'}}><p style={{color:insight.color,fontWeight:700}}>{payload[0].payload.name}</p><p style={{color:'#f8fafc'}}>{payload[0].value.toLocaleString()}</p></div>:null}/>
          </RechartsPieChart>
        </ResponsiveContainer>
      );
    }

    if (insight.chartType === 'bar_h') {
      return (
        <div dir="ltr">
        <ResponsiveContainer width="100%" height={Math.max(180, insight.chartData.length*32)}>
          <BarChart data={insight.chartData} layout="vertical" margin={{top:4,right:50,left:0,bottom:4}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false}/>
            <XAxis type="number" stroke="#94a3b8" tick={{fontSize:10,fill:'#94a3b8'}}/>
            <YAxis type="category" dataKey="name" width={130} interval={0} stroke="#334155" tick={{fontSize:11,fill:'#f8fafc'}}/>
            <Tooltip content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:`1px solid ${insight.color}`,borderRadius:6,padding:'8px 12px'}}><p style={{color:insight.color,fontWeight:700}}>{payload[0].payload.name}</p><p style={{color:'#f8fafc'}}>{payload[0].value}</p></div>:null}/>
            <Bar dataKey="value" radius={[0,6,6,0]} label={{position:'right',fill:'#94a3b8',fontSize:10,formatter:v=>v}}>
              {insight.chartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      );
    }

    if (insight.chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={insight.chartData} margin={{top:10,right:20,left:0,bottom:10}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
            <XAxis dataKey="name" stroke="#94a3b8" interval={0} tick={{fontSize:11,fill:'#94a3b8'}}/>
            <YAxis stroke="#94a3b8" tick={{fontSize:10,fill:'#94a3b8'}}/>
            <Tooltip content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:`1px solid ${insight.color}`,borderRadius:6,padding:'8px 12px'}}><p style={{color:insight.color,fontWeight:700}}>{payload[0].payload.name}</p><p style={{color:'#f8fafc'}}>{payload[0].value}</p></div>:null}/>
            <Bar dataKey="value" radius={[6,6,0,0]}>
              {insight.chartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  return (
    <Card style={{background:'rgba(20,28,44,0.85)',border:`1px solid ${insight.color}40`,borderRadius:12}}>
      <CardHeader style={{paddingBottom:8}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10,flex:1}}>
            <span style={{fontSize:'1.6rem'}}>{insight.icon}</span>
            <div>
              <CardTitle style={{color:insight.color,fontSize:'1rem',fontWeight:700}}>{insight.title}</CardTitle>
              <Badge style={{background:`${insight.color}20`,color:insight.color,border:`1px solid ${insight.color}50`,fontSize:'0.68rem',marginTop:4}}>{insight.category}</Badge>
            </div>
          </div>
        </div>
        <p style={{color:'#cbd5e1',fontSize:'0.88rem',marginTop:8,fontWeight:500}}>{insight.summary}</p>
      </CardHeader>
      <CardContent style={{paddingTop:0}}>
        {renderChart()}

        {expanded && (
          <>
            <p style={{color:'#94a3b8',fontSize:'0.82rem',marginTop:8,borderTop:'1px solid #1e293b',paddingTop:8}}>{insight.detail}</p>
            {insight.examples && insight.examples.length > 0 && (
              <div style={{marginTop:8}}>
                <p style={{color:'#64748b',fontSize:'0.75rem',marginBottom:4}}>דוגמאות לטעויות העדר:</p>
                {insight.examples.map((ex,i)=>(
                  <div key={i} style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'5px 8px',marginBottom:3}}>
                    <span style={{color:'#fca5a5',fontSize:'0.78rem'}}>{ex.question?.slice(0,40)}: עדר={ex.topAnswer} ({ex.topCount}/{ex.total}), בפועל={ex.actual}</span>
                  </div>
                ))}
              </div>
            )}
            {insight.bottomData && (
              <div style={{marginTop:8}}>
                <p style={{color:'#64748b',fontSize:'0.75rem',marginBottom:4}}>הכי עוקבי עדר:</p>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {insight.bottomData.map((d,i)=>(
                    <Badge key={i} style={{background:'rgba(59,130,246,0.15)',color:'#93c5fd',border:'1px solid rgba(59,130,246,0.3)',fontSize:'0.75rem'}}>{d.name}: {d.value}%</Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <button onClick={()=>setExpanded(e=>!e)} style={{background:'none',border:'none',color:'#475569',fontSize:'0.78rem',cursor:'pointer',marginTop:6,padding:'2px 0'}}>
          {expanded ? '▲ פחות' : '▼ פרטים נוספים'}
        </button>
      </CardContent>
    </Card>
  );
}

// ─── SpecialTeamListChart ─────────────────────────────────────────────────────
function TeamListBarChart({ chartData, participantsMap, panelKey, accent, lockedPanel, lockPanel, closePanel, compact }) {
  const total = chartData.reduce((s, d) => s + d.count, 0);
  return (
    <>
      {lockedPanel[panelKey] && (
        <ParticipantPanel
          title={lockedPanel[panelKey].title}
          count={lockedPanel[panelKey].count}
          percentage={lockedPanel[panelKey].percentage}
          participants={lockedPanel[panelKey].participants}
          color={accent}
          onClose={() => closePanel(panelKey)}
        />
      )}
      {chartData.length > 0 ? (
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={Math.max(compact ? 280 : 400, chartData.length * (compact ? 26 : 34))}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 56, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="team" width={compact ? 130 : 190} interval={0} stroke="#334155" tick={{ fontSize: compact ? 11 : 12, fill: '#f8fafc', fontFamily: 'Rubik,Heebo,sans-serif' }} />
              <Tooltip
                cursor={{ fill: `${accent}14` }}
                content={({ payload }) => payload?.[0] ? (
                  <div style={{ background: '#0a0f1a', border: `1px solid ${accent}`, borderRadius: 6, padding: '8px 12px', pointerEvents: 'none' }}>
                    <p style={{ color: accent, fontWeight: 700, fontSize: '0.85rem' }}>{payload[0].payload.team}</p>
                    <p style={{ color: '#f8fafc', fontSize: '0.8rem' }}>{payload[0].value} בחירות ({total > 0 ? ((payload[0].value / total) * 100).toFixed(1) : 0}%)</p>
                    <p style={{ color: '#64748b', fontSize: '0.7rem', marginTop: 2 }}>לחץ לנעילה</p>
                  </div>
                ) : null}
              />
              <Bar
                dataKey="count"
                radius={[0, 6, 6, 0]}
                label={{ position: 'right', fill: '#94a3b8', fontSize: 11, formatter: v => v }}
                onClick={data => {
                  const p2 = total > 0 ? ((data.count / total) * 100).toFixed(1) : 0;
                  lockPanel(panelKey, { title: data.team, count: data.count, percentage: p2, participants: participantsMap[data.team] || [], color: accent });
                }}
              >
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ cursor: 'pointer' }} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-12" style={{ color: '#94a3b8' }}>אין נתונים עדיין</div>
      )}
    </>
  );
}

function SpecialTeamListChart({ table, qualifierData, lockedPanel, lockPanel, closePanel }) {
  const { chartData, advCount, participantsMap, isGroupLeaders, winnersData, runnersData } = qualifierData;

  // 🆕 T16 — שלושה גרפים נפרדים: ראש בית, סגנית, ומשולב
  if (isGroupLeaders && winnersData && runnersData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* גרף 1 — ראש בית */}
        <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(16,185,129,0.4)' }}>
          <CardHeader>
            <CardTitle style={{ color: '#10b981' }}>🥇 ראש בית — מי תסיים ראשונה בבית</CardTitle>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>12 חריצים • לחץ על קבוצה לנעילת רשימה</p>
          </CardHeader>
          <CardContent className="px-2 pb-6">
            <TeamListBarChart chartData={winnersData.chartData} participantsMap={winnersData.participantsMap}
              panelKey={`special_qual_${table.id}_win`} accent="#10b981" compact
              lockedPanel={lockedPanel} lockPanel={lockPanel} closePanel={closePanel} />
          </CardContent>
        </Card>
        {/* גרף 2 — סגנית */}
        <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(245,158,11,0.4)' }}>
          <CardHeader>
            <CardTitle style={{ color: '#f59e0b' }}>🥈 סגנית — מי תסיים שנייה בבית</CardTitle>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>12 חריצים • לחץ על קבוצה לנעילת רשימה</p>
          </CardHeader>
          <CardContent className="px-2 pb-6">
            <TeamListBarChart chartData={runnersData.chartData} participantsMap={runnersData.participantsMap}
              panelKey={`special_qual_${table.id}_run`} accent="#f59e0b" compact
              lockedPanel={lockedPanel} lockPanel={lockPanel} closePanel={closePanel} />
          </CardContent>
        </Card>
        {/* גרף 3 — משולב (הקיים) */}
        <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(139,92,246,0.35)' }}>
          <CardHeader>
            <CardTitle style={{ color: '#8b5cf6' }}>📋 משולב — ראש בית + סגנית יחד</CardTitle>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>{advCount} חריצים • ניתוח כולל ללא תלות במיקום • לחץ על קבוצה לנעילת רשימה</p>
          </CardHeader>
          <CardContent className="px-2 pb-6">
            <TeamListBarChart chartData={chartData} participantsMap={participantsMap}
              panelKey={`special_qual_${table.id}`} accent="#8b5cf6" compact
              lockedPanel={lockedPanel} lockPanel={lockPanel} closePanel={closePanel} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ברירת מחדל — גרף יחיד (כל שאר רשימות העולות)
  return (
    <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(139,92,246,0.35)' }}>
      <CardHeader>
        <CardTitle style={{ color: '#8b5cf6' }}>📋 {table.description}</CardTitle>
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
          {advCount} חריצים • ניתוח כולל ללא תלות במיקום • לחץ על קבוצה לנעילת רשימה
        </p>
      </CardHeader>
      <CardContent className="px-2 pb-6">
        <TeamListBarChart chartData={chartData} participantsMap={participantsMap}
          panelKey={`special_qual_${table.id}`} accent="#8b5cf6"
          lockedPanel={lockedPanel} lockPanel={lockPanel} closePanel={closePanel} />
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
function StatsParticipantSelect({ participants, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState(null);
  const ref = React.useRef(null);
  const listRef = React.useRef(null);
  const updatePos = React.useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);
  const openList = () => { updatePos(); setOpen(true); };
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          listRef.current && !listRef.current.contains(e.target)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePos();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); };
  }, [open, updatePos]);
  const filtered = React.useMemo(() => {
    const q = query.trim();
    if (!q) return participants;
    return participants.filter(p => p.includes(q));
  }, [participants, query]);
  useEffect(() => { setHighlight(0); }, [query]);
  useEffect(() => {
    if (listRef.current) { const el = listRef.current.children[highlight]; if (el) el.scrollIntoView({ block: 'nearest' }); }
  }, [highlight, open]);
  const choose = (name) => { onSelect(name); setQuery(''); setOpen(false); };
  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { openList(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) choose(filtered[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };
  const dropdown = open && pos ? createPortal(
    <div ref={listRef} dir="rtl" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 100000, maxHeight: '300px', overflowY: 'auto', backgroundColor: '#0b1220', backgroundImage: 'linear-gradient(180deg, #101b30 0%, #0b1220 100%)', border: '1px solid rgba(6,182,212,0.5)', borderRadius: '8px', boxShadow: '0 12px 32px rgba(0,0,0,0.85)' }}>
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.82rem', textAlign: 'right' }}>לא נמצאו שמות מתאימים</div>
      ) : filtered.map((p, i) => (
        <div key={p} onClick={() => choose(p)} onMouseEnter={() => setHighlight(i)}
          style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'right', color: p === selected ? '#22d3ee' : '#f8fafc', fontWeight: p === selected ? 700 : 400, background: i === highlight ? 'rgba(6,182,212,0.22)' : '#0b1220', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {p}
        </div>
      ))}
    </div>, document.body) : null;
  return (
    <div ref={ref} style={{ position: 'relative', width: '230px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '34px', padding: '0 10px', borderRadius: '6px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.3)' }}>
        <input value={open ? query : (selected || '')}
          onChange={(e) => { setQuery(e.target.value); if (!open) openList(); }}
          onFocus={() => { openList(); setQuery(''); }} onKeyDown={onKeyDown}
          placeholder={selected || 'בחר את עצמך לראות את הניחושים...'}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '0.85rem', textAlign: 'right', fontFamily: 'inherit' }} />
        {selected && !open && (
          <button onClick={() => { onSelect(null); setQuery(''); }} title="נקה בחירה" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.8rem', padding: '0 2px', lineHeight: 1 }}>✕</button>
        )}
        <span onClick={() => { if (open) { setOpen(false); } else { openList(); } setQuery(''); }} style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.65rem' }}>▼</span>
      </div>
      {dropdown}
    </div>
  );
}

export default function Statistics() {
  const [loading,          setLoading         ] = useState(true);
  const [selectedSection,  setSelectedSection ] = useState(null);
  const [allQuestions,     setAllQuestions    ] = useState([]);
  const [allPredictions,   setAllPredictions  ] = useState([]);
  const [teams,            setTeams           ] = useState({});
  const [roundTables,      setRoundTables     ] = useState([]);
  const [specialTables,    setSpecialTables   ] = useState([]);
  const [qualifierTables,  setQualifierTables ] = useState([]);
  const [locationTables,   setLocationTables  ] = useState([]);
  const [israeliTable,     setIsraeliTable    ] = useState(null);
  const [playoffTable,     setPlayoffTable    ] = useState(null);
  const [gameStats,        setGameStats       ] = useState(null);
  const [specialStats,     setSpecialStats    ] = useState(null);
  const [lockedPanel,      setLockedPanel     ] = useState({});
  const [aiInsights,       setAiInsights      ] = useState(null);
  const [insightsLoading,  setInsightsLoading ] = useState(false);
  // 🆕 תפריט חדש
  const [openGroups,       setOpenGroups      ] = useState({ houses:true, ko:true, ai:true, special:false, qual:false });
  const [calMonthIdx,      setCalMonthIdx     ] = useState(0);
  const [moversData,       setMoversData      ] = useState(null);
  const [statsParticipant, setStatsParticipant ] = useState(null);  // 🆕 "ההימור שלי"
  const [mobileMenuOpen,   setMobileMenuOpen  ] = useState(false); // 🆕 תפריט נייד מתקפל

  const { currentGame } = useGame();
  const { toast } = useToast();

  // 📋 העתקת תמונה מושלמת של כרטיס גרף ללוח (עם נפילה רכה להורדה אם הדפדפן לא תומך)
  const copyChartImage = async (cardEl, title = 'גרף') => {
    if (!cardEl) return;
    try {
      const canvas = await html2canvas(cardEl, { backgroundColor: '#0f172a', scale: 2, useCORS: true, logging: false });
      canvas.toBlob(async (blob) => {
        if (!blob) { toast({ title: 'שגיאה ביצירת התמונה', variant: 'destructive', duration: 2000 }); return; }
        try {
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
          toast({ title: '📋 הגרף הועתק ללוח', description: 'אפשר להדביק בכל מקום', className: 'bg-green-900/30 border-green-500 text-green-200', duration: 2000 });
        } catch {
          // העתקה ללוח לא נתמכת בדפדפן זה → הורדה כקובץ תמונה
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${title}.png`.replace(/[\\/:*?"<>|]/g, '_');
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast({ title: '⬇️ הגרף הורד כתמונה', description: 'העתקה ישירה ללוח אינה נתמכת בדפדפן זה', duration: 2500 });
        }
      }, 'image/png');
    } catch (e) {
      toast({ title: 'שגיאה בהעתקת הגרף', variant: 'destructive', duration: 2000 });
    }
  };
  const isKnockout = !!(currentGame?.name?.includes('נוק-אאוט')||currentGame?.name?.includes('knock')||currentGame?.id==='9c9c1331-5184-406b-98b3-6becd9577567');
  // 🌍 דגל מונדיאל
  const isWC = currentGame?.id === WC_GAME_ID;

  // 💾 שמירת הבחירה האחרונה — כדי שלא תתאפס במעבר אפליקציה/לשונית
  const sectionStorageKey = currentGame?.id ? `stats_section_${currentGame.id}` : null;
  const restoredSectionRef = useRef(false);
  useEffect(() => {
    if (!sectionStorageKey || restoredSectionRef.current) return;
    try {
      const saved = localStorage.getItem(sectionStorageKey);
      if (saved) setSelectedSection(saved);
    } catch (e) { /* ignore */ }
    restoredSectionRef.current = true;
  }, [sectionStorageKey]);
  useEffect(() => {
    if (!sectionStorageKey || !restoredSectionRef.current) return;
    try {
      if (selectedSection) localStorage.setItem(sectionStorageKey, selectedSection);
      else localStorage.removeItem(sectionStorageKey);
    } catch (e) { /* ignore */ }
  }, [selectedSection, sectionStorageKey]);

  const formatResult = useCallback(r=>{ if(!r||r==='__CLEAR__') return ''; return r.includes('-')?r.split('-').map(x=>x.trim()).join(' - '):r; },[]);

  const lockPanel  = (key,data) => setLockedPanel(prev=>prev[key]?.title===data?.title?{...prev,[key]:null}:{...prev,[key]:data});
  // 🆕 כשמשנים את המשתתף הנבחר — חשב מחדש את התובנות (לעדכון "ההימור שלי")
  useEffect(()=>{ setAiInsights(null); },[statsParticipant]);
  const closePanel = key => setLockedPanel(prev=>({...prev,[key]:null}));

  useEffect(()=>{
    setAiInsights(null);
    setInsightsLoading(false);
    setMoversData(null);
    setSelectedSection(null);
    loadAllData();
  },[currentGame]);

  const loadAllData = async () => {
    if(!currentGame){setLoading(false);return;}
    const wcGame = currentGame.id === WC_GAME_ID;
    setLoading(true);
    try {
      const questions = await db.Question.filter({game_id:currentGame.id},null,5000);
      const predictions = await loadAllPreds(currentGame.id);
      setAllQuestions(questions);
      setAllPredictions(predictions);

      const allTeams=currentGame.teams_data||[];
      setTeams(allTeams.reduce((acc,t)=>{acc[normalizeTeam(t.name)]=t;return acc;},{}));

      const rT={},sT={};
      questions.forEach(q=>{
        if(!q.table_id) return;
        // 🌍 פיצול T20 — לא במונדיאל
        if(!wcGame&&q.table_id==='T20'&&q.question_text){
          let ts=null;
          if(q.question_text.includes(' נגד ')) ts=q.question_text.split(' נגד ').map(t=>t.trim());
          else if(q.question_text.includes(' - ')) ts=q.question_text.split(' - ').map(t=>t.trim());
          if(ts&&ts.length===2){q.home_team=normalizeTeam(ts[0]);q.away_team=normalizeTeam(ts[1]);}
        }
        if(q.home_team) q.home_team=normalizeTeam(q.home_team);
        if(q.away_team) q.away_team=normalizeTeam(q.away_team);
        const col=(q.home_team&&q.away_team)?rT:sT;
        // 🌍 בתים אמיתיים — לפי stage_name; שמות UCL קשיחים מגודרים
        let key=q.table_id;
        let desc=q.table_description||q.stage_name;
        if(q.stage_name?.startsWith('בית')){ key=q.stage_name; desc=q.stage_name; }
        else if(!wcGame){
          if(q.table_id==='T12') desc='פינת הגאווה הישראלית';
          else if(q.table_id==='T13') desc='מבול מטאורים של כוכבים';
          else if(q.table_id==='T20') desc='המסלול הישראלי';
        }
        if(!col[key]) col[key]={id:key,description:desc||key,questions:[],stage_order:q.stage_order||0};
        col[key].questions.push(q);
      });

      let t20=null;
      if(!wcGame){ t20=rT['T20']; delete rT['T20']; }
      setIsraeliTable(t20||null);
      const sortedRT=Object.values(rT).sort((a,b)=>{
        const aG=String(a.id).startsWith('בית'), bG=String(b.id).startsWith('בית');
        if(aG&&bG) return (a.stage_order||0)-(b.stage_order||0);
        return (parseInt(String(a.id).replace('T',''))||0)-(parseInt(String(b.id).replace('T',''))||0);
      });
      if(isKnockout) sortedRT.forEach(t=>{if(t.id==='T3')t.description='שלב שמינית הגמר - המשחקים!';});
      setRoundTables(sortedRT);

      const locIds=wcGame?[]:['T14','T15','T16','T17'];
      const isLoc=t=>locIds.includes(t.id)||(t.questions[0]?.stage_type==='locations');
      setLocationTables(Object.values(sT).filter(t=>isLoc(t)).sort((a,b)=>(parseInt(String(a.id).replace('T',''))||0)-(parseInt(String(b.id).replace('T',''))||0)));
      setPlayoffTable(null);

      const detectedLoc=new Set(Object.values(sT).filter(t=>isLoc(t)).map(t=>t.id));
      const allSpecial=Object.values(sT).filter(t=>{
        const desc=t.description?.trim();
        return desc&&!/^\d+$/.test(desc)&&!detectedLoc.has(t.id)&&t.id!=='T1';
      }).sort((a,b)=>((a.stage_order||0)-(b.stage_order||0))||((parseInt(String(a.id).replace('T',''))||0)-(parseInt(String(b.id).replace('T',''))||0)));

      const QUAL_DESC_PATTERNS = ['שתנצחנה','שיעלו','שתעפלנה','שתעפל','ראש בית','המקום השלישי'];
      const isQualTable = t =>
        t.questions[0]?.stage_type === 'qualifiers' ||
        QUAL_DESC_PATTERNS.some(p => (t.description||'').includes(p));
      setQualifierTables(allSpecial.filter(t => isQualTable(t)));
      setSpecialTables(allSpecial.filter(t => !isQualTable(t)));
    } catch(e){console.error(e);}
    setLoading(false);
  };

  // 📅 משחקים לפי יום — מתוך table_description / stage_name
  const matchesByDay = useMemo(()=>{
    const map={};
    allQuestions.filter(q=>q.home_team&&q.away_team&&q.table_id!=='T1').forEach(q=>{
      const d=parseMatchDate(q.table_description)||parseMatchDate(q.question_text)||parseMatchDate(q.stage_name);
      if(!d) return;
      if(!map[d.key]) map[d.key]=[];
      map[d.key].push({q,time:d.time,day:d.day,mon:d.mon});
    });
    const toMin=t=>{const m=String(t||'').match(/(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):99999;};
    Object.values(map).forEach(arr=>arr.sort((a,b)=>toMin(a.time)-toMin(b.time)));
    return map;
  },[allQuestions]);

  const participantsByQA = useMemo(()=>{
    const idx=new Map();
    allPredictions.forEach(p=>{
      const rawText = (!p.text_prediction?.trim() && p.home_prediction != null && p.away_prediction != null)
        ? `${p.home_prediction}-${p.away_prediction}`
        : p.text_prediction;
      if(!rawText?.trim()) return;
      const norm=normPred(rawText.trim());
      const k1=`${p.question_id}_${norm}`;
      if(!idx.has(k1)) idx.set(k1,[]);
      idx.get(k1).push(p.participant_name);
      const k2=`${p.question_id}_${rawText.trim()}`;
      if(k2!==k1){if(!idx.has(k2))idx.set(k2,[]);idx.get(k2).push(p.participant_name);}
    });
    idx.forEach((pts,k)=>idx.set(k,[...new Set(pts)].sort((a,b)=>a.localeCompare(b,'he'))));
    return idx;
  },[allPredictions]);

  const getParticipants = (qId,answer)=>{
    const k1=`${qId}_${normPred(answer.trim())}`;
    const k2=`${qId}_${answer.trim()}`;
    return participantsByQA.get(k1)||participantsByQA.get(k2)||[];
  };

  const uniquePartCount = useMemo(()=>new Set(allPredictions.map(p=>p.participant_name)).size,[allPredictions]);
  const allParticipantNames = useMemo(()=>[...new Set(allPredictions.map(p=>p.participant_name))].sort((a,b)=>a.localeCompare(b,'he')),[allPredictions]);
  // מפת הניחושים של המשתתף הנבחר: question_id → text_prediction (האחרון לפי זמן)
  const myPredByQid = useMemo(()=>{
    if(!statsParticipant) return {};
    const latest={};
    allPredictions.filter(p=>p.participant_name===statsParticipant).forEach(p=>{
      const ex=latest[p.question_id];
      if(!ex || new Date(p.created_at)>new Date(ex.created_at)) latest[p.question_id]=p;
    });
    const map={};
    Object.values(latest).forEach(p=>{
      let v=p.text_prediction;
      if((!v||v==='')&&p.home_prediction!=null&&p.away_prediction!=null) v=`${p.home_prediction}-${p.away_prediction}`;
      if(v&&v!=='') map[p.question_id]=v;
    });
    return map;
  },[statsParticipant,allPredictions]);

  // ── יומי: סטטיסטיקות למשחק בודד ──
  const dayMatchStats = useCallback((q)=>{
    const raw=allPredictions.filter(p=>p.question_id===q.id);
    const latest={};
    raw.forEach(p=>{const ex=latest[p.participant_name];if(!ex||new Date(p.created_at)>new Date(ex.created_at))latest[p.participant_name]=p;});
    const preds=Object.values(latest).map(p=>{
      const t=(!p.text_prediction?.trim()&&p.home_prediction!=null&&p.away_prediction!=null)?`${p.home_prediction}-${p.away_prediction}`:p.text_prediction;
      return {...p,text_prediction:t};
    }).filter(p=>p.text_prediction?.trim());
    const counts={};
    preds.forEach(p=>{const v=normPred(p.text_prediction.trim());counts[v]=(counts[v]||0)+1;});
    const topEntry=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]||['-',0];
    let bull=0,dir=0;
    const hasActual=q.actual_result?.trim()&&q.actual_result!=='__CLEAR__';
    if(hasActual){
      const ap=q.actual_result.split('-').map(x=>parseInt(x.trim()));
      if(ap.length===2&&!isNaN(ap[0])&&!isNaN(ap[1])){
        const sign=x=>x[0]>x[1]?1:x[0]<x[1]?-1:0;
        preds.forEach(p=>{
          const pp=p.text_prediction.split('-').map(x=>parseInt(x.trim()));
          if(pp.length!==2||isNaN(pp[0])||isNaN(pp[1])) return;
          if(pp[0]===ap[0]&&pp[1]===ap[1]) bull++;
          else if(sign(pp)===sign(ap)) dir++;
        });
      }
    }
    return { total:preds.length, top:topEntry[0], topCount:topEntry[1], bull, dir, hasActual };
  },[allPredictions]);

  // ── 🔥 מצעד התנודות ──
  const loadMovers = useCallback(async()=>{
    if(!currentGame) return;
    setMoversData('loading');
    try{
      const rankings=await loadAllRankings(currentGame.id);
      const withChange=rankings.filter(r=>r.previous_position>0);
      const climbers=[...withChange].sort((a,b)=>(b.previous_position-b.current_position)-(a.previous_position-a.current_position)).slice(0,10)
        .map(r=>({name:r.participant_name,change:r.previous_position-r.current_position,pos:r.current_position,score:r.current_score}));
      const fallers=[...withChange].sort((a,b)=>(a.previous_position-a.current_position)-(b.previous_position-b.current_position)).slice(0,10)
        .map(r=>({name:r.participant_name,change:r.previous_position-r.current_position,pos:r.current_position,score:r.current_score}));
      setMoversData({climbers:climbers.filter(c=>c.change>0),fallers:fallers.filter(f=>f.change<0),total:rankings.length});
    }catch(e){console.error(e);setMoversData({climbers:[],fallers:[],total:0});}
  },[currentGame]);

  // ── calculateGameStats ──
  const calculateGameStats = useCallback(async(type,specificId=null)=>{
    try {
      let tables=[];
      if(type==='rounds') tables=specificId?roundTables.filter(t=>t.id===specificId):roundTables;
      else if(type==='israeli') tables=israeliTable?[israeliTable]:[];
      else if(type==='day'){
        const dayMatches=matchesByDay[specificId]||[];
        if(dayMatches.length>0) tables=[{id:`day_${specificId}`,description:'משחקי היום',questions:dayMatches.map(m=>m.q)}];
      }
      if(!tables.length){setGameStats({});return;}
      const predByQ=new Map();
      allPredictions.forEach(p=>{if(!predByQ.has(p.question_id))predByQ.set(p.question_id,[]);predByQ.get(p.question_id).push(p);});
      const gsd={};
      for(const table of tables){
        for(const q of table.questions){
          const rawPreds=predByQ.get(q.id)||[];
          const latestByPart={};
          rawPreds.forEach(p=>{const ex=latestByPart[p.participant_name];if(!ex||new Date(p.created_at)>new Date(ex.created_at))latestByPart[p.participant_name]=p;});
          const preds=Object.values(latestByPart);
          const counts=preds.reduce((acc,p)=>{
            let r=(!p.text_prediction?.trim()&&p.home_prediction!=null&&p.away_prediction!=null)
              ?`${p.home_prediction}-${p.away_prediction}`
              :(p.text_prediction||'לא ניחש');
            r=stripGroupPrefix(r)||'לא ניחש';
            acc[r]=(acc[r]||0)+1;return acc;
          },{});
          const total=preds.length;
          const chart=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([r,c])=>({name:r,value:c,percentage:total>0?((c/total)*100).toFixed(1):0}));
          gsd[q.id]={question:q,table,totalPredictions:total,chartData:alternateSlice(chart).map(e=>({...e,percentage:parseFloat(e.percentage)})),mostPopular:chart[0]||{name:'-',value:0,percentage:0}};
        }
      }
      setGameStats(gsd);
    } catch(e){console.error(e);}
  },[roundTables,israeliTable,allPredictions,matchesByDay]);

  const analyzeOutcomes = useCallback(chartData=>chartData.reduce((acc,e)=>{
    if(e.name?.includes('-')){const p=e.name.split('-').map(x=>parseInt(x.trim()));if(!isNaN(p[0])&&!isNaN(p[1])){if(p[0]>p[1])acc.homeWins+=e.value;else if(p[0]===p[1])acc.draws+=e.value;else acc.awayWins+=e.value;}}
    return acc;
  },{homeWins:0,draws:0,awayWins:0}),[]);

  const gameOutcomeParticipants = useMemo(()=>{
    if(!gameStats) return new Map();
    const map=new Map();
    Object.values(gameStats).forEach(game=>{
      const q=game.question;
      const r={home:[],draw:[],away:[]};
      game.chartData.forEach(e=>{
        if(e.name?.includes('-')){const p=e.name.split('-').map(x=>parseInt(x.trim()));if(!isNaN(p[0])&&!isNaN(p[1])){const t=p[0]>p[1]?'home':p[0]===p[1]?'draw':'away';r[t].push(...getParticipants(q.id,e.name));}}
      });
      map.set(q.id,{homeWinParticipants:[...new Set(r.home)].sort((a,b)=>a.localeCompare(b,'he')),drawParticipants:[...new Set(r.draw)].sort((a,b)=>a.localeCompare(b,'he')),awayWinParticipants:[...new Set(r.away)].sort((a,b)=>a.localeCompare(b,'he'))});
    });
    return map;
  },[gameStats,participantsByQA]);

  const gameStatsArr = useMemo(()=>Object.values(gameStats||{}),[gameStats]);

  // ── calculateSpecialStats ──
  const calculateSpecialStats = useCallback(async(group,specificId=null)=>{
    try {
      let tables=[];
      if(group==='special') tables=specificId?specialTables.filter(t=>t.id===specificId):specialTables;
      else if(group==='qualifier') tables=specificId?qualifierTables.filter(t=>t.id===specificId):qualifierTables;
      else if(group==='locations') tables=locationTables;
      else if(group==='playoff') tables=playoffTable?[playoffTable]:[];
      if(!tables.length){setSpecialStats(null);return;}
      const ssd={};
      for(const table of tables){
        const ts={table,questions:[]};

        if(group==='qualifier'){
          const cfg = ADVANCING_CONFIG[table.id] || null;
          const slots=table.questions.filter(q=>{const n=parseFloat(q.question_id);return Number.isInteger(n)&&n>=1;});
          // מיפוי question.id → question_id המספרי (לזיהוי ראש בית/סגנית)
          const slotQNum={}; slots.forEach(s=>{slotQNum[s.id]=parseInt(parseFloat(s.question_id),10);});
          const slotIds=new Set(slots.map(s=>s.id));
          // 🆕 T16 מונדיאל: אי-זוגי=ראש בית, זוגי=סגנית
          const isGroupLeaders = isWC && table.id==='T16';
          const teamCounts={}, participantsMap={};
          const winCounts={}, winPM={}, runCounts={}, runPM={};
          allPredictions.forEach(p=>{
            if(!slotIds.has(p.question_id)) return;
            const rawText=(!p.text_prediction?.trim()&&p.home_prediction!=null&&p.away_prediction!=null)
              ?`${p.home_prediction}-${p.away_prediction}`:p.text_prediction;
            if(!rawText?.trim()) return;
            const team=cleanTeam(normalizeTeam(rawText.trim()));
            if(!team||team.toLowerCase()==='null'||team==='כן'||team==='לא') return;
            teamCounts[team]=(teamCounts[team]||0)+1;
            if(!participantsMap[team]) participantsMap[team]=new Set();
            participantsMap[team].add(p.participant_name);
            if(isGroupLeaders){
              const qn=slotQNum[p.question_id];
              if(qn%2===1){ winCounts[team]=(winCounts[team]||0)+1; (winPM[team]=winPM[team]||new Set()).add(p.participant_name); }
              else        { runCounts[team]=(runCounts[team]||0)+1; (runPM[team]=runPM[team]||new Set()).add(p.participant_name); }
            }
          });
          const toSortedPM=(src)=>{const o={};Object.entries(src).forEach(([t,s])=>{o[t]=[...s].sort((a,b)=>a.localeCompare(b,'he'));});return o;};
          const toChart=(src)=>Object.entries(src).sort((a,b)=>b[1]-a[1]).map(([team,count])=>({team,count}));
          ts.qualifierData={
            chartData:toChart(teamCounts),
            cfg, advCount:slots.length||(cfg?cfg.count:0), participantsMap:toSortedPM(participantsMap),
            isGroupLeaders,
            winnersData: isGroupLeaders?{chartData:toChart(winCounts),participantsMap:toSortedPM(winPM)}:null,
            runnersData: isGroupLeaders?{chartData:toChart(runCounts),participantsMap:toSortedPM(runPM)}:null,
          };

        } else if(group==='locations'||(!isWC&&['T14','T15','T16','T17'].includes(table.id))){
          const forTable=allPredictions.filter(p=>table.questions.some(q=>q.id===p.question_id));
          const teamCounts=forTable.reduce((acc,pred)=>{
            if(pred.text_prediction?.trim()){const t=cleanTeam(normalizeTeam(pred.text_prediction.trim()));if(t&&t.toLowerCase()!=='null')acc[t]=(acc[t]||0)+1;}
            return acc;
          },{});
          const chartData=Object.entries(teamCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([team,count])=>({team,count,percentage:forTable.length>0?((count/forTable.length)*100).toFixed(1):0}));
          ts.locationsData={totalPredictions:forTable.length,uniqueTeams:Object.keys(teamCounts).length,topTeams:chartData,mostPopular:chartData[0]||{team:'-',count:0,percentage:0}};

        } else {
          if(table.id!=='T1'){
            const slots = table.questions.filter(q => {
              const n = parseFloat(q.question_id);
              return Number.isInteger(n) && n >= 1;
            });
            const isTeamListTable = slots.length >= 2 &&
              slots.every(q =>
                !q.home_team && !q.away_team &&
                q.stage_type === 'qualifiers'
              );

            if (isTeamListTable) {
              const slotIds = new Set(slots.map(s => s.id));
              // 🆕 T16 מונדיאל: מיפוי question.id→מספר; אי-זוגי=ראש בית, זוגי=סגנית
              const slotQNum={}; slots.forEach(s=>{slotQNum[s.id]=parseInt(parseFloat(s.question_id),10);});
              const isGroupLeaders = isWC && table.id==='T16';
              const teamCounts = {}, participantsMap = {};
              const winCounts={}, winPM={}, runCounts={}, runPM={};
              allPredictions.forEach(p => {
                if (!slotIds.has(p.question_id) || !p.text_prediction?.trim()) return;
                const team = cleanTeam(normalizeTeam(p.text_prediction.trim()));
                if (!team || team.toLowerCase() === 'null') return;
                teamCounts[team] = (teamCounts[team]||0) + 1;
                if (!participantsMap[team]) participantsMap[team] = new Set();
                participantsMap[team].add(p.participant_name);
                if(isGroupLeaders){
                  const qn=slotQNum[p.question_id];
                  if(qn%2===1){ winCounts[team]=(winCounts[team]||0)+1; (winPM[team]=winPM[team]||new Set()).add(p.participant_name); }
                  else        { runCounts[team]=(runCounts[team]||0)+1; (runPM[team]=runPM[team]||new Set()).add(p.participant_name); }
                }
              });
              const toSortedPM=(s2)=>{const o={};Object.entries(s2).forEach(([t,s])=>{o[t]=[...s].sort((a,b)=>a.localeCompare(b,'he'));});return o;};
              const toChart=(s2)=>Object.entries(s2).sort((a,b)=>b[1]-a[1]).map(([team,count])=>({team,count}));
              ts.qualifierData = {
                chartData: toChart(teamCounts),
                cfg: null, advCount: slots.length, participantsMap: toSortedPM(participantsMap),
                isSpecialTeamList: true,
                isGroupLeaders,
                winnersData: isGroupLeaders?{chartData:toChart(winCounts),participantsMap:toSortedPM(winPM)}:null,
                runnersData: isGroupLeaders?{chartData:toChart(runCounts),participantsMap:toSortedPM(runPM)}:null,
              };
            } else {
            for(const q of table.questions){
              const qPreds=allPredictions.filter(p=>p.question_id===q.id);
              const latestByPart={};
              qPreds.forEach(p=>{
                const ex=latestByPart[p.participant_name];
                if(!ex||new Date(p.created_at)>new Date(ex.created_at)) latestByPart[p.participant_name]=p;
              });
              const dedupPreds=Object.values(latestByPart);
              const answerCounts=dedupPreds.reduce((acc,pred)=>{
                let answer=(!pred.text_prediction?.trim()&&pred.home_prediction!=null&&pred.away_prediction!=null)
                  ?`${pred.home_prediction}-${pred.away_prediction}`
                  :String(pred.text_prediction||'').trim();
                if(!answer||answer==='__CLEAR__'||answer.toLowerCase()==='null'||answer.toLowerCase()==='undefined') return acc;
                answer=stripGroupPrefix(answer);
                if(!answer) return acc;
                const isYN=['כן','לא','yes','no'].includes(answer), isNum=!isNaN(Number(answer));
                if(!isYN&&!isNum&&(q.validation_list?.toLowerCase().includes('קבוצ')||q.validation_list?.toLowerCase().includes('נבחר'))) answer=cleanTeam(answer);
                if(!answer.trim()) return acc;
                acc[answer]=(acc[answer]||0)+1; return acc;
              },{});
              const total=Object.values(answerCounts).reduce((s,c)=>s+c,0);
              const chart=Object.entries(answerCounts).sort((a,b)=>b[1]-a[1]).map(([ans,c])=>({answer:ans,count:c,percentage:total>0?((c/total)*100).toFixed(1):0}));
              ts.questions.push({question:q,totalAnswers:total,chartData:alternateSlice(chart),mostPopular:chart[0]||{answer:'-',count:0,percentage:0},diversity:chart.length});
            }
            }
          }
        }
        ssd[table.id]=ts;
      }
      setSpecialStats(ssd);
    } catch(e){console.error(e);}
  },[specialTables,qualifierTables,locationTables,playoffTable,allPredictions,isWC]);

  // ── 🆕 מבנה התפריט החדש — קבוצות מתקפלות ──────────────────────────────────
  const menuGroups = useMemo(()=>{
    const groups=[];
    // 🤖 תובנות
    groups.push({key:'ai',label:'🤖 תובנות',color:'#a855f7',activeBg:'#9333ea',
      buttons:[
        {key:'insights',description:'תובנות AI ומחקרים'},
        {key:'movers',description:'🔥 מצעד התנודות'},
      ]});
    // 🏠 שלב הבתים (גריד) / משחקים
    const houseTables=roundTables.filter(t=>String(t.id).startsWith('בית'));
    const otherRounds=roundTables.filter(t=>!String(t.id).startsWith('בית'));
    if(houseTables.length>0){
      groups.push({key:'houses',label:'🏠 שלב הבתים',color:'#06b6d4',activeBg:'#0891b2',grid:true,
        buttons:houseTables.map(t=>({key:`round_${t.id}`,description:String(t.id).replace('בית','').trim()||t.id,full:t.description}))});
    }
    if(otherRounds.length>0){
      groups.push({key:'ko',label:houseTables.length>0?'⚔️ נוקאאוט':'⚽ משחקים',color:'#3b82f6',activeBg:'#2563eb',
        buttons:otherRounds.map(t=>({key:`round_${t.id}`,description:(t.id==='T3'&&isKnockout)?'שמינית הגמר - המשחקים':t.description||t.id}))});
    }
    // ✨ שאלות מיוחדות
    const specialBtns=[];
    specialTables.forEach(t=>{ if(t.id!=='T1') specialBtns.push({key:t.id,description:t.description}); });
    if(israeliTable) specialBtns.push({key:`round_${israeliTable.id}`,description:israeliTable.description});
    if(specialBtns.length>0) groups.push({key:'special',label:'✨ שאלות מיוחדות',color:'#8b5cf6',activeBg:'#7c3aed',buttons:specialBtns});
    // 📋 רשימות עולות
    const qualBtns=[
      ...qualifierTables.map(t=>({key:`qual_${t.id}`,description:(t.description||'').replace(/\s*[-–]\s*שאלות מיוחדות\s*$/,'').replace(/^רשימת הנבחרות\s*/,'').trim()})),
      ...(locationTables.length>0?[{key:'locations',description:'מיקומים'}]:[]),
    ];
    if(qualBtns.length>0) groups.push({key:'qual',label:'📋 רשימות עולות',color:'#f97316',activeBg:'#ea580c',buttons:qualBtns});
    return groups;
  },[roundTables,specialTables,qualifierTables,locationTables,israeliTable,isKnockout]);

  const CAL_MONTHS = [ {name:'יוני 2026',y:2026,m:5}, {name:'יולי 2026',y:2026,m:6} ];
  const hasDates = Object.keys(matchesByDay).length>0;
  // 🆕 פורמט שמות שלבים אחיד (כמו בצפייה בניחושים)
  const shortLabel = (desc) => {
    if (!desc) return '';
    const raw = String(desc);
    if (raw.includes('ראש בראש') || raw.includes('התותחים') || raw.includes('מבול')) return 'ראש בראש';
    if (raw.includes('הניחושים המיוחדים')) return 'הניחושים המיוחדים';
    if (raw.includes('המסלול המהיר')) return 'המסלול המהיר';
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
    if (raw.includes('שלב הבתים')) return 'שלב הבתים';
    let s = raw.replace(/\(\*+\)/g, '').replace(/["'״]/g, '').replace(/^בית\s*/, 'בית ').trim();
    return s.length > 18 ? s.slice(0, 17).trim() + '…' : s;
  };
  // 🆕 תווית קריאה של הסעיף הנבחר (לבר הנייד) — חייב לפני כל early-return!
  const currentSectionLabel = useMemo(()=>{
    if(!selectedSection) return null;
    if(selectedSection.startsWith('day_')) return `📅 ${selectedSection.replace('day_','')}`;
    for(const g of menuGroups){
      for(const b of g.buttons){
        if(b.key===selectedSection) return `${g.label.split(' ')[0]} ${g.grid?`בית ${b.description}`:shortLabel(b.full||b.description)}`;
      }
    }
    return null;
  },[selectedSection,menuGroups]);

  useEffect(()=>{
    if(!selectedSection||loading||!allQuestions.length) return;
    if(selectedSection==='insights'){
      if(!aiInsights){
        setInsightsLoading(true);
        setTimeout(()=>{
          const insights=computeInsights(allQuestions,allPredictions,teams,myPredByQid);
          setAiInsights(insights);
          setInsightsLoading(false);
        },100);
      }
      return;
    }
    if(selectedSection==='movers'){ if(moversData===null) loadMovers(); return; }
    if(selectedSection.startsWith('day_')){ calculateGameStats('day',selectedSection.replace('day_','')); return; }
    if(selectedSection.startsWith('round_')){
      const tId=selectedSection.replace('round_','');
      if(tId==='all') calculateGameStats('rounds');
      else if(israeliTable&&tId===israeliTable.id) calculateGameStats('israeli');
      else calculateGameStats('rounds',tId);
      return;
    }
    if(selectedSection.startsWith('qual_')){calculateSpecialStats('qualifier',selectedSection.replace('qual_',''));return;}
    if(selectedSection==='locations'){calculateSpecialStats('locations');return;}
    if(selectedSection===playoffTable?.id){calculateSpecialStats('playoff');return;}
    calculateSpecialStats('special',selectedSection);
  },[selectedSection,loading,allQuestions,allPredictions]);

  const toggleSection=key=>{
    if(selectedSection===key){setSelectedSection(null);return;}
    setSelectedSection(key);setSpecialStats(null);setGameStats(null);setLockedPanel({});
  };
  const toggleGroup=key=>setOpenGroups(prev=>({...prev,[key]:!prev[key]}));

  if(loading) return(
    <div className="flex items-center justify-center h-screen" style={{background:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)'}}>
      <Loader2 className="w-8 h-8 animate-spin" style={{color:'#06b6d4'}}/>
      <span className="mr-3" style={{color:'#06b6d4'}}>טוען סטטיסטיקות...</span>
    </div>
  );

  const isRoundsSection  = selectedSection?.startsWith('round_');
  const isQualSection    = selectedSection?.startsWith('qual_');
  const isDaySection     = selectedSection?.startsWith('day_');
  const isSpecialSection = selectedSection&&!isRoundsSection&&!isQualSection&&!isDaySection&&selectedSection!=='insights'&&selectedSection!=='movers';

  // ── 📅 calendar render ──
  const renderCalendar = (afterSelect) => {
    if(!hasDates&&!isWC) return null;
    const M=CAL_MONTHS[calMonthIdx];
    const firstDow=new Date(M.y,M.m,1).getDay();
    const daysIn=new Date(M.y,M.m+1,0).getDate();
    const todayD=new Date();
    const cells=[];
    for(let i=0;i<firstDow;i++) cells.push(null);
    for(let d=1;d<=daysIn;d++) cells.push(d);
    return (
      <div style={{background:'rgba(0,0,0,0.35)',border:'1px solid rgba(6,182,212,0.22)',borderRadius:12,padding:10,marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <button onClick={()=>setCalMonthIdx(i=>Math.max(0,i-1))} disabled={calMonthIdx===0} style={{background:'rgba(6,182,212,0.12)',border:'1px solid rgba(6,182,212,0.3)',color:calMonthIdx===0?'#334155':'#22d3ee',borderRadius:6,width:24,height:24,cursor:calMonthIdx===0?'default':'pointer',fontSize:'0.8rem'}}>‹</button>
          <span style={{fontWeight:700,fontSize:'0.82rem',color:'#22d3ee'}}>📅 {M.name}</span>
          <button onClick={()=>setCalMonthIdx(i=>Math.min(CAL_MONTHS.length-1,i+1))} disabled={calMonthIdx===CAL_MONTHS.length-1} style={{background:'rgba(6,182,212,0.12)',border:'1px solid rgba(6,182,212,0.3)',color:calMonthIdx===CAL_MONTHS.length-1?'#334155':'#22d3ee',borderRadius:6,width:24,height:24,cursor:calMonthIdx===CAL_MONTHS.length-1?'default':'pointer',fontSize:'0.8rem'}}>›</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
          {['א','ב','ג','ד','ה','ו','ש'].map(d=><span key={d} style={{fontSize:'0.55rem',color:'#475569',textAlign:'center',fontWeight:700,padding:'2px 0'}}>{d}</span>)}
          {cells.map((d,i)=>{
            if(d===null) return <span key={`e${i}`}/>;
            const key=`${M.m+1}-${d}`;
            const has=!!matchesByDay[key];
            const stage=isWC?WC_STAGE_BY_DAY[key]:null;
            const clickable=has||!!stage;
            const isToday=todayD.getFullYear()===M.y&&todayD.getMonth()===M.m&&todayD.getDate()===d;
            const sel=selectedSection===`day_${key}`;
            return (
              <span key={d}
                onClick={clickable?()=>{toggleSection(`day_${key}`);if(afterSelect)afterSelect();}:undefined}
                title={stage||''}
                style={{fontSize:'0.72rem',textAlign:'center',padding:'5px 0',borderRadius:6,
                  color:sel?'#fff':has?'#cbd5e1':stage?'#7dd3fc':'#334155',
                  background:sel?'#0891b2':has?'rgba(6,182,212,0.10)':stage?'rgba(59,130,246,0.08)':'transparent',
                  border:sel?'1px solid #22d3ee':isToday?'1px solid #f59e0b':has?'1px solid rgba(6,182,212,0.22)':stage?'1px solid rgba(59,130,246,0.18)':'1px solid transparent',
                  fontWeight:sel?700:isToday?700:400,
                  cursor:clickable?'pointer':'default',
                  boxShadow:sel?'0 0 8px rgba(6,182,212,0.5)':'none'}}>
                {d}
              </span>
            );
          })}
        </div>
        <div style={{display:'flex',gap:8,marginTop:6,fontSize:'0.58rem',color:'#64748b',justifyContent:'center',flexWrap:'wrap'}}>
          <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:'#0891b2',marginLeft:3,verticalAlign:'middle'}}></span>משחקים</span>
          <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:'rgba(59,130,246,0.5)',marginLeft:3,verticalAlign:'middle'}}></span>שלב נוקאאוט</span>
          <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',border:'1px solid #f59e0b',marginLeft:3,verticalAlign:'middle'}}></span>היום</span>
        </div>
      </div>
    );
  };

  // ── 🆕 sidebar group render ──
  const renderMenuGroup = (group) => {
    const open=!!openGroups[group.key];
    return (
      <div key={group.key} style={{marginBottom:8}}>
        <div onClick={()=>toggleGroup(group.key)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',borderRadius:10,cursor:'pointer',userSelect:'none',fontWeight:700,fontSize:'0.85rem',color:group.color,background:`${group.color}1A`,border:`1px solid ${group.color}40`}}>
          <span>{group.label}</span>
          <span style={{fontSize:'0.6rem',transform:open?'rotate(90deg)':'none',transition:'transform 0.2s'}}>◀</span>
        </div>
        {open&&(
          group.grid?(
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5,padding:'8px 2px 2px'}}>
              {group.buttons.map(btn=>{
                const active=selectedSection===btn.key;
                return (
                  <button key={btn.key} onClick={()=>toggleSection(btn.key)} title={btn.full} style={{textAlign:'center',padding:'7px 0',borderRadius:8,fontSize:'0.8rem',fontWeight:active?700:500,color:active?'#fff':'#67e8f9',background:active?group.activeBg:'rgba(6,182,212,0.08)',border:`1px solid ${active?group.color:'rgba(6,182,212,0.25)'}`,cursor:'pointer',transition:'all 0.12s',boxShadow:active?`0 0 8px ${group.color}80`:'none',fontFamily:'Rubik,Heebo,sans-serif'}}>
                    {btn.description}
                  </button>
                );
              })}
            </div>
          ):(
            <div style={{padding:'8px 2px 2px'}}>
              {group.buttons.map(btn=>{
                const active=selectedSection===btn.key;
                return (
                  <button key={btn.key} onClick={()=>toggleSection(btn.key)} title={btn.full||btn.description} style={{display:'block',width:'100%',textAlign:'right',padding:'7px 10px',marginBottom:4,borderRadius:8,fontSize:'0.78rem',fontWeight:active?700:400,color:active?'white':group.color,background:active?group.activeBg:`${group.color}12`,border:`1px solid ${active?group.color:`${group.color}40`}`,cursor:'pointer',transition:'all 0.15s',boxShadow:active?`0 0 10px ${group.color}55`:'none',fontFamily:'Rubik,Heebo,sans-serif',lineHeight:1.35}}>
                    {shortLabel(btn.full||btn.description)}
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>
    );
  };

  // ── 📅 day view ──
  const renderDayView = () => {
    const key=selectedSection.replace('day_','');
    const [mon,day]=key.split('-').map(Number);
    const matches=matchesByDay[key]||[];
    const stageName=isWC?WC_STAGE_BY_DAY[key]:null;
    return (
      <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(6,182,212,0.25)'}}>
        <CardHeader>
          <CardTitle style={{color:'#22d3ee'}}>📅 {day}/{mon}/2026{stageName?` — ${stageName}`:' — משחקי היום'}</CardTitle>
          <p style={{fontSize:'0.78rem',color:'#94a3b8',marginTop:4}}>{matches.length>0?`${matches.length} משחקים ביום זה`:'המשחקים והקבוצות ייקבעו בהמשך הטורניר'}</p>
        </CardHeader>
        <CardContent>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {matches.map(({q,time})=>{
              const st=dayMatchStats(q);
              const homeT=teams[normalizeTeam(q.home_team)], awayT=teams[normalizeTeam(q.away_team)];
              return (
                <div key={q.id} style={{position:'relative',borderRadius:10,border:'1px solid rgba(6,182,212,0.15)',background:'rgba(0,0,0,0.25)',padding:'10px 12px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    {/* שעת המשחק (שעון ישראל) — עמודה קבועה בקצה ההתחלה, לא נחפפת ע"י שמות */}
                    <span style={{flex:'0 0 auto',minWidth:60,display:'inline-flex',alignItems:'center',gap:3,color:'#67e8f9',fontSize:'0.72rem',fontWeight:600,whiteSpace:'nowrap'}}>
                      {time&&<><span>🕐</span><span>{time}</span></>}
                    </span>
                    {/* המשחק — ממורכז בשטח שנותר */}
                    <div style={{flex:'1 1 auto',minWidth:0,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                      {/* קבוצת בית (מימין ב-RTL) */}
                      <span style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.9rem',color:'#f8fafc',justifyContent:'flex-end',minWidth:0,flex:'1 1 0'}}>
                        <span style={{minWidth:0,wordBreak:'break-word'}}>{cleanTeam(q.home_team)}</span>
                        {homeT?.logo_url&&<img src={homeT.logo_url} alt="" style={{width:22,height:22,borderRadius:'50%',flexShrink:0}}/>}
                      </span>
                      {/* תוצאה — במרכז */}
                      <span style={{textAlign:'center',fontWeight:700,color:st.hasActual?'#fde68a':'#64748b',fontSize:'0.95rem',minWidth:52,flexShrink:0}}>
                        {st.hasActual?formatResult(q.actual_result):'? - ?'}
                      </span>
                      {/* קבוצת חוץ (משמאל ב-RTL) */}
                      <span style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.9rem',color:'#f8fafc',justifyContent:'flex-start',minWidth:0,flex:'1 1 0'}}>
                        {awayT?.logo_url&&<img src={awayT.logo_url} alt="" style={{width:22,height:22,borderRadius:'50%',flexShrink:0}}/>}
                        <span style={{minWidth:0,wordBreak:'break-word'}}>{cleanTeam(q.away_team)}</span>
                      </span>
                    </div>
                    {/* מרווח מאזן בקצה — שומר על מרכוז המשחק */}
                    <span style={{flex:'0 0 auto',minWidth:60}}/>
                  </div>
                  <div style={{display:'flex',gap:14,marginTop:8,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.05)',fontSize:'0.74rem',color:'#94a3b8',flexWrap:'wrap'}}>
                    <span>{q.stage_name} • {st.total} ניחושים</span>
                    {st.hasActual?(
                      <>
                        <span>🎯 בולים: <b style={{color:'#34d399'}}>{st.bull}</b> ({pct(st.bull,st.total)}%)</span>
                        <span>↗ כיוונים: <b style={{color:'#60a5fa'}}>{st.dir}</b> ({pct(st.dir,st.total)}%)</span>
                        <span>💀 פספסו: <b style={{color:'#f87171'}}>{st.total-st.bull-st.dir}</b></span>
                      </>
                    ):(
                      <span>הניחוש הנפוץ: <b style={{color:'#22d3ee'}}>{formatResult(st.top)}</b> ({st.topCount} בחרו)</span>
                    )}
                  </div>
                </div>
              );
            })}
            {matches.length===0&&(
              <div style={{textAlign:'center',padding:'30px 0'}}>
                <span style={{fontSize:'2.2rem'}}>⚔️</span>
                <p style={{color:'#7dd3fc',fontWeight:700,marginTop:8}}>{stageName||'אין משחקים ביום זה'}</p>
                {stageName&&<p style={{color:'#64748b',fontSize:'0.8rem',marginTop:4}}>הקבוצות שיעלו לשלב זה ייקבעו לפי תוצאות השלבים הקודמים — הניחושים כבר נעולים ב-📋 רשימות העולות!</p>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── 🔥 movers view ──
  const renderMovers = () => (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <TrendingUp style={{width:28,height:28,color:'#f59e0b'}}/>
        <div>
          <h2 style={{color:'#f8fafc',fontSize:'1.4rem',fontWeight:800,margin:0}}>🔥 מצעד התנודות</h2>
          <p style={{color:'#94a3b8',fontSize:'0.82rem',margin:0}}>מי טיפס ומי צנח מאז העדכון הקודם של הדירוג</p>
        </div>
      </div>
      {moversData==='loading'||moversData===null?(
        <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(245,158,11,0.3)'}}>
          <CardContent className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{color:'#f59e0b'}}/><p style={{color:'#94a3b8'}}>טוען דירוג...</p></CardContent>
        </Card>
      ):(
        <div className="grid md:grid-cols-2 gap-4">
          <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(16,185,129,0.35)'}}>
            <CardHeader><CardTitle style={{color:'#34d399'}}>🚀 המטפסים</CardTitle></CardHeader>
            <CardContent>
              {moversData.climbers.length>0?moversData.climbers.map((m,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:8,background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.18)',marginBottom:5}}>
                  <span style={{color:'#f8fafc',fontSize:'0.85rem'}}>{m.name}</span>
                  <span style={{display:'flex',gap:8,alignItems:'center'}}>
                    <Badge style={{background:'#059669',color:'#fff',fontSize:'0.72rem'}}>▲ {m.change}</Badge>
                    <span style={{color:'#94a3b8',fontSize:'0.72rem'}}>מקום {m.pos} • {m.score} נק'</span>
                  </span>
                </div>
              )):<p style={{color:'#64748b',fontSize:'0.8rem'}}>אין שינויי מיקום עדיין</p>}
            </CardContent>
          </Card>
          <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(239,68,68,0.35)'}}>
            <CardHeader><CardTitle style={{color:'#f87171'}}>📉 הנופלים</CardTitle></CardHeader>
            <CardContent>
              {moversData.fallers.length>0?moversData.fallers.map((m,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:8,background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.18)',marginBottom:5}}>
                  <span style={{color:'#f8fafc',fontSize:'0.85rem'}}>{m.name}</span>
                  <span style={{display:'flex',gap:8,alignItems:'center'}}>
                    <Badge style={{background:'#dc2626',color:'#fff',fontSize:'0.72rem'}}>▼ {Math.abs(m.change)}</Badge>
                    <span style={{color:'#94a3b8',fontSize:'0.72rem'}}>מקום {m.pos} • {m.score} נק'</span>
                  </span>
                </div>
              )):<p style={{color:'#64748b',fontSize:'0.8rem'}}>אין שינויי מיקום עדיין</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-6" dir="rtl" style={{background:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)'}}>
      <div className="w-full">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3" style={{color:'#f8fafc',textShadow:'0 0 10px rgba(6,182,212,0.3)'}}>
          <PieChart className="w-8 h-8 md:w-10 md:h-10" style={{color:'#06b6d4'}}/>סטטיסטיקות ותובנות
        </h1>
        <p className="mb-3" style={{color:'#94a3b8'}}>בחר יום בלוח או שלב מהתפריט • לחץ על קטע בגרף לנעילת רשימת משתתפים</p>

        {/* 🎯 בורר "ההימור שלי" — גלובלי, חל על כל המסכים */}
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',background:'rgba(6,182,212,0.07)',border:'1px solid rgba(6,182,212,0.25)',borderRadius:10,padding:'8px 12px',marginBottom:16}}>
          <span style={{fontSize:'0.82rem',color:'#67e8f9',fontWeight:700,whiteSpace:'nowrap'}}>🎯 ההימור שלי:</span>
          <StatsParticipantSelect participants={allParticipantNames} selected={statsParticipant} onSelect={setStatsParticipant}/>
          {statsParticipant
            ? <span style={{fontSize:'0.74rem',color:'#94a3b8'}}>הניחושים של <b style={{color:'#22d3ee'}}>{statsParticipant}</b> מוצגים בתוך הגרפים.</span>
            : <span style={{fontSize:'0.74rem',color:'#64748b'}}>בחר את עצמך כדי לראות את ההימורים שלך בתוך הגרפים.</span>}
        </div>

        <div className="flex flex-col md:flex-row gap-4" style={{alignItems:'flex-start'}}>

          {/* ── Sidebar — desktop ── */}
          <aside className="stats-sidebar-desktop" style={{width:'250px',flexShrink:0,position:'sticky',top:'70px',alignSelf:'flex-start',maxHeight:'calc(100vh - 90px)',overflowY:'auto',paddingBottom:'16px'}}>
            <style>{`@media(max-width:768px){.stats-sidebar-desktop{display:none!important}}`}</style>
            <div style={{background:'rgba(13,18,30,0.92)',border:'1px solid rgba(6,182,212,0.15)',borderRadius:14,padding:'12px 10px'}}>
              <div style={{fontSize:'0.55rem',fontWeight:'800',letterSpacing:'0.18em',textTransform:'uppercase',color:'#334155',marginBottom:'10px'}}>בחירת שלב</div>
              {renderCalendar()}
              {menuGroups.map(g=>renderMenuGroup(g))}
            </div>
          </aside>

          {/* ── Content ── */}
          <div style={{flex:1,minWidth:0}}>

            {/* ── Mobile: תפריט מתקפל קומפקטי (חוסך מקום במסך) ── */}
            <div className="stats-mobile-menu" style={{marginBottom:'12px'}}>
              <style>{`@media(min-width:769px){.stats-mobile-menu{display:none!important}}`}</style>

              {/* בר בחירה — מציג את הסעיף הנוכחי, פותח את הבורר */}
              <button onClick={()=>setMobileMenuOpen(o=>!o)} style={{
                width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'12px 14px',borderRadius:'12px',
                background:'linear-gradient(135deg,rgba(6,182,212,0.16),rgba(6,182,212,0.06))',
                border:'1.5px solid rgba(6,182,212,0.45)',
                cursor:'pointer',WebkitTapHighlightColor:'transparent',touchAction:'manipulation',
                fontFamily:'Rubik,Heebo,sans-serif',
              }}>
                <span style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:'1.1rem'}}>📋</span>
                  <span style={{color:'#f8fafc',fontWeight:700,fontSize:'0.95rem'}}>
                    {currentSectionLabel||'בחר שלב לתצוגה'}
                  </span>
                </span>
                <span style={{color:'#22d3ee',fontSize:'0.9rem',fontWeight:600}}>החלף ▾</span>
              </button>

              {/* בורר נפתח מלמטה — portal ל-body כדי לעלות מעל הכותרת (כמו בצפייה בניחושים) */}
              {mobileMenuOpen && createPortal((
                <div onClick={()=>setMobileMenuOpen(false)} style={{
                  position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.65)',
                  display:'flex',alignItems:'flex-end',backdropFilter:'blur(2px)',
                }}>
                  <div onClick={e=>e.stopPropagation()} style={{
                    width:'100%',maxHeight:'82vh',overflowY:'auto',
                    background:'#0b1220',borderTopLeftRadius:'22px',borderTopRightRadius:'22px',
                    border:'1px solid rgba(6,182,212,0.3)',borderBottom:'none',
                    padding:'10px 16px calc(28px + env(safe-area-inset-bottom,0px))',
                    boxShadow:'0 -10px 40px rgba(0,0,0,0.8)',
                  }}>
                    {/* ידית + כותרת */}
                    <div style={{display:'flex',justifyContent:'center',padding:'4px 0 12px'}}>
                      <div style={{width:'42px',height:'5px',borderRadius:'3px',background:'rgba(255,255,255,0.2)'}}/>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                      <span style={{fontSize:'1.05rem',fontWeight:700,color:'#f8fafc'}}>בחר שלב לתצוגה</span>
                      <button onClick={()=>setMobileMenuOpen(false)} aria-label="סגור" style={{
                        background:'rgba(255,255,255,0.06)',border:'none',borderRadius:'50%',
                        width:'32px',height:'32px',color:'#94a3b8',cursor:'pointer',fontSize:'1.1rem',lineHeight:1,
                      }}>✕</button>
                    </div>

                    {hasDates && (
                      <div style={{marginBottom:18}}>
                        <div style={{fontSize:'0.78rem',fontWeight:700,color:'#06b6d4',marginBottom:9}}>📅 לוח משחקים</div>
                        {renderCalendar(()=>{
                          setMobileMenuOpen(false);
                          setTimeout(()=>{
                            const main=document.querySelector('.lm-page');
                            if(main) main.scrollTo({top:0,behavior:'smooth'});
                            else window.scrollTo({top:0,behavior:'smooth'});
                          },60);
                        })}
                      </div>
                    )}
                    {menuGroups.map(group=>(
                      <div key={group.key} style={{marginBottom:18}}>
                        <div style={{fontSize:'0.78rem',color:group.color,marginBottom:9,fontWeight:700}}>{group.label}</div>
                        <div style={{display:'grid',gridTemplateColumns:group.grid?'repeat(3,1fr)':'repeat(2,1fr)',gap:8}}>
                          {group.buttons.map(btn=>{
                            const active=selectedSection===btn.key;
                            const label=group.grid?`בית ${btn.description}`:shortLabel(btn.full||btn.description);
                            return(
                              <button key={btn.key}
                                onClick={()=>{
                                  toggleSection(btn.key);
                                  setMobileMenuOpen(false);
                                  setTimeout(()=>{
                                    const main=document.querySelector('.lm-page');
                                    if(main) main.scrollTo({top:0,behavior:'smooth'});
                                    else window.scrollTo({top:0,behavior:'smooth'});
                                  },60);
                                }}
                                title={btn.full||btn.description}
                                style={{
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  padding:'13px 8px',borderRadius:'12px',
                                  fontSize:'0.86rem',fontWeight:active?700:500,
                                  color:active?'#0f172a':'#e2e8f0',
                                  background:active?group.color:'rgba(255,255,255,0.04)',
                                  border:`1.5px solid ${active?group.color:`${group.color}40`}`,
                                  cursor:'pointer',fontFamily:'Rubik,Heebo,sans-serif',textAlign:'center',
                                  WebkitTapHighlightColor:'transparent',touchAction:'manipulation',minHeight:'52px',
                                  whiteSpace:'normal',lineHeight:1.25,
                                }}>{label}</button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ), document.body)}
            </div>

            {/* 📅 Day view — סיכום + סטטיסטיקות מלאות לכל משחקי היום */}
            {isDaySection&&renderDayView()}

            {/* 🔥 Movers */}
            {selectedSection==='movers'&&renderMovers()}

            {/* 🤖 AI Insights */}
            {selectedSection==='insights'&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
                  <Brain style={{width:28,height:28,color:'#8b5cf6'}}/>
                  <div>
                    <h2 style={{color:'#f8fafc',fontSize:'1.4rem',fontWeight:800,margin:0}}>תובנות AI</h2>
                    <p style={{color:'#94a3b8',fontSize:'0.82rem',margin:0}}>ניתוח עמוק של הניחושים — {allPredictions.length.toLocaleString()} ניחושים, {uniquePartCount} משתתפים</p>
                  </div>
                </div>
                {insightsLoading?(
                  <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(139,92,246,0.3)'}}>
                    <CardContent className="p-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{color:'#8b5cf6'}}/>
                      <p style={{color:'#94a3b8'}}>מנתח נתונים...</p>
                    </CardContent>
                  </Card>
                ):aiInsights&&aiInsights.length>0?(
                  <div className="grid md:grid-cols-2 gap-4">
                    {aiInsights.map(ins=><InsightCard key={ins.id} insight={ins}/>)}
                  </div>
                ):(
                  <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(139,92,246,0.3)'}}>
                    <CardContent className="p-12 text-center">
                      <span style={{fontSize:'2.5rem'}}>🧠</span>
                      <p style={{color:'#a78bfa',fontWeight:700,marginTop:12}}>אין מספיק נתונים לתובנות</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ⚽ משחקים — שלבים וגם ימים מהלוח */}
            {(isRoundsSection||(isDaySection&&(matchesByDay[selectedSection.replace('day_','')]||[]).length>0))&&(
              <div className="space-y-6" style={isDaySection?{marginTop:'16px'}:undefined}>
                {gameStats!==null?(
                  <>
                    <div className="grid md:grid-cols-3 gap-4">
                      {[{label:'משחקים',val:gameStatsArr.length,c:'rgba(59,130,246,0.2)',b:'rgba(59,130,246,0.3)',tc:'text-blue-200'},
                        {label:'משתתפים',val:uniquePartCount,c:'rgba(16,185,129,0.2)',b:'rgba(16,185,129,0.3)',tc:'text-green-200'},
                        {label:'ניחושים',val:gameStatsArr.reduce((s,g)=>s+g.totalPredictions,0),c:'rgba(139,92,246,0.2)',b:'rgba(139,92,246,0.3)',tc:'text-purple-200'}
                      ].map(({label,val,c,b,tc})=>(
                        <Card key={label} style={{background:`linear-gradient(135deg,${c},${c})`,border:`1px solid ${b}`}}>
                          <CardHeader className="pb-2"><CardTitle className={`${tc} text-sm`}>{label}</CardTitle></CardHeader>
                          <CardContent><p className="text-3xl font-bold text-white">{val.toLocaleString()}</p></CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className={`grid grid-cols-1 ${isDaySection?'':'md:grid-cols-2'} gap-6`}>
                      {gameStatsArr.sort((a,b)=>parseQId(a.question.question_id)-parseQId(b.question.question_id)).map(game=>{
                        const q=game.question;
                        const homeT=teams[normalizeTeam(q.home_team)],awayT=teams[normalizeTeam(q.away_team)];
                        const hasActual=q.actual_result?.trim()&&q.actual_result!=='__CLEAR__';
                        const outcomes=analyzeOutcomes(game.chartData);
                        const od=gameOutcomeParticipants.get(q.id)||{homeWinParticipants:[],drawParticipants:[],awayWinParticipants:[]};
                        const tot=outcomes.homeWins+outcomes.draws+outcomes.awayWins;
                        const outcomeItems=[
                          {cnt:outcomes.homeWins,pct2:tot>0?Math.round((outcomes.homeWins/tot)*100):0,pts:od.homeWinParticipants,c:'#10b981',l:`ניצחון ${cleanTeam(q.home_team)}`,k:`game_${q.id}_home`},
                          {cnt:outcomes.draws,pct2:tot>0?Math.round((outcomes.draws/tot)*100):0,pts:od.drawParticipants,c:'#f59e0b',l:'תיקו',k:`game_${q.id}_draw`},
                          {cnt:outcomes.awayWins,pct2:tot>0?Math.round((outcomes.awayWins/tot)*100):0,pts:od.awayWinParticipants,c:'#ef4444',l:`ניצחון ${cleanTeam(q.away_team)}`,k:`game_${q.id}_away`},
                        ];
                        return(
                          <Card key={q.id} className="bg-slate-800/40 border-slate-700">
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" style={{borderColor:'rgba(6,182,212,0.5)',color:'#06b6d4'}}>{q.question_id}</Badge>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {homeT?.logo_url&&<img src={homeT.logo_url} alt="" className="w-5 h-5 rounded-full"/>}
                                    <span className="text-slate-200 text-sm">{cleanTeam(q.home_team)}</span>
                                    <span className="text-slate-500 text-xs">נגד</span>
                                    <span className="text-slate-200 text-sm">{cleanTeam(q.away_team)}</span>
                                    {awayT?.logo_url&&<img src={awayT.logo_url} alt="" className="w-5 h-5 rounded-full"/>}
                                  </div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  {hasActual&&<Badge style={{background:'linear-gradient(135deg,#f59e0b,#d97706)',color:'white'}}>⭐ {formatResult(q.actual_result)}</Badge>}
                                  <Badge style={{background:'linear-gradient(135deg,#16a34a,#15803d)',color:'white'}}>{game.totalPredictions} ניחושים</Badge>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="mb-4 rounded-lg p-3" style={{background:'rgba(6,182,212,0.1)',border:'1px solid rgba(6,182,212,0.2)'}}>
                                <p style={{color:'#64748b',fontSize:'0.68rem',textAlign:'center',marginBottom:6}}>לחץ על תוצאה לרשימת משתתפים</p>
                                <div style={{display:'flex',gap:6,justifyContent:'center'}}>
                                  {outcomeItems.map(({cnt,pct2,c,l,k})=>(
                                    <button key={k} onClick={()=>lockPanel(k,{title:l,count:cnt,percentage:pct2,participants:outcomeItems.find(x=>x.k===k)?.pts||[],color:c})}
                                      style={{flex:1,padding:'8px 4px',borderRadius:8,background:lockedPanel[k]?`${c}25`:'rgba(15,23,42,0.5)',border:`2px solid ${lockedPanel[k]?c:c+'40'}`,cursor:'pointer',transition:'all 0.15s'}}>
                                      <div style={{color:c,fontWeight:700,fontSize:'1.2rem'}}>{cnt}</div>
                                      <div style={{color:'#94a3b8',fontSize:'0.68rem'}}>{pct2}%</div>
                                      <div style={{color:c,fontSize:'0.6rem',marginTop:1}}>{l}</div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {outcomeItems.map(({k,l,cnt,pct2,pts,c})=>
                                lockedPanel[k]&&<ParticipantPanel key={k} title={l} count={cnt} percentage={pct2} participants={pts} color={c} onClose={()=>closePanel(k)}/>
                              )}

                              <div style={{position:'relative'}}>
                              {statsParticipant && myPredByQid[q.id] && (
                                <div style={{position:'absolute',top:8,right:8,zIndex:5,background:'#0f1f1a',border:'1px solid #1D9E75',borderRadius:8,padding:'6px 11px',display:'flex',alignItems:'center',gap:6}}>
                                  <span style={{fontSize:'0.72rem',color:'#5DCAA5',fontWeight:600}}>ההימור שלי:</span>
                                  <span style={{fontSize:'0.9rem',color:'#f8fafc',fontWeight:600}}>{formatResult(myPredByQid[q.id])}</span>
                                </div>
                              )}
                              <ResponsiveContainer width="100%" height={460}>
                                <RechartsPieChart>
                                  <Pie data={game.chartData} cx="50%" cy="45%" startAngle={-60} endAngle={300} outerRadius={140} dataKey="value" labelLine={false}
                                    label={({cx,cy,midAngle,outerRadius,name,percentage})=>{
                                      const R=Math.PI/180,p=parseFloat(percentage),display=formatResult(name);
                                      if(p>10){const r=outerRadius*0.65,x=cx+r*Math.cos(-midAngle*R),y=cy+r*Math.sin(-midAngle*R);return <g><text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'11px',fontWeight:'bold'}}>{display}</text><text x={x} y={y+14} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'9px'}}>{p}%</text></g>;}
                                      const lr=outerRadius+26,x=cx+lr*Math.cos(-midAngle*R),y=cy+lr*Math.sin(-midAngle*R);
                                      return <g><text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'9px',fontWeight:'bold'}}>{display}</text><text x={x} y={y+12} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'8px'}}>{p}%</text></g>;
                                    }}
                                    onClick={entry=>{const panelKey=`pie_${q.id}_${entry.name}`;const pts=getParticipants(q.id,entry.name);lockPanel(panelKey,{title:formatResult(entry.name),count:entry.value,percentage:entry.percentage,participants:pts,color:'#06b6d4'});}}>
                                    {game.chartData.map((entry,i)=>{
                                      const isActual=hasActual&&normPred(entry.name)===normPred(q.actual_result);
                                      const panelKey=`pie_${q.id}_${entry.name}`;
                                      return <Cell key={i} fill={COLORS[i%COLORS.length]} stroke={isActual?'#fbbf24':lockedPanel[panelKey]?'#fff':'rgba(15,23,42,0.8)'} strokeWidth={isActual||lockedPanel[panelKey]?3:2} style={{cursor:'pointer'}}/>;
                                    })}
                                  </Pie>
                                  <Tooltip cursor={false} content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:'1px solid #06b6d4',borderRadius:6,padding:'8px 12px',pointerEvents:'none'}}><p style={{color:'#06b6d4',fontWeight:700,fontSize:'0.82rem'}}>{formatResult(payload[0].payload.name)}</p><p style={{color:'#f8fafc',fontSize:'0.78rem'}}>{payload[0].value} ניחושים ({payload[0].payload.percentage}%)</p><p style={{color:'#64748b',fontSize:'0.7rem',marginTop:2}}>לחץ לנעילה</p></div>:null}/>
                                </RechartsPieChart>
                              </ResponsiveContainer>
                              </div>

                              {game.chartData.map(entry=>{const pk=`pie_${q.id}_${entry.name}`;return lockedPanel[pk]&&<ParticipantPanel key={pk} title={formatResult(entry.name)} count={entry.value} percentage={entry.percentage} participants={getParticipants(q.id,entry.name)} color={COLORS[game.chartData.indexOf(entry)%COLORS.length]} onClose={()=>closePanel(pk)}/>;
                              })}
                              {hasActual&&<div className="mt-3 p-3 rounded-lg text-center" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)'}}><p style={{color:'#fde68a',fontWeight:'bold'}}>⭐ תוצאת אמת: {formatResult(q.actual_result)}</p></div>}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                ):<Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(6,182,212,0.2)'}}><CardContent className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{color:'#06b6d4'}}/><p style={{color:'#94a3b8'}}>טוען נתונים...</p></CardContent></Card>}
              </div>
            )}

            {/* 📋 עולות — גרף מרוכז יחיד */}
            {isQualSection&&(
              <div className="space-y-6">
                {specialStats?(
                  Object.values(specialStats).map(ts=>{
                    const {table,qualifierData}=ts;
                    if(!qualifierData) return null;
                    const {chartData,cfg,advCount,participantsMap,isGroupLeaders,winnersData,runnersData}=qualifierData;

                    // 🆕 T16 — שלושה גרפים נפרדים: ראש בית, סגנית, משולב
                    if(isGroupLeaders&&winnersData&&runnersData){
                      return(
                        <div key={table.id} style={{display:'flex',flexDirection:'column',gap:16}}>
                          <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(16,185,129,0.4)'}}>
                            <CardHeader><CardTitle style={{color:'#10b981'}}>🥇 ראש בית — מי תסיים ראשונה בבית</CardTitle><p style={{fontSize:'0.78rem',color:'#94a3b8',marginTop:4}}>12 חריצים • לחץ על קבוצה לנעילת רשימה</p></CardHeader>
                            <CardContent className="px-2 pb-6"><TeamListBarChart chartData={winnersData.chartData} participantsMap={winnersData.participantsMap} panelKey={`qual_${table.id}_win`} accent="#10b981" compact lockedPanel={lockedPanel} lockPanel={lockPanel} closePanel={closePanel}/></CardContent>
                          </Card>
                          <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(245,158,11,0.4)'}}>
                            <CardHeader><CardTitle style={{color:'#f59e0b'}}>🥈 סגנית — מי תסיים שנייה בבית</CardTitle><p style={{fontSize:'0.78rem',color:'#94a3b8',marginTop:4}}>12 חריצים • לחץ על קבוצה לנעילת רשימה</p></CardHeader>
                            <CardContent className="px-2 pb-6"><TeamListBarChart chartData={runnersData.chartData} participantsMap={runnersData.participantsMap} panelKey={`qual_${table.id}_run`} accent="#f59e0b" compact lockedPanel={lockedPanel} lockPanel={lockPanel} closePanel={closePanel}/></CardContent>
                          </Card>
                          <Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(249,115,22,0.35)'}}>
                            <CardHeader><CardTitle style={{color:'#f97316'}}>📋 משולב — ראש בית + סגנית יחד</CardTitle><p style={{fontSize:'0.78rem',color:'#94a3b8',marginTop:4}}>{advCount} חריצים • ניתוח כולל ללא תלות במיקום • לחץ על קבוצה לנעילת רשימה</p></CardHeader>
                            <CardContent className="px-2 pb-6"><TeamListBarChart chartData={chartData} participantsMap={participantsMap} panelKey={`qual_${table.id}`} accent="#f97316" compact lockedPanel={lockedPanel} lockPanel={lockPanel} closePanel={closePanel}/></CardContent>
                          </Card>
                        </div>
                      );
                    }

                    return(
                      <Card key={table.id} style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(249,115,22,0.35)'}}>
                        <CardHeader>
                          <CardTitle style={{color:'#f97316'}}>📋 {table.description}</CardTitle>
                          <p style={{fontSize:'0.78rem',color:'#94a3b8',marginTop:4}}>לחץ על קבוצה לנעילת רשימת משתתפים{cfg?` • ${advCount} קבוצות • בונוס: +${cfg.bonus} נק'`:''}</p>
                        </CardHeader>
                        <CardContent className="px-2 pb-6">
                          <TeamListBarChart chartData={chartData} participantsMap={participantsMap} panelKey={`qual_${table.id}`} accent="#f97316" lockedPanel={lockedPanel} lockPanel={lockPanel} closePanel={closePanel}/>
                        </CardContent>
                      </Card>
                    );
                  })
                ):<Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(249,115,22,0.2)'}}><CardContent className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{color:'#f97316'}}/><p style={{color:'#94a3b8'}}>טוען...</p></CardContent></Card>}
              </div>
            )}

            {/* ✨ שאלות מיוחדות */}
            {isSpecialSection&&!specialStats&&<Card style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(6,182,212,0.2)'}}><CardContent className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{color:'#06b6d4'}}/><p style={{color:'#94a3b8'}}>טוען...</p></CardContent></Card>}

            {isSpecialSection&&specialStats&&(
              <div className="space-y-6">
                {Object.values(specialStats).map(ts=>(
                  <div key={ts.table.id}>
                    <h2 className="text-2xl font-bold text-white mb-4">{ts.table.description}</h2>

                    {ts.qualifierData?.isSpecialTeamList && <SpecialTeamListChart
                      table={ts.table}
                      qualifierData={ts.qualifierData}
                      lockedPanel={lockedPanel}
                      lockPanel={lockPanel}
                      closePanel={closePanel}
                    />}

                    {!ts.qualifierData?.isSpecialTeamList && ts.locationsData&&(
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          <Card className="bg-slate-800/40 border-slate-700"><CardContent className="p-4"><p className="text-sm text-slate-400">סה"כ בחירות</p><p className="text-3xl font-bold text-cyan-400">{ts.locationsData.totalPredictions}</p></CardContent></Card>
                          <Card className="bg-slate-800/40 border-slate-700"><CardContent className="p-4"><p className="text-sm text-slate-400">קבוצות ייחודיות</p><p className="text-3xl font-bold text-blue-400">{ts.locationsData.uniqueTeams}</p></CardContent></Card>
                          <Card className="bg-slate-800/40 border-slate-700"><CardContent className="p-4"><p className="text-sm text-slate-400">הכי פופולרית</p><p className="text-lg font-bold text-green-400">{ts.locationsData.mostPopular.team}</p></CardContent></Card>
                        </div>
                        <Card className="bg-slate-800/40 border-slate-700">
                          <CardHeader><CardTitle className="text-cyan-300">10 הקבוצות הפופולריות ביותר</CardTitle></CardHeader>
                          <CardContent className="px-2 pb-3">
                            <ResponsiveContainer width="100%" height={380}>
                              <BarChart data={ts.locationsData.topTeams.slice(0,10)} margin={{top:20,right:0,left:0,bottom:120}}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
                                <XAxis dataKey="team" angle={0} textAnchor="middle" height={110} stroke="#94a3b8" interval={0} tick={({x,y,payload})=>{const ws=String(payload.value).split(' ');const ls=[];let cur='';ws.forEach(w=>{const t=cur?`${cur} ${w}`:w;if(t.length<=10)cur=t;else{if(cur)ls.push(cur);cur=w;}});if(cur)ls.push(cur);return <g transform={`translate(${x},${y})`}>{ls.slice(0,3).map((l,i)=><text key={i} x={0} y={i*14+10} textAnchor="middle" fill="#94a3b8" fontSize="10px">{l}</text>)}</g>;}}/>
                                <YAxis stroke="#94a3b8" tick={{fontSize:12,fill:'#94a3b8'}}/>
                                <Tooltip cursor={false} content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:'1px solid #06b6d4',borderRadius:6,padding:'8px 12px',pointerEvents:'none'}}><p style={{color:'#06b6d4',fontWeight:700}}>{payload[0].payload.team}</p><p style={{color:'#f8fafc'}}>{payload[0].value} בחירות</p></div>:null}/>
                                <Bar dataKey="count" radius={[8,8,0,0]}>
                                  {ts.locationsData.topTeams.slice(0,10).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {!ts.qualifierData?.isSpecialTeamList && !ts.locationsData&&(
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {ts.questions.filter(qs=>qs.question.question_id!=='11.1').sort((a,b)=>parseFloat(a.question.question_id)-parseFloat(b.question.question_id)).map(qStat=>{
                          const q=qStat.question;
                          const usePie=qStat.chartData.length<=4&&qStat.chartData.length>0;
                          // 🆕 שאלות עם תוויות ארוכות (שמות נבחרות/שחקנים) או הרבה תשובות → עמודות אופקיות:
                          //    כל שם מוצג במלואו בשורה משלו, במקום תוויות דחוסות ובלתי-קריאות על ציר ה-X.
                          const longLabel=qStat.chartData.some(d=>isNaN(Number(String(d.answer).trim()))&&String(d.answer).trim().length>5);
                          const useHorizontal=!usePie&&(qStat.chartData.length>7||longLabel);
                          // בגרף אופקי ממיינים יורד (הפופולרי למעלה); באנכי משאירים את סדר ה-alternateSlice
                          const chartRows=useHorizontal?[...qStat.chartData].sort((a,b)=>b.count-a.count):qStat.chartData;
                          const chartH=useHorizontal?Math.max(240,qStat.chartData.length*26):240;
                          const hasActual=q.actual_result?.trim()&&q.actual_result!=='__CLEAR__';
                          const panelKey=`special_${q.id}`;
                          return(
                            <Card key={q.id} data-chart-card className="bg-slate-800/40 border-slate-700 flex flex-col">
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline" style={{borderColor:'rgba(6,182,212,0.5)',color:'#06b6d4',minWidth:'50px'}} className="justify-center">{q.question_id}</Badge>
                                  <div className="flex items-center gap-1.5">
                                    <button type="button" title="העתק תמונה של הגרף"
                                      onClick={e=>copyChartImage(e.currentTarget.closest('[data-chart-card]'),`גרף_${q.question_id}`)}
                                      data-html2canvas-ignore="true"
                                      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-cyan-500/20"
                                      style={{border:'1px solid rgba(6,182,212,0.4)',color:'#06b6d4'}}>
                                      <Copy size={14}/>
                                    </button>
                                    <Badge className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xs">{qStat.totalAnswers} תשובות</Badge>
                                  </div>
                                </div>
                                <p className="text-sm text-slate-200 leading-tight min-h-[36px]">{q.question_text}</p>
                                <p style={{color:'#64748b',fontSize:'0.68rem',marginTop:2}}>לחץ על קטע לנעילת רשימה</p>
                              </CardHeader>
                              <CardContent className="px-2 pb-3 flex-1 flex flex-col">
                                {qStat.chartData.length>0?(
                                  <>
                                    {statsParticipant && myPredByQid[q.id] && (
                                      <div style={{display:'inline-flex',alignSelf:'flex-start',alignItems:'center',gap:6,background:'#0f1f1a',border:'1px solid #1D9E75',borderRadius:8,padding:'4px 10px',marginBottom:6}}>
                                        <span style={{fontSize:'0.68rem',color:'#5DCAA5',fontWeight:600}}>ההימור שלי:</span>
                                        <span style={{fontSize:'0.82rem',color:'#f8fafc',fontWeight:600}}>{formatResult(myPredByQid[q.id])}</span>
                                      </div>
                                    )}
                                    <div style={{height:chartH+'px',display:'flex',alignItems:useHorizontal?'stretch':'flex-end',direction:useHorizontal?'ltr':'rtl'}}>
                                      <ResponsiveContainer width="100%" height="100%">
                                        {usePie?(
                                          <RechartsPieChart>
                                            <Pie data={qStat.chartData} cx="50%" cy="50%" outerRadius={80} dataKey="count" labelLine={false}
                                              label={({cx,cy,midAngle,outerRadius,answer,percentage})=>{const R=Math.PI/180,p=parseFloat(percentage),clean=answer.replace(':','').trim();if(p>15){const r=outerRadius*0.65,x=cx+r*Math.cos(-midAngle*R),y=cy+r*Math.sin(-midAngle*R);return <g><text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'11px',fontWeight:'bold'}}>{clean}</text><text x={x} y={y+12} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'9px'}}>{p}%</text></g>;}const lr=outerRadius+24,x=cx+lr*Math.cos(-midAngle*R),y=cy+lr*Math.sin(-midAngle*R);return <g><text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'10px'}}>{clean}</text><text x={x} y={y+11} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{fontSize:'8px'}}>{p}%</text></g>;}}
                                              onClick={entry=>lockPanel(panelKey,{title:entry.answer,count:entry.count,percentage:entry.percentage,participants:getParticipants(q.id,entry.answer),color:COLORS[qStat.chartData.indexOf(entry)%COLORS.length]})}>
                                              {qStat.chartData.map((e,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} stroke={hasActual&&e.answer===q.actual_result?'#fbbf24':lockedPanel[panelKey]?.title===e.answer?'#fff':'rgba(15,23,42,0.8)'} strokeWidth={2} style={{cursor:'pointer'}}/>)}
                                            </Pie>
                                            <Tooltip cursor={false} content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:'1px solid #06b6d4',borderRadius:6,padding:'8px 10px',pointerEvents:'none'}}><p style={{color:'#06b6d4',fontWeight:700,fontSize:'0.82rem'}}>{payload[0].payload.answer}</p><p style={{color:'#f8fafc',fontSize:'0.78rem'}}>{payload[0].value} ({payload[0].payload.percentage}%)</p><p style={{color:'#64748b',fontSize:'0.7rem',marginTop:2}}>לחץ לנעילה</p></div>:null}/>
                                          </RechartsPieChart>
                                        ):useHorizontal?(
                                          <BarChart data={chartRows} layout="vertical" margin={{top:4,right:46,left:4,bottom:4}}
                                            onClick={data=>{if(data?.activePayload?.[0]){const e=data.activePayload[0].payload;lockPanel(panelKey,{title:e.answer,count:e.count,percentage:e.percentage,participants:getParticipants(q.id,e.answer),color:'#06b6d4'});}}}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false}/>
                                            <XAxis type="number" stroke="#94a3b8" allowDecimals={false} tick={{fontSize:10,fill:'#94a3b8'}}/>
                                            <YAxis type="category" dataKey="answer" width={145} interval={0} stroke="#334155" tick={{fontSize:10,fill:'#f8fafc',fontFamily:'Rubik,Heebo,sans-serif'}}/>
                                            <Tooltip cursor={{fill:'rgba(6,182,212,0.08)'}} content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:'1px solid #06b6d4',borderRadius:6,padding:'8px 10px',pointerEvents:'none'}}><p style={{color:'#06b6d4',fontWeight:700,fontSize:'0.82rem'}}>{payload[0].payload.answer}</p><p style={{color:'#f8fafc',fontSize:'0.78rem'}}>{payload[0].value} ({payload[0].payload.percentage}%)</p><p style={{color:'#64748b',fontSize:'0.7rem',marginTop:2}}>לחץ לנעילה</p></div>:null}/>
                                            <Bar dataKey="count" radius={[0,5,5,0]} style={{cursor:'pointer'}}>
                                              <LabelList dataKey="count" position="right" style={{fontSize:'9px',fill:'#94a3b8'}}/>
                                              {chartRows.map((e,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} stroke={hasActual&&e.answer===q.actual_result?'#fbbf24':'none'} strokeWidth={hasActual&&e.answer===q.actual_result?2:0}/>)}
                                            </Bar>
                                          </BarChart>
                                        ):(
                                          <BarChart data={qStat.chartData} margin={{top:8,right:5,left:5,bottom:55}}
                                            onClick={data=>{if(data?.activePayload?.[0]){const e=data.activePayload[0].payload;lockPanel(panelKey,{title:e.answer,count:e.count,percentage:e.percentage,participants:getParticipants(q.id,e.answer),color:'#06b6d4'});}}}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
                                            <XAxis dataKey="answer" stroke="#94a3b8" interval={0} height={55} tick={({x,y,payload})=>{const ws=String(payload.value).split(' ');const ls=[];let cur='';ws.forEach(w=>{const t=cur?`${cur} ${w}`:w;if(t.length<=8)cur=t;else{if(cur)ls.push(cur);cur=w;}});if(cur)ls.push(cur);return <g transform={`translate(${x},${y})`}>{ls.slice(0,3).map((l,i)=><text key={i} x={0} y={i*10+6} textAnchor="middle" fill="#94a3b8" fontSize="8px">{l}</text>)}</g>;}}/>
                                            <YAxis stroke="#94a3b8" tick={{fontSize:10,fill:'#94a3b8'}}/>
                                            <Tooltip cursor={{fill:'rgba(6,182,212,0.08)'}} content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:'1px solid #06b6d4',borderRadius:6,padding:'8px 10px',pointerEvents:'none'}}><p style={{color:'#06b6d4',fontWeight:700,fontSize:'0.82rem'}}>{payload[0].payload.answer}</p><p style={{color:'#f8fafc',fontSize:'0.78rem'}}>{payload[0].value} ({payload[0].payload.percentage}%)</p><p style={{color:'#64748b',fontSize:'0.7rem',marginTop:2}}>לחץ לנעילה</p></div>:null}/>
                                            <Bar dataKey="count" radius={[5,5,0,0]} style={{cursor:'pointer'}}>
                                              {qStat.chartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                                            </Bar>
                                          </BarChart>
                                        )}
                                      </ResponsiveContainer>
                                    </div>
                                    {lockedPanel[panelKey]&&<ParticipantPanel title={lockedPanel[panelKey].title} count={lockedPanel[panelKey].count} percentage={lockedPanel[panelKey].percentage} participants={lockedPanel[panelKey].participants} color={lockedPanel[panelKey].color||'#06b6d4'} onClose={()=>closePanel(panelKey)}/>}
                                    <div className="mt-3 pt-3 border-t border-slate-700 px-2">
                                      <p className="text-xs text-slate-400 mb-1">הכי פופולרי: <span className="text-cyan-300 font-bold">{qStat.mostPopular.answer}</span> ({qStat.mostPopular.count}, {qStat.mostPopular.percentage}%)</p>
                                      {hasActual&&<div className="mt-2 p-2 rounded" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)'}}><p className="text-yellow-300 font-bold text-xs">⭐ תוצאת אמת: {q.actual_result}</p></div>}
                                      <p className="text-slate-500 text-xs mt-1">{qStat.diversity} תשובות שונות</p>
                                    </div>
                                  </>
                                ):<div className="text-center py-8 text-slate-500">אין נתונים</div>}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!selectedSection&&(
              <Card className="bg-slate-800/40 border-slate-700">
                <CardContent className="p-12 text-center">
                  <PieChart className="w-20 h-20 text-slate-600 mx-auto mb-4"/>
                  <p className="text-slate-400 text-lg">בחר יום בלוח 📅 או שלב מהתפריט לסטטיסטיקות מפורטות</p>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
