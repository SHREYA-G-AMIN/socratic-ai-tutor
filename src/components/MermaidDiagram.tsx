"use client";

import { useEffect, useId, useState } from "react";

import {
  MAX_MERMAID_SOURCE_LENGTH,
  renderMermaidSafely,
  type MermaidRenderResult,
} from "@/lib/ai/visual-explanations";
import { useTheme } from "@/lib/theme";

export function MermaidDiagram({ source }: { source: string }) {
  const { theme } = useTheme();
  const diagramId = `tutor-diagram-${useId().replaceAll(":", "")}`;
  const [renderState, setRenderState] = useState<{
    source: string;
    result: MermaidRenderResult;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const result = await renderMermaidSafely(source, async (mermaidSource) => {
        const { default: mermaid } = await import("mermaid");
        const styles = getComputedStyle(document.documentElement);
        const token = (name: string, fallback: string) =>
          styles.getPropertyValue(name).trim() || fallback;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          htmlLabels: false,
          theme: "base",
          themeVariables: {
            background: token("--surface", "#ffffff"),
            primaryColor: token("--surface-elevated", "#f5f0e8"),
            primaryTextColor: token("--text-primary", "#2a2622"),
            primaryBorderColor: token("--border-emphasis", "#d5cfc5"),
            lineColor: token("--accent-secondary", "#7a9b76"),
            secondaryColor: token("--surface-tertiary", "#f0ebe3"),
            tertiaryColor: token("--surface", "#ffffff"),
            fontFamily: "inherit",
          },
        });

        const { svg: renderedSvg } = await mermaid.render(
          diagramId,
          mermaidSource,
        );
        return renderedSvg;
      });

      if (cancelled) return;
      setRenderState({ source, result });
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [diagramId, source, theme]);

  const result = renderState?.source === source ? renderState.result : null;

  return (
    <figure className="mt-3 rounded-xl border border-border bg-surface p-3">
      <figcaption className="mb-2 text-xs font-semibold text-text-secondary">
        Visual explanation
      </figcaption>
      {result?.kind === "fallback" ? (
        <div role="status">
          <p className="mb-2 text-xs text-text-muted">
            Diagram preview unavailable. Mermaid source:
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-elevated p-3 text-xs text-text-secondary">
            {result.source}
          </pre>
        </div>
      ) : result?.kind === "rendered" ? (
        <div
          aria-label="Visual explanation diagram"
          className="max-w-full overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          // Mermaid strict mode sanitizes generated SVG; React keeps it out of the HTML source.
          dangerouslySetInnerHTML={{ __html: result.svg }}
        />
      ) : (
        <p role="status" className="text-xs text-text-muted">
          Rendering diagram…
        </p>
      )}
      {source.length > MAX_MERMAID_SOURCE_LENGTH && (
        <span className="sr-only">Diagram source exceeds the preview limit.</span>
      )}
    </figure>
  );
}
