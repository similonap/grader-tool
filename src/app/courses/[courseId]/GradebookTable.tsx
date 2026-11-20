"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ComponentKey, CourseComponent, CourseStudent } from "@/lib/gradebook";
import { on20 } from "@/lib/courseStats";

function cellKey(studentId: string, key: ComponentKey): string {
  return `${studentId}|${key}`;
}

/**
 * The scorebook table. Editing a cell is a scratch pad for trying out
 * "what if this student got X" - it is deliberately never persisted, so a
 * refresh brings the stored scores back. Scores only enter the course
 * through an import.
 */
export function GradebookTable({
  components,
  students,
  scores,
}: {
  components: CourseComponent[];
  students: CourseStudent[];
  scores: Record<string, Partial<Record<ComponentKey, number>>>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const student of students) {
      for (const component of components) {
        const score = scores[student.id]?.[component.key];
        initial[cellKey(student.id, component.key)] = score === undefined ? "" : String(score);
      }
    }
    return initial;
  });
  const [group, setGroup] = useState("");

  const groups = useMemo(
    () => [...new Set(students.map((s) => s.group).filter((g): g is string => !!g))].sort(),
    [students]
  );
  const visible = group ? students.filter((s) => s.group === group) : students;

  /** Weighted total from what's typed right now, so it updates as you edit. */
  function totalPct(studentId: string): { pct: number; complete: boolean } {
    let pct = 0;
    let complete = true;
    for (const component of components) {
      const raw = values[cellKey(studentId, component.key)]?.trim().replace(",", ".");
      const value = raw ? Number(raw) : NaN;
      if (!Number.isFinite(value) || component.max <= 0) {
        complete = false;
        continue;
      }
      pct += (value / component.max) * component.weight;
    }
    return { pct, complete };
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Gradebook</h2>
          <p className="mt-1 text-xs text-muted">
            Try out scores here to see what they do to a total — <span className="text-ink">nothing is saved</span>.
            Refresh the page to get the stored scores back. Scores enter the course through an import.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {groups.length > 0 && (
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-xs text-muted-2">
              <th className="py-2 pr-4 font-medium">Student</th>
              <th className="py-2 pr-4 font-medium">Group</th>
              {components.map((c) => (
                <th key={c.key} className="py-2 pr-4 text-right font-medium">
                  {c.projectSlug ? (
                    <Link href={`/projects/${c.projectSlug}`} className="hover:text-accent-ink hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    c.label
                  )}
                  <span className="ml-1 text-muted-2">
                    /{c.max} · {c.weight}%
                  </span>
                </th>
              ))}
              <th className="py-2 pr-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((student) => {
              const { pct, complete } = totalPct(student.id);
              return (
                <tr key={student.id} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-4 align-middle text-ink">
                    {student.name}
                    {student.exemption && (
                      <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-ink">
                        {student.exemption}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4 align-middle font-mono text-xs text-muted-2">
                    {student.group ?? "—"}
                  </td>
                  {components.map((component) => {
                    const id = cellKey(student.id, component.key);
                    const raw = values[id] ?? "";
                    const over = raw !== "" && Number(raw.replace(",", ".")) > component.max;
                    const stored = scores[student.id]?.[component.key];
                    // Marks a cell you changed, so a what-if is never mistaken
                    // for what the course actually holds.
                    const changed = raw !== (stored === undefined ? "" : String(stored));
                    return (
                      <td key={component.key} className="py-1.5 pr-4 text-right align-middle">
                        <input
                          value={raw}
                          inputMode="decimal"
                          // Browsers restore typed form values on a soft reload,
                          // which would resurrect the what-ifs this table never saves.
                          autoComplete="off"
                          title={changed ? `Not saved — stored score: ${stored ?? "none"}` : undefined}
                          onChange={(e) => setValues((prev) => ({ ...prev, [id]: e.target.value }))}
                          className={`w-24 rounded-md border bg-surface px-2 py-1 text-right font-mono text-sm tabular-nums focus:outline-none ${
                            over
                              ? "border-red-400 text-red-600"
                              : changed
                                ? "border-accent text-accent-ink"
                                : "border-line-strong focus:border-accent"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="py-1.5 pr-2 text-right align-middle font-mono text-sm">
                    {complete ? (
                      <span className={pct >= 50 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>
                        {on20(pct).toFixed(1)}
                        <span className="ml-1 text-xs font-normal text-muted-2">/20</span>
                      </span>
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
