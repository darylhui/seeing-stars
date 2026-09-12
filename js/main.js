/* ============================ Boot ============================ */
import { $ } from './dom.js';
import { state, load } from './state.js';
import { applyTheme } from './themes.js';
import { initEvents, renderAll } from './events.js';

load();
applyTheme(state.currentTheme);
initEvents();
renderAll();
$('lecToggle').classList.toggle('on', state.ignoreLec);
