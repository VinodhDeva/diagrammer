// Standalone HTML shell around a rendered SVG, and the artifact check that verifies it.
import crypto from 'node:crypto';
import { renderGraph } from './graph.mjs';
import { renderSequence } from './sequence.mjs';
import { esc } from './svg.mjs';
import { renderTable } from './tables.mjs';
import { TYPES } from './validate.mjs';

export const render = (type, ir) =>
  type === 'sequence' ? renderSequence(ir) : type === 'erd' || type === 'class' ? renderTable(type, ir) : renderGraph(type, ir);

export const VERSION = '0.3.0';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Keeps "</script>" and HTML comments inside labels from ending the JSON block.
const safeJson = (s) => s.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const PAGE_CSS = `:root{--bg:#f6f8fa;--panel:#ffffff;--fg:#1f2328;--muted:#59636e;--border:#d0d7de;--btn:#f6f8fa;--btn-hover:#eaeef2}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#010409;--panel:#0d1117;--fg:#e6edf3;--muted:#9198a1;--border:#3d444d;--btn:#21262d;--btn-hover:#30363d}}
:root[data-theme="dark"]{--bg:#010409;--panel:#0d1117;--fg:#e6edf3;--muted:#9198a1;--border:#3d444d;--btn:#21262d;--btn-hover:#30363d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;justify-content:space-between;padding:20px 16px 12px;max-width:1400px;margin:0 auto}
h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:var(--muted);max-width:70ch}
.tools{display:flex;gap:8px}button{font:inherit;font-size:13px;color:var(--fg);background:var(--btn);border:1px solid var(--border);border-radius:6px;padding:5px 12px;cursor:pointer}
button:hover{background:var(--btn-hover)}button:focus-visible{outline:2px solid #4493f8;outline-offset:2px}
main{max-width:1400px;margin:0 auto;padding:0 16px 24px}.canvas{background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:auto;padding:8px}
.canvas svg{display:block;width:auto;height:auto;max-width:100%;max-height:calc(100vh - 150px);margin:0 auto}`;

const PAGE_JS = `(function(){
var root=document.documentElement,svg=document.querySelector('svg.dg');
function apply(t){root.setAttribute('data-theme',t);svg.classList.toggle('dark',t==='dark');}
var saved=null;try{saved=localStorage.getItem('diagrammer-theme');}catch(e){}
apply(saved||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
document.getElementById('theme').onclick=function(){var t=root.getAttribute('data-theme')==='dark'?'light':'dark';apply(t);try{localStorage.setItem('diagrammer-theme',t);}catch(e){}};
var name=(document.title||'diagram').replace(/[^a-z0-9]+/gi,'-').toLowerCase();
function save(blob,ext){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name+'.'+ext;a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
function svgText(){return new XMLSerializer().serializeToString(svg);}
document.getElementById('svg').onclick=function(){save(new Blob([svgText()],{type:'image/svg+xml'}),'svg');};
document.getElementById('png').onclick=function(){var img=new Image(),w=svg.viewBox.baseVal.width,h=svg.viewBox.baseVal.height;
img.onload=function(){var c=document.createElement('canvas');c.width=w*2;c.height=h*2;var x=c.getContext('2d');x.scale(2,2);x.drawImage(img,0,0,w,h);c.toBlob(function(b){save(b,'png');});};
img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgText());};
})();`;

export function buildHtml(type, ir, svg) {
  const source = JSON.stringify(ir);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="diagrammer ${VERSION}">
<meta name="diagram-type" content="${type}">
<meta name="diagram-sha256" content="${sha256(source)}">
<title>${esc(ir.meta.title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header><div><h1>${esc(ir.meta.title)}</h1>${ir.meta.description ? `<p>${esc(ir.meta.description)}</p>` : ''}</div>
<div class="tools"><button id="theme" type="button" aria-label="Toggle dark or light theme">Theme</button><button id="svg" type="button">SVG</button><button id="png" type="button">PNG</button></div></header>
<main><div class="canvas">${svg}</div></main>
<script type="application/json" id="diagram-source">${safeJson(source)}</script>
<script>${PAGE_JS}</script>
</body>
</html>
`;
}

// Static artifact checks: provenance matches the embedded source, one diagram, no external loads.
export function checkHtml(html) {
  const d = [];
  const err = (code, message) => d.push({ severity: 'error', code, path: 'html', message });
  const meta = (name) => (html.match(new RegExp(`<meta name="${name}" content="([^"]*)">`)) || [])[1];
  const type = meta('diagram-type');
  if (!TYPES.includes(type)) err('type', `diagram-type meta is missing or unknown (${type})`);
  const src = (html.match(/<script type="application\/json" id="diagram-source">([\s\S]*?)<\/script>/) || [])[1];
  let ir = null;
  if (src == null) err('source', 'embedded diagram source is missing');
  else {
    try { ir = JSON.parse(src); } catch { err('source', 'embedded diagram source is not valid JSON'); }
    if (ir && sha256(JSON.stringify(ir)) !== meta('diagram-sha256')) err('provenance', 'diagram-sha256 does not match the embedded source');
  }
  const svgs = html.match(/<svg[\s>]/g) || [];
  if (svgs.length !== 1) err('svg', `expected exactly 1 <svg>, found ${svgs.length}`);
  // The drawing must be exactly what the embedded source renders to.
  else if (ir && TYPES.includes(type)) {
    let expected = null;
    try { expected = render(type, ir); } catch (e) { err('svg-mismatch', `embedded source no longer renders: ${e.message}`); }
    const actual = (html.match(/<svg[\s\S]*<\/svg>/) || [])[0];
    if (expected != null && actual !== expected) err('svg-mismatch', 'the SVG does not match a render of the embedded source');
  }
  if (/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html) || /@import|url\(\s*["']?https?:/i.test(html)) err('external', 'artifact references an external resource');
  if (html.length > 8 * 1024 * 1024) err('size', 'artifact is larger than 8 MB');
  return { ok: !d.length, type, sha256: sha256(html), diagnostics: d };
}
