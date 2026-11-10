import type { DiagramData } from "@/lib/ai/visual-explanations";

export interface ChatSourceReference {
  fileName: string | null;
  chunkIndex: number;
  startChar: number;
  endChar: number;
  pageNumbers: number[];
  text: string;
  score: number;
}

export interface ChatResponse {
  reply: string;
  diagram?: string;
  diagramData?: DiagramData;
  sources: ChatSourceReference[];
  retrievalMode: "semantic" | "keyword";
  warning?: string;
}
