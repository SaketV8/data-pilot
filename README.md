<h1 align="center">Data Pilot</h1>

<div align="center">
  <img src="https://img.shields.io/badge/License-MIT-ed8796.svg?style=for-the-badge" alt="MIT License">
</div>

> ## chat with your data

Upload a CSV or Excel file and ask questions in plain English. The LLM (NVIDIA NIM)
turns a question into SQL. The SQL is validated, DuckDB calculates the answer, and the
LLM then explains the actual result. The model never produces the numbers itself.

## 🚀 Features

- **Upload CSV or Excel** (`.csv`, `.xlsx`, `.xls`) and pick which worksheet to use.
- **Automatic data profile**: column types, missing values, distinct counts and sample
  values, plus a paginated preview of the rows.
- **Ask in plain English**, including follow-up questions that build on earlier answers.
- **Real numbers, not guesses**: DuckDB computes every answer; the LLM only plans the
  query and explains the result.
- **Results that fit the answer**: a summary, metrics, a table or a chart (bar, line,
  scatter, pie), picked automatically and checked against the actual result.
- **Shows its work**: the SQL, explanation and assumptions behind each answer.
- **Asks when unsure**: ambiguous questions get a clarifying question instead of a guess.
- **Safe by design**: generated SQL is validated and runs read-only in a sandbox.

## 🌺 Tech Stack

| Layer      | Tools                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Frontend   | TanStack Start (React), TanStack Router, Query and Table, shadcn/ui (Base UI), Tailwind CSS, Recharts |
| Backend    | FastAPI, Pydantic, uvicorn                                                                            |
| Data       | DuckDB, pandas, openpyxl and xlrd (Excel)                                                             |
| LLM        | LangChain `ChatOpenAI` → NVIDIA NIM (`nemotron` models)                                               |
| SQL safety | sqlglot                                                                                               |
| Tooling    | uv (Python), pnpm + Vite (Node), ESLint, Prettier                                                     |

## ✅ DataWise in Action

<!-- Add screenshots here, e.g. ![Upload and preview](docs/screenshots/upload.png) -->

## 🏗️ Architecture

```

 BROWSER · client/ · localhost:3000
 ┌────────────────────────────┐      ┌────────────────────────────┐
 │      Upload & Preview      │      │       Chat Interface       │
 │  UploadCard · DatasetCard  │      │        ChatPanel →         │
 │        PreviewPanel        │      │    QueryResultRenderer     │
 │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│      │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
 │ upload CSV / Excel         │      │ questions + follow-ups     │
 │ pick a worksheet           │      │ summary · metrics · table  │
 │ column types + missing     │      │ chart · clarification      │
 │ paginated row preview      │      │ shows SQL + assumptions    │
 └──────────────┬─────────────┘      └──────────────┬─────────────┘
                ▼                                   ▼
 ┌────────────────────────────────────────────────────────────────┐
 │                       Client data layer                        │
 │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
 │ lib/queries.ts  TanStack Query: cached queries + mutations     │
 │ lib/api.ts      fetch wrapper, errors → ApiError(detail)       │
 └────────────────────────────────┬───────────────────────────────┘
                                  │  JSON over HTTP (VITE_API_URL)
                                  ▼

 SERVER · server/ · localhost:8000
 ┌────────────────────────────────────────────────────────────────┐
 │                     Backend API · FastAPI                      │
 │                             app.py                             │
 │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
 │ GET /health · /datasets/* (upload, info, schema, preview,      │
 │   delete) · POST /chat (503 if no NVIDIA_NIM_API_KEY)          │
 │ CORS · input validation · every error → { "detail": "…" }      │
 └──────────────┬───────────────────────────────────┬─────────────┘
                │ upload                            │ question
                ▼                                   ▼
 ┌────────────────────────────┐      ┌────────────────────────────┐       ┌────────────────────────┐
 │         Ingestion          │      │     Chat Orchestrator      │       │    LLM · NVIDIA NIM    │
 │ ingestion.py · datasets.py │      │   chat.py · ChatService    │       │  llm.py · ChatOpenAI   │
 │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│      │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│       │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
 │ CSV → DuckDB CSV reader    │      │ 1 plan     → LLM           │ prompt│ OpenAI-compatible API  │
 │ Excel → pandas             │      │ 2 check    → SQL guard     ├──────►│ reply: JSON, checked   │
 │   (openpyxl / xlrd)        │   ┌─►│ 3 run      → DuckDB        │       │   with Pydantic        │
 │ snake_case column names    │   │  │ 4 explain  → LLM           │◄──────┤ plans SQL + chart      │
 │ profile → meta.json        │   │  │ retries when SQL fails     │ JSON  │ explains real results  │
 │                            │   │  │ checks display + chart     │       │ key stays on server    │
 └──────────────┬─────────────┘   │  └──────────────┬─────────────┘       └────────────────────────┘
                │ writes          │                 │ SQL
                │                 │                 ▼
                │                 │  ┌────────────────────────────┐
                │                 │  │         SQL Guard          │
                │                 │  │   sql_guard.py · sqlglot   │
                │                 │  │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
                │          result │  │ one SELECT, one table      │
                │          rows   │  │ known columns only         │
                │                 │  │ no DDL / DML / ATTACH      │
                │                 │  │ no file, network, env      │
                │                 │  │   functions                │
                │                 │  └──────────────┬─────────────┘
                │                 │                 │ safe SQL
                ▼                 │                 ▼
 ┌────────────────────────────────┴───────────────────────────────┐
 │                             DuckDB                             │
 │                  query.py · server/data/<id>/                  │
 │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
 │ one folder per upload: data.duckdb (table: data) + meta.json   │
 │ read-only · no external access · memory cap · timeout          │
 │ results capped at MAX_RESULT_ROWS                              │
 └────────────────────────────────────────────────────────────────┘


```

