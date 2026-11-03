// Shared SVG helpers: escaping, text sizing, shapes, theme styles.

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const r = (n) => Math.round(n * 10) / 10;

// shortcut: average-glyph width estimate for system-ui; upgrade to real font metrics if labels clip.
export const textWidth = (s, size = 13) => String(s).length * size * 0.56;

export function wrap(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > maxChars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// Bounding box accumulator so the viewBox fits everything drawn.
export function bounds() {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  b.add = (x, y, w = 0, h = 0) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x + w); b.y1 = Math.max(b.y1, y + h); };
  return b;
}

export function textLines(lines, cx, cy, cls, lineH = 17) {
  const top = cy - ((lines.length - 1) * lineH) / 2;
  return lines.map((l, i) => `<text class="${cls}" x="${r(cx)}" y="${r(top + i * lineH)}">${esc(l)}</text>`).join('');
}

// Shape outline centred on (cx, cy) with size w x h.
export function shape(kind, cx, cy, w, h) {
  const x = r(cx - w / 2), y = r(cy - h / 2);
  switch (kind) {
    case 'database': {
      const ry = Math.min(10, h / 6);
      return `<path class="shape" d="M${x},${r(y + ry)} a${r(w / 2)},${r(ry)} 0 0 1 ${r(w)},0 v${r(h - 2 * ry)} a${r(w / 2)},${r(ry)} 0 0 1 ${r(-w)},0 z M${x},${r(y + ry)} a${r(w / 2)},${r(ry)} 0 0 0 ${r(w)},0"/>`;
    }
    case 'decision':
      return `<polygon class="shape" points="${r(cx)},${y} ${r(x + w)},${r(cy)} ${r(cx)},${r(y + h)} ${x},${r(cy)}"/>`;
    case 'start':
    case 'end':
      return `<rect class="shape" x="${x}" y="${y}" width="${r(w)}" height="${r(h)}" rx="${r(h / 2)}"/>`;
    case 'final':
      return `<rect class="shape" x="${x}" y="${y}" width="${r(w)}" height="${r(h)}" rx="${r(h / 2)}"/><rect class="shape-detail" x="${r(x + 4)}" y="${r(y + 4)}" width="${r(w - 8)}" height="${r(h - 8)}" rx="${r(h / 2 - 4)}"/>`;
    case 'queue':
      return `<rect class="shape" x="${x}" y="${y}" width="${r(w)}" height="${r(h)}" rx="6"/><path class="shape-detail" d="M${r(x + w - 14)},${r(y + 6)} v${r(h - 12)} M${r(x + w - 9)},${r(y + 6)} v${r(h - 12)}"/>`;
    case 'client':
    case 'actor':
      return `<rect class="shape" x="${x}" y="${y}" width="${r(w)}" height="${r(h)}" rx="16"/>`;
    default:
      return `<rect class="shape" x="${x}" y="${y}" width="${r(w)}" height="${r(h)}" rx="8"/>`;
  }
}

export const MARKERS = `<defs>
<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="arrow-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10" class="arrowhead-open"/></marker>
<marker id="one" viewBox="0 0 12 12" refX="12" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M6,1 L6,11 M0,6 L12,6" class="arrowhead-open"/></marker>
<marker id="many" viewBox="0 0 12 12" refX="12" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M0,6 L12,1 M0,6 L12,6 M0,6 L12,11 M2,1 L2,11" class="arrowhead-open"/></marker>
<marker id="triangle" viewBox="0 0 12 12" refX="12" refY="6" markerWidth="13" markerHeight="13" orient="auto-start-reverse"><path d="M0,0 L12,6 L0,12 z" class="hollow"/></marker>
<marker id="diamond" viewBox="0 0 16 10" refX="16" refY="5" markerWidth="16" markerHeight="10" orient="auto-start-reverse"><path d="M0,5 L8,0 L16,5 L8,10 z" class="arrowhead"/></marker>
<marker id="diamond-open" viewBox="0 0 16 10" refX="16" refY="5" markerWidth="16" markerHeight="10" orient="auto-start-reverse"><path d="M0,5 L8,0 L16,5 L8,10 z" class="hollow"/></marker>
</defs>`;

