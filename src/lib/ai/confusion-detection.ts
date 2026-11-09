export type ConfusionSeverity = "none" | "mild" | "moderate" | "high";

export type ConfusionSignal =
  | "simplification-request"
  | "explicit-confusion"
  | "repeated-question"
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
  const priorUnsuccessfulAttempts = recentStudentMessages.filter((text) =>
    UNSUCCESSFUL_ATTEMPT.test(text),
  ).length;
  const hasRepeatedFailures =
    unsuccessfulAttempt && priorUnsuccessfulAttempts >= 1;
  const hasPriorConfusionOrFailure = recentStudentMessages.some(
    (text) =>
      EXPLICIT_CONFUSION.test(text) || UNSUCCESSFUL_ATTEMPT.test(text),
  );
  const strongFrustrationWithContext =
    STRONG_FRUSTRATION.test(message) &&
    (hasPriorConfusionOrFailure || repeatedQuestion);

  const signals: ConfusionSignal[] = [];
  if (simplificationRequested) signals.push("simplification-request");
  if (explicitConfusion) signals.push("explicit-confusion");
  if (repeatedQuestion) signals.push("repeated-question");
  if (unsuccessfulAttempt || priorUnsuccessfulAttempts > 0) {
    signals.push("unsuccessful-attempt");
  }
  if (explicitFrustration) signals.push("explicit-frustration");

  let severity: ConfusionSeverity = "none";
  if (
    hasRepeatedFailures &&
    (explicitConfusion || explicitFrustration || unsuccessfulAttempt)
  ) {
    severity = "high";
  } else if (strongFrustrationWithContext) {
    severity = "high";
  } else if (
    explicitConfusion &&
    !/\b(?:a bit|a little|slightly)\b/i.test(message)
  ) {
    severity = "moderate";
  } else if (
    repeatedQuestion ||
    (unsuccessfulAttempt && priorUnsuccessfulAttempts > 0) ||
    explicitFrustration
  ) {
    severity = "moderate";
  } else if (
    simplificationRequested ||
    explicitConfusion ||
    unsuccessfulAttempt ||
    explicitFrustration
  ) {
    severity = "mild";
  }

  return { severity, signals };
}

function isRepeatedQuestion(
  message: string,
  recentStudentMessages: readonly string[],
): boolean {
  const normalizedMessage = normalizeQuestion(message);
  if (!normalizedMessage) {
    return false;
  }

  return recentStudentMessages.some(
    (priorMessage) => normalizeQuestion(priorMessage) === normalizedMessage,
  );
}

function normalizeQuestion(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
