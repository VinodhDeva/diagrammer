// Sequence renderer: participant columns, time-ordered message rows, nested fragments.
import { bounds, esc, r, shape, svgDoc, textLines, textWidth, titleAbove, wrap } from './svg.mjs';

const HEAD_H = 46, LINE_H = 15, SELF_W = 36, SELF_H = 22;

export function renderSequence(ir) {
  const ps = ir.participants;
  const col = new Map(ps.map((p, i) => [p.id, i]));
  const msgs = ir.messages.map((m, i) => ({ ...m, i, lines: wrap(`${i + 1}. ${m.label}`, 34), a: col.get(m.from), z: col.get(m.to) }));
  const widths = ps.map((p) => Math.max(130, textWidth(p.label) + 40));
  const labelW = (m) => Math.max(...m.lines.map((l) => textWidth(l, 12)));

  // Column spacing: neighbours must fit the labels of messages between them and of self calls.
  const need = ps.map(() => 0);
  for (const m of msgs) {
    if (m.a === m.z) { if (m.a + 1 < ps.length) need[m.a + 1] = Math.max(need[m.a + 1], labelW(m) + SELF_W + 30); }
    else if (Math.abs(m.a - m.z) === 1) { const k = Math.max(m.a, m.z); need[k] = Math.max(need[k], labelW(m) + 30); }
  }
  const cx = [];
  ps.forEach((p, i) => { cx[i] = i === 0 ? widths[0] / 2 : cx[i - 1] + Math.max((widths[i - 1] + widths[i]) / 2 + 40, need[i]); });

  // Fragment nesting depth; an equal range nests by array order (earlier is outer).
  const frags = (ir.fragments || []).map((f, i) => ({ ...f, i }));
  const contains = (g, f) => g !== f && g.start <= f.start && f.end <= g.end && (g.start !== f.start || g.end !== f.end || g.i < f.i);
  for (const f of frags) f.depth = frags.filter((g) => contains(g, f)).length;

  const b = bounds();
  const parts = [];
  let y = HEAD_H + 28;
  const rows = [];
  for (const m of msgs) {
    for (const f of frags.filter((f) => f.start === m.i).sort((p, q) => p.depth - q.depth)) { f.top = y; y += 28; }
    y += m.lines.length * LINE_H;
    const lineY = y + 4;
    rows.push({ m, lineY });
    y = lineY + (m.a === m.z ? SELF_H + 20 : 22);
    for (const f of frags.filter((f) => f.end === m.i).sort((p, q) => q.depth - p.depth)) { y += 6; f.bottom = y; y += 4; }
  }
  const endY = y + 10;

  for (const f of frags.sort((p, q) => p.depth - q.depth)) {
    const inside = msgs.slice(f.start, f.end + 1);
    const lo = Math.min(...inside.flatMap((m) => [m.a, m.z])), hi = Math.max(...inside.flatMap((m) => [m.a, m.z]));
    const pad = Math.max(16, 64 - 12 * f.depth);
    const selfAtHi = inside.some((m) => m.a === m.z && m.a === hi);
    const tag = f.kind.toUpperCase(), guard = f.label ? `[${f.label}]` : '';
    const tabW = textWidth(tag, 11) + 16;
    const x0 = cx[lo] - pad;
    const x1 = Math.max(cx[hi] + pad + (selfAtHi ? SELF_W + labelW(inside.find((m) => m.a === hi && m.z === hi)) / 2 : 0), x0 + tabW + textWidth(guard, 11) + 24);
    b.add(x0, f.top, x1 - x0, f.bottom - f.top);
    parts.push(`<g class="frag f-${f.kind}"><rect class="box" x="${r(x0)}" y="${r(f.top)}" width="${r(x1 - x0)}" height="${r(f.bottom - f.top)}" rx="4"/>`
      + `<rect class="tab" x="${r(x0)}" y="${r(f.top)}" width="${r(tabW)}" height="18" rx="4"/><text class="op" x="${r(x0 + 8)}" y="${r(f.top + 13)}">${esc(tag)}</text>`
      + (guard ? `<text x="${r(x0 + tabW + 8)}" y="${r(f.top + 13)}">${esc(guard)}</text>` : '') + '</g>');
  }

  ps.forEach((p, i) => {
    const kind = p.kind || 'service';
    b.add(cx[i] - widths[i] / 2, 0, widths[i], HEAD_H);
    parts.push(`<line class="lifeline" x1="${r(cx[i])}" y1="${HEAD_H}" x2="${r(cx[i])}" y2="${r(endY)}"/>`
      + `<g class="node k-${kind}" data-id="${esc(p.id)}">${shape(kind, cx[i], HEAD_H / 2, widths[i], HEAD_H)}`
      + `<text class="kind" x="${r(cx[i])}" y="${r(HEAD_H / 2 - 9 + (kind === 'database' ? 5 : 0))}">${esc(kind)}</text>`
      + textLines([p.label], cx[i], HEAD_H / 2 + 8 + (kind === 'database' ? 3 : 0), 'label') + '</g>');
  });
  b.add(0, endY);

  for (const { m, lineY } of rows) {
    const kind = m.kind || 'sync';
    const marker = kind === 'sync' ? 'arrow' : 'arrow-open';
    const x = cx[m.a];
    const self = m.a === m.z;
    const d = self ? `M${r(x)},${r(lineY)} h${SELF_W} v${SELF_H} h${-SELF_W}` : `M${r(x)},${r(lineY)} H${r(cx[m.z])}`;
    const path = `<path d="${d}" marker-end="url(#${marker})"/><path class="flow" d="${d}"/>`;
    const tx = self ? x + SELF_W + 6 + labelW(m) / 2 : (x + cx[m.z]) / 2;
    const top = lineY - 6 - (m.lines.length - 1) * LINE_H;
    b.add(tx - labelW(m) / 2, top - 12, labelW(m), lineY - top + 12);
    const text = m.lines.map((l, k) => `<text x="${r(tx)}" y="${r(top + k * LINE_H)}">${esc(l)}</text>`).join('');
    parts.push(`<g class="msg anim m-${kind}" style="--i:${m.i}" data-from="${esc(m.from)}" data-to="${esc(m.to)}">${path}${text}</g>`);
  }

  return svgDoc(b, titleAbove(b, ir.meta.title) + parts.join(''), ir.meta.title);
}
