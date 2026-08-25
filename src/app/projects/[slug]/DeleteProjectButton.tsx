"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProjectButton({ slug, label }: { slug: string; label: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const proceed = window.confirm(
      `Delete project "${label}"? This removes the starter project, grading key, and all uploaded solutions and cannot be undone.`
    );
    if (!proceed) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${slug}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete the project.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the project.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        {deleting ? "Deleting…" : "Delete project"}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
