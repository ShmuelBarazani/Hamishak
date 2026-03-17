import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Users, Target, Loader2, PieChart, TrendingUp,
  Award, AlertTriangle, Trophy, Brain, Zap, Star, ThumbsUp, ThumbsDown
} from "lucide-react";
import {
  PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer,
  Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useGame } from "@/components/contexts/GameContext";

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];

const ADVANCING_CONFIG = { T4:{count:8,bonus:16}, T5:{count:4,bonus:12}, T6:{count:2,bonus:6} };

// ─── Utils ────────────────────────────────────────────────────────────────────
const NC = new Map(), CC = new Map(), PC = new Map();
const normalizeTeam = n => { if(!n) return n; if(NC.has(n)) return NC.get(n); const r=n.replace(/קרבאך/g,'קרבאח').replace(/קראבח/g,'קרבאח').replace(/קראבך/g,'קרבאח').trim(); NC.set(n,r); return r; };
const cleanTeam    = n => { if(!n) return n; if(CC.has(n)) return CC.get(n); const r=n.replace(/\s*\([^)]+\)\s*$/,'').trim(); CC.set(n,r); return r; };
const normPred     = s => s ? s.replace(/\s+/g,'').trim() : '';
const parseQId     = id => { if(!id) return 0; if(PC.has(id)) return PC.get(id); const r=parseFloat(id.replace(/[^\d.]/g,''))||0; PC.set(id,r); return r; };
const pct          = (n,d) => d>0 ? ((n/d)*100).toFixed(1) : '0.0';
const extractCountry = name => { const m=name?.match(/\(([^)]+)\)$/); return m?m[1]:null; };

const alternateSlice = data => {
  if(!data||data.length<=2) return data;
  const s=[...data].sort((a,b)=>(b.value||b.count||0)-(a.value||a.count||0));
  const mid=Math.ceil(s.length/2), L=s.slice(0,mid), R=s.slice(mid).reverse(), res=[];
  for(let i=0;i<Math.max(L.length,R.length);i++){if(i<L.length)res.push(L[i]);if(i<R.length)res.push(R[i]);}
  return res;
};

