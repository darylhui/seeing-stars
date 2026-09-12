/* ============================ ICS Export ============================ */
import { $ } from './dom.js';
import { state } from './state.js';
import { getIndex, counts } from './planner.js';
import { weekLabel, sessAbbr } from './render.js';

function icsEsc(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }
function icsFold(line){
  let out='';
  while(line.length>75){ out+=line.slice(0,75)+'\r\n '; line=line.slice(75); }
  return out+line;
}

export function exportIcs(){
  const semStr=$('icsSemStart').value;
  if(!semStr){ $('icsStatus').textContent='Pick a start date first.'; $('icsStatus').style.color='var(--bad)'; return; }
  const [yr,mo,dy]=semStr.split('-').map(Number);
  const semStart=new Date(yr,mo-1,dy); // midnight local time = Monday of Week 1

  function toICSDate(baseDate, dayOffset, minuteOfDay){
    const d=new Date(baseDate);
    d.setDate(d.getDate()+dayOffset);
    const h=Math.floor(minuteOfDay/60), m=minuteOfDay%60;
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(h)}${p(m)}00`;
  }

  const lines=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Seeing Stars//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Seeing Stars Timetable',
    'X-WR-TIMEZONE:Asia/Singapore',
    'BEGIN:VTIMEZONE','TZID:Asia/Singapore',
    'BEGIN:STANDARD','TZOFFSETFROM:+0800','TZOFFSETTO:+0800','TZNAME:SGT',
    'DTSTART:19700101T000000Z','END:STANDARD','END:VTIMEZONE'
  ];

  let uid=0; let count=0;
  for(const p of state.plan){
    if(!p.chosen) continue;
    const ix=getIndex(p.code,p.chosen); if(!ix) continue;
    const c=state.catalog.get(p.code);
    const hex=state.colorOf[p.code]||'#4F9CF9';
    const hexUp=hex.toUpperCase();
    for(const s of ix.sessions){
      if(!counts(s)) continue; // respect "ignore lectures" toggle
      for(const week of s.weeks){
        uid++;
        const dayOffset=(week-1)*7+s.day; // s.day: 0=Mon … 4=Fri
        const dtstart=toICSDate(semStart,dayOffset,s.start);
        const dtend  =toICSDate(semStart,dayOffset,s.end);
        const summary=icsEsc(`${p.code} ${sessAbbr(s.type)} [${p.chosen}]`);
        const desc=icsEsc(`${c.title}\nGroup: ${s.group}\nVenue: ${s.venue}\nWeek ${week}`);
        const wl=weekLabel(s.weeks)||`W${week}`;
        lines.push(
          'BEGIN:VEVENT',
          icsFold(`UID:seeingstars-${uid}-${Date.now()}@planner`),
          icsFold(`DTSTART;TZID=Asia/Singapore:${dtstart}`),
          icsFold(`DTEND;TZID=Asia/Singapore:${dtend}`),
          icsFold(`SUMMARY:${summary} ${wl}`),
          icsFold(`DESCRIPTION:${desc}`),
          icsFold(`LOCATION:${icsEsc(s.venue)}`),
          icsFold(`COLOR:${hexUp}`),
          icsFold(`X-APPLE-CALENDAR-COLOR:${hexUp}`),
          icsFold(`CATEGORIES:${icsEsc(p.code)}`),
          'END:VEVENT'
        );
        count++;
      }
    }
  }
  lines.push('END:VCALENDAR');
  const ics=lines.join('\r\n')+'\r\n';
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='seeing-stars.ics'; a.click(); URL.revokeObjectURL(a.href);
  $('icsStatus').textContent=`Exported ${count} events`; $('icsStatus').style.color='var(--good)';
}
