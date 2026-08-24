"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

type Step = "files" | "label";

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("files");
  const [starterZip, setStarterZip] = useState<File | null>(null);
  const [gradingKey, setGradingKey] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToLabelStep(e: FormEvent) {
    e.preventDefault();
    if (!starterZip || !gradingKey) return;
    setStep("label");
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!starterZip || !gradingKey || !label.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("starterZip", starterZip);
      formData.set("gradingKey", gradingKey);
      formData.set("label", label.trim());

      const res = await fetch("/api/projects", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create project.");

      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <ol className="mb-8 flex items-center gap-2 text-sm text-zinc-500">
        <StepBadge active={step === "files"} label="1. Starter & grading key" />
        <span className="text-zinc-300">&rarr;</span>
        <StepBadge active={step === "label"} label="2. Label" />
      </ol>

      {step === "files" && (
        <form onSubmit={goToLabelStep} className="space-y-6">
          <h1 className="text-xl font-semibold text-zinc-900">Upload starter project &amp; grading key</h1>
          <FileField
            id="starterZip"
            label="Starter project (.zip)"
            hint="The unmodified project students start from. Can be any type of project."
            accept=".zip"
            file={starterZip}
            onChange={setStarterZip}
          />
          <FileField
            id="gradingKey"
            label="Grading key (.json)"
            hint="The rubric used to grade solutions, e.g. GRADING_KEY.json."
            accept=".json,application/json"
            file={gradingKey}
            onChange={setGradingKey}
          />
          <button
            type="submit"
            disabled={!starterZip || !gradingKey}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Next
          </button>
        </form>
      )}

      {step === "label" && (
        <form onSubmit={handleCreate} className="space-y-6">
          <h1 className="text-xl font-semibold text-zinc-900">Give this project a label</h1>
          <p className="text-sm text-zinc-500">
            Used to identify this grading project on the dashboard, e.g. &ldquo;CS101 - Library App&rdquo;.
          </p>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Project label"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep("files")}
              disabled={submitting}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={!label.trim() || submitting}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {submitting ? "Creating environment…" : "Create grading project"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function StepBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? "font-medium text-zinc-900" : ""}>{label}</span>
  );
}

function FileField({
  id,
  label,
  hint,
  accept,
  file,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    // Some browsers fire a change event with an empty file list when the
    // picker dialog is reopened and then cancelled - don't treat that as
    // clearing an already-chosen file.
    const selected = e.target.files?.[0];
    if (selected) onChange(selected);
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-900">
        {label}
      </label>
      <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="mt-2 block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
      />
      {file && <p className="mt-1 text-xs text-zinc-500">Selected: {file.name}</p>}
    </div>
  );
}
