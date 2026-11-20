"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ComponentKey, CourseComponent } from "@/lib/gradebook";

interface ImportResult {
  imported: number;
  unmatched: string[];
  ungraded: number;
  missing: string[];
}

export function CourseComponents({
  courseId,
  components,
  projects,
  scored,
}: {
  courseId: string;
  components: CourseComponent[];
  projects: { id: string; label: string }[];
  /** How many students currently have a score per component, for the clear button. */
  scored: Partial<Record<ComponentKey, number>>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ComponentKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Partial<Record<ComponentKey, ImportResult>>>({});

  const weightTotal = components.reduce((sum, c) => sum + c.weight, 0);

  async function patchComponent(key: ComponentKey, patch: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component: { key, ...patch } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  async function postImport(key: ComponentKey, confirmUnlocked: boolean) {
    const res = await fetch(`/api/courses/${courseId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component: key, confirmUnlocked }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to import the scores.");
    return data as { result?: ImportResult; needsConfirmation?: true; unlocked: number; graded: number; ungraded: number };
  }

  async function importScores(key: ComponentKey) {
    setBusy(key);
    setError(null);
    try {
      let data = await postImport(key, false);

      // Grading that isn't locked can still change, so importing it is only
      // ever on an explicit yes - nothing is written until then.
      if (data.needsConfirmation) {
        const proceed = window.confirm(
          `${data.unlocked} of ${data.graded} graded solution${data.graded === 1 ? "" : "s"} in this project ${
            data.unlocked === 1 ? "is" : "are"
          } not locked yet, so ${data.unlocked === 1 ? "it" : "they"} can still change.` +
            (data.ungraded > 0
              ? ` ${data.ungraded} solution${data.ungraded === 1 ? " is" : "s are"} not graded at all.`
              : "") +
            `\n\nImport these scores anyway?`
        );
        if (!proceed) return;
        data = await postImport(key, true);
      }

      if (data.result) {
        setResults((prev) => ({ ...prev, [key]: data.result as ImportResult }));
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import the scores.");
    } finally {
      setBusy(null);
    }
  }

  async function clearScores(component: CourseComponent) {
    const count = scored[component.key] ?? 0;
    const proceed = window.confirm(
      `Delete all ${count} score${count === 1 ? "" : "s"} for "${component.label}"? This cannot be undone. ` +
        `The grading project itself keeps its grades, so you can import them again.`
    );
    if (!proceed) return;

    setBusy(component.key);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: { key: component.key } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete the scores.");
      setResults((prev) => ({ ...prev, [component.key]: undefined }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the scores.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Components</h2>
        <span className={`font-mono text-xs ${weightTotal === 100 ? "text-muted-2" : "text-amber-600"}`}>
          weights add up to {weightTotal}%
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Link each part to the grading project it is graded in, then pull the scores over. Scores are rescaled
        from the grading key&apos;s point total to the max below.
      </p>

      <div className="mt-4 space-y-3">
        {components.map((component) => {
          const result = results[component.key];
          return (
            <div key={component.key} className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[160px] flex-1">
                  <p className="font-display text-sm font-semibold text-ink">
                    {component.projectSlug ? (
                      <Link href={`/projects/${component.projectSlug}`} className="hover:text-accent-ink hover:underline">
                        {component.label}
                      </Link>
                    ) : (
                      component.label
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-muted-2">{component.key}</p>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] text-muted-2">Weight %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={component.weight}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value) && value !== component.weight) {
                        void patchComponent(component.key, { weight: value });
                      }
                    }}
                    className="w-20 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] text-muted-2">Max</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={component.max}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value) && value > 0 && value !== component.max) {
                        void patchComponent(component.key, { max: value });
                      }
                    }}
                    className="w-20 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                </label>

                <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                  <span className="font-mono text-[11px] text-muted-2">Grading project</span>
                  <select
                    value={component.projectSlug ?? ""}
                    onChange={(e) => void patchComponent(component.key, { projectSlug: e.target.value || null })}
                    className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">— not linked —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void importScores(component.key)}
                  disabled={busy !== null || !component.projectSlug}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-105 disabled:opacity-40"
                >
                  {busy === component.key ? "Importing…" : "Import scores"}
                </button>

                <button
                  type="button"
                  onClick={() => void clearScores(component)}
                  disabled={busy !== null || (scored[component.key] ?? 0) === 0}
                  title={`Delete every student's score for ${component.label}`}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Clear {scored[component.key] ?? 0}
                </button>
              </div>

              {result && (
                <p className="mt-2.5 text-xs text-muted">
                  <span className="font-semibold text-emerald-700">{result.imported} scores imported.</span>
                  {result.ungraded > 0 && ` ${result.ungraded} solution(s) not graded yet.`}
                  {result.unmatched.length > 0 && ` Not matched to a student: ${result.unmatched.join(", ")}.`}
                  {result.missing.length > 0 && ` Still without a score: ${result.missing.join(", ")}.`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
