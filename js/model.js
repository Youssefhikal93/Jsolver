'use strict';

// ---------- model ops ----------
function nextValue() {
  const nums = state.nodes.filter(n => n.type === 'circle').map(n => parseInt(n.value, 10)).filter(v => !isNaN(v));
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}
function nextPointerName() {
  const used = new Set(state.nodes.filter(n => n.type === 'pointer').map(n => n.value));
  return POINTER_NAMES.find(p => !used.has(p)) || 'ptr';
}

function makeNode(type, x, y, extra = {}) {
  const n = { id: uid(), type, x, y, color: 'default' };
  if (type === 'circle') n.value = nextValue();
  if (type === 'array') {
    n.value = 'arr'; n.cells = ['3', '1', '4', '1', '5']; n.cellColors = [];
    n.x = x - (n.cells.length * CELL) / 2; n.y = y - CELL_H / 2;
  }
  if (type === 'set') { n.value = 'Set'; n.w = 260; n.h = 170; n.x = x - 130; n.y = y - 85; }
  if (type === 'pointer') n.value = nextPointerName();
  if (type === 'null') n.value = 'null';
  if (type === 'text') n.value = 'note';
  if (type === 'box') n.value = 'key: value';
  Object.assign(n, extra);
  state.nodes.push(n);
  return n;
}

function addLinkRaw(from, fromCell, to, toCell, style, label) {
  fromCell = fromCell ?? null; toCell = toCell ?? null;
  if (state.links.some(l => l.from === from && l.to === to && l.fromCell === fromCell && l.toCell === toCell)) return null;
  const l = { id: uid(), from, fromCell, to, toCell, style };
  if (label) l.label = label;
  state.links.push(l);
  return l;
}

function addLink(from, fromCell, to, toCell) {
  const src = byId(from);
  if (src && src.type === 'pointer') {
    // a pointer points at exactly one thing
    if (to === from) return;
    state.links = state.links.filter(l => l.from !== from);
    addLinkRaw(from, null, to, toCell, 'next');
    return;
  }
  if (linkStyle === 'both') {
    addLinkRaw(from, fromCell, to, toCell, 'next');
    addLinkRaw(to, toCell, from, fromCell, 'prev');
  } else {
    addLinkRaw(from, fromCell, to, toCell, linkStyle);
  }
}

function deleteSelection() {
  if (!sel.size && !selLinks.size) return;
  state.nodes = state.nodes.filter(n => !sel.has(n.id));
  state.links = state.links.filter(l => !selLinks.has(l.id) && !sel.has(l.from) && !sel.has(l.to));
  sel.clear(); selLinks.clear(); selCell = null;
  commit();
}

function duplicateSelection() {
  if (!sel.size) return;
  const map = new Map();
  const ids = [...sel];
  sel = new Set();
  for (const id of ids) {
    const c = JSON.parse(JSON.stringify(byId(id)));
    c.id = uid(); c.x += 30; c.y += 30;
    state.nodes.push(c); map.set(id, c.id); sel.add(c.id);
  }
  const copies = state.links.filter(l => map.has(l.from) && map.has(l.to));
  for (const l of copies) state.links.push({ ...l, id: uid(), from: map.get(l.from), to: map.get(l.to) });
  selLinks.clear(); selCell = null;
  commit();
}

function applyColor(c) {
  const one = sel.size === 1 ? byId([...sel][0]) : null;
  if (one && one.type === 'array' && selCell && selCell.id === one.id) {
    one.cellColors = one.cellColors || [];
    one.cellColors[selCell.idx] = c;
  } else {
    sel.forEach(id => { const n = byId(id); if (n) n.color = c; });
  }
  commit();
}

function reverseLinks() {
  selLinks.forEach(id => {
    const l = linkById(id);
    if (l) [l.from, l.to, l.fromCell, l.toCell] = [l.to, l.from, l.toCell, l.fromCell];
  });
  commit();
}

// ---------- pointers ----------
const pointerLink = ptr => state.links.find(l => l.from === ptr.id);

// node / array cell under a world point (ignores pointers, notes and sets)
function targetAt(p, excludeId) {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const n = state.nodes[i];
    if (n.id === excludeId || n.type === 'set' || n.type === 'text' || n.type === 'pointer') continue;
    const s = shape(n);
    if (s.kind === 'circle') {
      if (Math.hypot(p.x - s.cx, p.y - s.cy) <= s.r + 8) return { id: n.id, cell: null };
    } else if (p.x >= s.x - 6 && p.x <= s.x + s.w + 6 && p.y >= s.y - 6 && p.y <= s.y + s.h + 6) {
      const cell = n.type === 'array' ? cellAt(n, p) : null;
      return { id: n.id, cell };
    }
  }
  return null;
}

