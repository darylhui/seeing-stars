/* ============================ Event wiring ============================ */
import { $ } from './dom.js';
import { state, save, assignColor, CRIT_DEFS } from './state.js';
import { allThemes, applyTheme, addCustomTheme, restoreDefaultThemes, THEME_FIELDS } from './themes.js';
import {
  placedSessions, indexClashCodes, solve, solStats, cmpSol, activeCriteria, rankAlternatives, fmtMin,
} from './planner.js';
import { parseCourseText, htmlToText, pdfToText } from './parser.js';
import { exportIcs } from './ics.js';
import {
  renderHeaderStats, renderClashBanner, renderSidebar, renderGrid, renderSwapResult,
  buildThemePicker, buildOptControls, hexA,
} from './render.js';

export function renderAll(){ renderHeaderStats(); renderSidebar(); renderClashBanner(); renderGrid(); wireSidebar(); save(); }

function addCourse(code){
  if(state.plan.some(p=>p.code===code)) return;
  const c=state.catalog.get(code);
  // auto-pick first clash-free index if possible
  const others=placedSessions(code);
  let chosen=null;
  for(const ix of c.indexes){ if(indexClashCodes(code,ix,others).length===0){chosen=ix.index;break;} }
  if(!chosen && c.indexes.length) chosen=c.indexes[0].index;
  state.plan.push({code,chosen,locked:false,open:false});
  renderAll();
}
function removeCourse(code){ state.plan=state.plan.filter(p=>p.code!==code); renderAll(); }

function wireSidebar(){
  const body=$('sideBody');
  body.querySelectorAll('[data-add]').forEach(b=>b.onclick=e=>{e.stopPropagation();addCourse(b.dataset.add);});
  body.querySelectorAll('[data-remove]').forEach(b=>b.onclick=e=>{e.stopPropagation();removeCourse(b.dataset.remove);});
  body.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{const p=state.plan.find(x=>x.code===b.dataset.toggle);p.open=!p.open;renderSidebar();wireSidebar();});
  body.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const[code,idx]=b.dataset.pick.split('|');const p=state.plan.find(x=>x.code===code);p.chosen=idx;p.open=false;renderAll();});
  body.querySelectorAll('[data-lock]').forEach(b=>b.onclick=e=>{e.stopPropagation();const p=state.plan.find(x=>x.code===b.dataset.lock);p.locked=!p.locked;renderAll();});
  const cs=$('catSearch'); if(cs){ cs.oninput=()=>{state.catSearch=cs.value; const pos=cs.selectionStart; renderSidebar(); wireSidebar(); const n=$('catSearch'); if(n){n.focus();n.setSelectionRange(pos,pos);} }; }
  body.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.catFilter=b.dataset.filter;renderSidebar();wireSidebar();});
  body.querySelectorAll('[data-setcat]').forEach(sel=>sel.onchange=()=>{const c=state.catalog.get(sel.dataset.setcat);if(c){c.category=sel.value;save();renderSidebar();wireSidebar();}});
  // swap tab
  body.querySelectorAll('.swap-sel').forEach(sel=>sel.onchange=()=>{
    const code=sel.dataset.swapcode;
    state.baseline[code]=sel.value||undefined;
    if(!sel.value) delete state.baseline[code];
    save(); renderSidebar(); wireSidebar();
    // re-run result if already shown
    if($('swapResult')&&$('swapResult').innerHTML) renderSwapResult();
  });
  const cb=$('computeSwap'); if(cb) cb.onclick=renderSwapResult;
}

function addImported(c){
  const existed = state.catalog.has(c.code);
  // Preserve a manually-set category if re-importing and the new import left it blank
  if(existed && !c.category){ const old=state.catalog.get(c.code); if(old && old.category) c.category=old.category; }
  state.catalog.set(c.code,c); assignColor(c.code);
  // If this module is in the plan, keep it but fix the chosen index if it no longer exists
  const inPlan=state.plan.find(p=>p.code===c.code);
  if(inPlan){
    const stillValid = inPlan.chosen && c.indexes.some(ix=>ix.index===inPlan.chosen);
    if(!stillValid){
      const others=placedSessions(c.code);
      let pick=null;
      for(const ix of c.indexes){ if(indexClashCodes(c.code,ix,others).length===0){pick=ix.index;break;} }
      inPlan.chosen = pick || (c.indexes[0]&&c.indexes[0].index) || null;
      inPlan.locked = false;
    }
    renderAll();
  } else {
    renderHeaderStats();
    if(state.sideTab==='catalog'){ renderSidebar(); wireSidebar(); }
  }
  return existed;
}

