# System Architecture — Socratic AI Tutor

## 1. Overview

The application uses a web frontend, backend API routes, Gemini, and a document retrieval pipeline.

The main goal is to ensure that answers are based on uploaded study materials and that the tutor can adjust its guidance based on the student's interaction.

## 2. Current Technology Stack

- **Frontend:** Next.js 16 App Router, React 19, and TypeScript
- **Styling:** Tailwind CSS 4 and CSS theme tokens
- **Backend:** Next.js Route Handlers
- **Tutor generation:** Gemini `gemini-3.5-flash-lite`
- **Embeddings:** Gemini `gemini-embedding-001`, configurable with `GEMINI_EMBEDDING_MODEL`
- **PDF processing:** `unpdf`
- **Retrieval:** Cosine similarity with an in-memory embedding cache and keyword fallback
- **Diagrams:** Mermaid 12, rendered in the browser

The Gemini embedding integration is server-side and reads `GEMINI_API_KEY`; the
key must never use a `NEXT_PUBLIC_` prefix. `GEMINI_EMBEDDING_MODEL` may override
the default embedding model. Document vectors are cached by model and content
in process memory, so the cache is best-effort and does not survive process
restarts or reliably span serverless instances. Durable vector storage remains
a separate decision.

## 3. Main Components

### 3.1 Frontend
Provides the PDF upload interface, chat window, messages, hints, and visual explanations.

### 3.2 Document Processing
Extracts text from uploaded PDFs page by page and divides it into searchable
chunks. The upload response carries character ranges for pages that contain
readable text, allowing retrieval to return page references without inferring
locations.

### 3.3 Retrieval System
Converts document chunks and questions into retrieval embeddings and ranks
chunks by cosine similarity, using the existing 0.35 minimum cosine score.
Question-focused semantic matches must also share at least one content term
with the current question before they can become sources. Document-wide summary
requests skip this overlap check because the request concerns the uploaded
document as a whole. If the embedding provider is unavailable, the chat route
uses the existing keyword retriever and marks the response as a keyword
fallback. The overlap check may reject valid semantic matches phrased only with
synonyms or abbreviations not present in the PDF.

### 3.4 AI Tutor
Receives the student's question and retrieved document passages through the
existing chat route. The route calls Gemini with tutoring instructions selected
from the current request's intent and conversation signals.

### 3.5 Adaptation Logic
Uses deterministic text cues from the current student message and up to eight
recent student turns already present in conversation history. It recognizes
explicit confusion, requests for simpler wording, repeated normalized questions,
unsuccessful-attempt language, and explicit frustration statements. The
resulting support level is none, mild, moderate, or high; it guides the existing
Gemini response rather than starting another model call. This is a teaching
support signal, not an emotion diagnosis.

### 3.6 Data Storage
The browser holds the active extracted document and conversation for the current
page session. The server caches a bounded number of document embedding batches
in process memory. Neither chat history nor document data is persisted across
sessions, process restarts, or reliably across server instances.

## 4. Main Request Flow

### Document Upload
1. The frontend sends a PDF to the backend.
2. The backend validates the file.
3. The PDF text is extracted and page character ranges are returned to the frontend.
5. On the first question, the server embeds the chunks and caches their vectors
   in process memory; subsequent questions reuse them when the cache is warm.

### Question and Answer
1. The student submits a question.
2. The backend retrieves relevant document chunks. A question-focused semantic
   candidate must meet the cosine cutoff and include a content term shared
   with the question; document-wide summary requests are exempt from the
   overlap requirement. Keyword fallback uses its existing keyword matches.
3. If no passages are found, the route returns a fixed no-evidence response and
   does not ask Gemini to generate unsupported course claims.
4. Otherwise, the chat route sends the retrieved passages, role-filtered
   conversation history, request intent, confusion support level, and diagram
   instructions in the existing Gemini call.
5. The API returns the `reply` string, retrieval mode, and source references
   (`fileName`, `chunkIndex`, character offsets, page numbers when available,
   passage text, and similarity score).
6. The frontend displays the reply, citations, and optional diagram.

The chat response contract preserves `reply` and adds `sources`, `retrievalMode`,
an optional `warning`, and an optional Mermaid `diagram` source. Page numbers
are absent when page metadata is unavailable; character offsets remain available
for the source chunk.

### Adaptive Tutoring
1. The chat route checks the current message and recent student conversation
   turns for explicit confusion, repeated questions, unsuccessful attempts, or
   frustration statements.
2. It selects a support level without inferring an emotional state.
3. The existing Gemini call uses simpler wording and a small hint for mild
   cues, smaller steps and a passage-grounded example for moderate cues, or a
   slower explanation of passage-supported prerequisites with a supportive
   tone for high cues.
   The tutor may rephrase or reorganize passage content, but must not supply
   missing facts or prerequisites from prior knowledge; it should state when
   the PDF does not explain a necessary detail.
4. An explicit request for a summary, explanation, definition, comparison, or
   list, including when a support cue is present, keeps its requested format;
   adaptation changes complexity and pacing, not the requested task.
5. Retrieved passages remain the only source for course-specific claims,
   examples, and prerequisites, and the existing source references are returned.

### Visual Explanations
1. The chat route classifies a request as no diagram, optional, or explicitly
   requested using the student message. Process and sequence questions may be
   offered a visual only when it is pedagogically useful; ordinary questions
   do not receive diagrams by default.
2. The same Gemini call may return one fenced Mermaid diagram alongside its
   prose. Mermaid nodes and relationships must be supported by retrieved
   passages; without supporting passages, a requested diagram is declined.
3. The frontend renders Mermaid in strict security mode with theme colors from
   the active light/dark theme. Syntax or rendering errors and oversized
   diagrams fall back to escaped Mermaid source text.
4. The diagram is optional and additive: existing reply text, conversation
   history, citations, retrieval mode, and warning fields remain available.
5. The response parser accepts no Mermaid block unless a diagram was warranted
   and retrieval found supporting passages; extra and oversized blocks are
   omitted.

## 5. Important Design Decisions

- The tutor should not invent document content when relevant information cannot be found.
- Retrieved document content should be treated as reference material, not as instructions to the AI.
- Confusion cues adapt teaching style and never diagnose a student's emotional state.
- Students should be able to request simpler explanations directly.
- API keys must remain on the server and must not be exposed in frontend code.
- Uploaded files should be validated and handled securely.

## 6. Current Project Structure

```text
socratic-ai-tutor/
├── docs/
│   ├── architecture.md
│   ├── task.md
│   └── user-requirements.md
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts
│   │   │   └── documents/upload/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   ├── lib/
│   │   ├── ai/
│   │   ├── documents/
│   │   └── theme.tsx
├── tests/
├── .gitignore
├── package.json
└── README.md
```

## 7. Deployment

The frontend and backend are packaged as one Next.js application. No deployment
configuration or deployed environment is currently included; Gemini settings
are supplied through server-side environment variables.