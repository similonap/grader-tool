"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GatewayModelOption } from "@/lib/aiGateway";
import type { DiffLine } from "@/lib/diff";
import { CUSTOM_LANGUAGE, FEEDBACK_LANGUAGES, resolveInitialLanguage } from "@/lib/feedbackLanguages";
import { criterionId, totalPoints, type GradingKeyDoc } from "@/lib/gradingKey";
import type { CodeReference, CriterionGrade, FileDiffEntry, FileStatus, SolutionGrading } from "@/lib/types";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
  entry?: FileDiffEntry;
}

function buildTree(entries: FileDiffEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  function getOrCreateDirChildren(parts: string[]): TreeNode[] {
    let level = root;
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = dirMap.get(currentPath);
      if (!node) {
        node = { name: part, path: currentPath, type: "dir", children: [] };
        dirMap.set(currentPath, node);
        level.push(node);
      }
      level = node.children!;
    }
    return level;
  }

  for (const entry of entries) {
    const parts = entry.path.split("/");
    const fileName = parts.pop() as string;
    const level = getOrCreateDirChildren(parts);
    level.push({ name: fileName, path: entry.path, type: "file", entry });
  }

  sortTree(root);
  return root;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) if (n.children) sortTree(n.children);
}

const STATUS_DOT: Record<FileStatus, string> = {
  added: "bg-emerald-500",
  removed: "bg-red-500",
  modified: "bg-amber-500",
  unchanged: "bg-line-strong",
};

const STATUS_TEXT: Record<FileStatus, string> = {
  added: "text-emerald-700",
  removed: "text-red-700",
  modified: "text-amber-700",
  unchanged: "text-muted",
};

const DEFAULT_CRITERION: CriterionGrade = { checked: false, comment: "", references: [] };

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

interface DiffResponse {
  path: string;
  binary: boolean;
  lines: DiffLine[] | null;
  oldSize?: number | null;
  newSize?: number | null;
  error?: string;
}

