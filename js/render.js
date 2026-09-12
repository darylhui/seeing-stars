/* ============================ Rendering ============================ */
import { $, ICON_CHECK } from './dom.js';
import { state, DAYS, CRIT_DEFS, save, GRID_START, GRID_END, PX_PER_MIN } from './state.js';
import { allThemes, applyTheme, deleteTheme } from './themes.js';
import {
  getIndex, indexClashCodes, placedSessions, clashReport,
  counts, isLec, fmtMin, computeSwapOrder,
} from './planner.js';

export function weekLabel(w){
  if(w.length>=13) return null;
  const odd=[1,3,5,7,9,11,13], even=[2,4,6,8,10,12];
  const eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
  if(eq(w,odd)) return 'ODD';
  if(eq(w,even)) return 'EVEN';
  if(w[0]===2&&w[w.length-1]===13&&w.length===12) return 'W2–13';
  return 'W'+w[0]+'+';
}
export function sessAbbr(t){ return t==='Lec/Studio'?'LEC':t==='Tut'?'TUT':t==='Lab'?'LAB':t.slice(0,3).toUpperCase(); }

export function renderHeaderStats(){
  const au=state.plan.reduce((s,p)=>s+(state.catalog.get(p.code)?.au||0),0);
  $('auTotal').textContent=au;
  const conf=clashReport();
  const pill=$('clashPill');
  if(conf.length===0){ pill.className='pill ok'; $('clashTxt').textContent='No clashes'; }
  else{ pill.className='pill bad'; $('clashTxt').textContent=conf.length+' clash'+(conf.length>1?'es':''); }
  $('planCount').textContent=state.plan.length;
  $('catCount').textContent=state.catalog.size;
}

export function renderClashBanner(){
  const conf=clashReport(); const el=$('clashBanner');
  if(!conf.length){ el.innerHTML=''; return; }
  const seen=new Set(); const items=[];
  conf.forEach(([a,b])=>{
    const key=[a.code,b.code,a.day,a.start].join('|');
    if(seen.has(key))return; seen.add(key);
    items.push(`<li><b>${a.code}</b> ${sessAbbr(a.type)} & <b>${b.code}</b> ${sessAbbr(b.type)} — ${DAYS[a.day]} ${fmtMin(Math.max(a.start,b.start))}</li>`);
  });
  el.innerHTML=`<div class="inner"><b>${conf.length} clash${conf.length>1?'es':''} found.</b> Pick a different index, or hit Optimize.<ul>${items.join('')}</ul></div>`;
}

export function renderSidebar(){
  $('tabPlan').classList.toggle('active',state.sideTab==='plan');
  $('tabCatalog').classList.toggle('active',state.sideTab==='catalog');
  $('tabSwap').classList.toggle('active',state.sideTab==='swap');
  const body=$('sideBody');
  if(state.sideTab==='plan') body.innerHTML=planHTML();
  else if(state.sideTab==='catalog') body.innerHTML=catalogHTML();
  else body.innerHTML=swapHTML();
}

