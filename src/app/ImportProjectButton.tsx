"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

export function ImportProjectButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("projectZip", file);

      const res = await fetch("/api/projects/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to import the project.");

      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import the project.");
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-muted hover:border-muted-2 hover:text-ink disabled:opacity-40"
      >
        {importing ? "Importing…" : "Import project"}
      </button>
      <input ref={inputRef} type="file" accept=".zip" onChange={handleFileChange} className="hidden" />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
