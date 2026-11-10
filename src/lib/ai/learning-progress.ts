import {
  detectConfusion,
  type ConversationTurn,
} from "./confusion-detection.ts";

export type LearningProgressTurn = ConversationTurn;

export interface LearningProgress {
  label: string;
  confirmedAnswers: number;
  corrections: number;
  hints: number;
  supportMoments: number;
  description: string;
}

const HINT_REQUEST =
  /\b(?:hint|clue|nudge|help me get started)\b/i;
const CONFIRMED_FEEDBACK =
  /^(?:yes\b|correct\b|exactly\b|that's right\b|that is correct\b|you(?:'re| are) right\b|you got it\b|well done\b)/i;
const CORRECTIVE_FEEDBACK =
  /^(?:not quite\b|not exactly\b|incorrect\b|that's not correct\b|that is not correct\b|try again\b|let's rethink\b|let's revisit\b)/i;

export function getLearningProgress(
  turns: readonly LearningProgressTurn[],
): LearningProgress {
  let confirmedAnswers = 0;
  let corrections = 0;
  let hints = 0;
  let supportMoments = 0;
  const history: LearningProgressTurn[] = [];

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (turn.role !== "student") {
      history.push(turn);
      continue;
    }

    const assessment = detectConfusion(turn.text, history);
    if (assessment.signals.some((signal) => signal !== "prior-difficulty")) {
      supportMoments += 1;
    }
    if (HINT_REQUEST.test(turn.text)) {
      hints += 1;
    }

    const prompt = turns[index - 1];
    const feedback = turns[index + 1];
    if (
      prompt &&
      (prompt.role === "tutor" || prompt.role === "hint") &&
      prompt.text.trim().endsWith("?") &&
      feedback &&
      (feedback.role === "tutor" || feedback.role === "hint")
    ) {
      if (CONFIRMED_FEEDBACK.test(feedback.text.trim())) {
        confirmedAnswers += 1;
      } else if (CORRECTIVE_FEEDBACK.test(feedback.text.trim())) {
        corrections += 1;
      }
    }

    history.push(turn);
  }

  const hasInteraction = turns.some((turn) => turn.role === "student");
  const label = !hasInteraction
    ? "Getting started"
    : supportMoments > 0 || corrections > 0
      ? "Practicing with extra support"
      : confirmedAnswers > 0
        ? "Building on tutor-confirmed answers"
        : hints > 0
          ? "Working through hints"
          : "Practicing";

  const evidence = [
    `${confirmedAnswers} tutor-confirmed ${pluralize(confirmedAnswers, "answer")}`,
    `${corrections} ${pluralize(corrections, "correction")}`,
    `${hints} ${pluralize(hints, "hint")}`,
    `${supportMoments} ${pluralize(supportMoments, "extra-support moment")}`,
  ];

  return {
    label,
    confirmedAnswers,
    corrections,
    hints,
    supportMoments,
    description: `${evidence.join(" · ")}. Based on interaction evidence in this conversation; not a mastery score.`,
  };
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
