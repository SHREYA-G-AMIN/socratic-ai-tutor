import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
} from "../src/lib/documents/constants.ts";

register("./server-only-hook.mjs", import.meta.url);

const { chunkText } = await import("../src/lib/documents/chunker.ts");

/**
 * Builds a document of predictable length.
 *
 * Every word is unique and of a known size, which lets the tests make exact
 * statements about chunk boundaries.
 */
function buildText(paragraphs: number, wordsPerParagraph = 60): string {
  const blocks: string[] = [];

  for (let paragraph = 0; paragraph < paragraphs; paragraph++) {
    const words: string[] = [];

    for (let word = 0; word < wordsPerParagraph; word++) {
      words.push(`w${paragraph}-${word}`);
    }

    blocks.push(words.join(" "));
  }

  return blocks.join("\n\n");
}

test("empty text produces no chunks", () => {
  assert.deepEqual(chunkText(""), []);
});

test("text made only of whitespace produces no chunks", () => {
  assert.deepEqual(chunkText("   \n\n\t  \r\n "), []);
});

test("short text becomes a single chunk that keeps the whole text", () => {
  const text = "A binary search tree keeps its keys sorted.";
  const chunks = chunkText(text);

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].index, 0);
  assert.equal(chunks[0].text, text);
  assert.equal(chunks[0].characterCount, text.length);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks[0].end, text.length);
});

test("surrounding whitespace is dropped but the words are kept", () => {
  const chunks = chunkText("\n\n  Hello tutor.  \n");

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, "Hello tutor.");
});

test("long text is split into several chunks that respect the chunk size", () => {
  const chunks = chunkText(buildText(20, 60), {
    chunkSize: 500,
    chunkOverlap: 100,
  });

  assert.ok(chunks.length > 1, "expected more than one chunk");

  chunks.forEach((chunk, position) => {
    assert.equal(chunk.index, position, "chunk indices must be consecutive");
    assert.ok(
      chunk.characterCount <= 500,
      `chunk ${position} holds ${chunk.characterCount} characters`,
    );
  });
});

test("the default chunk size is used when no size is given", () => {
  const chunks = chunkText(buildText(40, 60));

  assert.ok(chunks.length > 1);

  for (const chunk of chunks) {
    assert.ok(chunk.characterCount <= DEFAULT_CHUNK_SIZE);
  }
});

test("the default overlap is used when no overlap is given", () => {
  const chunks = chunkText(buildText(20, 60));

  assert.ok(chunks.length > 1);

  for (let position = 1; position < chunks.length; position++) {
    const previous = chunks[position - 1];
    const current = chunks[position];

    assert.ok(
      previous.end - current.start >= DEFAULT_CHUNK_OVERLAP,
      `chunks ${position - 1} and ${position} share only ${previous.end - current.start} characters`,
    );
  }
});

test("consecutive chunks overlap so no sentence is cut in half", () => {
  const chunkSize = 200;
  const chunkOverlap = 50;
  const chunks = chunkText(buildText(20, 60), { chunkSize, chunkOverlap });

  assert.ok(chunks.length > 1);

  for (let position = 1; position < chunks.length; position++) {
    const previous = chunks[position - 1];
    const current = chunks[position];
    const shared = previous.end - current.start;

    assert.ok(
      shared >= chunkOverlap,
      `chunks ${position - 1} and ${position} share only ${shared} characters`,
    );
    assert.ok(
      shared <= chunkOverlap + 12,
      `chunks ${position - 1} and ${position} share ${shared} characters, more than the ${chunkOverlap} requested`,
    );
    assert.equal(
      previous.text.slice(previous.text.length - shared),
      current.text.slice(0, shared),
      "the shared region must be the same text in both chunks",
    );
  }
});

test("a zero overlap means neighbouring chunks share no text", () => {
  const chunks = chunkText(buildText(10, 40), {
    chunkSize: 200,
    chunkOverlap: 0,
  });

  assert.ok(chunks.length > 1);

  for (let position = 1; position < chunks.length; position++) {
    assert.ok(
      chunks[position].start >= chunks[position - 1].end,
      "chunks must not overlap",
    );
  }
});

test("every chunk is a verbatim slice of the source text", () => {
  const text = buildText(20, 40);
  const chunks = chunkText(text, { chunkSize: 300, chunkOverlap: 60 });

  for (const chunk of chunks) {
    assert.equal(text.slice(chunk.start, chunk.end), chunk.text);
    assert.ok(text.includes(chunk.text));
  }
});

test("no character of the source text is lost", () => {
  const text = buildText(20, 40);
  const chunks = chunkText(text, { chunkSize: 300, chunkOverlap: 60 });
  const covered = new Uint8Array(text.length);

  for (const chunk of chunks) {
    for (let index = chunk.start; index < chunk.end; index++) {
      covered[index] = 1;
    }
  }

  for (let index = 0; index < text.length; index++) {
    if (covered[index] === 0 && !/\s/.test(text[index])) {
      assert.fail(
        `character ${index} ("${text[index]}") is missing from every chunk`,
      );
    }
  }
});

test("chunks never start or end in the middle of a word", () => {
  const text = buildText(15, 50);
  const chunks = chunkText(text, { chunkSize: 250, chunkOverlap: 50 });

  for (const chunk of chunks) {
    if (chunk.start > 0) {
      assert.ok(
        /\s/.test(text[chunk.start - 1]),
        `chunk ${chunk.index} starts in the middle of a word`,
      );
    }

    if (chunk.end < text.length) {
      assert.ok(
        /\s/.test(text[chunk.end]),
        `chunk ${chunk.index} ends in the middle of a word`,
      );
    }
  }
});

test("chunks stay in document order and always move forward", () => {
  const chunks = chunkText(buildText(10, 40), {
    chunkSize: 200,
    chunkOverlap: 40,
  });

  for (let position = 1; position < chunks.length; position++) {
    assert.ok(
      chunks[position].start > chunks[position - 1].start,
      "each chunk must start later than the one before it",
    );
    assert.ok(
      chunks[position].end >= chunks[position - 1].end,
      "each chunk must reach at least as far into the document",
    );
  }
});

test("the same input always produces the same chunks", () => {
  const text = buildText(10, 30);

  assert.deepEqual(chunkText(text), chunkText(text));
});

test("a word longer than the chunk size becomes its own chunk", () => {
  const longWord = "x".repeat(500);
  const chunks = chunkText(`${longWord} tail`, {
    chunkSize: 100,
    chunkOverlap: 10,
  });

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].text, longWord);
  assert.equal(chunks[1].text, "tail");
});

test("unusable settings are rejected", () => {
  assert.throws(() => chunkText("hello", { chunkSize: 0 }), RangeError);
  assert.throws(() => chunkText("hello", { chunkSize: -10 }), RangeError);
  assert.throws(() => chunkText("hello", { chunkSize: 1.5 }), RangeError);
  assert.throws(() => chunkText("hello", { chunkOverlap: -1 }), RangeError);
  assert.throws(
    () => chunkText("hello", { chunkSize: 100, chunkOverlap: 100 }),
    RangeError,
  );
  assert.throws(
    () => chunkText("hello", { chunkSize: 100, chunkOverlap: 200 }),
    RangeError,
  );
});
