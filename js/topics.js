'use strict';
// Course topics: explanation + one or more "build" buttons that draw the structure on the board.
// Topic order follows the course: Big O → Classes & Pointers → Linked Lists → … → Tree Traversal.

// ---------- build helpers ----------

// point just below everything already on the board, so new structures never overlap old ones
function buildOrigin(gapY = 150) {
  const c = viewCenter();
  if (state.nodes.length) {
    const boxes = state.nodes.map(bbox);
    c.x = (Math.min(...boxes.map(b => b[0])) + Math.max(...boxes.map(b => b[2]))) / 2;
    c.y = Math.max(...boxes.map(b => b[3])) + gapY;
  }
  return c;
}

// pan (keeping zoom) so the given nodes are centred on screen
function focusOn(nodes) {
  if (!nodes.length) return;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) {
    const b = bbox(n);
    x1 = Math.min(x1, b[0]); y1 = Math.min(y1, b[1]); x2 = Math.max(x2, b[2]); y2 = Math.max(y2, b[3]);
  }
  const r = svg.getBoundingClientRect();
  // centre in the visible area left of the topics panel
  const panel = $('#panel');
  const w = r.width - (panel.hidden || window.innerWidth < 720 ? 0 : panel.offsetWidth + 24);
  const k = clamp(Math.min(view.k, (w - 100) / (x2 - x1 || 1), (r.height - 120) / (y2 - y1 || 1)), 0.35, view.k);
  view = { k, x: w / 2 - (x1 + x2) / 2 * k, y: r.height / 2 - (y1 + y2) / 2 * k };
  render(); persist();
}

const circle = (v, x, y, extra = {}) => makeNode('circle', x, y, { value: String(v), ...extra });
const note = (text, x, y) => makeNode('text', x, y, { value: text });
const box = (text, x, y, extra = {}) => makeNode('box', x, y, { value: text, ...extra });

function pointer(name, target, cell = null, extra = {}) {
  const p = makeNode('pointer', 0, 0, { value: name, ...extra });
  pointTo(p, { id: target.id, cell });
  return p;
}

// array whose top edge is at y, horizontally centred on cx
function array(vals, cx, y, opts = {}) {
  const n = makeNode('array', 0, 0, {
    value: opts.name ?? 'arr', cells: vals.map(String), cellColors: opts.colors || [], vertical: !!opts.vertical
  });
  const s = shape(n);
  n.x = opts.left ?? cx - s.w / 2;
  n.y = y;
  return n;
}

const link = (a, b, style = 'next', label, aCell = null, bCell = null) =>
  addLinkRaw(a.id, aCell, b.id, bCell, style, label);

// numbers when every value is numeric (so 10 > 9), otherwise plain strings
function sortable(vals) {
  return vals.every(v => v !== '' && !isNaN(Number(v))) ? vals.map(Number) : vals.slice();
}

// ---------- structure builders ----------

function buildLinkedList(vals, c, ptrs, doubly) {
  const out = [];
  const gap = 110, x0 = c.x - (vals.length - 1) * gap / 2;
  const nodes = vals.map((v, i) => circle(v, x0 + i * gap, c.y, doubly ? { color: 'blue' } : {}));
  out.push(...nodes);
  for (let i = 0; i < nodes.length - 1; i++) {
    link(nodes[i], nodes[i + 1], 'next');
    if (doubly) link(nodes[i + 1], nodes[i], 'prev');
  }
  if (ptrs && nodes.length) {
    const last = nodes[nodes.length - 1];
    out.push(pointer('head', nodes[0]), pointer('tail', last));
    const end = makeNode('null', last.x + gap, c.y);
    link(last, end, 'next');
    out.push(end);
    if (doubly) {
      const start = makeNode('null', x0 - gap, c.y);
      link(nodes[0], start, 'prev');
      out.push(start);
    }
    out.push(note(`length = ${nodes.length}`, c.x, c.y + 70));
  }
  return out;
}

function buildCycleList(vals, c) {
  const n = vals.length;
  const rad = Math.max(90, n * 110 / (2 * Math.PI));
  const nodes = vals.map((v, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return circle(v, c.x + rad * Math.cos(a), c.y + rad + rad * Math.sin(a));
  });
  for (let i = 0; i < n; i++) link(nodes[i], nodes[(i + 1) % n], 'next');
  return [...nodes, pointer('slow', nodes[0], null, { color: 'green' }), pointer('fast', nodes[0], null, { color: 'red' })];
}

function buildStackList(vals, c, ptrs) {
  // values are pushed in order, so the last value is on top
  const items = vals.slice().reverse();
  const nodes = items.map((v, i) => circle(v, c.x, c.y + 40 + i * 95));
  for (let i = 0; i < nodes.length - 1; i++) link(nodes[i], nodes[i + 1], 'next');
  const out = [...nodes];
  if (ptrs && nodes.length) {
    out.push(pointer('top', nodes[0]));
    const end = makeNode('null', c.x, nodes[nodes.length - 1].y + 95);
    link(nodes[nodes.length - 1], end, 'next');
    out.push(end, note(`length = ${nodes.length}\npush / pop at top`, c.x + 150, c.y + 40));
  }
  return out;
}

