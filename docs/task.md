# Development Tasks — Socratic AI Tutor

**Status basis:** Repository readiness audit, 2026-11-24.

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
- [Partial] Implement Supabase Postgres persistence for document vectors using content/model hashes, with a bounded in-process fallback. Automated REST tests pass; applying the migration and validating against the project's live Supabase instance remain pending.
- [Complete] Return a no-evidence response without invoking Gemini when retrieval finds no sources.
- [Partial] Implement page-aware Gemini PDF OCR for pages without a text layer, preserving original page numbers and character ranges. Mocked provider tests pass; a real scanned-PDF/Gemini integration test remains pending.

## Milestone 2 — Gemini Socratic Tutoring and Adaptation

- [Complete] Integrate Gemini through the existing chat API, preserving conversation history and the response contract.
- [Complete] Bound provider conversation context to the latest 12 valid turns and test that older turns are excluded.
- [Complete] Detect explicit summary, explanation, definition, comparison, and list requests; preserve direct intent over Socratic prompting.
- [Complete] Preserve Socratic guidance for ordinary learning questions.
- [Complete] Detect confusion evidence from interaction cues, repeated questions, answers repeated after explicit correction, unsuccessful attempts, and frustration statements in recent student turns.
- [Complete] Adapt the existing Gemini instructions for none/mild/moderate/high support levels.
- [Complete] Carry recent difficulty into later turns and progressively request simpler wording, smaller steps, a different explanation strategy, and one relevant Socratic check-in without repeating the prior explanation.
- [Complete] In adaptive instructions, prohibit adding unsupported facts/examples/prerequisites and require the tutor to acknowledge missing PDF evidence.
- [Complete] Show a conversation-scoped learning indicator for explicitly tutor-confirmed answers, corrections, hint requests, and recurring support cues; do not score or claim mastery.
- [Complete] Reset conversation and progress when the active document changes; remove failed chat attempts so they do not count as learning evidence.
- [Complete] Keep source citations attached to all grounded tutor responses.
- [Partial] Validate every generated prose claim against source text — Gemini is instructed to stay grounded, but there is no deterministic fact-checker.
- [Complete] Extend rule-based confusion detection to common natural-language difficulty phrases and conservative paraphrases of repeated questions; no sentiment model or emotion diagnosis is used.

## Milestone 3 — Visual Explanations

- [Complete] Generate structured flowchart and concept diagrams in the existing Gemini chat call only when explicitly requested or judged pedagogically useful.
- [Complete] Validate strict diagram schemas and exact source quotes for every node and relationship against retrieved passages; preserve the existing response fields and citations.
- [Complete] Render diagrams in strict mode with light/dark theme styling.
- [Complete] Omit malformed, unsupported, extra, or oversized diagram output and provide an accessible fallback when browser rendering is unavailable.
- [Complete] Verify diagram rendering, fallback behavior, and narrow-screen layout in the browser.

## Integration and Validation

- [Complete] Cover malformed/empty chat requests, missing API key, keyword fallback, irrelevant retrieval, prior diagram history, and unsolicited-diagram suppression with route tests.
- [Complete] Cover above-cutoff but lexically uncorroborated similarity, the existing cutoff boundary, summary retrieval, and adaptive evidence constraints.
- [Complete] Cover missing/multiple files, empty files, and invalid PDF signatures with upload-validation tests.
- [Complete] Run the PDF upload endpoint smoke test against a live local server; confirmed HTTP 200, two pages, and extracted text.
- [Complete] Maintain targeted tests for confusion, adaptive prompts, learning progress, retrieval, citations, diagram validation, and API behavior.
- [Complete] Run the full test suite, TypeScript, ESLint, and production build in automated CI; all checks pass on the readiness PR.
- [Complete] Reconcile README, architecture documentation, and this checklist with current implementation.
- [Not started] Deploy the application or validate a deployed environment.
- [Complete] Add GitHub Actions CI for install, tests, TypeScript, lint, and production build.

## Current Limits

- Durable vector storage is implemented but not live-verified; it requires applying the Supabase migration and configuring server-only credentials. Chat history remains session-scoped and is not persisted.
- Retrieval depends on the provided document and configured Gemini API; keyword
  fallback is less effective for semantically related terms.
- Focused semantic/keyword retrieval requires up to two distinct topic-term
  matches; valid synonym-only or abbreviation-only matches may be declined.
- Model output quality and grounding are not deterministically verified.
- Learning-progress feedback is a conservative conversation summary based on explicit tutor wording and interaction cues; it is not an independent correctness checker or mastery assessment.
- Confusion detection uses text rules, a small phrase/alias set, and recent conversation turns; novel paraphrases may still be missed. It does not infer or diagnose a student's emotional state.
- Automated Gemini route tests use mocked provider calls and do not assess live
  model behavior.
