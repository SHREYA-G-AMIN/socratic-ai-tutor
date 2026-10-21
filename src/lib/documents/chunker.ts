import "server-only";

import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "./constants";

/**
 * Settings that control how a document is split into chunks.
 */
export interface ChunkOptions {
  /**
   * Maximum number of characters in a single chunk.
   * Defaults to {@link DEFAULT_CHUNK_SIZE}.
   */
  chunkSize?: number;

  /**
   * How many characters consecutive chunks share.
   * Defaults to {@link DEFAULT_CHUNK_OVERLAP}.
   */
  chunkOverlap?: number;
}

/**
 * One chunk of a document.
 */
export interface TextChunk {
  /** Zero-based position of the chunk in the document. */
  index: number;
  /** The chunk content, copied verbatim from the source text. */
  text: string;
  /** Number of characters in `text`. */
  characterCount: number;
  /** Offset of the chunk's first character in the source text. */
  start: number;
  /** Offset just past the chunk's last character in the source text. */
  end: number;
}

/**
 * A word together with the place it occupies in the source text.
 */
interface WordSpan {
  start: number;
  end: number;
}

/**
 * Splits a document into overlapping chunks that can be searched
 * independently later.
 *
 * The text is never rewritten: every chunk is a verbatim copy of a slice of
 * the input, and the chunks together cover the whole document. Cuts always
 * fall on a word boundary, so a chunk never starts or ends in the middle of
 * a word.
 *
 * This function knows nothing about language models, embeddings or vector
 * stores. It only turns a long string into ordered pieces.
 *
 * @param text - The document to split.
 * @param options - Optional chunk size and overlap.
 * @returns The chunks in document order, or an empty array for empty text.
 * @throws RangeError If the chunk size or overlap is not usable.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  assertValidOptions(chunkSize, chunkOverlap);

  const words = findWords(text);

  if (words.length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let firstWord = 0;

  while (firstWord < words.length) {
    // Take as many words as still fit inside the chunk size.
    let lastWord = firstWord;

    while (
      lastWord + 1 < words.length &&
      words[lastWord + 1].end - words[firstWord].start <= chunkSize
    ) {
      lastWord++;
    }

    chunks.push({
      index: chunks.length,
      text: text.slice(words[firstWord].start, words[lastWord].end),
      characterCount: words[lastWord].end - words[firstWord].start,
      start: words[firstWord].start,
      end: words[lastWord].end,
    });

    if (lastWord + 1 >= words.length) {
      break;
    }

    // Start the next chunk far enough back that it repeats the tail of this
    // one, so a sentence sitting across a boundary survives in one piece.
    firstWord = findOverlapStart(words, firstWord, lastWord, chunkOverlap);
  }

  return chunks;
}

/**
 * Finds every word in the text together with its position.
 *
 * A word is a run of characters that are not whitespace. The gaps between
 * words are not part of any word, but they stay inside a chunk because a
 * chunk is copied straight out of the source text.
 */
function findWords(text: string): WordSpan[] {
  const words: WordSpan[] = [];

  for (const match of text.matchAll(/\S+/g)) {
    words.push({ start: match.index, end: match.index + match[0].length });
  }

  return words;
}

/**
 * Chooses where the next chunk should start so that it shares about
 * `chunkOverlap` characters with the chunk that was just emitted.
 *
 * The later the next chunk starts, the less text the two chunks share, so
 * we walk backwards from the end of the current chunk until the shared
 * region is big enough. The walk never goes past the second word of the
 * current chunk, because the next chunk always has to move forward.
 */
function findOverlapStart(
  words: WordSpan[],
  firstWord: number,
  lastWord: number,
  chunkOverlap: number,
): number {
  const sharedWith = (startIndex: number) =>
    startIndex > lastWord ? 0 : words[lastWord].end - words[startIndex].start;

  let candidate = lastWord + 1;

  while (candidate > firstWord + 1 && sharedWith(candidate) < chunkOverlap) {
    candidate--;
  }

  return candidate;
}

/**
 * Rejects settings that cannot produce a sensible chunking.
 */
function assertValidOptions(chunkSize: number, chunkOverlap: number): void {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError("chunkSize must be a positive whole number.");
  }

  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0) {
    throw new RangeError(
      "chunkOverlap must be zero or a positive whole number.",
    );
  }

  if (chunkOverlap >= chunkSize) {
    throw new RangeError("chunkOverlap must be smaller than chunkSize.");
  }
}