function buildStackArray(vals, c, ptrs) {
  const arr = array(vals, c.x, c.y, { name: 'stack' });
  const out = [arr];
  if (ptrs && vals.length) out.push(pointer('top', arr, vals.length - 1));
  out.push(note('push() / pop() at the end → O(1)', c.x, c.y + 150));
  return out;
}

function buildQueue(vals, c, ptrs) {
  const gap = 110, x0 = c.x - (vals.length - 1) * gap / 2;
  const nodes = vals.map((v, i) => circle(v, x0 + i * gap, c.y));
  for (let i = 0; i < nodes.length - 1; i++) link(nodes[i], nodes[i + 1], 'next');
  const out = [...nodes];
  if (ptrs && nodes.length) {
    const last = nodes[nodes.length - 1];
    out.push(pointer('first', nodes[0], null, { color: 'green' }), pointer('last', last, null, { color: 'red' }));
    const end = makeNode('null', last.x + gap, c.y);
    link(last, end, 'next');
    out.push(end, note(`length = ${nodes.length}\ndequeue ← first · last → enqueue`, c.x, c.y + 75));
  }
  return out;
}

// inserts values into a BST and lays it out: x = in-order position, y = depth
function buildBST(vals, c, opts = {}) {
  const keys = sortable(vals);
  let root = null;
  const all = [];
  for (const v of keys) {
    const t = { v, left: null, right: null, depth: 0 };
    if (!root) { root = t; all.push(t); continue; }
    let cur = root, dup = false;
    for (;;) {
      if (v === cur.v) { dup = true; break; }
      const side = v < cur.v ? 'left' : 'right';
      if (!cur[side]) { t.depth = cur.depth + 1; cur[side] = t; break; }
      cur = cur[side];
    }
    if (!dup) all.push(t);
  }
  if (!root) return { out: [], bottom: c.y };
  const order = [];
  (function inorder(t) { if (!t) return; inorder(t.left); order.push(t); inorder(t.right); })(root);
  const gap = 64;
  order.forEach((t, i) => { t.x = c.x + (i - (order.length - 1) / 2) * gap; });
  const maxDepth = Math.max(...all.map(t => t.depth));
  for (const t of all) t.node = circle(t.v, t.x, c.y + 40 + t.depth * 95);
  for (const t of all) {
    if (t.left) link(t.node, t.left.node, 'next', 'left');
    if (t.right) link(t.node, t.right.node, 'next', 'right');
  }
  const out = all.map(t => t.node);
  if (opts.ptrs !== false) out.push(pointer('root', root.node));
  return { out, root, bottom: c.y + 40 + maxDepth * 95, width: order.length * gap };
}

function traversals(root) {
  const bfs = [], pre = [], post = [], inord = [];
  const q = [root];
  while (q.length) { const t = q.shift(); bfs.push(t.v); if (t.left) q.push(t.left); if (t.right) q.push(t.right); }
  (function walk(t) {
    if (!t) return;
    pre.push(t.v); walk(t.left); inord.push(t.v); walk(t.right); post.push(t.v);
  })(root);
  return { bfs, pre, post, inord };
}

// the course's hash function: (hash + charCode * 23) % size
function courseHash(key, size) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * 23) % size;
  return hash;
}

function buildHashTable(vals, c, size = 7) {
  const pairs = vals.map((t, i) => {
    const [k, v] = t.split(':');
    return { k: k.trim(), v: (v ?? String((i + 1) * 10)).trim() };
  });
  const top = c.y;
  const map = array(Array(size).fill(''), 0, top, { name: 'dataMap', vertical: true, left: c.x - 260 });
  const out = [map];
  const buckets = Array.from({ length: size }, () => []);
  const hashLines = [];
  for (const p of pairs) {
    const h = courseHash(p.k, size);
    buckets[h].push(p);
    hashLines.push(`hash('${p.k}') = ${h}`);
  }
  const ms = shape(map);
  buckets.forEach((items, i) => {
    let x = ms.x + ms.w + 70, prev = null;
    const y = cellRect(map, i).cy;
    for (const p of items) {
      const b = box(`${p.k}: ${p.v}`, 0, y, { color: 'purple' });
      const w = shape(b).w;
      b.x = x + w / 2;
      x += w + 50;
      if (prev) link(prev, b, 'next'); else link(map, b, 'next', null, i);
      prev = b;
      out.push(b);
    }
  });
  out.push(note(hashLines.join('\n') || 'no keys', ms.x - 150, top + ms.h / 2));
  return out;
}

function buildGraph(vals, c) {
  const verts = [], edges = [];
  const addV = v => { if (v && !verts.includes(v)) verts.push(v); };
  for (const t of vals) {
    const parts = t.split(/-+>?|>/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) { addV(parts[0]); addV(parts[1]); edges.push([parts[0], parts[1]]); }
    else addV(parts[0]);
  }
  const n = verts.length;
  const rad = Math.max(100, n * 95 / (2 * Math.PI));
  const nodes = {};
  verts.forEach((v, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    nodes[v] = circle(v, c.x + rad * Math.cos(a), c.y + rad + 40 + rad * Math.sin(a), { color: 'green' });
  });
  const adj = Object.fromEntries(verts.map(v => [v, []]));
  for (const [a, b] of edges) {
    if (a === b || adj[a].includes(b)) continue;
    adj[a].push(b); adj[b].push(a);
    link(nodes[a], nodes[b], 'edge');
  }
  const text = 'adjacencyList = {\n' + verts.map(v => `  ${v}: [${adj[v].join(', ')}]`).join('\n') + '\n}';
  const lst = note(text, c.x + rad + 190, c.y + rad + 40);
  return [...Object.values(nodes), lst];
}