`config.py` (settings), `schemas.py` (API models) and `errors.py` (safe error types) are
shared across the server. Only the server talks to NVIDIA NIM; the API key never reaches
the browser.

### Detailed view

Each box is one component. Arrows show who calls whom; the "used by" labels say which
step needs the lower-level modules.

## ⚡ Run on your machine

**Requirements**

- Python >= 3.13
- [uv](https://docs.astral.sh/uv/) - a pip alternative written in Rust :)
- Node >= 22
- [pnpm](https://pnpm.io/)

```bash
# API  → http://localhost:8000  (docs at /docs)
cd server
cp .env.example .env          # then set NVIDIA_NIM_API_KEY
uv sync
uv run server                 # or: uv run uvicorn server.main:app --reload

# Web  → http://localhost:3000
cd client
cp .env.example .env          # VITE_API_URL, defaults to http://localhost:8000
pnpm install
pnpm dev
```

To try it, upload `server/sample_data/students.csv` or `sales.csv`.

Without `NVIDIA_NIM_API_KEY`, uploads, schemas and previews still work. Chat returns a
503 and the UI shows a notice.

### Server configuration (`server/.env`)

| Variable                                           | Default                               |                                                                    |
| -------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `NVIDIA_NIM_API_KEY`                               | —                                     | Required for chat. Kept on the server only.                        |
| `LLM_BASE_URL`                                     | `https://integrate.api.nvidia.com/v1` | OpenAI-compatible NIM endpoint                                     |
| `LLM_MODEL`                                        | `nvidia/nemotron-3-super-120b-a12b`   | `.env.example` sets `nvidia/nemotron-3.5-super-vl-120b-a12b`       |
| `LLM_TEMPERATURE` / `LLM_TOP_P` / `LLM_MAX_TOKENS` | `0` / `1` / `4096`                    | Sent as in NVIDIA's reference client (`max_tokens`, non-streaming) |
| `LLM_TIMEOUT_SECONDS` / `LLM_MAX_RETRIES`          | `60` / `2`                            | HTTP-level timeout and retries                                     |
| `LLM_OUTPUT_RETRIES`                               | `2`                                   | Re-asks when the model returns invalid JSON or SQL                 |
| `CORS_ORIGINS`                                     | `http://localhost:3000`               | Comma-separated                                                    |
| `MAX_UPLOAD_SIZE_MB`                               | `25`                                  |                                                                    |
| `QUERY_TIMEOUT_SECONDS`                            | `10`                                  | Long queries are interrupted                                       |
| `MAX_RESULT_ROWS`                                  | `1000`                                | Larger results are truncated (`truncated: true`)                   |
| `DATA_DIR`                                         | `server/data`                         | Where datasets are stored                                          |

All settings live in `server/src/server/config.py`.

## ⚙️ How it works

1. **Upload** (`ingestion.py`, `datasets.py`): each upload gets a random 32-hex ID and its
   own directory, `data/<id>/`, containing `data.duckdb` with a single table named `data`.
   Column names are converted to unique snake_case identifiers, and the original headers
   are kept as labels. CSVs are loaded with DuckDB's CSV reader. Excel files are read with
   pandas, using openpyxl for `.xlsx` and xlrd for `.xls`. The first worksheet is used by
   default, and another can be chosen. The column profile (type, missing-value count,
   approximate distinct count and sample values) is computed once and saved in `meta.json`.
2. **Plan** (`chat.py`): the model receives the schema, 5 sample rows, recent conversation
   turns (for follow-up questions) and the question. It returns a JSON `AnalysisPlan`,
   validated by Pydantic: kind (query, clarification or unsupported), SQL, display type,
   chart spec and assumptions.
3. **Validate** (`sql_guard.py`): see Security below. If the SQL is rejected or DuckDB
   fails on it, the error is sent back to the model, with a bounded number of retries.
4. **Execute** (`query.py`): runs on a sandboxed read-only connection with a timeout and
   a row limit.
5. **Explain**: the model gets the real result rows (up to 30) and writes a one- or
   two-sentence answer plus a short explanation. If this step fails, a plain fallback
   answer is used; the computed result itself stays valid.
6. **Render** (`QueryResultRenderer`): the frontend picks a summary, metrics, table, chart
   or clarification view from the server-validated `display.type`.

Structured output uses JSON prompting validated with Pydantic, not tool calling or
`response_format`. This works on any OpenAI-compatible endpoint and doesn't depend on
model-specific features. `<think>` blocks and code fences in replies are stripped.

## 🔌 API

- `GET /health`: status, whether the LLM is configured, and the model name
- `POST /datasets/upload`: upload a file (multipart: `file`, optional `sheet`)
- `GET /datasets/{id}`: dataset metadata
- `GET /datasets/{id}/schema`: column profile
- `GET /datasets/{id}/preview?page=&pageSize=`: paginated rows
- `DELETE /datasets/{id}`: delete a dataset
- `POST /chat`: ask a question
  (`{ datasetId, question, history: [{ role, content, sql? }] }`)

Errors are always `{ "detail": "<safe message>" }`. Stack traces, file paths and provider
errors are never returned.

### `POST /chat` response

```jsonc
{
  "answer": "Aarav Sharma is the top student with 98 marks.",
  "display": { "type": "summary", "title": "Top student" }, // summary | table | metrics | chart | clarification
  "columns": [{ "key": "name", "label": "name", "dataType": "string" }], // number | string | date | boolean
  "rows": [{ "name": "Aarav Sharma", "marks": 98 }],
  "explanation": "Ranked by marks in descending order.",
  "sql": "SELECT name, marks FROM data ORDER BY marks DESC LIMIT 1",
  "chart": null, // { "type": "bar|line|scatter|pie", "x": "col", "y": ["col"], "title": "…" }
  "assumptions": [],
  "truncated": false,
  "rowCount": 1,
}
```

The server corrects the display type to fit the actual result:

- An empty result is shown as a summary.
- `metrics` is used only for a single row.
- `summary` with several rows becomes a table.
- A chart whose `x`/`y` columns don't exist in the result, or whose `y` columns aren't
  numeric, falls back to a table.

The canonical models are in `server/src/server/schemas.py`, mirrored in
`client/src/lib/types.ts`.

## 🔒 Security

SQL safety is enforced in code, not only in the prompt. There are two layers:

- **Static validation** (sqlglot, DuckDB dialect):
  - Exactly one statement, which must be a `SELECT`/set query. CTEs, subqueries, joins
    and window functions are allowed.
  - Any DDL, DML, `ATTACH`, `INSTALL`, `LOAD`, `COPY`, `PRAGMA`, `SET`, `DESCRIBE` and
    similar statements are rejected anywhere in the tree.
  - Only the `data` table (and the query's own CTEs) can be referenced. Schema-qualified
    names, table functions and file-path tables are rejected.
  - File, network, environment and catalog functions are denied: `read_*`, `glob`,
    `getenv`, `duckdb_*` and others.
  - Unknown columns are rejected.
- **Sandboxed execution**: each dataset is a separate DuckDB file opened `read_only` with
  `enable_external_access=false`, Python replacement scans and extension autoloading
  turned off, a memory and thread cap, and `lock_configuration=true`. Every query runs on
  its own cursor and is interrupted after `QUERY_TIMEOUT_SECONDS`.

> The model only ever sees the schema, 5 sample rows and up to 30 result rows, never the
> whole dataset.

## 📂 Folder Structure

Generated with `tree`, leaving out dependencies, caches, lock files and tool configs.

```
.
├── client                              # React frontend
│   ├── src
│   │   ├── components
│   │   │   ├── results                 # one view per display type
│   │   │   │   ├── chart-result.tsx
│   │   │   │   ├── clarification-result.tsx
│   │   │   │   ├── metric-result.tsx
│   │   │   │   ├── query-result-renderer.tsx   # picks the view from display.type
│   │   │   │   ├── summary-result.tsx
│   │   │   │   └── table-result.tsx
│   │   │   ├── ui                      # shadcn/ui (Base UI) primitives, incl. alert-dialog, dropdown-menu
│   │   │   ├── chat-panel.tsx
│   │   │   ├── dataset-card.tsx        # schema, sheet picker, delete (with confirmation)
│   │   │   ├── data-table.tsx
│   │   │   ├── mode-toggle.tsx         # light / dark / system menu in the header
│   │   │   ├── preview-panel.tsx
│   │   │   ├── theme-provider.tsx      # theme state, sets .dark on <html> before hydration
│   │   │   └── upload-card.tsx
│   │   ├── integrations
│   │   │   └── tanstack-query
│   │   │       ├── devtools.tsx
│   │   │       └── root-provider.tsx   # QueryClient (no retry on 4xx)
│   │   ├── lib
│   │   │   ├── api.ts                  # fetch wrapper, VITE_API_URL
│   │   │   ├── format.ts
│   │   │   ├── queries.ts              # TanStack Query hooks
│   │   │   ├── types.ts                # mirrors server/src/server/schemas.py
│   │   │   └── utils.ts
│   │   ├── routes
│   │   │   ├── index.tsx               # main page
│   │   │   └── __root.tsx
│   │   ├── router.tsx
│   │   ├── routeTree.gen.ts            # generated by TanStack Router
│   │   └── styles.css
│   ├── .env.example
│   ├── package.json
│   ├── README.md
│   └── vite.config.ts
├── server                              # FastAPI backend
│   ├── data                            # uploaded datasets, created at runtime (gitignored)
│   ├── sample_data
│   │   ├── sales.csv
│   │   └── students.csv
│   ├── src
│   │   └── server
│   │       ├── app.py                  # FastAPI app, routes, error handlers
│   │       ├── chat.py                 # plan → validate → execute → explain
│   │       ├── config.py               # settings from env / .env
│   │       ├── datasets.py             # DatasetStore: per-upload DuckDB files
│   │       ├── errors.py               # safe, user-facing error types
│   │       ├── ingestion.py            # CSV / Excel → DuckDB table + column profile
│   │       ├── __init__.py             # `uv run server` entrypoint
│   │       ├── llm.py                  # NIM client, JSON output parsing
│   │       ├── main.py                 # ASGI app for uvicorn
│   │       ├── query.py                # sandboxed, time-limited query execution
│   │       ├── schemas.py              # Pydantic API models (camelCase JSON)
│   │       └── sql_guard.py            # sqlglot SQL validation
│   ├── .env.example
│   ├── pyproject.toml
│   └── README.md
│
└── README.md
```

## 📄 License

MIT
