/* ============================ Clash logic, optimizer & swap planner ============================ */
import { state, CRIT_DEFS } from './state.js';

// A session "counts" toward your on-campus burden unless it's a lecture and we're ignoring lectures
export const isLec = s => s.type==='Lec/Studio';
export const counts = s => !state.ignoreLec || !isLec(s);

export function weeksIntersect(a,b){ const S=new Set(a); for(const w of b) if(S.has(w)) return true; return false; }
export function sessClash(x,y){
  return x.day===y.day && x.start<y.end && y.start<x.end && weeksIntersect(x.weeks,y.weeks);
}
export function getIndex(code,idxStr){
  const c=state.catalog.get(code); if(!c) return null;
  return c.indexes.find(i=>i.index===idxStr)||null;
}
// sessions currently placed by everyone EXCEPT `exceptCode`
export function placedSessions(exceptCode){
  const out=[];
  for(const p of state.plan){
    if(p.code===exceptCode || !p.chosen) continue;
    const ix=getIndex(p.code,p.chosen); if(!ix) continue;
    for(const s of ix.sessions) out.push({...s, code:p.code, idx:p.chosen});
  }
  return out;
}
// does a candidate index clash with others? returns list of clashing course codes
export function indexClashCodes(code, ix, others){
  const codes=new Set();
  for(const s of ix.sessions) for(const o of others) if(sessClash(s,o)) codes.add(o.code);
  return [...codes];
}
// full current clash report
export function clashReport(){
  const all=[];
  for(const p of state.plan){ if(!p.chosen) continue; const ix=getIndex(p.code,p.chosen); if(!ix) continue;
    for(const s of ix.sessions) all.push({...s,code:p.code,idx:p.chosen}); }
  const conflicts=[];
  for(let i=0;i<all.length;i++) for(let j=i+1;j<all.length;j++){
    if(all[i].code!==all[j].code && sessClash(all[i],all[j]))
      conflicts.push([all[i],all[j]]);
  }
  return conflicts;
}

/* ============================ Optimizer ============================ */
// A counted session violates the user's hard constraints?
function violatesCons(s){
  if(!counts(s)) return false;               // lectures exempt while ignoring lectures
  if(state.cons.freeDays.includes(s.day)) return true;
  if(s.start < state.cons.minStart) return true;
  if(s.end > state.cons.maxEnd) return true;
  return false;
}
export function indexViolatesCons(ix){ return ix.sessions.some(violatesCons); }

function candidatesFor(p){
  const c=state.catalog.get(p.code);
  if(p.locked && p.chosen){ const ix=getIndex(p.code,p.chosen); return ix?[ix]:c.indexes; }
  return c.indexes;
}
export function solve(maxSolutions){
  const active=state.plan.filter(p=>p.code); if(!active.length) return [];
  const cols=active.map(p=>({code:p.code, cands:candidatesFor(p).filter(ix=>!indexViolatesCons(ix))}));
  if(cols.some(c=>c.cands.length===0)) return {sols:[], blocked:cols.filter(c=>c.cands.length===0).map(c=>c.code)};
  cols.sort((a,b)=>a.cands.length-b.cands.length); // tightest first
  const sols=[]; let nodes=0; const NODE_CAP=600000;
  const acc=[]; const pick=[];
  function bt(i){
    if(sols.length>=maxSolutions || nodes>NODE_CAP) return;
    if(i===cols.length){ const m={}; pick.forEach((ix,k)=>m[cols[k].code]=ix.index); sols.push(m); return; }
    for(const ix of cols[i].cands){
      nodes++;
      if(nodes>NODE_CAP) return;
      let ok=true;
      for(const s of ix.sessions){ for(const a of acc){ if(sessClash(s,a)){ok=false;break;} } if(!ok)break; }
      if(!ok) continue;
      const added=ix.sessions.map(s=>({...s,code:cols[i].code}));
      added.forEach(s=>acc.push(s)); pick.push(ix);
      bt(i+1);
      added.forEach(()=>acc.pop()); pick.pop();
      if(sols.length>=maxSolutions||nodes>NODE_CAP) return;
    }
  }
  bt(0);
  return {sols, blocked:[]};
}
export function solStats(m){
  const ss=[]; for(const code in m){ const ix=getIndex(code,m[code]); if(ix) ss.push(...ix.sessions); }
  const byDay={};
  ss.forEach(s=>{ (byDay[s.day]=byDay[s.day]||[]).push(s); });
  // A day only "counts" if it has at least one non-lecture session (when ignoreLec is on).
  let days=0;
  for(const d in byDay){ if(byDay[d].some(counts)) days++; }
  // Gaps / first / last are measured over counted sessions, so lecture-only days don't add load.
  let gap=0, earliest=1e9, latest=0, contact=0, maxDay=0;
  for(const d in byDay){
    const arr=byDay[d].filter(counts).sort((a,b)=>a.start-b.start);
    if(!arr.length) continue;
    let lastEnd=arr[0].start, dayMin=0; earliest=Math.min(earliest,arr[0].start);
    for(const s of arr){ contact+=s.end-s.start; dayMin+=s.end-s.start; if(s.start>lastEnd) gap+=s.start-lastEnd; lastEnd=Math.max(lastEnd,s.end); latest=Math.max(latest,s.end); }
    maxDay=Math.max(maxDay,dayMin);
  }
  if(earliest===1e9) earliest=0;
  return {days, gap, earliest, latest, contact, maxDay};
}
// Active criteria in priority order
export function activeCriteria(){ return state.criteria.filter(c=>c.enabled); }
// Lower-is-better metric per criterion, bucketed (30-min) so lower-priority criteria can break near-ties.
function critMetric(st, key){
  const b=v=>Math.round(v/30);
  switch(key){
    case 'days':    return st.days;
    case 'gaps':    return b(st.gap);
    case 'spread':  return b(st.maxDay);              // smaller heaviest-day = more spread out
    case 'estart':  return b(st.earliest);            // earlier start better
    case 'lstart':  return b(1440-st.earliest);       // later start better
    case 'efinish': return b(st.latest);              // earlier finish better
    default: return 0;
  }
}
// Compare two solutions lexicographically by active criteria; fall back to total gap.
export function cmpSol(a,b){
  const sa=solStats(a), sb=solStats(b);
  for(const c of activeCriteria()){
    const va=critMetric(sa,c.key), vb=critMetric(sb,c.key);
    if(va!==vb) return va-vb;
  }
  return (sa.gap-sb.gap) || (sa.days-sb.days);
}
export function fmtMin(m){ const h=Math.floor(m/60),mm=m%60; return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }

