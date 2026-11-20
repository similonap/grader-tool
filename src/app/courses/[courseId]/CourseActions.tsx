"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

export function CourseActions({ courseId, label }: { courseId: string; label: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"import" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy("import");
    setError(null);
    setNote(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch(`/api/courses/${courseId}/roster`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to read the spreadsheet.");
      setNote(`${data.imported} students imported.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read the spreadsheet.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    const proceed = window.confirm(
      `Delete gradebook "${label}"? This removes its student list and all scores, and cannot be undone. The grading projects themselves are kept.`
    );
    if (!proceed) return;

    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete the gradebook.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the gradebook.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink disabled:opacity-40"
        >
          {busy === "import" ? "Reading…" : "Import student list"}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx" onChange={handleFileChange} className="hidden" />
        <a
          href={`/api/courses/${courseId}/export`}
          className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink"
        >
          Export to Excel
        </a>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy !== null}
          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          {busy === "delete" ? "Deleting…" : "Delete gradebook"}
        </button>
      </div>
      {note && <p className="text-[11px] text-muted">{note}</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
