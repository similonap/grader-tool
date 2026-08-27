"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GatewayModelOption } from "@/lib/aiGateway";
import { CUSTOM_LANGUAGE, FEEDBACK_LANGUAGES, resolveInitialLanguage } from "@/lib/feedbackLanguages";
import type { AutogradeJob, AutogradeJobItemStatus } from "@/lib/types";

const STATUS_LABEL: Record<AutogradeJobItemStatus, string> = {
  pending: "Waiting…",
  running: "Grading…",
  done: "Done",
  error: "Failed",
  skipped: "Skipped",
};

const STATUS_COLOR: Record<AutogradeJobItemStatus, string> = {
  pending: "text-muted-2",
  running: "text-amber-600",
  done: "text-emerald-700",
  error: "text-red-600",
  skipped: "text-muted-2",
};

/**
 * The grading-status column shows a live job status while a run is actually
 * in flight or just failed, but otherwise falls back to the solution's
 * persistent graded/ungraded state - so a solution graded in a past session
 * (or manually, never autograded at all) still reads as "Done", and one
 * that's never been graded reads as "Ungraded" rather than blank.
 */
function gradingStatus(
  graded: boolean,
  jobItem: { status: AutogradeJobItemStatus } | undefined
): { label: string; color: string } {
  if (jobItem?.status === "pending" || jobItem?.status === "running" || jobItem?.status === "error") {
    return { label: STATUS_LABEL[jobItem.status], color: STATUS_COLOR[jobItem.status] };
  }
  if (jobItem?.status === "skipped" && !graded) {
    return { label: STATUS_LABEL.skipped, color: STATUS_COLOR.skipped };
  }
  return graded ? { label: "Done", color: "text-emerald-700" } : { label: "Ungraded", color: "text-red-600" };
}

export interface SolutionRow {
  id: string;
  label: string;
  group: string | null;
  uploadedAtLabel: string;
  grade: { checked: number; total: number } | null;
  /** Whether any grading (autograde or manual) has ever been saved for this solution. */
  graded: boolean;
}

