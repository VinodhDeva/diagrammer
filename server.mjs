#!/usr/bin/env node
// Diagrammer MCP server: validated architecture, workflow and sequence diagrams as standalone HTML, over stdio.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { guide, TIPS } from './lib/guide.mjs';
import { buildHtml, checkHtml, VERSION } from './lib/html.mjs';
import { schemaPath, TYPES, validate } from './lib/validate.mjs';

const WORKDIR = process.env.DIAGRAM_WORKDIR || process.cwd();
const EXAMPLES = {
  architecture: 'examples/photo-sharing.architecture.json',
  workflow: 'examples/expense-approval.workflow.json',
  sequence: 'examples/profile-lookup.sequence.json',
  dataflow: 'examples/clickstream.dataflow.json',
  lifecycle: 'examples/order-status.lifecycle.json',
  erd: 'examples/library.erd.json',
  class: 'examples/notifications.class.json',
  tree: 'examples/diagrammer-repo.tree.json',
  timeline: 'examples/checkout-outage.timeline.json',
  waterfall: 'examples/search-request.waterfall.json',
  explainer: 'examples/queue-choice.explainer.json',
};

const INSTRUCTIONS = `Diagrammer renders validated diagrams as standalone HTML (dark/light theme, SVG/PNG export): architecture, workflow, sequence, dataflow, lifecycle, erd, class, tree, timeline and waterfall. It also renders explainer pages: a one-page answer with the conclusion first, supporting panels and embedded diagrams.
Use explainer only when the user asks for the answer as a page (a page, one page, an explainer, something to share); otherwise answer in text or draw the requested diagram.
Workflow:
1. Pick the type. If unsure, call diagram_guide with the scenario.
2. Call diagram_authoring_context for that type and read the tips, schema and example. Examples teach shape, not facts: use fresh ids and wording.
3. Write the complete candidate and call diagram_finalize once. It validates, renders and checks the artifact. No separate validation is needed first.
4. If it fails, fix the reported paths and call diagram_finalize again with the returned work_dir. Read warnings too; they usually point at a broken flow.
For a real codebase, trace the source first and draw only what the code shows.
Mermaid input: author fresh JSON from its meaning (flowchart -> workflow or architecture, sequenceDiagram -> sequence, stateDiagram -> lifecycle, erDiagram -> erd, classDiagram -> class).
Reply with a Markdown link to the HTML (absolute path) and one line on how to read it.`;

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const typeProp = str('Diagram type', { enum: TYPES });
const candidateProps = {
  type: typeProp,
  candidate: { type: 'object', description: 'Candidate diagram JSON (see diagram_authoring_context)' },
  candidate_path: str('Path to a candidate JSON file, instead of candidate'),
};

const TOOLS = [
  { name: 'diagram_guide', description: 'Recommend a diagram type for a scenario or question.', inputSchema: { type: 'object', properties: { scenario: str('Scenario or question') } } },
  { name: 'diagram_authoring_context', description: 'Return authoring tips, the JSON schema and an example for a type. Read before writing a candidate.', inputSchema: { type: 'object', properties: { type: typeProp }, required: ['type'] } },
  { name: 'diagram_finalize', description: 'Validate, render and check a candidate, writing a standalone HTML diagram and a receipt. Main delivery tool.', inputSchema: { type: 'object', properties: { ...candidateProps, work_dir: str('Artifact folder to reuse for repairs (returned by a previous call)'), output: str('Output HTML path; defaults to <work_dir>/<slug>.html') }, required: ['type'] } },
  { name: 'diagram_validate', description: 'Validate a candidate without writing anything (diagnosis only).', inputSchema: { type: 'object', properties: candidateProps, required: ['type'] } },
  { name: 'diagram_check', description: 'Check a rendered HTML artifact: provenance, single diagram, no external resources.', inputSchema: { type: 'object', properties: { html: str('Rendered HTML path') }, required: ['html'] } },
];