// where following next (dir = 1) or prev (dir = -1) from the pointer's target leads
function pointerStep(ptr, dir) {
  const cur = pointerLink(ptr);
  if (!cur) return null;
  const tn = byId(cur.to);
  if (!tn) return null;
  if (tn.type === 'array' && cur.toCell != null) {
    const c = cur.toCell + dir;
    return c >= 0 && c < tn.cells.length ? { id: tn.id, cell: c } : null;
  }
  const notPtr = id => { const n = byId(id); return n && n.type !== 'pointer'; };
  const want = dir > 0 ? 'next' : 'prev';
  const l = state.links.find(l => l.from === tn.id && l.style === want && notPtr(l.to));
  if (l) return { id: l.to, cell: l.toCell };
  if (dir < 0) {
    // singly linked: walk the next link backwards
    const back = state.links.find(l => l.to === tn.id && l.style === 'next' && notPtr(l.from));
    if (back) return { id: back.from, cell: back.fromCell };
  }
  return null;
}

// every way a pointer can move from what it points at: array neighbours, labelled
// links (.left / .right / .next / .prev) and graph edges in either direction
function pointerMoves(ptr) {
  const cur = pointerLink(ptr);
  if (!cur) return [];
  const tn = byId(cur.to);
  if (!tn) return [];
  const name = ptr.value;
  if (tn.type === 'array' && cur.toCell != null) {
    const out = [];
    if (cur.toCell + 1 < tn.cells.length) out.push({ code: `${name}++`, key: '→', t: { id: tn.id, cell: cur.toCell + 1 } });
    if (cur.toCell > 0) out.push({ code: `${name}--`, key: '←', t: { id: tn.id, cell: cur.toCell - 1 } });
    return out;
  }
  const notPtr = id => { const n = byId(id); return n && n.type !== 'pointer'; };
  const out = [], seen = new Set();
  for (const l of state.links) {
    let t = null, prop = null;
    if (l.from === tn.id && notPtr(l.to)) {
      t = { id: l.to, cell: l.toCell };
      prop = l.style === 'edge' ? null : (l.label || l.style);
    } else if (l.style === 'edge' && l.to === tn.id && notPtr(l.from)) {
      t = { id: l.from, cell: l.fromCell };
    } else continue;
    const key = t.id + ':' + t.cell;
    if (seen.has(key)) continue;
    seen.add(key);
    const tv = byId(t.id).value;
    out.push({
      code: prop ? `${name} = ${name}.${prop}` : `${name} = ${tv}`,
      key: prop === 'next' ? '→' : prop === 'prev' ? '←' : '', t
    });
  }
  if (!out.some(m => m.key === '←')) {
    const back = pointerStep(ptr, -1);
    if (back) out.push({ code: `${name} = previous node`, key: '←', t: back });
  }
  return out;
}

function placePointer(ptr, t) {
  const n = byId(t.id), s = endShape(t.id, t.cell);
  if (!n || !s) return;
  // left of vertical arrays, below horizontal ones, above everything else;
  // step further out if another pointer is already there
  const side = n.type === 'array' ? (n.vertical ? 'left' : 'below') : 'above';
  const me = shape({ ...ptr, x: 0, y: 0 });
  const others = state.nodes.filter(o => o.type === 'pointer' && o !== ptr);
  for (let k = 0; k < 12; k++) {
    let x = s.cx, y;
    if (side === 'left') { x = s.x - me.w / 2 - 34 - k * (me.w + 8); y = s.cy; }
    else if (side === 'below') y = s.y + s.h + 60 + k * 40;
    else y = (s.kind === 'circle' ? s.cy - s.r : s.y) - 55 - k * 40;
    const blocked = others.some(o => {
      const os = shape(o);
      return Math.abs(os.cx - x) < (os.w + me.w) / 2 + 4 && Math.abs(os.cy - y) < 32;
    });
    if (!blocked || k === 11) { ptr.x = x; ptr.y = y; return; }
  }
}

function pointTo(ptr, t) {
  state.links = state.links.filter(l => l.from !== ptr.id);
  placePointer(ptr, t);
  addLinkRaw(ptr.id, null, t.id, t.cell ?? null, 'next');
}

function stepPointers(dir) {
  const ptrs = [...sel].map(byId).filter(n => n && n.type === 'pointer');
  if (!ptrs.length) return false;
  let moved = 0;
  for (const p of ptrs) {
    const t = pointerStep(p, dir);
    if (t) { pointTo(p, t); moved++; }
  }
  if (moved) commit(); else toast(dir > 0 ? 'No next node' : 'No previous node');
  return true;
}

