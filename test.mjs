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

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
assert.equal(init.result.serverInfo.name, 'diagrammer');
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
assert.equal((await rpc('tools/list')).result.tools.length, 8);
assert.equal((await rpc('nope')).error.code, -32601);

const ctx = await call('diagram_authoring_context', { type: 'sequence' });
assert.match(ctx.content[0].text, /schemas\/sequence\.schema\.json/);
assert.ok((await call('diagram_guide', { scenario: 'api request chain' })).content[0].text.includes('"sequence"'));
assert.ok((await call('diagram_validate', { type: 'workflow' })).isError, 'missing candidate must error');

const home = process.env.DIAGRAM_ENGINE_HOME || path.join(os.homedir(), '.claude/skills/archify');
const candidate = JSON.parse(fs.readFileSync(path.join(home, 'examples/cache-miss-request.sequence.json'), 'utf8'));
const fin = await call('diagram_finalize', { type: 'sequence', candidate, quality: candidate.meta?.quality_profile || 'showcase' });
const out = fin.content[0].text.match(/output: (.+)/)[1];
console.log(fin.content.map((c) => c.text).join('\n').slice(0, 1500));
assert.equal(fin.isError, false);
assert.ok(fs.existsSync(out));
console.log('ok', out);
srv.kill();