function planHTML(){
  if(!state.plan.length) return emptyState('plus','No courses yet','Switch to Catalog and tap + to add courses to your plan.');
  return state.plan.map(p=>{
    const c=state.catalog.get(p.code); const col=state.colorOf[p.code];
    const others=placedSessions(p.code);
    const chosen=p.chosen?getIndex(p.code,p.chosen):null;
    let chosenSummary='';
    if(chosen){
      const clashCodes=indexClashCodes(p.code,chosen,others);
      chosenSummary = `<span class="chosen-idx">${p.chosen}</span>` +
        chosen.sessions.map(s=>`<span class="mini">${sessAbbr(s.type)} ${DAYS[s.day]} ${fmtMin(s.start)}</span>`).join('') +
        (clashCodes.length?`<span class="idx-clashwith">Clashes with ${clashCodes.join(', ')}</span>`:'');
    } else {
      chosenSummary = `<span class="chosen-idx unset">no index</span>`;
    }
    const opts = p.open ? `<div class="idx-list">${c.indexes.map(ix=>{
      const clashCodes=indexClashCodes(p.code,ix,others);
      const free=clashCodes.length===0;
      const sel=ix.index===p.chosen;
      return `<div class="idx-opt ${sel?'sel':''}" data-pick="${p.code}|${ix.index}">
        <span class="idx-status ${free?'free':'clash'}"></span>
        <span class="idx-num">${ix.index}</span>
        <span class="idx-sess">${ix.sessions.map(s=>`<div><b>${sessAbbr(s.type)}</b> ${DAYS[s.day]} ${fmtMin(s.start)}–${fmtMin(s.end)} · ${s.venue}${weekLabel(s.weeks)?' · '+weekLabel(s.weeks):''}</div>`).join('')}
        ${!free?`<div class="idx-clashwith">clashes with ${clashCodes.join(', ')}</div>`:''}</span>
      </div>`;
    }).join('')}</div>` : '';
    return `<div class="course-card plan-card" data-code="${p.code}">
      <div class="course-head" data-toggle="${p.code}">
        <div class="swatch" style="background:${col}"></div>
        <div class="course-meta">
          <div class="course-code">${p.code}</div>
          <div class="course-title">${c.title}</div>
        </div>
        <button class="course-add" data-remove="${p.code}" title="Remove">−</button>
      </div>
      <div class="chosen-row">
        ${chosenSummary}
        <button class="lockbtn ${p.locked?'on':''}" data-lock="${p.code}" title="Lock index when optimizing">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
          ${p.locked?'Locked':'Lock'}
        </button>
      </div>
      ${opts}
    </div>`;
  }).join('');
}

function catalogHTML(){
  const q=state.catSearch.toLowerCase();
  let list=[...state.catalog.values()].filter(c=> !q || c.code.toLowerCase().includes(q)||c.title.toLowerCase().includes(q));
  if(state.catFilter!=='all') list=list.filter(c=>(c.category||'Other')===state.catFilter);
  list.sort((a,b)=>a.code.localeCompare(b.code));
  const cnt=cat=> cat==='all'?state.catalog.size:[...state.catalog.values()].filter(c=>(c.category||'Other')===cat).length;
  const pill=(val,lbl)=>`<button class="fpill ${state.catFilter===val?'active':''}" data-filter="${val}">${lbl}<span class="fcount">${cnt(val)}</span></button>`;
  const filters=`<div class="filter-row">${pill('all','All')}${pill('Core','Core')}${pill('MPE','MPE')}${pill('Other','Other')}</div>`;
  const search=`<input class="search" id="catSearch" placeholder="Search code or title…" value="${state.catSearch.replace(/"/g,'&quot;')}">`;
  if(!list.length) return search+filters+emptyState('search','No matches','Try another code, title, or category.');
  return search+filters+list.map(c=>{
    const inPlan=state.plan.some(p=>p.code===c.code);
    const cat=c.category||'';
    const catSel=`<select class="catsel" data-setcat="${c.code}">
      ${['','Core','MPE','Other'].map(v=>`<option value="${v}" ${v===cat?'selected':''}>${v||'Set category'}</option>`).join('')}
    </select>`;
    return `<div class="course-card"><div class="course-head">
      <div class="swatch" style="background:${state.colorOf[c.code]}"></div>
      <div class="course-meta">
        <div class="course-code">${c.code}${c._imported?' <span class="tag">imported</span>':''}</div>
        <div class="course-title">${c.title}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        <button class="course-add" data-add="${c.code}" ${inPlan?'disabled style="opacity:.3"':''}>${inPlan?ICON_CHECK:'+'}</button>
      </div>
    </div>
    <div class="chosen-row" style="padding-top:0;gap:6px">
      ${cat?`<span class="tag cat-${cat}">${cat}</span>`:''}
      <span class="tag">${c.au} AU</span>
      <span class="tag">${c.indexes.length} indexes</span>
      ${c.exam?`<span class="tag exam-tag">Exam ${c.exam.split(' ')[0]}</span>`:`<span class="tag">No exam</span>`}
      ${catSel}
    </div></div>`;
  }).join('');
}

