# Diagrammer MCP

An MCP server that lets an AI agent create validated diagrams and one-page explainers as standalone HTML files.

- **Diagram types (10):** **architecture**, **workflow**, **sequence**, **dataflow**, **lifecycle**, **ERD**, **class**, **tree**, **timeline** and **waterfall**.
- **Explainer:** a page that gives the answer first, then supporting panels that can embed any of the diagram types.

Each output is one self-contained file. It has a dark/light theme toggle and its source JSON embedded inside. Diagrams can also be exported as SVG or PNG. Diagrammer uses no external engine: its schemas, validator and renderers are built in, and graph layout uses [dagre](https://github.com/dagrejs/dagre).

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
| `dataflow` | Sources, processes, stores and sinks, and what flows between them | [schema](schemas/dataflow.schema.json) | [clickstream](examples/clickstream.dataflow.json) |
| `lifecycle` | States, the events that move between them, and guards | [schema](schemas/lifecycle.schema.json) | [order status](examples/order-status.lifecycle.json) |
| `erd` | Tables, columns, keys and cardinality, drawn with crow's-foot ends | [schema](schemas/erd.schema.json) | [library lending](examples/library.erd.json) |
| `class` | Types, members, and UML inheritance/realization/composition/aggregation/association/dependency | [schema](schemas/class.schema.json) | [notification channels](examples/notifications.class.json) |
| `tree` | Single-parent hierarchies such as repository layouts, capability breakdowns and org charts | [schema](schemas/tree.schema.json) | [this repository](examples/diagrammer-repo.tree.json) |
| `timeline` | Timestamped events on a time axis drawn to scale, in lanes per source, with shaded periods | [schema](schemas/timeline.schema.json) | [checkout outage](examples/checkout-outage.timeline.json) |
| `waterfall` | Nested spans of one request or run on a shared time axis | [schema](schemas/waterfall.schema.json) | [search request](examples/search-request.waterfall.json) |
| `explainer` | A one-page answer: conclusion, then reasons, steps, comparison, table, callout, text and diagram panels | [schema](schemas/explainer.schema.json) | [queue decision](examples/queue-choice.explainer.json) |

The graph types (architecture, workflow, dataflow, lifecycle, ERD and class) can group items into boundaries, phases, domains or packages with `groups`. Groups can nest.

**Timeline times.**
- Each date-time must include `Z` or an offset such as `+05:30`. A date-time without a zone is rejected, so a render is the same on every machine.
- Plain dates such as `2026-03-04` are allowed.
- Set `meta.utc_offset` to display times in the reader's zone.

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
   - **Errors, all types:** duplicate ids, unknown references and group cycles.
   - **Errors, by type:**
     - **sequence:** fragments that partly overlap.
     - **ERD:** foreign-key columns without `references`, references to missing columns, and duplicate columns.
     - **class:** inheritance cycles.
     - **tree:** anything other than exactly one root, and parent cycles.
     - **timeline:** dates that don't exist, missing lanes, and periods that end before they start.
     - **waterfall:** parent cycles.
     - **explainer:** panels missing a required field, table rows with the wrong number of cells, and any error in an embedded diagram. Its path points inside the panel, for example `$.panels[4].diagram.flows[0].to`.
   - **Warnings:**
     - **all types:** isolated items and empty groups.
     - **workflow:** a missing start or end step, decisions with fewer than two branches, and unreachable steps.
     - **lifecycle:** anything other than one initial state, unreachable states, and dead ends.
     - **dataflow:** sources with inputs and sinks with outputs.
     - **ERD:** tables without a primary key.
     - **class:** realization of something that isn't an interface.
     - **timeline:** lanes with no events.
     - **waterfall:** child spans that run outside their parent.
     - **explainer:** more than 8 panels, fields a panel ignores, and comparisons with only one option.
2. **render.** The renderer lays out the diagram or page and writes one HTML file. The file is written atomically, so a failed write never leaves half a file behind.
3. **check.**
   - The embedded source must match its SHA-256 hash.
   - The page body must exactly match a fresh render of that source.
   - The file must contain no drawings outside the body and load no external resources.

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

- the handshake and the type guide for every type;
- all 11 examples, end to end, with no warnings. The server renders in a different time zone, and the test re-checks each file in its own zone;
- validation failures, including the type-specific rules;
- escaping of hostile labels;
- tamper detection.

## Limits

- Text width is estimated, not measured, so very long words can overflow their boxes.
- Timeline ticks of a week or longer are spaced evenly, not aligned to calendar months.
- Explainer text is plain: Markdown and links are shown as typed.
- Planned next: live motion along edges and WebM export.
