'use strict';

// ---------- rendering ----------
// visible dot plus a larger invisible hit circle so the handle is easy to grab
const port = (x, y, id) => `<circle class="port-hit" data-port="${id}" cx="${x}" cy="${y}" r="14"/>` +
  `<circle class="port" cx="${x}" cy="${y}" r="7"/>`;

function drawNode(n) {
  const cls = ['obj', n.type, 'c-' + (n.color || 'default')];
  if (sel.has(n.id)) cls.push('sel');
  if (drag && drag.hover === n.id) cls.push('drop');
  if (pending && pending.from === n.id) cls.push('pending');
  const s = shape(n);
  let h = '';
  switch (n.type) {
    case 'circle':
      h = `<circle class="body" cx="${s.cx}" cy="${s.cy}" r="${s.r}"/>` +
          `<text class="val" x="${s.cx}" y="${s.cy}">${esc(n.value)}</text>` + port(s.cx + s.r, s.cy, n.id);
      break;
    case 'array': {
      h = `<text class="arr-label" x="${s.x}" y="${s.y - 10}">${esc(n.value)}</text>`;
      if (!n.cells.length) {
        h += `<rect class="cell" x="${s.x}" y="${s.y}" width="${CELL}" height="${CELL_H}" stroke-dasharray="4 3"/>` +
             `<text class="idx" x="${s.cx}" y="${s.cy + 4}">empty</text>`;
      }
      n.cells.forEach((v, i) => {
        const c = cellRect(n, i);
        const cc = (n.cellColors && n.cellColors[i]) || 'default';
        const sc = selCell && selCell.id === n.id && selCell.idx === i && sel.has(n.id) ? ' selcell' : '';
        const ix = n.vertical ? c.x - 12 : c.cx, iy = n.vertical ? c.cy + 4 : c.y + CELL_H + 15;
        h += `<rect class="cell c-${cc}${sc}" data-cell="${i}" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>` +
             `<text class="val" x="${c.cx}" y="${c.cy}">${esc(v)}</text>` +
             `<text class="idx" x="${ix}" y="${iy}">${i}</text>`;
      });
      h += `<rect class="outline" x="${s.x - 4}" y="${s.y - 4}" width="${s.w + 8}" height="${s.h + 8}" rx="5"/>` +
           port(s.x + s.w, s.cy, n.id);
      break;
    }
    case 'set': {
      const x2 = s.x + s.w, y2 = s.y + s.h;
      h = `<rect class="body" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="28"/>` +
          `<text class="set-label" x="${s.x + 18}" y="${s.y + 24}">${esc(n.value)}</text>` +
          `<path class="grip" d="M ${x2 - 16} ${y2 - 5} L ${x2 - 5} ${y2 - 16} M ${x2 - 10} ${y2 - 5} L ${x2 - 5} ${y2 - 10}"/>` +
          `<rect class="resize" data-resize="${n.id}" x="${x2 - 22}" y="${y2 - 22}" width="24" height="24"/>`;
      break;
    }
    case 'pointer':
    case 'null':
      h = (n.type === 'pointer' ? `<rect class="hitpad" x="${s.x - 8}" y="${s.y - 8}" width="${s.w + 16}" height="${s.h + 16}" rx="20"/>` : '') +
          `<rect class="body" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${n.type === 'pointer' ? 16 : 4}"/>` +
          `<text class="val" x="${s.cx}" y="${s.cy}">${esc(n.value)}</text>` +
          (n.type === 'pointer' ? port(s.x + s.w, s.cy, n.id) : '');
      break;
    case 'box': {
      const ls = lines(n.value);
      const y0 = s.cy - (ls.length - 1) * 9;
      h = `<rect class="body" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="8"/>` +
          ls.map((l, i) => `<text class="val box-val" x="${s.cx}" y="${y0 + i * 18}">${esc(l)}</text>`).join('') +
          port(s.x + s.w, s.cy, n.id);
      break;
    }
    case 'text': {
      const ls = lines(n.value);
      h = `<rect class="body" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4"/>` +
          `<text class="note" x="${s.x + 7}" y="${s.y + 19}">` +
          ls.map((l, i) => `<tspan x="${s.x + 7}" dy="${i ? 18 : 0}">${esc(l) || ' '}</tspan>`).join('') + `</text>`;
      break;
    }
  }
  return `<g class="${cls.join(' ')}" data-id="${n.id}">${h}</g>`;
}

// handles on both ends of a selected link: drag one onto another node to re-point that end
function drawLinkHandles(l) {
  const lp = linkPath(l);
  if (!lp) return '';
  return ['from', 'to'].map(w => {
    const pt = w === 'to' ? lp.b : lp.a;
    return `<circle class="lhandle" data-link="${l.id}" data-lh="${w}" cx="${pt.x}" cy="${pt.y}" r="7"/>`;
  }).join('');
}

function drawLink(l) {
  if (drag && drag.mode === 'relink' && drag.moved && drag.linkId === l.id) return '';
  const lp = linkPath(l);
  if (!lp) return '';
  const d = lp.d;
  const isSel = selLinks.has(l.id);
  // graph edges are undirected: no arrowhead
  const marker = l.style === 'edge' ? ''
    : ` marker-end="url(#${isSel ? 'ah-sel' : (l.style === 'prev' ? 'ah-prev' : 'ah-next')})"`;
  const label = l.label ? `<text class="llabel" x="${lp.m.x}" y="${lp.m.y}">${esc(l.label)}</text>` : '';
  return `<g class="link ${l.style}${isSel ? ' sel' : ''}" data-link="${l.id}">` +
         `<path class="hit" d="${d}"/><path class="line" d="${d}"${marker}/>${label}</g>`;
}

