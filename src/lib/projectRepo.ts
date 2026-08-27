import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Each project's own directory (data/<slug>/ - starter, grading key,
 * solutions) can be its own git repo, so it can be shared between lecturers:
 * pushed from the machine that created it, pulled down by another via
 * import, kept in sync afterward. Uses whatever git credentials are already
 * configured on this machine (SSH key, credential helper, `gh auth login`,
 * ...) - the app never handles or stores a credential itself.
 */

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 120_000;

// Transient run-tracking state, not worth tracking or sharing - same
// exclusion the zip-export feature already applies.
const GITIGNORE_LINES = ["autograde-jobs/"];

function assertSafeRemote(remoteUrl: string): void {
  // Positional git arguments starting with "-" can be misread as options
  // (argument injection) - reject outright rather than trying to escape it.
  if (!remoteUrl.trim() || remoteUrl.trim().startsWith("-")) {
    throw new Error("That doesn't look like a valid repository URL.");
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err) {
    const stderr = err && typeof err === "object" && "stderr" in err ? String((err as { stderr?: unknown }).stderr ?? "") : "";
    const fallback = err instanceof Error ? err.message : String(err);
    throw new Error((stderr || fallback).trim());
  }
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function ensureGitignore(dir: string): Promise<void> {
  const gitignorePath = path.join(dir, ".gitignore");
  let existing = "";
  try {
    existing = await fs.readFile(gitignorePath, "utf8");
  } catch {
    // doesn't exist yet
  }
  const existingLines = new Set(existing.split("\n").map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !existingLines.has(l));
  if (missing.length === 0) return;

  const next = (existing.trimEnd() + (existing.trim() ? "\n" : "") + missing.join("\n") + "\n").trimStart();
  await fs.writeFile(gitignorePath, next, "utf8");
}

/** Stages everything and commits if there's anything staged. Returns whether a commit was made. */
async function commitAll(dir: string, message: string): Promise<boolean> {
  await ensureGitignore(dir);
  await runGit(dir, ["add", "-A"]);

  const staged = await runGit(dir, ["diff", "--cached", "--name-only"]).catch(() => "");
  if (!staged) return false;

  await runGit(dir, ["commit", "-m", message]);
  return true;
}

export interface ProjectRepoStatus {
  isRepo: boolean;
  remoteUrl: string | null;
  branch: string | null;
  hasUncommittedChanges: boolean;
  lastCommit: { hash: string; message: string; date: string } | null;
}

/** Local-only status (no network call) - Pull/Push are the explicit network actions. */
export async function getProjectRepoStatus(dir: string): Promise<ProjectRepoStatus> {
  if (!(await isGitRepo(dir))) {
    return { isRepo: false, remoteUrl: null, branch: null, hasUncommittedChanges: false, lastCommit: null };
  }

  const [remoteUrl, branch, statusPorcelain, lastCommitRaw] = await Promise.all([
    runGit(dir, ["remote", "get-url", "origin"]).catch(() => ""),
    runGit(dir, ["branch", "--show-current"]).catch(() => ""),
    runGit(dir, ["status", "--porcelain"]).catch(() => ""),
    runGit(dir, ["log", "-1", "--format=%H%x1f%s%x1f%cI"]).catch(() => ""),
  ]);

  let lastCommit: ProjectRepoStatus["lastCommit"] = null;
  if (lastCommitRaw) {
    const [hash, message, date] = lastCommitRaw.split("\x1f");
    lastCommit = { hash: hash.slice(0, 8), message, date };
  }

  return {
    isRepo: true,
    remoteUrl: remoteUrl || null,
    branch: branch || null,
    hasUncommittedChanges: statusPorcelain.length > 0,
    lastCommit,
  };
}

/**
 * Initializes a project's directory as a git repo and commits everything
 * currently in it. Best-effort by design (callers creating a brand-new
 * project should swallow errors from this rather than fail the whole
 * creation over an auxiliary git step). If a remote is given, it's wired up
 * and the initial commit is pushed immediately so the project is pullable
 * right away.
 */
export async function initProjectRepo(dir: string, remoteUrl: string | null): Promise<void> {
  if (remoteUrl) assertSafeRemote(remoteUrl);
  if (await isGitRepo(dir)) {
    throw new Error("This project already has a git repository.");
  }

  // Explicit branch name rather than relying on this machine's
  // init.defaultBranch (unset defaults to the legacy "master") - every
  // project repo should consistently start on "main".
  await runGit(dir, ["init", "-b", "main"]);
  if (remoteUrl) {
    await runGit(dir, ["remote", "add", "origin", remoteUrl]);
  }
  await commitAll(dir, "Initial project data");
  if (remoteUrl) {
    await runGit(dir, ["push", "-u", "origin", "HEAD"]);
  }
}

/** Adds (or repoints) the project's "origin" remote without touching history. */
export async function setProjectRemote(dir: string, remoteUrl: string): Promise<void> {
  assertSafeRemote(remoteUrl);
  if (!(await isGitRepo(dir))) throw new Error("This project isn't a git repository yet.");

  const remotes = await runGit(dir, ["remote"]).catch(() => "");
  const args = remotes.split("\n").includes("origin") ? ["remote", "set-url", "origin", remoteUrl] : ["remote", "add", "origin", remoteUrl];
  await runGit(dir, args);
}

export async function pullProjectRepo(dir: string): Promise<string> {
  if (!(await isGitRepo(dir))) throw new Error("This project isn't a git repository yet.");
  // --ff-only: never auto-merge - a diverged history needs a person to look
  // at it, not a silent merge commit picked by whichever lecturer synced last.
  const result = await runGit(dir, ["pull", "--ff-only"]);
  return result || "Already up to date.";
}

export async function pushProjectRepo(dir: string, message: string): Promise<string> {
  if (!(await isGitRepo(dir))) throw new Error("This project isn't a git repository yet.");

  const committed = await commitAll(dir, message);
  // -u origin HEAD: sets the upstream tracking branch if it isn't already
  // set (e.g. a remote just added to a repo that was initialized locally
  // first) - a no-op otherwise, so it's safe to always pass.
  const result = await runGit(dir, ["push", "-u", "origin", "HEAD"]);
  return `${committed ? "Committed and pushed" : "Nothing new to commit - pushed existing commits"}${result ? `: ${result}` : "."}`;
}

/** Clones a project's git repo into destDir, which must not already exist or must be empty. */
export async function cloneProjectRepo(remoteUrl: string, destDir: string): Promise<void> {
  assertSafeRemote(remoteUrl);
  await runGit(path.dirname(destDir), ["clone", remoteUrl, destDir]);

  // A remote whose HEAD was never pointed at a real branch (e.g. a plain
  // `git init --bare` that was only ever pushed to, since a bare init fixes
  // HEAD at whatever init.defaultBranch resolved to and a push doesn't
  // retarget it) clones "successfully" but checks out nothing - recover by
  // picking a real branch ourselves instead of leaving an empty working tree.
  const checkedOutCommit = await runGit(destDir, ["rev-parse", "HEAD"]).catch(() => "");
  if (!checkedOutCommit) {
    const remoteBranches = await runGit(destDir, ["branch", "-r", "--format=%(refname:short)"])
      .then((out) => out.split("\n").filter((b) => b && !b.endsWith("/HEAD")))
      .catch(() => []);
    const preferred =
      remoteBranches.find((b) => b === "origin/main") ?? remoteBranches.find((b) => b === "origin/master") ?? remoteBranches[0];
    if (!preferred) throw new Error("The remote repository has no branches to check out.");

    const branchName = preferred.replace(/^origin\//, "");
    await runGit(destDir, ["checkout", "-B", branchName, preferred]);
  }

  await ensureGitignore(destDir);
}
