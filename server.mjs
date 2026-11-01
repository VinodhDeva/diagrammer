#!/usr/bin/env node
// Diagrammer MCP server: exposes a diagram-rendering workflow as MCP tools over stdio.
// REA analysis showed the engine CLI is a self-contained dispatcher, so every tool
// shells out to it instead of re-implementing the renderers and quality gates.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const ENGINE_HOME = process.env.DIAGRAM_ENGINE_HOME || path.join(os.homedir(), '.claude/skills/archify');
const CLI = path.join(ENGINE_HOME, 'bin/archify.mjs');
const WORKDIR = process.env.DIAGRAM_WORKDIR || process.cwd();

const TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd', 'tree', 'class', 'timeline', 'waterfall', 'explainer'];
// Type router from the engine docs: example files per type.
const EXAMPLES = {
  architecture: ['examples/web-app.architecture.json', 'examples/production-deployment.architecture.json'],
  workflow: ['examples/agent-tool-call.workflow.json'],
  sequence: ['examples/cache-miss-request.sequence.json'],
  dataflow: ['examples/product-analytics.dataflow.json'],
  lifecycle: ['examples/deployment-release.lifecycle.json'],
  erd: ['examples/orders.erd.json'],
  tree: ['examples/payment-platform.tree.json'],
  class: ['examples/payments.class.json'],
  timeline: ['examples/payment-incident.timeline.json'],
  waterfall: ['examples/checkout-request.waterfall.json'],
  explainer: ['examples/delivery.explainer.json'],
};

const INSTRUCTIONS = `Diagrammer renders validated diagrams (architecture, workflow, sequence, dataflow, lifecycle, erd, tree, class, timeline, waterfall) and one-page explainers as standalone HTML.
Workflow:
1. Pick the type. If ambiguous, call diagram_guide with the scenario.
2. Call diagram_authoring_context for that type and read the defaults, schema(s) and example. Examples teach shape, not facts: use fresh IDs and wording. Set meta.quality_profile to "showcase" unless dense "standard" is wanted.
3. Write the complete candidate and call diagram_finalize once. It runs validate, deliver, strict check and browser-check. Do not pre-validate.
4. Non-zero exit is failure: read the summary, repair the failed gate in the connected neighborhood, and rerun diagram_finalize with the same work_dir and a new out_dir (review-2, review-3...). Stop after a few repair rounds.
5. If the receipt has update.noticeRequired true, tell the user once; never install updates unasked.
For a real codebase, trace source evidence first and pass repo_root. Mermaid input: author fresh diagram JSON from its meaning (flowchart->workflow, sequenceDiagram->sequence, stateDiagram->lifecycle, erDiagram->erd, classDiagram->class).
Reply with a Markdown link to the HTML (absolute path) and one line on how to read it. Claim only automated checks unless captures were inspected.`;

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const typeProp = str('Diagram type', { enum: TYPES });
const quality = str('Quality profile; must match meta.quality_profile', { enum: ['showcase', 'standard'] });
const candidateProps = {
  type: typeProp,
  candidate: { description: 'Candidate IR: a JSON object for diagrams, or explainer Markdown text for an explainer' },
  candidate_path: str('Path to an existing candidate file (instead of candidate)'),
  work_dir: str('Artifact folder to reuse for repairs (returned by a previous call)'),
  output: str('Output HTML path; defaults to <work_dir>/<slug>.html'),
  quality,
  repo_root: str('Repository root for code-backed diagrams'),
};

const TOOLS = [
  { name: 'diagram_guide', description: 'Recommend a diagram type for a scenario or question.', inputSchema: { type: 'object', properties: { scenario: str('Scenario or question'), lang: str('Language', { enum: ['en', 'zh'] }) } } },
  { name: 'diagram_authoring_context', description: 'Return authoring defaults, schema(s) and example(s) for a type. Read before writing a candidate.', inputSchema: { type: 'object', properties: { type: typeProp }, required: ['type'] } },
  { name: 'diagram_finalize', description: 'Validate, render, check and browser-check a candidate in one gated run. Main delivery tool.', inputSchema: { type: 'object', properties: { ...candidateProps, out_dir: str('Folder for review evidence on repair runs, e.g. <work_dir>/review-2') }, required: ['type'] } },
  { name: 'diagram_validate', description: 'Validate a candidate without delivering (diagnosis only).', inputSchema: { type: 'object', properties: candidateProps, required: ['type'] } },
  { name: 'diagram_render', description: 'Render a candidate to HTML without quality gates.', inputSchema: { type: 'object', properties: candidateProps, required: ['type'] } },
  { name: 'diagram_check', description: 'Run strict artifact checks (or browser-check) on rendered HTML.', inputSchema: { type: 'object', properties: { html: str('Rendered HTML path'), browser: { type: 'boolean', description: 'Run real-browser check instead' } }, required: ['html'] } },
  { name: 'diagram_brands', description: 'Look up brand marks by name, alias, domain or category.', inputSchema: { type: 'object', properties: { query: str('Search term') } } },
  { name: 'diagram_doctor', description: 'Verify the diagram engine installation.', inputSchema: { type: 'object', properties: {} } },
];