let lastSelBar = '';
function render() {
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  const g = 24 * view.k;
  stage.style.backgroundSize = `${g}px ${g}px`;
  stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
  $('#zoomLabel').textContent = Math.round(view.k * 100) + '%';

  let h = '';
  for (const n of state.nodes) if (n.type === 'set') h += drawNode(n);
  for (const l of state.links) h += drawLink(l);
  for (const n of state.nodes) if (n.type !== 'set') h += drawNode(n);
  if (!drag || drag.mode !== 'relink' || !drag.moved) {
    for (const l of state.links) if (selLinks.has(l.id)) h += drawLinkHandles(l);
  }
  content.innerHTML = h;

  $('#undo').disabled = hIdx <= 0;
  $('#redo').disabled = hIdx >= hist.length - 1;
  renderPtrMenu();
  updateSelBar();
  updateHint();
}

function updateSelBar() {
  const nodes = [...sel].map(byId).filter(Boolean);
  const links = [...selLinks].map(linkById).filter(Boolean);
  let h = '';
  // the click menu already has these actions; don't show them twice
  const menuOpen = !ptrMenu.hidden && nodes.length === 1 && !links.length;
  if (!menuOpen && (nodes.length || links.length)) {
    if (nodes.length) {
      h += COLORS.map((c, i) => `<button class="sw c-${c}" data-color="${c}" title="${c} (${i + 1})"></button>`).join('');
      h += '<span class="sep"></span>';
      if (nodes.length === 1) h += '<button class="btn" data-act="edit" title="Edit (Enter)">Edit</button>';
      if (nodes.length === 1 && nodes[0].type === 'array') {
        h += '<button class="btn" data-act="addcell" title="Insert cell (])">+ cell</button>' +
             '<button class="btn" data-act="rmcell" title="Remove cell ([)">− cell</button>' +
             '<button class="btn" data-act="values" title="Set all values">Values…</button>';
      }
      h += '<button class="btn" data-act="dup" title="Duplicate (Ctrl+D)">Duplicate</button>';
    }
    if (links.length) {
      h += '<button class="btn" data-act="reverse" title="Reverse direction (R)">⇆ Reverse</button>' +
           '<button class="btn" data-act="style" title="Cycle next / prev / edge">Style</button>' +
           '<button class="btn" data-act="label" title="Name the arrow, e.g. left / right">Label…</button>';
    }
    h += '<button class="btn" data-act="delete" title="Delete (Del)">🗑 Delete</button>';
  }
  if (h !== lastSelBar) { selbar.innerHTML = h; lastSelBar = h; }
  selbar.hidden = !h;
}

function updateHint() {
  if (pending && pending.pick) hint.textContent = `Click the node or array cell "${byId(pending.from)?.value ?? ''}" should point to · Esc to cancel`;
  else if (pending) hint.textContent = 'Now click the target node · Esc to cancel';
  else if (tool === 'connect') hint.textContent = 'Link mode: drag node → node, or click source then target · drop on empty space to create a linked node';
  else hint.textContent = 'Double-click to add/edit · drag the ● handle to link · Shift+drag to box-select · wheel to zoom · ? for help';
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- editing ----------
function startEdit(id, cell = null) {
  const n = byId(id);
  if (!n) return;
  const isCell = n.type === 'array' && cell != null && cell < n.cells.length;
  const s = isCell ? endShape(id, cell) : shape(n);
  const current = isCell ? n.cells[cell] : n.value;
  editing = { id, cell: isCell ? cell : null };
  editor.value = current;
  const multi = n.type === 'text' || n.type === 'box';
  const w = Math.max(90, (s.kind === 'circle' ? s.r * 2 : s.w) * view.k + 20);
  const h = multi ? Math.max(34, s.h * view.k + 10) : 34;
  let c = toScreen(s.cx, s.cy);
  if (n.type === 'array' && !isCell) c = toScreen(s.x + 40, s.y - 14);
  if (n.type === 'set') c = toScreen(s.x + 60, s.y + 20);
  Object.assign(editor.style, {
    display: 'block', width: w + 'px', height: h + 'px',
    left: (c.x - w / 2) + 'px', top: (c.y - h / 2) + 'px',
    textAlign: multi ? 'left' : 'center'
  });
  setTimeout(() => { editor.focus(); editor.select(); }, 0);
}

function finishEdit(save) {
  if (!editing) return;
  const { id, cell } = editing;
  editing = null;
  editor.style.display = 'none';
  const n = byId(id);
  if (save && n) {
    const v = editor.value;
    const old = cell != null ? n.cells[cell] : n.value;
    if (v !== old) {
      if (cell != null) n.cells[cell] = v.trim();
      else n.value = n.type === 'text' || n.type === 'box' ? v : v.trim();
      commit();
      return;
    }
  }
  render();
}

editor.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
  else if (e.key === 'Enter' && !(e.shiftKey && editing && ['text', 'box'].includes(byId(editing.id)?.type))) {
    e.preventDefault(); finishEdit(true);
  } else if (e.key === 'Tab' && editing && editing.cell != null) {
    // Tab moves to the next cell while editing an array
    e.preventDefault();
    const { id, cell } = editing;
    finishEdit(true);
    const n = byId(id);
    const next = cell + (e.shiftKey ? -1 : 1);
    if (n && next >= 0 && next < n.cells.length) { selCell = { id, idx: next }; render(); startEdit(id, next); }
  }
});
editor.addEventListener('blur', () => finishEdit(true));