export function SolutionsTable({
  slug,
  solutions,
  existingGroups,
  hasAiGatewayKey,
  hasStructuredGradingKey,
  initialModel,
  initialLanguage,
}: {
  slug: string;
  solutions: SolutionRow[];
  existingGroups: string[];
  hasAiGatewayKey: boolean;
  hasStructuredGradingKey: boolean;
  initialModel: string | null;
  initialLanguage: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<AutogradeJob | null>(null);
  const [gatewayModels, setGatewayModels] = useState<GatewayModelOption[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(initialModel ?? "");
  const initialLangState = resolveInitialLanguage(initialLanguage);
  const [language, setLanguage] = useState(initialLangState.language);
  const [customLanguage, setCustomLanguage] = useState(initialLangState.customLanguage);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const effectiveLanguage = (language === CUSTOM_LANGUAGE ? customLanguage : language).trim();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [groupSort, setGroupSort] = useState<"asc" | "desc" | null>(null);

  // Ungrouped solutions always sort last, regardless of direction; within a
  // group (or within "ungrouped"), fall back to the label so the order stays
  // stable rather than shuffling ties around.
  const displayedSolutions = useMemo(() => {
    if (!groupSort) return solutions;
    const dir = groupSort === "asc" ? 1 : -1;
    return [...solutions].sort((a, b) => {
      const ga = a.group ?? "";
      const gb = b.group ?? "";
      if (!ga && !gb) return a.label.localeCompare(b.label);
      if (!ga) return 1;
      if (!gb) return -1;
      return dir * ga.localeCompare(gb) || a.label.localeCompare(b.label);
    });
  }, [solutions, groupSort]);

  function toggleGroupSort() {
    setGroupSort((prev) => (prev === null ? "asc" : prev === "asc" ? "desc" : null));
  }

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && selected.size < solutions.length;
    }
  }, [selected, solutions.length]);

  useEffect(() => {
    if (!hasAiGatewayKey) return;
    let cancelled = false;
    fetch("/api/settings/models")
      .then((res) => res.json())
      .then((data: { models?: GatewayModelOption[]; error?: string }) => {
        if (cancelled) return;
        if (data.models) {
          setGatewayModels(data.models);
          setSelectedModel((current) => current || data.models![0]?.id || "");
        } else {
          setModelsError(data.error ?? "Failed to load models.");
        }
      })
      .catch(() => {
        if (!cancelled) setModelsError("Failed to load models.");
      });
    return () => {
      cancelled = true;
    };
  }, [hasAiGatewayKey]);

  // Pick up an already-running job on load (e.g. after navigating away and back).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${slug}/autograde`)
      .then((res) => res.json())
      .then((data: { job?: AutogradeJob | null }) => {
        if (!cancelled) setJob(data.job ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Poll for progress while a job is running.
  useEffect(() => {
    if (job?.status !== "running") return;
    let cancelled = false;
    const timer = setInterval(() => {
      fetch(`/api/projects/${slug}/autograde`)
        .then((res) => res.json())
        .then((data: { job?: AutogradeJob | null }) => {
          if (!cancelled) setJob(data.job ?? null);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [slug, job?.status]);

  // Refresh the (server-rendered) grade column once a job finishes.
  useEffect(() => {
    if (job?.status && job.status !== "running") router.refresh();
  }, [job?.status, router]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === solutions.length ? new Set() : new Set(solutions.map((s) => s.id))));
  }

  async function runAutograde() {
    if (!selectedModel || !effectiveLanguage || selected.size === 0) return;

    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/projects/${slug}/autograde`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, language: effectiveLanguage, solutionIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start autograde.");
      setJob(data.job);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start autograde.");
    } finally {
      setStarting(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ids = [...selected];
    const proceed = window.confirm(
      `Delete ${ids.length} selected solution${ids.length === 1 ? "" : "s"}? This also removes any grading for them and cannot be undone.`
    );
    if (!proceed) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/projects/${slug}/solutions/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solutionIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete solutions.");
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete solutions.");
    } finally {
      setDeleting(false);
    }
  }

  async function cancelAutograde() {
    setCancelling(true);
    try {
      await fetch(`/api/projects/${slug}/autograde/cancel`, { method: "POST" });
    } catch {
      // best-effort - the next poll reflects the real state either way
    } finally {
      setCancelling(false);
    }
  }

  const running = job?.status === "running";
  const jobTotal = job?.items.length ?? 0;
  const settledCount = job?.items.filter((i) => i.status !== "pending" && i.status !== "running").length ?? 0;
  const erroredItems = job?.items.filter((i) => i.status === "error") ?? [];
  const allSelected = solutions.length > 0 && selected.size === solutions.length;
  // Every solution is graded against the same key, so `total` (max points)
  // is identical across graded rows - summing it across solutions would be
  // meaningless, so this is an average score, not a running total. Filtered
  // by `graded` (not just `grade` being present) so an untouched solution
  // doesn't drag the average down by silently counting as a 0.
  const gradedSolutions = solutions.filter((s) => s.graded);
  const averageRow =
    gradedSolutions.length > 0
      ? {
          avgChecked: gradedSolutions.reduce((sum, s) => sum + (s.grade?.checked ?? 0), 0) / gradedSolutions.length,
          total: gradedSolutions[0].grade!.total,
        }
      : null;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="font-display text-lg font-semibold text-ink">
          Solutions <span className="font-sans text-sm font-normal text-muted-2">({solutions.length})</span>
        </h2>

        {!hasAiGatewayKey ? (
          <p className="text-xs text-muted">
            Set your Vercel AI Gateway key in{" "}
            <Link href="/settings" className="text-accent underline">
              Settings
            </Link>{" "}
            to enable autograding.
          </p>
        ) : !hasStructuredGradingKey ? (
          <p className="text-xs text-muted">Autograding needs a structured grading key.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {modelsError ? (
              <p className="text-xs text-red-600">{modelsError}</p>
            ) : (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!gatewayModels || starting || running}
                className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
              >
                {!gatewayModels ? (
                  <option>Loading models…</option>
                ) : (
                  gatewayModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
            )}

            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={starting || running}
              className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
            >
              {FEEDBACK_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value={CUSTOM_LANGUAGE}>{CUSTOM_LANGUAGE}</option>
            </select>
            {language === CUSTOM_LANGUAGE && (
              <input
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
                placeholder="e.g. Korean"
                disabled={starting || running}
                className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
              />
            )}

            {running ? (
              <button
                type="button"
                onClick={cancelAutograde}
                disabled={cancelling}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                {cancelling ? "Cancelling…" : "Cancel run"}
              </button>
            ) : (
              <button
                type="button"
                onClick={runAutograde}
                disabled={
                  starting || selected.size === 0 || !selectedModel || (language === CUSTOM_LANGUAGE && !customLanguage.trim())
                }
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-105 disabled:opacity-40"
              >
                {starting ? "Starting…" : `Autograde ${selected.size} selected`}
              </button>
            )}
          </div>
        )}
      </div>
      {startError && <p className="mt-2 text-xs text-red-600">{startError}</p>}

      {job && (
        <div className="mt-3 rounded-md border border-line p-3">
          <div className="flex items-center justify-between font-mono text-xs text-muted">
            <span>
              {settledCount} / {jobTotal} ·{" "}
              {job.status === "running"
                ? "running"
                : job.status === "completed"
                  ? "completed"
                  : job.status === "cancelled"
                    ? "cancelled"
                    : "failed"}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-1.5 rounded-full bg-accent transition-all"
              style={{ width: `${jobTotal ? (settledCount / jobTotal) * 100 : 0}%` }}
            />
          </div>

          {erroredItems.length > 0 && (
            <details className="mt-1.5 text-xs">
              <summary className="cursor-pointer text-red-600">{erroredItems.length} failed - show details</summary>
              <ul className="mt-1 space-y-1 text-red-600">
                {erroredItems.map((item) => (
                  <li key={item.solutionId}>
                    <span className="font-medium">{item.label}:</span> {item.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2">
          <span className="text-xs text-muted">{selected.size} selected</span>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={deleting}
            className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete selected"}
          </button>
        </div>
      )}
      {deleteError && <p className="mt-2 text-xs text-red-600">{deleteError}</p>}

      {solutions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No solutions uploaded yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <datalist id="solution-groups-datalist">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-xs text-muted-2">
                <th className="w-8 py-2 pr-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all solutions"
                    className="rounded border-line-strong accent-accent"
                  />
                </th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">
                  <button type="button" onClick={toggleGroupSort} className="inline-flex items-center gap-1 hover:text-ink">
                    Group
                    <span className={`text-[10px] ${groupSort ? "text-accent" : "text-muted-2"}`}>
                      {groupSort === "desc" ? "▼" : "▲"}
                    </span>
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">Grade</th>
                <th className="py-2 pr-4 font-medium">Uploaded</th>
                <th className="py-2 pr-2 font-medium">Autograde</th>
              </tr>
            </thead>
            <tbody>
              {displayedSolutions.map((solution) => {
                const jobItem = job?.items.find((i) => i.solutionId === solution.id);
                const status = gradingStatus(solution.graded, jobItem);
                return (
                  <tr key={solution.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.has(solution.id)}
                        onChange={() => toggleOne(solution.id)}
                        aria-label={`Select ${solution.label}`}
                        className="rounded border-line-strong accent-accent"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/projects/${slug}/solutions/${solution.id}`} className="text-ink hover:text-accent hover:underline">
                        {solution.label}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <GroupCell
                        key={`${solution.id}:${solution.group ?? ""}`}
                        slug={slug}
                        solutionId={solution.id}
                        group={solution.group}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      {solution.grade && solution.graded ? (
                        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-accent-ink">
                          {solution.grade.checked} / {solution.grade.total} pts
                        </span>
                      ) : (
                        <span className="text-muted-2">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-2">{solution.uploadedAtLabel}</td>
                    <td className="py-2 pr-2">
                      <span className={status.color}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {averageRow && (
              <tfoot>
                <tr className="border-t border-line-strong font-medium">
                  <td className="py-2 pr-2" />
                  <td className="py-2 pr-4 text-xs text-muted-2" colSpan={2}>
                    Average ({gradedSolutions.length} graded)
                  </td>
                  <td className="py-2 pr-4">
                    <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-accent-ink">
                      {fmtPts(averageRow.avgChecked)} / {fmtPts(averageRow.total)} pts (
                      {averageRow.total > 0 ? Math.round((averageRow.avgChecked / averageRow.total) * 100) : 0}%)
                    </span>
                  </td>
                  <td className="py-2 pr-4" />
                  <td className="py-2 pr-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

function fmtPts(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function GroupCell({
  slug,
  solutionId,
  group,
}: {
  slug: string;
  solutionId: string;
  group: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(group ?? "");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    const next = value.trim();
    if (next === (group ?? "")) return;

    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/projects/${slug}/solutions/${solutionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: next || null }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      list="solution-groups-datalist"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder="—"
      disabled={saving}
      title={failed ? "Failed to save - try again" : undefined}
      className={`w-full min-w-[7rem] rounded border bg-transparent px-1.5 py-1 text-sm text-ink placeholder:text-muted-2 focus:bg-surface focus:outline-none disabled:opacity-40 ${
        failed ? "border-red-300" : "border-transparent hover:border-line-strong focus:border-accent"
      }`}
    />
  );
}
