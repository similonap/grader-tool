import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectEnvironment } from "./environment";
import { slugify, uniqueSlug } from "./slug";
import { computeSolutionDiff } from "./solutionDiff";
import type { CriterionGrade, ProjectMeta, SolutionDiff, SolutionGrading, SolutionMeta, SolutionRecord } from "./types";
import { extractZipSmart } from "./zip";

export const DATA_ROOT = path.join(process.cwd(), "data");

function projectDir(slug: string): string {
  return path.join(DATA_ROOT, slug);
}

function starterDir(slug: string): string {
  return path.join(projectDir(slug), "starter");
}

function projectMetaPath(slug: string): string {
  return path.join(projectDir(slug), "project.json");
}

function gradingKeyPath(slug: string): string {
  return path.join(projectDir(slug), "grading-key.json");
}

function solutionsIndexPath(slug: string): string {
  return path.join(projectDir(slug), "solutions.json");
}

function solutionsRootDir(slug: string): string {
  return path.join(projectDir(slug), "solutions");
}

/**
 * Where grading used to be stored separately from the diff, before the two
 * were combined into one file per solution - kept only so pre-existing data
 * in that shape can still be read (and then cleaned up once migrated).
 */
function legacyGradingPath(slug: string, solutionId: string): string {
  return path.join(projectDir(slug), "grading", `${solutionId}.json`);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(p: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(value, null, 2), "utf8");
}

export async function listProjects(): Promise<ProjectMeta[]> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
  const projects: ProjectMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await readJson<ProjectMeta>(projectMetaPath(entry.name));
    if (meta) projects.push(meta);
  }
  projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return projects;
}

export async function getProject(slug: string): Promise<ProjectMeta | null> {
  return readJson<ProjectMeta>(projectMetaPath(slug));
}

/** Records the model/language an autograde run just used, so the pickers default to them next time. */
export async function saveLastAutogradeSettings(slug: string, model: string, language: string): Promise<void> {
  const project = await getProject(slug);
  if (!project) return;
  project.lastAutogradeModel = model;
  project.lastAutogradeLanguage = language;
  await writeJson(projectMetaPath(slug), project);
}

export async function getGradingKeyRaw(slug: string): Promise<string | null> {
  try {
    return await fs.readFile(gradingKeyPath(slug), "utf8");
  } catch {
    return null;
  }
}

export function getStarterDir(slug: string): string {
  return starterDir(slug);
}

