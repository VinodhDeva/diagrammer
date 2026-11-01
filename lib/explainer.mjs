// Explainer page body: the conclusion first, then supporting panels (HTML, with embedded diagram SVGs).
import { renderDiagram } from './render.mjs';
import { esc } from './svg.mjs';

const MARKER_IDS = 'arrow|arrow-open|one|many|triangle|diamond|diamond-open';
// Several SVGs share one document, so marker ids get a per-diagram prefix to stay unique.
const scopeIds = (svg, prefix) => svg
  .replace(new RegExp(`id="(${MARKER_IDS})"`, 'g'), `id="${prefix}-$1"`)
  .replace(new RegExp(`url\\(#(${MARKER_IDS})\\)`, 'g'), `url(#${prefix}-$1)`);

const paras = (body) => body.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('');
const list = (tag, items) => `<${tag}>${items.map((it) => `<li><strong>${esc(it.label)}</strong>${it.detail ? ` <span>${esc(it.detail)}</span>` : ''}</li>`).join('')}</${tag}>`;
const bullets = (cls, xs) => (xs?.length ? `<ul class="${cls}">${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');

function panel(p, i) {
  const title = p.title ? `<h2>${esc(p.title)}</h2>` : '';
  switch (p.kind) {
    case 'text': return `<article class="panel">${title}${paras(p.body)}</article>`;
    case 'reasons': return `<article class="panel">${title}${list('ul', p.items)}</article>`;
    case 'steps': return `<article class="panel">${title}${list('ol', p.items)}</article>`;
    case 'callout': return `<article class="panel callout t-${p.tone || 'info'}">${title}${paras(p.body)}</article>`;
    case 'table':
      return `<article class="panel wide">${title}<div class="scroll"><table><thead><tr>${p.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>`
        + `<tbody>${p.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></article>`;
    case 'comparison':
      return `<article class="panel wide">${title}<div class="options">${p.options.map((o) => `<section class="option"><h3>${esc(o.name)}</h3>`
        + bullets('pros', o.pros) + bullets('cons', o.cons) + (o.verdict ? `<p class="verdict">${esc(o.verdict)}</p>` : '') + '</section>').join('')}</div></article>`;
    case 'diagram':
      return `<article class="panel wide">${title}<div class="canvas">${scopeIds(renderDiagram(p.diagram_type, p.diagram), `d${i}`)}</div></article>`;
    default: throw new Error(`unknown panel kind ${p.kind}`);
  }
}

export function renderExplainer(ir) {
  return `<section class="conclusion" aria-label="Conclusion"><div class="eyebrow">Conclusion</div><p>${esc(ir.conclusion)}</p></section>`
    + `<div class="panels">${ir.panels.map(panel).join('')}</div>`;
}

export const EXPLAINER_CSS = `.ex-page header,.ex-page main{max-width:1100px}
.conclusion{background:var(--panel);border:1px solid var(--border);border-left:4px solid #4493f8;border-radius:10px;padding:16px 20px;margin-bottom:16px}
.conclusion .eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.conclusion p{margin:4px 0 0;font-size:19px;line-height:1.45;font-weight:500}
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px 18px;min-width:0}
.panel.wide{grid-column:1/-1}.panel h2{margin:0 0 8px;font-size:16px}.panel p{margin:0 0 8px}.panel p:last-child{margin-bottom:0}
.panel ul,.panel ol{margin:0;padding-left:20px}.panel li{margin:4px 0}.panel li span{color:var(--muted)}
.panel .canvas{border:0;padding:0}
.callout.t-info{border-left:4px solid #4493f8}.callout.t-success{border-left:4px solid #10b981}.callout.t-warning{border-left:4px solid #d97706}.callout.t-risk{border-left:4px solid #ef4444}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);vertical-align:top}th{color:var(--muted);font-weight:600}
.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
.option{border:1px solid var(--border);border-radius:8px;padding:10px 14px}.option h3{margin:0 0 6px;font-size:15px}
.option ul{list-style:none;padding:0;margin:0 0 6px}.option li{padding-left:20px;position:relative}
.pros li::before{content:"+";position:absolute;left:4px;color:#10b981;font-weight:700}.cons li::before{content:"\\2212";position:absolute;left:4px;color:#ef4444;font-weight:700}
.verdict{font-weight:600;margin:6px 0 0}`;
