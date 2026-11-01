// Keyword router for picking a diagram type, plus per-type authoring tips.

const SIGNALS = {
  sequence: ['request', 'response', 'call chain', 'calls', 'api call', 'handshake', 'message', 'oauth', 'login flow', 'auth flow', 'round trip', 'roundtrip', 'who calls', 'in what order', 'callback', 'webhook', 'returns'],
  workflow: ['process', 'steps', 'step-by-step', 'approval', 'runbook', 'pipeline', 'ci/cd', 'ci', 'deploy process', 'onboarding', 'decision', 'procedure', 'checklist', 'how to', 'triage', 'escalation', 'plan'],
  architecture: ['architecture', 'components', 'services', 'system', 'infrastructure', 'topology', 'deployment', 'microservice', 'stack', 'made of', 'cloud', 'network', 'boundary', 'overview'],
};

const ABOUT = {
  architecture: 'What the system is made of: components, boundaries, and how they connect.',
  workflow: 'How a process runs: ordered steps, decisions, branches, and outcomes.',
  sequence: 'Who talks to whom, in what order, and what comes back.',
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
    alternatives: Object.keys(ABOUT).filter((t) => t !== best.type).map((t) => ({ type: t, use_when: ABOUT[t] })),
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
};
