# Socratic AI Tutor

**A document-grounded AI tutor with Socratic guidance**

## Overview

Socratic AI Tutor uses uploaded PDF study materials to provide grounded explanations, Socratic guidance, and optional visual diagrams. It uses Gemini for retrieval embeddings and tutor responses, with a keyword fallback when semantic retrieval is unavailable.

## Problem Statement

Traditional AI chatbots often provide direct answers rather than encouraging independent thinking. They may also generate information outside a student's syllabus and fail to adapt their explanations when a student struggles to understand a concept.

Socratic AI Tutor aims to provide a more personalized learning experience through syllabus-grounded responses, guided problem-solving, and adaptive teaching strategies.

## Key Features

### 1. Document-Grounded Tutoring
- Upload readable PDFs (up to 10 MB and 500 pages).
- Retrieve semantically relevant passages, with a keyword fallback if embeddings fail.
- Return passage citations with filename and page numbers when available, otherwise text offsets.
- Decline to answer when retrieval finds no supporting passages.

### 2. Socratic and Direct Answers
- Use hints and leading questions for ordinary learning questions.
- Answer explicit summary, explanation, definition, comparison, and list requests directly.
- Adapt wording and step-by-step detail to text-based confusion cues in recent student turns.

### 3. Adaptive Guidance
- Detect explicit confusion, simplification requests, repeated questions, unsuccessful-attempt language, and frustration statements.
- Adjust instructions for mild, moderate, and high support levels.
- These deterministic cues guide teaching only; the app does not diagnose a student's emotional state.

### 4. Visual Explanations
- Include Mermaid diagrams for explicit requests and selectively for process/sequence questions.
- Ground diagram instructions in retrieved passages and render with strict Mermaid security settings.
- Fall back to visible Mermaid source when rendering fails.

## Current Technology

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript | Web app and chat UI |
| Styling | Tailwind CSS 4 and theme tokens | Responsive light/dark styling |
| Tutor and embeddings | Gemini `gemini-3.5-flash-lite`, `gemini-embedding-001` | One chat generation call and semantic retrieval |
| PDF processing | `unpdf` | Server-side text and page-range extraction |
| Retrieval | Cosine similarity with in-memory embedding cache; lexical corroboration; keyword fallback | Select relevant passages and citations |
| Diagrams | Mermaid 12 | Render optional, passage-grounded diagrams |

No database or durable conversation store is currently configured. The Gemini
API key is server-only and must be provided as `GEMINI_API_KEY`. The embedding
model can be overridden with `GEMINI_EMBEDDING_MODEL`.

## System Workflow

1. The upload route validates a PDF, extracts readable text and page ranges, and returns them to the browser. Scanned PDFs without a text layer are rejected.
2. The chat route chunks the extracted text and retrieves passages using Gemini embeddings. Question-focused semantic matches must meet the existing cosine cutoff and share at least one content term with the question; document-wide summary requests do not require term overlap. On embedding failure, keyword matching is used.
3. If no passages are found, the route returns a fixed no-evidence response without calling Gemini.
4. Otherwise, it sends retrieved passages, intent/adaptation instructions, and the existing conversation history to Gemini once.
5. The response includes tutor text, citations, retrieval mode, optional warning, and an optional Mermaid diagram.
6. The browser renders diagrams using current theme colors; malformed or oversized diagrams are shown as text.

## Development

```powershell
npm install
npm run dev
```

Set `GEMINI_API_KEY` in the local server environment before using chat or
semantic retrieval. Do not expose it through a `NEXT_PUBLIC_` variable.

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## Project Structure

```text
socratic-ai-tutor/
├── docs/
│   ├── architecture.md
│   ├── design.md
│   ├── prd.md
│   ├── rules.md
│   ├── task.md
│   └── user-requirements.md
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts
│   │   │   └── documents/upload/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   └── lib/
│       ├── ai/
│       └── documents/
├── tests/
├── .gitignore
├── package.json
└── README.md
```

## Current Limitations

- Confusion detection uses phrase patterns and exact normalized question repeats; paraphrase/sentiment recognition is not implemented.
- Semantic matching also requires lexical corroboration for question-focused requests. This can decline relevant passages when a question uses only synonyms or abbreviations absent from the PDF; document-wide summaries are exempt from the overlap check.
- Gemini grounding and diagram correctness are instructed and no-evidence outputs are suppressed, but supported prose is not deterministically fact-checked.
- Embedding cache is in-process and bounded; it is not durable across restarts or instances.
- No OCR, database, persisted chat history, or deployment configuration is included.
- Automated route tests mock Gemini and embeddings; they do not measure live-model answer quality.