const loadAllPreds = async gameId => {
  // ✅ טוען מ-predictions (לא game_predictions view) כדי לקבל home_prediction/away_prediction
  let all=[],from=0;
  while(true){
    const{data,error}=await supabase.from('predictions').select('*').eq('game_id',gameId).range(from,from+999);
    if(error){console.warn('predictions fetch error:',error.message);break;}
    if(!data?.length) break;
    all=all.concat(data);
    if(data.length<1000) break;
    from+=1000;
  }
  if(all.length>0) return all;
  // fallback
  let allFb=[],off=0;const seen=new Set();let mx=20;
  while(mx-->0){const b=await db.Prediction.filter({game_id:gameId},null,1000,off);if(!b?.length)break;const n=b.filter(p=>!seen.has(p.id));if(!n.length)break;n.forEach(p=>seen.add(p.id));allFb=allFb.concat(n);if(b.length<1000)break;off+=1000;}
  return allFb;
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
function computeInsights(allQuestions, allPredictions, teams) {
  const insights = [];
  if (!allPredictions.length || !allQuestions.length) return insights;

  const qById = Object.fromEntries(allQuestions.map(q=>[q.id,q]));

  // dedup: last prediction per participant per question
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

  // ── 2. העדפת מדינות ────────────────────────────────────────────────────
  {
    const countryCounts = {};
    const advQIds = new Set(allQuestions.filter(q=>['T4','T5','T6'].includes(q.table_id)&&!q.home_team).map(q=>q.id));
    preds.forEach(p=>{
      if(!advQIds.has(p.question_id)||!p.text_prediction?.trim()) return;
      const country = extractCountry(p.text_prediction);
      if(country) countryCounts[country]=(countryCounts[country]||0)+1;
    });
    const sorted=Object.entries(countryCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if(sorted.length>0){
      const topCountry=sorted[0][0];
      insights.push({
        id:'country_pref', icon:'🌍', title:'העדפת מדינות',
        category:'העדפות',
        color:'#10b981',
        summary:`${topCountry} היא המדינה הכי מנוחשת לשלוח קבוצות לשלבים הבאים`,
        chartData:sorted.map(([name,value])=>({name,value})),
        chartType:'bar_h',
        detail:`המנחשים מעדיפים קבוצות מ-${topCountry} (${sorted[0][1]} בחירות). זה משקף אהדה, היכרות, או ציפייה ריאלית.`,
      });
    }
  }

  // ── 3. יחס כן/לא ───────────────────────────────────────────────────────
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

  // ── 4. קונצנזוס לעומת מחלוקת ──────────────────────────────────────────
  {
    const qAgreement = [];
    allQuestions.filter(q=>q.table_id!=='T1').forEach(q=>{
      // כולל שאלות match (עם normalized text_prediction)
      const qPreds = preds.filter(p => p.question_id === q.id && p.text_prediction?.trim());
      if (qPreds.length < 3) return; // מינימום 3 תשובות
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
    // מחלוקת = הכי הרבה תשובות שונות (גיוון), לא הכי נמוך הסכמה
    const byDiversity = [...qAgreement].sort((a,b)=>b.uniqueAnswers-a.uniqueAnswers);
    const highDispute  = byDiversity.slice(0,3);
    if (qAgreement.length > 0) {
      insights.push({
        id:'consensus', icon:'🤝', title:'קונצנזוס ומחלוקת',
        category:'ניתוח קהל',
        color:'#8b5cf6',
        summary:`הכי מוסכמת: ${(highConsensus[0]?.agreement*100||0).toFixed(0)}% הסכמה | הכי מגוונת: ${highDispute[0]?.uniqueAnswers||0} תשובות שונות`,
        consensusData: highConsensus.map(d=>({
          question: (d.q.home_team&&d.q.away_team) ? `${cleanTeam(d.q.home_team)} נגד ${cleanTeam(d.q.away_team)}` : (d.q.question_text||`שאלה ${d.q.question_id}`),
          agreement: (d.agreement*100).toFixed(1),
          topAnswer: d.topAnswer, total: d.total, topCount: d.topCount
        })),
        disputeData: highDispute.map(d=>({
          question: (d.q.home_team&&d.q.away_team) ? `${cleanTeam(d.q.home_team)} נגד ${cleanTeam(d.q.away_team)}` : (d.q.question_text||`שאלה ${d.q.question_id}`),
          agreement: (d.agreement*100).toFixed(1),
          topAnswer: d.topAnswer, total: d.total, topCount: d.topCount, uniqueAnswers: d.uniqueAnswers
        })),
        chartType:'consensus',
        detail:`נותחו ${qAgreement.length} שאלות. שאלות בעלות הסכמה גבוהה מלמדות על קונצנזוס. שאלות עם ריבוי תשובות מלמדות על אי-ודאות.`,
      });
    }
  }

  // ── 5. מנחשי אאוטסיידר — מי בחר הכי נדיר ─────────────────────────────
  {
    // build answer popularity per question
    const qAnswerPop = {};
    allQuestions.filter(q=>q.table_id!=='T1').forEach(q=>{
      const qPreds=preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim());
      if(qPreds.length<5) return;
      const total=qPreds.length, counts={};
      qPreds.forEach(p=>{const v=p.text_prediction.trim();counts[v]=(counts[v]||0)+1;});
      qAnswerPop[q.id]={total, counts};
    });
    // per participant: avg popularity of their answers
    const participantRarity = {};
    preds.forEach(p=>{
      if(!p.text_prediction?.trim()) return;
      const pop=qAnswerPop[p.question_id];
      if(!pop) return;
      const cnt=pop.counts[p.text_prediction.trim()]||1;
      const rarity=1-(cnt/pop.total); // 1=most rare, 0=most common
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
        id:'outsiders', icon:'🦄', title:'אינדיווידואליסטים לעומת עדר',
        category:'ניתוח משתתפים',
        color:'#ec4899',
        summary:`${topOutsider.name} הכי אינדיווידואליסטי (${topOutsider.avgRarity.toFixed(1)}% נדירות). ${topFollower.name} הכי הולך עם הקהל.`,
        chartData:sorted.slice(0,10).map(d=>({name:d.name,value:parseFloat(d.avgRarity.toFixed(1))})),
        chartType:'bar_h',
        detail:'ציון גבוה = בחר תשובות שמעט אנשים אחרים בחרו. ציון נמוך = הלך עם הרוב.',
        bottomData:sorted.slice(-5).reverse().map(d=>({name:d.name,value:parseFloat(d.avgRarity.toFixed(1))})),
      });
    }
  }

  // ── 6. דיוק העדר — האם הנפוץ ביותר נכון? ─────────────────────────────
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

  // ── 7. מנחשים מפתיעים — נכון כשכולם טעו ─────────────────────────────
  {
    const surpriseScore = {};
    allQuestions.filter(q=>q.table_id!=='T1'&&q.actual_result?.trim()&&q.actual_result!=='__CLEAR__').forEach(q=>{
      const qPreds=preds.filter(p=>p.question_id===q.id&&p.text_prediction?.trim());
      if(qPreds.length<5) return;
      const total=qPreds.length, actual=normPred(q.actual_result.trim());
      const correctPreds=qPreds.filter(p=>normPred(p.text_prediction.trim())===actual);
      if(correctPreds.length===0) return;
      const rarity=1-(correctPreds.length/total); // how rare to be correct
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

  // ── 8. שיאני הסיכון — תוצאות קיצוניות ──────────────────────────────
  {
    const riskScore = {};
    const matchQIds = new Set(matchQs.map(q=>q.id));
    preds.forEach(p=>{
      if(!matchQIds.has(p.question_id)||!p.text_prediction?.trim()) return;
      const parts=p.text_prediction.split('-').map(x=>parseInt(x.trim()));
      if(parts.length!==2||isNaN(parts[0])||isNaN(parts[1])) return;
      const totalGoals=parts[0]+parts[1];
      const diff=Math.abs(parts[0]-parts[1]);
      const riskLevel=totalGoals+diff; // more goals + bigger diff = riskier
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

  // ── 9. ממוצע שערים מנוחש לעומת בפועל ────────────────────────────────
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

  // ── 10. מנחש "הנביא" — כמה ניחושים נכונים ────────────────────────────
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

  // ── 11. כמות ניחושים — מי הכי מחויב ────────────────────────────────
  {
    const predCount = {};
    preds.forEach(p=>{predCount[p.participant_name]=(predCount[p.participant_name]||0)+1;});
    const sorted=Object.entries(predCount).sort((a,b)=>b[1]-a[1]);
    const maxQ=allQuestions.filter(q=>q.table_id!=='T1').length;
    if(sorted.length>0){
      insights.push({
        id:'participation', icon:'📊', title:'מחויבות — כמה שאלות מולאו',
        category:'ניתוח משתתפים',
        color:'#84cc16',
        summary:`${sorted[0][0]} מילא הכי הרבה שאלות: ${sorted[0][1]}${maxQ>0?`/${maxQ}`:''} `,
        chartData:sorted.slice(0,15).map(([name,count])=>({name,value:count})),
        chartType:'bar_h',
        detail:`מתוך ${maxQ} שאלות במשחק. מי שמילא יותר — יש לו יותר סיכוי לצבור נקודות.`,
      });
    }
  }

  return insights;
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insight }) {
  const [expanded, setExpanded] = useState(false);

  const renderChart = () => {
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
            <YAxis type="category" dataKey="name" width={130} stroke="#334155" tick={{fontSize:11,fill:'#f8fafc'}}/>
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
            <XAxis dataKey="name" stroke="#94a3b8" tick={{fontSize:11,fill:'#94a3b8'}}/>
            <YAxis stroke="#94a3b8" tick={{fontSize:10,fill:'#94a3b8'}}/>
            <Tooltip content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:`1px solid ${insight.color}`,borderRadius:6,padding:'8px 12px'}}><p style={{color:insight.color,fontWeight:700}}>{payload[0].payload.name}</p><p style={{color:'#f8fafc'}}>{payload[0].value}</p></div>:null}/>
            <Bar dataKey="value" radius={[6,6,0,0]}>
              {insight.chartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
              </div>
            ))}
          </div>
        </div>
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

// ─── SpecialTeamListChart — גרף מרוכז לרשימת קבוצות (שלב הבתים) ──────────────
function SpecialTeamListChart({ table, qualifierData, lockedPanel, lockPanel, closePanel }) {
  const { chartData, advCount, participantsMap } = qualifierData;
  const total = chartData.reduce((s, d) => s + d.count, 0);
  const panelKey = `special_qual_${table.id}`;
  return (
    <Card style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(139,92,246,0.35)' }}>
      <CardHeader>
        <CardTitle style={{ color: '#8b5cf6' }}>📋 {table.description}</CardTitle>
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
          {advCount} חריצים • ניתוח כולל ללא תלות במיקום • לחץ על קבוצה לנעילת רשימה
        </p>
      </CardHeader>
      <CardContent className="px-2 pb-6">
        {lockedPanel[panelKey] && (
          <ParticipantPanel
            title={lockedPanel[panelKey].title}
            count={lockedPanel[panelKey].count}
            percentage={lockedPanel[panelKey].percentage}
            participants={lockedPanel[panelKey].participants}
            color="#8b5cf6"
            onClose={() => closePanel(panelKey)}
          />
        )}
        {chartData.length > 0 ? (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={Math.max(400, chartData.length * 34)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 60, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="team" width={190} stroke="#334155" tick={{ fontSize: 12, fill: '#f8fafc', fontFamily: 'Rubik,Heebo,sans-serif' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                  content={({ payload }) => payload?.[0] ? (
                    <div style={{ background: '#0a0f1a', border: '1px solid #8b5cf6', borderRadius: 6, padding: '8px 12px', pointerEvents: 'none' }}>
                      <p style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '0.85rem' }}>{payload[0].payload.team}</p>
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
                    lockPanel(panelKey, { title: data.team, count: data.count, percentage: p2, participants: participantsMap[data.team] || [], color: '#8b5cf6' });
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
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
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

  const { currentGame } = useGame();
  const isKnockout = !!(currentGame?.name?.includes('נוק-אאוט')||currentGame?.name?.includes('knock')||currentGame?.id==='9c9c1331-5184-406b-98b3-6becd9577567');

  const formatResult = useCallback(r=>{ if(!r||r==='__CLEAR__') return ''; return r.includes('-')?r.split('-').map(x=>x.trim()).join(' - '):r; },[]);

  const lockPanel  = (key,data) => setLockedPanel(prev=>prev[key]?.title===data?.title?{...prev,[key]:null}:{...prev,[key]:data});
  const closePanel = key => setLockedPanel(prev=>({...prev,[key]:null}));

  // ✅ נקה insights כשמשחק משתנה — תובנות חייבות להיות נפרדות לכל משחק
  useEffect(()=>{
    setAiInsights(null);
    setInsightsLoading(false);
    loadAllData();
  },[currentGame]);

  const loadAllData = async () => {
    if(!currentGame){setLoading(false);return;}
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
        if(q.table_id==='T20'&&q.question_text){
          let ts=null;
          if(q.question_text.includes(' נגד ')) ts=q.question_text.split(' נגד ').map(t=>t.trim());
          else if(q.question_text.includes(' - ')) ts=q.question_text.split(' - ').map(t=>t.trim());
          if(ts&&ts.length===2){q.home_team=normalizeTeam(ts[0]);q.away_team=normalizeTeam(ts[1]);}
        }
        if(q.home_team) q.home_team=normalizeTeam(q.home_team);
        if(q.away_team) q.away_team=normalizeTeam(q.away_team);
        const col=(q.home_team&&q.away_team)?rT:sT;
        let desc=q.table_description;
        if(q.table_id==='T12') desc='פינת הגאווה הישראלית';
        else if(q.table_id==='T13') desc='מבול מטאורים של כוכבים';
        else if(q.table_id==='T20') desc='המסלול הישראלי';
        if(!col[q.table_id]) col[q.table_id]={id:q.table_id,description:desc||q.table_id,questions:[]};
        col[q.table_id].questions.push(q);
      });

      const t20=rT['T20']; delete rT['T20'];
      setIsraeliTable(t20||null);
      const sortedRT=Object.values(rT).sort((a,b)=>(parseInt(a.id.replace('T',''))||0)-(parseInt(b.id.replace('T',''))||0));
      if(isKnockout) sortedRT.forEach(t=>{if(t.id==='T3')t.description='שלב שמינית הגמר - המשחקים!';});
      setRoundTables(sortedRT);

      const locIds=['T14','T15','T16','T17'];
      const isLoc=t=>locIds.includes(t.id)||(t.questions[0]?.stage_type==='locations');
      setLocationTables(Object.values(sT).filter(t=>isLoc(t)).sort((a,b)=>(parseInt(a.id.replace('T',''))||0)-(parseInt(b.id.replace('T',''))||0)));
      setPlayoffTable(sT['T19']||null);

      const detectedLoc=new Set(Object.values(sT).filter(t=>isLoc(t)).map(t=>t.id));
      const allSpecial=Object.values(sT).filter(t=>{
        const desc=t.description?.trim();
        return desc&&!/^\d+$/.test(desc)&&!detectedLoc.has(t.id)&&t.id!=='T19';
      }).sort((a,b)=>(parseInt(a.id.replace('T',''))||0)-(parseInt(b.id.replace('T',''))||0));

      // ✅ זיהוי qualifier: לפי תיאור OR לפי table_id (T4/T5/T6)
      // ✅ Qualifier = רק לפי table_id (T4/T5/T6) — לא לפי תיאור.
      // טבלאות עם שמות כמו "שיעלו לחצי גמר" בשלב הנוקאאוט שייכות ל"מיוחדות", לא ל"עולות".
      const QUAL_IDS = new Set(['T4','T5','T6']);
      const isQualTable = t => QUAL_IDS.has(t.id);
      setQualifierTables(allSpecial.filter(t=>isQualTable(t)));
      setSpecialTables(allSpecial.filter(t=>!isQualTable(t)));
    } catch(e){console.error(e);}
    setLoading(false);
  };

  const participantsByQA = useMemo(()=>{
    const idx=new Map();
    allPredictions.forEach(p=>{
      // normalize home/away → text for match questions
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

  // ── calculateGameStats ─────────────────────────────────────────────────────
  const calculateGameStats = useCallback(async(type,specificId=null)=>{
    try {
      let tables=[];
      if(type==='rounds') tables=specificId?roundTables.filter(t=>t.id===specificId):roundTables;
      else if(type==='israeli') tables=israeliTable?[israeliTable]:[];
      if(!tables.length){setGameStats({});return;}
      const predByQ=new Map();
      allPredictions.forEach(p=>{if(!predByQ.has(p.question_id))predByQ.set(p.question_id,[]);predByQ.get(p.question_id).push(p);});
      const gsd={};
      for(const table of tables){
        for(const q of table.questions){
          const rawPreds=predByQ.get(q.id)||[];
          // dedup: last prediction per participant
          const latestByPart={};
          rawPreds.forEach(p=>{const ex=latestByPart[p.participant_name];if(!ex||new Date(p.created_at)>new Date(ex.created_at))latestByPart[p.participant_name]=p;});
          const preds=Object.values(latestByPart);
          const counts=preds.reduce((acc,p)=>{
            // normalize home/away
            const r=(!p.text_prediction?.trim()&&p.home_prediction!=null&&p.away_prediction!=null)
              ?`${p.home_prediction}-${p.away_prediction}`
              :(p.text_prediction||'לא ניחש');
            acc[r]=(acc[r]||0)+1;return acc;
          },{});
          const total=preds.length;
          const chart=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([r,c])=>({name:r,value:c,percentage:total>0?((c/total)*100).toFixed(1):0}));
          gsd[q.id]={question:q,table,totalPredictions:total,chartData:alternateSlice(chart).map(e=>({...e,percentage:parseFloat(e.percentage)})),mostPopular:chart[0]||{name:'-',value:0,percentage:0}};
        }
      }
      setGameStats(gsd);
    } catch(e){console.error(e);}
  },[roundTables,israeliTable,allPredictions]);

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

  // ── calculateSpecialStats ──────────────────────────────────────────────────
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

        // ── Qualifiers: גרף מרוכז יחיד ─────────────────────────────────
        if(group==='qualifier'){
          const cfg=ADVANCING_CONFIG[table.id];
          const slots=table.questions.filter(q=>{const n=parseFloat(q.question_id);return Number.isInteger(n)&&n>=1;});
          const slotIds=new Set(slots.map(s=>s.id));
          const teamCounts={}, participantsMap={};
          allPredictions.forEach(p=>{
            if(!slotIds.has(p.question_id)) return;
            const rawText=(!p.text_prediction?.trim()&&p.home_prediction!=null&&p.away_prediction!=null)
              ?`${p.home_prediction}-${p.away_prediction}`:p.text_prediction;
            if(!rawText?.trim()) return;
            const team=cleanTeam(normalizeTeam(rawText.trim()));
            if(!team||team.toLowerCase()==='null') return;
            teamCounts[team]=(teamCounts[team]||0)+1;
            if(!participantsMap[team]) participantsMap[team]=new Set();
            participantsMap[team].add(p.participant_name);
          });
          const pm={};
          Object.entries(participantsMap).forEach(([t,s])=>{pm[t]=[...s].sort((a,b)=>a.localeCompare(b,'he'));});
          ts.qualifierData={
            chartData:Object.entries(teamCounts).sort((a,b)=>b[1]-a[1]).map(([team,count])=>({team,count})),
            cfg, advCount:slots.length||(cfg?cfg.count:0), participantsMap:pm
          };

        // ── Locations ────────────────────────────────────────────────────
        } else if(group==='locations'||['T14','T15','T16','T17'].includes(table.id)){
          const forTable=allPredictions.filter(p=>table.questions.some(q=>q.id===p.question_id));
          const teamCounts=forTable.reduce((acc,pred)=>{
            if(pred.text_prediction?.trim()){const t=cleanTeam(normalizeTeam(pred.text_prediction.trim()));if(t&&t.toLowerCase()!=='null')acc[t]=(acc[t]||0)+1;}
            return acc;
          },{});
          const chartData=Object.entries(teamCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([team,count])=>({team,count,percentage:forTable.length>0?((count/forTable.length)*100).toFixed(1):0}));
          ts.locationsData={totalPredictions:forTable.length,uniqueTeams:Object.keys(teamCounts).length,topTeams:chartData,mostPopular:chartData[0]||{team:'-',count:0,percentage:0}};

        // ── Special (text/misc) ──────────────────────────────────────────
        } else {
          if(table.id!=='T1'){

            // ✅ זיהוי "רשימת קבוצות" בשלב הבתים:
            // זיהוי "רשימת קבוצות עולות" בשלב הבתים בלבד:
            // תנאים: ≥4 חריצים שלמים, ללא home/away, stage_type='qualifiers' או תיאור מתאים
            // חשוב: לא stage_type='special' — אלה שאלות מיוחדות שנשארות כגרפים נפרדים
            const slots = table.questions.filter(q => {
              const n = parseFloat(q.question_id);
              return Number.isInteger(n) && n >= 1;
            });
            const isTeamListTable = slots.length >= 4 &&
              // ❌ שאלות special — לא רשימת עולות
              !slots.some(q => q.stage_type === 'special') &&
              slots.every(q =>
                !q.home_team && !q.away_team && (
                  q.stage_type === 'qualifiers' ||
                  (table.description||'').includes('שתנצח') ||
                  (table.description||'').includes('שיעלו') ||
                  (table.description||'').includes('שתעפל')
                )
              );

            if (isTeamListTable) {
              // גרף מרוכז — כמה משתתפים בחרו כל קבוצה (ללא תלות במיקום)
              const slotIds = new Set(slots.map(s => s.id));
              const teamCounts = {}, participantsMap = {};
              allPredictions.forEach(p => {
                if (!slotIds.has(p.question_id) || !p.text_prediction?.trim()) return;
                const team = cleanTeam(normalizeTeam(p.text_prediction.trim()));
                if (!team || team.toLowerCase() === 'null') return;
                teamCounts[team] = (teamCounts[team]||0) + 1;
                if (!participantsMap[team]) participantsMap[team] = new Set();
                participantsMap[team].add(p.participant_name);
              });
              const pm = {};
              Object.entries(participantsMap).forEach(([t,s]) => { pm[t] = [...s].sort((a,b) => a.localeCompare(b,'he')); });
              ts.qualifierData = {
                chartData: Object.entries(teamCounts).sort((a,b) => b[1]-a[1]).map(([team,count]) => ({team,count})),
                cfg: null, advCount: slots.length, participantsMap: pm,
                isSpecialTeamList: true,
              };
            } else {
            for(const q of table.questions){
              const qPreds=allPredictions.filter(p=>p.question_id===q.id);
              // dedup per participant (last prediction)
              const latestByPart={};
              qPreds.forEach(p=>{
                const ex=latestByPart[p.participant_name];
                if(!ex||new Date(p.created_at)>new Date(ex.created_at)) latestByPart[p.participant_name]=p;
              });
              const dedupPreds=Object.values(latestByPart);
              const answerCounts=dedupPreds.reduce((acc,pred)=>{
                // normalize home/away for match questions
                let answer=(!pred.text_prediction?.trim()&&pred.home_prediction!=null&&pred.away_prediction!=null)
                  ?`${pred.home_prediction}-${pred.away_prediction}`
                  :String(pred.text_prediction||'').trim();
                if(!answer||answer==='__CLEAR__'||answer.toLowerCase()==='null'||answer.toLowerCase()==='undefined') return acc;
                const isYN=['כן','לא','yes','no'].includes(answer), isNum=!isNaN(Number(answer));
                if(!isYN&&!isNum&&q.validation_list?.toLowerCase().includes('קבוצ')) answer=cleanTeam(answer);
                if(!answer.trim()) return acc;
                acc[answer]=(acc[answer]||0)+1; return acc;
              },{});
              const total=Object.values(answerCounts).reduce((s,c)=>s+c,0);
              const chart=Object.entries(answerCounts).sort((a,b)=>b[1]-a[1]).map(([ans,c])=>({answer:ans,count:c,percentage:total>0?((c/total)*100).toFixed(1):0}));
              ts.questions.push({question:q,totalAnswers:total,chartData:alternateSlice(chart),mostPopular:chart[0]||{answer:'-',count:0,percentage:0},diversity:chart.length});
            }
            } // end else isTeamListTable
          }
        }
        ssd[table.id]=ts;
      }
      setSpecialStats(ssd);
    } catch(e){console.error(e);}
  },[specialTables,qualifierTables,locationTables,playoffTable,allPredictions]);

  // ── Sidebar — מבנה תואם ViewSubmissions ──────────────────────────────────
  const sidebarGroups = useMemo(()=>{
    const groups=[];

    // 1. תובנות (סגול)
    groups.push({label:'🤖 תובנות',color:'#8b5cf6',activeBg:'#7c3aed',
      buttons:[{key:'insights',description:'תובנות AI ומחנות'}]});

    // 2. שלב הבתים / פלייאוף (כחול) — לפי round tables
    if(roundTables.length>0){
      // זיהוי שלב הבתים: שאלות stage_type=groups OR יש הרבה בתים
      const isGroupStage = roundTables.length>1 || roundTables.some(t=>
        t.questions[0]?.stage_type==='groups'||t.description?.includes('בית')
      );
      const groupLabel = isGroupStage ? '🏠 שלב הבתים' : '⚽ פלייאוף';
      groups.push({
        label: groupLabel, color:'#3b82f6', activeBg:'#2563eb',
        buttons: roundTables.map(t=>({
          key:`round_${t.id}`,
          description:(t.id==='T3'&&isKnockout)?'שמינית הגמר - המשחקים':t.description||t.id
        }))
      });
    }

    // 3. שאלות פלייאוף מיוחדות (כחול בהיר) — stage_type=playoff/groups ב-special tables
    const playoffSpecial=specialTables.filter(t=>
      t.questions[0]?.stage_type==='playoff'||
      t.questions[0]?.stage_type==='groups'||
      t.description?.includes('פלייאוף')||
      t.description?.includes('מקומות')
    );
    if(playoffSpecial.length>0){
      groups.push({
        label:'🔵 שלבי פלייאוף', color:'#06b6d4', activeBg:'#0891b2',
        buttons:playoffSpecial.map(t=>({key:t.id,description:t.description}))
      });
    }

    // 4. שאלות מיוחדות (סגול) — stage_type=special
    const regularSpecial=specialTables.filter(t=>
      !['playoff','groups'].includes(t.questions[0]?.stage_type) &&
      !t.description?.includes('פלייאוף') &&
      !t.description?.includes('מקומות')
    );
    const specialBtns=[];
    regularSpecial.forEach(t=>{if(t.id!=='T1')specialBtns.push({key:t.id,description:t.description});});
    if(israeliTable) specialBtns.push({key:`round_${israeliTable.id}`,description:israeliTable.description});
    if(playoffTable) specialBtns.push({key:playoffTable.id,description:playoffTable.description});
    if(specialBtns.length>0) groups.push({label:'✨ שאלות מיוחדות',color:'#8b5cf6',activeBg:'#7c3aed',buttons:specialBtns});

    // 5. רשימות עולות (כתום) — qualifiers ואחר כך מיקומים
    const qualBtns=[
      ...qualifierTables.map(t=>({key:`qual_${t.id}`,description:t.description})),
      ...(locationTables.length>0?[{key:'locations',description:'מיקומים'}]:[]),
    ];
    if(qualBtns.length>0) groups.push({label:'📋 רשימות עולות',color:'#f97316',activeBg:'#ea580c',buttons:qualBtns});

    return groups;
  },[roundTables,specialTables,qualifierTables,locationTables,israeliTable,playoffTable,isKnockout]);


  useEffect(()=>{
    if(!selectedSection||loading||!allQuestions.length) return;
    if(selectedSection==='insights'){
      if(!aiInsights){
        setInsightsLoading(true);
        setTimeout(()=>{
          const insights=computeInsights(allQuestions,allPredictions,teams);
          setAiInsights(insights);
          setInsightsLoading(false);
        },100);
      }
      return;
    }
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

  if(loading) return(
    <div className="flex items-center justify-center h-screen" style={{background:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)'}}>
      <Loader2 className="w-8 h-8 animate-spin" style={{color:'#06b6d4'}}/>
      <span className="mr-3" style={{color:'#06b6d4'}}>טוען סטטיסטיקות...</span>
    </div>
  );

  const isRoundsSection  = selectedSection?.startsWith('round_');
  const isQualSection    = selectedSection?.startsWith('qual_');
  const isSpecialSection = selectedSection&&!isRoundsSection&&!isQualSection&&selectedSection!=='insights';

  return (
    <div className="min-h-screen p-4 md:p-6" dir="rtl" style={{background:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)'}}>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3" style={{color:'#f8fafc',textShadow:'0 0 10px rgba(6,182,212,0.3)'}}>
          <PieChart className="w-8 h-8 md:w-10 md:h-10" style={{color:'#06b6d4'}}/>סטטיסטיקות ותובנות
        </h1>
        <p className="mb-6" style={{color:'#94a3b8'}}>לחץ על קטע בגרף לנעילת רשימת משתתפים</p>

        <div className="flex flex-col md:flex-row gap-4" style={{alignItems:'flex-start'}}>

          {/* ── Sidebar ── */}
          <aside style={{width:'220px',flexShrink:0,position:'sticky',top:'70px',alignSelf:'flex-start',maxHeight:'calc(100vh - 90px)',overflowY:'auto',paddingBottom:'16px'}}>
            <div style={{fontSize:'0.58rem',fontWeight:'700',letterSpacing:'0.12em',textTransform:'uppercase',color:'#475569',marginBottom:'10px'}}>בחר שלב</div>
            {sidebarGroups.map(group=>(
              <div key={group.label} style={{marginBottom:'12px'}}>
                <div style={{fontSize:'0.95rem',fontWeight:'800',color:group.color,letterSpacing:'0.02em',marginBottom:'7px',paddingRight:'8px',borderRight:`3px solid ${group.color}`}}>{group.label}</div>
                {group.buttons.map(btn=>{
                  const active=selectedSection===btn.key;
                  return(
                    <button key={btn.key} onClick={()=>toggleSection(btn.key)} style={{display:'block',width:'100%',textAlign:'right',padding:'7px 10px',marginBottom:'3px',borderRadius:'8px',fontSize:'0.78rem',fontWeight:active?'700':'400',color:active?'white':group.color,background:active?group.activeBg:`${group.color}18`,border:`1px solid ${active?group.color:`${group.color}50`}`,cursor:'pointer',transition:'all 0.15s',boxShadow:active?`0 0 10px ${group.color}55`:'none',fontFamily:'Rubik,Heebo,sans-serif'}}>
                      {btn.description}
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          {/* ── Content ── */}
          <div style={{flex:1,minWidth:0}}>

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

            {/* ⚽ משחקים */}
            {isRoundsSection&&(
              <div className="space-y-6">
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

                    <div className="grid md:grid-cols-2 gap-6">
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
                              {/* outcome buttons */}
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

                              {/* Pie */}
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
                    const {chartData,cfg,advCount,participantsMap}=qualifierData;
                    const total=chartData.reduce((s,d)=>s+d.count,0);
                    return(
                      <Card key={table.id} style={{background:'rgba(30,41,59,0.6)',border:'1px solid rgba(249,115,22,0.35)'}}>
                        <CardHeader>
                          <CardTitle style={{color:'#f97316'}}>📋 {table.description}</CardTitle>
                          <p style={{fontSize:'0.78rem',color:'#94a3b8',marginTop:4}}>לחץ על קבוצה לנעילת רשימת משתתפים{cfg?` • ${advCount} קבוצות • בונוס: +${cfg.bonus} נק'`:''}</p>
                        </CardHeader>
                        <CardContent className="px-2 pb-6">
                          {lockedPanel[`qual_${table.id}`]&&(
                            <ParticipantPanel title={lockedPanel[`qual_${table.id}`].title} count={lockedPanel[`qual_${table.id}`].count} percentage={lockedPanel[`qual_${table.id}`].percentage} participants={lockedPanel[`qual_${table.id}`].participants} color="#f97316" onClose={()=>closePanel(`qual_${table.id}`)}/>
                          )}
                          {chartData.length>0?(
                            <div dir="ltr">
                            <ResponsiveContainer width="100%" height={Math.max(400,chartData.length*34)}>
                              <BarChart data={chartData} layout="vertical" margin={{top:10,right:60,left:0,bottom:10}}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false}/>
                                <XAxis type="number" stroke="#94a3b8" tick={{fontSize:11,fill:'#94a3b8'}}/>
                                <YAxis type="category" dataKey="team" width={190} stroke="#334155" tick={{fontSize:12,fill:'#f8fafc',fontFamily:'Rubik,Heebo,sans-serif'}}/>
                                <Tooltip cursor={{fill:'rgba(249,115,22,0.08)'}} content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:'1px solid #f97316',borderRadius:6,padding:'8px 12px',pointerEvents:'none'}}><p style={{color:'#f97316',fontWeight:700,fontSize:'0.85rem'}}>{payload[0].payload.team}</p><p style={{color:'#f8fafc',fontSize:'0.8rem'}}>{payload[0].value} בחירות ({total>0?((payload[0].value/total)*100).toFixed(1):0}%)</p><p style={{color:'#64748b',fontSize:'0.7rem',marginTop:2}}>לחץ לנעילה</p></div>:null}/>
                                <Bar dataKey="count" radius={[0,6,6,0]} label={{position:'right',fill:'#94a3b8',fontSize:11,formatter:v=>v}} onClick={data=>{const p2=total>0?((data.count/total)*100).toFixed(1):0;lockPanel(`qual_${table.id}`,{title:data.team,count:data.count,percentage:p2,participants:participantsMap[data.team]||[],color:'#f97316'});}}>
                                  {chartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} style={{cursor:'pointer'}}/>)}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                            </div>
                          ):<div className="text-center py-12" style={{color:'#94a3b8'}}>אין נתונים עדיין</div>}
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

                    {/* ✅ רשימת קבוצות מרוכזת — גרף אחד */}
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
                          const hasActual=q.actual_result?.trim()&&q.actual_result!=='__CLEAR__';
                          const panelKey=`special_${q.id}`;
                          return(
                            <Card key={q.id} className="bg-slate-800/40 border-slate-700 flex flex-col">
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline" style={{borderColor:'rgba(6,182,212,0.5)',color:'#06b6d4',minWidth:'50px'}} className="justify-center">{q.question_id}</Badge>
                                  <Badge className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xs">{qStat.totalAnswers} תשובות</Badge>
                                </div>
                                <p className="text-sm text-slate-200 leading-tight min-h-[36px]">{q.question_text}</p>
                                <p style={{color:'#64748b',fontSize:'0.68rem',marginTop:2}}>לחץ על קטע לנעילת רשימה</p>
                              </CardHeader>
                              <CardContent className="px-2 pb-3 flex-1 flex flex-col">
                                {qStat.chartData.length>0?(
                                  <>
                                    <div style={{minHeight:'240px',maxHeight:'240px',display:'flex',alignItems:'flex-end'}}>
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
                                        ):(
                                          <BarChart data={qStat.chartData.slice(0,10)} margin={{top:8,right:5,left:5,bottom:55}}
                                            onClick={data=>{if(data?.activePayload?.[0]){const e=data.activePayload[0].payload;lockPanel(panelKey,{title:e.answer,count:e.count,percentage:e.percentage,participants:getParticipants(q.id,e.answer),color:'#06b6d4'});}}}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
                                            <XAxis dataKey="answer" stroke="#94a3b8" interval={0} height={55} tick={({x,y,payload})=>{const ws=String(payload.value).split(' ');const ls=[];let cur='';ws.forEach(w=>{const t=cur?`${cur} ${w}`:w;if(t.length<=8)cur=t;else{if(cur)ls.push(cur);cur=w;}});if(cur)ls.push(cur);return <g transform={`translate(${x},${y})`}>{ls.slice(0,3).map((l,i)=><text key={i} x={0} y={i*10+6} textAnchor="middle" fill="#94a3b8" fontSize="8px">{l}</text>)}</g>;}}/>
                                            <YAxis stroke="#94a3b8" tick={{fontSize:10,fill:'#94a3b8'}}/>
                                            <Tooltip cursor={{fill:'rgba(6,182,212,0.08)'}} content={({payload})=>payload?.[0]?<div style={{background:'#0a0f1a',border:'1px solid #06b6d4',borderRadius:6,padding:'8px 10px',pointerEvents:'none'}}><p style={{color:'#06b6d4',fontWeight:700,fontSize:'0.82rem'}}>{payload[0].payload.answer}</p><p style={{color:'#f8fafc',fontSize:'0.78rem'}}>{payload[0].value} ({payload[0].payload.percentage}%)</p><p style={{color:'#64748b',fontSize:'0.7rem',marginTop:2}}>לחץ לנעילה</p></div>:null}/>
                                            <Bar dataKey="count" radius={[5,5,0,0]} style={{cursor:'pointer'}}>
                                              {qStat.chartData.slice(0,10).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
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
                  <p className="text-slate-400 text-lg">בחר שלב מהתפריט לסטטיסטיקות מפורטות</p>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
