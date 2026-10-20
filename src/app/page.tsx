"use client";

import { useRef, useState } from "react";

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showHint, setShowHint] = useState(false);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      alert(`Selected file: ${file.name}`);
    }
  };

  const handleHintClick = () => {
    setShowHint(true);
  };

  return (
    <div className="flex h-screen bg-slate-50">
      
      <div className="w-1/3 bg-white border-r border-slate-200 p-6 flex flex-col">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">SocraticAI</h1>
        <p className="text-sm text-slate-500 mb-8">Upload your syllabus or textbook to begin.</p>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept=".pdf" 
          className="hidden" 
        />

        <div 
          onClick={handleUploadClick}
          className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 hover:border-blue-400 transition cursor-pointer"
        >
          <p className="text-slate-600 font-medium">Click to upload PDF</p>
          <p className="text-xs text-slate-400 mt-2">Max file size: 10MB</p>
        </div>
      </div>

      <div className="w-2/3 flex flex-col">
        
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="flex justify-start mb-6">
            <div className="bg-white border border-slate-200 text-slate-800 p-4 rounded-lg shadow-sm max-w-lg">
              <p>Hello! I am your Socratic Tutor. I see you've uploaded the Data Structures syllabus. What would you like to learn today?</p>
            </div>
          </div>

          <div className="flex justify-end mb-6">
            <div className="bg-blue-600 text-white p-4 rounded-lg shadow-sm max-w-lg">
              <p>Can you tell me how a Binary Search Tree works?</p>
            </div>
          </div>

          {showHint && (
            <div className="flex justify-start mb-6">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg shadow-sm max-w-lg">
                <p>💡 Hint: Think about how a tree structure splits data into smaller halves!</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <button 
              onClick={handleHintClick}
              className="bg-amber-100 text-amber-700 px-4 py-3 rounded-lg font-medium hover:bg-amber-200 transition flex items-center gap-2"
              title="Need a hint?"
            >
              💡 Hint
            </button>

            <input 
              type="text" 
              placeholder="Type your answer or question here..." 
              className="flex-1 border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
            />
            
            <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition">
              Send
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}