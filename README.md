# Socratic AI Tutor

**An Emotion-Aware, Syllabus-Bounded AI Tutor**

## Overview

Socratic AI Tutor is an AI-powered educational web application that helps students understand concepts and solve problems independently. It uses uploaded study materials to provide syllabus-relevant answers, guides students through Socratic questioning, and adapts explanations based on potential signs of confusion or frustration.

## Problem Statement

Traditional AI chatbots often provide direct answers rather than encouraging independent thinking. They may also generate information outside a student's syllabus and fail to adapt their explanations when a student struggles to understand a concept.

Socratic AI Tutor aims to provide a more personalized learning experience through syllabus-grounded responses, guided problem-solving, and adaptive teaching strategies.

## Key Features

### 1. Syllabus-Bounded AI Tutoring
- Upload textbooks, lecture notes, and syllabus documents in PDF format.
- Ask questions based on uploaded study materials.
- Retrieve relevant content to ground AI-generated responses.
- Redirect questions when sufficient supporting material is unavailable.

### 2. Socratic Learning
- Guide students through questions and progressive hints.
- Encourage independent reasoning instead of immediately revealing answers.
- Break complex problems into smaller, manageable steps.

### 3. Emotion-Aware Adaptive Learning
- Identify potential confusion or frustration through text-based interaction cues.
- Consider repeated unsuccessful attempts and requests for help.
- Adapt explanations by simplifying concepts, changing the guidance strategy, or providing additional hints.

### 4. Visual Explanations
- Provide relevant diagrams and flowcharts when useful.
- Present complex concepts through simpler, structured explanations.

Emotion detection will be treated as an estimate rather than a definitive judgment of a student's emotional state.

## Proposed Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js, React | Build the web application |
| Language | TypeScript | Type-safe application development |
| Styling | Tailwind CSS | Responsive user interface |
| Backend | Next.js Route Handlers | API endpoints and application logic |
| LLM | LLM API | Generate explanations and Socratic questions |
| AI Retrieval | Retrieval-Augmented Generation (RAG) | Ground responses in uploaded materials |
| PDF Processing | Compatible PDF parsing library | Extract text from documents |
| Embeddings | Embedding model | Enable semantic document retrieval |
| Vector Storage | PostgreSQL with pgvector or a managed vector store | Store and retrieve document embeddings |
| Database | PostgreSQL | Store document metadata and learning sessions |
| ORM | Drizzle ORM or Prisma | Database access and management |
| Validation | Zod | Validate inputs and API data |
| Version Control | Git and GitHub | Track and manage code |
| Deployment | Vercel or equivalent | Deploy the web application |

The final selection of AI models, libraries, and storage services will be made during the initial research phase.

## System Workflow

1. The student uploads a PDF containing study materials.
2. The application extracts the text and divides it into smaller chunks.
3. The system generates embeddings and indexes the document content for retrieval.
4. The student asks a question through the chat interface.
5. Relevant content is retrieved and supplied to the AI model as context.
6. The tutor generates a syllabus-grounded response using questions, hints, and explanations.
7. Interaction cues and repeated unsuccessful attempts help determine whether additional support may be needed.
8. The tutor adapts its guidance and provides visual explanations when appropriate.

## Proposed Project Structure

```text
socratic-ai-tutor/
├── docs/
│   ├── user-requirements.md
│   ├── architecture.md
│   └── emotion-detection-research.md
├── public/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── chat/
│   │   └── api/
│   ├── components/
│   ├── lib/
│   │   ├── ai/
│   │   ├── retrieval/
│   │   ├── documents/
│   │   └── adaptation/
│   └── types/
├── tests/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

The structure may be adjusted as implementation progresses.

## One-Month Development Plan

### Week 1: Research and Setup
- Finalize project requirements and MVP scope.
- Research text-based emotion detection and adaptive tutoring approaches.
- Evaluate suitable LLMs, embedding models, and document-processing libraries.
- Finalize the system architecture and technology stack.
- Set up the Next.js project, GitHub repository, and basic user interface.

**Milestone:** Working project setup with a finalized architecture.

### Week 2: Document Processing and AI Chat
- Implement PDF upload and text extraction.
- Split documents into chunks and generate embeddings.
- Implement semantic retrieval for relevant study material.
- Integrate the LLM API with retrieved context.
- Build the chat interface and handle unsupported questions.

**Milestone:** Students can upload study materials and ask questions grounded in their documents.

### Week 3: Socratic Tutoring and Adaptation
- Implement guided questions and progressive hints.
- Maintain relevant conversation context.
- Develop basic text-based confusion and frustration cues.
- Adapt explanations based on interaction patterns.
- Implement basic diagram or flowchart generation.

**Milestone:** An interactive tutor that guides students and adapts its explanations.

### Week 4: Integration, Testing, and Deployment
- Integrate all features into a complete application.
- Test different documents, questions, and tutoring scenarios.
- Verify response relevance and source grounding.
- Test adaptive guidance and visual explanations.
- Fix bugs and refine the user interface.
- Deploy the application and prepare a working demonstration.

**Milestone:** A deployed MVP demonstrating syllabus-grounded tutoring, Socratic guidance, and adaptive learning.

## Expected Outcome

A functional AI tutoring web application that helps students learn from their own study materials, encourages independent problem-solving, and adapts its guidance when they appear to struggle.
