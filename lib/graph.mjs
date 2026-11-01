// Graph renderers: layered layout via dagre, drawn as SVG. Box-shaped types live here; tables.mjs adds ERD and class.
import dagre from '@dagrejs/dagre';
import { bounds, esc, r, shape, svgDoc, textLines, textWidth, titleAbove, wrap } from './svg.mjs';

const GROUP_LABEL_H = 24;

// Smooth polyline through dagre's control points.
function edgePath(pts) {
  let d = `M${r(pts[0].x)},${r(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q${r(pts[i].x)},${r(pts[i].y)} ${r(mx)},${r(my)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${r(last.x)},${r(last.y)}`;
}

// Org-chart connector: leaves the parent, turns halfway between ranks, enters the child.
function elbowPath(s, t, lr) {
  if (lr) {
    const x0 = s.x + s.width / 2, x1 = t.x - t.width / 2, mx = (x0 + x1) / 2;
    return `M${r(x0)},${r(s.y)} H${r(mx)} V${r(t.y)} H${r(x1)}`;
  }
  const y0 = s.y + s.height / 2, y1 = t.y - t.height / 2, my = (y0 + y1) / 2;
  return `M${r(s.x)},${r(y0)} V${r(my)} H${r(t.x)} V${r(y1)}`;
}

/**
 * Lays out and draws a graph.
 * node(item) -> { width, height, kind, draw(cx, cy, w, h) -> svg, tooltip? }
 * edge(link) -> { cls, label?, start?, end?, reverse? }; start/end are marker ids, reverse lays the edge out to -> from.
 */
export function drawGraph(ir, { items, links, groups = [], rankdir, node, edge, ranksep = 72, nodesep = 44, elbow = false }) {
  // Draw only groups that (transitively) contain items; dagre mis-sizes empty clusters.
  const used = new Set();
  const parentOf = new Map(groups.map((g) => [g.id, g.parent]));
  for (const n of items) for (let g = n.group; g && !used.has(g); g = parentOf.get(g)) used.add(g);

  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: ir.meta.direction || rankdir, nodesep, ranksep, edgesep: 24, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const grp of groups) if (used.has(grp.id)) g.setNode(grp.id, {});
  for (const grp of groups) if (used.has(grp.id) && grp.parent) g.setParent(grp.id, grp.parent);

  const nodes = items.map((n) => ({ n, ...node(n) }));
  for (const x of nodes) {
    g.setNode(x.n.id, { width: x.width, height: x.height });
    if (x.n.group) g.setParent(x.n.id, x.n.group);
  }
  const edges = links.map((e, i) => ({ e, i, ...edge(e) }));
  for (const x of edges) {
    const label = x.label ? { width: textWidth(x.label, 11.5) + 14, height: 20, labelpos: 'c' } : {};
    if (x.reverse) g.setEdge(x.e.to, x.e.from, label, `e${x.i}`);
    else g.setEdge(x.e.from, x.e.to, label, `e${x.i}`);
  }
  dagre.layout(g);

  const b = bounds();
  const parts = [];
  // Groups: outermost first so children paint on top.
  const depth = (id) => { let d = 0; for (let p = parentOf.get(id); p; p = parentOf.get(p)) d++; return d; };
  for (const grp of groups.filter((x) => used.has(x.id)).sort((a, c) => depth(a.id) - depth(c.id))) {
    const c = g.node(grp.id);
    const x = c.x - c.width / 2, y = c.y - c.height / 2 - GROUP_LABEL_H;
    b.add(x, y, c.width, c.height + GROUP_LABEL_H);
    parts.push(`<g class="group" data-id="${esc(grp.id)}"><rect x="${r(x)}" y="${r(y)}" width="${r(c.width)}" height="${r(c.height + GROUP_LABEL_H)}" rx="10"/>`
      + `<text x="${r(x + 12)}" y="${r(y + 16)}">${esc(grp.label)}</text></g>`);
  }

  for (const x of edges) {
    const ed = x.reverse ? g.edge({ v: x.e.to, w: x.e.from, name: `e${x.i}` }) : g.edge({ v: x.e.from, w: x.e.to, name: `e${x.i}` });
    ed.points.forEach((p) => b.add(p.x, p.y));
    // Markers belong to the original ends; a reversed layout swaps which path end they sit on.
    const [ms, me] = x.reverse ? [x.end, x.start] : [x.start, x.end];
    const markers = (ms ? ` marker-start="url(#${ms})"` : '') + (me ? ` marker-end="url(#${me})"` : '');
    let label = '';
    if (x.label) {
      b.add(ed.x - ed.width / 2, ed.y - 10, ed.width, 20);
      label = `<g class="elabel"><rect x="${r(ed.x - ed.width / 2)}" y="${r(ed.y - 10)}" width="${r(ed.width)}" height="20" rx="4"/><text x="${r(ed.x)}" y="${r(ed.y)}">${esc(x.label)}</text></g>`;
    }
    const d = elbow ? elbowPath(g.node(x.e.from), g.node(x.e.to), g.graph().rankdir === 'LR') : edgePath(ed.points);
    parts.push(`<g class="edge ${x.cls}" data-from="${esc(x.e.from)}" data-to="${esc(x.e.to)}"><path d="${d}"${markers}/>${label}</g>`);
  }

  for (const x of nodes) {
    const p = g.node(x.n.id);
    b.add(p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
    parts.push(`<g class="node k-${x.kind}" data-id="${esc(x.n.id)}">${x.tooltip ? `<title>${esc(x.tooltip)}</title>` : ''}${x.draw(p.x, p.y, p.width, p.height)}</g>`);
  }

  return svgDoc(b, titleAbove(b, ir.meta.title) + parts.join(''), ir.meta.title);
}

