# Socratic AI Tutor

**An AI-powered adaptive learning platform that transforms personal study materials into an interactive, personalized learning experience.**

Socratic AI Tutor helps students understand concepts through document-grounded AI conversations, Socratic guidance, adaptive explanations, semantic search, and visual learning. Students can upload their study materials, ask questions, explore cited sources, and track their learning activity in one place.

## Live Demo

[**Try Socratic AI Tutor**](https://socratic-ai-tutor-alpha.vercel.app/)

## Key Features

### 1. Document-Grounded AI Tutoring
- Upload PDF textbooks, lecture notes, and study materials.
- Extract content while preserving page-level references.
- Ask natural-language questions based on uploaded documents.
- Generate context-aware explanations using retrieved document passages.
- Avoid unsupported answers through evidence-based retrieval.

### 2. Socratic Learning Approach
- Encourage independent thinking through hints and guiding questions.
- Provide direct explanations when students request definitions, summaries, comparisons, or examples.
- Break complex concepts into smaller, understandable steps.
- Support learning through interactive question-and-answer conversations.

### 3. Adaptive Learning
- Detect confusion, repeated questions, simplification requests, and difficulty cues.
- Adapt explanations based on the learner's conversational context.
- Provide simpler explanations, additional guidance, and everyday analogies.
- Adjust the level of instructional support to help students understand difficult concepts.

### 4. Semantic Search and Retrieval
- Generate document embeddings using Google's Gemini embedding model.
- Retrieve contextually relevant passages using semantic similarity.
- Combine semantic retrieval with lexical matching for stronger evidence selection.
- Maintain document-grounded context for AI-generated responses.

### 5. Source Explorer
- Interactive citations linked to uploaded study materials.
- View the exact passages supporting AI-generated answers.
- Navigate between multiple cited sources.
- Inspect PDF page references and highlighted source content.

### 6. Visual Explanations
- Generate Mermaid diagrams for suitable concepts and processes.
- Provide structured visual representations of complex topics.
- Ground visual explanations in retrieved document content.

### 7. Learning Dashboard
- Overview of uploaded documents and learning activity.
- Track conversation and question activity.
- View recently studied documents.
- Access learning resources from a centralized dashboard.

### 8. Document Library
- Upload and manage study materials.
- View document details, page counts, and upload dates.
- Reopen documents and continue learning.
- Responsive document management interface.

### 9. User Experience
- User authentication with login and signup.
- Conversation history and navigation.
- Guided welcome experience for new users.
- Responsive interface for desktop and mobile.
- Light and dark themes.

## Technology Stack

| Category | Technologies |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Authentication & Database | Supabase |
| AI Model | Google Gemini |
| Embeddings | Gemini `gemini-embedding-001` |
| PDF Processing | unpdf, Gemini PDF Vision, Tesseract.js |
| Semantic Retrieval | Vector Embeddings, Cosine Similarity |
| Visualization | Mermaid |
| Testing | Node.js Test Runner, TypeScript, ESLint |

## System Architecture

```text
             Student
                |
                v
       Next.js Web Application
                |
       +--------+---------+
       |        |         |
   Dashboard  Document  Tutor Chat
              Library
                |
                v
          Next.js API
                |
       +--------+---------+
       |                  |
   PDF Processing    AI Retrieval
   & Text Extraction  & Embeddings
       |                  |
       |             Gemini Embeddings
       |                  |
       +--------+---------+
                |
                v
         Retrieved Context
                |
                v
          Gemini AI Tutor
                |
       +--------+---------+
       |        |         |
    Adaptive  Citations  Visual
   Explanations          Diagrams
       |        |         |
       +--------+---------+
                |
                v
        Interactive Learning
             Experience

       Supabase
   Authentication & Data
```

## Application Workflow

1. **Upload:** Students upload PDF study materials through the document library.
2. **Extraction:** The application extracts document text and preserves page references.
3. **Embedding:** Extracted content is divided into chunks and converted into vector embeddings.
4. **Retrieval:** Relevant passages are retrieved using semantic similarity and lexical matching.
5. **Tutoring:** Gemini generates responses using the student's question and retrieved document context.
6. **Adaptation:** The tutor adjusts its explanation style based on the learner's difficulty cues.
7. **Source Exploration:** Students can inspect the passages and document references supporting each answer.
8. **Progress:** Students revisit their materials and explore their learning activity through the dashboard.

## Getting Started

### Prerequisites
- Node.js
- npm
- Supabase project
- Google Gemini API key

### Installation

```bash
git clone https://github.com/SHREYA-G-AMIN/socratic-ai-tutor.git

cd socratic-ai-tutor

npm install
```

### Environment Variables

Create a `.env.local` file in the project root and configure the required credentials:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Also configure the Supabase URL and anon/publishable key using the environment variable names expected by the application.

Keep all secret keys server-side. Never expose the Gemini API key through a `NEXT_PUBLIC_` variable.

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing and Validation

```bash
# Run tests
npm test

# TypeScript validation
npx tsc --noEmit

# Run lint
npm run lint

# Production build
npm run build
```

## Project Structure

```text
socratic-ai-tutor/
├── docs/
│   └── user-requirements.md
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── learning-path/
│   │   ├── my-documents/
│   │   └── page.tsx
│   ├── components/
│   ├── lib/
│   │   ├── ai/
│   │   └── documents/
│   └── types/
├── supabase/
│   └── migrations/
├── tests/
├── package.json
└── README.md
```

## Core Objective

Socratic AI Tutor aims to make AI-assisted education more personalized, interactive, and transparent by combining document-grounded question answering, adaptive teaching strategies, semantic retrieval, and source-backed explanations.

**Built with Next.js, TypeScript, Supabase, and Google Gemini.**
