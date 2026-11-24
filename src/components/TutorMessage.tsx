"use client";

import type { ReactNode } from "react";

const INLINE_TOKEN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\x60[^\x60]+\x60)/g;

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'",
  };
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (match, entity: string) => named[entity.toLowerCase()] ?? match);
}

function normalizeMarkdown(value: string): string {
  return decodeEntities(value)
    .replace(/\\([\\\x60*_{}\[\]()#+.!|>~-])/g, "$1")
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\bsvgHint\b:?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderInline(value: string, prefix: string): ReactNode[] {
  return value.split(INLINE_TOKEN).map((part, index) => {
    const key = prefix + index;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.charCodeAt(0) === 96 && part.charCodeAt(part.length - 1) === 96) {
      return <code key={key} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export function TutorMessage({ content }: { content: string }) {
  const lines = normalizeMarkdown(content).split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const key = blocks.length;
    blocks.push(<p key={key}>{renderInline(paragraph.join(" "), "p" + key)}</p>);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const key = blocks.length;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={key} className={list.ordered ? "list-decimal" : "list-disc"}>
        {list.items.map((item, index) => <li key={index}>{renderInline(item, "l" + key + "-" + index)}</li>)}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const key = blocks.length;
      const children = renderInline(heading[2], "h" + key);
      if (heading[1].length === 1) blocks.push(<h3 key={key} className="text-base font-bold">{children}</h3>);
      else if (heading[1].length === 2) blocks.push(<h4 key={key} className="text-sm font-bold">{children}</h4>);
      else blocks.push(<h5 key={key} className="text-sm font-semibold">{children}</h5>);
      return;
    }
    const bullet = /^(?:[-*•])\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      return;
    }
    flushList();
    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  return <div className="space-y-2 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:pl-1 [&_strong]:font-semibold">{blocks}</div>;
}