// A labelled shape with an optional kind caption above the label.
function boxNode(kind, shapeName, label, caption, tooltip) {
  const lines = wrap(label, shapeName === 'decision' ? 16 : 22);
  const textW = Math.max(...lines.map((l) => textWidth(l))) + 36;
  const textH = lines.length * 17 + (caption ? 14 : 0) + 22;
  let width = Math.max(120, textW), height = Math.max(44, textH);
  if (shapeName === 'decision') { width = Math.max(130, textW * 1.5); height = Math.max(70, textH * 1.7); }
  else if (shapeName === 'database') height = textH + 14;
  else if (shapeName === 'start' || shapeName === 'final') width = Math.max(90, textW);
  const top = shapeName === 'database' ? 8 : 0;
  return {
    width, height, kind, tooltip,
    draw: (cx, cy, w, h) => shape(shapeName, cx, cy, w, h)
      + (caption ? `<text class="kind" x="${r(cx)}" y="${r(cy - (lines.length * 17) / 2 - 2 + top)}">${esc(kind)}</text>` : '')
      + textLines(lines, cx, cy + (caption ? 7 : 0) + top / 2, 'label'),
  };
}

const arrow = (cls, open = false) => ({ cls, end: open ? 'arrow-open' : 'arrow' });

// Per-type box configuration: default kind, layout direction, shape mapping, caption rule and edge style.
const BOXES = {
  architecture: {
    items: 'nodes', links: 'edges', kind: 'service', rankdir: 'LR', caption: () => true,
    edge: (e) => arrow(`s-${e.style || 'sync'}`, e.style === 'async'),
  },
  workflow: {
    items: 'steps', links: 'transitions', kind: 'task', rankdir: 'TB', caption: (k) => !['task', 'start', 'end', 'decision'].includes(k),
    edge: (e) => arrow(`s-${e.style || 'normal'}`),
  },
  dataflow: {
    items: 'nodes', links: 'flows', kind: 'process', rankdir: 'LR', caption: () => true,
    shape: (k) => ({ store: 'database', source: 'client', sink: 'client' })[k] || k,
    edge: (e) => arrow(`s-${{ stream: 'sync', batch: 'data', event: 'async' }[e.style || 'stream']}`, e.style === 'event'),
  },
  lifecycle: {
    items: 'states', links: 'transitions', kind: 'state', rankdir: 'LR', caption: (k) => k === 'waiting' || k === 'error',
    shape: (k) => ({ initial: 'start', state: 'client' })[k] || k,
    edge: (e) => ({ ...arrow(`s-${e.style || 'normal'}`), label: [e.label, e.guard && `[${e.guard}]`].filter(Boolean).join(' ') }),
  },
};

export function renderGraph(type, ir) {
  if (type === 'tree') {
    const nodes = ir.nodes.map(({ parent, ...n }) => n);
    const links = ir.nodes.filter((n) => n.parent !== undefined).map((n) => ({ from: n.parent, to: n.id }));
    return drawGraph(ir, {
      items: nodes, links, rankdir: 'TB', ranksep: 48, nodesep: 24, elbow: true,
      node: (n) => boxNode(n.kind || 'item', n.kind || 'item', n.label, (n.kind || 'item') !== 'item', n.description),
      edge: () => ({ cls: 's-tree' }),
    });
  }
  const c = BOXES[type];
  return drawGraph(ir, {
    items: ir[c.items], links: ir[c.links] || [], groups: ir.groups, rankdir: c.rankdir,
    node: (n) => { const kind = n.kind || c.kind; return boxNode(kind, c.shape ? c.shape(kind) : kind, n.label, c.caption(kind), n.description); },
    edge: (e) => ({ label: e.label, ...c.edge(e) }),
  });
}
