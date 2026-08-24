import fs from "node:fs/promises";
import path from "node:path";
import type { EnvironmentInfo } from "./types";

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspects an unzipped starter project and records what kind of project it
 * is. This is metadata only - nothing here executes any code from the
 * starter or a solution.
 */
export async function detectEnvironment(starterDir: string): Promise<EnvironmentInfo> {
  const exists = (rel: string) => pathExists(path.join(starterDir, rel));

  let projectType: EnvironmentInfo["projectType"] = "unknown";
  let packageManager: EnvironmentInfo["packageManager"] | undefined;
  let packageName: string | undefined;
  let scripts: Record<string, string> | undefined;
  let dependencyCount: number | undefined;

  if (await exists("package.json")) {
    projectType = "node";
    try {
      const raw = await fs.readFile(path.join(starterDir, "package.json"), "utf8");
      const pkg = JSON.parse(raw) as {
        name?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      packageName = pkg.name;
      scripts = pkg.scripts;
      dependencyCount = Object.keys({
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      }).length;
    } catch {
      // malformed package.json - keep detected type, skip details
    }

    if (await exists("pnpm-lock.yaml")) packageManager = "pnpm";
    else if (await exists("yarn.lock")) packageManager = "yarn";
    else packageManager = "npm";
  } else if ((await exists("requirements.txt")) || (await exists("pyproject.toml"))) {
    projectType = "python";
  }

  const hasDevcontainer = await exists(".devcontainer/devcontainer.json");
  let devcontainerImage: string | undefined;
  if (hasDevcontainer) {
    try {
      const raw = await fs.readFile(path.join(starterDir, ".devcontainer/devcontainer.json"), "utf8");
      const withoutComments = raw.replace(/\/\/.*$/gm, "");
      const conf = JSON.parse(withoutComments) as { image?: string };
      devcontainerImage = conf.image;
    } catch {
      // malformed devcontainer.json - still record that one exists
    }
  }

  return {
    projectType,
    packageManager,
    packageName,
    scripts,
    dependencyCount,
    hasDevcontainer,
    devcontainerImage,
    detectedAt: new Date().toISOString(),
  };
}
