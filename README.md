# Diagrammer MCP

An MCP server that lets an AI agent create validated **architecture**, **workflow** and **sequence** diagrams as standalone HTML files.

Each diagram is one self-contained file. It has a dark/light theme toggle, SVG and PNG export, and its source JSON embedded inside. Diagrammer uses no external engine: its schemas, validator and renderers are built in, and graph layout uses [dagre](https://github.com/dagrejs/dagre).

## Requirements

- Node.js 18 or newer.

## Install

```bash
git clone https://github.com/VinodhDeva/diagrammer.git
```

```bash
cd diagrammer && npm install
```

Register the server with Claude Code:

```bash
claude mcp add diagrammer -- node /absolute/path/to/diagrammer/server.mjs
```

You can also register it with a project `.mcp.json`. Change the path in the included file to match your clone:

```json
{
  "mcpServers": {
    "diagrammer": {
      "command": "node",
      "args": ["/absolute/path/to/diagrammer/server.mjs"]
    }
  }
}
```

Restart the client after you register the server.

## Tools

| Tool | Purpose |
|---|---|
| `diagram_guide` | Recommends a diagram type for a scenario or question. |
| `diagram_authoring_context` | Returns the authoring tips, JSON schema and an example for a type. Read it before you write a candidate. |
| `diagram_finalize` | Main delivery tool. In one run it validates the candidate, renders it and checks the result, then writes the HTML file and a receipt. |
| `diagram_validate` | Validates a candidate without writing any files. |
| `diagram_check` | Checks a rendered HTML file. See [Checks](#checks). |

To give a candidate to a tool, pass either `candidate` (a JSON object) or `candidate_path` (the path to a JSON file).

`diagram_finalize` also accepts two optional fields:

- `work_dir`: reuse an existing artifact folder when you repair a diagram.
- `output`: the path of the HTML file to write.

When the client initializes, the server sends workflow instructions that tell the agent which tools to call and in what order.

## Diagram types

| Type | Use for | Schema | Example |
|---|---|---|---|
| `architecture` | Components, boundaries and how they connect | [schema](schemas/architecture.schema.json) | [photo sharing](examples/photo-sharing.architecture.json) |
| `workflow` | Steps, decisions, branches, retries and outcomes | [schema](schemas/workflow.schema.json) | [expense approval](examples/expense-approval.workflow.json) |
| `sequence` | Messages between participants in time order, with alt/opt/loop/par/critical fragments | [schema](schemas/sequence.schema.json) | [profile lookup](examples/profile-lookup.sequence.json) |

A minimal architecture candidate:

```json
{
  "meta": { "title": "Checkout" },
  "nodes": [
    { "id": "web", "label": "Web app", "kind": "client" },
    { "id": "api", "label": "Orders API" },
    { "id": "db", "label": "Orders DB", "kind": "database" }
  ],
  "edges": [
    { "from": "web", "to": "api", "label": "HTTPS" },
    { "from": "api", "to": "db" }
  ]
}
```

## Checks

`diagram_finalize` runs three gates in order and stops at the first one that fails.

1. **validate.** The candidate must match the schema: required fields, enums, lengths and no unknown fields. Semantic checks follow:
   - **Errors:** duplicate ids, unknown references, group cycles, and fragments that partly overlap.
   - **Warnings:** isolated nodes, empty groups, decisions with fewer than two branches, steps that can't be reached from a start step, and a missing start or end step.
2. **render.** The renderer lays out the diagram and draws it as SVG inside one HTML file. The file is written atomically, so a failed write never leaves half a file behind.
3. **check.**
   - The embedded source must match its SHA-256 hash.
   - The SVG must exactly match a fresh render of that source.
   - The file must contain exactly one diagram and load no external resources.

Every diagnostic includes a JSON path, such as `$.edges[3].to`, that points to the field to fix.

All labels are escaped before they are written into the HTML.

## Output

Each new artifact gets its own folder: `.diagrams/<type>-<slug>-<YYYYMMDD-HHMMSS>/`. The folder holds three files:

- `candidate.json`
- `<slug>.html`
- `<slug>.receipt.json`

Folders are created inside the server's working directory. To use a different directory, set `DIAGRAM_WORKDIR`.

## Test

```bash
npm test
```

The test runs the server over stdio and covers:

- the handshake and the type guide;
- all three examples, end to end;
- validation failures;
- escaping of hostile labels;
- tamper detection.

## Limits

- Text width is estimated, not measured, so very long words can overflow their boxes.
- Three diagram types so far. Planned next: dataflow, lifecycle, ERD, class and tree.
