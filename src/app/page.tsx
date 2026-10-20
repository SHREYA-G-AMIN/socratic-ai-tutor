export default function Home() {
  return (
    <div className="flex h-screen bg-slate-50">
      
      {/* LEFT SIDEBAR: PDF Upload UI */}
      <div className="w-1/3 bg-white border-r border-slate-200 p-6 flex flex-col">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">SocraticAI</h1>
        <p className="text-sm text-slate-500 mb-8">Upload your syllabus or textbook to begin.</p>
        
        {/* Upload Box */}
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition cursor-pointer">
          <p className="text-slate-600 font-medium">Click to upload PDF</p>
          <p className="text-xs text-slate-400 mt-2">Max file size: 10MB</p>
        </div>
      </div>

      {/* RIGHT SIDE: Tutor Chat Interface */}
      <div className="w-2/3 flex flex-col">
        
        {/* Chat Messages Area */}
        <div className="flex-1 p-8 overflow-y-auto">
          {/* Dummy AI Message */}
          <div className="flex justify-start mb-6">
            <div className="bg-white border border-slate-200 text-slate-800 p-4 rounded-lg shadow-sm max-w-lg">
              <p>Hello! I am your Socratic Tutor. I see you've uploaded the Data Structures syllabus. What would you like to learn today?</p>
            </div>
          </div>

          {/* Dummy Student Message */}
          <div className="flex justify-end mb-6">
            <div className="bg-blue-600 text-white p-4 rounded-lg shadow-sm max-w-lg">
              <p>Can you tell me how a Binary Search Tree works?</p>
            </div>
          </div>
        </div>

        {/* Message Input Area */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex gap-2 max-w-4xl mx-auto">
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