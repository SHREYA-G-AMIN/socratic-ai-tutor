# Development Tasks — Socratic AI Tutor

**Timeline:** 1 month  
**Team size:** 2 members

## Status Key and Audit Basis

- **Complete** — implemented and verified with available automated checks.
- **Partial** — implementation exists, but verification or a planned capability remains.
- **Not started** — no implementation or completion evidence was found.

Statuses reflect the source and tests reviewed on 2026-11-09. Browser end-to-end
testing and deployment were not performed.

## Week 1 — Research and Project Setup

### Project Planning
- [Partial] Review and finalise requirements — PRD and user requirements are documented; formal review/sign-off is not evidenced.
- [Not started] Research existing AI tutors and document differentiating requirements.
- [Partial] Research confusion and frustration detection — a deterministic cue-based implementation exists, but no comparative research report is documented.
- [Partial] Compare LLM and embedding providers — Gemini is selected and integrated; no provider comparison is documented.
- [Partial] Decide document processing and storage — PDF extraction uses `unpdf`; durable document/chunk storage is not implemented.
- [Complete] Document the implemented architecture and request flow (`docs/architecture.md`).

### Development Setup
- [Complete] Create the Next.js application with TypeScript.
- [Complete] Configure Tailwind CSS and theme styles.
- [Partial] Set up repository collaboration workflow — the repository exists; a collaboration workflow is not evidenced.
- [Complete] Implement PDF upload and chat UI, including source references, hints, and diagrams.
- [Complete] Document server-side Gemini environment variables in `.env.example`.

**Milestone: Partial** — the application is implemented; comparative research,
formal sign-off, and collaboration process remain.

## Week 2 — PDF Processing and Retrieval

### Document Handling
- [Complete] Upload and validate PDFs — size, file signature, empty file, and single-file checks are implemented.
- [Complete] Extract and normalize PDF text page by page with configured page and character limits.
- [Complete] Chunk extracted text with overlap for retrieval.
- [Complete] Reject empty, textless, and corrupted documents with explicit errors.
- [Partial] Support scanned PDFs — OCR is not implemented.
- [Partial] Test varied PDF study materials — the upload smoke test covers a readable sample and common invalid files; broader corpus testing is outstanding.

### Retrieval and Chat
- [Complete] Embed chunks and student queries with Gemini retrieval-specific task types.
- [Partial] Store chunk embeddings — a process-memory cache exists; there is no durable vector store.
- [Complete] Retrieve semantically relevant chunks using cosine similarity.
- [Complete] Fall back to keyword retrieval when embeddings are unavailable and expose the retrieval mode/warning.
- [Complete] Send the question and retrieved passages to Gemini through the existing chat API.
- [Partial] Handle unsupported questions — empty retrieval is explicit and citations remain empty, but grounding is prompt-based rather than mechanically verified.
- [Complete] Return source citations with passage text and character offsets; include page references when available.

**Milestone: Complete** — PDF extraction, chunking, semantic retrieval, fallback,
and Gemini response generation are wired. OCR and durable storage remain out of
scope.

## Week 3 — Socratic Tutoring and Adaptation

### Tutoring Intent and Conversation
- [Complete] Preserve Socratic guidance for ordinary learning questions.
- [Complete] Detect direct requests for summaries, explanations, definitions, comparisons, and lists.
- [Complete] Avoid forcing a follow-up question for explicit direct-information requests.
- [Complete] Pass filtered conversation history to Gemini and retain diagram source in prior tutor turns.
- [Partial] Provide progressive hints — a contextual Hint action exists, but there is no multi-stage hint ladder.
- [Partial] Avoid revealing full solutions prematurely — instructions guide ordinary questions; no deterministic disclosure check exists.

### Confusion and Adaptive Explanations
- [Complete] Detect explicit confusion, simpler-wording requests, repeated questions, unsuccessful-attempt language, and frustration statements from bounded conversation history.
- [Complete] Select none/mild/moderate/high support and adapt the existing Gemini instructions, not a separate model pipeline.
- [Complete] Adapt explicit response formats without overriding the requested summary, definition, comparison, or explanation.
- [Complete] Test confusion cues, severity, adaptive instructions, and explicit-intent compatibility.
- [Partial] Evaluate detection against broader student language — the rule-based detector is not sentiment analysis and may miss paraphrased cues.

### Visual Support
- [Complete] Generate Mermaid flowcharts, concept maps, process diagrams, or stepwise breakdowns only when requested or pedagogically useful.
- [Complete] Ground diagram instructions in retrieved passages and prohibit unsupported nodes or relationships.
- [Complete] Render diagrams in the chat UI with strict Mermaid settings and light/dark theme styles.
- [Complete] Fall back to escaped Mermaid source on invalid or oversized diagrams.
- [Complete] Test diagram decisions, Mermaid extraction, response handling, and rendering fallback.

**Milestone: Complete** — intent-aware tutoring, confusion adaptation, and
conditional Mermaid explanations are integrated into the existing chat flow.
Model grounding remains prompt-based.

## Week 4 — Integration, Testing, and Deployment

### Integration Audit
- [Complete] Audit upload, extraction, chunking, retrieval, Gemini chat, citations, history, adaptation, diagrams, and UI integration.
- [Complete] Return HTTP 400 for malformed JSON chat requests.
- [Complete] Restrict repeated-message confusion detection to question-like text.
- [Complete] Test missing API keys, invalid chat inputs, retrieval fallback, irrelevant questions, explicit confused summaries, history, citations, and malformed Mermaid responses at the API route.
- [Partial] Exercise the complete UI in a browser — automated browser end-to-end coverage is not configured.
- [Partial] Review API security and resource limits — upload checks exist; chat request-body limits and document/chat access controls are not implemented.

### Validation and Delivery
- [Partial] Run type-check, lint, all tests, production build, and the PDF upload smoke test after the integration audit.
- [Not started] Deploy the application and test the deployed version.
- [Complete] Update README setup, API contract, implemented capabilities, and limitations (`README.md`).
- [Complete] Reconcile architecture and task checklist with the current implementation.
- [Not started] Prepare a demonstration using a realistic student scenario.

**Milestone: Partial** — integration fixes and route-level tests are in place;
final validation, browser testing, and deployment remain.

## Remaining Limitations

- No OCR for scanned PDFs.
- No durable document, vector, or conversation storage.
- Confusion cues are deterministic text patterns, not a diagnosis or assessment
  of correctness.
- Gemini output is constrained by retrieved passages in its prompt but is not
  deterministically checked claim by claim.
- No automated browser end-to-end suite or deployed environment.

## Definition of Done

A feature is complete when it works in the application, handles common errors,
has relevant automated coverage, and is integrated with the rest of the
application. A task is not complete simply because its code has been written.