function buildFactorial(vals, c) {
  const n = clamp(parseInt(vals[0], 10) || 4, 1, 8);
  const out = [];
  let prev = null;
  // first call at the bottom, the base case on top (the call stack grows upward)
  for (let k = n, i = 0; k >= 1; k--, i++) {
    const text = k === 1 ? 'factorial(1)\nreturn 1   ← base case' : `factorial(${k})\nreturn ${k} * factorial(${k - 1})`;
    const b = box(text, c.x, c.y + 40 + (n - 1 - i) * 100, k === 1 ? { color: 'green' } : {});
    if (prev) link(prev, b, 'next', 'calls');
    prev = b;
    out.push(b);
  }
  let acc = 1;
  const unwind = [];
  for (let k = 1; k <= n; k++) { acc *= k; unwind.push(k === 1 ? 'factorial(1) = 1' : `factorial(${k}) = ${k} * ${acc / k} = ${acc}`); }
  out.push(note('Call stack — top is running now', c.x, c.y - 10));
  out.push(note('Unwinding (pops top → bottom):\n' + unwind.join('\n'), c.x + 330, c.y + 40 + (n - 1) * 50));
  return out;
}

// ---------- sorting ----------

// draws one array per step, top to bottom
function buildSteps(steps, c) {
  return steps.map((s, i) => array(s.cells, c.x, c.y + i * 92, { name: s.label, colors: s.colors || [] }));
}
const paint = (len, fn) => Array.from({ length: len }, (_, i) => fn(i) || null);

function bubbleSteps(vals) {
  const a = sortable(vals), steps = [{ label: 'start', cells: a.slice() }];
  for (let i = a.length - 1; i > 0; i--) {
    for (let j = 0; j < i; j++) if (a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
    steps.push({ label: `after pass i = ${i} (largest bubbled to ${i})`, cells: a.slice(), colors: paint(a.length, k => k >= i && 'green') });
  }
  return steps;
}

function selectionSteps(vals) {
  const a = sortable(vals), steps = [{ label: 'start', cells: a.slice() }];
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    for (let j = i + 1; j < a.length; j++) if (a[j] < a[min]) min = j;
    const swapped = min !== i;
    if (swapped) [a[i], a[min]] = [a[min], a[i]];
    steps.push({
      label: `i = ${i}: min at index ${min}${swapped ? ` → swap ${i} ↔ ${min}` : ' → no swap'}`,
      cells: a.slice(), colors: paint(a.length, k => (swapped && k === min) ? 'yellow' : k <= i && 'green')
    });
  }
  return steps;
}

function insertionSteps(vals) {
  const a = sortable(vals), steps = [{ label: 'start', cells: a.slice() }];
  for (let i = 1; i < a.length; i++) {
    const temp = a[i];
    let j = i - 1;
    for (; j > -1 && a[j] > temp; j--) a[j + 1] = a[j];
    a[j + 1] = temp;
    steps.push({
      label: `i = ${i}: temp = ${temp} inserted at ${j + 1}`,
      cells: a.slice(), colors: paint(a.length, k => k === j + 1 ? 'yellow' : k <= i && 'green')
    });
  }
  return steps;
}

function quickSteps(vals) {
  const a = sortable(vals), steps = [{ label: 'start', cells: a.slice() }];
  const placed = new Set();
  const pivot = (lo, hi) => {
    let swapIndex = lo;
    for (let i = lo + 1; i <= hi; i++) if (a[i] < a[lo]) { swapIndex++; [a[swapIndex], a[i]] = [a[i], a[swapIndex]]; }
    [a[lo], a[swapIndex]] = [a[swapIndex], a[lo]];
    return swapIndex;
  };
  (function qs(lo, hi) {
    if (lo > hi) return;
    if (lo === hi) { placed.add(lo); return; }
    const p = pivot(lo, hi);
    placed.add(p);
    steps.push({
      label: `pivot(${lo}, ${hi}) → pivot lands at ${p}`,
      cells: a.slice(), colors: paint(a.length, k => k === p ? 'yellow' : placed.has(k) ? 'green' : (k < lo || k > hi) && 'gray')
    });
    qs(lo, p - 1); qs(p + 1, hi);
  })(0, a.length - 1);
  steps.push({ label: 'sorted', cells: a.slice(), colors: paint(a.length, () => 'green') });
  return steps;
}

