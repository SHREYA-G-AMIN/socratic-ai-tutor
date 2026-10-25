"use client";

import { useEffect, useRef, useState } from "react";

import { DocumentPreview } from "@/components/DocumentPreview";
import { PdfUploader } from "@/components/PdfUploader";
import type { DocumentUploadSuccessData } from "@/types/document";

interface Message {
  role: "tutor" | "student" | "hint";
  text: string;
}

interface ChatRequest {
  message: string;
  documentText: string;
  history: Message[];
}

interface ChatResponse {
  reply: string;
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
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [mobileTab, setMobileTab] = useState<"document" | "chat">("document");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // When a document is uploaded, switch to chat on mobile if appropriate
  const handleDocumentUploaded = (doc: DocumentUploadSuccessData) => {
    setUploadedDocument(doc);
    setChatError(null);
  };

  const handleHintClick = () => {
    setMessages((prev) => [
      ...prev,
      {
        role: "hint",
        text:
          "Hint: Think about how a tree structure splits data into smaller halves!",
      },
    ]);
    setChatError(null);
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
    setIsLoading(true);
    setChatError(null);

    try {
      const response: Response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: inputValue,
          documentText: uploadedDocument.text,
          history: messages,
        } satisfies ChatRequest),
      });

      const body = await response.json();

      if (!response.ok) {
        const errorBody = body as { error?: string };
        throw new Error(errorBody.error || "Failed to send message");
      }

      const chatBody = body as ChatResponse;
      setMessages((prev) => [
        ...prev,
        {
          role: "tutor",
          text: chatBody.reply,
        },
      ]);
    } catch (error) {
      setInputValue(userMsg.text);
      setChatError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    setChatError(null);
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
              onReset={() => setUploadedDocument(null)}
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
                      Document Workspace
                    </h2>
                    <p className="text-xs text-text-muted">
                      Upload course material to begin
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-surface-elevated border border-border-subtle text-text-muted">
                  PDF format
                </span>
              </header>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
                <PdfUploader onUploaded={handleDocumentUploaded} />
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

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-elevated border border-border-subtle text-[11px] font-medium text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-success shrink-0" />
              <span>Active</span>
            </div>
          </header>

          {/* Scrollable message history */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
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
                    {msg.role === "hint" ? "H" : "S"}
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
                  <p>{msg.text}</p>
                </div>
              </div>
            ))}

            {chatError && (
              <div className="flex items-start gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-lg bg-error-text/10 border border-error-text/30 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  !
                </div>
                <div className="bg-error-text/10 border border-error-text/30 px-4 py-3 rounded-2xl rounded-tl-xs text-error-text shadow-xs">
                  <p>{chatError}</p>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex items-start gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-border text-accent-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  S
                </div>
                <div className="bg-surface-elevated border border-border px-4 py-3 rounded-2xl rounded-tl-xs text-text-primary shadow-xs flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-text-muted rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-text-muted rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
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