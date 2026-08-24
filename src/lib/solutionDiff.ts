import { computeLineDiff } from "./diff";
import { diffFileList, readFileBufferAt, safeJoin } from "./files";
import type { StoredFileDiff } from "./types";

/**
 * Diffs a solution directory against the starter and returns a fully
 * self-contained snapshot (line-level diffs for every changed text file,
 * sizes for changed binary files). This is computed once at upload time so
 * the raw solution files never need to be kept on disk afterwards.
 */
export async function computeSolutionDiff(starterDir: string, solutionDir: string): Promise<StoredFileDiff[]> {
  const entries = await diffFileList(starterDir, solutionDir);
  const results: StoredFileDiff[] = [];

  for (const entry of entries) {
    if (entry.status === "unchanged") {
      // Identical to the starter file, which is kept - nothing to persist.
      results.push(entry);
      continue;
    }

    const starterPath = safeJoin(starterDir, entry.path);
    const solutionPath = safeJoin(solutionDir, entry.path);
    const [starterBuf, solutionBuf] = await Promise.all([
      starterPath ? readFileBufferAt(starterPath) : null,
      solutionPath ? readFileBufferAt(solutionPath) : null,
    ]);

    if (entry.binary) {
      results.push({ ...entry, oldSize: starterBuf?.length, newSize: solutionBuf?.length });
      continue;
    }

    const oldText = starterBuf?.toString("utf8") ?? "";
    const newText = solutionBuf?.toString("utf8") ?? "";
    results.push({ ...entry, lines: computeLineDiff(oldText, newText) });
  }

  return results;
}
