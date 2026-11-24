import "server-only";

import { createHash } from "node:crypto";

const TABLE = "document_embeddings";
const WRITE_BATCH_SIZE = 100;

interface StoredEmbeddingRow {
  chunk_index: number;
  chunk_hash: string;
  embedding: number[];
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

/** Returns null when persistence is not configured or a stored snapshot is incomplete. */
export async function loadDocumentEmbeddings(
  documentKey: string,
  model: string,
  texts: string[],
): Promise<number[][] | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    select: "chunk_index,chunk_hash,embedding",
    document_key: `eq.${documentKey}`,
    model: `eq.${model}`,
    order: "chunk_index.asc",
  });

  try {
    const response = await fetch(
      `${config.url}/rest/v1/${TABLE}?${params.toString()}`,
      {
        headers: {
          apikey: config.key,
          authorization: `Bearer ${config.key}`,
        },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
    if (!response.ok) return null;

    const rows = (await response.json()) as StoredEmbeddingRow[];
    if (!Array.isArray(rows) || rows.length !== texts.length) return null;

    const vectors: number[][] = [];
    for (let index = 0; index < texts.length; index++) {
      const row = rows[index];
      if (
        row?.chunk_index !== index ||
        row.chunk_hash !== hashText(texts[index]) ||
        !Array.isArray(row.embedding) ||
        row.embedding.length === 0 ||
        row.embedding.some((value) => !Number.isFinite(value))
      ) {
        return null;
      }
      vectors.push(row.embedding);
    }
    return vectors;
  } catch {
    return null;
  }
}

/** Stores vectors only; original PDF text and user prompts are never persisted here. */
export async function saveDocumentEmbeddings(
  documentKey: string,
  model: string,
  texts: string[],
  vectors: number[][],
): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config || texts.length !== vectors.length) return false;

  try {
    for (let offset = 0; offset < texts.length; offset += WRITE_BATCH_SIZE) {
      const rows = texts.slice(offset, offset + WRITE_BATCH_SIZE).map((text, index) => ({
        document_key: documentKey,
        model,
        chunk_index: offset + index,
        chunk_hash: hashText(text),
        embedding: vectors[offset + index],
      }));

      const response = await fetch(
        `${config.url}/rest/v1/${TABLE}?on_conflict=document_key,model,chunk_index`,
        {
          method: "POST",
          headers: {
            apikey: config.key,
            authorization: `Bearer ${config.key}`,
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(rows),
          signal: AbortSignal.timeout(12_000),
          cache: "no-store",
        },
      );
      if (!response.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