// split tree going down, then the merges coming back together below it
function buildMergeTree(vals, c) {
  const a = sortable(vals), n = a.length;
  if (!n) return [];
  const cw = Math.max(CELL, Math.ceil(Math.max(...a.map(v => textW(v))) + 16));
  const slot = cw + 16, rowH = 95;
  const x0 = c.x - (n * slot) / 2;
  const depthOf = (len) => len <= 1 ? 0 : 1 + depthOf(Math.ceil(len / 2));
  const D = depthOf(n);
  const out = [];
  const place = (cells, lo, hi, row, colors) => {
    const node = array(cells, 0, c.y + row * rowH, { name: '', colors });
    node.x = x0 + lo * slot + ((hi - lo) * slot - 16 - (hi - lo) * cw) / 2;
    out.push(node);
    return node;
  };
  // returns the node holding the sorted result of a[lo, hi)
  (function sort(lo, hi, depth, parent) {
    const part = a.slice(lo, hi);
    const split = place(part, lo, hi, depth);
    if (depth === 0) split.value = 'split ↓';
    if (parent) link(parent, split, 'next');
    if (hi - lo <= 1) return split;
    const mid = lo + Math.ceil((hi - lo) / 2);
    const left = sort(lo, mid, depth + 1, split);
    const right = sort(mid, hi, depth + 1, split);
    const merged = place(part.slice().sort((x, y) => (x > y) - (x < y)), lo, hi, 2 * D - depth,
      paint(hi - lo, () => 'green'));
    if (depth === 0) merged.value = 'merged ✓';
    link(left, merged, 'next'); link(right, merged, 'next');
    return merged;
  })(0, n, 0, null);
  return out;
}

function buildMergePractice(vals, c) {
  const a = sortable(vals).sort((x, y) => (x > y) - (x < y));
  const arr1 = a.filter((_, i) => i % 2 === 0), arr2 = a.filter((_, i) => i % 2 === 1);
  const A = array(arr1, c.x - 160, c.y, { name: 'array1' });
  const B = array(arr2, c.x + 160, c.y, { name: 'array2' });
  const C = array(Array(a.length).fill(''), c.x, c.y + 190, { name: 'combined' });
  return [A, B, C, pointer('i', A, 0, { color: 'green' }), pointer('j', B, 0, { color: 'red' }),
    note('merge(): compare array1[i] and array2[j], push the smaller into combined, move that pointer.\nWhen one runs out, copy the rest of the other.', c.x, c.y + 290)];
}

