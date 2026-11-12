import { spawn } from "node:child_process";
import os from "node:os";
import type { z } from "zod";
import { z as zod } from "zod";

/**
 * Runs prompts through the `claude` CLI installed on this machine, so they are
 * billed to whatever Claude account/subscription that CLI is logged in with
 * (`claude login`) instead of an API key.
 */

export interface ClaudeCliModelOption {
  id: string;
  name: string;
}

// Aliases understood by `claude --model`; they always resolve to the latest
// model of that tier, so this list doesn't go stale.
export const CLAUDE_CLI_MODELS: ClaudeCliModelOption[] = [
  { id: "opus", name: "Claude Opus (subscription)" },
  { id: "sonnet", name: "Claude Sonnet (subscription)" },
  { id: "haiku", name: "Claude Haiku (subscription)" },
];

const CLI_TIMEOUT_MS = 10 * 60 * 1000;

interface CliRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runCli(args: string[], stdin: string, timeoutMs: number): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    // ANTHROPIC_API_KEY / AUTH_TOKEN would make the CLI bill the API instead
    // of the logged-in subscription, which is the opposite of what this
    // mode is for.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    const child = spawn("claude", args, {
      // Neutral cwd so the CLI doesn't pick up this repo's CLAUDE.md/AGENTS.md.
      cwd: os.tmpdir(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("The claude CLI timed out.")));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          new Error(
            err.code === "ENOENT"
              ? "The `claude` CLI was not found on this machine. Install Claude Code and run `claude login`."
              : `Could not start the claude CLI: ${err.message}`
          )
        )
      );
    });
    child.on("close", (code) => finish(() => resolve({ stdout, stderr, code })));

    child.stdin.on("error", () => {
      // EPIPE if the process exits early; the close handler reports the real failure.
    });
    child.stdin.end(stdin);
  });
}

export interface ClaudeCliObjectParams<T extends z.ZodType> {
  model: string;
  schema: T;
  instructions: string;
  prompt: string;
}

export async function generateObjectWithClaudeCli<T extends z.ZodType>(
  params: ClaudeCliObjectParams<T>
): Promise<z.infer<T>> {
  const { model, schema, instructions, prompt } = params;

  // The CLI's validator doesn't know the 2020-12 meta-schema zod emits by default.
  const jsonSchema = zod.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;

  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(jsonSchema),
    "--model",
    model,
    // Pure text-in/JSON-out: no tools, no hooks/settings, no saved session.
    "--tools",
    "",
    "--setting-sources",
    "",
    "--no-session-persistence",
    "--system-prompt",
    instructions,
  ];

  const { stdout, stderr, code } = await runCli(args, prompt, CLI_TIMEOUT_MS);

  let parsed: { is_error?: boolean; result?: string; structured_output?: unknown; subtype?: string } | null = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // fall through to the error handling below
  }

  if (!parsed) {
    const detail = (stderr || stdout).trim().slice(0, 500);
    throw new Error(`The claude CLI failed${code != null ? ` (exit ${code})` : ""}${detail ? `: ${detail}` : "."}`);
  }

  if (parsed.is_error || code !== 0) {
    const detail = (parsed.result || stderr).trim().slice(0, 500);
    if (/not logged in|\/login|authenticat/i.test(detail)) {
      throw new Error("The claude CLI is not logged in on this machine. Run `claude login` in a terminal.");
    }
    throw new Error(`The claude CLI reported an error${detail ? `: ${detail}` : "."}`);
  }

  const validated = schema.safeParse(parsed.structured_output);
  if (!validated.success) {
    throw new Error(
      `The claude CLI returned no valid structured response (${parsed.subtype ?? "unknown"}). Try a different model.`
    );
  }
  return validated.data;
}

/** Quick check that the CLI exists and is installed; login problems surface on first use. */
export async function isClaudeCliAvailable(): Promise<boolean> {
  try {
    const { code } = await runCli(["--version"], "", 10_000);
    return code === 0;
  } catch {
    return false;
  }
}
