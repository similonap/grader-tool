"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ChangeEvent } from "react";

interface PuntenlijstStudent {
  name: string;
  group: string | null;
}

interface Suggestion {
  name: string;
  group: string | null;
  score: number;
}

interface Match {
  solutionId: string;
  currentLabel: string;
  currentGroup: string | null;
  suggestion: Suggestion | null;
}

interface RowState {
  checked: boolean;
  selectedName: string; // "" = no change
}

export function PuntenlijstImportButton({ slug }: { slug: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [students, setStudents] = useState<PuntenlijstStudent[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [applying, setApplying] = useState(false);

  const studentByName = useMemo(() => new Map(students.map((s) => [s.name, s])), [students]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch(`/api/projects/${slug}/puntenlijst/preview`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to read the spreadsheet.");

      const nextMatches: Match[] = data.matches;
      setMatches(nextMatches);
      setStudents(data.students);
      setRows(
        Object.fromEntries(
          nextMatches.map((m) => [
            m.solutionId,
            { checked: !!m.suggestion, selectedName: m.suggestion?.name ?? "" } satisfies RowState,
          ])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read the spreadsheet.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setMatches(null);
    setStudents([]);
    setRows({});
    setError(null);
  }

  function setRow(solutionId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [solutionId]: { ...prev[solutionId], ...patch } }));
  }

  async function apply() {
    if (!matches) return;
    const assignments = matches
      .map((m) => {
        const row = rows[m.solutionId];
        if (!row?.checked || !row.selectedName) return null;
        const student = studentByName.get(row.selectedName);
        return { solutionId: m.solutionId, name: row.selectedName, group: student?.group ?? null };
      })
      .filter((a): a is { solutionId: string; name: string; group: string | null } => a !== null);

    if (assignments.length === 0) {
      close();
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${slug}/puntenlijst/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to apply the changes.");
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply the changes.");
    } finally {
      setApplying(false);
    }
  }

  const checkedCount = Object.values(rows).filter((r) => r.checked && r.selectedName).length;

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink disabled:opacity-40"
      >
        {loading ? "Reading…" : "Import puntenlijst"}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx" onChange={handleFileChange} className="hidden" />
      {error && !matches && <p className="mt-1 text-[11px] text-red-600">{error}</p>}

      {matches && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-display text-lg font-semibold text-ink">Match solutions to students</h2>
              <p className="mt-1 text-xs text-muted">
                Fuzzy-matched against {students.length} student{students.length === 1 ? "" : "s"} from the spreadsheet.
                Review each row, then apply to rename solutions and set their group.
              </p>
            </div>

            <div className="flex-1 overflow-auto px-5 py-3">
              {matches.length === 0 ? (
                <p className="py-6 text-sm text-muted">No solutions to match yet.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left font-mono text-xs text-muted-2">
                      <th className="w-8 py-2 pr-2" />
                      <th className="py-2 pr-4 font-medium">Current</th>
                      <th className="py-2 pr-4 font-medium">Matched student</th>
                      <th className="py-2 pr-2 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => {
                      const row = rows[m.solutionId] ?? { checked: false, selectedName: "" };
                      return (
                        <tr key={m.solutionId} className="border-b border-line last:border-0">
                          <td className="py-2 pr-2 align-top">
                            <input
                              type="checkbox"
                              checked={row.checked}
                              onChange={(e) => setRow(m.solutionId, { checked: e.target.checked })}
                              disabled={!row.selectedName}
                              className="mt-1 rounded border-line-strong accent-accent"
                            />
                          </td>
                          <td className="py-2 pr-4 align-top text-muted">
                            <div className="truncate">{m.currentLabel}</div>
                            {m.currentGroup && <div className="font-mono text-[11px] text-muted-2">{m.currentGroup}</div>}
                          </td>
                          <td className="py-2 pr-4 align-top">
                            <select
                              value={row.selectedName}
                              onChange={(e) =>
                                setRow(m.solutionId, { selectedName: e.target.value, checked: e.target.value !== "" })
                              }
                              className="w-full max-w-xs rounded-md border border-line-strong bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                            >
                              <option value="">— no change —</option>
                              {students.map((s) => (
                                <option key={s.name} value={s.name}>
                                  {s.name}
                                  {s.group ? ` (${s.group})` : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-2 align-top">
                            {m.suggestion ? (
                              <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-ink">
                                {Math.round(m.suggestion.score * 100)}%
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-2">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
              <span className="text-xs text-muted">{checkedCount} solution{checkedCount === 1 ? "" : "s"} will be renamed</span>
              <div className="flex items-center gap-2">
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="button"
                  onClick={close}
                  disabled={applying}
                  className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={applying || checkedCount === 0}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-105 disabled:opacity-40"
                >
                  {applying ? "Applying…" : `Apply ${checkedCount || ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