// ---------- pointer menu ----------
const ptrMenu = $('#ptrMenu');
let menuFor = null, menuMoves = [];

function openPtrMenu(id) {
  menuFor = id;
  renderPtrMenu();
}
function closePtrMenu() { menuFor = null; ptrMenu.hidden = true; }

function renderPtrMenu() {
  const p = menuFor != null ? byId(menuFor) : null;
  if (!p || !sel.has(p.id) || drag || editing) { ptrMenu.hidden = true; if (!p || !sel.has(menuFor)) menuFor = null; return; }
  const h = p.type === 'pointer' ? pointerMenuHtml(p) : nodeMenuHtml(p);
  if (ptrMenu.innerHTML !== h) ptrMenu.innerHTML = h;
  ptrMenu.hidden = false;
  const s = shape(p);
  const c = toScreen(s.cx, s.y + s.h);
  const sr = stage.getBoundingClientRect();
  const mw = ptrMenu.offsetWidth, mh = ptrMenu.offsetHeight;
  let left = clamp(c.x - mw / 2, 8, sr.width - mw - 8);
  let top = c.y + 12;
  if (top + mh > sr.height - 8) top = toScreen(s.cx, s.y).y - mh - 12;
  ptrMenu.style.left = left + 'px';
  ptrMenu.style.top = Math.max(8, top) + 'px';
}

function pointerMenuHtml(p) {
  const name = esc(p.value);
  const cur = pointerLink(p);
  menuMoves = pointerMoves(p);
  const moves = menuMoves.length
    ? menuMoves.map((m, i) => `<button class="btn" data-pm="move" data-i="${i}"><code>${esc(m.code)}</code><span class="k">${m.key}</span></button>`).join('')
    : `<button class="btn" disabled><span>${cur ? 'Nowhere to move from here' : 'Not pointing at anything'}</span></button>`;
  return moves +
    `<button class="btn" data-pm="pick"><span>Point to…</span><span class="k">click a node</span></button>` +
    (cur ? `<button class="btn" data-pm="unlink"><code>${name} = null</code><span class="k"></span></button>` : '') +
    `<hr><button class="btn" data-pm="rename"><span>Rename</span><span class="k">Enter</span></button>` +
    `<button class="btn" data-pm="delete"><span>Delete</span><span class="k">Del</span></button>`;
}

// any other node: nudge arrows, colour, edit, duplicate, delete
function nodeMenuHtml(n) {
  const arrow = (dx, dy, ch, t) => `<button class="btn" data-pm="nudge" data-dx="${dx}" data-dy="${dy}" title="Move ${t} (arrow key, Shift = fine)">${ch}</button>`;
  const cellSel = n.type === 'array' && selCell && selCell.id === n.id;
  return `<div class="nudge">${arrow(-1, 0, '←', 'left')}${arrow(0, -1, '↑', 'up')}${arrow(0, 1, '↓', 'down')}${arrow(1, 0, '→', 'right')}` +
    `<span class="k">or drag it</span></div>` +
    `<div class="swatches">${COLORS.map((c, i) => `<button class="sw c-${c}" data-pm="color" data-color="${c}" title="${c} (${i + 1})"></button>`).join('')}</div>` +
    `<hr><button class="btn" data-pm="rename"><span>${cellSel ? 'Edit cell' : 'Edit'}</span><span class="k">Enter</span></button>` +
    `<button class="btn" data-pm="dup"><span>Duplicate</span><span class="k">Ctrl+D</span></button>` +
    `<button class="btn" data-pm="delete"><span>Delete</span><span class="k">Del</span></button>`;
}

ptrMenu.addEventListener('pointerdown', e => e.stopPropagation());
ptrMenu.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const p = byId(menuFor);
  if (!p) return closePtrMenu();
  switch (b.dataset.pm) {
    case 'move': {
      const m = menuMoves[+b.dataset.i];
      if (m) { pointTo(p, m.t); commit(); }
      break;
    }
    case 'pick':
      closePtrMenu();
      pending = { from: p.id, fromCell: null, pick: true };
      render();
      break;
    case 'unlink':
      state.links = state.links.filter(l => l.from !== p.id);
      commit();
      break;
    case 'nudge': {
      const step = e.shiftKey ? 2 : 20;
      p.x += +b.dataset.dx * step; p.y += +b.dataset.dy * step;
      commit();
      break;
    }
    case 'color': applyColor(b.dataset.color); break;
    case 'dup': closePtrMenu(); duplicateSelection(); break;
    case 'rename': closePtrMenu(); startEdit(p.id, selCell && selCell.id === p.id ? selCell.idx : null); break;
    case 'delete': closePtrMenu(); deleteSelection(); break;
  }
});

