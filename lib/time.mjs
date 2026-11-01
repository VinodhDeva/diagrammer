// Timeline and waterfall renderers: proportional time axes drawn as SVG.
// Times are formatted with getUTC* plus a fixed offset so a render is identical on every machine.
import { bounds, esc, r, svgDoc, textWidth, titleAbove } from './svg.mjs';

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const STEPS = [1000, 5000, 15_000, 30_000, MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 7 * DAY, 30 * DAY, 91 * DAY, 365 * DAY];
const pad2 = (n) => String(n).padStart(2, '0');
const parseOffset = (s) => (s ? (s[0] === '-' ? -1 : 1) * (Number(s.slice(1, 3)) * 60 + Number(s.slice(4, 6))) * MIN : 0);

function fmt(t, off, { date, time, seconds }) {
  const d = new Date(t + off);
  const ds = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const ts = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}${seconds ? `:${pad2(d.getUTCSeconds())}` : ''}`;
  return [date && ds, time && ts].filter(Boolean).join(' ');
}

export function renderTimeline(ir) {
  const off = parseOffset(ir.meta.utc_offset);
  const lanes = ir.lanes?.length ? ir.lanes : [{ id: undefined, label: '' }];
  const events = ir.events.map((e, i) => ({ ...e, i, t: Date.parse(e.at) })).sort((a, b) => a.t - b.t || a.i - b.i);
  const periods = (ir.periods || []).map((p) => ({ ...p, t0: Date.parse(p.start), t1: Date.parse(p.end) }));
  const all = [...events.map((e) => e.t), ...periods.flatMap((p) => [p.t0, p.t1])];
  let t0 = Math.min(...all), t1 = Math.max(...all);
  if (t1 === t0) { t0 -= 30 * MIN; t1 += 30 * MIN; }
  const span = t1 - t0;

  const gutter = ir.lanes?.length ? Math.max(...lanes.map((l) => textWidth(l.label, 12))) + 28 : 0;
  const W = Math.min(1600, Math.max(720, events.length * 110));
  const x = (t) => gutter + ((t - t0) / span) * W;
  const multiDay = fmt(t0, off, { date: true }) !== fmt(t1, off, { date: true });
  const evFmt = { date: span >= 2 * DAY, time: span < 60 * DAY, seconds: span < 10 * MIN };

  // Stack labels upwards per lane: each takes the lowest level where it does not overlap a neighbour.
  const LEVEL_H = 36, LABEL_H = 30;
  const levels = new Map(lanes.map((l) => [l.id, []]));
  for (const e of events) {
    e.time = fmt(e.t, off, evFmt);
    e.w = Math.max(textWidth(e.time, 10.5), textWidth(e.label, 12)) + 10;
    e.lx = Math.min(Math.max(x(e.t) - e.w / 2, gutter), gutter + W - e.w);
    const placed = levels.get(e.lane);
    let lv = 0;
    while (placed.some((p) => p.lv === lv && e.lx < p.lx + p.w + 6 && p.lx < e.lx + e.w + 6)) lv++;
    e.lv = lv;
    placed.push(e);
  }

  const b = bounds();
  const parts = [];
  let y = periods.length ? 14 : 0; // room for period labels above the lanes
  const laneY = new Map();
  for (const l of lanes) {
    const maxLv = Math.max(-1, ...levels.get(l.id).map((e) => e.lv));
    y += 18 + (maxLv + 1) * LEVEL_H;
    laneY.set(l.id, y);
    y += 16;
  }
  const axisY = y + 6;

  for (const p of periods) {
    const px = x(p.t0), pw = Math.max(2, x(p.t1) - px);
    b.add(px, -4, pw, axisY + 4);
    parts.push(`<g class="period k-${p.kind || 'window'}"><rect x="${r(px)}" y="-4" width="${r(pw)}" height="${r(axisY + 4)}"/><text x="${r(px + 4)}" y="8">${esc(p.label)}</text></g>`);
  }

  // Axis: the coarsest step that still gives at most 8 ticks, aligned to the display offset.
  const step = STEPS.find((s) => span / s <= 8) || STEPS.at(-1);
  const tickFmt = { date: step >= DAY || multiDay, time: step < DAY, seconds: step < MIN };
  parts.push(`<line class="axis" x1="${r(gutter)}" y1="${r(axisY)}" x2="${r(gutter + W)}" y2="${r(axisY)}"/>`);
  for (let t = Math.ceil((t0 + off) / step) * step - off; t <= t1; t += step) {
    const tx = x(t);
    parts.push(`<line class="grid" x1="${r(tx)}" y1="0" x2="${r(tx)}" y2="${r(axisY)}"/><text class="tick" x="${r(tx)}" y="${r(axisY + 16)}">${esc(fmt(t, off, tickFmt))}</text>`);
  }
  const zone = ir.meta.utc_offset && ir.meta.utc_offset !== '+00:00' ? `UTC${ir.meta.utc_offset}` : 'UTC';
  parts.push(`<text class="zone" x="${r(gutter + W)}" y="${r(axisY + 32)}">${zone}</text>`);
  b.add(gutter - 40, axisY, W + 80, 40);

  for (const l of lanes) {
    const ly = laneY.get(l.id);
    parts.push(`<line class="lane" x1="${r(gutter)}" y1="${r(ly)}" x2="${r(gutter + W)}" y2="${r(ly)}"/>`);
    if (l.label) { parts.push(`<text class="lane-label" x="0" y="${r(ly)}">${esc(l.label)}</text>`); b.add(0, ly - 8, gutter, 16); }
  }

  for (const e of events) {
    const ly = laneY.get(e.lane), ex = x(e.t);
    const top = ly - 14 - e.lv * LEVEL_H - LABEL_H;
    b.add(e.lx, top, e.w, ly - top + 6);
    parts.push(`<g class="event k-${e.kind || 'info'}">${e.description ? `<title>${esc(e.description)}</title>` : ''}`
      + `<line class="leader" x1="${r(ex)}" y1="${r(ly)}" x2="${r(ex)}" y2="${r(top + LABEL_H)}"/>`
      + `<rect class="ebox" x="${r(e.lx)}" y="${r(top)}" width="${r(e.w)}" height="${LABEL_H}" rx="4"/>`
      + `<text class="etime" x="${r(e.lx + 5)}" y="${r(top + 11)}">${esc(e.time)}</text>`
      + `<text class="elabel-t" x="${r(e.lx + 5)}" y="${r(top + 24)}">${esc(e.label)}</text>`
      + `<circle class="dot" cx="${r(ex)}" cy="${r(ly)}" r="5"/></g>`);
  }

  return svgDoc(b, titleAbove(b, ir.meta.title) + parts.join(''), ir.meta.title);
}

const niceStep = (raw) => { const p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw); };
const fmtNum = (v) => String(Math.round(v * 1000) / 1000);

export function renderWaterfall(ir) {
  const unit = ir.meta.unit || 'ms';
  const fmtDur = (v) => (unit === 'ms' && v >= 1000 ? `${fmtNum(v / 1000)} s` : `${fmtNum(v)} ${unit}`);
  // Depth-first order: roots then children, each sorted by start.
  const kids = new Map();
  for (const s of ir.spans) kids.set(s.parent, [...(kids.get(s.parent) || []), s]);
  const rows = [];
  const walk = (parent, depth) => {
    for (const s of (kids.get(parent) || []).sort((a, c) => a.start - c.start)) { rows.push({ s, depth }); walk(s.id, depth + 1); }
  };
  walk(undefined, 0);

  const total = Math.max(...ir.spans.map((s) => s.start + s.duration)) || 1;
  const labelW = Math.max(...rows.map((x) => x.depth * 14 + textWidth(x.s.label, 12))) + 24;
  const W = 760, ROW = 28, TOP = 30;
  const x = (t) => labelW + (t / total) * W;
  const b = bounds();
  const parts = [];
  const bottom = TOP + rows.length * ROW;

  rows.forEach((_, i) => { if (i % 2 === 0) parts.push(`<rect class="stripe" x="0" y="${r(TOP + i * ROW)}" width="${r(labelW + W)}" height="${ROW}"/>`); });
  const step = niceStep(total / 6);
  for (let t = 0; t <= total + 1e-9; t += step) {
    parts.push(`<line class="grid" x1="${r(x(t))}" y1="${TOP - 6}" x2="${r(x(t))}" y2="${r(bottom)}"/><text class="tick" x="${r(x(t))}" y="${TOP - 12}">${esc(fmtDur(t))}</text>`);
  }
  b.add(0, 0, labelW + W, bottom);

  rows.forEach(({ s, depth }, i) => {
    const ry = TOP + i * ROW;
    const bx = x(s.start), bw = Math.max(2, x(s.start + s.duration) - bx);
    const dur = fmtDur(s.duration);
    b.add(bx + bw + 6, ry, textWidth(dur, 11) + 4, ROW);
    parts.push(`<g class="span k-${s.kind || 'compute'}${s.status === 'error' ? ' error' : ''}" data-id="${esc(s.id)}">`
      + `<title>${esc(`${s.label}: starts ${fmtDur(s.start)}, takes ${dur}${s.status === 'error' ? ', failed' : ''}`)}</title>`
      + `<text class="slabel" x="${r(8 + depth * 14)}" y="${r(ry + ROW / 2)}">${esc(s.label)}</text>`
      + `<rect class="bar" x="${r(bx)}" y="${r(ry + 6)}" width="${r(bw)}" height="${ROW - 12}" rx="3"/>`
      + `<text class="sdur" x="${r(bx + bw + 6)}" y="${r(ry + ROW / 2)}">${esc(dur)}</text></g>`);
  });

  return svgDoc(b, titleAbove(b, ir.meta.title) + parts.join(''), ir.meta.title);
}