export interface CreateProjectInput {
  label: string;
  starterZipBuffer: Buffer;
  starterZipName: string;
  gradingKeyText: string;
  gradingKeyName: string;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectMeta> {
  await fs.mkdir(DATA_ROOT, { recursive: true });

  const slug = await uniqueSlug(input.label, (candidate) => pathExists(projectDir(candidate)));
  const dir = projectDir(slug);
  await fs.mkdir(dir, { recursive: true });

  await extractZipSmart(input.starterZipBuffer, starterDir(slug));
  await fs.writeFile(gradingKeyPath(slug), input.gradingKeyText, "utf8");

  const environment = await detectEnvironment(starterDir(slug));

  const meta: ProjectMeta = {
    id: slug,
    label: input.label,
    createdAt: new Date().toISOString(),
    starterZipName: input.starterZipName,
    gradingKeyName: input.gradingKeyName,
    environment,
  };

  await writeJson(projectMetaPath(slug), meta);
  await writeJson(solutionsIndexPath(slug), [] satisfies SolutionMeta[]);

  return meta;
}

export async function listSolutions(slug: string): Promise<SolutionMeta[]> {
  const list = await readJson<SolutionMeta[]>(solutionsIndexPath(slug));
  return list ?? [];
}

export async function getSolution(slug: string, solutionId: string): Promise<SolutionMeta | null> {
  const list = await listSolutions(slug);
  return list.find((s) => s.id === solutionId) ?? null;
}

function solutionRecordPath(slug: string, solution: SolutionMeta): string {
  return path.join(projectDir(slug), solution.diffRelPath);
}

/**
 * Reads a solution's combined diff+grading record, transparently upgrading
 * the older format (diff-only, with grading in a separate file) if that's
 * still what's on disk.
 */
export async function getSolutionRecord(slug: string, solution: SolutionMeta): Promise<SolutionRecord | null> {
  const raw = await readJson<Record<string, unknown>>(solutionRecordPath(slug, solution));
  if (!raw) return null;

  if (raw.diff && raw.grading) {
    return raw as unknown as SolutionRecord;
  }

  const legacyDiff = raw as unknown as SolutionDiff;
  const legacyGrading = await readJson<SolutionGrading>(legacyGradingPath(slug, solution.id));

  return {
    solutionId: solution.id,
    diff: {
      computedAt: legacyDiff.computedAt ?? new Date(0).toISOString(),
      files: legacyDiff.files ?? [],
    },
    grading: {
      overallComment: legacyGrading?.overallComment ?? "",
      criteria: legacyGrading?.criteria ?? {},
      updatedAt: legacyGrading?.updatedAt ?? new Date(0).toISOString(),
    },
  };
}

async function writeSolutionRecord(slug: string, solution: SolutionMeta, record: SolutionRecord): Promise<void> {
  await writeJson(solutionRecordPath(slug, solution), record);
  // Once combined into the record above, a leftover legacy-format grading
  // file would just be redundant (and confusing) - clear it if present.
  await fs.rm(legacyGradingPath(slug, solution.id), { force: true });
}

export async function getSolutionDiff(slug: string, solution: SolutionMeta): Promise<SolutionDiff | null> {
  const record = await getSolutionRecord(slug, solution);
  if (!record) return null;
  return { solutionId: record.solutionId, computedAt: record.diff.computedAt, files: record.diff.files };
}

/** Upgrades a solution's on-disk file to the combined diff+grading format if it isn't already. Safe to call repeatedly. */
export async function migrateSolutionRecord(slug: string, solution: SolutionMeta): Promise<void> {
  const record = await getSolutionRecord(slug, solution);
  if (record) await writeSolutionRecord(slug, solution, record);
}

async function removeSolutionArtifacts(slug: string, solution: SolutionMeta): Promise<void> {
  await fs.rm(solutionRecordPath(slug, solution), { force: true });
  await fs.rm(legacyGradingPath(slug, solution.id), { force: true });
}

export interface AddSolutionInput {
  zipBuffer: Buffer;
  originalFilename: string;
  group: string | null;
}

export async function addSolution(slug: string, input: AddSolutionInput): Promise<SolutionMeta> {
  const project = await getProject(slug);
  if (!project) throw new Error(`Unknown project: ${slug}`);

  const baseLabel = input.originalFilename.replace(/\.zip$/i, "");
  const groupSlug = input.group ? slugify(input.group) : null;
  const scopeDir = groupSlug ? path.join(solutionsRootDir(slug), groupSlug) : solutionsRootDir(slug);

  // Re-uploading a solution with the same name overwrites it - including its
  // old diff and any saved grading, which would otherwise describe content
  // that no longer matches - rather than creating a numbered duplicate.
  const id = slugify(baseLabel);
  const list = await listSolutions(slug);
  const existing = list.find((s) => s.id === id);
  if (existing) {
    await removeSolutionArtifacts(slug, existing);
  }

  // The zip is only extracted long enough to diff it against the starter -
  // only that diff is kept on disk, not the solution's own files.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grader-solution-"));
  let files;
  try {
    await extractZipSmart(input.zipBuffer, tempDir);
    files = await computeSolutionDiff(starterDir(slug), tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  const diffRelPath = path.relative(projectDir(slug), path.join(scopeDir, `${id}.json`));

  const meta: SolutionMeta = {
    id,
    label: baseLabel,
    group: input.group?.trim() || null,
    originalFilename: input.originalFilename,
    uploadedAt: new Date().toISOString(),
    diffRelPath,
  };

  const record: SolutionRecord = {
    solutionId: id,
    diff: { computedAt: new Date().toISOString(), files },
    grading: { overallComment: "", criteria: {}, updatedAt: new Date(0).toISOString() },
  };
  await writeSolutionRecord(slug, meta, record);

  const nextList = existing ? list.filter((s) => s.id !== id) : list;
  nextList.push(meta);
  await writeJson(solutionsIndexPath(slug), nextList);

  return meta;
}

/** Deletes the given solutions (diff, saved grading, and index entry). Returns how many were actually found and removed. */
export async function deleteSolutions(slug: string, solutionIds: string[]): Promise<number> {
  const wanted = new Set(solutionIds);
  const list = await listSolutions(slug);
  const toRemove = list.filter((s) => wanted.has(s.id));
  if (toRemove.length === 0) return 0;

  for (const solution of toRemove) {
    await removeSolutionArtifacts(slug, solution);
  }

  const remaining = list.filter((s) => !wanted.has(s.id));
  await writeJson(solutionsIndexPath(slug), remaining);
  return toRemove.length;
}

/**
 * Loads the saved manual-grading state for a solution, filled in against
 * the given criterion ids (from the project's current grading key) so the
 * UI always has an entry for every criterion, even if nothing was saved
 * yet or the grading key changed since the last save.
 */
export async function getGradingState(
  slug: string,
  solutionId: string,
  criterionIds: string[]
): Promise<SolutionGrading> {
  const solution = await getSolution(slug, solutionId);
  const record = solution ? await getSolutionRecord(slug, solution) : null;

  const criteria: Record<string, CriterionGrade> = {};
  for (const id of criterionIds) {
    criteria[id] = record?.grading.criteria[id] ?? { checked: false, comment: "", references: [] };
  }

  return {
    solutionId,
    overallComment: record?.grading.overallComment ?? "",
    criteria,
    updatedAt: record?.grading.updatedAt ?? new Date(0).toISOString(),
  };
}

export async function saveGradingState(
  slug: string,
  solutionId: string,
  state: { overallComment: string; criteria: Record<string, CriterionGrade> }
): Promise<SolutionGrading> {
  const solution = await getSolution(slug, solutionId);
  if (!solution) throw new Error(`Unknown solution: ${solutionId}`);

  const existing = await getSolutionRecord(slug, solution);
  const updatedAt = new Date().toISOString();

  const record: SolutionRecord = {
    solutionId,
    diff: existing?.diff ?? { computedAt: new Date(0).toISOString(), files: [] },
    grading: { overallComment: state.overallComment, criteria: state.criteria, updatedAt },
  };
  await writeSolutionRecord(slug, solution, record);

  return { solutionId, overallComment: state.overallComment, criteria: state.criteria, updatedAt };
}
