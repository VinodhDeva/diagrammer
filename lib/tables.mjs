// ERD and class renderers: compartment boxes on the shared dagre graph engine.
import { drawGraph } from './graph.mjs';
import { esc, r, textWidth } from './svg.mjs';

const HEAD_H = 30, ROW_H = 20, PAD = 12;

function frame(cx, cy, w, h, headH) {
  const x = r(cx - w / 2), y = r(cy - h / 2);
  return `<rect class="frame" x="${x}" y="${y}" width="${r(w)}" height="${r(h)}" rx="6"/>`
    + `<rect class="head" x="${x}" y="${y}" width="${r(w)}" height="${r(headH)}" rx="6"/>`
    + `<line class="sep" x1="${x}" y1="${r(y + headH)}" x2="${r(x + w)}" y2="${r(y + headH)}"/>`;
}

function erdNode(e) {
  const name = e.label || e.id;
  const rows = e.attributes.map((a) => ({ ...a, keys: (a.key || []).map((k) => k.toUpperCase()).join(' '), shownType: a.type + (a.nullable ? '?' : '') }));
  const keyW = Math.max(0, ...rows.map((a) => (a.keys ? textWidth(a.keys, 9.5) + 8 : 0)));
  const rowW = Math.max(...rows.map((a) => textWidth(a.name, 12) + textWidth(a.shownType, 11.5) + 24));
  const width = Math.max(150, textWidth(name, 13) + 2 * PAD, keyW + rowW + 2 * PAD);
  const height = HEAD_H + rows.length * ROW_H + 8;
  const tips = rows.filter((a) => a.note || a.references).map((a) => `${a.name}: ${[a.references && `-> ${a.references}`, a.note].filter(Boolean).join(' ')}`);
  return {
    width, height, kind: 'entity', tooltip: tips.join('\n'),
    draw: (cx, cy, w, h) => {
      const x = cx - w / 2, y = cy - h / 2;
      return `<g class="tbl">${frame(cx, cy, w, h, HEAD_H)}<text class="tname" x="${r(cx)}" y="${r(y + HEAD_H / 2)}">${esc(name)}</text>`
        + rows.map((a, i) => {
          const ry = y + HEAD_H + 4 + ROW_H * i + ROW_H / 2;
          return (a.keys ? `<text class="tkey" x="${r(x + PAD)}" y="${r(ry)}">${esc(a.keys)}</text>` : '')
            + `<text class="tcol" x="${r(x + PAD + keyW)}" y="${r(ry)}">${esc(a.name)}</text>`
            + `<text class="ttype" x="${r(x + w - PAD)}" y="${r(ry)}">${esc(a.shownType)}</text>`;
        }).join('') + '</g>';
    },
  };
}

const STEREO = { interface: '«interface»', abstract: '«abstract»', enum: '«enumeration»' };

function classNode(c) {
  const kind = c.kind || 'class';
  const attrs = c.attributes || [], methods = c.methods || [];
  const stereo = STEREO[kind];
  const headH = stereo ? 40 : HEAD_H;
  const sec = (list) => (list.length ? list.length * ROW_H + 8 : 10);
  const width = Math.max(150, textWidth(c.name, 13) + 2 * PAD, ...[...attrs, ...methods].map((s) => textWidth(s, 12) + 2 * PAD));
  const height = headH + sec(attrs) + sec(methods);
  return {
    width, height, kind,
    draw: (cx, cy, w, h) => {
      const x = cx - w / 2, y = cy - h / 2;
      const midY = y + headH + sec(attrs);
      const rows = (list, top) => list.map((s, i) => `<text class="tcol" x="${r(x + PAD)}" y="${r(top + 4 + ROW_H * i + ROW_H / 2)}">${esc(s)}</text>`).join('');
      return `<g class="tbl">${frame(cx, cy, w, h, headH)}`
        + (stereo ? `<text class="stereo" x="${r(cx)}" y="${r(y + 12)}">${esc(stereo)}</text>` : '')
        + `<text class="tname${kind === 'abstract' ? ' abstract' : ''}" x="${r(cx)}" y="${r(y + headH / 2 + (stereo ? 6 : 0))}">${esc(c.name)}</text>`
        + rows(attrs, y + headH)
        + `<line class="sep" x1="${r(x)}" y1="${r(midY)}" x2="${r(x + w)}" y2="${r(midY)}"/>`
        + rows(methods, midY) + '</g>';
    },
  };
}

const CARD = { '1:1': ['one', 'one'], '1:N': ['one', 'many'], 'N:1': ['many', 'one'], 'N:M': ['many', 'many'] };

// UML ends: inheritance/realization point at the parent (laid out above the child); diamonds sit on the whole.
const UML = {
  inheritance: { end: 'triangle', reverse: true },
  realization: { end: 'triangle', reverse: true },
  composition: { start: 'diamond' },
  aggregation: { start: 'diamond-open' },
  association: { end: 'arrow-open' },
  dependency: { end: 'arrow-open' },
};

export function renderTable(type, ir) {
  if (type === 'erd') {
    return drawGraph(ir, {
      items: ir.entities, links: ir.relationships || [], groups: ir.groups, rankdir: 'LR', ranksep: 90,
      node: erdNode,
      edge: (e) => { const [start, end] = CARD[e.cardinality || '1:N']; return { cls: 's-sync', label: e.label, start, end }; },
    });
  }
  return drawGraph(ir, {
    items: ir.classes, links: ir.relations || [], groups: ir.groups, rankdir: 'TB', ranksep: 64,
    node: classNode,
    edge: (e) => ({ cls: `s-${e.kind || 'association'}`, label: e.label, ...UML[e.kind || 'association'] }),
  });
}
