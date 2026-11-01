// Standalone HTML shell around a rendered diagram or explainer, and the artifact check that verifies it.
import crypto from 'node:crypto';
import { EXPLAINER_CSS, renderExplainer } from './explainer.mjs';
import { renderDiagram } from './render.mjs';
import { esc } from './svg.mjs';
import { TYPES } from './validate.mjs';

export const VERSION = '0.4.0';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Keeps "</script>" and HTML comments inside labels from ending the JSON block.
const safeJson = (s) => s.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Everything inside <main>; the check re-renders this from the embedded source.
export const renderBody = (type, ir) => (type === 'explainer' ? renderExplainer(ir) : `<div class="canvas">${renderDiagram(type, ir)}</div>`);

const PAGE_CSS = `:root{--bg:#f6f8fa;--panel:#ffffff;--fg:#1f2328;--muted:#59636e;--border:#d0d7de;--btn:#f6f8fa;--btn-hover:#eaeef2}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#010409;--panel:#0d1117;--fg:#e6edf3;--muted:#9198a1;--border:#3d444d;--btn:#21262d;--btn-hover:#30363d}}
:root[data-theme="dark"]{--bg:#010409;--panel:#0d1117;--fg:#e6edf3;--muted:#9198a1;--border:#3d444d;--btn:#21262d;--btn-hover:#30363d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;justify-content:space-between;padding:20px 16px 12px;max-width:1400px;margin:0 auto}
h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:var(--muted);max-width:70ch}
.tools{display:flex;gap:8px}button{font:inherit;font-size:13px;color:var(--fg);background:var(--btn);border:1px solid var(--border);border-radius:6px;padding:5px 12px;cursor:pointer}
button:hover{background:var(--btn-hover)}button:focus-visible{outline:2px solid #4493f8;outline-offset:2px}
main{max-width:1400px;margin:0 auto;padding:0 16px 24px}.canvas{background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:auto;padding:8px}
.canvas svg{display:block;width:auto;height:auto;max-width:100%;max-height:calc(100vh - 150px);margin:0 auto}
${EXPLAINER_CSS}`;

const PAGE_JS = `(function(){
var root=document.documentElement,svgs=document.querySelectorAll('svg.dg');
function apply(t){root.setAttribute('data-theme',t);svgs.forEach(function(s){s.classList.toggle('dark',t==='dark');});}
var saved=null;try{saved=localStorage.getItem('diagrammer-theme');}catch(e){}
apply(saved||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
document.getElementById('theme').onclick=function(){var t=root.getAttribute('data-theme')==='dark'?'light':'dark';apply(t);try{localStorage.setItem('diagrammer-theme',t);}catch(e){}};
var svg=svgs[0],svgBtn=document.getElementById('svg'),pngBtn=document.getElementById('png');
if(!svg||!svgBtn)return;
var name=(document.title||'diagram').replace(/[^a-z0-9]+/gi,'-').toLowerCase();
function save(blob,ext){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name+'.'+ext;a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
function svgText(){return new XMLSerializer().serializeToString(svg);}
svgBtn.onclick=function(){save(new Blob([svgText()],{type:'image/svg+xml'}),'svg');};
pngBtn.onclick=function(){var img=new Image(),w=svg.viewBox.baseVal.width,h=svg.viewBox.baseVal.height;
img.onload=function(){var c=document.createElement('canvas');c.width=w*2;c.height=h*2;var x=c.getContext('2d');x.scale(2,2);x.drawImage(img,0,0,w,h);c.toBlob(function(b){save(b,'png');});};
img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgText());};
})();`;

export function buildHtml(type, ir) {
  const source = JSON.stringify(ir);
  const ex = type === 'explainer';
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
<body${ex ? ' class="ex-page"' : ''}>
<header><div><h1>${esc(ir.meta.title)}</h1>${ir.meta.description ? `<p>${esc(ir.meta.description)}</p>` : ''}</div>
<div class="tools"><button id="theme" type="button" aria-label="Toggle dark or light theme">Theme</button>${ex ? '' : '<button id="svg" type="button">SVG</button><button id="png" type="button">PNG</button>'}</div></header>
<main>${renderBody(type, ir)}</main>
<script type="application/json" id="diagram-source">${safeJson(source)}</script>
<script>${PAGE_JS}</script>
</body>
</html>
`;
}

// Static artifact checks: provenance matches the embedded source, the page body is exactly its render, no external loads.
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
  if (ir && TYPES.includes(type)) {
    let expected = null;
    try { expected = renderBody(type, ir); } catch (e) { err('body-mismatch', `embedded source no longer renders: ${e.message}`); }
    const actual = (html.match(/<main>([\s\S]*)<\/main>/) || [])[1];
    if (expected != null && actual !== expected) err('body-mismatch', 'the page body does not match a render of the embedded source');
    // Nothing drawn outside <main>.
    const count = (s) => (s.match(/<svg[\s>]/g) || []).length;
    if (expected != null && count(html) !== count(expected)) err('svg', `expected ${count(expected)} <svg>, found ${count(html)}`);
  }
  if (/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html) || /@import|url\(\s*["']?https?:/i.test(html)) err('external', 'artifact references an external resource');
  if (html.length > 8 * 1024 * 1024) err('size', 'artifact is larger than 8 MB');
  return { ok: !d.length, type, sha256: sha256(html), diagnostics: d };
}
