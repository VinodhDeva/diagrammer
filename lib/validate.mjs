// Structural (JSON Schema subset) and semantic validation for diagram candidates.
import fs from 'node:fs';

export const TYPES = ['architecture', 'workflow', 'sequence'];
export const schemaPath = (type) => new URL(`../schemas/${type}.schema.json`, import.meta.url);
const schemas = Object.fromEntries(TYPES.map((t) => [t, JSON.parse(fs.readFileSync(schemaPath(t), 'utf8'))]));

const typeOk = (t, v) =>
  t === 'array' ? Array.isArray(v)
  : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v)
  : t === 'integer' ? Number.isInteger(v)
  : typeof v === t;

// Supports: type, enum, required, properties, additionalProperties:false, items, minItems, minLength, maxLength, pattern, minimum.
function checkSchema(s, v, path, out) {
  const err = (message) => out.push({ severity: 'error', code: 'schema', path, message });
  if (s.type && !typeOk(s.type, v)) return err(`expected ${s.type}`);
  if (s.enum && !s.enum.includes(v)) err(`must be one of: ${s.enum.join(', ')}`);
  if (typeof v === 'string') {
    if (s.minLength != null && v.length < s.minLength) err(`must have at least ${s.minLength} characters`);
    if (s.maxLength != null && v.length > s.maxLength) err(`must have at most ${s.maxLength} characters`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) err(`must match ${s.pattern}`);
  }
  if (typeof v === 'number' && s.minimum != null && v < s.minimum) err(`must be >= ${s.minimum}`);
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) err(`must have at least ${s.minItems} item(s)`);
    if (s.items) v.forEach((x, i) => checkSchema(s.items, x, `${path}[${i}]`, out));
  } else if (typeOk('object', v)) {
    for (const k of s.required || []) if (!(k in v)) err(`missing required field "${k}"`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties?.[k]) checkSchema(s.properties[k], x, `${path}.${k}`, out);
      else if (s.additionalProperties === false) out.push({ severity: 'error', code: 'schema', path: `${path}.${k}`, message: 'unknown field' });
    }
  }
}

