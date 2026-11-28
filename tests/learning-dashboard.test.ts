import { test } from "node:test";
import assert from "node:assert/strict";

import { getLearningDashboardSummary } from "../src/lib/learning-dashboard.ts";

const documents = [
  {
    id: "doc-1",
    file_name: "Operating Systems.pdf",
    page_count: 12,
    created_at: "2026-11-20T09:00:00.000Z",
  },
  {
    id: "doc-2",
    file_name: "Biology Notes.pdf",
    page_count: null,
    created_at: "2026-11-22T09:00:00.000Z",
  },
];

test("dashboard counts only stored documents, conversations, and student prompts", () => {
  const summary = getLearningDashboardSummary(documents, [
    {
      id: "conversation-1",
      title: "Scheduling questions",
      document_id: "doc-1",
      updated_at: "2026-11-23T09:00:00.000Z",
      messages: [
        { role: "student", text: "What is Round Robin?" },
        { role: "tutor", text: "It is a scheduling algorithm." },
        { role: "student", text: " " },
        { role: "hint", text: "Check the ready queue." },
      ],
    },
  ]);

  assert.equal(summary.documentCount, 2);
  assert.equal(summary.conversationCount, 1);
  assert.equal(summary.studentPromptCount, 1);
  assert.equal(summary.documentsStudiedCount, 1);
});

test("recently studied documents use the latest linked conversation and omit unavailable documents", () => {
  const summary = getLearningDashboardSummary(documents, [
    {
      id: "older-session",
      title: "Earlier",
      document_id: "doc-1",
      updated_at: "2026-11-23T09:00:00.000Z",
      messages: [],
    },
    {
      id: "latest-session",
      title: "Latest",
      document_id: "doc-1",
      updated_at: "2026-11-25T09:00:00.000Z",
      messages: [],
    },
    {
      id: "deleted-document-session",
      title: "Unavailable source",
      document_id: "deleted-doc",
      updated_at: "2026-11-26T09:00:00.000Z",
      messages: [],
    },
    {
      id: "invalid-date-session",
      title: "Unknown time",
      document_id: "doc-2",
      updated_at: "not-a-date",
      messages: [],
    },
  ]);

  assert.equal(summary.documentsStudiedCount, 1);
  assert.equal(summary.recentlyStudiedDocuments.length, 1);
  assert.equal(summary.recentlyStudiedDocuments[0].conversationId, "latest-session");
  assert.equal(summary.recentlyStudiedDocuments[0].document.file_name, "Operating Systems.pdf");
});

test("recent activity is sorted by stored timestamps and distinguishes uploads from study sessions", () => {
  const summary = getLearningDashboardSummary(documents, [
    {
      id: "conversation-1",
      title: "Scheduling questions",
      document_id: "doc-1",
      updated_at: "2026-11-24T09:00:00.000Z",
      messages: [],
    },
  ]);

  assert.deepEqual(
    summary.recentActivity.map(({ kind, title }) => [kind, title]),
    [
      ["study", "Scheduling questions"],
      ["upload", "Biology Notes.pdf"],
      ["upload", "Operating Systems.pdf"],
    ],
  );
  assert.equal(summary.recentActivity[0].detail, "Studied Operating Systems.pdf");
});
