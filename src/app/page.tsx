"use client";

import { useState } from "react";

import { DocumentPreview } from "@/components/DocumentPreview";
import { PdfUploader } from "@/components/PdfUploader";
import type { DocumentUploadSuccessData } from "@/types/document";

export default function Home() {
  const [showHint, setShowHint] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedDocument, setUploadedDocument] =
    useState<DocumentUploadSuccessData | null>(null);

  const handleHintClick = () => {
    setShowHint(true);
  };

  const handleSendClick = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 3000);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <PdfUploader onUploaded={setUploadedDocument} />

        {uploadedDocument && (
          <DocumentPreview document={uploadedDocument} />
        )}

        <div className="flex justify-start mb-6">
          <div className="bg-surface border border-border text-primary p-4 rounded-lg shadow-sm max-w-lg text-sm md:text-base">
            <p>Hello! I am your Socratic Tutor. I see you&apos;ve uploaded the Data Structures syllabus. What would you like to learn today?</p>
          </div>
        </div>

        <div className="flex justify-end mb-6">
          <div className="bg-accent-primary text-on-accent p-4 rounded-lg shadow-sm max-w-lg text-sm md:text-base">
            <p>Can you tell me how a Binary Search Tree works?</p>
          </div>
        </div>

        {showHint && (
          <div className="flex justify-start mb-6">
            <div className="bg-hint-bg border border-hint-border text-hint-text p-4 rounded-lg shadow-sm max-w-lg text-sm md:text-base">
              <p>Hint: Think about how a tree structure splits data into smaller halves!</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start mb-6">
            <div className="bg-surface border border-border p-4 rounded-lg shadow-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
              <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-surface border-t border-border">
        <div className="flex flex-wrap md:flex-nowrap gap-2 max-w-4xl mx-auto">
          <button
            onClick={handleHintClick}
            className="bg-hint-bg text-hint-text px-4 py-3 rounded-lg font-medium hover:bg-hint-border transition text-sm md:text-base shrink-0"
            title="Need a hint?"
          >
            Hint
          </button>

          <input
            type="text"
            placeholder="Type your answer..."
            className="flex-1 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-primary bg-surface text-primary text-sm md:text-base min-w-[150px] placeholder:text-muted"
          />

          <button
            onClick={handleSendClick}
            className="bg-accent-primary text-on-accent px-6 py-3 rounded-lg font-medium hover:bg-accent-primary-hover transition text-sm md:text-base shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}