export function initEvents(){
  /* ----- tabs ----- */
  $('tabPlan').onclick=()=>{state.sideTab='plan';renderSidebar();wireSidebar();};
  $('tabCatalog').onclick=()=>{state.sideTab='catalog';renderSidebar();wireSidebar();};
  $('tabSwap').onclick=()=>{state.sideTab='swap';renderSidebar();wireSidebar();};

  /* ----- mobile sidebar ----- */
  function openSide(o){ $('sidebar').classList.toggle('open',o); $('sideScrim').classList.toggle('open',o); }
  $('mtoggle').onclick=()=>openSide(!$('sidebar').classList.contains('open'));
  $('sideScrim').onclick=()=>openSide(false);

  /* ----- ignore-lectures toggle ----- */
  $('lecToggle').onclick=()=>{
    state.ignoreLec=!state.ignoreLec;
    $('lecToggle').classList.toggle('on',state.ignoreLec);
    renderAll();
  };

  /* ----- Optimize modal: priorities + constraints ----- */
  $('optBtn').onclick=()=>{ buildOptControls(); $('optBody').innerHTML=''; $('optScrim').classList.add('open'); };
  $('optClose').onclick=()=>$('optScrim').classList.remove('open');
  $('optScrim').onclick=e=>{if(e.target===$('optScrim'))$('optScrim').classList.remove('open');};

  $('runOpt').onclick=()=>{
    const active=state.plan.filter(p=>p.code);
    const body=$('optBody');
    if(!active.length){ body.innerHTML='<p>Add some modules to your plan first.</p>'; return; }
    body.innerHTML='<p class="mini">Searching…</p>';
    setTimeout(()=>{
      const res=solve(2500);
      if(res.blocked && res.blocked.length){
        body.innerHTML=`<p><b style="color:var(--bad)">${res.blocked.join(', ')}</b> ha${res.blocked.length>1?'ve':'s'} no index that fits your constraints. Loosen the time limits or free-day choices.</p>`;
        return;
      }
      const sols=res.sols;
      if(!sols.length){
        body.innerHTML=`<p><b style="color:var(--bad)">No fully clash-free combination exists</b> for these ${active.length} modules with the current locks/constraints. Try unlocking a module, relaxing a constraint, or removing one.</p>`;
        return;
      }
      sols.sort(cmpSol);
      const top=sols.slice(0,6);
      const active2=activeCriteria();
      const order = active2.length ? active2.map(c=>CRIT_DEFS[c.key].label).join(' → ') : 'any valid (no priorities set)';
      body.innerHTML=`<p>${sols.length>=2500?'2500+':sols.length} clash-free option${sols.length>1?'s':''} · ordered by <b style="color:var(--ink)">${order}</b>.</p>`+
        top.map((m,i)=>{
          const st=solStats(m);
          return `<div class="sol-card">
            <div class="sol-top"><span class="sol-badge">OPTION ${i+1}</span>
              <div class="sol-stats">
                <span><b>${st.days}</b> days</span>
                <span><b>${(st.contact/60).toFixed(1)}h</b> ${state.ignoreLec?'non-lec':''}</span>
                <span>gaps <b>${(st.gap/60).toFixed(1)}h</b></span>
                <span>first <b>${fmtMin(st.earliest)}</b></span>
                <span>last <b>${fmtMin(st.latest)}</b></span>
              </div></div>
            <div class="sol-idx">${Object.keys(m).sort().map(code=>`<span style="color:${state.colorOf[code]};border-color:${hexA(state.colorOf[code],.4)}">${code} ${m[code]}</span>`).join('')}</div>
            <button class="btn primary" data-apply='${i}'>Apply this option</button>
          </div>`;
        }).join('');
      body.querySelectorAll('[data-apply]').forEach(btn=>btn.onclick=()=>{
        const m=top[+btn.dataset.apply];
        state.plan.forEach(p=>{ if(m[p.code]) p.chosen=m[p.code]; });
        $('optScrim').classList.remove('open'); renderAll();
      });
    },30);
  };

  /* ----- Import modal ----- */
  $('importBtn').onclick=()=>$('importScrim').classList.add('open');
  $('importClose').onclick=()=>$('importScrim').classList.remove('open');
  $('importScrim').onclick=e=>{if(e.target===$('importScrim'))$('importScrim').classList.remove('open');};

  $('parsePaste').onclick=()=>{
    const txt=$('pasteArea').value;
    try{ const c=parseCourseText(txt, state.impCat); const upd=addImported(c);
      $('pasteStatus').textContent=`${upd?'Updated':'Added'} ${c.code} (${c.indexes.length} indexes, ${state.impCat})`; $('pasteStatus').style.color='var(--good)';
      $('pasteArea').value=''; save();
    }catch(err){ $('pasteStatus').textContent=err.message; $('pasteStatus').style.color='var(--bad)'; }
  };
  $('impCatSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    $('impCatSeg').querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.impCat=b.dataset.cat;
  });

  $('pdfFile').onchange=async e=>{
    const files=[...e.target.files]; if(!files.length) return;
    const st=$('pdfStatus'); st.style.color='var(--mut)'; st.textContent='Reading…';
    let added=0,updated=0,errs=[];
    for(const f of files){
      try{
        const isHtml=/\.html?$/i.test(f.name)||f.type==='text/html';
        const txt=isHtml ? htmlToText(await f.text()) : await pdfToText(f);
        const c=parseCourseText(txt, state.impCat); const upd=addImported(c); upd?updated++:added++;
      }
      catch(err){ errs.push(f.name+': '+err.message); }
    }
    save();
    const okAny=added||updated;
    st.style.color=okAny?'var(--good)':'var(--bad)';
    const parts=[];
    if(added) parts.push(`added ${added}`);
    if(updated) parts.push(`updated ${updated}`);
    st.textContent=(okAny?`Done — ${parts.join(', ')} as ${state.impCat}. `:'')+(errs.length?errs.join(' | '):'');
    e.target.value='';
  };

  /* ----- Export CSV: selected index + next-best 5 alternatives per module ----- */
  function csvCell(v){ v=(v==null?'':String(v)); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
  $('exportBtn').onclick=()=>{
    const rows=[['Module','Title','Category','Selected index','Alt 1','Alt 2','Alt 3','Alt 4','Alt 5']];
    const inPlan=state.plan.filter(p=>p.code);
    if(!inPlan.length){ alert('Add some modules to your plan first.'); return; }
    for(const p of inPlan){
      const c=state.catalog.get(p.code);
      const alts=rankAlternatives(p.code,5);
      while(alts.length<5) alts.push('');           // blanks if not enough indexes
      rows.push([p.code, c.title, c.category||'', p.chosen||'', ...alts]);
    }
    const csv=rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='seeing-stars-indexes.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  /* ----- Welcome / help ----- */
  function openWelcome(){ $('welcomeScrim').classList.add('open'); }
  function closeWelcome(){ $('welcomeScrim').classList.remove('open'); state.welcomeSeen=true; save(); }
  $('helpBtn').onclick=openWelcome;
  $('welcomeClose').onclick=closeWelcome;
  $('welcomeGo').onclick=closeWelcome;
  $('welcomeScrim').onclick=e=>{ if(e.target===$('welcomeScrim')) closeWelcome(); };
  if(!state.welcomeSeen) openWelcome();

  /* ----- Sidebar minimise / reopen ----- */
  function applySidebarMin(){
    $('app').classList.toggle('side-collapsed', state.sidebarMin);
    $('sideReopen').hidden = !state.sidebarMin;
  }
  $('sideMin').onclick=()=>{ state.sidebarMin=true; applySidebarMin(); save(); };
  $('sideReopen').onclick=()=>{ state.sidebarMin=false; applySidebarMin(); save(); };
  applySidebarMin();

  /* ----- ICS export ----- */
  $('icsBtn').onclick=()=>{
    if(!state.plan.filter(p=>p.chosen).length){ alert('Add some modules and pick indexes first.'); return; }
    $('icsScrim').classList.add('open');
  };
  $('icsClose').onclick=()=>$('icsScrim').classList.remove('open');
  $('icsScrim').onclick=e=>{if(e.target===$('icsScrim'))$('icsScrim').classList.remove('open');};
  $('icsExport').onclick=exportIcs;

  /* ----- Theme picker ----- */
  $('themeBtn').onclick=e=>{
    e.stopPropagation();
    const menu=$('themeMenu');
    if(!menu.classList.contains('open')) buildThemePicker();
    menu.classList.toggle('open');
  };
  document.addEventListener('click',e=>{
    if(!$('themeWrap').contains(e.target)) $('themeMenu').classList.remove('open');
  });

  /* ----- Custom theme editor ----- */
  function buildColorGrid(source){
    $('colorGrid').innerHTML = THEME_FIELDS.map(([v,label])=>`
      <label class="color-field">
        <input type="color" data-var="${v}" value="${source[v]||'#000000'}">
        <span>${label}</span>
      </label>`).join('');
  }
  function openThemeEditor(){
    const themes=allThemes();
    const base=themes[state.currentTheme]||Object.values(themes)[0];
    $('themeBase').innerHTML=Object.entries(themes).map(([key,t])=>`<option value="${key}" ${key===state.currentTheme?'selected':''}>${t.name}</option>`).join('');
    $('themeName').value='';
    buildColorGrid(base);
    $('themeMenu').classList.remove('open');
    $('themeEditScrim').classList.add('open');
  }
  $('themeBase').onchange=()=>{ buildColorGrid(allThemes()[$('themeBase').value]); };
  $('newThemeBtn').onclick=openThemeEditor;
  $('themeEditClose').onclick=()=>$('themeEditScrim').classList.remove('open');
  $('themeEditScrim').onclick=e=>{if(e.target===$('themeEditScrim'))$('themeEditScrim').classList.remove('open');};
  $('themeSaveBtn').onclick=()=>{
    const name=$('themeName').value.trim();
    if(!name){ alert('Give your theme a name first.'); return; }
    const colors={};
    $('colorGrid').querySelectorAll('input[data-var]').forEach(inp=>{ colors[inp.dataset.var]=inp.value; });
    const key=addCustomTheme(name, colors);
    applyTheme(key);
    $('themeEditScrim').classList.remove('open');
  };
  $('resetThemesBtn').onclick=()=>{
    if(!confirm('Bring back every built-in theme you\'ve deleted?')) return;
    restoreDefaultThemes();
  };
}