const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });
const slugify = (s) => String(s || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'diagram';
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

function loadCandidate(a) {
  if (!TYPES.includes(a.type)) throw new Error(`type must be one of: ${TYPES.join(', ')}`);
  if (a.candidate_path) return JSON.parse(fs.readFileSync(path.resolve(WORKDIR, a.candidate_path), 'utf8'));
  if (a.candidate == null) throw new Error('candidate or candidate_path is required');
  return typeof a.candidate === 'string' ? JSON.parse(a.candidate) : a.candidate;
}

const writeAtomic = (file, data) => { fs.writeFileSync(`${file}.tmp`, data); fs.renameSync(`${file}.tmp`, file); };

function finalize(a) {
  const ir = loadCandidate(a);
  const slug = slugify(ir?.meta?.title);
  const fromFile = a.candidate_path && path.resolve(WORKDIR, a.candidate_path);
  const dir = a.work_dir ? path.resolve(WORKDIR, a.work_dir) : fromFile ? path.dirname(fromFile) : path.join(WORKDIR, '.diagrams', `${a.type}-${slug}-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  const candidate = fromFile || path.join(dir, 'candidate.json');
  if (!fromFile) fs.writeFileSync(candidate, JSON.stringify(ir, null, 2));
  const existing = fs.readdirSync(dir).find((f) => f.endsWith('.html'));
  const output = a.output ? path.resolve(WORKDIR, a.output) : path.join(dir, existing || `${slug}.html`);

  const diagnostics = validate(a.type, ir);
  const receipt = { ok: false, generator: `diagrammer ${VERSION}`, type: a.type, work_dir: dir, candidate, gates: { validate: 'pass', render: 'skipped', check: 'skipped' }, artifact: null, diagnostics };
  const receiptPath = output.replace(/\.html?$/i, '') + '.receipt.json';
  if (diagnostics.some((x) => x.severity === 'error')) receipt.gates.validate = 'fail';
  else {
    try {
      const html = buildHtml(a.type, ir);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      writeAtomic(output, html);
      receipt.gates.render = 'pass';
      const chk = checkHtml(html);
      receipt.gates.check = chk.ok ? 'pass' : 'fail';
      receipt.diagnostics.push(...chk.diagnostics);
      receipt.artifact = { path: output, sha256: chk.sha256, bytes: Buffer.byteLength(html) };
    } catch (e) {
      receipt.gates.render = 'fail';
      receipt.diagnostics.push({ severity: 'error', code: 'render', path: '$', message: String(e.message || e) });
    }
  }
  receipt.ok = Object.values(receipt.gates).every((g) => g === 'pass');
  writeAtomic(receiptPath, JSON.stringify(receipt, null, 2));
  const summary = receipt.ok ? `PASS: ${output}` : `FAIL at ${Object.entries(receipt.gates).find(([, g]) => g === 'fail')?.[0]}`;
  return text(`${summary}\nreceipt: ${receiptPath}\n${JSON.stringify(receipt, null, 2)}`, !receipt.ok);
}

const HANDLERS = {
  diagram_guide: (a) => text(JSON.stringify(guide(a.scenario || ''), null, 2)),
  diagram_authoring_context: (a) => {
    if (!TYPES.includes(a.type)) throw new Error(`type must be one of: ${TYPES.join(', ')}`);
    const example = fs.readFileSync(new URL(EXAMPLES[a.type], import.meta.url), 'utf8');
    return text(`===== tips =====\n${TIPS[a.type]}\n\n===== schema =====\n${fs.readFileSync(schemaPath(a.type), 'utf8')}\n===== example (${EXAMPLES[a.type]}) =====\n${example}`);
  },
  diagram_finalize: finalize,
  diagram_validate: (a) => {
    const d = validate(a.type, loadCandidate(a));
    const ok = !d.some((x) => x.severity === 'error');
    return text(JSON.stringify({ ok, diagnostics: d }, null, 2), !ok);
  },
  diagram_check: (a) => {
    const r = checkHtml(fs.readFileSync(path.resolve(WORKDIR, a.html), 'utf8'));
    return text(JSON.stringify(r, null, 2), !r.ok);
  },
};

async function handle(msg) {
  switch (msg.method) {
    case 'initialize':
      return { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'diagrammer', version: VERSION }, instructions: INSTRUCTIONS };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const fn = HANDLERS[msg.params?.name];
      if (!fn) throw Object.assign(new Error(`Unknown tool ${msg.params?.name}`), { code: -32602 });
      try {
        return await fn(msg.params.arguments || {});
      } catch (e) {
        return text(String(e.message || e), true);
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 });
  }
}

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (msg.id === undefined) return; // notification
  try { send({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) }); }
  catch (e) { send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } }); }
});
