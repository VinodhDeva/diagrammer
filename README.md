# Diagrammer MCP

[![npm](https://img.shields.io/npm/v/diagrammer-mcp)](https://www.npmjs.com/package/diagrammer-mcp)

An MCP server that lets an AI agent turn a description into a **validated, interactive diagram**: one HTML file you can open, explore and share.

- **10 diagram types:** architecture, workflow, sequence, dataflow, lifecycle, ERD, class, tree, timeline and waterfall.
- **One-page explainers:** the answer first, then reasons, steps, tables, comparisons and embedded diagrams.
- **Built to explore:** hover or tab to any item to see its details and its upstream and downstream connections. Click a neighbor to follow the path. Zoom and pan large diagrams.
- **Trustworthy output:** strict validation with exact JSON paths, deterministic renders, and a tamper check that ties each file to its embedded source.
- **Accessible:** full keyboard support, screen-reader labels, light and dark themes, and motion that respects your reduced-motion setting.
- **Self-contained:** no external requests. Diagrams export as SVG or PNG.

## Install

You need Node.js 18 or newer. To register the server with Claude Code:

```bash
claude mcp add diagrammer -- npx -y diagrammer-mcp
```

To register it with any other MCP client:

```json
{
  "mcpServers": {
    "diagrammer": { "command": "npx", "args": ["-y", "diagrammer-mcp"] }
  }
}
```

Restart the client. Then ask, for example, "draw the architecture of this repo" or "explain this decision as a one-page explainer".

## Tools

| Tool | Purpose |
|---|---|
| `diagram_guide` | Recommends a diagram type for a question. |
| `diagram_authoring_context` | Returns the tips, schema and example for a type. |
| `diagram_finalize` | Validates, renders and checks a candidate, then writes the HTML file and a receipt. |
| `diagram_validate` | Validates a candidate only. |
| `diagram_check` | Re-checks an existing HTML file for tampering or corruption. |

## Exploring a diagram

| Do this | To get this |
|---|---|
| Hover over an item, or <kbd>Tab</kbd> to it | The details panel shows its name, kind, group, description and data, plus its **upstream** connections (amber) and **downstream** connections (green). |
| Click it, or press <kbd>Enter</kbd> | Pins the panel. Click a listed neighbor to jump to it. |
| Press <kbd>Esc</kbd> | Closes the panel. |
| Use `−` / `+` / **Fit** / **100%**, <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + scroll, or drag | Zoom and pan. Large diagrams open at 75% or more so labels stay readable. |
| Use **Theme**, **Motion**, **SVG** or **PNG** | Switches light/dark, turns animation on or off, or exports the diagram. |

## Documentation

- [Guide](docs/guide.md): how it works, the viewer, choosing a type, the tools, output files, checks, every diagnostic code, configuration, troubleshooting and development.
- [Schema reference](docs/schema-reference.md): every field of every type, generated from [`schemas/`](schemas/).
- [Examples](examples/): one worked candidate per type.

## Development

```bash
git clone https://github.com/VinodhDeva/diagrammer.git
```

```bash
cd diagrammer && npm install && npm test
```

See [Development](docs/guide.md#development) for the code layout and the release steps.

## License

MIT. See [LICENSE](LICENSE). Third-party notices are in [NOTICE](NOTICE). Graph layout uses [dagre](https://github.com/dagrejs/dagre), under the MIT license.
