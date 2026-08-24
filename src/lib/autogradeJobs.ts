import fs from "node:fs/promises";
import path from "node:path";
import { autogradeSolution } from "./aiGateway";
import { parseGradingKey, type GradingKeyDoc } from "./gradingKey";
import { getAiGatewayKey } from "./settings";
import {
  DATA_ROOT,
  getGradingKeyRaw,
  getProject,
  getSolution,
  getSolutionDiff,
  listSolutions,
  saveGradingState,
  saveLastAutogradeSettings,
} from "./storage";
import type { AutogradeJob } from "./types";

function jobsDir(slug: string): string {
  return path.join(DATA_ROOT, slug, "autograde-jobs");
}

function jobPath(slug: string, jobId: string): string {
  return path.join(jobsDir(slug), `${jobId}.json`);
}

async function saveJob(job: AutogradeJob): Promise<void> {
  await fs.mkdir(jobsDir(job.projectSlug), { recursive: true });
  await fs.writeFile(jobPath(job.projectSlug, job.id), JSON.stringify(job, null, 2), "utf8");
}

/** Most recently started bulk autograde job for a project, or null if none has ever run. */
export async function getLatestAutogradeJob(slug: string): Promise<AutogradeJob | null> {
  let files: string[];
  try {
    files = await fs.readdir(jobsDir(slug));
  } catch {
    return null;
  }

  let latest: AutogradeJob | null = null;
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(jobsDir(slug), file), "utf8");
      const job = JSON.parse(raw) as AutogradeJob;
      if (!latest || job.startedAt > latest.startedAt) latest = job;
    } catch {
      // skip an unreadable/corrupt job file rather than failing the whole lookup
    }
  }
  return latest;
}

function newJobId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Jobs actively running in this process, keyed by job id - used to route
// cancel requests to the right in-flight loop. A fresh process (e.g. after a
// restart) starts with an empty map, so an abandoned "running" job file left
// behind by a previous process never blocks starting a new one.
const activeJobs = new Map<string, AutogradeJob>();

// Project slugs currently reserved for a bulk run. Separate from activeJobs
// because it must be checked-and-set synchronously (before any `await`) to
// avoid a race: two concurrent start requests can otherwise both pass
// isProjectAutogradeRunning() before either has had a chance to register its
// job, since every `await` in between yields control back to the event loop.
const lockedProjects = new Set<string>();

export function isProjectAutogradeRunning(slug: string): boolean {
  return lockedProjects.has(slug);
}

export interface StartBulkAutogradeInput {
  slug: string;
  model: string;
  language: string;
  /** Only these solutions are graded - the selection made in the solutions table. */
  solutionIds: string[];
}

export async function startBulkAutograde(input: StartBulkAutogradeInput): Promise<AutogradeJob> {
  const { slug, model, language, solutionIds } = input;

  if (lockedProjects.has(slug)) {
    throw new Error("A bulk autograde run is already in progress for this project.");
  }
  // Synchronous reservation - nothing below this line runs before the next
  // `await`, so a second concurrent call sees the lock immediately.
  lockedProjects.add(slug);

  let started = false;
  try {
    const project = await getProject(slug);
    if (!project) throw new Error("Unknown project.");

    const apiKey = await getAiGatewayKey();
    if (!apiKey) throw new Error("No AI Gateway key configured. Set one in Settings first.");

    const gradingKey = parseGradingKey(await getGradingKeyRaw(slug));
    if (!gradingKey?.sections?.length) {
      throw new Error("This project's grading key has no structured criteria to grade against.");
    }

    const wantedIds = new Set(solutionIds);
    const solutions = (await listSolutions(slug)).filter((s) => wantedIds.has(s.id));
    if (solutions.length === 0) throw new Error("No solutions selected.");

    await saveLastAutogradeSettings(slug, model, language);

    const job: AutogradeJob = {
      id: newJobId(),
      projectSlug: slug,
      model,
      language,
      status: "running",
      startedAt: new Date().toISOString(),
      items: solutions.map((s) => ({ solutionId: s.id, label: s.label, status: "pending" })),
    };

    activeJobs.set(job.id, job);
    await saveJob(job);

    started = true;
    // Runs after the request that started it has already responded. The
    // lock is held until the job truly finishes, not just until it starts.
    void runJob(job, apiKey, gradingKey).finally(() => {
      activeJobs.delete(job.id);
      lockedProjects.delete(slug);
    });

    return job;
  } finally {
    if (!started) lockedProjects.delete(slug);
  }
}

async function runJob(job: AutogradeJob, apiKey: string, gradingKey: GradingKeyDoc): Promise<void> {
  for (const item of job.items) {
    if (job.cancelRequested) {
      item.status = "skipped";
      continue;
    }

    item.status = "running";
    await saveJob(job);

    try {
      const solution = await getSolution(job.projectSlug, item.solutionId);
      const solutionDiff = solution ? await getSolutionDiff(job.projectSlug, solution) : null;
      if (!solution || !solutionDiff) throw new Error("Solution diff not found.");

      const outcome = await autogradeSolution({
        apiKey,
        modelId: job.model,
        gradingKey,
        files: solutionDiff.files,
        language: job.language,
      });
      await saveGradingState(job.projectSlug, item.solutionId, outcome);
      item.status = "done";
    } catch (err) {
      item.status = "error";
      item.error = err instanceof Error ? err.message : "Autograding failed.";
    }

    await saveJob(job);
  }

  job.status = job.cancelRequested ? "cancelled" : "completed";
  job.finishedAt = new Date().toISOString();
  await saveJob(job);
}

/** Returns true if a running job for this project was found and asked to stop after its current item. */
export function requestCancelAutograde(slug: string): boolean {
  let found = false;
  for (const job of activeJobs.values()) {
    if (job.projectSlug === slug && job.status === "running") {
      job.cancelRequested = true;
      found = true;
    }
  }
  return found;
}
