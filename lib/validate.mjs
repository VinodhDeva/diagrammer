// Structural (JSON Schema subset) and semantic validation for diagram candidates.
import fs from 'node:fs';

// Item and link collections per graph-shaped type; sequence and tree have their own rules.
export const GRAPH = {
  architecture: { items: 'nodes', links: 'edges' },
  workflow: { items: 'steps', links: 'transitions' },
  dataflow: { items: 'nodes', links: 'flows' },
  lifecycle: { items: 'states', links: 'transitions' },
  erd: { items: 'entities', links: 'relationships' },
  class: { items: 'classes', links: 'relations' },
};
export const TYPES = [...Object.keys(GRAPH), 'sequence', 'tree', 'timeline', 'waterfall', 'explainer'];
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

// Ids reachable from the seeds by following from -> to links.
function reachable(seeds, links) {
  const adj = new Map();
  links.forEach((e) => adj.set(e.from, [...(adj.get(e.from) || []), e.to]));
  const seen = new Set(seeds);
  const stack = [...seen];
  while (stack.length) for (const t of adj.get(stack.pop()) || []) if (!seen.has(t)) { seen.add(t); stack.push(t); }
  return seen;
}

// First id found on a cycle in a single-successor map (parent pointers), or null.
function cycleIn(next) {
  for (const start of next.keys()) {
    const seen = new Set([start]);
    for (let p = next.get(start); p; p = next.get(p)) {
      if (seen.has(p)) return start;
      seen.add(p);
    }
  }
  return null;
}

