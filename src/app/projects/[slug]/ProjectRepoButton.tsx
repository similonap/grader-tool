"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

interface ProjectRepoStatus {
  isRepo: boolean;
  remoteUrl: string | null;
  branch: string | null;
  hasUncommittedChanges: boolean;
  lastCommit: { hash: string; message: string; date: string } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ProjectRepoButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ProjectRepoStatus | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [busy, setBusy] = useState<"init" | "pull" | "push" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${slug}/repo`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load git status.");
      setStatus(data);
      setRemoteUrl(data.remoteUrl ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load git status.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setStatus(null);
    setError(null);
    setNotice(null);
  }

  async function call(action: "init" | "pull" | "push", body?: object) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${slug}/repo/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}.`);
      if (data.status) setStatus(data.status);
      if (data.message) setNotice(data.message);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}.`);
    } finally {
      setBusy(null);
    }
  }

  function handleSetupOrRemote(e: FormEvent) {
    e.preventDefault();
    call("init", { remoteUrl: remoteUrl.trim() || undefined });
  }

  function handlePush() {
    const proceed = window.confirm(
      `Push local changes to ${status?.remoteUrl ?? "the remote"}? This publishes everything currently in this project's data (starter, grading key, solutions) that isn't already there.`
    );
    if (!proceed) return;
    call("push", { message: `Sync from Grader - ${new Date().toLocaleString()}` });
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink"
      >
        Git repo
      </button>

      {open && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-ink">Git repo</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink"
              >
                ✕
              </button>
            </div>

            {loading ? (
              <p className="mt-3 text-sm text-muted">Loading…</p>
            ) : !status ? (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            ) : !status.isRepo ? (
              <div className="mt-3">
                <p className="text-sm text-muted">
                  This project doesn&apos;t have a git repository yet. Add one to share it with other lecturers - a
                  remote is optional here, you can add it later.
                </p>
                <form onSubmit={handleSetupOrRemote} className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="git@github.com:org/project.git (optional)"
                    disabled={busy !== null}
                    className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy !== null}
                    className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-40"
                  >
                    {busy === "init" ? "Setting up…" : "Add git repo"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="text-sm">
                  <code className="text-xs">{status.remoteUrl ?? "(no remote set)"}</code>
                  <p className="mt-0.5 text-xs text-muted-2">
                    {status.branch ?? "?"} ·{" "}
                    {status.lastCommit
                      ? `${status.lastCommit.message} · ${formatDate(status.lastCommit.date)}`
                      : "no commits yet"}
                  </p>
                </div>
                {status.hasUncommittedChanges && (
                  <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-700">
                    uncommitted changes
                  </span>
                )}

                {!status.remoteUrl ? (
                  <form onSubmit={handleSetupOrRemote} className="flex flex-wrap items-center gap-2">
                    <input
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      placeholder="git@github.com:org/project.git"
                      disabled={busy !== null}
                      className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busy !== null || !remoteUrl.trim()}
                      className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-40"
                    >
                      {busy === "init" ? "Pushing…" : "Set remote & push"}
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => call("pull")}
                      disabled={busy !== null}
                      className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink disabled:opacity-40"
                    >
                      {busy === "pull" ? "Pulling…" : "Pull latest"}
                    </button>
                    <button
                      type="button"
                      onClick={handlePush}
                      disabled={busy !== null}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-105 disabled:opacity-40"
                    >
                      {busy === "push" ? "Pushing…" : "Push changes"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {notice && <p className="mt-3 text-xs text-emerald-700">{notice}</p>}
            {error && status && <p className="mt-3 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
