'use strict';

// ---------- pointer interaction ----------
function isDoubleTap(e, key) {
  const now = performance.now();
  const dbl = now - lastTap.t < 380 && lastTap.key === key &&
    Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 10;
  lastTap = dbl ? { t: 0, x: 0, y: 0, key: '' } : { t: now, x: e.clientX, y: e.clientY, key };
  return dbl;
}

function hitAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !svg.contains(el)) return null;
  const obj = el.closest('[data-id]');
  if (!obj) return null;
  const cell = el.closest('[data-cell]');
  return { id: +obj.dataset.id, cell: cell ? +cell.dataset.cell : null };
}

function nodesInside(setNode) {
  return state.nodes.filter(n => {
    if (n === setNode || n.type === 'set') return false;
    const s = shape(n);
    return s.cx >= setNode.x && s.cx <= setNode.x + setNode.w && s.cy >= setNode.y && s.cy <= setNode.y + setNode.h;
  });
}

svg.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  e.preventDefault();
  if (editing) finishEdit(true);
  // preventDefault keeps focus where it was; release panel inputs so Delete etc. reach the board
  const fe = document.activeElement;
  if (fe && fe !== document.body && fe.blur) fe.blur();
  closePtrMenu();
  const p = toWorld(e);
  const t = e.target;
  const portEl = t.closest('[data-port]');
  const resEl = t.closest('[data-resize]');
  const linkEl = t.closest('[data-link]');
  const objEl = t.closest('[data-id]');
  const cellEl = t.closest('[data-cell]');
  svg.setPointerCapture(e.pointerId);

  // resize a set
  if (resEl) {
    const n = byId(+resEl.dataset.resize);
    drag = { mode: 'resize', n, sx: p.x, sy: p.y, w0: n.w, h0: n.h, moved: false };
    return;
  }

  // start a link
  if (portEl || (objEl && (tool === 'connect' || pending))) {
    const id = +(portEl ? portEl.dataset.port : objEl.dataset.id);
    const cell = !portEl && cellEl ? +cellEl.dataset.cell : null;
    if (pending && !portEl) {
      const src = byId(pending.from);
      if (pending.pick && src && id !== src.id) pointTo(src, { id, cell });
      else addLink(pending.from, pending.fromCell, id, cell);
      pending = null;
      commit();
      return;
    }
    drag = { mode: 'link', from: id, fromCell: cell, sx: p.x, sy: p.y, cx: e.clientX, cy: e.clientY, hover: null };
    return;
  }

  // links
  if (linkEl) {
    const id = +linkEl.dataset.link;
    const l = linkById(id);
    if (!linkEl.dataset.lh && isDoubleTap(e, 'l' + id)) {
      if (l) { l.style = nextStyle(l.style); commit(); }
      return;
    }
    // grabbing a handle, or the last / first bit of the arrow, re-points that end
    let which = linkEl.dataset.lh || null;
    const lp = l && linkPath(l);
    if (!which && lp && !e.shiftKey) {
      const grab = 22 / Math.sqrt(view.k);
      if (Math.hypot(p.x - lp.b.x, p.y - lp.b.y) < grab) which = 'to';
      else if (Math.hypot(p.x - lp.a.x, p.y - lp.a.y) < grab) which = 'from';
    }
    if (!e.shiftKey || which) { sel.clear(); selLinks.clear(); selCell = null; }
    if (selLinks.has(id) && e.shiftKey) selLinks.delete(id); else selLinks.add(id);
    if (which && lp) {
      drag = { mode: 'relink', linkId: id, which, fixed: which === 'to' ? lp.a : lp.b,
               cx: e.clientX, cy: e.clientY, moved: false, hover: null };
      return render();
    }
    render();
    return;
  }

  // objects
  if (objEl) {
    const id = +objEl.dataset.id;
    const cell = cellEl ? +cellEl.dataset.cell : null;
    if (isDoubleTap(e, 'n' + id + ':' + cell)) {
      sel = new Set([id]);
      render();
      startEdit(id, cell);
      return;
    }
    selCell = cell != null ? { id, idx: cell } : (selCell && selCell.id === id ? selCell : null);
    if (e.shiftKey) {
      if (sel.has(id)) sel.delete(id); else sel.add(id);
    } else {
      if (!sel.has(id)) { sel.clear(); sel.add(id); }
      selLinks.clear();
    }
    const moving = new Set();
    for (const sid of sel) {
      const n = byId(sid);
      if (!n) continue;
      moving.add(n);
      if (n.type === 'set') nodesInside(n).forEach(m => moving.add(m));
    }
    drag = {
      mode: 'move', sx: p.x, sy: p.y, clicked: id, shift: e.shiftKey, moved: false,
      starts: [...moving].map(n => ({ n, x: n.x, y: n.y }))
    };
    render();
    return;
  }

  // empty canvas
  if (isDoubleTap(e, 'bg')) {
    const n = makeNode('circle', p.x, p.y);
    sel = new Set([n.id]); selLinks.clear(); selCell = null;
    commit();
    startEdit(n.id);
    return;
  }
  pending = null;
  if (e.shiftKey) {
    drag = { mode: 'box', sx: p.x, sy: p.y };
  } else {
    sel.clear(); selLinks.clear(); selCell = null;
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    svg.classList.add('panning');
  }
  render();
});