function runCli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { cwd: WORKDIR, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      const text = [stdout.trim(), stderr.trim() && `stderr:\n${stderr.trim()}`, code && `exit code ${code}`].filter(Boolean).join('\n\n');
      resolve({ content: [{ type: 'text', text: text || '(no output)' }], isError: code !== 0 });
    });
  });
}

const slugify = (s) => String(s || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'diagram';
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

// Writes the candidate into .diagrams/<type>-<slug>-<ts>/ (engine folder convention) and returns paths.
function stageCandidate(a) {
  if (!TYPES.includes(a.type)) throw new Error(`type must be one of ${TYPES.join(', ')}`);
  if (a.candidate_path) {
    const input = path.resolve(WORKDIR, a.candidate_path);
    const dir = a.work_dir ? path.resolve(WORKDIR, a.work_dir) : path.dirname(input);
    return { input, dir, output: a.output ? path.resolve(WORKDIR, a.output) : path.join(dir, `${slugify(path.basename(input).split('.')[0])}.html`) };
  }
  if (a.candidate == null) throw new Error('candidate or candidate_path is required');
  let c = a.candidate;
  if (typeof c === 'string' && a.type !== 'explainer') c = JSON.parse(c);
  const isMd = typeof c === 'string';
  const slug = slugify(isMd ? (c.match(/^#\s+(.+)$/m) || [])[1] : c.meta?.title);
  const dir = a.work_dir ? path.resolve(WORKDIR, a.work_dir) : path.join(WORKDIR, '.diagrams', `${a.type}-${slug}-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).find((f) => f.endsWith('.html') && !f.includes('.finalize'));
  const output = a.output ? path.resolve(WORKDIR, a.output) : path.join(dir, existing || `${slug}.html`);
  if (!isMd) c = { ...c, meta: { ...c.meta, output: path.relative(WORKDIR, output) } };
  const input = path.join(dir, isMd ? 'candidate.md' : 'candidate.json');
  fs.writeFileSync(input, isMd ? c : JSON.stringify(c, null, 2));
  return { input, dir, output };
}

const common = (a) => [...(a.quality ? ['--quality', a.quality] : []), ...(a.repo_root ? ['--repo-root', path.resolve(WORKDIR, a.repo_root)] : [])];

async function withPaths(a, args) {
  const s = stageCandidate(a);
  const r = await runCli(args(s));
  r.content.unshift({ type: 'text', text: `work_dir: ${s.dir}\ncandidate: ${s.input}\noutput: ${s.output}` });
  return r;
}

const HANDLERS = {
  diagram_guide: (a) => runCli(['guide', ...(a.scenario ? [a.scenario] : []), '--json', ...(a.lang ? ['--lang', a.lang] : [])]),
  diagram_authoring_context: (a) => {
    if (!TYPES.includes(a.type)) throw new Error(`type must be one of ${TYPES.join(', ')}`);
    const files = [
      a.type === 'explainer' ? 'references/explainer-authoring.md' : 'references/authoring-defaults.md',
      ...(a.type === 'architecture' ? [] : ['schemas/common.schema.json']),
      `schemas/${a.type}.schema.json`,
      ...EXAMPLES[a.type],
    ];
    const text = files.map((f) => `===== ${f} =====\n${fs.readFileSync(path.join(ENGINE_HOME, f), 'utf8')}`).join('\n\n');
    return { content: [{ type: 'text', text }] };
  },
  diagram_finalize: (a) => withPaths(a, (s) => ['finalize', a.type, s.input, s.output, '--json', ...common(a), ...(a.out_dir ? ['--out-dir', path.resolve(WORKDIR, a.out_dir)] : [])]),
  diagram_validate: (a) => withPaths(a, (s) => ['validate', a.type, s.input, '--json', ...common(a)]),
  diagram_render: (a) => withPaths(a, (s) => ['render', a.type, s.input, s.output, ...common(a)]),
  diagram_check: (a) => runCli([a.browser ? 'browser-check' : 'check', path.resolve(WORKDIR, a.html), '--json']),
  diagram_brands: (a) => runCli(['brands', ...(a.query ? [a.query] : []), '--json']),
  diagram_doctor: () => runCli(['doctor']),
};

async function handle(msg) {
  switch (msg.method) {
    case 'initialize':
      return { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'diagrammer', version: '0.1.0' }, instructions: INSTRUCTIONS };
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
        return { content: [{ type: 'text', text: String(e.message || e) }], isError: true };
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
