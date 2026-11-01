// Architecture and workflow renderer: layered layout via dagre, drawn as SVG.
import dagre from '@dagrejs/dagre';
import { bounds, esc, r, shape, svgDoc, textLines, textWidth, titleAbove, wrap } from './svg.mjs';

const GROUP_LABEL_H = 24;

function nodeSize(kind, lines, caption) {
  const w = Math.max(...lines.map((l) => textWidth(l))) + 36;
  const h = lines.length * 17 + (caption ? 14 : 0) + 22;
  if (kind === 'decision') return { width: Math.max(130, w * 1.5), height: Math.max(70, h * 1.7) };
  if (kind === 'database') return { width: Math.max(120, w), height: h + 14 };
  return { width: Math.max(kind === 'start' || kind === 'end' ? 90 : 120, w), height: Math.max(44, h) };
}

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

export function renderGraph(type, ir) {
  const wf = type === 'workflow';
  const items = wf ? ir.steps : ir.nodes;
  const links = (wf ? ir.transitions : ir.edges) || [];
  const groups = ir.groups || [];
  const defaultKind = wf ? 'task' : 'service';

  // Draw only groups that (transitively) contain items; dagre mis-sizes empty clusters.
  const used = new Set();
  const parentOf = new Map(groups.map((g) => [g.id, g.parent]));
  for (const n of items) for (let g = n.group; g && !used.has(g); g = parentOf.get(g)) used.add(g);

  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: ir.meta.direction || (wf ? 'TB' : 'LR'), nodesep: 44, ranksep: 72, edgesep: 24, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const grp of groups) if (used.has(grp.id)) g.setNode(grp.id, { cluster: true });
  for (const grp of groups) if (used.has(grp.id) && grp.parent) g.setParent(grp.id, grp.parent);

  const drawn = new Map();
  for (const n of items) {
    const kind = n.kind || defaultKind;
    // Workflow tasks and start/end/decision speak for themselves; other kinds get a caption.
    const caption = wf ? !['task', 'start', 'end', 'decision'].includes(kind) : true;
    const lines = wrap(n.label, kind === 'decision' ? 16 : 22);
    drawn.set(n.id, { n, kind, caption, lines });
    g.setNode(n.id, nodeSize(kind, lines, caption));
    if (n.group) g.setParent(n.id, n.group);
  }
  links.forEach((e, i) => {
    const label = e.label ? { width: textWidth(e.label, 11.5) + 14, height: 20, labelpos: 'c' } : {};
    g.setEdge(e.from, e.to, label, `e${i}`);
  });
  dagre.layout(g);

  const b = bounds();
  const parts = [];

  // Groups: outermost first so children paint on top.
  const depth = (id) => { let d = 0; for (let p = parentOf.get(id); p; p = parentOf.get(p)) d++; return d; };
  const drawnGroups = groups.filter((x) => used.has(x.id)).sort((a, c) => depth(a.id) - depth(c.id));
  for (const grp of drawnGroups) {
    const c = g.node(grp.id);
    const x = c.x - c.width / 2, y = c.y - c.height / 2 - GROUP_LABEL_H;
    b.add(x, y, c.width, c.height + GROUP_LABEL_H);
    parts.push(`<g class="group" data-id="${esc(grp.id)}"><rect x="${r(x)}" y="${r(y)}" width="${r(c.width)}" height="${r(c.height + GROUP_LABEL_H)}" rx="10"/>`
      + `<text x="${r(x + 12)}" y="${r(y + 16)}">${esc(grp.label)}</text></g>`);
  }

  links.forEach((e, i) => {
    const ed = g.edge({ v: e.from, w: e.to, name: `e${i}` });
    const style = e.style || (wf ? 'normal' : 'sync');
    ed.points.forEach((p) => b.add(p.x, p.y));
    let label = '';
    if (e.label) {
      b.add(ed.x - ed.width / 2, ed.y - 10, ed.width, 20);
      label = `<g class="elabel"><rect x="${r(ed.x - ed.width / 2)}" y="${r(ed.y - 10)}" width="${r(ed.width)}" height="20" rx="4"/><text x="${r(ed.x)}" y="${r(ed.y)}">${esc(e.label)}</text></g>`;
    }
    const marker = style === 'async' ? 'arrow-open' : 'arrow';
    parts.push(`<g class="edge s-${style}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"><path d="${edgePath(ed.points)}" marker-end="url(#${marker})"/>${label}</g>`);
  });

  for (const { n, kind, caption, lines } of drawn.values()) {
    const p = g.node(n.id);
    b.add(p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
    const capH = caption ? 14 : 0;
    const top = kind === 'database' ? 8 : 0;
    parts.push(`<g class="node k-${kind}" data-id="${esc(n.id)}">${n.description ? `<title>${esc(n.description)}</title>` : ''}${shape(kind, p.x, p.y, p.width, p.height)}`
      + (caption ? `<text class="kind" x="${r(p.x)}" y="${r(p.y - (lines.length * 17) / 2 - 2 + top)}">${esc(kind)}</text>` : '')
      + textLines(lines, p.x, p.y + capH / 2 + top / 2, 'label') + '</g>');
  }

  return svgDoc(b, titleAbove(b, ir.meta.title) + parts.join(''), ir.meta.title);
}