/* ---------- Swap Planner ---------- */
function swapHTML(){
  const active=state.plan.filter(p=>p.chosen);
  if(!active.length) return emptyState('plus','No modules selected','Add modules and pick your target indexes in My Plan first.');
  const rows=active.map(p=>{
    const c=state.catalog.get(p.code); const col=state.colorOf[p.code];
    const assigned=state.baseline[p.code]||'';
    const target=p.chosen;
    const same=assigned&&assigned===target;
    const opts=c.indexes.map(ix=>`<option value="${ix.index}"${ix.index===assigned?' selected':''}>${ix.index}</option>`).join('');
    let tClass=assigned?(same?'same':'diff'):'unset';
    let tLabel=assigned?(same?`${target} ${ICON_CHECK}`:target):'target: '+target;
    return `<div class="swap-row">
      <div class="swap-swatch" style="background:${col}"></div>
      <div class="swap-meta">
        <div class="swap-code">${p.code}</div>
        <select class="swap-sel" data-swapcode="${p.code}">
          <option value="">— not assigned —</option>
          ${opts}
        </select>
      </div>
      <div class="swap-arrow">→</div>
      <div class="swap-target ${tClass}">${tLabel}</div>
    </div>`;
  }).join('');
  return `<div>
    <p class="swap-intro">Set each module's school-assigned index. The planner works out the order to swap them one by one without clashing.</p>
    <div class="swap-list">${rows}</div>
    <button class="btn primary" id="computeSwap" style="width:100%;margin-top:10px">Get swap order</button>
    <div id="swapResult"></div>
  </div>`;
}

export function renderSwapResult(){
  const el=$('swapResult'); if(!el) return;
  const {order,stuck,noDiff}=computeSwapOrder();
  if(noDiff){el.innerHTML=`<div class="swap-ok">All modules are already at their target index.</div>`;return;}
  let html='<div style="margin-top:14px">';
  if(order.length){
    html+=`<div style="font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Swap order</div>`;
    order.forEach(({code,from,to},i)=>{
      const col=state.colorOf[code]||'var(--accent)';
      html+=`<div class="swap-step">
        <div class="swap-step-num" style="background:${col};color:var(--bg)">${i+1}</div>
        <div>
          <div class="swap-step-code" style="color:${col}">${code}</div>
          <div class="swap-step-detail">${from} → ${to}</div>
        </div>
      </div>`;
    });
  }
  if(stuck.length){
    const items=stuck.map(({code,from,to})=>`<div class="swap-stuck-item">${code}: ${from} → ${to}</div>`).join('');
    html+=`<div class="swap-stuck">
      <div class="swap-stuck-title">Deadlocked — swaps that block each other</div>
      ${items}
      <div class="swap-stuck-item" style="margin-top:6px;color:var(--mut)">
        Drop one of these modules temporarily in STARS, swap the other(s), then re-add it.
      </div>
    </div>`;
  }
  html+='</div>';
  el.innerHTML=html;
}

export function emptyState(icon,title,desc){
  const svg = icon==='plus'
    ? '<path d="M12 5v14M5 12h14"/>'
    : '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>';
  return `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svg}</svg><div style="font-weight:600;color:var(--mut)">${title}</div><div style="margin-top:4px">${desc}</div></div>`;
}

function dayMinutes(){
  const mins=[0,0,0,0,0], hasLec=[false,false,false,false,false];
  for(const p of state.plan){ if(!p.chosen) continue; const ix=getIndex(p.code,p.chosen); if(!ix) continue;
    for(const s of ix.sessions){ if(s.day<5){ if(counts(s)) mins[s.day]+=s.end-s.start; if(isLec(s)) hasLec[s.day]=true; } } }
  return {mins,hasLec};
}
function fmtHrs(m){ return m? (Math.round(m/60*10)/10)+'h' : '0h'; }

