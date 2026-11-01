// Keyword router for picking a diagram type, plus per-type authoring tips.

const SIGNALS = {
  sequence: ['request', 'response', 'call chain', 'calls', 'api call', 'handshake', 'message', 'oauth', 'login flow', 'auth flow', 'round trip', 'roundtrip', 'who calls', 'in what order', 'callback', 'webhook', 'returns'],
  workflow: ['process', 'steps', 'step-by-step', 'approval', 'runbook', 'ci/cd', 'ci', 'build pipeline', 'release pipeline', 'onboarding', 'decision', 'procedure', 'checklist', 'how to', 'triage', 'escalation', 'plan'],
  architecture: ['architecture', 'components', 'services', 'system', 'infrastructure', 'topology', 'deployment', 'microservice', 'stack', 'made of', 'cloud', 'network', 'boundary', 'overview'],
  dataflow: ['data flow', 'dataflow', 'etl', 'elt', 'lineage', 'ingest', 'ingestion', 'pipeline', 'data pipeline', 'warehouse', 'analytics', 'stream processing', 'where data goes', 'where the money goes', 'consumers'],
  lifecycle: ['state', 'states', 'status', 'statuses', 'lifecycle', 'state machine', 'transitions', 'stages of', 'where it stands', 'retry state'],
  erd: ['schema', 'tables', 'table', 'entity', 'entities', 'erd', 'foreign key', 'primary key', 'columns', 'data model', 'database design'],
  class: ['class', 'classes', 'interface', 'interfaces', 'inheritance', 'uml', 'object model', 'subclass', 'types and members'],
  tree: ['tree', 'hierarchy', 'folder', 'folders', 'directory', 'repository structure', 'repo layout', 'org chart', 'breakdown', 'taxonomy', 'module tree'],
  timeline: ['timeline', 'history', 'chronology', 'when did', 'what happened', 'incident review', 'postmortem', 'post-mortem', 'release history', 'timestamps', 'sequence of events'],
  waterfall: ['waterfall', 'where the time went', 'where did the time go', 'latency breakdown', 'trace', 'spans', 'slow request', 'profile', 'timing breakdown', 'critical path'],
  explainer: ['explain', 'explainer', 'one page', 'one-page', 'page', 'should we', 'trade-off', 'tradeoff', 'decision', 'recommendation', 'compare options', 'pros and cons', 'summary page'],
};

