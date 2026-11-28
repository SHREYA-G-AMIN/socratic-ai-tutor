export interface DashboardDocument {
  id: string;
  file_name: string;
  page_count: number | null;
  created_at: string;
}

export interface DashboardMessage {
  role?: unknown;
  text?: unknown;
}

export interface DashboardConversation {
  id: string;
  title: string;
  document_id: string | null;
  updated_at: string;
  messages: DashboardMessage[];
}

export interface RecentlyStudiedDocument {
  document: DashboardDocument;
  lastStudiedAt: string;
  conversationId: string;
}

export interface LearningActivity {
  id: string;
  kind: "study" | "upload";
  title: string;
  detail: string;
  occurredAt: string;
  documentId: string | null;
  conversationId: string | null;
}

export interface LearningDashboardSummary {
  documentCount: number;
  conversationCount: number;
  studentPromptCount: number;
  documentsStudiedCount: number;
  recentlyStudiedDocuments: RecentlyStudiedDocument[];
  recentActivity: LearningActivity[];
}

const RECENT_DOCUMENT_LIMIT = 4;
const RECENT_ACTIVITY_LIMIT = 8;

export function getLearningDashboardSummary(
  documents: readonly DashboardDocument[],
  conversations: readonly DashboardConversation[],
): LearningDashboardSummary {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const latestStudyByDocument = new Map<
    string,
    { conversation: DashboardConversation; timestamp: number }
  >();

  for (const conversation of conversations) {
    if (!conversation.document_id) continue;

    const timestamp = Date.parse(conversation.updated_at);
    if (!Number.isFinite(timestamp)) continue;

    const existing = latestStudyByDocument.get(conversation.document_id);
    if (!existing || timestamp > existing.timestamp) {
      latestStudyByDocument.set(conversation.document_id, {
        conversation,
        timestamp,
      });
    }
  }

  const studiedDocuments = [...latestStudyByDocument.entries()]
    .flatMap(([documentId, study]) => {
      const document = documentsById.get(documentId);
      if (!document) return [];

      return [{
        document,
        lastStudiedAt: study.conversation.updated_at,
        conversationId: study.conversation.id,
        timestamp: study.timestamp,
      }];
    })
    .sort((left, right) => right.timestamp - left.timestamp);

  const activity: Array<LearningActivity & { timestamp: number }> = [];
  for (const document of documents) {
    const timestamp = Date.parse(document.created_at);
    if (!Number.isFinite(timestamp)) continue;

    activity.push({
      id: `upload-${document.id}`,
      kind: "upload",
      title: document.file_name,
      detail: "Added to your library",
      occurredAt: document.created_at,
      documentId: document.id,
      conversationId: null,
      timestamp,
    });
  }

  for (const conversation of conversations) {
    const timestamp = Date.parse(conversation.updated_at);
    if (!Number.isFinite(timestamp)) continue;

    const document = conversation.document_id
      ? documentsById.get(conversation.document_id)
      : undefined;
    activity.push({
      id: `study-${conversation.id}`,
      kind: "study",
      title: conversation.title.trim() || "Study session",
      detail: document ? `Studied ${document.file_name}` : "Conversation updated",
      occurredAt: conversation.updated_at,
      documentId: document?.id ?? null,
      conversationId: conversation.id,
      timestamp,
    });
  }

  activity.sort((left, right) => right.timestamp - left.timestamp);

  return {
    documentCount: documents.length,
    conversationCount: conversations.length,
    studentPromptCount: conversations.reduce(
      (total, conversation) =>
        total +
        conversation.messages.filter(
          (message) =>
            message.role === "student" &&
            typeof message.text === "string" &&
            message.text.trim().length > 0,
        ).length,
      0,
    ),
    documentsStudiedCount: studiedDocuments.length,
    recentlyStudiedDocuments: studiedDocuments
      .slice(0, RECENT_DOCUMENT_LIMIT)
      .map(({ document, lastStudiedAt, conversationId }) => ({
        document,
        lastStudiedAt,
        conversationId,
      })),
    recentActivity: activity
      .slice(0, RECENT_ACTIVITY_LIMIT)
      .map(
        ({
          id,
          kind,
          title,
          detail,
          occurredAt,
          documentId,
          conversationId,
        }) => ({
          id,
          kind,
          title,
          detail,
          occurredAt,
          documentId,
          conversationId,
        }),
      ),
  };
}