svg.addEventListener('pointermove', e => {
  const p = toWorld(e);
  mouseWorld = p;
  if (!drag) return;
  switch (drag.mode) {
    case 'move': {
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) * view.k < 3) return;
      drag.moved = true;
      for (const s of drag.starts) {
        let nx = s.x + dx, ny = s.y + dy;
        if (snap) { nx = Math.round(nx / GRID) * GRID; ny = Math.round(ny / GRID) * GRID; }
        s.n.x = nx; s.n.y = ny;
      }
      // dragging a single pointer: highlight the node it will snap onto
      if (drag.starts.length === 1 && drag.starts[0].n.type === 'pointer') {
        const t = targetAt(p, drag.starts[0].n.id);
        drag.hover = t ? t.id : null;
        drag.target = t;
      }
      render();
      break;
    }
    case 'pan':
      view.x = drag.vx + (e.clientX - drag.sx);
      view.y = drag.vy + (e.clientY - drag.sy);
      render();
      break;
    case 'resize': {
      drag.moved = true;
      drag.n.w = Math.max(100, drag.w0 + p.x - drag.sx);
      drag.n.h = Math.max(70, drag.h0 + p.y - drag.sy);
      render();
      break;
    }
    case 'box': {
      const x = Math.min(p.x, drag.sx), y = Math.min(p.y, drag.sy);
      overlay.innerHTML = `<rect class="marquee" x="${x}" y="${y}" width="${Math.abs(p.x - drag.sx)}" height="${Math.abs(p.y - drag.sy)}"/>`;
      drag.ex = p.x; drag.ey = p.y;
      break;
    }
    case 'relink': {
      // until it actually moves, a press is just a click that selects the link
      if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 5) return;
      const first = !drag.moved;
      drag.moved = true;
      const hit = hitAt(e.clientX, e.clientY);
      const hover = hit ? hit.id : null;
      if (hover !== drag.hover || first) { drag.hover = hover; render(); }
      const l = linkById(drag.linkId);
      const marker = l && l.style === 'prev' ? 'ah-prev' : 'ah-next';
      const [x1, y1, x2, y2] = drag.which === 'to'
        ? [drag.fixed.x, drag.fixed.y, p.x, p.y]
        : [p.x, p.y, drag.fixed.x, drag.fixed.y];
      overlay.innerHTML = `<line class="temp" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#${marker})"/>`;
      break;
    }
    case 'link': {
      const src = endShape(drag.from, drag.fromCell);
      const hit = hitAt(e.clientX, e.clientY);
      const hover = hit ? hit.id : null;
      if (hover !== drag.hover) { drag.hover = hover; render(); }
      if (src) {
        const b = boundary(src, p.x, p.y);
        overlay.innerHTML = `<line class="temp" x1="${b.x}" y1="${b.y}" x2="${p.x}" y2="${p.y}"/>`;
      }
      break;
    }
  }
});