const nextStyle = s => LINK_STYLES[(LINK_STYLES.indexOf(s) + 1) % LINK_STYLES.length];

function toggleLinkStyle() {
  selLinks.forEach(id => { const l = linkById(id); if (l) l.style = nextStyle(l.style); });
  commit();
}

function labelLinks() {
  const links = [...selLinks].map(linkById).filter(Boolean);
  if (!links.length) return;
  const v = prompt('Arrow label (e.g. left, right, next) — empty to remove:', links[0].label || '');
  if (v == null) return;
  links.forEach(l => { if (v.trim()) l.label = v.trim(); else delete l.label; });
  commit();
}

function arrayInsert(n, idx, v = '') {
  n.cells.splice(idx, 0, v);
  if (n.cellColors) n.cellColors.splice(idx, 0, null);
  for (const l of state.links) {
    if (l.to === n.id && l.toCell != null && l.toCell >= idx) l.toCell++;
    if (l.from === n.id && l.fromCell != null && l.fromCell >= idx) l.fromCell++;
  }
}
function arrayRemove(n, idx) {
  if (!n.cells.length) return;
  n.cells.splice(idx, 1);
  if (n.cellColors) n.cellColors.splice(idx, 1);
  state.links = state.links.filter(l => !((l.to === n.id && l.toCell === idx) || (l.from === n.id && l.fromCell === idx)));
  for (const l of state.links) {
    if (l.to === n.id && l.toCell != null && l.toCell > idx) l.toCell--;
    if (l.from === n.id && l.fromCell != null && l.fromCell > idx) l.fromCell--;
  }
}
function selectedArray() {
  if (sel.size !== 1) return null;
  const n = byId([...sel][0]);
  return n && n.type === 'array' ? n : null;
}
function arrayAddCell() {
  const n = selectedArray(); if (!n) return;
  const at = selCell && selCell.id === n.id ? selCell.idx + 1 : n.cells.length;
  arrayInsert(n, at, '');
  selCell = { id: n.id, idx: at };
  commit();
  startEdit(n.id, at);
}
function arrayRemoveCell() {
  const n = selectedArray(); if (!n || !n.cells.length) return;
  const at = selCell && selCell.id === n.id ? selCell.idx : n.cells.length - 1;
  arrayRemove(n, at);
  selCell = n.cells.length ? { id: n.id, idx: Math.min(at, n.cells.length - 1) } : null;
  commit();
}
function arraySetValues() {
  const n = selectedArray(); if (!n) return;
  const input = prompt('Array values (comma separated):', n.cells.join(', '));
  if (input == null) return;
  const vals = parseValues(input);
  while (n.cells.length > vals.length) arrayRemove(n, n.cells.length - 1);
  vals.forEach((v, i) => { if (i < n.cells.length) n.cells[i] = v; else arrayInsert(n, i, v); });
  selCell = null;
  commit();
}

function parseValues(str) {
  return String(str).replace(/[\[\]{}()]/g, ' ').split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

// ---------- history & persistence ----------
function commit() {
  hist = hist.slice(0, hIdx + 1);
  hist.push(JSON.stringify(state));
  if (hist.length > 300) hist.shift();
  hIdx = hist.length - 1;
  persist();
  render();
}
function restore(i) {
  hIdx = i;
  state = JSON.parse(hist[hIdx]);
  const ids = new Set(state.nodes.map(n => n.id)), lids = new Set(state.links.map(l => l.id));
  sel = new Set([...sel].filter(id => ids.has(id)));
  selLinks = new Set([...selLinks].filter(id => lids.has(id)));
  if (selCell && !ids.has(selCell.id)) selCell = null;
  pending = null;
  persist(); render();
}
const undo = () => { if (hIdx > 0) restore(hIdx - 1); };
const redo = () => { if (hIdx < hist.length - 1) restore(hIdx + 1); };

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ state, view })); } catch (_) { /* storage unavailable */ }
}
function validBoard(s) {
  return s && Array.isArray(s.nodes) && Array.isArray(s.links) && typeof s.nextId === 'number';
}
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!validBoard(data.state)) return false;
    state = data.state;
    if (data.view && typeof data.view.k === 'number') view = data.view;
    return true;
  } catch (_) { return false; }
}

