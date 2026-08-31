import type { DiffLine } from "./diff";

export interface EnvironmentInfo {
  projectType: "node" | "python" | "unknown";
  packageManager?: "npm" | "yarn" | "pnpm";
  packageName?: string;
  scripts?: Record<string, string>;
  dependencyCount?: number;
  hasDevcontainer: boolean;
  devcontainerImage?: string;
  detectedAt: string;
}

export interface ProjectMeta {
  id: string;
  label: string;
  createdAt: string;
  starterZipName: string;
  gradingKeyName: string;
  environment: EnvironmentInfo;
  /** Model/language last used to autograde in this project, so the pickers default to them next time. */
  lastAutogradeModel?: string;
  lastAutogradeLanguage?: string;
}

export interface SolutionMeta {
  id: string;
  label: string;
  group: string | null;
  originalFilename: string;
  uploadedAt: string;
  /** Path (relative to the project dir) of this solution's stored record (diff + grading, combined). */
  diffRelPath: string;
  /** Manually marked as finalized - blocks further grading (autograde and manual) until unlocked. */
  locked?: boolean;
}

export type FileStatus = "added" | "removed" | "modified" | "unchanged";

export interface FileDiffEntry {
  path: string;
  status: FileStatus;
  binary: boolean;
}

/** A single file's diff, precomputed against the starter at upload time. */
export interface StoredFileDiff extends FileDiffEntry {
  lines?: DiffLine[];
  oldSize?: number;
  newSize?: number;
}

/** The full set of per-file diffs for one solution, persisted instead of the raw solution files. */
export interface SolutionDiff {
  solutionId: string;
  computedAt: string;
  files: StoredFileDiff[];
}

export interface CodeReference {
  id: string;
  file: string;
  /** Index into that file's diff `lines` array - unambiguous, unlike a line number. */
  lineIndex: number;
  /** Old/new line number, for display only (e.g. the "file.ts:42" chip label). */
  line: number;
  snippet?: string;
}

export interface CriterionGrade {
  checked: boolean;
  comment: string;
  references: CodeReference[];
}

export interface SolutionGrading {
  solutionId: string;
  overallComment: string;
  criteria: Record<string, CriterionGrade>;
  updatedAt: string;
}

/**
 * The diff and grading for one solution, combined into a single
 * self-contained on-disk record so a solution's full state - the evidence
 * and the verdict - can be exported/imported as one file.
 */
export interface SolutionRecord {
  solutionId: string;
  diff: {
    computedAt: string;
    files: StoredFileDiff[];
  };
  grading: {
    overallComment: string;
    criteria: Record<string, CriterionGrade>;
    updatedAt: string;
  };
}

export type AutogradeJobItemStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface AutogradeJobItem {
  solutionId: string;
  label: string;
  status: AutogradeJobItemStatus;
  error?: string;
}

export type AutogradeJobStatus = "running" | "completed" | "cancelled" | "failed";

/** A bulk autograde run across every solution in a project, tracked so its progress can be polled. */
export interface AutogradeJob {
  id: string;
  projectSlug: string;
  model: string;
  language: string;
  status: AutogradeJobStatus;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  cancelRequested?: boolean;
  items: AutogradeJobItem[];
}
