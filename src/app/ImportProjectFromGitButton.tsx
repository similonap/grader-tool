"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ImportProjectFromGitButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!remoteUrl.trim() || importing) return;

    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/import-git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteUrl: remoteUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to import the project.");

      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import the project.");
      setImporting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-muted hover:border-muted-2 hover:text-ink"
      >
        Import from git
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={remoteUrl}
          onChange={(e) => setRemoteUrl(e.target.value)}
          placeholder="git@github.com:org/project.git"
          disabled={importing}
          className="min-w-[16rem] rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={importing || !remoteUrl.trim()}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-40"
        >
          {importing ? "Cloning…" : "Clone"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={importing}
          className="shrink-0 rounded-md px-2 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </form>
  );
}
