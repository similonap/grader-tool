"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  pending: "text-zinc-400",
  running: "text-amber-600",
  done: "text-emerald-700",
  error: "text-red-600",
  skipped: "text-zinc-400",
};

export interface SolutionRow {
  id: string;
  label: string;
  group: string | null;
  uploadedAtLabel: string;
  grade: { checked: number; total: number } | null;
}

export function SolutionsTable({
  slug,
  solutions,
  hasAiGatewayKey,
  hasStructuredGradingKey,
  initialModel,
  initialLanguage,
}: {
  slug: string;
  solutions: SolutionRow[];
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

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-sm font-semibold text-zinc-900">
          Solutions <span className="font-normal text-zinc-400">({solutions.length})</span>
        </h2>

        {!hasAiGatewayKey ? (
          <p className="text-xs text-zinc-500">
            Set your Vercel AI Gateway key in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>{" "}
            to enable autograding.
          </p>
        ) : !hasStructuredGradingKey ? (
          <p className="text-xs text-zinc-500">Autograding needs a structured grading key.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {modelsError ? (
              <p className="text-xs text-red-600">{modelsError}</p>
            ) : (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!gatewayModels || starting || running}
                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-zinc-400 focus:outline-none"
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
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-zinc-400 focus:outline-none"
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
                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-zinc-400 focus:outline-none"
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
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {starting ? "Starting…" : `Autograde ${selected.size} selected`}
              </button>
            )}
          </div>
        )}
      </div>
      {startError && <p className="mt-2 text-xs text-red-600">{startError}</p>}

      {job && (
        <div className="mt-3 rounded-md border border-zinc-100 p-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
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
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-1.5 rounded-full bg-zinc-900 transition-all"
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
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2">
          <span className="text-xs text-zinc-600">{selected.size} selected</span>
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
        <p className="mt-3 text-sm text-zinc-500">No solutions uploaded yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="w-8 py-2 pr-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all solutions"
                    className="rounded border-zinc-300"
                  />
                </th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Group</th>
                <th className="py-2 pr-4 font-medium">Grade</th>
                <th className="py-2 pr-4 font-medium">Uploaded</th>
                {job && <th className="py-2 pr-2 font-medium">Autograde</th>}
              </tr>
            </thead>
            <tbody>
              {solutions.map((solution) => {
                const jobItem = job?.items.find((i) => i.solutionId === solution.id);
                return (
                  <tr key={solution.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.has(solution.id)}
                        onChange={() => toggleOne(solution.id)}
                        aria-label={`Select ${solution.label}`}
                        className="rounded border-zinc-300"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/projects/${slug}/solutions/${solution.id}`} className="text-zinc-800 hover:underline">
                        {solution.label}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-zinc-500">{solution.group ?? "—"}</td>
                    <td className="py-2 pr-4 text-zinc-700">
                      {solution.grade ? `${solution.grade.checked} / ${solution.grade.total} pts` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-zinc-400">{solution.uploadedAtLabel}</td>
                    {job && (
                      <td className="py-2 pr-2">
                        {jobItem && <span className={STATUS_COLOR[jobItem.status]}>{STATUS_LABEL[jobItem.status]}</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
