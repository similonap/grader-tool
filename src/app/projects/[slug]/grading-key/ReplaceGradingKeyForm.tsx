"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

export function ReplaceGradingKeyForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || submitting) return;

    const proceed = window.confirm(
      "Replace the grading key? Existing solutions and any grading already given will keep referring to the old criteria."
    );
    if (!proceed) return;

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("gradingKey", file);

      const res = await fetch(`/api/projects/${slug}/grading-key`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to replace the grading key.");

      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to replace the grading key.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="file"
        accept=".json"
        onChange={handleFileChange}
        disabled={submitting}
        className="block text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={!file || submitting}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {submitting ? "Replacing…" : "Replace grading key"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}