// Styles live inside the SVG so exported files keep their look. Theme switches via the "dark" class.
export const STYLE = `<style>
.dg{--bg:#ffffff;--fg:#1f2328;--muted:#59636e;--line:#6e7781;--fill:#f6f8fa;--group:#eef1f5;--group-line:#c4ccd5;--label-bg:#ffffff;--error:#cf222e;--accent:#0969da;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.dg.dark{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#8b949e;--fill:#161b22;--group:#151b23;--group-line:#3d444d;--label-bg:#0d1117;--error:#f85149;--accent:#4493f8}
.dg .bg{fill:var(--bg)}
.dg .title{fill:var(--fg);font-size:18px;font-weight:600}
.dg .node .shape{fill:var(--fill);stroke:var(--kc,var(--accent));stroke-width:1.6}
.dg .node .shape-detail{fill:none;stroke:var(--kc,var(--accent));stroke-width:1.2}
.dg .node.k-external .shape{stroke-dasharray:5 4}
.dg .node.k-wait .shape,.dg .node.k-manual .shape{stroke-dasharray:3 3}
.dg .label{fill:var(--fg);font-size:13px;text-anchor:middle;dominant-baseline:central}
.dg .kind{fill:color-mix(in srgb,var(--kc,var(--accent)) 60%,var(--fg));font-size:10px;font-weight:600;letter-spacing:.08em;text-anchor:middle;dominant-baseline:central;text-transform:uppercase}
.dg .group rect{fill:var(--group);stroke:var(--group-line);stroke-width:1.2}
.dg .group text{fill:var(--muted);font-size:12px;font-weight:600}
.dg .edge path{fill:none;stroke:var(--line);stroke-width:1.5}
.dg .edge.s-async path,.dg .edge.s-retry path,.dg .msg.m-return line,.dg .msg.m-return path{stroke-dasharray:6 4}
.dg .edge.s-data path{stroke-width:2.6}
.dg .edge.s-error path{stroke:var(--error)}
.dg .arrowhead{fill:var(--line)}
.dg .arrowhead-open{fill:none;stroke:var(--line);stroke-width:1.4}
.dg .hollow{fill:var(--bg);stroke:var(--line);stroke-width:1.3}
.dg .edge.s-dependency path,.dg .edge.s-realization path{stroke-dasharray:6 4}
.dg .tbl .frame{fill:var(--fill);stroke:var(--kc,var(--accent));stroke-width:1.6}
.dg .tbl .head{fill:var(--kc,var(--accent));fill-opacity:.14}
.dg .tbl .sep{stroke:var(--group-line);stroke-width:1}
.dg .tbl .tname{fill:var(--fg);font-size:13px;font-weight:700;text-anchor:middle;dominant-baseline:central}
.dg .tbl .tname.abstract{font-style:italic}
.dg .tbl .stereo{fill:var(--muted);font-size:10.5px;text-anchor:middle;dominant-baseline:central}
.dg .tbl .tcol{fill:var(--fg);font-size:12px;dominant-baseline:central}
.dg .tbl .ttype{fill:var(--muted);font-size:11.5px;text-anchor:end;dominant-baseline:central}
.dg .tbl .tkey{fill:color-mix(in srgb,var(--kc,var(--accent)) 60%,var(--fg));font-size:10px;font-weight:700;dominant-baseline:central}
.dg .elabel rect{fill:var(--label-bg);opacity:.92}
.dg .elabel text{fill:var(--muted);font-size:11.5px;text-anchor:middle;dominant-baseline:central}
.dg .lifeline{stroke:var(--group-line);stroke-width:1.2;stroke-dasharray:4 4}
.dg .msg line,.dg .msg path{fill:none;stroke:var(--line);stroke-width:1.5}
.dg .msg text{fill:var(--fg);font-size:12px;text-anchor:middle}
.dg .frag rect.box{fill:none;stroke:var(--group-line);stroke-width:1.2}
.dg .frag rect.tab{fill:var(--group);stroke:var(--group-line);stroke-width:1.2}
.dg .frag text{fill:var(--muted);font-size:11px}
.dg .frag text.op{font-weight:700;fill:var(--fg)}
.k-service,.k-task{--kc:#3b82f6}.k-database{--kc:#8b5cf6}.k-queue{--kc:#d97706}.k-cache{--kc:#ef4444}.k-storage{--kc:#10b981}
.k-client,.k-actor{--kc:#0ea5e9}.k-gateway{--kc:#6366f1}.k-function,.k-tool{--kc:#f97316}.k-external{--kc:#6b7280}
.k-start{--kc:#10b981}.k-end{--kc:#6b7280}.k-decision{--kc:#d97706}.k-wait{--kc:#8b5cf6}.k-manual{--kc:#0ea5e9}
.k-source{--kc:#0ea5e9}.k-process{--kc:#3b82f6}.k-store{--kc:#8b5cf6}.k-sink{--kc:#10b981}
.k-initial{--kc:#10b981}.k-state{--kc:#3b82f6}.k-waiting{--kc:#8b5cf6}.k-error{--kc:#ef4444}.k-final{--kc:#6b7280}
.k-item{--kc:#3b82f6}.k-folder{--kc:#d97706}.k-file{--kc:#6b7280}.k-module{--kc:#6366f1}.k-feature{--kc:#10b981}.k-team{--kc:#0ea5e9}.k-person{--kc:#f97316}
.k-entity,.k-class{--kc:#3b82f6}.k-interface{--kc:#10b981}.k-abstract{--kc:#8b5cf6}.k-enum{--kc:#d97706}
.dg .node.k-waiting .shape{stroke-dasharray:3 3}
.dg .axis{stroke:var(--line);stroke-width:1.2}
.dg .grid{stroke:var(--group-line);stroke-width:1;stroke-dasharray:2 4}
.dg .tick{fill:var(--muted);font-size:11px;text-anchor:middle}
.dg .zone{fill:var(--muted);font-size:10.5px;text-anchor:end}
.dg .lane{stroke:var(--group-line);stroke-width:1.4}
.dg .lane-label{fill:var(--fg);font-size:12px;font-weight:600;dominant-baseline:central}
.dg .event .leader{stroke:var(--kc);stroke-width:1.2}
.dg .event .dot{fill:var(--kc);stroke:var(--bg);stroke-width:2}
.dg .event .ebox{fill:var(--fill);stroke:var(--kc);stroke-width:1.2}
.dg .event .etime{fill:var(--muted);font-size:10.5px}
.dg .event .elabel-t{fill:var(--fg);font-size:12px}
.dg .period rect{fill:var(--kc);fill-opacity:.1}
.dg .period text{fill:color-mix(in srgb,var(--kc) 60%,var(--fg));font-size:11px;font-weight:600}
.dg .stripe{fill:var(--group);opacity:.6}
.dg .span .slabel{fill:var(--fg);font-size:12px;dominant-baseline:central}
.dg .span .bar{fill:var(--kc);fill-opacity:.8}
.dg .span.error .bar{stroke:var(--error);stroke-width:2;fill-opacity:.45}
.dg .span .sdur{fill:var(--muted);font-size:11px;dominant-baseline:central}
.k-info{--kc:#6b7280}.k-change{--kc:#3b82f6}.k-alert{--kc:#d97706}.k-incident{--kc:#ef4444}.k-fix{--kc:#10b981}.k-milestone{--kc:#8b5cf6}
.k-maintenance{--kc:#6366f1}.k-window{--kc:#0ea5e9}.k-request{--kc:#3b82f6}.k-compute{--kc:#f97316}.k-db{--kc:#8b5cf6}.k-llm{--kc:#6366f1}
.dg .flow{fill:none!important;stroke:var(--fc,var(--accent))!important;stroke-width:4.5!important;stroke-dasharray:0 30!important;stroke-linecap:round;opacity:0}
.dg .s-error .flow{--fc:var(--error)}
.dg.live .flow{opacity:.85;animation:dg-flow 1.3s linear infinite}
.dg.live .anim{animation:dg-in .45s ease-out both;animation-delay:calc(var(--i,0) * 110ms)}
.dg.live .span .bar{transform-box:fill-box;transform-origin:left;animation:dg-grow .6s ease-out both;animation-delay:calc(var(--i,0) * 80ms)}
@keyframes dg-flow{to{stroke-dashoffset:-30}}
@keyframes dg-in{from{opacity:0;transform:translateY(6px)}}
@keyframes dg-grow{from{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){.dg.live .flow,.dg.live .anim,.dg.live .span .bar{animation:none}}
</style>`;

// Title text placed above the current content; grows the bounds to fit it.
export function titleAbove(b, title) {
  const x = b.x0, y = b.y0 - 26;
  b.add(x, y - 18, textWidth(title, 18), 18);
  return `<text class="title" x="${r(x)}" y="${r(y)}">${esc(title)}</text>`;
}

export function svgDoc(b, body, title, pad = 24) {
  const x = r(b.x0 - pad), y = r(b.y0 - pad), w = r(b.x1 - b.x0 + 2 * pad), h = r(b.y1 - b.y0 + 2 * pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="dg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">`
    + `<title>${esc(title)}</title>${STYLE}${MARKERS}<rect class="bg" x="${x}" y="${y}" width="${w}" height="${h}"/>${body}</svg>`;
}