// ---------- topics ----------
const TOPICS = [
  {
    id: 'bigo', group: 'Basics', title: 'Big O',
    values: '1, 2, 3, 4, 5',
    summary: 'Big O describes how the work (time) or memory (space) of your code grows as the input size <b>n</b> grows. We usually talk about the worst case.',
    ops: [['Access by index', 'O(1)'], ['Loop over n items', 'O(n)'], ['Loop inside a loop', 'O(n²)'], ['Halve the problem each step', 'O(log n)'], ['Divide and merge (merge sort)', 'O(n log n)']],
    board: ['Build the nested-loop demo and move <code>j</code> all the way right for every step of <code>i</code>: that is n × n steps.', 'Rules: drop constants (O(2n) → O(n)), drop non-dominant terms (O(n² + n) → O(n²)), different inputs get different letters (O(a + b), O(a · b)).'],
    practice: ['Is a loop, then another loop O(n) or O(n²)?', 'What is the Big O of binary search?'],
    builds: [
      { label: 'Cheat sheet note', fn: (_, c) => [note(
        'Big O cheat sheet (worst case)\n' +
        'O(1)        constant    array[i], push/pop, hash get/set\n' +
        'O(log n)    logarithmic binary search, balanced BST\n' +
        'O(n)        linear      one loop over the input\n' +
        'O(n log n)  n log n     merge sort, quick sort (average)\n' +
        'O(n²)       quadratic   nested loops, bubble / selection / insertion\n\n' +
        'Drop constants:      O(2n)     → O(n)\n' +
        'Drop non-dominant:   O(n² + n) → O(n²)\n' +
        'Different inputs:    O(a + b), O(a * b)', c.x, c.y + 80)] },
      { label: 'Nested-loop demo (O(n²))', fn: (v, c) => {
        const arr = array(v, c.x, c.y, { name: 'arr' });
        return [arr, pointer('i', arr, 0, { color: 'green' }), pointer('j', arr, 0, { color: 'red' }),
          note('for i … for j …  →  n × n steps = O(n²)', c.x, c.y + 170)];
      } }
    ]
  },
  {
    id: 'classes', group: 'Basics', title: 'Classes & Pointers',
    values: '11',
    summary: 'A class is a blueprint (<code>constructor</code> + methods) for creating objects. Variables that hold objects hold a <b>reference</b> (a pointer), not a copy. Two variables can point at the same object.',
    ops: [['new Node(value)', 'creates an object'], ['obj2 = obj1', 'copies the pointer, not the object'], ['obj1.value = 22', 'visible through obj2 too']],
    board: ['Build the demo, then change the box value: both <code>obj1</code> and <code>obj2</code> still point at it.', 'Drag <code>obj2</code> onto a new box to see that re-pointing one variable does not move the other.'],
    practice: ['Why does changing obj2.value also change obj1.value?', 'Write a Node class with value and next.'],
    builds: [
      { label: 'Two pointers, one object', fn: (v, c) => {
        const b = box(`{ value: ${v[0] ?? 11} }`, c.x, c.y + 110, { color: 'yellow' });
        return [b, pointer('obj1', b), pointer('obj2', b),
          note('let obj1 = { value: 11 }\nlet obj2 = obj1        // same object!\nobj1.value = 22        // obj2.value is 22 too', c.x + 260, c.y + 110)];
      } },
      { label: 'Node class', fn: (v, c) => {
        const b = box(`Node\nvalue: ${v[0] ?? 4}\nnext: null`, c.x, c.y + 60, { color: 'blue' });
        return [b, note('class Node {\n  constructor(value) {\n    this.value = value\n    this.next = null\n  }\n}', c.x + 250, c.y + 60)];
      } }
    ]
  },
  {
    id: 'll', group: 'Data structures', title: 'Linked List',
    values: '11, 3, 23, 7, 4',
    summary: 'A chain of nodes. Each node has a <code>value</code> and a <code>next</code> pointer; the list keeps <code>head</code>, <code>tail</code> and <code>length</code>. No indexes: to reach a node you walk from head.',
    ops: [['push (add to end)', 'O(1)'], ['pop (remove end)', 'O(n)'], ['unshift (add to start)', 'O(1)'], ['shift (remove start)', 'O(1)'], ['get / set by index', 'O(n)'], ['insert / remove at index', 'O(n)'], ['reverse', 'O(n)']],
    board: ['Click <code>head</code> and use <code>head = head.next</code> to walk the list.', 'To reverse: add <code>prev</code>, <code>temp</code>, <code>next</code> pointers and flip each arrow by dragging its arrowhead, one node at a time.', 'Cycle build: step <code>slow</code> once and <code>fast</code> twice until they meet (Floyd\'s algorithm).'],
    practice: ['Find Middle Node (slow / fast)', 'Has Loop', 'Find K-th Node From End', 'Reverse Linked List', 'Remove Duplicates', 'Partition List', 'Reverse Between (m, n)', 'Binary to Decimal'],
    builds: [
      { label: 'Linked list', fn: (v, c, p) => buildLinkedList(v, c, p, false) },
      { label: 'List with a cycle (slow / fast)', fn: (v, c) => buildCycleList(v, c) }
    ]
  },
  {
    id: 'dll', group: 'Data structures', title: 'Doubly Linked List',
    values: '1, 2, 3, 4',
    summary: 'Like a linked list, but every node also has a <code>prev</code> pointer, so you can walk both ways. Removing the last node becomes O(1), and <code>get(index)</code> can start from whichever end is closer.',
    ops: [['push / pop', 'O(1)'], ['unshift / shift', 'O(1)'], ['get / set by index', 'O(n) (from the nearer end)'], ['insert / remove at index', 'O(n)']],
    board: ['Every change must fix <b>both</b> arrows: drag the <code>next</code> and the dashed <code>prev</code> arrowheads.', 'Use <code>curr = curr.prev</code> in the pointer menu to walk backwards.'],
    practice: ['Swap First and Last', 'Reverse', 'Palindrome Checker', 'Swap Nodes in Pairs'],
    builds: [{ label: 'Doubly linked list', fn: (v, c, p) => buildLinkedList(v, c, p, true) }]
  },
  {
    id: 'stack', group: 'Data structures', title: 'Stack',
    values: '1, 2, 3',
    summary: '<b>LIFO</b>, last in, first out, like a stack of plates. The course builds it as a linked list where <code>top</code> is the head: push and pop both happen at the top. With an array, use the end instead.',
    ops: [['push', 'O(1)'], ['pop', 'O(1)'], ['peek (top)', 'O(1)'], ['search', 'O(n)']],
    board: ['push: add a node, point it at the old top, then drag <code>top</code> onto it.', 'pop: move <code>top</code> down with <code>top = top.next</code>, then delete the old node.'],
    practice: ['Reverse a String', 'Balanced Parentheses', 'Sort Stack'],
    builds: [
      { label: 'Stack (linked list)', fn: (v, c, p) => buildStackList(v, c, p) },
      { label: 'Stack (array)', fn: (v, c, p) => buildStackArray(v, c, p) }
    ]
  },
  {
    id: 'queue', group: 'Data structures', title: 'Queue',
    values: '1, 2, 3',
    summary: '<b>FIFO</b>, first in, first out, like a line at a shop. The course uses a linked list with <code>first</code> and <code>last</code>: enqueue at <code>last</code>, dequeue from <code>first</code>, both O(1).',
    ops: [['enqueue (add to last)', 'O(1)'], ['dequeue (remove first)', 'O(1)'], ['peek', 'O(1)']],
    board: ['enqueue: link the old last to a new node, then drag <code>last</code> onto it.', 'dequeue: <code>first = first.next</code>, then delete the old node.'],
    practice: ['Queue using two Stacks'],
    builds: [{ label: 'Queue (linked list)', fn: (v, c, p) => buildQueue(v, c, p) }]
  },
  {
    id: 'bst', group: 'Data structures', title: 'Binary Search Tree',
    values: '47, 21, 76, 18, 27, 52, 82',
    summary: 'A tree where every node has at most two children. For each node, smaller values go <code>left</code> and bigger values go <code>right</code>, so each comparison throws away half the tree.',
    ops: [['insert', 'O(log n)'], ['contains', 'O(log n)'], ['minValueNode (go left)', 'O(log n)'], ['remove', 'O(log n)'], ['any of these, unbalanced tree', 'O(n)']],
    board: ['Click <code>root</code> and use <code>root = root.left</code> / <code>.right</code> to search for a value.', 'Try values in sorted order (1,2,3,4) to see why an unbalanced tree becomes O(n).'],
    practice: ['contains(value)', 'minValueNode', 'Insert then remove a leaf / a node with two children', 'Is it a valid BST?'],
    builds: [{ label: 'Binary search tree', fn: (v, c) => buildBST(v, c).out }]
  },
  {
    id: 'hash', group: 'Data structures', title: 'Hash Table',
    values: 'nails:1000, tile:50, lumber:80, bolts:1400, screws:140',
    summary: 'Stores <b>key → value</b> pairs. A hash function turns the key into an index of <code>dataMap</code>. Two keys with the same index is a <b>collision</b>: the course keeps both in that bucket (separate chaining). Values format: <code>key:value</code>.',
    ops: [['set(key, value)', 'O(1)'], ['get(key)', 'O(1) average'], ['keys()', 'O(n)']],
    board: ['The note shows each key\'s hash using the course function <code>(hash + charCode × 23) % 7</code>. Collisions chain to the right.', 'To get(key): hash it, go to that bucket, walk the chain until the key matches.'],
    practice: ['Item in Common (two arrays)', 'Find Duplicates', 'First Non-Repeating Character', 'Group Anagrams', 'Two Sum', 'Subarray Sum'],
    builds: [{ label: 'Hash table (size 7)', fn: (v, c) => buildHashTable(v, c, 7) }]
  },
  {
    id: 'graph', group: 'Data structures', title: 'Graph',
    values: 'A-B, A-C, A-D, B-D, C-D',
    summary: 'Vertices (nodes) joined by edges. The course uses an undirected graph stored as an <b>adjacency list</b>: <code>{ A: [B, C], … }</code>. Values format: <code>A-B</code> for an edge, or just <code>E</code> for a lone vertex.',
    ops: [['addVertex', 'O(1)'], ['addEdge', 'O(1)'], ['removeEdge', 'O(E)'], ['removeVertex', 'O(V + E)']],
    board: ['Undirected edges have no arrowhead. Pick <b>Edge</b> under "New links" to draw more.', 'Put a pointer on a vertex: its menu lists every neighbour you can move to.'],
    practice: ['addVertex / addEdge', 'removeEdge', 'removeVertex (remove its edges first)'],
    builds: [{ label: 'Undirected graph', fn: (v, c) => buildGraph(v, c) }]
  },
  {
    id: 'recursion', group: 'Algorithms', title: 'Recursion',
    values: '4',
    summary: 'A function that calls itself on a smaller problem until it reaches a <b>base case</b>. Every call waits on the <b>call stack</b> until the call above it returns.',
    ops: [['factorial(n)', 'O(n) calls'], ['call stack depth', 'O(n) memory']],
    board: ['Values: the n for factorial(n).', 'Read the stack bottom-up for the calls, then top-down for the returns.'],
    practice: ['factorial(n)', 'What happens without a base case? (stack overflow)'],
    builds: [{ label: 'Call stack: factorial(n)', fn: (v, c) => buildFactorial(v, c) }]
  },
  {
    id: 'bubble', group: 'Algorithms', title: 'Bubble Sort',
    values: '4, 2, 6, 5, 1, 3',
    summary: 'Compare each pair of neighbours and swap them if they are out of order. After each pass the largest remaining value has "bubbled" to the end.',
    ops: [['time', 'O(n²)'], ['already sorted (with early exit)', 'O(n)'], ['space', 'O(1)']],
    board: ['Practice: <code>j</code> compares arr[j] with arr[j + 1]; press → to move it. Swap values by editing cells.', 'Show passes: green cells are finished.'],
    practice: ['Implement bubbleSort(array)'],
    builds: [
      { label: 'Practice', fn: (v, c) => { const a = array(v, c.x, c.y); return [a, pointer('j', a, 0, { color: 'green' }), pointer('i', a, v.length - 1, { color: 'red' })]; } },
      { label: 'Show every pass', fn: (v, c) => buildSteps(bubbleSteps(v), c) }
    ]
  },
  {
    id: 'selection', group: 'Algorithms', title: 'Selection Sort',
    values: '4, 2, 6, 5, 1, 3',
    summary: 'For each position <code>i</code>, find the index of the smallest value in the rest of the array (<code>min</code>) and swap it into place.',
    ops: [['time', 'O(n²)'], ['space', 'O(1)'], ['swaps', 'at most n − 1']],
    board: ['Practice: move <code>j</code> right; whenever arr[j] &lt; arr[min], drag <code>min</code> onto j\'s cell.', 'Show steps: yellow is the swapped value, green is sorted.'],
    practice: ['Implement selectionSort(array)'],
    builds: [
      { label: 'Practice', fn: (v, c) => { const a = array(v, c.x, c.y); return [a, pointer('i', a, 0, { color: 'green' }), pointer('min', a, 0, { color: 'yellow' }), pointer('j', a, Math.min(1, v.length - 1), { color: 'red' })]; } },
      { label: 'Show every step', fn: (v, c) => buildSteps(selectionSteps(v), c) }
    ]
  },
  {
    id: 'insertion', group: 'Algorithms', title: 'Insertion Sort',
    values: '4, 2, 6, 5, 1, 3',
    summary: 'Grow a sorted part on the left. Take the next value (<code>temp</code>), shift bigger values one step right, and drop <code>temp</code> into the gap.',
    ops: [['time', 'O(n²)'], ['nearly sorted input', 'O(n)'], ['space', 'O(1)']],
    board: ['Practice: edit the <code>temp</code> box, shift values by editing cells, move <code>j</code> left with ←.', 'Show steps: yellow is where temp landed.'],
    practice: ['Implement insertionSort(array)'],
    builds: [
      { label: 'Practice', fn: (v, c) => {
        const a = array(v, c.x, c.y);
        return [a, pointer('i', a, Math.min(1, v.length - 1), { color: 'green' }), pointer('j', a, 0, { color: 'red' }),
          box(`temp = ${v[1] ?? ''}`, c.x, c.y - 80, { color: 'yellow' })];
      } },
      { label: 'Show every step', fn: (v, c) => buildSteps(insertionSteps(v), c) }
    ]
  },
  {
    id: 'merge', group: 'Algorithms', title: 'Merge Sort',
    values: '3, 1, 4, 2, 7, 5, 8, 6',
    summary: 'Divide and conquer: split the array in half until the pieces have one item (already sorted), then <code>merge()</code> pairs of sorted pieces back together.',
    ops: [['time (always)', 'O(n log n)'], ['space', 'O(n)'], ['merge(two sorted arrays)', 'O(n)']],
    board: ['Merge practice: two sorted arrays with <code>i</code> and <code>j</code>. Fill <code>combined</code> by always taking the smaller one.', 'Split & merge tree: log n levels of splitting, then log n levels of merging.'],
    practice: ['Implement merge(array1, array2)', 'Implement mergeSort(array)'],
    builds: [
      { label: 'Merge practice', fn: (v, c) => buildMergePractice(v, c) },
      { label: 'Split & merge tree', fn: (v, c) => buildMergeTree(v, c) }
    ]
  },
  {
    id: 'quick', group: 'Algorithms', title: 'Quick Sort',
    values: '4, 6, 1, 7, 3, 2, 5',
    summary: 'Pick a pivot (the course uses the first item). <code>pivot()</code> moves everything smaller than it to its left and returns where the pivot lands. Then quick sort the left and right parts.',
    ops: [['average', 'O(n log n)'], ['worst (already sorted)', 'O(n²)'], ['space', 'O(log n)']],
    board: ['Practice: move <code>i</code> right. When arr[i] &lt; pivot, do <code>swapIndex++</code> and swap arr[i] ↔ arr[swapIndex]. At the end, swap pivot ↔ swapIndex.', 'Show steps: yellow is the pivot\'s final spot, gray is outside the current range.'],
    practice: ['Implement pivot(array, pivotIndex, endIndex)', 'Implement quickSort(array, left, right)'],
    builds: [
      { label: 'Pivot practice', fn: (v, c) => { const a = array(v, c.x, c.y); return [a, pointer('pivot', a, 0, { color: 'yellow' }), pointer('swapIndex', a, 0, { color: 'green' }), pointer('i', a, Math.min(1, v.length - 1), { color: 'red' })]; } },
      { label: 'Show every pivot', fn: (v, c) => buildSteps(quickSteps(v), c) }
    ]
  },
  {
    id: 'traversal', group: 'Algorithms', title: 'Tree Traversal',
    values: '47, 21, 76, 18, 27, 52, 82',
    summary: '<b>BFS</b> (breadth first) visits the tree level by level using a queue. <b>DFS</b> goes deep first: <b>PreOrder</b> (node, left, right), <b>InOrder</b> (left, node, right: sorted for a BST), <b>PostOrder</b> (left, right, node).',
    ops: [['BFS', 'O(n) time, queue up to O(width)'], ['DFS (any order)', 'O(n) time, O(height) stack']],
    board: ['BFS practice: dequeue the first cell into <code>results</code>, then enqueue its left and right children (add cells).', 'Colour each node green as you visit it, to track where you are.'],
    practice: ['BFS()', 'DFSPreOrder()', 'DFSPostOrder()', 'DFSInOrder()'],
    builds: [
      { label: 'BFS practice', fn: (v, c) => {
        const t = buildBST(v, c);
        if (!t.root) return [];
        const q = array([t.root.v], c.x - 120, t.bottom + 110, { name: 'queue' });
        const r = array([], c.x + 120, t.bottom + 110, { name: 'results' });
        return [...t.out, q, r, pointer('currentNode', t.root.node, null, { color: 'green' })];
      } },
      { label: 'Show all orders', fn: (v, c) => {
        const t = buildBST(v, c);
        if (!t.root) return [];
        const o = traversals(t.root);
        const rows = [['BFS', o.bfs], ['DFS PreOrder', o.pre], ['DFS InOrder', o.inord], ['DFS PostOrder', o.post]];
        return [...t.out, ...rows.map(([name, vals], i) => array(vals, c.x, t.bottom + 110 + i * 85, { name }))];
      } }
    ]
  },
  {
    id: 'array', group: 'Extras', title: 'Array (two pointers)',
    values: '2, 7, 11, 15',
    summary: 'A row of cells with indexes. Great for two-pointer and sliding-window problems.',
    ops: [['access arr[i]', 'O(1)'], ['push / pop (end)', 'O(1)'], ['shift / unshift (start)', 'O(n)'], ['search', 'O(n)']],
    board: ['Click <code>i</code> or <code>j</code> and use <code>i++</code> / <code>i--</code>, or press → / ←.'],
    practice: ['Two Sum (sorted)', 'Remove Element', 'Max Subarray', 'Rotate Array'],
    builds: [{ label: 'Array', fn: (v, c, p) => {
      const cells = v.length ? v : ['', '', ''];
      const a = array(cells, c.x, c.y, { name: 'nums' });
      const out = [a];
      if (p) { out.push(pointer('i', a, 0, { color: 'green' })); if (cells.length > 1) out.push(pointer('j', a, cells.length - 1, { color: 'red' })); }
      return out;
    } }]
  },
  {
    id: 'set', group: 'Extras', title: 'Set',
    values: '1, 2, 2, 3',
    summary: 'A collection of unique values. Duplicates are dropped, and lookups are O(1) on average (it is a hash table under the hood).',
    ops: [['add', 'O(1)'], ['has', 'O(1)'], ['delete', 'O(1)']],
    board: ['Drag circles in or out of the set box. Moving the box moves everything inside it.'],
    practice: ['Remove Duplicates', 'Has Unique Chars', 'Find Pairs', 'Longest Consecutive Sequence'],
    builds: [{ label: 'Set', fn: (v, c) => {
      const unique = [...new Set(v)];
      const cols = Math.max(1, Math.ceil(Math.sqrt(unique.length * 1.6))), rows = Math.max(1, Math.ceil(unique.length / cols));
      const sp = 80, w = Math.max(200, cols * sp + 60), h = Math.max(140, rows * sp + 70);
      const s = makeNode('set', c.x, c.y, { x: c.x - w / 2, y: c.y, w, h, value: 'Set' });
      if (unique.length < v.length) toast('Duplicates removed: it\'s a set');
      return [s, ...unique.map((val, i) => circle(val, s.x + 30 + sp / 2 + (i % cols) * sp, s.y + 35 + sp / 2 + Math.floor(i / cols) * sp, { color: 'purple' }))];
    } }]
  }
];

