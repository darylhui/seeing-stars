/* ============================ Themes ============================ */
import { state, save } from './state.js';

export const THEME_FIELDS = [
  ['--bg','Background'], ['--panel','Panel'], ['--panel2','Panel (alt)'], ['--line','Border'],
  ['--ink','Text'], ['--mut','Muted text'], ['--mut2','Muted text (dim)'],
  ['--accent','Accent'], ['--good','Success'], ['--warn','Warning'], ['--bad','Danger'],
];
export const THEME_VARS = THEME_FIELDS.map(f=>f[0]);

export const BUILTIN_THEMES = {
  'chaos-theory': {
    name:'GMK Chaos Theory',
    '--bg':'#1a0f2e','--panel':'#201538','--panel2':'#271c44','--line':'#37255a',
    '--ink':'#e5dff5','--mut':'#9580b8','--mut2':'#6a5585',
    '--accent':'#f2c14e','--good':'#5bbf7a','--warn':'#f0a030','--bad':'#e05555'
  },
  'original': {
    name:'Original Dark',
    '--bg':'#0E1217','--panel':'#161C24','--panel2':'#1C242E','--line':'#28313D',
    '--ink':'#E8EEF4','--mut':'#8A97A6','--mut2':'#5E6B79',
    '--accent':'#4F9CF9','--good':'#36D399','--warn':'#F4A93C','--bad':'#FF5D6C'
  },
  'nord': {
    name:'Nord',
    '--bg':'#2e3440','--panel':'#3b4252','--panel2':'#434c5e','--line':'#4c566a',
    '--ink':'#eceff4','--mut':'#9099a5','--mut2':'#636f7e',
    '--accent':'#88c0d0','--good':'#a3be8c','--warn':'#ebcb8b','--bad':'#bf616a'
  },
  'dracula': {
    name:'Dracula',
    '--bg':'#282a36','--panel':'#313344','--panel2':'#3a3c50','--line':'#44475a',
    '--ink':'#f8f8f2','--mut':'#8f92a6','--mut2':'#6272a4',
    '--accent':'#bd93f9','--good':'#50fa7b','--warn':'#ffb86c','--bad':'#ff5555'
  },
  'catppuccin': {
    name:'Catppuccin Mocha',
    '--bg':'#1e1e2e','--panel':'#252535','--panel2':'#2a2a40','--line':'#363650',
    '--ink':'#cdd6f4','--mut':'#9399b2','--mut2':'#6c7086',
    '--accent':'#89b4fa','--good':'#a6e3a1','--warn':'#fab387','--bad':'#f38ba8'
  },
  'tokyo-night': {
    name:'Tokyo Night',
    '--bg':'#1a1b2e','--panel':'#1f2040','--panel2':'#24284a','--line':'#2e3154',
    '--ink':'#c0caf5','--mut':'#7982c4','--mut2':'#565f89',
    '--accent':'#7aa2f7','--good':'#9ece6a','--warn':'#e0af68','--bad':'#f7768e'
  }
};

export function allThemes(){
  const out = {};
  for(const [key,t] of Object.entries(BUILTIN_THEMES)) if(!state.removedThemes.includes(key)) out[key]=t;
  Object.assign(out, state.customThemes);
  return out;
}

export function applyTheme(key){
  const themes = allThemes();
  if(!themes[key]) key = Object.keys(themes)[0];
  if(!key) return;
  const t = themes[key];
  const root = document.documentElement;
  THEME_VARS.forEach(v=>{ if(t[v]) root.style.setProperty(v, t[v]); });
  state.currentTheme = key;
  save();
}

function slugify(name){
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'theme';
  let key = 'custom-'+base, i = 2;
  while(allThemes()[key]) key = 'custom-'+base+'-'+(i++);
  return key;
}

export function addCustomTheme(name, colors){
  const key = slugify(name);
  const theme = { name: name.trim() || 'Custom theme' };
  THEME_VARS.forEach(v=>{ theme[v] = colors[v]; });
  state.customThemes[key] = theme;
  save();
  return key;
}

// Returns false if the theme couldn't be deleted (e.g. it's the last one left).
export function deleteTheme(key){
  const themes = allThemes();
  if(Object.keys(themes).length<=1) return false;
  if(state.customThemes[key]) delete state.customThemes[key];
  else if(BUILTIN_THEMES[key]) state.removedThemes.push(key);
  else return false;
  if(state.currentTheme===key) applyTheme(Object.keys(allThemes())[0]);
  save();
  return true;
}

export function restoreDefaultThemes(){
  state.removedThemes = [];
  save();
}
