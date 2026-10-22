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
    <div className="flex flex-col md:flex-row h-screen bg-slate-50">
      
      {/* LEFT SIDEBAR / TOP ON MOBILE */}
      <div className="w-full md:w-1/3 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-6 flex flex-col shrink-0">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">SocraticAI</h1>
        <p className="text-sm text-slate-500 mb-8">Upload your syllabus or textbook to begin.</p>
        
        <PdfUploader onUploaded={setUploadedDocument} />
      </div>

      {/* RIGHT SIDE / BOTTOM ON MOBILE */}
      <div className="w-full md:w-2/3 flex flex-col flex-1 overflow-hidden">
        
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {uploadedDocument && (
            <DocumentPreview document={uploadedDocument} />
          )}

          <div className="flex justify-start mb-6">
            <div className="bg-white border border-slate-200 text-slate-800 p-4 rounded-lg shadow-sm max-w-lg text-sm md:text-base">
              <p>Hello! I am your Socratic Tutor. I see you&apos;ve uploaded the Data Structures syllabus. What would you like to learn today?</p>
            </div>
          </div>

          <div className="flex justify-end mb-6">
            <div className="bg-blue-600 text-white p-4 rounded-lg shadow-sm max-w-lg text-sm md:text-base">
              <p>Can you tell me how a Binary Search Tree works?</p>
            </div>
          </div>

          {showHint && (
            <div className="flex justify-start mb-6">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg shadow-sm max-w-lg text-sm md:text-base">
                <p>Hint: Think about how a tree structure splits data into smaller halves!</p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start mb-6">
              <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex flex-wrap md:flex-nowrap gap-2 max-w-4xl mx-auto">
            <button 
              onClick={handleHintClick}
              className="bg-amber-100 text-amber-700 px-4 py-3 rounded-lg font-medium hover:bg-amber-200 transition text-sm md:text-base shrink-0"
              title="Need a hint?"
            >
              Hint
            </button>

            <input 
              type="text" 
              placeholder="Type your answer..." 
              className="flex-1 border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 text-sm md:text-base min-w-[150px]"
            />
            
            <button 
              onClick={handleSendClick}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition text-sm md:text-base shrink-0"
            >
              Send
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}