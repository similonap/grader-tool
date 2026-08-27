import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectEnvironment } from "./environment";
import { cloneProjectRepo, initProjectRepo } from "./projectRepo";
import { slugify, uniqueSlug } from "./slug";
import { computeSolutionDiff } from "./solutionDiff";
import type { CriterionGrade, ProjectMeta, SolutionDiff, SolutionGrading, SolutionMeta, SolutionRecord } from "./types";
import { extractZipLiteral, extractZipSmart, zipDirectoryToBuffer } from "./zip";

export const DATA_ROOT = path.join(process.cwd(), "data");

export function projectDir(slug: string): string {
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
    // Dotdirs are never real projects - defensively excludes an in-progress
    // (or, if cleanup ever failed, leftover) git-import staging directory,
    // which would otherwise contain a real project.json of its own.
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const meta = await readJson<ProjectMeta>(projectMetaPath(entry.name));
    if (meta) projects.push(meta);
  }
  projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return projects;
}

export async function getProject(slug: string): Promise<ProjectMeta | null> {
  return readJson<ProjectMeta>(projectMetaPath(slug));
}

/** Deletes a project and everything under it (starter, solutions, grading). Returns false if it didn't exist. */
export async function deleteProject(slug: string): Promise<boolean> {
  const dir = projectDir(slug);
  if (!(await pathExists(dir))) return false;
  await fs.rm(dir, { recursive: true, force: true });
  return true;
}

/** Zips up a project's entire directory (starter, grading key, solutions, grading) so it can be imported elsewhere. */
export async function exportProject(slug: string): Promise<Buffer | null> {
  const dir = projectDir(slug);
  if (!(await pathExists(dir))) return null;
  // Autograde job history is transient run-tracking state, not project data
  // worth carrying along into an export/import.
  return zipDirectoryToBuffer(dir, ["autograde-jobs"]);
}

/**
 * Re-creates a project from a zip previously produced by exportProject.
 * Always lands under a fresh, unique slug (even if the exported project.json
 * still names the slug it was exported from) so importing never clobbers an
 * existing project.
 */
export async function importProject(zipBuffer: Buffer): Promise<ProjectMeta> {
  await fs.mkdir(DATA_ROOT, { recursive: true });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grader-import-"));
  try {
    await extractZipLiteral(zipBuffer, tempDir);

    const meta = await readJson<ProjectMeta>(path.join(tempDir, "project.json"));
    if (!meta) throw new Error("Not a valid project export (missing project.json).");

    const slug = await uniqueSlug(meta.label, (candidate) => pathExists(projectDir(candidate)));
    const dir = projectDir(slug);
    // Copy rather than rename: tempDir (os.tmpdir()) and DATA_ROOT can be on
    // different filesystems/mounts, where rename would fail with EXDEV.
    await fs.cp(tempDir, dir, { recursive: true });

    const importedMeta: ProjectMeta = { ...meta, id: slug };
    await writeJson(projectMetaPath(slug), importedMeta);

    return importedMeta;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

/** Replaces a project's grading key with new content. Existing solutions/grading are untouched. */
export async function saveGradingKey(slug: string, gradingKeyText: string, gradingKeyName: string): Promise<void> {
  const project = await getProject(slug);
  if (!project) throw new Error(`Unknown project: ${slug}`);

  await fs.writeFile(gradingKeyPath(slug), gradingKeyText, "utf8");

  project.gradingKeyName = gradingKeyName;
  await writeJson(projectMetaPath(slug), project);
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

  // Best-effort: every new project's data dir becomes its own local git
  // repo automatically, ready for a remote to be added and pushed later.
  // Must never fail project creation itself over this auxiliary step.
  try {
    await initProjectRepo(dir, null);
  } catch (err) {
    console.error(`Failed to initialize git repo for project ${slug}`, err);
  }

  return meta;
}

/**
 * Re-creates a project by cloning its git repo (previously set up via
 * initProjectRepo/setProjectRemote and pushed). Unlike importProject (from a
 * zip export), this keeps the clone's .git intact, so the imported copy
 * stays linked to the same remote for future pull/push. Always lands under
 * a fresh unique slug, even if the repo's project.json still names the slug
 * it was pushed from, so importing never clobbers an existing project.
 */
export async function importProjectFromGit(remoteUrl: string): Promise<ProjectMeta> {
  await fs.mkdir(DATA_ROOT, { recursive: true });

  // Staged inside DATA_ROOT (not os.tmpdir()) so moving it into place at the
  // end is a same-filesystem rename - no second clone just to learn the
  // label before knowing the final slug, and no cross-filesystem fs.cp
  // (which previously hit EACCES trying to chmod git's read-only object
  // files when the two directories were on different mounts).
  const stagingDir = path.join(DATA_ROOT, `.import-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  try {
    await cloneProjectRepo(remoteUrl, stagingDir);

    const meta = await readJson<ProjectMeta>(path.join(stagingDir, "project.json"));
    if (!meta) throw new Error("Not a valid project repository (missing project.json at its root).");

    const slug = await uniqueSlug(meta.label, (candidate) => pathExists(projectDir(candidate)));
    const dir = projectDir(slug);
    await fs.rename(stagingDir, dir);

    const importedMeta: ProjectMeta = { ...meta, id: slug };
    await writeJson(projectMetaPath(slug), importedMeta);

    return importedMeta;
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
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

  // Group is pure metadata (SolutionMeta.group) for filtering/display -
  // never used to shape where the solution's record lives on disk.
  const diffRelPath = path.relative(projectDir(slug), path.join(solutionsRootDir(slug), `${id}.json`));

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

/** Updates a solution's group metadata. Returns the updated solution, or null if it doesn't exist. */
export async function updateSolutionGroup(slug: string, solutionId: string, group: string | null): Promise<SolutionMeta | null> {
  const list = await listSolutions(slug);
  const solution = list.find((s) => s.id === solutionId);
  if (!solution) return null;

  solution.group = group;
  await writeJson(solutionsIndexPath(slug), list);
  return solution;
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

export interface PuntenlijstAssignment {
  solutionId: string;
  label: string;
  group: string | null;
}

/** Applies confirmed puntenlijst matches: renames each solution's label and sets its group. The solution's id/URL/stored files are untouched. */
export async function applyPuntenlijstAssignments(slug: string, assignments: PuntenlijstAssignment[]): Promise<number> {
  const list = await listSolutions(slug);
  const byId = new Map(list.map((s) => [s.id, s]));

  let count = 0;
  for (const assignment of assignments) {
    const solution = byId.get(assignment.solutionId);
    if (!solution) continue;
    solution.label = assignment.label;
    solution.group = assignment.group;
    count++;
  }

  await writeJson(solutionsIndexPath(slug), list);
  return count;
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