export function SolutionWorkspace({
  slug,
  solutionId,
  entries,
  gradingKey,
  initialGrading,
  hasAiGatewayKey,
  initialModel,
  initialLanguage,
  initialLocked,
}: {
  slug: string;
  solutionId: string;
  entries: FileDiffEntry[];
  gradingKey: GradingKeyDoc | null;
  initialGrading: SolutionGrading;
  hasAiGatewayKey: boolean;
  initialModel: string | null;
  initialLanguage: string | null;
  initialLocked: boolean;
}) {
  const [locked, setLocked] = useState(initialLocked);
  const [lockBusy, setLockBusy] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const unchangedCount = useMemo(() => entries.filter((e) => e.status === "unchanged").length, [entries]);
  const visibleEntries = useMemo(
    () => (showUnchanged ? entries : entries.filter((e) => e.status !== "unchanged")),
    [entries, showUnchanged]
  );
  const tree = useMemo(() => buildTree(visibleEntries), [visibleEntries]);
  const firstChanged = useMemo(() => entries.find((e) => e.status !== "unchanged"), [entries]);
  const [selected, setSelected] = useState<FileDiffEntry | null>(firstChanged ?? entries[0] ?? null);
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  // Bumped on every reference click so the scroll effect below re-runs even
  // when jumping to the same line twice in a row (highlightIndex unchanged).
  const [jumpNonce, setJumpNonce] = useState(0);
  const [pickingForCriterion, setPickingForCriterion] = useState<string | null>(null);
  const [grading, setGrading] = useState<SolutionGrading>(initialGrading);
  const diffContainerRef = useRef<HTMLDivElement>(null);

  const [gatewayModels, setGatewayModels] = useState<GatewayModelOption[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(initialModel ?? "");
  const initialLangState = resolveInitialLanguage(initialLanguage);
  const [language, setLanguage] = useState(initialLangState.language);
  const [customLanguage, setCustomLanguage] = useState(initialLangState.customLanguage);
  const [autogradeRunning, setAutogradeRunning] = useState(false);
  const [autogradeError, setAutogradeError] = useState<string | null>(null);
  const effectiveLanguage = (language === CUSTOM_LANGUAGE ? customLanguage : language).trim();

  // A fetch is effectively "in flight" whenever the loaded diff doesn't
  // match the currently selected file yet - no separate loading state needed.
  const loading = !!selected && selected.status !== "unchanged" && diff?.path !== selected.path;

  useEffect(() => {
    // Nothing to fetch: the "no files" and "unchanged" render branches
    // don't consult `diff`, so it's safe to just skip fetching here.
    if (!selected || selected.status === "unchanged") {
      return;
    }

    let cancelled = false;
    fetch(`/api/projects/${slug}/solutions/${solutionId}/diff?file=${encodeURIComponent(selected.path)}`)
      .then(async (res) => {
        const data = await res.json();
        // A non-ok response is still valid JSON (`{ error: "..." }`), so it
        // must be checked explicitly - otherwise it looks like a successful
        // but path-less DiffResponse, which never matches `selected.path`
        // and leaves the UI stuck showing "Loading diff…" forever.
        if (!res.ok) throw new Error(data.error ?? "Failed to load diff.");
        return data as DiffResponse;
      })
      .then((data) => {
        if (!cancelled) setDiff(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setDiff({
            path: selected.path,
            binary: false,
            lines: null,
            error: err instanceof Error ? err.message : "Failed to load diff.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, solutionId, selected]);

  useEffect(() => {
    if (highlightIndex == null) return;
    const el = diffContainerRef.current?.querySelector(`[data-diff-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [diff, highlightIndex, jumpNonce]);

  const isFirstGradingRender = useRef(true);
  useEffect(() => {
    if (isFirstGradingRender.current) {
      isFirstGradingRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/projects/${slug}/solutions/${solutionId}/grading`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overallComment: grading.overallComment, criteria: grading.criteria }),
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(handle);
  }, [grading, slug, solutionId]);

  useEffect(() => {
    if (!hasAiGatewayKey) return;
    let cancelled = false;
    fetch("/api/settings/models")
      .then((res) => res.json())
      .then((data: { models?: GatewayModelOption[]; error?: string }) => {
        if (cancelled) return;
        if (data.models) {
          setGatewayModels(data.models);
          setSelectedModel((current) => current || data.models![0]?.id || "");
        } else {
          setModelsError(data.error ?? "Failed to load models.");
        }
      })
      .catch(() => {
        if (!cancelled) setModelsError("Failed to load models.");
      });
    return () => {
      cancelled = true;
    };
  }, [hasAiGatewayKey]);

  async function toggleLock() {
    setLockBusy(true);
    try {
      const res = await fetch(`/api/projects/${slug}/solutions/${solutionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !locked }),
      });
      if (!res.ok) throw new Error();
      setLocked((prev) => !prev);
    } catch {
      // best-effort - button just stays in its current state on failure
    } finally {
      setLockBusy(false);
    }
  }

  async function runAutograde() {
    if (locked || !selectedModel || !effectiveLanguage) return;

    const hasExistingWork =
      grading.overallComment.trim() !== "" ||
      Object.values(grading.criteria).some((c) => c.checked || c.comment.trim() !== "");
    if (hasExistingWork) {
      const proceed = window.confirm(
        "This will replace the current checkboxes, comments, and references with the AI's grading. Continue?"
      );
      if (!proceed) return;
    }

    setAutogradeRunning(true);
    setAutogradeError(null);
    try {
      const res = await fetch(`/api/projects/${slug}/solutions/${solutionId}/autograde`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, language: effectiveLanguage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Autograding failed.");
      setGrading(data.grading);
    } catch (err) {
      setAutogradeError(err instanceof Error ? err.message : "Autograding failed.");
    } finally {
      setAutogradeRunning(false);
    }
  }

  const criteriaIndex = useMemo(() => {
    const map = new Map<string, string>();
    gradingKey?.sections?.forEach((section, si) => {
      (section.criteria ?? []).forEach((c, ci) => {
        map.set(criterionId(section, si, c, ci), c.description ?? "this criterion");
      });
    });
    return map;
  }, [gradingKey]);

  function selectFileFromTree(entry: FileDiffEntry) {
    setSelected(entry);
    setHighlightIndex(null);
  }

  function goToReference(ref: CodeReference) {
    const entry = entries.find((e) => e.path === ref.file);
    if (entry) setSelected(entry);
    setHighlightIndex(ref.lineIndex);
    setJumpNonce((n) => n + 1);
  }

  function handlePickLine(line: DiffLine, index: number) {
    if (locked || !pickingForCriterion || !selected) return;
    const effectiveLine = line.newLineNo ?? line.oldLineNo;

    const ref: CodeReference = {
      id: newId(),
      file: selected.path,
      lineIndex: index,
      line: effectiveLine ?? 0,
      snippet: line.content.trim().slice(0, 160),
    };

    const criterionKey = pickingForCriterion;
    setGrading((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        [criterionKey]: {
          ...(prev.criteria[criterionKey] ?? DEFAULT_CRITERION),
          references: [...(prev.criteria[criterionKey]?.references ?? DEFAULT_CRITERION.references), ref],
        },
      },
    }));
    setPickingForCriterion(null);
  }

  function toggleCriterion(id: string) {
    if (locked) return;
    setGrading((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        [id]: { ...(prev.criteria[id] ?? DEFAULT_CRITERION), checked: !(prev.criteria[id]?.checked ?? false) },
      },
    }));
  }

  function setCriterionComment(id: string, comment: string) {
    if (locked) return;
    setGrading((prev) => ({
      ...prev,
      criteria: { ...prev.criteria, [id]: { ...(prev.criteria[id] ?? DEFAULT_CRITERION), comment } },
    }));
  }

  function removeReference(id: string, refId: string) {
    if (locked) return;
    setGrading((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        [id]: {
          ...(prev.criteria[id] ?? DEFAULT_CRITERION),
          references: (prev.criteria[id]?.references ?? []).filter((r) => r.id !== refId),
        },
      },
    }));
  }

  function setOverallComment(overallComment: string) {
    if (locked) return;
    setGrading((prev) => ({ ...prev, overallComment }));
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_380px]">
      <aside className="rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow)] xl:max-h-[calc(100vh-12rem)] xl:overflow-auto">
        {unchangedCount > 0 && (
          <label className="mb-1 flex items-center gap-2 border-b border-line px-2 pb-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={showUnchanged}
              onChange={(e) => setShowUnchanged(e.target.checked)}
              className="rounded border-line-strong accent-accent"
            />
            Show {unchangedCount} unchanged file{unchangedCount === 1 ? "" : "s"}
          </label>
        )}
        {tree.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted">No changed files.</p>
        ) : (
          <FileTree nodes={tree} selectedPath={selected?.path ?? null} onSelect={selectFileFromTree} />
        )}
      </aside>

      <section className="min-w-0 rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
        {!selected ? (
          <p className="p-6 text-sm text-muted">No files found.</p>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <code className="text-sm">{selected.path}</code>
              <span className={`text-xs font-medium ${STATUS_TEXT[selected.status]}`}>{selected.status}</span>
            </div>

            {pickingForCriterion && (
              <div className="flex items-center justify-between gap-3 border-b border-accent/30 bg-accent-soft px-4 py-2 text-xs text-accent-ink">
                <span>
                  Click a line to reference it from{" "}
                  <strong>&ldquo;{criteriaIndex.get(pickingForCriterion) ?? pickingForCriterion}&rdquo;</strong>
                </span>
                <button type="button" onClick={() => setPickingForCriterion(null)} className="shrink-0 underline">
                  Cancel
                </button>
              </div>
            )}

            <div ref={diffContainerRef} className="overflow-auto xl:max-h-[calc(100vh-12rem)]">
              {selected.status === "unchanged" ? (
                <p className="p-6 text-sm text-muted">No changes in this file.</p>
              ) : loading || !diff ? (
                <p className="p-6 text-sm text-muted">Loading diff…</p>
              ) : diff.error ? (
                <p className="p-6 text-sm text-red-600">{diff.error}</p>
              ) : diff.binary ? (
                <p className="p-6 text-sm text-muted">
                  Binary file changed{" "}
                  {typeof diff.oldSize === "number" && typeof diff.newSize === "number"
                    ? `(${diff.oldSize} → ${diff.newSize} bytes)`
                    : ""}
                </p>
              ) : (
                <DiffTable
                  lines={diff.lines ?? []}
                  picking={!!pickingForCriterion}
                  highlightIndex={highlightIndex}
                  onPickLine={handlePickLine}
                />
              )}
            </div>
          </>
        )}
      </section>

      <aside className="xl:max-h-[calc(100vh-12rem)] xl:overflow-auto">
        <GradingPanel
          locked={locked}
          lockBusy={lockBusy}
          onToggleLock={toggleLock}
          gradingKey={gradingKey}
          grading={grading}
          pickingForCriterion={pickingForCriterion}
          onToggle={toggleCriterion}
          onComment={setCriterionComment}
          onOverallComment={setOverallComment}
          onStartPicking={setPickingForCriterion}
          onCancelPicking={() => setPickingForCriterion(null)}
          onRemoveReference={removeReference}
          onGoToReference={goToReference}
          hasAiGatewayKey={hasAiGatewayKey}
          gatewayModels={gatewayModels}
          modelsError={modelsError}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          language={language}
          customLanguage={customLanguage}
          onSelectLanguage={setLanguage}
          onCustomLanguage={setCustomLanguage}
          autogradeRunning={autogradeRunning}
          autogradeError={autogradeError}
          onRunAutograde={runAutograde}
        />
      </aside>
    </div>
  );
}

function FileTree({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (entry: FileDiffEntry) => void;
}) {
  return (
    <ul className="space-y-0.5 text-sm">
      {nodes.map((node) => (
        <TreeItem key={node.path} node={node} selectedPath={selectedPath} onSelect={onSelect} depth={0} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  selectedPath,
  onSelect,
  depth,
}: {
  node: TreeNode;
  selectedPath: string | null;
  onSelect: (entry: FileDiffEntry) => void;
  depth: number;
}) {
  const paddingLeft = 8 + depth * 14;

  if (node.type === "dir") {
    return (
      <li>
        <details open>
          <summary
            style={{ paddingLeft }}
            className="cursor-pointer select-none rounded px-2 py-1 text-muted hover:bg-surface-2"
          >
            {node.name}
          </summary>
          <ul className="space-y-0.5">
            {(node.children ?? []).map((child) => (
              <TreeItem key={child.path} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
            ))}
          </ul>
        </details>
      </li>
    );
  }

  const entry = node.entry!;
  const isSelected = node.path === selectedPath;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(entry)}
        style={{ paddingLeft: paddingLeft + 14 }}
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${
          isSelected ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-surface-2"
        }`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[entry.status]}`} />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

function DiffTable({
  lines,
  picking,
  highlightIndex,
  onPickLine,
}: {
  lines: DiffLine[];
  picking: boolean;
  highlightIndex: number | null;
  onPickLine: (line: DiffLine, index: number) => void;
}) {
  if (lines.length === 0) {
    return <p className="p-6 text-sm text-muted">Empty file.</p>;
  }

  return (
    <table className="w-full border-collapse font-mono text-xs">
      <tbody>
        {lines.map((line, i) => {
          const isHighlighted = i === highlightIndex;
          return (
            <tr
              key={i}
              data-diff-index={i}
              onClick={() => picking && onPickLine(line, i)}
              className={[
                line.type === "add" ? "bg-emerald-50" : line.type === "remove" ? "bg-red-50" : "",
                isHighlighted ? "outline outline-2 -outline-offset-2 outline-blue-400" : "",
                picking ? "cursor-pointer hover:bg-blue-50" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <td className="w-10 select-none border-r border-line px-2 py-0.5 text-right text-muted-2">
                {line.oldLineNo ?? ""}
              </td>
              <td className="w-10 select-none border-r border-line px-2 py-0.5 text-right text-muted-2">
                {line.newLineNo ?? ""}
              </td>
              <td
                className={`whitespace-pre px-3 py-0.5 ${
                  line.type === "add" ? "text-emerald-800" : line.type === "remove" ? "text-red-800" : "text-ink"
                }`}
              >
                <span className="mr-2 select-none text-muted-2">
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </span>
                {line.content}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GradingPanel({
  locked,
  lockBusy,
  onToggleLock,
  gradingKey,
  grading,
  pickingForCriterion,
  onToggle,
  onComment,
  onOverallComment,
  onStartPicking,
  onCancelPicking,
  onRemoveReference,
  onGoToReference,
  hasAiGatewayKey,
  gatewayModels,
  modelsError,
  selectedModel,
  onSelectModel,
  language,
  customLanguage,
  onSelectLanguage,
  onCustomLanguage,
  autogradeRunning,
  autogradeError,
  onRunAutograde,
}: {
  locked: boolean;
  lockBusy: boolean;
  onToggleLock: () => void;
  gradingKey: GradingKeyDoc | null;
  grading: SolutionGrading;
  pickingForCriterion: string | null;
  onToggle: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onOverallComment: (comment: string) => void;
  onStartPicking: (id: string) => void;
  onCancelPicking: () => void;
  onRemoveReference: (id: string, refId: string) => void;
  onGoToReference: (ref: CodeReference) => void;
  hasAiGatewayKey: boolean;
  gatewayModels: GatewayModelOption[] | null;
  modelsError: string | null;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  language: string;
  customLanguage: string;
  onSelectLanguage: (language: string) => void;
  onCustomLanguage: (language: string) => void;
  autogradeRunning: boolean;
  autogradeError: string | null;
  onRunAutograde: () => void;
}) {
  const total = totalPoints(gradingKey);
  let checked = 0;
  gradingKey?.sections?.forEach((section, si) => {
    (section.criteria ?? []).forEach((c, ci) => {
      const id = criterionId(section, si, c, ci);
      if (grading.criteria[id]?.checked) checked += c.points ?? 0;
    });
  });

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-[var(--shadow)] ${
          locked ? "border-accent/40 bg-accent-soft" : "border-line bg-surface"
        }`}
      >
        <div>
          <p className={`text-sm font-medium ${locked ? "text-accent-ink" : "text-ink"}`}>
            {locked ? "🔒 Locked - finalized" : "🔓 Unlocked"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {locked ? "No further grading changes until unlocked." : "Lock once you're done, to mark this solution finalized."}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleLock}
          disabled={lockBusy}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
            locked
              ? "border border-accent text-accent-ink hover:bg-accent-soft"
              : "bg-accent text-white hover:brightness-105"
          }`}
        >
          {lockBusy ? "Saving…" : locked ? "Unlock" : "Lock"}
        </button>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
        <h2 className="font-display text-lg font-semibold text-ink">Autograde with AI</h2>
        {!hasAiGatewayKey ? (
          <p className="mt-1 text-xs text-muted">
            Set your Vercel AI Gateway key in{" "}
            <Link href="/settings" className="text-accent underline">
              Settings
            </Link>{" "}
            to enable this.
          </p>
        ) : !gradingKey?.sections ? (
          <p className="mt-1 text-xs text-muted">Needs a structured grading key - not available for this project.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {modelsError ? (
              <p className="text-xs text-red-600">{modelsError}</p>
            ) : (
              <select
                value={selectedModel}
                onChange={(e) => onSelectModel(e.target.value)}
                disabled={locked || !gatewayModels || autogradeRunning}
                className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
              >
                {!gatewayModels ? (
                  <option>Loading models…</option>
                ) : (
                  gatewayModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted">Feedback language</label>
              <select
                value={language}
                onChange={(e) => onSelectLanguage(e.target.value)}
                disabled={locked || autogradeRunning}
                className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
              >
                {FEEDBACK_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value={CUSTOM_LANGUAGE}>{CUSTOM_LANGUAGE}</option>
              </select>
              {language === CUSTOM_LANGUAGE && (
                <input
                  value={customLanguage}
                  onChange={(e) => onCustomLanguage(e.target.value)}
                  placeholder="e.g. Korean"
                  disabled={locked || autogradeRunning}
                  className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
                />
              )}
            </div>

            <button
              type="button"
              onClick={onRunAutograde}
              disabled={locked || autogradeRunning || !selectedModel || (language === CUSTOM_LANGUAGE && !customLanguage.trim())}
              className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-105 disabled:opacity-40"
            >
              {autogradeRunning ? "Grading…" : "Run autograde"}
            </button>
            {autogradeError && <p className="text-xs text-red-600">{autogradeError}</p>}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Manual grading</h2>
          {total > 0 && (
            <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-xs font-semibold text-accent-ink">
              {checked} / {total} pts
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-2">Autosaves as you edit.</p>

        <textarea
          value={grading.overallComment}
          onChange={(e) => onOverallComment(e.target.value)}
          placeholder="Overall notes about this solution…"
          rows={3}
          disabled={locked}
          className="mt-3 w-full resize-y rounded-md border border-line px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none disabled:opacity-60"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
        {!gradingKey?.sections ? (
          <p className="p-5 text-xs text-muted">
            No structured grading key criteria found, so per-criterion checkboxes aren&rsquo;t available. Use the
            overall notes above instead.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {gradingKey.sections.map((section, si) => {
              const sectionCriteria = section.criteria ?? [];
              const sectionPoints = sectionCriteria.reduce((sum, c) => sum + (c.points ?? 0), 0);
              const sectionChecked = sectionCriteria.reduce((sum, c, ci) => {
                const id = criterionId(section, si, c, ci);
                return sum + (grading.criteria[id]?.checked ? c.points ?? 0 : 0);
              }, 0);

              return (
                <details key={section.id ?? si} open>
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 font-display text-sm font-semibold text-ink">
                    {section.title ?? `Section ${si + 1}`}
                    <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted">
                      {fmtPts(sectionChecked)} / {fmtPts(sectionPoints)} pts
                    </span>
                  </summary>

                  <ul className="flex flex-col">
                    {sectionCriteria.map((criterion, ci) => {
                      const id = criterionId(section, si, criterion, ci);
                      const grade = grading.criteria[id] ?? DEFAULT_CRITERION;
                      const picking = pickingForCriterion === id;

                      return (
                        <li
                          key={id}
                          className={`border-t border-line px-4 py-3 transition-colors ${grade.checked ? "bg-accent-soft" : ""}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={grade.checked}
                              onChange={() => onToggle(id)}
                              disabled={locked}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-accent disabled:opacity-40"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs text-ink">
                                  {criterion.id && <span className="mr-1.5 font-mono text-[11px] text-muted-2">{criterion.id}</span>}
                                  {criterion.description}
                                </p>
                                <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-ink">
                                  {fmtPts(criterion.points ?? 0)}
                                </span>
                              </div>

                              <textarea
                                value={grade.comment}
                                onChange={(e) => onComment(id, e.target.value)}
                                placeholder="What's right or wrong here…"
                                rows={2}
                                disabled={locked}
                                className="mt-1.5 w-full resize-y rounded border border-line bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none disabled:opacity-60"
                              />

                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {grade.references.map((ref) => (
                                  <ReferenceChip
                                    key={ref.id}
                                    reference={ref}
                                    locked={locked}
                                    onGo={() => onGoToReference(ref)}
                                    onRemove={() => onRemoveReference(id, ref.id)}
                                  />
                                ))}
                                {!locked &&
                                  (picking ? (
                                    <button
                                      type="button"
                                      onClick={onCancelPicking}
                                      className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                                    >
                                      Click a line… (cancel)
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => onStartPicking(id)}
                                      className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[11px] text-muted hover:border-muted-2 hover:text-ink"
                                    >
                                      + Add reference
                                    </button>
                                  ))}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtPts(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function ReferenceChip({
  reference,
  locked,
  onGo,
  onRemove,
}: {
  reference: CodeReference;
  locked: boolean;
  onGo: () => void;
  onRemove: () => void;
}) {
  const fileName = reference.file.split("/").pop();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2 pr-1 font-mono text-[11px] text-muted">
      <button type="button" onClick={onGo} title={reference.file} className="hover:underline">
        {fileName}:{reference.line}
      </button>
      {!locked && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove reference"
          className="rounded-full px-1 text-muted-2 hover:bg-line-strong hover:text-ink"
        >
          ×
        </button>
      )}
    </span>
  );
}
