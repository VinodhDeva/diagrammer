// Smoke test: drives server.mjs over stdio like an MCP client.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'diagrammer-'));
const srv = spawn(process.execPath, [new URL('./server.mjs', import.meta.url).pathname], { env: { ...process.env, DIAGRAM_WORKDIR: work }, stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
readline.createInterface({ input: srv.stdout }).on('line', (l) => { const m = JSON.parse(l); pending.get(m.id)?.(m); });
let id = 0;
const rpc = (method, params) => new Promise((r) => { pending.set(++id, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
const example = (f) => JSON.parse(fs.readFileSync(new URL(`./examples/${f}`, import.meta.url), 'utf8'));

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
assert.equal(init.result.serverInfo.name, 'diagrammer');
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
assert.equal((await rpc('tools/list')).result.tools.length, 5);
assert.equal((await rpc('nope')).error.code, -32601);

// Guide routing.
const pick = async (q) => JSON.parse((await call('diagram_guide', { scenario: q })).content[0].text).recommendation;
assert.equal(await pick('who calls whom in the login api request'), 'sequence');
assert.equal(await pick('approval process steps for refunds'), 'workflow');
assert.equal(await pick('services and infrastructure of our system'), 'architecture');
assert.equal(await pick('etl lineage into the warehouse'), 'dataflow');
assert.equal(await pick('order status state machine'), 'lifecycle');
assert.equal(await pick('database schema with foreign key columns'), 'erd');
assert.equal(await pick('uml classes and inheritance'), 'class');
assert.equal(await pick('repository folder hierarchy'), 'tree');
assert.match((await call('diagram_authoring_context', { type: 'sequence' })).content[0].text, /===== schema =====/);

// Every example passes all gates with no warnings.
const outputs = [];
for (const file of fs.readdirSync(new URL('./examples/', import.meta.url)).sort()) {
  const type = file.split('.').at(-2);
  const res = await call('diagram_finalize', { type, candidate: example(file) });
  const receipt = JSON.parse(res.content[0].text.slice(res.content[0].text.indexOf('{')));
  assert.equal(res.isError, false, res.content[0].text);
  assert.deepEqual(receipt.diagnostics, [], `${type} warnings: ${JSON.stringify(receipt.diagnostics)}`);
  assert.ok(fs.existsSync(receipt.artifact.path));
  outputs.push(receipt.artifact.path);
}

// Validation failures carry paths.
const bad = example('photo-sharing.architecture.json');
bad.edges.push({ from: 'api', to: 'ghost' });
bad.nodes[0].shape = 'x';
const v = JSON.parse((await call('diagram_validate', { type: 'architecture', candidate: bad })).content[0].text);
assert.equal(v.ok, false);
assert.ok(v.diagnostics.some((d) => d.path === '$.nodes[0].shape'));
delete bad.nodes[0].shape;
const v2 = JSON.parse((await call('diagram_validate', { type: 'architecture', candidate: bad })).content[0].text);
assert.ok(v2.diagnostics.some((d) => d.code === 'unknown-ref' && d.path === '$.edges[9].to'));
const seq = example('profile-lookup.sequence.json');
seq.fragments.push({ kind: 'loop', start: 2, end: 5 });
const v3 = JSON.parse((await call('diagram_validate', { type: 'sequence', candidate: seq })).content[0].text);
assert.ok(v3.diagnostics.some((d) => d.code === 'fragment-overlap'));
assert.equal((await call('diagram_finalize', { type: 'sequence', candidate: seq })).isError, true);

// Type-specific rules.
const codesFor = async (type, candidate) => JSON.parse((await call('diagram_validate', { type, candidate })).content[0].text).diagnostics.map((d) => d.code);
const erd = example('library.erd.json');
delete erd.entities[1].attributes[1].references;
erd.entities[3].attributes[2].references = 'members.nope';
assert.ok((await codesFor('erd', erd)).includes('fk-references'));
assert.ok((await codesFor('erd', erd)).includes('unknown-ref'));
const tree = example('diagrammer-repo.tree.json');
delete tree.nodes[2].parent;
assert.ok((await codesFor('tree', tree)).includes('tree-root'));
tree.nodes[2].parent = 'validate';
assert.ok((await codesFor('tree', tree)).includes('tree-cycle'));
const cls = example('notifications.class.json');
cls.relations.push({ from: 'base', to: 'email', kind: 'inheritance' });
assert.ok((await codesFor('class', cls)).includes('inheritance-cycle'));
const life = example('order-status.lifecycle.json');
life.states.push({ id: 'limbo', label: 'Limbo' });
life.transitions.push({ from: 'limbo', to: 'paid' });
assert.ok((await codesFor('lifecycle', life)).includes('unreachable'));
const flow = example('clickstream.dataflow.json');
flow.flows.push({ from: 'dash', to: 'web' });
assert.deepEqual((await codesFor('dataflow', flow)).sort(), ['sink-outgoing', 'source-incoming']);

// Hostile labels are escaped in both the SVG and the embedded source.
const evil = { meta: { title: 'x</script><script>alert(1)</script>' }, nodes: [{ id: 'a', label: '<img src=x onerror=alert(1)>' }] };
const ev = await call('diagram_finalize', { type: 'architecture', candidate: evil });
assert.equal(ev.isError, false, ev.content[0].text);
const evHtml = fs.readFileSync(ev.content[0].text.match(/PASS: (.+)/)[1], 'utf8');
assert.ok(!evHtml.includes('<script>alert') && !evHtml.includes('<img src=x'));

// Tampering with the drawing or the embedded source fails the check; the original passes.
const photo = outputs.find((p) => p.includes('photo-sharing'));
assert.equal((await call('diagram_check', { html: photo })).isError, false);
const original = fs.readFileSync(photo, 'utf8');
const tampered = path.join(work, 'tampered.html');
const codes = async (html) => { fs.writeFileSync(tampered, html); return JSON.parse((await call('diagram_check', { html: tampered })).content[0].text).diagnostics.map((d) => d.code); };
assert.ok((await codes(original.replace('>Photo API<', '>Photo APX<'))).includes('svg-mismatch'));
assert.ok((await codes(original.replace('"label":"Photo API"', '"label":"Photo APX"'))).includes('provenance'));

console.log('ok\n' + outputs.join('\n'));
srv.kill();
