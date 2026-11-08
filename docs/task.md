# Development Tasks — Socratic AI Tutor

**Timeline:** 1 month  
**Team size:** 2 members

## Status Key and Audit Basis

- **Complete** — implemented and verified with the available checks.
- **Partial** — some implementation exists, but requirements or verification are missing.
- **Not started** — no implementation or evidence of completed research was found.

This status reflects the repository audit on 2026-11-08, not earlier reports. Evidence inspected includes the application source, documentation, tests, and scripts. `npm test` passed (32 tests); the PDF upload smoke test passed (11 checks). No automated tests were found for chat API behavior, LLM responses, tutoring/adaptation, visuals, or deployment.

## Week 1 — Research and Project Setup

### Project Planning
- [Partial] Review and finalise the requirements — PRD and user requirements are documented, but review/sign-off is not evidenced (`docs/prd.md`, `docs/user-requirements.md`).
- [Not started] Research existing AI tutors and identify what our implementation should do differently — no research findings found.
- [Not started] Research text-based confusion and frustration detection — no research findings or detection implementation found.
- [Not started] Compare available LLM and embedding options — no comparison found; no LLM or embedding integration exists.
- [Partial] Decide the PDF processing and document storage approach — PDF extraction uses `unpdf`; persistent document/chunk storage has not been selected or implemented (`src/lib/documents/pdf-extractor.ts`).
- [Partial] Finalise the initial architecture — an architecture document exists, but its proposed LLM, embeddings, retrieval, and storage flow is not implemented (`docs/architecture.md`).

### Development Setup
- [Complete] Create the Next.js application with TypeScript — application and TypeScript configuration exist.
- [Complete] Configure Tailwind CSS — dependency and application styles are present.
- [Partial] Set up the GitHub repository and collaboration workflow — the repository exists; a collaboration workflow is not evidenced.
- [Partial] Create the basic home page and chat layout — the responsive upload/chat UI exists, but the chat is not yet a tutoring conversation (`src/app/page.tsx`).
- [Not started] Configure environment variables — no environment template or AI-service configuration was found.

**Milestone: Partial** — the application runs and has a basic UI; research, final decisions, and a working tutor are outstanding.

## Week 2 — PDF Processing and Retrieval

### Document Handling
- [Complete] Implement PDF upload — frontend and server endpoint are connected; upload smoke test passed (`src/components/PdfUploader.tsx`, `src/app/api/documents/upload/route.ts`).
- [Complete] Validate uploaded files — checks include size, PDF signature, and empty files; invalid upload cases passed the smoke test (`src/lib/documents/validation.ts`).
- [Complete] Extract text from PDFs — server-side extraction, normalization, page limits, and output cap are implemented; the smoke test extracted the sample PDF (`src/lib/documents/pdf-extractor.ts`).
- [Complete] Divide extracted text into searchable chunks — overlapping chunks are implemented and covered by unit tests (`src/lib/documents/chunker.ts`).
- [Complete] Handle empty or unreadable documents — empty, textless, and corrupted PDFs are rejected with errors in the smoke test. Scanned PDFs require OCR, which is not supported.

### Retrieval and AI
- [Not started] Set up the embedding model — no embedding code or dependency found.
- [Not started] Store document chunks and their embeddings — no database or persistent storage implementation found.
- [Partial] Retrieve content relevant to a question — keyword-overlap retrieval is implemented and unit-tested; it is not semantic retrieval and may miss relevant passages with different wording (`src/lib/documents/retrieval.ts`).
- [Not started] Integrate the LLM API — `/api/chat` does not call an LLM.
- [Not started] Generate answers using retrieved document content — the API returns matching excerpts, not generated answers (`src/app/api/chat/route.ts`).
- [Partial] Handle questions that are not supported by the uploaded material — the API returns a “could not find relevant passages” message when no keywords match; this is not model-based grounding or a semantic support check.

### Interface Integration
- [Complete] Connect PDF upload to the backend — wired and verified by the upload smoke test.
- [Partial] Build the basic chat interaction — messages reach `/api/chat`, but only the current message and full document text are sent; replies are excerpts, not tutor responses.
- [Partial] Display loading and error states — upload and chat UI states exist, but chat behavior has no route/UI integration tests.

**Milestone: Partial** — a PDF can be uploaded, extracted, chunked, and searched by keywords; LLM-based question answering is not implemented.

## Week 3 — Socratic Tutoring and Adaptation