const ABOUT = {
  architecture: 'What the system is made of: components, boundaries, and how they connect.',
  workflow: 'How a process runs: ordered steps, decisions, branches, and outcomes.',
  sequence: 'Who talks to whom, in what order, and what comes back.',
  dataflow: 'Where data comes from, how it is transformed and stored, and who consumes it.',
  lifecycle: 'Which states something moves through and which events move it.',
  erd: 'Which tables exist, their columns and keys, and how they relate.',
  class: 'Which types exist, their key members, and how they inherit, compose or depend.',
  tree: 'How something breaks down into parts with exactly one parent each.',
  timeline: 'When things happened, on a proportional clock, per source.',
  waterfall: 'Where the time went in one request or run: span durations, overlap and nesting.',
  explainer: 'A one-page answer: the conclusion first, then reasons, steps, tables, comparisons and diagrams.',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function guide(scenario = '') {
  const q = ` ${scenario.toLowerCase()} `;
  const scores = Object.entries(SIGNALS).map(([type, words]) => {
    const matched = words.filter((w) => new RegExp(`\\b${escapeRe(w)}\\b`).test(q));
    return { type, score: matched.length, matched };
  }).sort((a, b) => b.score - a.score);
  const best = scores[0].score ? scores[0] : { type: 'architecture', score: 0, matched: [] };
  return {
    recommendation: best.type,
    confidence: best.score >= 2 ? 'high' : best.score === 1 ? 'medium' : 'low',
    matched: best.matched,
    why: ABOUT[best.type],
    alternatives: scores.filter((s) => s.type !== best.type).map((s) => ({ type: s.type, use_when: ABOUT[s.type] })),
  };
}

export const TIPS = {
  architecture: `- Show the main user journey plus the branches that change behaviour; omit plumbing nobody asked about.
- One node per deployable or ownable component. Use kind to say what it is (database, queue, cache, gateway, external...).
- Put trust/network/cloud boundaries in groups; nest with parent. Edges connect nodes only, never groups.
- Label edges with the verb or protocol ("HTTPS", "publishes order.created"). style async for fire-and-forget, data for bulk data flow.
- direction LR suits request paths; TB suits layered stacks.`,
  workflow: `- Begin with one start step and end with at least one end step.
- Every decision needs two or more outgoing transitions, each labelled with its condition (yes / no, approved / rejected).
- Use kind tool for automated actions, manual for human actions, wait for timers or external events.
- Mark failure paths with style error and loops back with style retry.
- Group steps into phases or owners with groups when it helps reading.`,
  sequence: `- Order participants left to right in the order they first act; the initiator goes first.
- Messages are time ordered. Use kind return (dashed) for responses and async for fire-and-forget.
- from == to draws a self call (internal work worth showing).
- Wrap conditional or repeated ranges in fragments: alt/opt for conditions, loop for repetition, par for parallel. start and end are 0-based message indices, inclusive, and must nest.
- Keep labels short: the operation and key payload ("GET /orders/{id}", "200 order JSON").`,
  dataflow: `- Start from sources (no inputs) on the left and end at sinks (no outputs) on the right.
- Use process for anything that transforms data and store for anything that holds it (tables, topics, buckets).
- Label each flow with what moves ("click events", "daily invoices"). style batch for scheduled bulk loads, event for messages on a bus.
- Group nodes into stages or zones (ingest, warehouse, serving) when it clarifies ownership.`,
  lifecycle: `- Use exactly one initial state; mark terminal outcomes as final.
- States are nouns or adjectives ("Awaiting payment", "Shipped"); transitions are the events that cause them ("payment ok").
- Put conditions in guard, not in the label; they render as [guard].
- Use kind waiting for states blocked on something external, error for failure states, style retry for loops back.
- Every non-final state needs a way out, and every state must be reachable from the initial state.`,
  erd: `- List every physical column with its SQL type. key is a list: ["pk"], ["fk"], ["uk"] or ["pk", "fk"] for a key that is also a foreign key.
- Every fk column needs references as "table.column", using the entity id as the table name.
- Add relationships with cardinality from:to (1:N means one "from" row to many "to" rows) and a short verb label.
- Group tables into functional domains with groups when the schema has more than a handful of tables.`,
  class: `- Show the types that matter for the question, with only the members that explain behaviour.
- Write members as UML strings: "+name: Type", "-field: Type", "+method(arg: Type): Return".
- inheritance and realization go from child to parent; composition and aggregation go from the whole to the part.
- Use kind interface/abstract/enum; enum values go in attributes.
- Use dependency (dashed) for "uses temporarily", association for a lasting reference.`,
  tree: `- Exactly one node has no parent: the root. Every other node names its parent.
- Keep siblings at the same level of abstraction; stop at the depth the reader needs.
- Use kind folder/file for repositories, module/feature for capability breakdowns, team/person for org charts.
- Summarise long leaf lists in one node ("12 migration files") rather than drawing each.`,
  timeline: `- Every at needs a zone: "2026-03-04T14:02:00Z" or "...+05:30". A plain date ("2026-03-04") is fine for day-level histories.
- Use lanes for sources or actors (deploys, alerts, responders). When lanes exist, every event names one.
- kind change for deploys and config, alert for monitoring, incident for declarations, fix for mitigations, milestone for closure.
- Shade impact or maintenance windows with periods.
- Set meta.utc_offset to show times in the readers' zone; the axis is labelled with it.`,
  waterfall: `- One top-level span for the whole request or run; nest the rest with parent.
- start is the offset from the trace start, duration the length, both in meta.unit (ms by default).
- Children must fit inside their parent's window. Overlapping siblings show parallel work.
- Mark failed spans with status error. Use kind to colour by work type (db, cache, external, llm, tool...).
- Say in meta.description whether durations are measured or illustrative.`,
  explainer: `- conclusion is the answer itself in one to three sentences, not a topic. Write it first.
- Then add only the panels that support it, in reading order: reasons (why), steps (how), comparison (options), table (numbers), callout (risk or caveat), text (context), diagram (any diagram type).
- A diagram panel holds a complete candidate of diagram_type and is validated by that type's rules.
- Keep it to one page: 8 panels or fewer, short items, details in the detail field.
- Ask for missing facts instead of inventing numbers.`,
};