function semanticGraph(ir, type, d) {
  const { items: itemsKey, links: linksKey } = GRAPH[type];
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
  const looped = cycleIn(new Map(groups.map((g) => [g.id, g.parent])));
  if (looped) d.error('$.groups', 'group-cycle', `group "${looped}" is inside itself`);
  items.forEach((n, i) => {
    if (n.group && !groupIds.has(n.group)) d.error(`$.${itemsKey}[${i}].group`, 'unknown-ref', `no group "${n.group}"`);
  });
  const seenLinks = new Set();
  const out = new Map(), inc = new Map();
  links.forEach((e, i) => {
    for (const end of ['from', 'to']) {
      if (!itemIds.has(e[end])) d.error(`$.${linksKey}[${i}].${end}`, 'unknown-ref', `no ${itemsKey.slice(0, -1)} "${e[end]}"${groupIds.has(e[end]) ? ' (links must connect items, not groups)' : ''}`);
    }
    const key = `${e.from}>${e.to}>${e.label || ''}>${e.kind || ''}`;
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
  RULES[type]?.({ ir, items, links, out, inc, itemIds, d });
}

const RULES = {
  workflow({ items, links, out, d }) {
    const starts = items.filter((n) => n.kind === 'start');
    if (!starts.length) d.warn('$.steps', 'no-start', 'no step of kind "start"');
    if (!items.some((n) => n.kind === 'end')) d.warn('$.steps', 'no-end', 'no step of kind "end"');
    items.forEach((n, i) => {
      if (n.kind === 'decision' && (out.get(n.id) || 0) < 2) d.warn(`$.steps[${i}]`, 'decision-branches', `decision "${n.id}" has fewer than 2 outgoing transitions`);
      if (n.kind === 'end' && out.get(n.id)) d.warn(`$.steps[${i}]`, 'end-outgoing', `end step "${n.id}" has outgoing transitions`);
    });
    if (starts.length) {
      const reach = reachable(starts.map((s) => s.id), links);
      items.forEach((n, i) => { if (!reach.has(n.id)) d.warn(`$.steps[${i}]`, 'unreachable', `"${n.id}" is not reachable from a start step`); });
    }
  },
  lifecycle({ items, links, out, inc, d }) {
    const initial = items.filter((n) => n.kind === 'initial');
    if (initial.length !== 1) d.warn('$.states', 'initial-count', `expected 1 initial state, found ${initial.length}`);
    items.forEach((n, i) => {
      if (n.kind === 'initial' && inc.get(n.id)) d.warn(`$.states[${i}]`, 'initial-incoming', `initial state "${n.id}" has incoming transitions`);
      if (n.kind === 'final' && out.get(n.id)) d.warn(`$.states[${i}]`, 'final-outgoing', `final state "${n.id}" has outgoing transitions`);
      if (links.length && n.kind !== 'final' && !out.get(n.id) && inc.get(n.id)) d.warn(`$.states[${i}]`, 'dead-end', `"${n.id}" has no way out; make it final or add a transition`);
    });
    if (initial.length) {
      const reach = reachable(initial.map((s) => s.id), links);
      items.forEach((n, i) => { if (!reach.has(n.id)) d.warn(`$.states[${i}]`, 'unreachable', `"${n.id}" is not reachable from the initial state`); });
    }
  },
  dataflow({ items, out, inc, d }) {
    items.forEach((n, i) => {
      if (n.kind === 'source' && inc.get(n.id)) d.warn(`$.nodes[${i}]`, 'source-incoming', `source "${n.id}" has incoming flows`);
      if (n.kind === 'sink' && out.get(n.id)) d.warn(`$.nodes[${i}]`, 'sink-outgoing', `sink "${n.id}" has outgoing flows`);
    });
  },
  erd({ items, d }) {
    const cols = new Map(items.map((e) => [e.id, new Set(e.attributes.map((a) => a.name))]));
    items.forEach((e, i) => {
      const names = new Set();
      e.attributes.forEach((a, j) => {
        const p = `$.entities[${i}].attributes[${j}]`;
        if (names.has(a.name)) d.error(`${p}.name`, 'duplicate-column', `column "${a.name}" appears twice in "${e.id}"`);
        names.add(a.name);
        const keys = a.key || [];
        if (keys.includes('fk') && !a.references) d.error(p, 'fk-references', `fk column "${a.name}" needs references like "table.column"`);
        if (a.references) {
          const [table, col, extra] = a.references.split('.');
          if (extra !== undefined || !col) d.error(`${p}.references`, 'bad-reference', `"${a.references}" must look like table.column`);
          else if (!cols.get(table)?.has(col)) d.error(`${p}.references`, 'unknown-ref', `no column "${col}" in entity "${table}"`);
          if (!keys.includes('fk')) d.warn(p, 'missing-fk', `"${a.name}" has references but no "fk" key`);
        }
      });
      if (!e.attributes.some((a) => a.key?.includes('pk'))) d.warn(`$.entities[${i}]`, 'no-primary-key', `entity "${e.id}" has no pk column`);
    });
  },
  class({ items, links, d }) {
    const kindOf = new Map(items.map((c) => [c.id, c.kind || 'class']));
    links.forEach((e, i) => {
      if (e.kind === 'realization' && kindOf.has(e.to) && kindOf.get(e.to) !== 'interface') d.warn(`$.relations[${i}]`, 'realization-target', `"${e.to}" is realized but is not an interface`);
    });
    const supers = links.filter((e) => e.kind === 'inheritance' || e.kind === 'realization');
    for (const c of items) {
      const up = reachable([c.id], supers);
      if (supers.some((e) => e.to === c.id && up.has(e.from))) { d.error('$.relations', 'inheritance-cycle', `"${c.id}" inherits from itself`); break; }
    }
  },
};

function semanticTree(ir, d) {
  const ids = new Set();
  ir.nodes.forEach((n, i) => {
    if (ids.has(n.id)) d.error(`$.nodes[${i}].id`, 'duplicate-id', `id "${n.id}" is already used`);
    ids.add(n.id);
  });
  ir.nodes.forEach((n, i) => {
    if (n.parent !== undefined && !ids.has(n.parent)) d.error(`$.nodes[${i}].parent`, 'unknown-ref', `no node "${n.parent}"`);
  });
  const roots = ir.nodes.filter((n) => n.parent === undefined);
  if (roots.length !== 1) d.error('$.nodes', 'tree-root', `a tree needs exactly 1 root (node without parent), found ${roots.length}: ${roots.map((n) => n.id).join(', ')}`);
  const looped = cycleIn(new Map(ir.nodes.map((n) => [n.id, n.parent])));
  if (looped) d.error('$.nodes', 'tree-cycle', `"${looped}" is its own ancestor`);
  if (ir.nodes.length > 80) d.warn('$.nodes', 'too-dense', `${ir.nodes.length} nodes; consider splitting the tree`);
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

function semanticTimeline(ir, d) {
  const lanes = ir.lanes || [];
  const laneIds = new Set();
  lanes.forEach((l, i) => {
    if (laneIds.has(l.id)) d.error(`$.lanes[${i}].id`, 'duplicate-id', `lane "${l.id}" is already used`);
    laneIds.add(l.id);
  });
  const badTime = (v, p) => { if (Number.isNaN(Date.parse(v))) d.error(p, 'bad-time', `"${v}" is not a real date/time`); };
  ir.events.forEach((e, i) => {
    badTime(e.at, `$.events[${i}].at`);
    if (lanes.length && e.lane === undefined) d.error(`$.events[${i}]`, 'lane-required', 'lanes are defined, so every event needs a lane');
    if (e.lane !== undefined && !laneIds.has(e.lane)) d.error(`$.events[${i}].lane`, 'unknown-ref', `no lane "${e.lane}"`);
  });
  (ir.periods || []).forEach((p, i) => {
    badTime(p.start, `$.periods[${i}].start`);
    badTime(p.end, `$.periods[${i}].end`);
    if (Date.parse(p.end) < Date.parse(p.start)) d.error(`$.periods[${i}]`, 'period-range', 'end is before start');
  });
  lanes.forEach((l, i) => { if (!ir.events.some((e) => e.lane === l.id)) d.warn(`$.lanes[${i}]`, 'empty-lane', `lane "${l.id}" has no events`); });
  if (ir.events.length > 80) d.warn('$.events', 'too-dense', `${ir.events.length} events; consider splitting the timeline`);
}

function semanticWaterfall(ir, d) {
  const byId = new Map();
  ir.spans.forEach((s, i) => {
    if (byId.has(s.id)) d.error(`$.spans[${i}].id`, 'duplicate-id', `id "${s.id}" is already used`);
    else byId.set(s.id, s);
  });
  ir.spans.forEach((s, i) => {
    if (s.parent === undefined) return;
    const p = byId.get(s.parent);
    if (!p) return d.error(`$.spans[${i}].parent`, 'unknown-ref', `no span "${s.parent}"`);
    if (s.start < p.start || s.start + s.duration > p.start + p.duration) d.warn(`$.spans[${i}]`, 'outside-parent', `"${s.id}" runs outside its parent "${p.id}"`);
  });
  const looped = cycleIn(new Map(ir.spans.map((s) => [s.id, s.parent])));
  if (looped) d.error('$.spans', 'span-cycle', `"${looped}" is its own ancestor`);
  if (ir.spans.length > 80) d.warn('$.spans', 'too-dense', `${ir.spans.length} spans; consider collapsing small ones`);
}

// Fields each explainer panel kind needs, and the ones it may use.
const PANEL = {
  text: { needs: ['body'], uses: ['title', 'body'] },
  reasons: { needs: ['items'], uses: ['title', 'items'] },
  steps: { needs: ['items'], uses: ['title', 'items'] },
  table: { needs: ['columns', 'rows'], uses: ['title', 'columns', 'rows'] },
  comparison: { needs: ['options'], uses: ['title', 'options'] },
  callout: { needs: ['body'], uses: ['title', 'body', 'tone'] },
  diagram: { needs: ['diagram_type', 'diagram'], uses: ['title', 'diagram_type', 'diagram'] },
};

function semanticExplainer(ir, d, out) {
  ir.panels.forEach((p, i) => {
    const at = `$.panels[${i}]`;
    const spec = PANEL[p.kind];
    for (const f of spec.needs) if (p[f] === undefined || (Array.isArray(p[f]) && !p[f].length)) d.error(`${at}.${f}`, 'panel-field', `a ${p.kind} panel needs a non-empty "${f}"`);
    for (const f of Object.keys(p)) if (f !== 'kind' && !spec.uses.includes(f)) d.warn(`${at}.${f}`, 'unused-field', `"${f}" is ignored on a ${p.kind} panel`);
    if (p.kind === 'table' && p.columns) (p.rows || []).forEach((row, j) => {
      if (row.length !== p.columns.length) d.error(`${at}.rows[${j}]`, 'row-length', `row has ${row.length} cells but there are ${p.columns.length} columns`);
    });
    if (p.kind === 'comparison' && p.options?.length === 1) d.warn(`${at}.options`, 'single-option', 'a comparison needs at least 2 options');
    if (p.kind === 'diagram' && p.diagram_type && p.diagram) {
      for (const x of validate(p.diagram_type, p.diagram)) out.push({ ...x, path: `${at}.diagram${x.path.slice(1)}` });
    }
  });
  if (ir.panels.length > 8) d.warn('$.panels', 'too-many-panels', `${ir.panels.length} panels; a one-page answer reads best with 8 or fewer`);
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
  else if (type === 'tree') semanticTree(ir, d);
  else if (type === 'timeline') semanticTimeline(ir, d);
  else if (type === 'waterfall') semanticWaterfall(ir, d);
  else if (type === 'explainer') semanticExplainer(ir, d, out);
  else semanticGraph(ir, type, d);
  return out;
}
