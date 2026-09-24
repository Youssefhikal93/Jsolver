'use strict';

// ---------- adding ----------
let addCount = 0;
function addAt(type) {
  let p = mouseWorld;
  if (!p) {
    const c = viewCenter();
    const o = (addCount++ % 6) * 22;
    p = { x: c.x + o, y: c.y + o };
  }
  const n = makeNode(type, p.x, p.y);
  sel = new Set([n.id]); selLinks.clear(); selCell = null;
  commit();
}

// ---------- toolbar ----------
function setTool(t) {
  tool = t; pending = null;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  svg.classList.toggle('connect', t === 'connect');
  render();
}
function setLinkStyle(s) {
  linkStyle = s;
  document.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === s));
}
function toggleSnap() {
  snap = !snap;
  $('#snap').classList.toggle('on', snap);
  toast(snap ? 'Snap to grid on' : 'Snap to grid off');
}
function togglePanel(force) {
  const panel = $('#panel');
  const show = force ?? panel.hidden;
  panel.hidden = !show;
  $('#panelBtn').classList.toggle('on', show);
}

document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => setLinkStyle(b.dataset.style)));
document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { mouseWorld = null; addAt(b.dataset.add); }));
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#fit').addEventListener('click', fitView);
$('#snap').addEventListener('click', toggleSnap);
$('#zoomIn').addEventListener('click', () => zoomCenter(1.2));
$('#zoomOut').addEventListener('click', () => zoomCenter(1 / 1.2));
$('#panelBtn').addEventListener('click', () => togglePanel());
$('#helpBtn').addEventListener('click', () => $('#help').showModal());

$('#clear').addEventListener('click', () => {
  if (!state.nodes.length) return;
  if (!confirm('Clear the whole board? (You can undo this.)')) return;
  state.nodes = []; state.links = [];
  sel.clear(); selLinks.clear(); selCell = null; pending = null;
  commit();
});

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'jsolver', version: 1, state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jsolver-board-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#import').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const s = data.state || data;
      if (!validBoard(s)) throw new Error('bad file');
      state = s; sel.clear(); selLinks.clear(); selCell = null;
      commit(); fitView(); toast('Board imported');
    } catch (_) { toast('Could not read that file'); }
  };
  reader.readAsText(f);
  e.target.value = '';
});

selbar.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.color) return applyColor(b.dataset.color);
  switch (b.dataset.act) {
    case 'edit': { const id = [...sel][0]; startEdit(id, selCell && selCell.id === id ? selCell.idx : null); break; }
    case 'dup': duplicateSelection(); break;
    case 'delete': deleteSelection(); break;
    case 'reverse': reverseLinks(); break;
    case 'style': toggleLinkStyle(); break;
    case 'label': labelLinks(); break;
    case 'addcell': arrayAddCell(); break;
    case 'rmcell': arrayRemoveCell(); break;
    case 'values': arraySetValues(); break;
  }
});

// theme
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch (_) { /* ignore */ }
$('#theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
});

// ---------- keyboard ----------
window.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (editing || tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ($('#help').open) return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (mod) {
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'd') { e.preventDefault(); duplicateSelection(); }
    else if (k === 'a') { e.preventDefault(); sel = new Set(state.nodes.map(n => n.id)); selLinks = new Set(state.links.map(l => l.id)); render(); }
    else if (k === 's') { e.preventDefault(); persist(); toast('Saved in this browser'); }
    return;
  }
  if (e.altKey) return;

  const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
  if ((k === 'arrowright' || k === 'arrowleft' || k === '.' || k === ',') && !e.shiftKey &&
      sel.size && [...sel].every(id => byId(id)?.type === 'pointer')) {
    // pointers: step along next / prev instead of nudging
    e.preventDefault();
    stepPointers(k === 'arrowright' || k === '.' ? 1 : -1);
    return;
  }
  if (arrows[k] && sel.size) {
    e.preventDefault();
    const step = e.shiftKey ? 20 : 2;
    sel.forEach(id => { const n = byId(id); if (n) { n.x += arrows[k][0] * step; n.y += arrows[k][1] * step; } });
    commit();
    return;
  }

  switch (k) {
    case 'delete': case 'backspace': e.preventDefault(); deleteSelection(); break;
    case 'escape':
      closePtrMenu(); pending = null; sel.clear(); selLinks.clear(); selCell = null; render(); break;
    case 'enter': case 'f2':
      if (sel.size === 1) { e.preventDefault(); const id = [...sel][0]; startEdit(id, selCell && selCell.id === id ? selCell.idx : null); }
      break;
    case 'v': setTool('select'); break;
    case 'c': setTool(tool === 'connect' ? 'select' : 'connect'); break;
    case 'n': addAt('circle'); break;
    case 'a': addAt('array'); break;
    case 's': addAt('set'); break;
    case 'p': addAt('pointer'); break;
    case 'u': addAt('null'); break;
    case 't': addAt('text'); break;
    case 'k': addAt('box'); break;
    case 'r': if (selLinks.size) reverseLinks(); break;
    case 'f': fitView(); break;
    case 'g': toggleSnap(); break;
    case 'b': togglePanel(); break;
    case '0': { const r = svg.getBoundingClientRect(); const c = viewCenter(); view.k = 1; view.x = r.width / 2 - c.x; view.y = r.height / 2 - c.y; render(); persist(); break; }
    case '+': case '=': zoomCenter(1.2); break;
    case '-': case '_': zoomCenter(1 / 1.2); break;
    case ']': arrayAddCell(); break;
    case '[': arrayRemoveCell(); break;
    case '?': $('#help').showModal(); break;
    default:
      if (/^[1-7]$/.test(k) && (sel.size)) applyColor(COLORS[+k - 1]);
  }
});

// ---------- boot ----------
function seed() {
  const r = svg.getBoundingClientRect();
  view = { x: r.width / 2, y: r.height / 2 - 40, k: 1 };
  const vals = ['1', '2', '3', '4'];
  const nodes = vals.map((v, i) => makeNode('circle', -165 + i * 110, 0, { value: v }));
  for (let i = 0; i < nodes.length - 1; i++) addLinkRaw(nodes[i].id, null, nodes[i + 1].id, null, 'next');
  const head = makeNode('pointer', nodes[0].x, -90, { value: 'head' });
  addLinkRaw(head.id, null, nodes[0].id, null, 'next');
  const nul = makeNode('null', nodes[3].x + 110, 0);
  addLinkRaw(nodes[3].id, null, nul.id, null, 'next');
  makeNode('text', -10, 110, { value: 'Double-click empty space to add a node\nDrag the ● handle on a node to link it' });
}

// sidebar collapse (icons only); remembered per browser, collapsed by default on small screens
const COLLAPSE_KEY = 'jsolver.sidebar.collapsed';
function setCollapsed(c) {
  document.body.classList.toggle('collapsed', c);
  try { localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0'); } catch (_) { /* ignore */ }
}
$('#collapseBtn').addEventListener('click', () => setCollapsed(!document.body.classList.contains('collapsed')));
let savedCollapse = null;
try { savedCollapse = localStorage.getItem(COLLAPSE_KEY); } catch (_) { /* ignore */ }
document.body.classList.toggle('collapsed', savedCollapse ? savedCollapse === '1' : window.innerWidth < 720);

if (window.innerWidth < 720) togglePanel(false);
if (!loadSaved()) seed();
hist = [JSON.stringify(state)]; hIdx = 0;
render();