/* ============================ Swap Planner ============================ */
export function computeSwapOrder(){
  const active=state.plan.filter(p=>p.chosen);
  // modules that actually need a change
  const changes=active.filter(p=>state.baseline[p.code]&&state.baseline[p.code]!==p.chosen)
    .map(p=>({code:p.code,from:state.baseline[p.code],to:p.chosen}));
  if(!changes.length) return {order:[],stuck:[],noDiff:true};

  function idxClash(codeA,iA,codeB,iB){
    const xa=getIndex(codeA,iA); const xb=getIndex(codeB,iB);
    if(!xa||!xb) return false;
    for(const sa of xa.sessions) for(const sb of xb.sessions) if(sessClash(sa,sb)) return true;
    return false;
  }

  // current live state: baseline for changing modules, target for fixed ones
  const cur={};
  for(const p of active) cur[p.code]=state.baseline[p.code]||p.chosen;

  const targetMap=Object.fromEntries(changes.map(c=>[c.code,c.to]));
  const pending=new Set(changes.map(c=>c.code));
  const order=[];
  let progress=true;

  while(pending.size>0&&progress){
    progress=false;
    for(const code of [...pending]){
      let blocked=false;
      for(const [other,idx] of Object.entries(cur)){
        if(other===code) continue;
        if(idxClash(code,targetMap[code],other,idx)){blocked=true;break;}
      }
      if(!blocked){
        order.push({code,from:cur[code],to:targetMap[code]});
        cur[code]=targetMap[code];
        pending.delete(code);
        progress=true;
        break; // restart so updated state is used
      }
    }
  }
  const stuck=[...pending].map(code=>({code,from:cur[code],to:targetMap[code]}));
  return{order,stuck,noDiff:false};
}

/* ============================ Alternative ranking (for CSV export) ============================ */
// Rank a module's other indexes by how good the full plan would be with that index swapped in.
export function rankAlternatives(code, n){
  const p=state.plan.find(x=>x.code===code); const c=state.catalog.get(code); if(!p||!c) return [];
  const others=placedSessions(code); // sessions from the rest of the plan (their chosen indexes)
  // candidate indexes that are clash-free with the rest AND satisfy constraints, excluding the current pick
  const cand=c.indexes.filter(ix=>ix.index!==p.chosen
      && indexClashCodes(code,ix,others).length===0
      && !indexViolatesCons(ix));
  // score each by the resulting full-plan stats under current criteria
  const base={}; state.plan.forEach(q=>{ if(q.chosen) base[q.code]=q.chosen; });
  cand.sort((a,b)=>{ const ma={...base,[code]:a.index}, mb={...base,[code]:b.index}; return cmpSol(ma,mb); });
  return cand.slice(0,n).map(ix=>ix.index);
}
