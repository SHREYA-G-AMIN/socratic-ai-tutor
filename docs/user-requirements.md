# User Requirements Document

## Project Title
**Socratic AI Tutor — An Emotion-Aware, Syllabus-Bounded AI Tutor**

### 1. Problem Statement
Most AI tutors provide direct answers instead of encouraging independent problem-solving. They may also provide information outside the student's course materials and fail to adapt their teaching approach when students experience confusion or frustration.

The proposed system aims to provide an interactive AI tutor that guides students through questions and hints, uses their uploaded study materials as its knowledge source, and adapts explanations based on potential signs of frustration and learning difficulty.

### 2. Target Users
Students who want to understand academic concepts, solve problems independently, and receive personalized learning guidance based on their own course materials.

### 3. Functional Requirements

**UR1 — Study Material Upload:** The system shall allow students to upload textbooks, lecture notes, and syllabus documents in PDF format.

**UR2 — Syllabus-Bounded Responses:** The system shall answer questions using relevant uploaded materials and redirect questions that fall outside the available course content.

**UR3 — Socratic Tutoring:** The system shall guide students through problems using questions, hints, and step-by-step reasoning rather than immediately revealing the final answer.

**UR4 — Emotion and Difficulty Detection:** The system shall identify potential signs of frustration or confusion from student interactions and consider repeated unsuccessful attempts as indicators that additional support may be needed.

**UR5 — Adaptive Teaching:** The system shall adapt its responses when a student appears to be struggling by simplifying explanations, changing its guidance strategy, and providing additional hints.

**UR6 — Visual Explanations:** The system shall provide relevant diagrams, flowcharts, or step-by-step visual explanations when they may help students understand difficult concepts.

**UR7 — Interactive Chat:** The system shall allow students to ask questions, respond to the tutor's prompts, request hints, and continue learning within a conversation.

### 4. Non-Functional Requirements
- **Usability:** The interface should be simple and easy to navigate.
- **Performance:** The system should respond within a reasonable time.
- **Reliability:** The system should handle unsupported questions and insufficient source material appropriately.
- **Privacy:** Uploaded documents and student conversations should be handled securely.
- **Transparency:** Emotion detection should indicate possible emotional cues, not claim certainty about a student's actual emotional state.

### 5. Scope of the MVP
The initial version will support PDF uploads, retrieval of relevant course content, Socratic question-and-hint interactions, text-based emotion or difficulty cues, adaptive responses, and basic visual explanations.

The specific emotion-detection method and AI models will be selected during the research phase. Voice and facial emotion recognition, advanced analytics, and integrations with external learning platforms are outside the initial scope.

### 6. Expected Outcome
A working AI tutor that helps students learn from their own study materials, encourages independent thinking, and adapts its guidance when they appear to be struggling.
