"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

export function NewCourseForm() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create the gradebook.");
      router.push(`/courses/${data.course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the gradebook.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:brightness-105"
      >
        New gradebook
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[28rem] rounded-2xl border border-line bg-surface p-6 text-ink shadow-[var(--shadow)] backdrop:bg-black/40"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">New gradebook</h2>
          <p className="text-sm text-muted">
            One gradebook per academic year. You can upload the student list and link grading projects once it
            exists.
          </p>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Webontwikkeling 2026-2027"
            disabled={submitting}
            className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              disabled={submitting}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !label.trim()}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-40"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
