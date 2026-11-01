// Dispatches a diagram type to its SVG renderer.
import { renderGraph } from './graph.mjs';
import { renderSequence } from './sequence.mjs';
import { renderTable } from './tables.mjs';
import { renderTimeline, renderWaterfall } from './time.mjs';

export function renderDiagram(type, ir) {
  switch (type) {
    case 'sequence': return renderSequence(ir);
    case 'erd':
    case 'class': return renderTable(type, ir);
    case 'timeline': return renderTimeline(ir);
    case 'waterfall': return renderWaterfall(ir);
    default: return renderGraph(type, ir);
  }
}