### Socratic Tutoring
- [Not started] Design and test tutoring instructions — no system prompt or prompt tests found.
- [Partial] Implement guiding questions and progressive hints — a Hint button adds one fixed, tree-specific message; there is no contextual Socratic guidance (`src/app/page.tsx`).
- [Not started] Maintain relevant conversation context — displayed messages are not sent to the chat API.
- [Partial] Allow students to request additional help — the fixed Hint button exists, but it does not request or generate context-aware help.
- [Not started] Avoid revealing complete solutions too early — no tutor or response policy is implemented.

### Adaptive Learning
- [Not started] Research and select a practical text-based difficulty detection approach — no research or approach found.
- [Not started] Identify explicit confusion signals and repeated requests for help — no detection logic found.
- [Not started] Track repeated unsuccessful attempts where applicable — no attempt tracking found.
- [Not started] Implement simpler explanations and smaller learning steps — no adaptation logic found.
- [Not started] Test when the tutor should change its strategy — no adaptation tests found.

### Visual Support
- [Not started] Choose a simple approach for diagrams or flowcharts — no implementation choice found.
- [Not started] Add basic visual explanations for suitable topics — no explanatory diagrams or flowcharts found.

**Milestone: Not started** — the current fixed Hint message does not meet the Socratic tutoring or adaptation milestone.

## Week 4 — Integration, Testing, and Deployment

### Integration
- [Partial] Connect all features into one application — upload, keyword retrieval, and the chat endpoint are wired; AI tutoring, adaptation, and visual support are missing.
- [Partial] Improve the user interface and mobile layout — responsive layout and theme controls exist, but the learning flow is incomplete and mobile behavior is not tested.
- [Partial] Add appropriate loading, error, and empty states — upload/chat loading and error UI exists; end-to-end state behavior is not tested.
- [Partial] Review API validation and security — upload validation and limits are implemented; chat request shape/size is not validated, and document/chat access controls are not implemented.

### Testing
- [Partial] Test different PDF documents — upload smoke tests cover one readable sample plus invalid, oversized, textless, and corrupted files; varied study materials are not covered.
- [Partial] Test relevant and irrelevant questions — retrieval unit tests cover keyword matches and no-match cases; chat scenarios are not tested.
- [Not started] Check whether answers are supported by retrieved content — the API returns excerpts and does not generate or verify answers.
- [Partial] Test Socratic hints and follow-up questions — only the fixed Hint UI exists; no behavior tests or conversation-context tests found.
- [Not started] Test adaptation after repeated difficulty — no adaptation implementation or tests found.
- [Not started] Fix bugs found during testing — no test-failure/fix record found.

### Deployment and Demonstration
- [Not started] Deploy the application — no deployment configuration or evidence of a deployed environment found.
- [Not started] Test the deployed version — no deployed target or test evidence found.
- [Partial] Update the README and setup instructions — README exists but still describes planned LLM, embedding, vector storage, adaptive tutoring, and deployment as project capabilities/plan; it does not clearly distinguish implemented functionality.
- [Not started] Prepare a short demonstration using a realistic student scenario — no demo materials found.
- [Not started] Document limitations and known issues — limitations such as keyword-only retrieval, no LLM, and no OCR are not documented in the README.

**Milestone: Not started** — no deployed MVP or demonstration evidence found.

## Priority Order

**P0 — Essential**
- [Complete] PDF upload and text extraction.
- [Partial] Retrieval-based question answering — keyword retrieval exists, but answer generation and semantic retrieval do not.
- [Partial] Socratic guidance — only a fixed Hint message is present.
- [Not started] Basic adaptive responses.
- [Partial] Reliable end-to-end workflow — upload works; the full tutoring workflow is incomplete and not integration-tested.

**P1 — Important**
- [Not started] Better detection of possible learning difficulty.
- [Not started] Source references — retrieval results do not expose usable document/page citations in chat.
- [Not started] Basic visual explanations.
- [Partial] Improved error handling and interface polish — upload errors and responsive layout exist; broader chat/API behavior needs validation.

**P2 — Optional**
- [Not started] Advanced visual generation.
- [Not started] Additional document formats.
- [Not started] Learning analytics and progress dashboards.
- [Not started] Voice or facial emotion recognition.

P2 tasks should only be considered if the essential features are complete and tested.

## Definition of Done

A feature is complete when it works in the application, handles common errors, has been tested, and is integrated with the rest of the application. A task is not complete simply because its code has been written.