// ---------- topic panel ----------
const TOPIC_KEY = 'jsolver.topic';
const topicSel = $('#topic'), topicInfo = $('#topicInfo'), topicBuilds = $('#topicBuilds'), qbValues = $('#qbValues');
const typedValues = {};
let topic = TOPICS[2];

function renderTopicSelect() {
  const groups = [...new Set(TOPICS.map(t => t.group))];
  topicSel.innerHTML = groups.map(g => `<optgroup label="${g}">` +
    TOPICS.filter(t => t.group === g).map(t => `<option value="${t.id}">${t.title}</option>`).join('') + '</optgroup>').join('');
}

function showTopic(id) {
  topic = TOPICS.find(t => t.id === id) || TOPICS[2];
  topicSel.value = topic.id;
  qbValues.value = typedValues[topic.id] ?? topic.values;
  topicInfo.innerHTML =
    `<p>${topic.summary}</p>` +
    `<table class="ops">${topic.ops.map(([op, o]) => `<tr><td>${op}</td><td><code>${o}</code></td></tr>`).join('')}</table>` +
    `<h4>On the board</h4><ul>${topic.board.map(b => `<li>${b}</li>`).join('')}</ul>` +
    `<h4>Practice</h4><ul class="practice">${topic.practice.map(p => `<li>${p}</li>`).join('')}</ul>`;
  topicInfo.scrollTop = 0;
  topicBuilds.innerHTML = topic.builds.map((b, i) => `<button class="${i ? 'secondary' : 'primary'}" data-build="${i}">${b.label}</button>`).join('');
  try { localStorage.setItem(TOPIC_KEY, topic.id); } catch (_) { /* ignore */ }
}

function runBuild(i) {
  const b = topic.builds[i];
  if (!b) return;
  const vals = parseValues(qbValues.value);
  const needsValues = !['bigo', 'classes', 'array', 'set', 'recursion'].includes(topic.id);
  if (needsValues && !vals.length) { toast('Enter some values first'); return; }
  const created = b.fn(vals, buildOrigin(), $('#qbPtrs').checked) || [];
  sel = new Set(created.map(n => n.id)); selLinks.clear(); selCell = null;
  commit();
  focusOn(created);
}

renderTopicSelect();
topicSel.addEventListener('change', () => showTopic(topicSel.value));
qbValues.addEventListener('input', () => { typedValues[topic.id] = qbValues.value; });
qbValues.addEventListener('keydown', e => { if (e.key === 'Enter') runBuild(0); });
topicBuilds.addEventListener('click', e => {
  const b = e.target.closest('[data-build]');
  if (b) runBuild(+b.dataset.build);
});
{
  let saved = null;
  try { saved = localStorage.getItem(TOPIC_KEY); } catch (_) { /* ignore */ }
  showTopic(saved || 'll');
}
