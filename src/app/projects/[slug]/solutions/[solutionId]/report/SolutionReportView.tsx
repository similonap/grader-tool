"use client";

import { useEffect, useRef, useState } from "react";
import type { DiffLine } from "@/lib/diff";
import { checkedPoints, criterionId, totalPoints, type GradingKeyDoc } from "@/lib/gradingKey";
import { ACCENT_RAMP, fmtPts, renderDescription } from "@/lib/gradingKeyDisplay";
import type { CodeReference, SolutionGrading } from "@/lib/types";

interface DiffResponse {
  path: string;
  binary: boolean;
  lines: DiffLine[] | null;
  oldSize?: number | null;
  newSize?: number | null;
  error?: string;
}

export function SolutionReportView({
  slug,
  solutionId,
  solutionLabel,
  solutionGroup,
  projectLabel,
  gradingKey,
  grading,
}: {
  slug: string;
  solutionId: string;
  solutionLabel: string;
  solutionGroup: string | null;
  projectLabel: string;
  gradingKey: GradingKeyDoc | null;
  grading: SolutionGrading;
}) {
  const hasStructuredGradingKey = !!gradingKey?.sections?.length;
  const total = totalPoints(gradingKey);
  const checked = checkedPoints(gradingKey, grading.criteria);
  const graded = Date.parse(grading.updatedAt) > 0;

  const sections = (gradingKey?.sections ?? []).map((section, si) => {
    const criteria = section.criteria ?? [];
    const sectionTotal = criteria.reduce((sum, c) => sum + (c.points ?? 0), 0);
    const sectionChecked = criteria.reduce((sum, c, ci) => {
      const id = criterionId(section, si, c, ci);
      return sum + (grading.criteria[id]?.checked ? c.points ?? 0 : 0);
    }, 0);
    return { section, si, sectionTotal, sectionChecked, color: ACCENT_RAMP[si % ACCENT_RAMP.length] };
  });

  const [openRef, setOpenRef] = useState<CodeReference | null>(null);
  const [diffCache, setDiffCache] = useState<Record<string, DiffResponse>>({});
  const [jumpNonce, setJumpNonce] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const diff = openRef ? diffCache[openRef.file] : undefined;
  const loading = !!openRef && diff === undefined;

  function openReference(ref: CodeReference) {
    setOpenRef(ref);
    setJumpNonce((n) => n + 1);
    if (diffCache[ref.file] !== undefined) return;

    fetch(`/api/projects/${slug}/solutions/${solutionId}/diff?file=${encodeURIComponent(ref.file)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load the code for this reference.");
        return data as DiffResponse;
      })
      .then((data) => setDiffCache((prev) => ({ ...prev, [ref.file]: data })))
      .catch((err) => {
        setDiffCache((prev) => ({
          ...prev,
          [ref.file]: {
            path: ref.file,
            binary: false,
            lines: null,
            error: err instanceof Error ? err.message : "Failed to load the code for this reference.",
          },
        }));
      });
  }

  useEffect(() => {
    if (!openRef) return;
    const el = containerRef.current?.querySelector(`[data-diff-index="${openRef.lineIndex}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [diff, openRef, jumpNonce]);

  useEffect(() => {
    if (!openRef) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenRef(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openRef]);

  return (
    <div className="mx-auto max-w-3xl px-6 pb-10">
      <div className="mb-8 border-b border-line pb-7">
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-balance font-display text-[32px] font-semibold leading-tight text-ink">{solutionLabel}</h1>
          {hasStructuredGradingKey && (
            <span
              className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-sm font-semibold ${
                graded ? "bg-accent-soft text-accent-ink" : "bg-surface-2 text-muted"
              }`}
            >
              {graded ? `${fmtPts(checked)} / ${fmtPts(total)} pt` : "Not graded yet"}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted">
          {solutionGroup ? `${solutionGroup} · ` : ""}
          {gradingKey?.title || projectLabel}
        </p>
      </div>

      {grading.overallComment.trim() && (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
          <h2 className="font-display text-lg font-semibold text-ink">Overall comment</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{grading.overallComment}</p>
        </div>
      )}

      {!hasStructuredGradingKey ? (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-muted">
            This project doesn&apos;t have a structured grading key, so there&apos;s no per-criterion report to show.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map(({ section, si, sectionTotal, sectionChecked, color }) => (
            <div
              key={section.id ?? si}
              className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow)]"
            >
              <div className="flex items-center gap-3.5 border-b border-line px-5 py-4">
                <div
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-2 font-mono text-sm font-semibold"
                  style={{ color }}
                >
                  {section.id ?? si + 1}
                </div>
                <h3 className="min-w-0 flex-1 font-display text-lg font-semibold leading-tight text-ink">
                  {section.title || "Untitled section"}
                </h3>
                <span className="shrink-0 rounded-md border border-line bg-surface-2 px-2.5 py-1 font-mono text-xs text-muted">
                  <strong className="font-semibold text-ink">{fmtPts(sectionChecked)}</strong> / {fmtPts(sectionTotal)} pt
                </span>
              </div>

              <div className="flex flex-col">
                {(section.criteria ?? []).map((criterion, ci) => {
                  const id = criterionId(section, si, criterion, ci);
                  const grade = grading.criteria[id];
                  const isChecked = !!grade?.checked;

                  return (
                    <div
                      key={id}
                      className={`border-b border-line px-5 py-3.5 text-sm last:border-0 ${isChecked ? "bg-accent-soft" : ""}`}
                    >
                      <div className="grid grid-cols-[22px_1fr_56px] items-start gap-3.5">
                        <span
                          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-bold ${
                            isChecked ? "border-accent bg-accent text-white" : "border-line-strong text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <span className="text-ink">
                          <span className="mr-1.5 font-mono text-xs text-muted-2">{criterion.id ?? ci + 1}</span>
                          {criterion.description ? renderDescription(criterion.description) : "—"}
                        </span>
                        <span className="justify-self-end whitespace-nowrap rounded-md bg-accent-soft px-1.5 py-0.5 text-right font-mono text-xs font-semibold text-accent-ink">
                          {fmtPts(criterion.points ?? 0)}
                        </span>
                      </div>

                      {grade?.comment.trim() && (
                        <p className="col-start-2 mt-1.5 pl-[34px] text-xs text-muted">{grade.comment}</p>
                      )}

                      {grade && grade.references.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[34px]">
                          {grade.references.map((ref) => (
                            <button
                              key={ref.id}
                              type="button"
                              onClick={() => openReference(ref)}
                              title={ref.snippet}
                              className={`rounded-full py-0.5 pl-2 pr-2 font-mono text-[11px] transition-colors ${
                                openRef?.id === ref.id
                                  ? "bg-accent text-white"
                                  : "bg-surface-2 text-muted hover:bg-line-strong hover:text-ink"
                              }`}
                            >
                              {ref.file.split("/").pop()}:{ref.line}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {openRef && (
        <>
          <div className="fixed inset-0 z-20 bg-ink/30" onClick={() => setOpenRef(null)} />
          <div className="fixed inset-y-0 right-0 z-30 flex w-full max-w-2xl flex-col border-l border-line bg-surface shadow-[var(--shadow)]">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <code className="text-sm">{openRef.file}</code>
                <p className="mt-0.5 font-mono text-[11px] text-muted-2">line {openRef.line}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenRef(null)}
                aria-label="Close code viewer"
                className="shrink-0 rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div ref={containerRef} className="flex-1 overflow-auto">
              {loading || !diff ? (
                <p className="p-6 text-sm text-muted">Loading code…</p>
              ) : diff.error ? (
                <p className="p-6 text-sm text-red-600">{diff.error}</p>
              ) : diff.binary ? (
                <p className="p-6 text-sm text-muted">Binary file - contents not shown.</p>
              ) : (
                <ReadOnlyDiffTable lines={diff.lines ?? []} highlightIndex={openRef.lineIndex} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReadOnlyDiffTable({ lines, highlightIndex }: { lines: DiffLine[]; highlightIndex: number }) {
  if (lines.length === 0) {
    return <p className="p-6 text-sm text-muted">Empty file.</p>;
  }

  return (
    <table className="w-full border-collapse font-mono text-xs">
      <tbody>
        {lines.map((line, i) => {
          const isHighlighted = i === highlightIndex;
          return (
            <tr
              key={i}
              data-diff-index={i}
              className={[
                line.type === "add" ? "bg-emerald-50" : line.type === "remove" ? "bg-red-50" : "",
                isHighlighted ? "outline outline-2 -outline-offset-2 outline-accent" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <td className="w-10 select-none border-r border-line px-2 py-0.5 text-right text-muted-2">
                {line.oldLineNo ?? ""}
              </td>
              <td className="w-10 select-none border-r border-line px-2 py-0.5 text-right text-muted-2">
                {line.newLineNo ?? ""}
              </td>
              <td
                className={`whitespace-pre px-3 py-0.5 ${
                  line.type === "add" ? "text-emerald-800" : line.type === "remove" ? "text-red-800" : "text-ink"
                }`}
              >
                <span className="mr-2 select-none text-muted-2">
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </span>
                {line.content}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
