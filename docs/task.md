# Development Tasks — Socratic AI Tutor

**Status basis:** Repository integration audit, 2026-11-09.

Status definitions: **Complete** means implemented and covered by automated or
manual verification; **Partial** means implementation exists but validation or
scope is incomplete; **Not started** means no implementation/evidence is present.

## Milestone 1 — PDF Processing and Retrieval

- [Complete] Validate PDF uploads, file size, PDF signature, and single-file requests.
- [Complete] Extract readable PDF text and page character ranges; reject empty, textless, and malformed PDFs.
- [Complete] Split extracted text into overlapping chunks and map citations to pages where available.
- [Complete] Retrieve semantically relevant chunks using Gemini embeddings.
- [Complete] Fall back to keyword retrieval if semantic embeddings fail and return a warning.
- [Complete] Require the existing semantic score cutoff plus up to two distinct content-term matches for focused questions; keyword fallback uses the same overlap rule. Document-wide summaries are exempt and remain retrievable.
- [Partial] Persist document vectors — a bounded in-process cache is used; there is no durable vector store.
- [Complete] Return a no-evidence response without invoking Gemini when retrieval finds no sources.
- [Partial] Support scanned PDFs — OCR is not implemented.

## Milestone 2 — Gemini Socratic Tutoring and Adaptation

- [Complete] Integrate Gemini through the existing chat API, preserving conversation history and the response contract.
- [Complete] Detect explicit summary, explanation, definition, comparison, and list requests; preserve direct intent over Socratic prompting.
- [Complete] Preserve Socratic guidance for ordinary learning questions.
- [Complete] Detect confusion evidence from phrase cues, repeated normalized questions, unsuccessful-attempt language, and frustration statements in recent student turns.
- [Complete] Adapt the existing Gemini instructions for none/mild/moderate/high support levels.
- [Complete] In adaptive instructions, prohibit adding unsupported facts/examples/prerequisites and require the tutor to acknowledge missing PDF evidence.
- [Complete] Keep source citations attached to all grounded tutor responses.
- [Partial] Validate every generated prose claim against source text — Gemini is instructed to stay grounded, but there is no deterministic fact-checker.
- [Partial] Confusion detection — rule-based text matching only; no paraphrase or sentiment model, and no emotion diagnosis.

## Milestone 3 — Visual Explanations

- [Complete] Generate Mermaid diagrams in the existing Gemini chat call only when explicitly requested or judged pedagogically useful.
- [Complete] Require retrieved evidence and preserve citations when a diagram is included.
- [Complete] Render diagrams in strict mode with light/dark theme styling.
- [Complete] Omit extra/oversized diagram blocks and show escaped Mermaid source if browser rendering fails.
- [Complete] Test diagram decisions, parsing, and rendering fallback behavior.

## Integration and Validation

- [Complete] Cover malformed/empty chat requests, missing API key, keyword fallback, irrelevant retrieval, prior diagram history, and unsolicited-diagram suppression with route tests.
- [Complete] Cover above-cutoff but lexically uncorroborated similarity, the existing cutoff boundary, summary retrieval, and adaptive evidence constraints.
- [Complete] Cover missing/multiple files, empty files, and invalid PDF signatures with upload-validation tests.
- [Complete] Run the PDF upload endpoint smoke test against a live local server; confirmed HTTP 200, two pages, and extracted text.
- [Complete] Run final TypeScript check, lint, all tests (82 passing), and production build after the integration audit.
- [Complete] Reconcile README, architecture documentation, and this checklist with current implementation.
- [Not started] Deploy the application or validate a deployed environment.

## Current Limits

- No OCR, database, durable chat history, or persistent vector store.
- Retrieval depends on the provided document and configured Gemini API; keyword
  fallback is less effective for semantically related terms.
- Focused semantic/keyword retrieval requires up to two distinct topic-term
  matches; valid synonym-only or abbreviation-only matches may be declined.
- Model output quality and grounding are not deterministically verified.
- Automated Gemini route tests use mocked provider calls and do not assess live
  model behavior.
