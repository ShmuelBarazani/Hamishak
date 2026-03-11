import { useState, useCallback } from "react";
import * as db from "@/api/entities";
import { useGame } from "@/components/contexts/GameContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Loader2, ChevronDown, ChevronUp } from "lucide-react";

// ─── Robust CSV Parser (handles multi-line quoted fields) ────────────────────
function parseCSV(text) {
  const rows = [];
  let cur = [], field = '', inQ = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i+1] === '"') { field += '"'; i++; }
        else { inQ = false; }
      } else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { cur.push(field.trim()); field = ''; }
      else if (c === '\n') { cur.push(field.trim()); rows.push(cur); cur = []; field = ''; }
      else { field += c; }
    }
  }
  if (field || cur.length) { cur.push(field.trim()); rows.push(cur); }
  return rows;
}

// ─── Text helpers ────────────────────────────────────────────────────────────
function cleanText(s) {
  return (s || '').replace(/\(\*+\)/g,'').replace(/["'"״'']/g,'').replace(/\s+/g,' ').trim();
}
function normalizeTeam(s) {
  return (s || '').replace(/\s*\([^)]*\)\s*$/,'').replace(/\s+/g,' ').trim();
}
function wordOverlap(a, b) {
  const stop = new Set(['את','של','עם','אם','או','על','בין','ב','ל','מ','כ','הכי','ביותר','אחד','אחת','כל','כולל','לא','שלב','שיובקע','שיובקעו']);
  const wa = new Set(cleanText(a).split(' ').filter(w => w.length>1 && !stop.has(w)));
  const wb = new Set(cleanText(b).split(' ').filter(w => w.length>1 && !stop.has(w)));
  if (!wa.size || !wb.size) return 0;
  let common=0; for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

// ─── Extract predictions ──────────────────────────────────────────────────────
function extractPredictions(rows) {
  const safe = (r, c) => (rows[r]?.[c] || '').trim();
  const name = safe(2, 4);
  const preds = [];

  // ── Locate section anchor rows ─────────────────────────────────────────────
  // The qualifier headers in col3 are the most reliable anchors:
  //   "רשימת הקבוצות שיעלו לרבע גמר"  → T4 qualifiers start
  //   "רשימת הנבחרות שיעלו לחצי גמר"  → T6 qualifiers start
  //   "רשימת הנבחרות שיעלו לגמר"       → T8 qualifiers start
  let t4QualStart=-1, t6QualStart=-1, t8QualStart=-1;
  for (let i=0; i<rows.length; i++) {
    const c3 = safe(i,3);
    if (c3.includes('רשימת') && c3.includes('רבע')) t4QualStart = i;
    else if (c3.includes('רשימת') && (c3.includes('חצי') || c3.includes('חצאי'))) t6QualStart = i;
    else if (c3.includes('רשימת') && c3.includes('גמר') && t6QualStart>=0) t8QualStart = i;
  }

  // Find last qualifier row in each block
  const lastQualRow = (start, end) => {
    let last = start;
    for (let i=start; i<end; i++) {
      const slot=safe(i,2), team=safe(i,3);
      if (/^\d+$/.test(slot) && team && !team.includes('שם') && !team.includes('בונוס')) last=i;
    }
    return last;
  };

  const t4QualEnd = t4QualStart>=0 && t6QualStart>=0 ? lastQualRow(t4QualStart, t6QualStart) : -1;
  const t6QualEnd = t6QualStart>=0 && t8QualStart>=0 ? lastQualRow(t6QualStart, t8QualStart) : -1;
  const t8QualEnd = t8QualStart>=0 ? lastQualRow(t8QualStart, t8QualStart+20) : -1;

  // T9 ends at the (10 row after T8, then T10 starts
  let t9End=-1, t10Start=-1;
  if (t8QualEnd>=0) {
    let inT9=false;
    for (let i=t8QualEnd+1; i<rows.length; i++) {
      const n=safe(i,0);
      if (/^\(\d+$/.test(n) && safe(i,7)) {
        inT9=true;
        if (n==='(10') { t9End=i; t10Start=i+1; break; }
      }
    }
  }

  // ── T2: General knockout special ──────────────────────────────────────────
  // Find T3 start (first match row)
  let t3Start = -1;
  for (let i=0; i<rows.length; i++) {
    const h=safe(i,3), a=safe(i,5), hs=safe(i,6), as_=safe(i,8);
    if (h && a && /^\d+$/.test(hs) && /^\d+$/.test(as_) && normalizeTeam(h) && normalizeTeam(a)) {
      t3Start=i; break;
    }
  }
  const t2End = t3Start>0 ? t3Start : 90;

  // Q1,Q2,Q3: find by scanning rows 10-25 for (1, (2, (3
  for (const [target, mainCol, subValCol, subTextCol] of [
    ['(1', 3, 8, 7],   // Q1: player in col3, goals in col8, label in col7
    ['(2', 4, 7, 6],   // Q2: team in col4, goals in col7
    ['(3', 4, 7, 6],   // Q3: team in col4, penalties in col7
  ]) {
    for (let i=10; i<25; i++) {
      if (safe(i,0) !== target) continue;
      const mainVal = safe(i, mainCol) || safe(i, mainCol===3?4:3);
      const subVal  = safe(i, subValCol);
      const subText = safe(i, subTextCol);
      const qLabel  = target==='(1' ? 'שחקן' : target==='(2' ? 'קבוצה' : 'קבוצה';
      const sLabel  = target==='(1' ? 'שערים' : target==='(2' ? 'שערים' : 'פנדלים';
      if (mainVal) preds.push({ label:`T2 ${target} ${qLabel}`, csvText:safe(i,1), value:mainVal, section:'T2' });
      if (subVal)  preds.push({ label:`T2 ${target} ${sLabel}`, csvText:subText, value:subVal, section:'T2', subOf:target, parentCsvText:safe(i,1) });
      break;
    }
  }

  // Q4-Q33: scan rows before T3, col6 = value
  for (let i=0; i<t2End; i++) {
    const n=safe(i,0);
    if (!/^\(\d+$/.test(n) || ['(1','(2','(3'].includes(n)) continue;
    const v=safe(i,6);
    if (v) preds.push({ label:`T2 ${n}`, csvText:safe(i,1), value:v, section:'T2' });
  }

  // ── T3: Matches ────────────────────────────────────────────────────────────
  for (let i=0; i<rows.length; i++) {
    const h=safe(i,3), a=safe(i,5), hs=safe(i,6), as_=safe(i,8);
    if (h && a && /^\d+$/.test(hs) && /^\d+$/.test(as_) && normalizeTeam(h) && normalizeTeam(a))
      preds.push({ label:`T3:${normalizeTeam(h)}-${normalizeTeam(a)}`, type:'match',
        home:normalizeTeam(h), away:normalizeTeam(a), value:`${hs}-${as_}`, section:'T3' });
  }

  // ── T4: שמינית qualifiers ─────────────────────────────────────────────────
  if (t4QualStart>=0 && t6QualStart>=0) {
    for (let i=t4QualStart; i<t6QualStart; i++) {
      const slot=safe(i,2), team=safe(i,3);
      if (/^\d+$/.test(slot) && team && !team.includes('שם') && !team.includes('בונוס'))
        preds.push({ label:`T4 מקום ${slot}`, type:'qualifier',
          slot:parseInt(slot), team:normalizeTeam(team), value:normalizeTeam(team), section:'T4' });
    }
  }

  // ── T5: שמינית special (rows t4QualEnd+1 to t6QualStart) ─────────────────
  if (t4QualEnd>=0 && t6QualStart>=0) {
    for (let i=t4QualEnd+1; i<t6QualStart; i++) {
      const n=safe(i,0);
      if (!/^\(\d+$/.test(n)) continue;
      const v=safe(i,7);
      if (v) preds.push({ label:`T5 ${n}`, csvText:safe(i,1), value:v, section:'T5' });
    }
  }

  // ── T6: רבע qualifiers ────────────────────────────────────────────────────
  if (t6QualStart>=0 && t8QualStart>=0) {
    for (let i=t6QualStart; i<t8QualStart; i++) {
      const slot=safe(i,2), team=safe(i,3);
      if (/^\d+$/.test(slot) && team && !team.includes('שם') && !team.includes('בונוס'))
        preds.push({ label:`T6 מקום ${slot}`, type:'qualifier',
          slot:parseInt(slot), team:normalizeTeam(team), value:normalizeTeam(team), section:'T6' });
    }
  }

  // ── T7: רבע special (rows t6QualEnd+1 to t8QualStart) ────────────────────
  if (t6QualEnd>=0 && t8QualStart>=0) {
    for (let i=t6QualEnd+1; i<t8QualStart; i++) {
      const n=safe(i,0);
      if (!/^\(\d+$/.test(n)) continue;
      const v=safe(i,7);
      if (v) preds.push({ label:`T7 ${n}`, csvText:safe(i,1), value:v, section:'T7' });
    }
  }

  // ── T8: חצי qualifiers ────────────────────────────────────────────────────
  if (t8QualStart>=0) {
    for (let i=t8QualStart; i<t8QualStart+20; i++) {
      const slot=safe(i,2), team=safe(i,3);
      if (/^\d+$/.test(slot) && team && !team.includes('שם') && !team.includes('בונוס'))
        preds.push({ label:`T8 מקום ${slot}`, type:'qualifier',
          slot:parseInt(slot), team:normalizeTeam(team), value:normalizeTeam(team), section:'T8' });
    }
  }

  // ── T9: חצי special (rows t8QualEnd+1 to t9End) ──────────────────────────
  if (t8QualEnd>=0 && t9End>=0) {
    for (let i=t8QualEnd+1; i<=t9End; i++) {
      const n=safe(i,0);
      if (!/^\(\d+$/.test(n)) continue;
      const v=safe(i,7);
      if (v) preds.push({ label:`T9 ${n}`, csvText:safe(i,1), value:v, section:'T9' });
    }
  }

  // ── T10: גמר special (rows t10Start onward) ───────────────────────────────
  if (t10Start>=0) {
    for (let i=t10Start; i<rows.length; i++) {
      const n=safe(i,0);
      if (!/^\(\d+$/.test(n)) continue;
      const v=safe(i,7);
      if (v) preds.push({ label:`T10 ${n}`, csvText:safe(i,1), value:v, section:'T10' });
    }
  }

  return { name, preds };
}

// ─── Matcher ──────────────────────────────────────────────────────────────────
function buildSubMap(questions) {
  const subMap={};
  for (const q of questions) {
    const qid=String(q.question_id||'');
    if (qid.includes('.')) {
      const p=qid.split('.')[0];
      if (!subMap[p]) subMap[p]=[];
      subMap[p].push(q);
    }
  }
  return subMap;
}

function bestFuzzy(csvText, pool, threshold) {
  const norm=cleanText(csvText||'');
  const exact=pool.find(q=>cleanText(q.question_text||'')===norm);
  if (exact) return exact;
  let best=null, bestScore=0;
  for (const q of pool) {
    if (!q.question_text) continue;
    const score=wordOverlap(norm, cleanText(q.question_text));
    if (score>bestScore) { bestScore=score; best=q; }
  }
  return bestScore>=threshold ? best : null;
}

function matchPred(pred, questions, subMap) {
  const sectionPool=questions.filter(q=>q.table_id===pred.section);
  if (pred.type==='match') {
    const m=sectionPool.find(q=>normalizeTeam(q.home_team||'')===pred.home && normalizeTeam(q.away_team||'')===pred.away);
    if (m) return m;
    const rev=sectionPool.find(q=>normalizeTeam(q.home_team||'')===pred.away && normalizeTeam(q.away_team||'')===pred.home);
    if (rev) return {...rev, _reversed:true};
    return null;
  }
  if (pred.type==='qualifier') {
    const qPool=sectionPool.filter(q=>!q.home_team).sort((a,b)=>(parseFloat(a.question_id)||0)-(parseFloat(b.question_id)||0));
    return qPool[pred.slot-1]||null;
  }
  if (pred.subOf) {
    const parentQ=bestFuzzy(pred.parentCsvText, sectionPool, 0.65)||bestFuzzy(pred.parentCsvText, questions, 0.70);
    if (parentQ) {
      const pid=String(parentQ.question_id||'').replace(/\.0$/,'');
      const subs=subMap[pid]||[];
      if (subs.length===1) return subs[0];
      if (subs.length>1) {
        let best=null, sc=0;
        for (const s of subs) { const x=wordOverlap(cleanText(pred.csvText||''),cleanText(s.question_text||'')); if (x>sc){sc=x;best=s;} }
        return best;
      }
    }
  }
  return bestFuzzy(pred.csvText, sectionPool, 0.65)||bestFuzzy(pred.csvText, questions, 0.72);
}

// ─── Component ────────────────────────────────────────────────────────────────
const TC={T2:'#a78bfa',T3:'#34d399',T4:'#34d399',T5:'#fbbf24',T6:'#f97316',T7:'#f87171',T8:'#60a5fa',T9:'#38bdf8',T10:'#f472b6'};

export default function AdminImport() {
  const {currentGame}=useGame();
  const {toast}=useToast();
  const [questions,setQuestions]=useState([]);
  const [subMap,setSubMap]=useState({});
  const [loadingQs,setLoadingQs]=useState(false);
  const [parsed,setParsed]=useState(null);
  const [importing,setImporting]=useState(false);
  const [importResults,setImportResults]=useState(null);
  const [step,setStep]=useState('init');
  const [showMatched,setShowMatched]=useState(false);

  const loadQuestions=useCallback(async()=>{
    if(!currentGame) return null;
    setLoadingQs(true);
    try {
      let qs=[],skip=0;
      while(true){
        const batch=await db.Question.filter({game_id:currentGame.id},null,5000,skip);
        qs=[...qs,...batch]; if(batch.length<5000) break; skip+=5000;
      }
      qs=qs.filter(q=>q.table_id!=='T1');
      const sm=buildSubMap(qs);
      setQuestions(qs); setSubMap(sm);
      toast({title:`✅ ${qs.length} שאלות נטענו`,duration:3000});
      return {qs,sm};
    } catch(err){
      toast({title:'שגיאה',description:err.message,variant:'destructive',duration:4000});
      return null;
    } finally{setLoadingQs(false);}
  },[currentGame]);

  const processFile=(text,qs,sm)=>{
    const rows=parseCSV(text);
    const {name,preds}=extractPredictions(rows);
    const matched=[],unmatched=[];
    for(const pred of preds){
      const q=matchPred(pred,qs,sm);
      if(q) matched.push({pred,question:q});
      else   unmatched.push(pred);
    }
    return {name,matched,unmatched,total:preds.length};
  };

  const handleSingleFile=async(e)=>{
    const file=e.target.files[0]; if(!file) return;
    let qs=questions,sm=subMap;
    if(!qs.length){const res=await loadQuestions(); if(!res) return; qs=res.qs; sm=res.sm;}
    const text=await file.text();
    setParsed({single:true,fileName:file.name,...processFile(text,qs,sm)});
    setStep('preview'); setShowMatched(false);
  };

  const handleAllFiles=async(e)=>{
    const files=Array.from(e.target.files); if(!files.length) return;
    let qs=questions,sm=subMap;
    if(!qs.length){const res=await loadQuestions(); if(!res) return; qs=res.qs; sm=res.sm;}
    const results=[];
    for(const file of files){
      const text=await file.text();
      results.push({fileName:file.name,...processFile(text,qs,sm)});
    }
    setParsed({bulk:true,results,totalMatched:results.reduce((s,r)=>s+r.matched.length,0),totalUnmatched:results.reduce((s,r)=>s+r.unmatched.length,0)});
    setStep('bulk_preview');
  };

  const runImport=async(participants)=>{
    setImporting(true);
    let totalInserted=0,totalErrors=0;
    const perParticipant=[];
    try{
      for(const p of participants){
        if(!p.matched.length) continue;
        const existing=await db.Prediction.filter({game_id:currentGame.id,participant_name:p.name},null,9999);
        for(const x of existing) await db.Prediction.delete(x.id);
        let inserted=0,errors=0;
        for(let i=0;i<p.matched.length;i++){
          const{pred,question}=p.matched[i];
          try{
            const data={game_id:currentGame.id,question_id:question.id,participant_name:p.name,text_prediction:pred.value,created_at:new Date().toISOString()};
            if(pred.type==='match'){
              let[hs,as_]=pred.value.split('-').map(Number);
              if(question._reversed)[hs,as_]=[as_,hs];
              data.home_prediction=hs; data.away_prediction=as_;
            }
            await db.Prediction.create(data);
            inserted++;
          }catch{errors++;}
          if((i+1)%10===0) await new Promise(r=>setTimeout(r,50));
        }
        try{
          const gps=await db.GameParticipant.filter({game_id:currentGame.id,participant_name:p.name},null,1);
          if(!gps.length) await db.GameParticipant.create({game_id:currentGame.id,participant_name:p.name,is_active:true});
        }catch{}
        totalInserted+=inserted; totalErrors+=errors;
        perParticipant.push({name:p.name,inserted,errors});
      }
      setImportResults({totalInserted,totalErrors,perParticipant});
      setStep('done');
      toast({title:`✅ יובאו ${totalInserted} ניחושים`,duration:5000});
    }catch(err){toast({title:'שגיאה',description:err.message,variant:'destructive',duration:5000});}
    finally{setImporting(false);}
  };

  return(
    <div dir="rtl" style={{minHeight:'100vh',background:'#0f172a',color:'#e2e8f0',padding:'20px',fontFamily:'Arial,sans-serif'}}>
      <div style={{maxWidth:1100,margin:'0 auto'}}>
        <h1 style={{fontSize:22,fontWeight:'bold',color:'#06b6d4',marginBottom:20}}>ייבוא ניחושים מ-CSV</h1>

        <div style={{background:'#1e293b',borderRadius:10,padding:14,marginBottom:14,border:'1px solid #334155'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{color:'#94a3b8',fontSize:13}}>{questions.length?`✅ ${questions.length} שאלות נטענו`:'שאלות לא נטענו'}</span>
            <Button onClick={loadQuestions} disabled={loadingQs||!currentGame} style={{background:'#0284c7',color:'white',fontSize:13}}>
              {loadingQs?<><Loader2 className="w-3 h-3 animate-spin ml-1"/>טוען...</>:'טען שאלות'}
            </Button>
          </div>
        </div>

        {questions.length>0&&step==='init'&&(
          <div style={{background:'#1e293b',borderRadius:10,padding:14,marginBottom:14,border:'2px solid #0284c7'}}>
            <h2 style={{color:'#38bdf8',fontSize:14,marginBottom:4}}>שלב 1 — בדיקה עם קובץ בודד</h2>
            <p style={{color:'#64748b',fontSize:12,marginBottom:10}}>בחר קובץ אחד לפני ייבוא הכולל</p>
            <input type="file" accept=".csv" onChange={handleSingleFile} style={{color:'#e2e8f0'}}/>
          </div>
        )}

        {step==='preview'&&parsed?.single&&(
          <div style={{background:'#1e293b',borderRadius:10,padding:16,marginBottom:14,border:'1px solid #334155'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h2 style={{color:'#06b6d4',fontSize:15}}>תוצאות: {parsed.name}</h2>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <span style={{color:'#64748b',fontSize:11}}>חולצו: {parsed.total}</span>
                <span style={{background:'#064e3b',color:'#6ee7b7',padding:'3px 10px',borderRadius:4,fontSize:12}}>✓ {parsed.matched.length} זוהו</span>
                <span style={{background:parsed.unmatched.length>0?'#450a0a':'#064e3b',color:parsed.unmatched.length>0?'#fca5a5':'#6ee7b7',padding:'3px 10px',borderRadius:4,fontSize:12}}>
                  {parsed.unmatched.length>0?`✗ ${parsed.unmatched.length} לא זוהו`:'✓ 0 שגיאות'}
                </span>
              </div>
            </div>

            {parsed.unmatched.length>0&&(
              <div style={{background:'#1a0808',border:'2px solid #dc2626',borderRadius:8,padding:12,marginBottom:14}}>
                <h3 style={{color:'#f87171',fontSize:13,marginBottom:8}}>⚠️ {parsed.unmatched.length} ניחושים שלא זוהו</h3>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{background:'#450a0a'}}>
                    {['#','קטגוריה','שאלה מה-CSV','ניחוש'].map(h=><th key={h} style={{padding:'4px 8px',color:'#fca5a5',textAlign:'right'}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{parsed.unmatched.map((u,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid #450a0a'}}>
                      <td style={{padding:'4px 8px',color:'#64748b'}}>{i+1}</td>
                      <td style={{padding:'4px 8px',color:TC[u.section]||'#fbbf24',whiteSpace:'nowrap'}}>{u.label}</td>
                      <td style={{padding:'4px 8px',color:'#fca5a5'}}>{u.type==='match'?`${u.home} - ${u.away}`:u.type==='qualifier'?`מקום ${u.slot}: ${u.team}`:(u.csvText||'').slice(0,90)}</td>
                      <td style={{padding:'4px 8px',color:'#f1f5f9',fontWeight:'bold',direction:'ltr',textAlign:'left'}}>"{u.value}"</td>
                    </tr>
                  ))}</tbody>
                </table>
                <p style={{color:'#64748b',fontSize:11,marginTop:8}}>📩 שלח לי צילום מסך ואני אתקן</p>
              </div>
            )}

            <button onClick={()=>setShowMatched(!showMatched)} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',gap:4,marginBottom:8}}>
              {showMatched?<ChevronUp className="w-3 h-3"/>:<ChevronDown className="w-3 h-3"/>}
              {showMatched?'הסתר':'הצג'} ניחושים שזוהו ({parsed.matched.length}) — בדוק שהתשובות נכונות
            </button>
            {showMatched&&(
              <div style={{maxHeight:500,overflowY:'auto',border:'1px solid #334155',borderRadius:8,marginBottom:12}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead style={{position:'sticky',top:0,background:'#0f172a'}}>
                    <tr>{['#','שלב','q_id','שאלה ב-DB','ניחוש'].map(h=><th key={h} style={{padding:'5px 10px',color:'#64748b',textAlign:'right',borderBottom:'1px solid #334155'}}>{h}</th>)}</tr>
                  </thead>
                  <tbody>{parsed.matched.map(({pred,question},i)=>(
                    <tr key={i} style={{borderBottom:'1px solid #1e293b',background:i%2===0?'transparent':'#161f2e'}}>
                      <td style={{padding:'4px 10px',color:'#64748b'}}>{i+1}</td>
                      <td style={{padding:'4px 10px'}}><span style={{background:(TC[question.table_id]||'#94a3b8')+'22',color:TC[question.table_id]||'#94a3b8',padding:'1px 5px',borderRadius:3,fontSize:11}}>{question.table_id}</span></td>
                      <td style={{padding:'4px 10px',color:'#64748b',whiteSpace:'nowrap'}}>{question.question_id}</td>
                      <td style={{padding:'4px 10px',color:'#e2e8f0'}}>{question.question_text||`${question.home_team||''} - ${question.away_team||''}`}</td>
                      <td style={{padding:'4px 10px',color:'#6ee7b7',fontWeight:'bold',direction:'ltr',textAlign:'left'}}>{pred.value}{question._reversed?' ↔':''}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {parsed.unmatched.length===0&&parsed.total>=100?(
              <div style={{padding:12,background:'#0f2718',borderRadius:8,border:'1px solid #059669'}}>
                <p style={{color:'#6ee7b7',fontSize:13,marginBottom:10}}>✅ זיהוי מושלם! טען את כל הקבצים.</p>
                <label style={{display:'inline-block',padding:'8px 16px',background:'linear-gradient(135deg,#059669,#047857)',color:'white',borderRadius:6,cursor:'pointer',fontSize:13}}>
                  <Upload className="w-4 h-4 inline ml-1"/>בחר את כל קבצי ה-CSV (Ctrl+A)
                  <input type="file" accept=".csv" multiple onChange={handleAllFiles} style={{display:'none'}}/>
                </label>
              </div>
            ):parsed.unmatched.length===0&&parsed.total<100?(
              <div style={{padding:12,background:'#2d1a00',borderRadius:8,border:'1px solid #f59e0b'}}>
                <p style={{color:'#fbbf24',fontSize:13}}>⚠️ חולצו רק {parsed.total} ניחושים (צפוי ~115). יש בעיה בקריאת הקובץ — שלח לי צילום.</p>
              </div>
            ):(
              <p style={{color:'#f87171',fontSize:12,marginTop:10}}>⛔ תקן את {parsed.unmatched.length} השגיאות לפני הייבוא.</p>
            )}
          </div>
        )}

        {step==='bulk_preview'&&parsed?.bulk&&(
          <div style={{background:'#1e293b',borderRadius:10,padding:16,marginBottom:14,border:'1px solid #334155'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h2 style={{color:'#06b6d4',fontSize:15}}>ייבוא {parsed.results.length} משתתפים</h2>
              {parsed.totalUnmatched===0?<span style={{color:'#6ee7b7',fontSize:13}}>✅ כל {parsed.totalMatched} ניחושים זוהו!</span>:<span style={{color:'#fca5a5',fontSize:13}}>⚠️ {parsed.totalUnmatched} לא זוהו</span>}
            </div>
            <div style={{maxHeight:400,overflowY:'auto',marginBottom:12}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead style={{position:'sticky',top:0,background:'#0f172a'}}>
                  <tr>{['שם','חולצו','זוהו','לא זוהו'].map(h=><th key={h} style={{padding:'4px 10px',color:'#64748b',textAlign:'right',borderBottom:'1px solid #334155'}}>{h}</th>)}</tr>
                </thead>
                <tbody>{parsed.results.map((r,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #1e293b',background:r.total<100?'#2d1a00':'transparent'}}>
                    <td style={{padding:'4px 10px',color:'#f1f5f9'}}>{r.name}</td>
                    <td style={{padding:'4px 10px',color:r.total<100?'#fbbf24':'#64748b'}}>{r.total}</td>
                    <td style={{padding:'4px 10px',color:'#6ee7b7'}}>{r.matched.length}</td>
                    <td style={{padding:'4px 10px',color:r.unmatched.length>0?'#fca5a5':'#6ee7b7'}}>{r.unmatched.length}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {parsed.totalUnmatched===0?(
              <Button onClick={()=>runImport(parsed.results)} disabled={importing} style={{background:'linear-gradient(135deg,#059669,#047857)',color:'white',padding:'10px 24px'}}>
                {importing?<><Loader2 className="w-5 h-5 animate-spin ml-2"/>מייבא...</>:<><Upload className="w-5 h-5 ml-2"/>ייבא {parsed.totalMatched} ניחושים ל-{parsed.results.length} משתתפים</>}
              </Button>
            ):(
              <p style={{color:'#f87171',fontSize:12}}>⛔ יש {parsed.totalUnmatched} שגיאות — חזור לשלב 1</p>
            )}
          </div>
        )}

        {step==='done'&&importResults&&(
          <div style={{background:'#064e3b',borderRadius:10,padding:20,border:'1px solid #059669'}}>
            <h2 style={{color:'#6ee7b7',fontSize:18,marginBottom:10}}>✅ ייבוא הושלם!</h2>
            <p style={{color:'#a7f3d0',marginBottom:12}}>יובאו <strong>{importResults.totalInserted}</strong> ניחושים{importResults.totalErrors>0&&` (${importResults.totalErrors} שגיאות)`}</p>
            <div style={{maxHeight:350,overflowY:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{background:'#065f46'}}>{['משתתף','ניחושים','שגיאות'].map(h=><th key={h} style={{padding:'4px 10px',color:'#6ee7b7',textAlign:'right'}}>{h}</th>)}</tr></thead>
                <tbody>{importResults.perParticipant.map((p,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #065f46'}}>
                    <td style={{padding:'4px 10px',color:'#d1fae5'}}>{p.name}</td>
                    <td style={{padding:'4px 10px',color:'#6ee7b7'}}>{p.inserted}</td>
                    <td style={{padding:'4px 10px',color:p.errors>0?'#fca5a5':'#6ee7b7'}}>{p.errors}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p style={{color:'#94a3b8',fontSize:12,marginTop:10}}>עבור ל-AdminResults → "שמור תוצאות" לחישוב דירוג.</p>
          </div>
        )}
      </div>
    </div>
  );
}