function semanticGraph(ir, type, d) {
  const itemsKey = type === 'workflow' ? 'steps' : 'nodes';
  const linksKey = type === 'workflow' ? 'transitions' : 'edges';
  const items = ir[itemsKey], links = ir[linksKey] || [], groups = ir.groups || [];
  const ids = new Map();
  [...groups.map((g, i) => [g.id, `$.groups[${i}]`]), ...items.map((n, i) => [n.id, `$.${itemsKey}[${i}]`])].forEach(([id, p]) => {
    if (ids.has(id)) d.error(`${p}.id`, 'duplicate-id', `id "${id}" is already used at ${ids.get(id)}`);
    else ids.set(id, p);
  });
  const groupIds = new Set(groups.map((g) => g.id));
  const itemIds = new Set(items.map((n) => n.id));
  groups.forEach((g, i) => {
    if (g.parent && !groupIds.has(g.parent)) d.error(`$.groups[${i}].parent`, 'unknown-ref', `no group "${g.parent}"`);
  });
  // Reject group nesting cycles; dagre would loop on them.
  const parentOf = new Map(groups.map((g) => [g.id, g.parent]));
  for (const g of groups) {
    const seen = new Set([g.id]);
    for (let p = parentOf.get(g.id); p; p = parentOf.get(p)) {
      if (seen.has(p)) { d.error('$.groups', 'group-cycle', `group "${g.id}" is inside itself`); break; }
      seen.add(p);
    }
  }
  items.forEach((n, i) => {
    if (n.group && !groupIds.has(n.group)) d.error(`$.${itemsKey}[${i}].group`, 'unknown-ref', `no group "${n.group}"`);
  });
  const seenLinks = new Set();
  const out = new Map(), inc = new Map();
  links.forEach((e, i) => {
    for (const end of ['from', 'to']) {
      if (!itemIds.has(e[end])) d.error(`$.${linksKey}[${i}].${end}`, 'unknown-ref', `no ${itemsKey.slice(0, -1)} "${e[end]}"${groupIds.has(e[end]) ? ' (links must connect items, not groups)' : ''}`);
    }
    const key = `${e.from}>${e.to}>${e.label || ''}`;
    if (seenLinks.has(key)) d.warn(`$.${linksKey}[${i}]`, 'duplicate-link', `duplicate link ${e.from} -> ${e.to}`);
    seenLinks.add(key);
    out.set(e.from, (out.get(e.from) || 0) + 1);
    inc.set(e.to, (inc.get(e.to) || 0) + 1);
  });
  groups.forEach((g, i) => {
    if (!items.some((n) => n.group === g.id) && !groups.some((c) => c.parent === g.id)) d.warn(`$.groups[${i}]`, 'empty-group', `group "${g.id}" contains nothing and will not be drawn`);
  });
  if (links.length) items.forEach((n, i) => {
    if (!out.get(n.id) && !inc.get(n.id)) d.warn(`$.${itemsKey}[${i}]`, 'isolated', `"${n.id}" has no ${linksKey}`);
  });
  if (items.length > 60) d.warn(`$.${itemsKey}`, 'too-dense', `${items.length} items; consider splitting the diagram`);

  if (type === 'workflow') {
    const starts = items.filter((n) => n.kind === 'start');
    if (!starts.length) d.warn('$.steps', 'no-start', 'no step of kind "start"');
    if (!items.some((n) => n.kind === 'end')) d.warn('$.steps', 'no-end', 'no step of kind "end"');
    items.forEach((n, i) => {
      if (n.kind === 'decision' && (out.get(n.id) || 0) < 2) d.warn(`$.steps[${i}]`, 'decision-branches', `decision "${n.id}" has fewer than 2 outgoing transitions`);
      if (n.kind === 'end' && out.get(n.id)) d.warn(`$.steps[${i}]`, 'end-outgoing', `end step "${n.id}" has outgoing transitions`);
    });
    if (starts.length) {
      const adj = new Map();
      links.forEach((e) => adj.set(e.from, [...(adj.get(e.from) || []), e.to]));
      const reach = new Set(starts.map((s) => s.id));
      const stack = [...reach];
      while (stack.length) for (const t of adj.get(stack.pop()) || []) if (!reach.has(t)) { reach.add(t); stack.push(t); }
      items.forEach((n, i) => { if (!reach.has(n.id)) d.warn(`$.steps[${i}]`, 'unreachable', `"${n.id}" is not reachable from a start step`); });
    }
  }
}

function semanticSequence(ir, d) {
  const ids = new Set();
  ir.participants.forEach((p, i) => {
    if (ids.has(p.id)) d.error(`$.participants[${i}].id`, 'duplicate-id', `id "${p.id}" is already used`);
    ids.add(p.id);
  });
  ir.messages.forEach((m, i) => {
    for (const end of ['from', 'to']) if (!ids.has(m[end])) d.error(`$.messages[${i}].${end}`, 'unknown-ref', `no participant "${m[end]}"`);
    if (m.kind === 'return' && m.from === m.to) d.warn(`$.messages[${i}]`, 'self-return', 'a return to the same participant');
  });
  const frags = ir.fragments || [];
  frags.forEach((f, i) => {
    if (f.end < f.start) d.error(`$.fragments[${i}]`, 'fragment-range', 'end is before start');
    if (f.end >= ir.messages.length) d.error(`$.fragments[${i}].end`, 'fragment-range', `there are only ${ir.messages.length} messages`);
    frags.forEach((g, j) => {
      if (j <= i) return;
      const partial = f.start < g.start ? g.start <= f.end && f.end < g.end : g.start < f.start && f.start <= g.end && g.end < f.end;
      if (partial) d.error(`$.fragments[${j}]`, 'fragment-overlap', `fragment ${j} partly overlaps fragment ${i}; fragments must nest`);
    });
  });
}

export function validate(type, ir) {
  if (!TYPES.includes(type)) return [{ severity: 'error', code: 'type', path: '$', message: `type must be one of: ${TYPES.join(', ')}` }];
  const out = [];
  checkSchema(schemas[type], ir, '$', out);
  if (out.length) return out; // semantic checks assume a well-formed shape
  const d = {
    error: (path, code, message) => out.push({ severity: 'error', code, path, message }),
    warn: (path, code, message) => out.push({ severity: 'warning', code, path, message }),
  };
  if (type === 'sequence') semanticSequence(ir, d);
  else semanticGraph(ir, type, d);
  return out;
}