export function renderGrid(){
  const head=$('ttHead'); const body=$('ttBody');
  const todayIdx=(new Date().getDay()+6)%7; // Mon=0
  const {mins,hasLec}=dayMinutes();
  head.innerHTML='<div class="axis-h"></div>'+DAYS.map((d,i)=>{
    const free = mins[i]===0;
    const lecOnly = free && hasLec[i];
    const cls = free ? (lecOnly?'free lec':'free') : '';
    const label = mins[i]>0 ? fmtHrs(mins[i]) : (lecOnly?'LEC only':'free');
    return `<div class="day"><b>${d}</b><span class="dayhrs ${cls}">${label}</span></div>`;
  }).join('');
  const wk=$('wkHrs'); if(wk) wk.textContent=fmtHrs(mins.reduce((a,b)=>a+b,0))+'/wk';
  // axis
  let axis='<div class="axis">';
  for(let m=GRID_START;m<GRID_END;m+=60) axis+=`<div class="hr"><span>${fmtMin(m)}</span></div>`;
  axis+='</div>';
  // day columns
  let cols='';
  for(let d=0;d<5;d++){
    let hrs=''; for(let m=GRID_START;m<GRID_END;m+=60) hrs+='<div class="hr"></div>';
    cols+=`<div class="daycol ${d===todayIdx?'today':''}" data-day="${d}">${hrs}</div>`;
  }
  body.innerHTML=axis+cols;
  // place blocks — group same-slot sessions and stack them vertically
  const conf=clashReport();
  const clashSet=new Set();
  conf.forEach(([a,b])=>{ clashSet.add(a.code+'|'+a.idx+'|'+a.day+'|'+a.start); clashSet.add(b.code+'|'+b.idx+'|'+b.day+'|'+b.start); });
  const colEls=[...body.querySelectorAll('.daycol')];

  // 1. Collect every renderable session into a flat list
  const allSegs=[];
  for(const p of state.plan){
    if(!p.chosen) continue; const ix=getIndex(p.code,p.chosen); if(!ix) continue;
    for(const s of ix.sessions){
      allSegs.push({s, code:p.code, chosen:p.chosen, col:state.colorOf[p.code],
        isClash:clashSet.has(p.code+'|'+p.chosen+'|'+s.day+'|'+s.start)});
    }
  }

  // 2. Group by (day|start|end)
  const slotMap=new Map();
  for(const seg of allSegs){
    const key=`${seg.s.day}|${seg.s.start}|${seg.s.end}`;
    if(!slotMap.has(key)) slotMap.set(key,[]);
    slotMap.get(key).push(seg);
  }

  // 3. Render each group
  for(const [,group] of slotMap){
    const {s:fs}=group[0];
    const top=(fs.start-GRID_START)*PX_PER_MIN;
    const unitH=(fs.end-fs.start)*PX_PER_MIN;

    if(group.length===1){
      // Single block — original behaviour
      const {s,code,chosen,col,isClash}=group[0];
      const wl=weekLabel(s.weeks);
      const div=document.createElement('div');
      div.className='block'+(isClash?' clash':'');
      div.style.top=top+'px'; div.style.height=(unitH-3)+'px';
      div.style.background=hexA(col,.22); div.style.borderColor=hexA(col,.55);
      div.innerHTML=`${wl?`<span class="bk-wk" style="color:${col}">${wl}</span>`:''}
        <div class="bk-code" style="color:${col}">${code}</div>
        <div class="bk-type">${sessAbbr(s.type)} · ${chosen}${s.venue?' · '+s.venue:''}</div>`;
      colEls[s.day].appendChild(div);
    } else {
      // Multiple sessions share this slot — sort by earliest week, then stack
      group.sort((a,b)=>Math.min(...a.s.weeks)-Math.min(...b.s.weeks));
      const anyClash=group.some(g=>g.isClash);

      const container=document.createElement('div');
      container.className='block-stack'+(anyClash?' clash':'');
      container.style.cssText=`top:${top}px;height:${unitH-3}px;`;

      group.forEach(({s,code,chosen,col,isClash})=>{
        const wl=weekLabel(s.weeks);
        const sub=document.createElement('div');
        sub.className='stack-item'+(isClash?' clash-item':'');
        sub.style.borderLeftColor=col;
        sub.innerHTML=`<div class="bk-row1">
          <span class="bk-code" style="color:${col}">${code}</span>
          ${wl?`<span class="bk-wk" style="color:${col};background:${hexA(col,.25)}">${wl}</span>`:''}
        </div>
        <div class="bk-type">${sessAbbr(s.type)} · ${chosen}${s.venue?' · '+s.venue:''}</div>`;
        container.appendChild(sub);
      });

      colEls[fs.day].appendChild(container);
    }
  }
}
export function hexA(hex,a){
  const h=hex.replace('#',''); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- Theme picker ---------- */
export function buildThemePicker(){
  const list=$('themeList'); if(!list) return;
  const themes=allThemes();
  list.innerHTML=Object.entries(themes).map(([key,t])=>`
    <div class="theme-opt ${key===state.currentTheme?'cur':''}" data-tid="${key}">
      <div class="theme-dots">
        <div class="theme-dot" style="background:${t['--bg']}"></div>
        <div class="theme-dot" style="background:${t['--accent']}"></div>
        <div class="theme-dot" style="background:${t['--ink']}"></div>
      </div>
      <span class="theme-oname">${t.name}</span>
      <span class="theme-check">${ICON_CHECK}</span>
      <button class="theme-del" data-del="${key}" title="Delete theme" aria-label="Delete theme">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m3 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z"/></svg>
      </button>
    </div>`).join('');
  list.querySelectorAll('.theme-opt').forEach(el=>el.onclick=()=>{
    applyTheme(el.dataset.tid);
    buildThemePicker();
  });
  list.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const key=btn.dataset.del;
    if(Object.keys(allThemes()).length<=1){ alert('At least one theme has to stay — add another before removing this one.'); return; }
    if(!confirm(`Delete the "${themes[key].name}" theme?`)) return;
    deleteTheme(key);
    buildThemePicker();
  });
}

