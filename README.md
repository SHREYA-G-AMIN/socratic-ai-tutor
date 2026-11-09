# Socratic AI Tutor

Socratic AI Tutor lets students ask questions about uploaded PDF study material.
It retrieves relevant passages, uses Gemini for document-grounded tutoring,
preserves chat context, and adapts its explanations to explicit requests and
textual cues that a student may need more support.

## Implemented Features

- Upload a single PDF (10 MB maximum), extract readable text and page ranges,
  and chunk the extracted text for retrieval.
- Retrieve relevant passages with Gemini embeddings and cosine similarity.
  If embedding retrieval fails, the chat API falls back to keyword matches and
  reports `retrievalMode: "keyword"` with a warning.
- Use the existing Gemini chat call for Socratic guidance on ordinary questions
  and direct answers for summary, explanation, definition, comparison, and list
  requests.
- Detect explicit confusion, simpler-wording requests, repeated questions,
  unsuccessful-attempt language, and frustration cues in the current message
  and recent student history. These are instructional cues, not emotion
  diagnoses.
- Generate Mermaid visual explanations only when requested or likely to help
  explain a process. Diagrams must be supported by retrieved passages.
- Display source file, page or text-offset references with each tutor response.
- Render Mermaid diagrams in light/dark theme colors; show the source as text if
  parsing or rendering fails.

## Technology

| Area | Implementation |
|---|---|
| Application | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4 and theme CSS variables |
| PDF processing | `unpdf` on the server |
| Tutor responses | Gemini `gemini-3.5-flash-lite` |
| Embeddings | Gemini `gemini-embedding-001` by default; `GEMINI_EMBEDDING_MODEL` may override it |
| Diagrams | Mermaid 12, strict rendering mode |
| Tests | Node.js test runner with TypeScript source imports |

No persistent database is currently used. Documents and conversation state are
held by the client for the current browser session; document embedding vectors
are cached in process memory on a best-effort basis.

## Getting Started

Install dependencies and configure a server-side Gemini key:

```powershell
npm install
$env:GEMINI_API_KEY = "your-gemini-api-key"
npm run dev
```

Alternatively, put `GEMINI_API_KEY` in a local server environment file. Do not
prefix it with `NEXT_PUBLIC_` or expose it in browser code.

The application runs at `http://localhost:3000`. To run the PDF upload smoke
test against a running server:

```powershell
.\scripts\test-pdf-upload.ps1
```

## Validation

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## API Contracts

`POST /api/documents/upload` accepts one PDF in multipart field `file` and
returns extracted text, page ranges, counts, and truncation status.

`POST /api/chat` accepts `message`, `documentText`, optional `pageRanges`,
`fileName`, and `history`. Its response keeps the `reply`, `sources`, and
`retrievalMode` fields and may include `warning` and `diagram` (Mermaid source).
An invalid JSON or invalid chat payload returns HTTP 400; missing
`GEMINI_API_KEY` returns HTTP 503.

See [docs/architecture.md](./docs/architecture.md) for request flow and
[docs/task.md](./docs/task.md) for implementation status.

## Limitations

- Scanned/image-only PDFs are not OCR-processed.
- Upload processing is limited to 500 pages and 500,000 extracted characters.
- Semantic matching depends on embedding service availability and a similarity
  threshold. Keyword fallback can miss paraphrases.
- Confusion detection uses bounded text patterns and exact normalized question
  repetition; it does not assess correctness, sentiment, or a student's mental
  state.
- Chat history is not persisted across reloads or devices.
- Gemini output is not deterministically verified against every source claim.
  Prompts restrict course claims to retrieved passages, and citations identify
  the passages supplied to the model.
- Mermaid is model-generated. Invalid or oversized diagrams display as Mermaid
  source instead of an SVG preview.
- Visual rendering and chat endpoints have unit/API-route tests; a full browser
  end-to-end test suite and deployed environment are not configured.
