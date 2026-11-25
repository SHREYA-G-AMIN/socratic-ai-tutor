"use client";

import { useEffect, useId, useState } from "react";

import {
  diagramToMermaidSource,
  MAX_MERMAID_SOURCE_LENGTH,
  renderMermaidSafely,
  validateGeneralDiagram,
  validateGroundedDiagram,
  type DiagramData,
  type MermaidRenderResult,
} from "@/lib/ai/visual-explanations";
import { useTheme } from "@/lib/theme";

export function MermaidDiagram({
  data,
  sourcePassages,
  source,
  allowUngrounded = false,
}: {
  data?: DiagramData;
  sourcePassages?: string[];
  source?: string;
  allowUngrounded?: boolean;
}) {
  const { theme } = useTheme();
  const diagramId = `tutor-diagram-${useId().replaceAll(":", "")}`;
  const mermaidSource =
    data === undefined
      ? source ?? null
      : diagramToMermaidSource(
          allowUngrounded
            ? validateGeneralDiagram(data)
            : validateGroundedDiagram(data, sourcePassages ?? []),
        );
  const [zoom, setZoom] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [renderState, setRenderState] = useState<{
    source: string | null;
    result: MermaidRenderResult;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const result = await renderMermaidSafely(
        mermaidSource,
        async (validatedSource) => {
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
            validatedSource,
          );
          return renderedSvg;
        },
      );

      if (cancelled) return;
      setRenderState({ source: mermaidSource, result });
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [diagramId, mermaidSource, theme]);

  const result =
    renderState?.source === mermaidSource ? renderState.result : null;

  useEffect(() => {
    setZoom(1);
    setIsExpanded(false);
  }, [mermaidSource]);

  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  const changeZoom = (amount: number) => {
    setZoom((current) => Math.min(3, Math.max(0.5, Math.round((current + amount) * 100) / 100)));
  };

  const diagramViewport = (expanded: boolean) => (
    <div
      role="region"
      aria-label="Scrollable diagram. Hold Control and use the mouse wheel to zoom."
      tabIndex={0}
      onWheel={(event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        changeZoom(event.deltaY < 0 ? 0.1 : -0.1);
      }}
      className={`min-w-0 overflow-auto rounded-lg bg-surface-elevated/40 ${expanded ? "min-h-0 flex-1" : "max-h-96"}`}
    >
      <div
        className="inline-block min-w-full p-3 [&_svg]:block [&_svg]:h-auto [&_svg]:max-w-none [&_svg]:w-auto"
        style={{ zoom }}
        dangerouslySetInnerHTML={{ __html: result?.kind === "rendered" ? result.svg : "" }}
      />
    </div>
  );

  const controls = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => changeZoom(-0.2)} disabled={zoom <= 0.5} aria-label="Zoom out" title="Zoom out" className="rounded-lg border border-border px-2.5 py-1.5 text-sm font-semibold hover:bg-surface-elevated disabled:opacity-40">−</button>
      <span className="min-w-12 text-center text-xs tabular-nums text-text-secondary">{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={() => changeZoom(0.2)} disabled={zoom >= 3} aria-label="Zoom in" title="Zoom in" className="rounded-lg border border-border px-2.5 py-1.5 text-sm font-semibold hover:bg-surface-elevated disabled:opacity-40">+</button>
      <button type="button" onClick={() => setZoom(1)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-elevated">Reset</button>
      <button type="button" onClick={() => setIsExpanded((value) => !value)} aria-label={isExpanded ? "Close expanded diagram" : "Expand diagram"} className="ml-auto rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-elevated">
        {isExpanded ? "Close" : "Expand"}
      </button>
    </div>
  );

  return (
    <figure className="mt-3 min-w-0 max-w-full rounded-xl border border-border bg-surface p-3">
      <figcaption className="mb-2 text-xs font-semibold text-text-secondary">
        Visual explanation
      </figcaption>
      {result?.kind === "unavailable" ? (
        <p role="status" className="text-xs text-text-muted">
          Diagram preview unavailable because its structured data is invalid.
        </p>
      ) : result?.kind === "fallback" ? (
        <div role="status">
          <p className="mb-2 text-xs text-text-muted">
            Diagram preview unavailable. Mermaid source:
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-elevated p-3 text-xs text-text-secondary">
            {result.source}
          </pre>
        </div>
      ) : result?.kind === "rendered" ? (
        <div className="space-y-2">
          {controls}
          {diagramViewport(false)}
          {isExpanded && (
            <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-surface p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Expanded visual explanation">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text-primary">Visual explanation</p>
                {controls}
              </div>
              {diagramViewport(true)}
              <p className="text-center text-xs text-text-muted">Use the controls or hold Ctrl and scroll to zoom. Scroll to pan around the diagram.</p>
            </div>
          )}
        </div>
      ) : (
        <p role="status" className="text-xs text-text-muted">
          Rendering diagram…
        </p>
      )}
      {(mermaidSource?.length ?? 0) > MAX_MERMAID_SOURCE_LENGTH && (
        <span className="sr-only">Diagram source exceeds the preview limit.</span>
      )}
    </figure>
  );
}
