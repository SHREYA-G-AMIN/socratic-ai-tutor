"use client";

import { useState } from "react";

import { DocumentPreview } from "@/components/DocumentPreview";
import { PdfUploader } from "@/components/PdfUploader";
import type { DocumentUploadSuccessData } from "@/types/document";

interface Message {
  role: "tutor" | "student" | "hint";
  text: string;
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
  const [uploadedDocument, setUploadedDocument] =
    useState<DocumentUploadSuccessData | null>(null);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");

  const handleHintClick = () => {
    setMessages((prev) => [
      ...prev,
      {
        role: "hint",
        text:
          "Hint: Think about how a tree structure splits data into smaller halves!",
      },
    ]);
  };

  const handleSendClick = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = { role: "student", text: inputValue };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "tutor",
          text: "That is a great question. Let me think about that with you.",
        },
      ]);
    }, 1500);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendClick();
    }
  };

  const isDisabled = isLoading || !inputValue.trim();

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {/* Desktop: document workspace left (~58%), tutor chat right (~42%) */}
          <div className="lg:grid lg:grid-cols-12 gap-8">
            
            {/* LEFT — Document Workspace */}
            <div className="lg:col-span-7 space-y-8">
              <section className="flex flex-col h-full min-h-[50vh]">
                <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col h-full">
                  {uploadedDocument ? (
                    <DocumentPreview document={uploadedDocument} />
                  ) : (
                    <>
                      <header className="flex items-center gap-2 border-b border-border px-6 py-4">
                        <div className="w-6 h-6 rounded-lg bg-accent-primary flex items-center justify-center text-text-on-accent font-medium text-xs shadow-sm">
                          U
                        </div>
                        <h2 className="text-base font-semibold text-primary">
                          Upload PDF
                        </h2>
                      </header>
                      <div className="p-6 space-y-6">
                        <p className="text-sm text-secondary">
                          Upload your syllabus or textbook to begin learning.
                        </p>
                        <PdfUploader onUploaded={setUploadedDocument} />
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT — Tutor Chat */}
            <div className="lg:col-span-5 flex flex-col h-full min-h-[50vh]">
              <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col h-full">
                <header className="flex items-center justify-between border-b border-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-accent-primary flex items-center justify-center text-text-on-accent font-medium text-xs shadow-sm">
                      C
                    </div>
                    <h2 className="text-base font-semibold text-primary">
                      Tutor Chat
                    </h2>
                  </div>
                </header>

                {/* Scrollable message history */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.role === "student" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] px-4 py-3 rounded-xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                          msg.role === "tutor"
                            ? "bg-surface border border-border text-primary rounded-tl-sm rounded-tr-xl rounded-br-xl rounded-bl-xl"
                            : msg.role === "student"
                            ? "bg-accent-primary text-on-accent rounded-tr-sm rounded-tl-xl rounded-bl-xl rounded-br-xl"
                            : "bg-hint-bg border border-hint-border text-hint-text rounded-tl-sm rounded-tr-xl rounded-br-xl rounded-bl-xl"
                        }`}
                      >
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-surface border border-border px-4 py-3 rounded-xl text-primary shadow-sm max-w-[85%] rounded-tl-sm rounded-tr-xl rounded-br-xl rounded-bl-xl flex items-center gap-2">
                        <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                        <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Composer anchored to bottom of chat panel */}
                <div className="border-t border-border bg-surface p-4">
                  <div className="flex gap-3 items-end">
                    <button
                      onClick={handleHintClick}
                      disabled={isLoading}
                      className="shrink-0 bg-hint-bg text-hint-text px-4 py-3 rounded-lg font-medium hover:bg-hint-border transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Need a hint?"
                    >
                      Hint
                    </button>

                    <input
                      type="text"
                      placeholder="Type your answer..."
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKeyDown}
                      disabled={isLoading}
                      className="flex-1 min-w-[150px] border border-border rounded-lg px-4 py-3 bg-surface text-primary focus:outline-none focus:border-accent-primary transition-colors placeholder:text-muted text-sm"
                    />

                    <button
                      onClick={handleSendClick}
                      disabled={isDisabled}
                      className="shrink-0 bg-accent-primary text-on-accent px-6 py-3 rounded-lg font-medium hover:bg-accent-primary-hover transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}