/* ---------- Optimize modal: priorities + constraints ---------- */
function activeRank(key){ const a=state.criteria.filter(c=>c.enabled); return a.findIndex(c=>c.key===key)+1; }
function timeOptions(current){
  let h=''; for(let m=480;m<=1290;m+=30) h+=`<option value="${m}" ${m===current?'selected':''}>${fmtMin(m)}</option>`;
  return h;
}
export function buildOptControls(){
  // criteria list (priority order, with up/down + checkbox)
  const cl=$('critList');
  cl.innerHTML=state.criteria.map((c,i)=>`
    <div class="crit ${c.enabled?'on':''}">
      <button class="crit-ck" data-ckey="${c.key}" aria-label="toggle">${ICON_CHECK}</button>
      <span class="crit-lbl">${CRIT_DEFS[c.key].label}</span>
      <span class="crit-pri">${c.enabled?('P'+(activeRank(c.key))):''}</span>
      <button class="crit-mv" data-up="${i}" ${i===0?'disabled':''}>↑</button>
      <button class="crit-mv" data-dn="${i}" ${i===state.criteria.length-1?'disabled':''}>↓</button>
    </div>`).join('');
  cl.querySelectorAll('[data-ckey]').forEach(b=>b.onclick=()=>{const c=state.criteria.find(x=>x.key===b.dataset.ckey);c.enabled=!c.enabled;save();buildOptControls();});
  cl.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.up;[state.criteria[i-1],state.criteria[i]]=[state.criteria[i],state.criteria[i-1]];save();buildOptControls();});
  cl.querySelectorAll('[data-dn]').forEach(b=>b.onclick=()=>{const i=+b.dataset.dn;[state.criteria[i+1],state.criteria[i]]=[state.criteria[i],state.criteria[i+1]];save();buildOptControls();});
  // constraints
  $('consMin').innerHTML='<option value="0">— any —</option>'+timeOptions(state.cons.minStart||0);
  $('consMin').value=state.cons.minStart||0;
  $('consMax').innerHTML='<option value="1440">— any —</option>'+timeOptions(state.cons.maxEnd||1440);
  $('consMax').value=state.cons.maxEnd||1440;
  $('consMin').onchange=()=>{state.cons.minStart=+$('consMin').value;save();};
  $('consMax').onchange=()=>{state.cons.maxEnd=+$('consMax').value;save();};
  $('freeDays').innerHTML=DAYS.map((d,i)=>`<button class="fday ${state.cons.freeDays.includes(i)?'on':''}" data-fd="${i}">${d}</button>`).join('');
  $('freeDays').querySelectorAll('[data-fd]').forEach(b=>b.onclick=()=>{const i=+b.dataset.fd;const k=state.cons.freeDays.indexOf(i);if(k<0)state.cons.freeDays.push(i);else state.cons.freeDays.splice(k,1);save();buildOptControls();});
}
