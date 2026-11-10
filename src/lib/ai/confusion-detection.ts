export type ConfusionSeverity = "none" | "mild" | "moderate" | "high";

export type ConfusionSignal =
  | "simplification-request"
  | "explicit-confusion"
  | "repeated-question"
  | "repeated-mistake"
  | "prior-difficulty"
  | "unsuccessful-attempt"
  | "explicit-frustration";

export interface ConversationTurn {
  role: "student" | "tutor" | "hint";
  text: string;
}

export interface ConfusionAssessment {
  severity: ConfusionSeverity;
  signals: ConfusionSignal[];
}

const SIMPLIFICATION_REQUEST =
  /\b(simpler|more simply|in simpler terms|break (?:it|this|that) down|slow(?:er|ly| down)|more slowly|step by step|small(?:er)? steps|plain language)\b/i;
const EXPLICIT_CONFUSION =
  /\b(?:i(?:'m| am) (?:a bit |a little |slightly )?confused|i (?:do not|don't) understand|i (?:do not|don't) get it|i(?:'m| am) lost|i(?:'m| am) not following|i can't follow|still confused|this is confusing|this makes no sense|i don't see how)\b/i;
const UNSUCCESSFUL_ATTEMPT =
  /\b(?:still (?:getting|got|have|don't|do not|can't|cannot)|tried (?:that|this)|didn't work|doesn't work|not working|wrong again|got it wrong|got the wrong answer|failed again)\b/i;
const EXPLICIT_FRUSTRATION =
  /\b(?:frustrat(?:ed|ing)|i give up|this is impossible|completely lost|nothing makes sense)\b/i;
const STRONG_FRUSTRATION =
  /\b(?:i give up|this is impossible|completely lost|nothing makes sense)\b/i;
const TUTOR_CORRECTION =
  /^(?:not quite\b|not exactly\b|incorrect\b|that's not correct\b|that is not correct\b|try again\b|let's rethink\b|let's revisit\b)/i;

const RECENT_STUDENT_TURN_LIMIT = 8;

export function detectConfusion(
  message: string,
  history: readonly ConversationTurn[] = [],
): ConfusionAssessment {
  const recentStudentMessages = history
    .filter((turn) => turn.role === "student")
    .slice(-RECENT_STUDENT_TURN_LIMIT)
    .map((turn) => turn.text);
  const simplificationRequested = SIMPLIFICATION_REQUEST.test(message);
  const explicitConfusion = EXPLICIT_CONFUSION.test(message);
  const unsuccessfulAttempt = UNSUCCESSFUL_ATTEMPT.test(message);
  const explicitFrustration = EXPLICIT_FRUSTRATION.test(message);
  const repeatedQuestion =
    isRepeatedQuestion(message, recentStudentMessages);
  const repeatedMistake = isRepeatedMistake(message, history);
  const priorDifficultyTurns = recentStudentMessages.filter(
    (text) =>
      EXPLICIT_CONFUSION.test(text) ||
      UNSUCCESSFUL_ATTEMPT.test(text) ||
      EXPLICIT_FRUSTRATION.test(text),
  ).length;
  const priorUnsuccessfulAttempts = recentStudentMessages.filter((text) =>
    UNSUCCESSFUL_ATTEMPT.test(text),
  ).length;
  const hasRepeatedFailures =
    (unsuccessfulAttempt && priorUnsuccessfulAttempts >= 1) || repeatedMistake;
  const hasPriorConfusionOrFailure = recentStudentMessages.some(
    (text) =>
      EXPLICIT_CONFUSION.test(text) || UNSUCCESSFUL_ATTEMPT.test(text),
  );
  const strongFrustrationWithContext =
    STRONG_FRUSTRATION.test(message) &&
    (hasPriorConfusionOrFailure || repeatedQuestion || repeatedMistake);

  const signals: ConfusionSignal[] = [];
  if (simplificationRequested) signals.push("simplification-request");
  if (explicitConfusion) signals.push("explicit-confusion");
  if (repeatedQuestion) signals.push("repeated-question");
  if (repeatedMistake) signals.push("repeated-mistake");
  if (priorDifficultyTurns > 0) signals.push("prior-difficulty");
  if (unsuccessfulAttempt || priorUnsuccessfulAttempts > 0) {
    signals.push("unsuccessful-attempt");
  }
  if (explicitFrustration) signals.push("explicit-frustration");

  let severity: ConfusionSeverity = "none";
  if (
    hasRepeatedFailures &&
    (explicitConfusion ||
      explicitFrustration ||
      unsuccessfulAttempt ||
      repeatedMistake)
  ) {
    severity = "high";
  } else if (strongFrustrationWithContext) {
    severity = "high";
  } else if (priorDifficultyTurns >= 2) {
    severity = "moderate";
  } else if (
    explicitConfusion &&
    !/\b(?:a bit|a little|slightly)\b/i.test(message)
  ) {
    severity = "moderate";
  } else if (
    repeatedQuestion ||
    repeatedMistake ||
    (unsuccessfulAttempt && priorUnsuccessfulAttempts > 0) ||
    explicitFrustration
  ) {
    severity = "moderate";
  } else if (
    simplificationRequested ||
    explicitConfusion ||
    unsuccessfulAttempt ||
    explicitFrustration ||
    priorDifficultyTurns > 0
  ) {
    severity = "mild";
  }

  return { severity, signals };
}

function isRepeatedQuestion(
  message: string,
  recentStudentMessages: readonly string[],
): boolean {
  if (
    !message.trim().endsWith("?") &&
    !/^(?:why|how|what|when|where|which|who|can|could|would|should|do|does|is|are)\b/i.test(
      message.trim(),
    )
  ) {
    return false;
  }

  const normalizedMessage = normalizeQuestion(message);
  if (!normalizedMessage) {
    return false;
  }

  return recentStudentMessages.some(
    (priorMessage) => normalizeQuestion(priorMessage) === normalizedMessage,
  );
}

function isRepeatedMistake(
  message: string,
  history: readonly ConversationTurn[],
): boolean {
  const normalizedMessage = normalizeQuestion(message);
  if (!normalizedMessage) {
    return false;
  }

  const recentStudentIndices = history
    .map((turn, index) => (turn.role === "student" ? index : -1))
    .filter((index) => index >= 0)
    .slice(-RECENT_STUDENT_TURN_LIMIT);
  const recentStudentIndexSet = new Set(recentStudentIndices);

  for (let index = 0; index < history.length - 1; index += 1) {
    const turn = history[index];
    if (
      turn.role !== "student" ||
      !recentStudentIndexSet.has(index) ||
      normalizeQuestion(turn.text) !== normalizedMessage
    ) {
      continue;
    }

    const feedback = history
      .slice(index + 1)
      .find((nextTurn) => nextTurn.role !== "student");
    if (feedback && TUTOR_CORRECTION.test(feedback.text.trim())) {
      return true;
    }
  }

  return false;
}

function normalizeQuestion(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
