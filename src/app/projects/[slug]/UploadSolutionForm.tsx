"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

type ItemStatus = "pending" | "uploading" | "done" | "error";

interface UploadItem {
  file: File;
  status: ItemStatus;
  error?: string;
}

export function UploadSolutionForm({ slug, existingGroups }: { slug: string; existingGroups: string[] }) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [group, setGroup] = useState("");
  const [uploading, setUploading] = useState(false);

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    // Some browsers fire a change event with an empty file list when the
    // picker dialog is reopened and then cancelled - don't treat that as
    // clearing an already-chosen selection.
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setItems(Array.from(files).map((file) => ({ file, status: "pending" as const })));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0 || uploading) return;

    setUploading(true);
    const working = [...items];

    for (let i = 0; i < working.length; i++) {
      working[i] = { ...working[i], status: "uploading" };
      setItems([...working]);

      try {
        const formData = new FormData();
        formData.set("solutionZip", working[i].file);
        if (group.trim()) formData.set("group", group.trim());

        const res = await fetch(`/api/projects/${slug}/solutions`, { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed.");

        working[i] = { ...working[i], status: "done" };
      } catch (err) {
        working[i] = { ...working[i], status: "error", error: err instanceof Error ? err.message : "Upload failed." };
      }
      setItems([...working]);
    }

    setUploading(false);
    if (working.some((item) => item.status === "done")) {
      router.refresh();
    }
  }

  const doneCount = items.filter((i) => i.status === "done" || i.status === "error").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <input
        type="file"
        accept=".zip"
        multiple
        onChange={handleFilesChange}
        disabled={uploading}
        className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-40"
      />
      <p className="text-[11px] text-zinc-400">Select multiple .zip files at once to upload them all at once.</p>

      <div>
        <input
          list="existing-groups"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="Group (optional, applies to all selected files)"
          disabled={uploading}
          className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-40"
        />
        <datalist id="existing-groups">
          {existingGroups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      {items.length > 0 && (
        <div className="rounded-md border border-zinc-100 p-2">
          {items.length > 1 && (
            <p className="mb-1.5 px-1 text-[11px] text-zinc-500">
              {doneCount} / {items.length} processed{errorCount > 0 ? ` · ${errorCount} failed` : ""}
            </p>
          )}
          <ul className="max-h-40 space-y-0.5 overflow-auto text-xs">
            {items.map((item, i) => (
              <li key={i}>
                <div className="flex items-center justify-between gap-2 px-1 py-0.5">
                  <span className="truncate text-zinc-700">{item.file.name}</span>
                  <span
                    className={
                      item.status === "done"
                        ? "text-emerald-700"
                        : item.status === "error"
                          ? "text-red-600"
                          : item.status === "uploading"
                            ? "text-amber-600"
                            : "text-zinc-400"
                    }
                  >
                    {item.status === "pending" && "Waiting…"}
                    {item.status === "uploading" && "Uploading…"}
                    {item.status === "done" && "Done"}
                    {item.status === "error" && "Failed"}
                  </span>
                </div>
                {item.status === "error" && item.error && (
                  <p className="px-1 pb-1 text-[11px] text-red-600">{item.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={items.length === 0 || uploading}
        className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {uploading
          ? `Uploading ${doneCount} / ${items.length}…`
          : items.length > 1
            ? `Upload ${items.length} solutions`
            : "Upload solution"}
      </button>
    </form>
  );
}
