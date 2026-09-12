/* ============================ Course import parsing ============================ */
// Parses NTU STARS "Content of Course" pages (as pasted text, saved HTML, or PDF)
// into the course/index/session shape used by the rest of the app.

function expandWeeks(remark){
  if(!remark) return [1,2,3,4,5,6,7,8,9,10,11,12,13];
  const m=remark.match(/Teaching Wk([0-9,\-]+)/); if(!m) return [1,2,3,4,5,6,7,8,9,10,11,12,13];
  const out=new Set();
  m[1].split(',').forEach(part=>{ if(part.includes('-')){const[a,b]=part.split('-').map(Number);for(let i=a;i<=b;i++)out.add(i);} else if(part.trim()) out.add(+part); });
  return [...out].sort((a,b)=>a-b);
}
const DMAP={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6};
function toMin(t){return +t.slice(0,2)*60 + +t.slice(2);}

export function parseCourseText(text, category){
  const lines=text.split('\n').map(l=>l.trim());
  let code=null,title=null,au=null,exam=null;
  for(let i=0;i<lines.length;i++){
    const full=lines[i].match(/\[\+\]\s+([A-Z]{2,4}\d{4}[A-Z]?)\s+(.+?)\s+(\d+)\s+AU/);
    if(full && full[2].trim()){ code=full[1]; title=full[2].trim(); au=+full[3]; }
    else{
      const split=lines[i].match(/\[\+\]\s+([A-Z]{2,4}\d{4}[A-Z]?)\s+(\d+)\s+AU/);
      if(split){
        code=split[1]; au=+split[2];
        const before=(lines[i-1]||'').trim(), after=(lines[i+1]||'').trim();
        const labels=/^(Prerequisite|Mutually|Not available|Grading|Remark|Exam|Course|Class|Index|exclusive|\^Content|\d+\/\d+\/\d+)/;
        const cont = (after && !labels.test(after)) ? after : '';
        title = cont ? (before+' '+cont).trim() : before;
      }
    }
    if(lines[i].startsWith('Exam Schedule:')){const v=lines[i].replace('Exam Schedule:','').trim();exam=/^not applicable/i.test(v)?null:v;}
  }
  if(!code) throw new Error('Could not find a course code (e.g. SC2103, EG1005, MH1810).');
  const re=/^(?:(\d{4,6})\s+)?(Lec\/Studio|Tut|Lab|Sem|Studio)\s+(\S+)\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{4})to(\d{4})\s+(\S+)(?:\s+(.*))?$/;
  const indexes={};const order=[];let cur=null;
  for(const l of lines){
    const m=l.match(re); if(!m) continue;
    const[,idx,typ,grp,day,st,en,ven,remark]=m;
    if(idx){cur=idx;if(!indexes[cur]){indexes[cur]=[];order.push(cur);}}
    if(!cur) continue;
    indexes[cur].push({type:typ,group:grp,day:DMAP[day],start:toMin(st),end:toMin(en),venue:ven,weeks:expandWeeks(remark||'')});
  }
  if(!order.length) throw new Error('No class schedule rows found.');
  return {code,title:title||code,au:au||3,exam,category:category||'',_imported:true,indexes:order.map(i=>({index:i,sessions:indexes[i]}))};
}

// Strip an NTU "Content of Course" HTML page down to line-structured text,
// so the same row parser works regardless of the exact markup.
export function htmlToText(html){
  let s=html
    .replace(/<\s*br\s*\/?>/gi,'\n')
    .replace(/<\/(tr|p|li|h[1-6]|table|thead|tbody|div)>/gi,'\n')
    .replace(/<\/(td|th)>/gi,' ')
    .replace(/<script[\s\S]*?<\/script>/gi,'')
    .replace(/<style[\s\S]*?<\/style>/gi,'')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#43;|&plus;/gi,'+').replace(/&#x2b;/gi,'+');
  return s.split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
}

let pdfjsReady=null;
function loadPdfJs(){
  if(pdfjsReady) return pdfjsReady;
  pdfjsReady=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=()=>{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror=()=>rej(new Error('Could not load PDF reader (offline?). Paste the text instead.'));
    document.head.appendChild(s);
  });
  return pdfjsReady;
}
export async function pdfToText(file){
  const lib=await loadPdfJs();
  const buf=await file.arrayBuffer();
  const pdf=await lib.getDocument({data:buf}).promise;
  let text='';
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p); const tc=await page.getTextContent();
    // reconstruct lines by y position
    const rows={};
    tc.items.forEach(it=>{ const y=Math.round(it.transform[5]); (rows[y]=rows[y]||[]).push(it); });
    Object.keys(rows).map(Number).sort((a,b)=>b-a).forEach(y=>{
      const line=rows[y].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      if(line) text+=line+'\n';
    });
  }
  return text;
}
