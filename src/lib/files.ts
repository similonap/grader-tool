import fs from "node:fs/promises";
import path from "node:path";
import type { FileDiffEntry, FileStatus } from "./types";

const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "__pycache__", ".venv", "venv", "dist", "build"]);

async function walk(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function recurse(currentDir: string, relPrefix: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await recurse(path.join(currentDir, entry.name), `${relPrefix}${entry.name}/`);
      } else if (entry.isFile()) {
        results.push(`${relPrefix}${entry.name}`);
      }
    }
  }

  await recurse(rootDir, "");
  return results;
}

export function isLikelyBinary(buf: Buffer): boolean {
  const sampleLength = Math.min(buf.length, 8000);
  for (let i = 0; i < sampleLength; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Compares two directory trees and returns a flat, sorted list of every
 * file that exists in either side, with a status describing how the
 * solution differs from the starter.
 */
export async function diffFileList(starterDir: string, solutionDir: string): Promise<FileDiffEntry[]> {
  const [starterFiles, solutionFiles] = await Promise.all([walk(starterDir), walk(solutionDir)]);

  const starterSet = new Set(starterFiles);
  const solutionSet = new Set(solutionFiles);
  const allPaths = new Set<string>([...starterFiles, ...solutionFiles]);

  const entries: FileDiffEntry[] = [];

  for (const rel of allPaths) {
    const inStarter = starterSet.has(rel);
    const inSolution = solutionSet.has(rel);

    let status: FileStatus;
    let binary = false;

    if (inStarter && !inSolution) {
      status = "removed";
      const buf = await fs.readFile(path.join(starterDir, rel)).catch(() => Buffer.alloc(0));
      binary = isLikelyBinary(buf);
    } else if (!inStarter && inSolution) {
      status = "added";
      const buf = await fs.readFile(path.join(solutionDir, rel)).catch(() => Buffer.alloc(0));
      binary = isLikelyBinary(buf);
    } else {
      const [a, b] = await Promise.all([
        fs.readFile(path.join(starterDir, rel)).catch(() => Buffer.alloc(0)),
        fs.readFile(path.join(solutionDir, rel)).catch(() => Buffer.alloc(0)),
      ]);
      binary = isLikelyBinary(a) || isLikelyBinary(b);
      status = a.equals(b) ? "unchanged" : "modified";
    }

    entries.push({ path: rel, status, binary });
  }

  entries.sort((x, y) => x.path.localeCompare(y.path));
  return entries;
}

/**
 * Resolves relPath against dir, refusing to return a path that would
 * escape dir (e.g. via "../" segments).
 */
export function safeJoin(dir: string, relPath: string): string | null {
  const resolvedDir = path.resolve(dir);
  const target = path.resolve(resolvedDir, relPath);
  if (target !== resolvedDir && !target.startsWith(resolvedDir + path.sep)) {
    return null;
  }
  return target;
}

export async function readFileBufferAt(absPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(absPath);
  } catch {
    return null;
  }
}