function endDrag(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  overlay.innerHTML = '';
  svg.classList.remove('panning');
  switch (d.mode) {
    case 'move': {
      const clicked = byId(d.clicked);
      if (d.moved) {
        if (d.starts.length === 1 && clicked && clicked.type === 'pointer') {
          if (d.target) pointTo(clicked, d.target);
          else if (pointerLink(clicked)) {
            // dropped on empty canvas: the pointer is detached (= null)
            state.links = state.links.filter(l => l.from !== clicked.id);
            toast(`${clicked.value} = null`);
          }
        }
        commit();
      } else {
        if (!d.shift && sel.size > 1) sel = new Set([d.clicked]);
        if (!d.shift && clicked) openPtrMenu(clicked.id);
        render();
      }
      break;
    }
    case 'pan': persist(); break;
    case 'resize': if (d.moved) commit(); break;
    case 'box': {
      if (d.ex != null) {
        const x1 = Math.min(d.sx, d.ex), x2 = Math.max(d.sx, d.ex), y1 = Math.min(d.sy, d.ey), y2 = Math.max(d.sy, d.ey);
        for (const n of state.nodes) {
          const s = shape(n);
          if (s.cx >= x1 && s.cx <= x2 && s.cy >= y1 && s.cy <= y2) sel.add(n.id);
        }
        for (const l of state.links) if (sel.has(l.from) && sel.has(l.to)) selLinks.add(l.id);
      }
      render();
      break;
    }
    case 'relink': {
      const l = linkById(d.linkId);
      if (l && d.moved && e.type !== 'pointercancel') {
        const hit = hitAt(e.clientX, e.clientY);
        if (hit) {
          const n = byId(hit.id);
          const cell = n && n.type === 'array' ? hit.cell : null;
          if (d.which === 'to') { l.to = hit.id; l.toCell = cell; }
          else {
            l.from = hit.id; l.fromCell = cell;
            // a pointer can only point at one thing
            if (n && n.type === 'pointer') state.links = state.links.filter(o => o === l || o.from !== n.id);
          }
          commit();
          break;
        }
        toast('Drop the arrow end on a node to re-point it');
      }
      render();
      break;
    }
    case 'link': {
      if (e.type === 'pointercancel') { render(); break; }
      const p = toWorld(e);
      const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
      const hit = hitAt(e.clientX, e.clientY);
      if (hit) {
        const same = hit.id === d.from && (hit.cell ?? null) === (d.fromCell ?? null);
        if (same && dist < 12) {
          if (tool === 'connect') pending = { from: d.from, fromCell: d.fromCell };
          render();
        } else {
          addLink(d.from, d.fromCell, hit.id, hit.cell);
          commit();
        }
      } else if (dist > 30) {
        const src = byId(d.from);
        const n = makeNode('circle', p.x, p.y, src && src.type === 'circle' ? { color: src.color } : {});
        addLink(d.from, d.fromCell, n.id, null);
        sel = new Set([n.id]); selLinks.clear(); selCell = null;
        commit();
      } else {
        render();
      }
      break;
    }
  }
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('pointerleave', () => { if (!drag) mouseWorld = null; });
svg.addEventListener('contextmenu', e => e.preventDefault());

function zoomAt(sx, sy, factor) {
  const k2 = clamp(view.k * factor, 0.2, 3);
  const wx = (sx - view.x) / view.k, wy = (sy - view.y) / view.k;
  view.k = k2; view.x = sx - wx * k2; view.y = sy - wy * k2;
  render(); persist();
}
svg.addEventListener('wheel', e => {
  e.preventDefault();
  if (editing) finishEdit(true);
  const r = svg.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });

function zoomCenter(f) { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }

function fitView() {
  const r = svg.getBoundingClientRect();
  if (!state.nodes.length) { view = { x: r.width / 2, y: r.height / 2, k: 1 }; render(); persist(); return; }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of state.nodes) {
    const b = bbox(n);
    x1 = Math.min(x1, b[0]); y1 = Math.min(y1, b[1]); x2 = Math.max(x2, b[2]); y2 = Math.max(y2, b[3]);
  }
  const pad = 70;
  const k = clamp(Math.min((r.width - 2 * pad) / (x2 - x1 || 1), (r.height - 2 * pad) / (y2 - y1 || 1)), 0.2, 1.6);
  view = { k, x: r.width / 2 - (x1 + x2) / 2 * k, y: r.height / 2 - (y1 + y2) / 2 * k };
  render(); persist();
}

