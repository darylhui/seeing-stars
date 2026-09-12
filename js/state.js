/* ============================ Data & State ============================ */
export const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
export const DAYFULL = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
export const PALETTE = ['#4F9CF9','#36D399','#F4A93C','#C77DFF','#FF7A8A','#7BD389','#F49B6A','#6AB7FF','#E0C46C','#9D8DF1','#5FD0D6','#F7A1C4'];
export const GRID_START = 480, GRID_END = 1230, PX_PER_MIN = 56/60; // 8:00–20:30

// Optimization criteria, in priority order (first = highest). enabled toggles inclusion.
export const CRIT_DEFS = {
  days:    {label:'Fewest days on campus'},
  gaps:    {label:'Minimal gaps between classes'},
  spread:  {label:'Spread out (lighter days, balanced load)'},
  estart:  {label:'Start earlier in the day'},
  lstart:  {label:'Free mornings (start later)'},
  efinish: {label:'Finish earlier in the day'},
};

const STORE = 'seeing_stars_v1';
const LEGACY_STORE = 'ntu_idx_planner_v1'; // migrate silently from the pre-rebrand key

// Single shared mutable state object — modules import `state` and read/write its
// properties directly, so nobody needs to reassign the imported binding itself.
export const state = {
  catalog: new Map(),      // code -> course
  colorOf: {},              // code -> hex color
  plan: [],                 // [{code, chosen, locked, open}]
  baseline: {},              // {code: school-assigned index string}
  sideTab: 'plan',
  catSearch: '',
  catFilter: 'all',
  impCat: 'Core',
  ignoreLec: true,           // treat lectures as optional: skip them in day-count & hours
  sidebarMin: false,         // panel minimised (desktop)
  criteria: [
    {key:'days',    enabled:true},
    {key:'gaps',    enabled:false},
    {key:'spread',  enabled:false},
    {key:'estart',  enabled:false},
    {key:'lstart',  enabled:false},
    {key:'efinish', enabled:false},
  ],
  cons: { minStart:0, maxEnd:1440, freeDays:[] }, // minutes; freeDays = array of 0..4
  currentTheme: 'original',
  customThemes: {},          // key -> theme colors created by the user
  removedThemes: [],         // built-in theme keys the user has deleted
  welcomeSeen: false,
};

// Best-effort default; user can override per course.
// Common NTU Core Curriculum / foundation prefixes lean Core.
export function guessCat(code){ return /^(CC|CN|ET|HW|ML|HE|HY|HZ|GER|ICC)/.test(code) ? 'Core' : ''; }

export function assignColor(code){
  if(!state.colorOf[code]) state.colorOf[code] = PALETTE[Object.keys(state.colorOf).length % PALETTE.length];
  return state.colorOf[code];
}

export function normalize(c){
  return {
    code:c.code, title:c.title, au:c.au, exam:c.exam,
    category:c.category || guessCat(c.code),
    indexes:c.idx.map(ix=>({ index:ix.i, sessions:ix.s.map(s=>({
      type:s.t, group:s.g, day:s.d, start:s.s, end:s.e, venue:s.v, weeks:s.w
    }))}))
  };
}

/* ============================ Persistence ============================ */
export function save(){
  try{
    const imported = [...state.catalog.values()].filter(c=>c._imported);
    const cats={}; for(const c of state.catalog.values()) if(!c._imported && c.category) cats[c.code]=c.category;
    localStorage.setItem(STORE, JSON.stringify({
      plan: state.plan, imported, cats,
      ignoreLec: state.ignoreLec, criteria: state.criteria, cons: state.cons,
      sidebarMin: state.sidebarMin, welcomeSeen: state.welcomeSeen,
      theme: state.currentTheme, customThemes: state.customThemes, removedThemes: state.removedThemes,
      baseline: state.baseline,
    }));
  }catch(e){/* sandboxed storage: in-memory only */}
}

export function load(){
  try{
    const raw = localStorage.getItem(STORE) || localStorage.getItem(LEGACY_STORE);
    if(!raw) return;
    const d = JSON.parse(raw);
    (d.imported||[]).forEach(c=>{ c._imported=true; state.catalog.set(c.code,c); assignColor(c.code); });
    Object.entries(d.cats||{}).forEach(([code,cat])=>{ if(state.catalog.has(code)) state.catalog.get(code).category=cat; });
    state.plan = (d.plan||[]).filter(p=>state.catalog.has(p.code));
    if(typeof d.ignoreLec==='boolean') state.ignoreLec = d.ignoreLec;
    if(Array.isArray(d.criteria) && d.criteria.every(c=>CRIT_DEFS[c.key])) state.criteria = d.criteria;
    if(d.cons) state.cons = {minStart:d.cons.minStart||0, maxEnd:d.cons.maxEnd||1440, freeDays:d.cons.freeDays||[]};
    if(typeof d.sidebarMin==='boolean') state.sidebarMin = d.sidebarMin;
    state.welcomeSeen = !!d.welcomeSeen;
    if(d.customThemes && typeof d.customThemes==='object') state.customThemes = d.customThemes;
    if(Array.isArray(d.removedThemes)) state.removedThemes = d.removedThemes;
    if(d.theme) state.currentTheme = d.theme; // validated against available themes at apply-time
    if(d.baseline && typeof d.baseline==='object') state.baseline = d.baseline;
  }catch(e){}
}
