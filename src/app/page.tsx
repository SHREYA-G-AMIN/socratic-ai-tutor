"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { DocumentPreview } from "@/components/DocumentPreview";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { PdfUploader } from "@/components/PdfUploader";
import { TutorMessage } from "@/components/TutorMessage";
import { getLearningProgress } from "@/lib/ai/learning-progress";
import type { ChatResponse, ChatSourceReference } from "@/types/chat";
import type { DiagramData } from "@/lib/ai/visual-explanations";
import type { DocumentUploadSuccessData } from "@/types/document";

interface Message {
  role: "tutor" | "student" | "hint";
  text: string;
  diagram?: string;
  diagramData?: DiagramData;
  diagramIsGeneral?: boolean;
  sources?: ChatSourceReference[];
  warning?: string;
}

interface ChatRequest {
  message: string;
  documentId: string;
  conversationId: string | null;
  history: Message[];
}

interface SourceExplorerState {
  messageIndex: number;
  sources: ChatSourceReference[];
  activeIndex: number;
}

const INITIAL_MESSAGES: Message[] = [
  {
    role: "tutor",
    text:
      "Hello! I am your Socratic Tutor. Upload a syllabus or textbook to begin learning.",
  },
];

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] =
    useState<DocumentUploadSuccessData | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [mobileTab, setMobileTab] = useState<"document" | "chat">("document");
  const [retryHint, setRetryHint] = useState(false);
  const [sourceExplorer, setSourceExplorer] =
    useState<SourceExplorerState | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const documentSessionRef = useRef(0);
  const learningProgress = useMemo(
    () => getLearningProgress(messages),
    [messages],
  );

  // Scroll only the chat history container; scrollIntoView can move the page
  // itself when the chat is nested inside a full-height layout.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  // Restore saved work opened from My Documents or Chat History.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const requestedConversationId = params.get("conversationId");
    const requestedDocumentId = params.get("documentId");

    async function loadDocument(id: string) {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not open this document.");
      const row = body.document;
      const doc: DocumentUploadSuccessData = {
        id: row.id,
        fileName: row.file_name,
        fileSizeBytes: row.file_size_bytes,
        pageCount: row.page_count,
        characterCount: row.character_count,
        text: row.extracted_text,
        pageRanges: row.page_ranges ?? [],
        truncated: false,
        ocrUsed: row.ocr_used,
        ...(row.ocr_provider ? { ocrProvider: row.ocr_provider } : {}),
      };
      if (!cancelled) setUploadedDocument(doc);
    }

    async function restore() {
      try {
        if (requestedConversationId) {
          const response = await fetch(`/api/conversations/${encodeURIComponent(requestedConversationId)}`);
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Could not restore this conversation.");
          const conversation = body.conversation;
          if (conversation.document_id) await loadDocument(conversation.document_id);
          if (!cancelled) {
            setConversationId(conversation.id);
            setMessages(Array.isArray(conversation.messages) && conversation.messages.length
              ? conversation.messages as Message[]
              : INITIAL_MESSAGES);
            setMobileTab("chat");
          }
        } else if (requestedDocumentId) {
          await loadDocument(requestedDocumentId);
        }
      } catch (cause) {
        if (!cancelled) setChatError(cause instanceof Error ? cause.message : "Could not restore saved work.");
      }
    }

    if (requestedConversationId || requestedDocumentId) void restore();
    return () => { cancelled = true; };
  }, []);

  // When a document is uploaded, switch to chat on mobile if appropriate
  const handleDocumentUploaded = (doc: DocumentUploadSuccessData) => {
    documentSessionRef.current += 1;
    setUploadedDocument(doc);
    setConversationId(null);
    setMobileTab("chat");
    setMessages(INITIAL_MESSAGES);
    setInputValue("");
    setChatError(null);
    setRetryHint(false);
    setSourceExplorer(null);
    setIsLoading(false);
  };

  const handleDocumentReset = () => {
    documentSessionRef.current += 1;
    setUploadedDocument(null);
    setConversationId(null);
    setMessages(INITIAL_MESSAGES);
    setInputValue("");
    setChatError(null);
    setRetryHint(false);
    setSourceExplorer(null);
    setIsLoading(false);
  };

  const handleHintClick = async () => {
    if (!uploadedDocument) {
      setChatError("Please upload a document before requesting a hint.");
      return;
    }

    const hintRequestMsg: Message = { 
      role: "student", 
      text: "Can you give me a small hint to help me figure this out on my own?" 
    };

    setMessages((prev) => [...prev, hintRequestMsg]);
    const requestDocumentSession = documentSessionRef.current;
    setIsLoading(true);
    setChatError(null);
    setRetryHint(false);

    try {
      const response: Response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: hintRequestMsg.text,
          documentId: uploadedDocument.id,
          conversationId,
          history: messages,
        } satisfies ChatRequest),
      });

      const body = await response.json();
      if (requestDocumentSession !== documentSessionRef.current) return;

      if (!response.ok) {
        const errorBody = body as { error?: string };
        throw new Error(errorBody.error || "Failed to get hint");
      }

      const chatBody = body as ChatResponse;
      if (chatBody.conversationId) setConversationId(chatBody.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          role: "hint",
          text: chatBody.reply,
          diagram: chatBody.diagram,
          diagramData: chatBody.diagramData,
          diagramIsGeneral: chatBody.diagramIsGeneral,
          sources: chatBody.sources,
          warning: chatBody.warning,
        },
      ]);
      setRetryHint(false);
    } catch (error) {
      if (requestDocumentSession !== documentSessionRef.current) return;
      setMessages((prev) => prev.filter((message) => message !== hintRequestMsg));
      setChatError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again.",
      );
      setRetryHint(true);
    } finally {
      if (requestDocumentSession === documentSessionRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleSendClick = async () => {
    if (!inputValue.trim()) return;

    if (!uploadedDocument) {
      setChatError("Please upload a document before asking questions.");
      return;
    }

    const userMsg: Message = { role: "student", text: inputValue.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    const requestDocumentSession = documentSessionRef.current;
    setIsLoading(true);
    setChatError(null);
    setRetryHint(false);

    try {
      const response: Response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: inputValue,
          documentId: uploadedDocument.id,
          conversationId,
          history: messages,
        } satisfies ChatRequest),
      });

      const body = await response.json();
      if (requestDocumentSession !== documentSessionRef.current) return;

      if (!response.ok) {
        const errorBody = body as { error?: string };
        throw new Error(errorBody.error || "Failed to send message");
      }

      const chatBody = body as ChatResponse;
      if (chatBody.conversationId) setConversationId(chatBody.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          role: "tutor",
          text: chatBody.reply,
          diagram: chatBody.diagram,
          diagramData: chatBody.diagramData,
          diagramIsGeneral: chatBody.diagramIsGeneral,
          sources: chatBody.sources,
          warning: chatBody.warning,
        },
      ]);
    } catch (error) {
      if (requestDocumentSession !== documentSessionRef.current) return;
      setMessages((prev) => prev.filter((message) => message !== userMsg));
      setInputValue(userMsg.text);
      setChatError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again.",
      );
      setRetryHint(false);
    } finally {
      if (requestDocumentSession === documentSessionRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    setChatError(null);
    setRetryHint(false);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendClick();
    }
  };

  const isDisabled = isLoading || !inputValue.trim();

  return (
    <div className="flex flex-col h-full w-full max-w-[1440px] mx-auto p-4 sm:p-5 lg:p-6 overflow-hidden">
      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex items-center p-1 mb-4 rounded-xl bg-surface border border-border shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("document")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
            mobileTab === "document"
              ? "bg-surface-elevated text-text-primary shadow-xs"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Document {uploadedDocument ? "(Ready)" : ""}</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
            mobileTab === "chat"
              ? "bg-surface-elevated text-text-primary shadow-xs"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>Tutor Chat</span>
        </button>
      </div>

      {/* Balanced Split Layout: Document Workspace (58%) & Tutor Chat (42%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 flex-1 min-h-0 h-full">
        {/* LEFT PANEL — Document Workspace (~58%) */}
        <section
          className={`lg:col-span-7 flex flex-col min-h-0 h-full rounded-xl border border-border bg-surface shadow-xs overflow-hidden ${
            mobileTab === "document" ? "flex" : "hidden lg:flex"
          }`}
        >
          {uploadedDocument ? (
            <DocumentPreview
              document={uploadedDocument}
              onReset={handleDocumentReset}
              sourceReferences={sourceExplorer?.sources ?? null}
              selectedSourceIndex={sourceExplorer?.activeIndex ?? 0}
              onSourceIndexChange={(activeIndex) =>
                setSourceExplorer((current) =>
                  current ? { ...current, activeIndex } : current,
                )
              }
              onCloseSourceExplorer={() => setSourceExplorer(null)}
            />
          ) : (
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              <header className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border text-accent-primary flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">
                      Your learning workspace
                    </h2>
                    <p className="text-xs text-text-muted">
                      Grounded in the material you choose
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-surface-elevated border border-border-subtle text-text-muted">
                  PDF study space
                </span>
              </header>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  <section
                    aria-labelledby="welcome-heading"
                    className="relative overflow-hidden border-b border-border bg-gradient-to-br from-accent-primary-soft/50 via-surface to-accent-secondary-soft/40 px-5 py-6 sm:px-7 sm:py-8"
                  >
                    <div className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full border-[24px] border-accent-primary/5" aria-hidden="true" />
                    <div className="relative">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-primary">
                        Learn with your own material
                      </p>
                      <h1
                        id="welcome-heading"
                        className="mt-2 max-w-xl text-2xl font-semibold leading-tight tracking-tight text-text-primary sm:text-3xl"
                      >
                        Understand your course, one question at a time.
                      </h1>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
                        Upload a chapter or lecture notes. Your Socratic tutor uses
                        that material to guide your thinking with questions,
                        explanations, and hints.
                      </p>

                      <ol className="mt-6 grid gap-2 sm:grid-cols-3">
                        {[
                          {
                            number: "01",
                            title: "Upload material",
                            description: "Choose a course PDF to study.",
                          },
                          {
                            number: "02",
                            title: "Ask questions",
                            description: "Explore ideas from your notes.",
                          },
                          {
                            number: "03",
                            title: "Learn step by step",
                            description: "Build understanding with guided help.",
                          },
                        ].map((step) => (
                          <li
                            key={step.number}
                            className="rounded-xl border border-border/80 bg-surface/75 p-3.5"
                          >
                            <span className="text-[10px] font-bold tracking-wider text-accent-primary">
                              {step.number}
                            </span>
                            <h2 className="mt-1 text-sm font-semibold text-text-primary">
                              {step.title}
                            </h2>
                            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                              {step.description}
                            </p>
                          </li>
                        ))}
                      </ol>

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Link
                          href="#upload-course-material"
                          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-primary-hover"
                        >
                          Upload a PDF
                        </Link>
                        <Link
                          href="/my-documents"
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface/80 px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-hover"
                        >
                          Browse saved documents
                        </Link>
                      </div>
                    </div>
                  </section>

                  <div id="upload-course-material" className="p-5 sm:p-7">
                    <PdfUploader onUploaded={handleDocumentUploaded} />
                  </div>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT PANEL — Tutor Chat (~42%) */}
        <section
          className={`lg:col-span-5 flex flex-col min-h-0 h-full rounded-xl border border-border bg-surface shadow-xs overflow-hidden ${
            mobileTab === "chat" ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* Aligned panel header */}
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border text-accent-primary flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Tutor Chat
                </h2>
                <p className="text-xs text-text-muted">
                  {uploadedDocument ? "Grounded in document" : "Socratic dialogue"}
                </p>
              </div>
            </div>

            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-elevated border border-border-subtle text-[11px] font-medium text-text-secondary"
            >
              <span className="w-2 h-2 rounded-full bg-success shrink-0" />
              <span>{isLoading ? "Thinking…" : "Ready"}</span>
            </div>
          </header>

          <section
            aria-label="Learning progress"
            aria-live="polite"
            className="shrink-0 border-b border-border bg-surface px-4 py-2.5"
          >
            <p className="text-xs font-semibold text-text-secondary">
              Understanding:{" "}
              <span className="font-medium text-text-primary">
                {learningProgress.label}
              </span>
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
              {learningProgress.description}
            </p>
          </section>

          {/* Scrollable message history */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4"
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2.5 ${
                  msg.role === "student" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role !== "student" && (
                  <div
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      msg.role === "hint"
                        ? "bg-hint-bg border-hint-border text-hint-text"
                        : "bg-surface-elevated border-border text-accent-primary"
                    }`}
                  >
                    {msg.role === "hint" ? "H" : "T"}
                  </div>
                )}

                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-xs whitespace-pre-wrap break-words ${
                    msg.role === "tutor"
                      ? "bg-surface-elevated border border-border text-text-primary rounded-tl-xs"
                      : msg.role === "student"
                      ? "bg-accent-primary text-text-on-accent rounded-tr-xs"
                      : "bg-hint-bg border border-hint-border text-hint-text rounded-tl-xs"
                  }`}
                >
                  {msg.role === "student" ? <p>{msg.text}</p> : <TutorMessage content={msg.text} />}
                  {(msg.diagramData || msg.diagram) && (
                    <MermaidDiagram
                      data={msg.diagramData}
                      sourcePassages={msg.sources?.map((source) => source.text)}
                      source={msg.diagram}
                      allowUngrounded={msg.diagramIsGeneral}
                    />
                  )}
                  {msg.warning && (
                    <p className="mt-2 border-t border-border pt-2 text-xs text-text-muted">
                      {msg.warning}
                    </p>
                  )}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 border-t border-border pt-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-xs font-semibold text-text-primary">
                          Sources used
                        </h3>
                        <p className="text-[10px] text-text-muted">
                          Select a passage to inspect it in the document
                        </p>
                      </div>
                      <ol className="mt-2 grid gap-2">
                        {msg.sources.map((source, sourceIndex) => {
                          const isActive =
                            sourceExplorer?.messageIndex === idx &&
                            sourceExplorer.activeIndex === sourceIndex;
                          const location = getCitationLocation(source);

                          return (
                            <li
                              key={`${source.chunkIndex}-${source.startChar}`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSourceExplorer({
                                    messageIndex: idx,
                                    sources: msg.sources ?? [],
                                    activeIndex: sourceIndex,
                                  });
                                  setMobileTab("document");
                                }}
                                aria-pressed={isActive}
                                aria-label={`Inspect source ${sourceIndex + 1} from ${source.fileName ?? "uploaded document"}, ${location}`}
                                className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary ${
                                  isActive
                                    ? "border-accent-primary bg-accent-primary-soft/40"
                                    : "border-border bg-surface/70 hover:border-accent-primary/40 hover:bg-surface"
                                }`}
                              >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent-primary/20 bg-accent-primary-soft text-xs font-bold text-accent-primary">
                                  {String(sourceIndex + 1).padStart(2, "0")}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-text-primary">
                                    {source.fileName ?? "Uploaded document"}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-text-secondary">
                                    {location}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[11px] font-semibold text-accent-primary">
                                  Inspect
                                </span>
                                <svg
                                  className="h-4 w-4 shrink-0 text-accent-primary"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  aria-hidden="true"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.8}
                                    d="M5 12h14m-6-6 6 6-6 6"
                                  />
                                </svg>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {chatError && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2.5 justify-start"
              >
                <div className="w-7 h-7 rounded-lg bg-error-text/10 border border-error-text/30 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  !
                </div>
                <div className="bg-error-text/10 border border-error-text/30 px-4 py-3 rounded-2xl rounded-tl-xs text-error-text shadow-xs">
                  <p>{chatError}</p>
                  {retryHint && (
                    <button
                      type="button"
                      onClick={handleHintClick}
                      disabled={isLoading || !uploadedDocument}
                      className="mt-2 rounded-lg border border-error-text/30 px-2.5 py-1 text-xs font-semibold hover:bg-error-text/10 disabled:opacity-50"
                    >
                      Retry hint
                    </button>
                  )}
                </div>
              </div>
            )}

            {isLoading && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-2.5 justify-start"
              >
                <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-border text-accent-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  T
                </div>
                <div className="bg-surface-elevated border border-border px-4 py-3 rounded-2xl rounded-tl-xs text-text-primary shadow-xs flex items-center gap-1.5">
                  <span className="sr-only">The tutor is preparing a response.</span>
                  <div aria-hidden="true" className="w-2 h-2 bg-text-muted rounded-full animate-bounce" />
                  <div
                    aria-hidden="true"
                    className="w-2 h-2 bg-text-muted rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    aria-hidden="true"
                    className="w-2 h-2 bg-text-muted rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}

          </div>

          {/* Composer anchored to bottom of chat panel */}
          <div className="border-t border-border bg-surface p-3 sm:p-4 shrink-0">
            <div className="flex gap-2.5 items-center">
              <button
                type="button"
                onClick={handleHintClick}
                disabled={isLoading}
                className="shrink-0 bg-hint-bg text-hint-text hover:bg-hint-bg-hover border border-hint-border px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                title="Request a hint"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <span>Hint</span>
              </button>

              <input
                type="text"
                placeholder="Answer the question or ask a question…"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                disabled={isLoading}
                className="flex-1 min-w-[120px] bg-surface-elevated border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
              />

              <button
                type="button"
                onClick={handleSendClick}
                disabled={isDisabled}
                className="shrink-0 bg-accent-primary hover:bg-accent-primary-hover text-text-on-accent px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
              >
                <span>Send</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function getCitationLocation(source: ChatSourceReference): string {
  if (source.pageNumbers.length > 0) {
    const label = source.pageNumbers.length === 1 ? "PDF page" : "PDF pages";
    return `${label} ${source.pageNumbers.join(", ")}`;
  }

  return `Text ${source.startChar}–${source.endChar}`;
}