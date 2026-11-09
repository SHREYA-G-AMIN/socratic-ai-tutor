import type { ConfusionSeverity } from "./confusion-detection";
import {
  getDiagramInstructions,
  type DiagramRequest,
} from "./visual-explanations.ts";

export type TutoringIntent = "summary" | "direct" | "socratic";

const SUMMARY_REQUEST = /\b(summarize|summarise|summary)\b/i;
const DIRECT_REQUEST =
  /\b(explain|explanation|define|definition|compare|comparison|list)\b/i;

export function detectTutoringIntent(message: string): TutoringIntent {
  if (SUMMARY_REQUEST.test(message)) return "summary";
  if (DIRECT_REQUEST.test(message)) return "direct";
  return "socratic";
}

export function getTutorInstructions(
  intent: TutoringIntent,
  confusion: ConfusionSeverity = "none",
  diagramRequest: DiagramRequest = "none",
  hasRetrievedPassages = true,
): string {
  const sharedInstructions = `You are a Socratic academic tutor. You must follow these two absolute rules:

1. PROBLEM SOLVING & HINTS (ALWAYS ALLOWED): If the user asks for a hint, attempts to answer a question, guesses, or performs math (e.g., "I subtract them", "Is it 10?"), YOU MUST IGNORE DOCUMENT CONSTRAINTS. Rely entirely on the conversation history to evaluate their logic. You MUST provide a hint, correct their math, or guide them forward. NEVER refuse a hint or calculation request. NEVER claim the material is missing for these.

2. NEW FACTUAL QUESTIONS (STRICTLY RESTRICTED): ONLY when the user asks a brand-new factual question (e.g., "What is gravity?") should you check the retrieved document passages. If the facts are not explicitly in the passages, you must refuse by saying that the uploaded material does not provide the information.`;

  if (intent === "summary") {
    return addAdaptationInstructions(`${sharedInstructions}

The current request explicitly asks for a summary. Provide a clear, concise, structured summary grounded only in the retrieved passages. Do not ask a follow-up question.

${getDiagramInstructions(diagramRequest, hasRetrievedPassages)}`, confusion);
  }

  if (intent === "direct") {
    return addAdaptationInstructions(`${sharedInstructions}

The current request explicitly asks for direct information. Fulfill the requested explanation, definition, comparison, or list directly. Do not ask a follow-up question.

${getDiagramInstructions(diagramRequest, hasRetrievedPassages)}`, confusion);
  }

  return addAdaptationInstructions(
    `${sharedInstructions}\n\nFor ordinary learning questions, use Socratic guidance: encourage the student's reasoning rather than giving the complete solution immediately.\n\n${getDiagramInstructions(diagramRequest, hasRetrievedPassages)}`,
    confusion,
  );
}

function addAdaptationInstructions(
  instructions: string,
  confusion: ConfusionSeverity,
): string {
  if (confusion === "none") {
    return instructions;
  }

  const supportLevel = {
    mild: "Use simpler wording, shorter sentences, and one small hint.",
    moderate: "Break the problem down into smaller ordered steps. Explicitly guide their math.",
    high: "Stop asking questions entirely. Slow down, use a patient tone, and explicitly break down the exact math steps for them (e.g., 'Since the formula is F = m * a, we just multiply 2 by 3...').",
  }[confusion];

  return `${instructions}

The user is showing ${confusion} confusion. ${supportLevel} Do not announce a support level or label their emotions. Simply provide the targeted help they need based on the conversation history.`;
}