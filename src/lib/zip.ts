import AdmZip from "adm-zip";
import path from "node:path";
import fs from "node:fs/promises";

// Directories that are noise for the purposes of locating a project's real
// root - build output, dependencies, VCS metadata. Their presence (or
// absence) as a "sibling" of the real project folder shouldn't influence
// where we decide the project actually lives.
const IGNORED_ROOT_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  ".vercel",
]);

function isNoiseEntry(entryName: string): boolean {
  return entryName.split("/").some((segment) => IGNORED_ROOT_SEGMENTS.has(segment));
}

// Files whose presence in a directory strongly indicates that directory is
// a project's real root, independent of how deeply or ambiguously it's
// nested inside the archive.
const PROJECT_MARKER_FILENAMES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
];

/**
 * Finds the directory containing a recognized project marker file (e.g.
 * package.json), preferring the shallowest match if more than one exists.
 * This is far more reliable than reasoning about folder-nesting shape alone:
 * a submission can be wrapped in an arbitrary number of extra folders (a
 * workspace folder that still contains an un-renamed "starter/" folder, an
 * ambiguous sibling, etc.) and this still finds the real root directly, as
 * long as the project has one of these marker files somewhere sensible.
 * Returns null if no marker file is found anywhere (e.g. a project type not
 * covered by the marker list), so the caller can fall back to another
 * strategy.
 */
function findMarkerBasedRoot(fileEntryNames: string[]): string | null {
  const candidates = fileEntryNames.filter((name) => {
    const filename = name.split("/").pop();
    return filename ? PROJECT_MARKER_FILENAMES.includes(filename) : false;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.split("/").length - b.split("/").length);
  const parts = candidates[0].split("/");
  parts.pop();
  return parts.length > 0 ? `${parts.join("/")}/` : "";
}

/**
 * Finds the longest run of leading single-folder wrappers shared by every
 * entry - e.g. "project/" for a normal zip, but also "workspace/project/"
 * if someone zipped a parent folder that itself just contains one
 * un-renamed folder. Stops as soon as a level has more than one distinct
 * child, which is what a real project root looks like. Used as a fallback
 * when no recognized project marker file is found.
 */
function computeStripPrefix(entryNames: string[]): string {
  let stripPrefix = "";

  for (let depth = 0; depth < 10; depth++) {
    const nextSegments = new Set<string>();
    for (const name of entryNames) {
      if (!name.startsWith(stripPrefix)) continue;
      const rel = name.slice(stripPrefix.length);
      if (!rel) continue; // this entry is exactly the wrapper directory itself
      const first = rel.split("/")[0];
      if (first) nextSegments.add(first);
    }

    if (nextSegments.size !== 1) break;

    const candidatePrefix = `${stripPrefix}${[...nextSegments][0]}/`;
    const allNested = entryNames.every((name) => name === candidatePrefix || name.startsWith(candidatePrefix));
    if (!allNested) break;

    stripPrefix = candidatePrefix;
  }

  return stripPrefix;
}

/**
 * Extracts a zip buffer into destDir, first trying to locate the project's
 * real root via a marker file (package.json etc.) and falling back to
 * stripping a shared chain of single-folder wrappers if no marker is found,
 * so destDir ends up directly containing the project's own files.
 */
export async function extractZipSmart(zipBuffer: Buffer, destDir: string): Promise<void> {
  const zip = new AdmZip(zipBuffer);
  const entries = zip
    .getEntries()
    .filter((e) => !e.entryName.startsWith("__MACOSX/") && !e.entryName.split("/").pop()?.startsWith(".DS_Store"));

  // Only real files - and only ones outside build/dependency/VCS noise -
  // inform where the project root actually is. Directory-only entries never
  // produce output anyway (the extraction loop below skips them), and a
  // noise folder (node_modules, .git, .next, ...) sitting as a "sibling"
  // shouldn't be able to block detection either.
  const signalNames = entries.filter((e) => !e.isDirectory && !isNoiseEntry(e.entryName)).map((e) => e.entryName);

  const stripPrefix = findMarkerBasedRoot(signalNames) ?? computeStripPrefix(signalNames);

  const resolvedDest = path.resolve(destDir);
  await fs.mkdir(resolvedDest, { recursive: true });

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    let rel = entry.entryName;
    if (stripPrefix && rel.startsWith(stripPrefix)) {
      rel = rel.slice(stripPrefix.length);
    }
    if (!rel) continue;

    const target = path.resolve(resolvedDest, rel);
    if (target !== resolvedDest && !target.startsWith(resolvedDest + path.sep)) {
      // zip-slip guard: skip anything that would escape destDir
      continue;
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.getData());
  }
}

/**
 * Zips an entire directory (recursively) into a buffer, preserving its
 * structure exactly. Used for whole-project export, unlike
 * extractZipSmart's project-root detection which is for solution/starter
 * zips uploaded by someone else.
 */
export async function zipDirectoryToBuffer(dir: string): Promise<Buffer> {
  const zip = new AdmZip();
  await zip.addLocalFolderPromise(dir, {});
  return zip.toBuffer();
}

/**
 * Extracts a zip buffer into destDir exactly as archived, with no
 * root-detection/stripping - the counterpart to zipDirectoryToBuffer, used
 * for re-importing a previously exported project.
 */
export async function extractZipLiteral(zipBuffer: Buffer, destDir: string): Promise<void> {
  const zip = new AdmZip(zipBuffer);
  const resolvedDest = path.resolve(destDir);
  await fs.mkdir(resolvedDest, { recursive: true });

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;

    const target = path.resolve(resolvedDest, entry.entryName);
    if (target !== resolvedDest && !target.startsWith(resolvedDest + path.sep)) {
      // zip-slip guard: skip anything that would escape destDir
      continue;
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.getData());
  }
}
