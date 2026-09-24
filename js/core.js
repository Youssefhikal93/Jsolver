'use strict';
// Shared constants, state, geometry and coordinate helpers.
// All js/ files are classic scripts that share one global scope, loaded in order by index.html.

// ---------- constants ----------
const R = 28, CELL = 46, CELL_H = 46, GRID = 12;
const COLORS = ['default', 'green', 'yellow', 'red', 'blue', 'purple', 'gray'];
const POINTER_NAMES = ['head', 'tail', 'curr', 'prev', 'next', 'slow', 'fast', 'dummy', 'i', 'j', 'left', 'right', 'p', 'q'];
const LINK_STYLES = ['next', 'prev', 'edge'];
const STORE_KEY = 'jsolver.board.v1';
const THEME_KEY = 'jsolver.theme';

// ---------- dom ----------
const $ = s => document.querySelector(s);
const svg = $('#svg'), world = $('#world'), content = $('#content'), overlay = $('#overlay');
const stage = $('#stage'), editor = $('#editor'), selbar = $('#selbar'), hint = $('#hint');

// ---------- state ----------
let state = { nodes: [], links: [], nextId: 1 };
let view = { x: 0, y: 0, k: 1 };
let tool = 'select', linkStyle = 'next', snap = false;
let sel = new Set(), selLinks = new Set(), selCell = null;
let drag = null, pending = null, editing = null;
let hist = [], hIdx = -1;
let mouseWorld = null;
let lastTap = { t: 0, x: 0, y: 0, key: '' };

const uid = () => state.nextId++;
const byId = id => state.nodes.find(n => n.id === id);
const linkById = id => state.links.find(l => l.id === id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const measureCtx = document.createElement('canvas').getContext('2d');
function textW(t, size = 15, weight = 700) {
  measureCtx.font = `${weight} ${size}px ui-monospace, Menlo, Consolas, monospace`;
  return measureCtx.measureText(String(t ?? '')).width;
}

// ---------- geometry ----------
const rect = (x, y, w, h) => ({ kind: 'rect', x, y, w, h, cx: x + w / 2, cy: y + h / 2 });

function cellW(n) {
  let m = 0;
  for (const v of n.cells) m = Math.max(m, textW(v));
  return Math.max(CELL, Math.ceil(m + 16));
}

// arrays are horizontal by default; `vertical: true` stacks the cells top to bottom
function cellRect(n, i) {
  const cw = cellW(n);
  return n.vertical ? rect(n.x, n.y + i * CELL_H, cw, CELL_H) : rect(n.x + i * cw, n.y, cw, CELL_H);
}

function cellAt(n, p) {
  if (!n.cells.length) return null;
  const i = n.vertical ? Math.floor((p.y - n.y) / CELL_H) : Math.floor((p.x - n.x) / cellW(n));
  return clamp(i, 0, n.cells.length - 1);
}

const lines = v => String(v ?? '').split('\n');

function shape(n) {
  switch (n.type) {
    case 'circle': {
      const r = Math.max(R, textW(n.value) / 2 + 12);
      return { kind: 'circle', cx: n.x, cy: n.y, r };
    }
    case 'array': {
      const cw = cellW(n), len = Math.max(1, n.cells.length);
      return n.vertical ? rect(n.x, n.y, cw, len * CELL_H) : rect(n.x, n.y, len * cw, CELL_H);
    }
    case 'set': return rect(n.x, n.y, n.w, n.h);
    case 'pointer': {
      const w = Math.max(54, textW(n.value, 14) + 28);
      return rect(n.x - w / 2, n.y - 16, w, 32);
    }
    case 'null': {
      const w = Math.max(44, textW(n.value, 13) + 22);
      return rect(n.x - w / 2, n.y - 13, w, 26);
    }
    case 'box': {
      const ls = lines(n.value);
      const w = Math.max(70, ...ls.map(l => textW(l, 14, 600))) + 26;
      const h = ls.length * 18 + 18;
      return rect(n.x - w / 2, n.y - h / 2, w, h);
    }
    case 'text': {
      const ls = lines(n.value);
      const w = Math.max(24, ...ls.map(l => textW(l, 14, 500))) + 14;
      const h = ls.length * 18 + 10;
      return rect(n.x - w / 2, n.y - h / 2, w, h);
    }
  }
  return rect(n.x, n.y, 10, 10);
}

function endShape(id, cell) {
  const n = byId(id);
  if (!n) return null;
  if (n.type === 'array' && cell != null && cell < n.cells.length) return cellRect(n, cell);
  return shape(n);
}

function boundary(s, tx, ty) {
  const dx = tx - s.cx, dy = ty - s.cy, d = Math.hypot(dx, dy) || 1;
  if (s.kind === 'circle') return { x: s.cx + dx / d * s.r, y: s.cy + dy / d * s.r };
  const t = Math.min(dx ? (s.w / 2) / Math.abs(dx) : Infinity, dy ? (s.h / 2) / Math.abs(dy) : Infinity);
  if (!isFinite(t)) return { x: s.cx, y: s.cy };
  return { x: s.cx + dx * t, y: s.cy + dy * t };
}

function bbox(n) {
  const s = shape(n);
  if (s.kind === 'circle') return [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r];
  if (n.type === 'array') return n.vertical
    ? [s.x - 26, s.y - 24, s.x + s.w, s.y + s.h]
    : [s.x, s.y - 24, s.x + s.w, s.y + s.h + 20];
  return [s.x, s.y, s.x + s.w, s.y + s.h];
}

// path of a link plus its two end points (a = start, b = arrow tip) and a midpoint for its label
function linkPath(l) {
  const a = endShape(l.from, l.fromCell), b = endShape(l.to, l.toCell);
  if (!a || !b) return null;
  if (l.from === l.to && l.fromCell === l.toCell) {
    const top = a.kind === 'circle' ? a.cy - a.r : a.y;
    const x = a.cx;
    return {
      d: `M ${x - 10} ${top + 2} C ${x - 45} ${top - 60}, ${x + 45} ${top - 60}, ${x + 10} ${top + 2}`,
      a: { x: x - 10, y: top + 2 }, b: { x: x + 10, y: top + 2 }, m: { x, y: top - 45 }
    };
  }
  const hasReverse = l.style !== 'edge' && state.links.some(o => o !== l && o.from === l.to && o.to === l.from &&
    (o.fromCell ?? null) === (l.toCell ?? null) && (o.toCell ?? null) === (l.fromCell ?? null));
  const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy) || 1;
  const off = hasReverse ? 20 : 0;
  const mx = (a.cx + b.cx) / 2 + (-dy / d) * off, my = (a.cy + b.cy) / 2 + (dx / d) * off;
  const p1 = boundary(a, off ? mx : b.cx, off ? my : b.cy);
  const p2 = boundary(b, off ? mx : a.cx, off ? my : a.cy);
  if (!off) return { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, a: p1, b: p2, m: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  const qx = 2 * mx - (p1.x + p2.x) / 2, qy = 2 * my - (p1.y + p2.y) / 2;
  return {
    d: `M ${p1.x} ${p1.y} Q ${qx} ${qy} ${p2.x} ${p2.y}`, a: p1, b: p2,
    m: { x: 0.25 * p1.x + 0.5 * qx + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * qy + 0.25 * p2.y }
  };
}

// ---------- coordinates ----------
function toWorld(e) {
  const r = svg.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
}
function toScreen(x, y) { return { x: x * view.k + view.x, y: y * view.k + view.y }; }
function viewCenter() {
  const r = svg.getBoundingClientRect();
  return { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k };
}
