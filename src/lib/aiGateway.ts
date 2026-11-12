import { GatewayAuthenticationError, createGateway } from "@ai-sdk/gateway";
import { AISDKError, APICallError, NoObjectGeneratedError, generateObject } from "ai";
import { z } from "zod";
import { allCriterionIds, criterionId, type GradingKeyDoc } from "./gradingKey";
import { CLAUDE_CLI_MODELS, generateObjectWithClaudeCli } from "./claudeCli";
import type { AiAccess } from "./settings";
import type { CodeReference, CriterionGrade, StoredFileDiff } from "./types";

export interface GatewayModelOption {
  id: string;
  name: string;
}

export async function listModels(access: AiAccess): Promise<GatewayModelOption[]> {
  return access.provider === "claude-cli" ? CLAUDE_CLI_MODELS : listGatewayModels(access.apiKey);
}

export async function listGatewayModels(apiKey: string): Promise<GatewayModelOption[]> {
  const gatewayClient = createGateway({ apiKey });
  try {
    const { models } = await gatewayClient.getAvailableModels();
    const languageModels = models.filter((m) => m.modelType === "language" || m.modelType == null);
    return languageModels.map((m) => ({ id: m.id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    throw new Error(describeGatewayError(err));
  }
}

const MAX_DIFF_CHARS = 60000;

// Auto-generated/dependency files that are routinely huge, never hand-written,
// and carry no grading signal - excluded so they can't crowd out real source
// files under the character budget below.
const NOISE_FILE_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.ya?ml$/,
  /(^|\/)bun\.lockb?$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Cargo\.lock$/,
  // Dependency/build output directories.
  /(^|\/)(node_modules|dist|build|\.next|coverage)\//,
  // Images, fonts and other assets: no grading signal, often huge as text.
  /\.(svg|png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|map)$/i,
  /\.min\.(js|css)$/i,
];

function isNoiseFile(path: string): boolean {
  return NOISE_FILE_PATTERNS.some((re) => re.test(path));
}

// Lower number = included first when the budget is tight.
function filePriority(f: StoredFileDiff): number {
  // Deleted files (e.g. the starter after a student moved the project into a
  // subfolder) say little about what the student built.
  if (f.status === "removed") return 4;
  if (/\.(tsx?|jsx?|vue|svelte|py|java|cs|php|rb|go|rs|html)$/i.test(f.path)) {
    return /(^|\/)(tsconfig[^/]*|vite\.config|[^/]*\.config)\.[jt]s(on)?$/i.test(f.path) ? 2 : 0;
  }
  if (/(^|\/)package\.json$/.test(f.path)) return 1;
  if (/\.css$|\.scss$/i.test(f.path)) return 2;
  return 3;
}

function buildDiffText(files: StoredFileDiff[]): { text: string; truncated: boolean; omittedFiles: string[] } {
  // Stable sort: priority first, original (path) order within a priority.
  const changed = files
    .filter((f) => f.status !== "unchanged" && !isNoiseFile(f.path))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => filePriority(a.f) - filePriority(b.f) || a.i - b.i)
    .map(({ f }) => f);
  const chunks: string[] = [];
  const omittedFiles: string[] = [];
  let used = 0;

  for (const f of changed) {
    const chunkLines = [`--- ${f.path} (${f.status}${f.binary ? ", binary - contents not shown" : ""}) ---`];
    if (!f.binary) {
      (f.lines ?? []).forEach((line, index) => {
        const marker = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
        // `index` is this line's position in the diff, not a source line
        // number - removed lines don't exist in the new file, so old/new
        // source numbers collide and can't be used as a stable citation key.
        chunkLines.push(`[${index}]${marker} ${line.content}`);
      });
    }
    const chunk = chunkLines.join("\n");

    // Skip (don't abort) an oversized file so it can't silently crowd out
    // every file that happens to sort after it - each file is judged only
    // against the *remaining* budget, independently of the others.
    if (used + chunk.length > MAX_DIFF_CHARS) {
      omittedFiles.push(f.path);
      continue;
    }
    chunks.push(chunk);
    used += chunk.length;
  }

  return { text: chunks.join("\n\n"), truncated: omittedFiles.length > 0, omittedFiles };
}

function buildGradingKeyText(gradingKey: GradingKeyDoc): string {
  const lines: string[] = [];
  if (gradingKey.title) lines.push(gradingKey.title);
  gradingKey.sections?.forEach((section, si) => {
    lines.push(`\nSection: ${section.title ?? `Section ${si + 1}`}`);
    (section.criteria ?? []).forEach((c, ci) => {
      const id = criterionId(section, si, c, ci);
      lines.push(`  [${id}] (${c.points ?? 0} pts) ${c.description ?? ""}`);
    });
  });
  return lines.join("\n");
}

const autogradeResponseSchema = z.object({
  overallComment: z.string(),
  criteria: z.array(
    z.object({
      id: z.string(),
      checked: z.boolean(),
      comment: z.string(),
      // Not .optional() - some providers' strict structured-output mode
      // requires every property to be listed as required; an empty array is
      // the "nothing to cite" value instead of omitting the field.
      references: z.array(z.object({ file: z.string(), lineIndex: z.number().int() })).max(5),
    })
  ),
});

export interface AutogradeParams {
  access: AiAccess;
  modelId: string;
  gradingKey: GradingKeyDoc;
  files: StoredFileDiff[];
  /** Language for `comment` / `overallComment` text, e.g. "English", "Dutch". */
  language: string;
}

export interface AutogradeOutcome {
  overallComment: string;
  criteria: Record<string, CriterionGrade>;
}

// Strips terminal color codes the Gateway sometimes includes in error text.
const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;

// Some models (e.g. certain Anthropic reasoning models on the Gateway)
// reject a request outright when maxOutputTokens would let the combined
// output+reasoning budget exceed a per-model ceiling, reported as e.g. "max
// output tokens plus reasoning effort tokens must be under 21K for
// anthropic/claude-opus-4.8". Extracts that ceiling (in tokens) so the
// caller can retry with a budget that actually fits, instead of every
// request to that model failing outright.
function parseCombinedTokenLimit(err: unknown): number | null {
  // Not gated on APICallError.isInstance(err): the Gateway SDK converts a
  // rejected request's underlying APICallError into a GatewayInvalidRequestError
  // (extends plain Error, not APICallError) before it reaches this catch block,
  // so that check never matched and this retry path never ran.
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/under (\d+(?:\.\d+)?)K/i);
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

function describeGatewayError(err: unknown): string {
  const message = (() => {
    if (GatewayAuthenticationError.isInstance(err)) {
      return "The AI Gateway rejected the API key. Check it in Settings.";
    }
    if (APICallError.isInstance(err)) {
      return `AI Gateway request failed (${err.statusCode ?? "?"}): ${err.message}`;
    }
    if (NoObjectGeneratedError.isInstance(err)) {
      // The model produced no usable output at all - by far the most common
      // cause is running out of its output-token budget (large rubrics need
      // a lot of tokens for the full per-criterion JSON, and reasoning
      // models can burn through the same budget on hidden reasoning before
      // ever emitting the response), surfaced here as finishReason "length".
      const ranOutOfTokens = err.finishReason === "length";
      return ranOutOfTokens
        ? `${err.message} This model likely ran out of output tokens before finishing (large grading keys need a lot of output) - try a different model.`
        : err.message;
    }
    if (AISDKError.isInstance(err)) {
      return err.message;
    }
    return err instanceof Error ? err.message : "Unknown AI Gateway error.";
  })();

  return message.replace(ANSI_ESCAPE, "").trim();
}

async function generateWithGateway(
  apiKey: string,
  modelId: string,
  instructions: string,
  prompt: string
): Promise<z.infer<typeof autogradeResponseSchema>> {
  const gatewayClient = createGateway({ apiKey });
  const buildRequest = (maxOutputTokens: number) => ({
    model: gatewayClient(modelId),
    schema: autogradeResponseSchema,
    instructions,
    prompt,
    maxOutputTokens,
  });

  // Generous headroom: a large grading key's full per-criterion JSON output
  // alone can run into the thousands of tokens, and reasoning models spend
  // some of this same budget on hidden reasoning before ever emitting the
  // response - too low a cap here is the most common cause of "No object
  // generated: the model did not return a response."
  let result;
  try {
    result = await generateObject(buildRequest(32000));
  } catch (err) {
    const combinedLimit = parseCombinedTokenLimit(err);
    if (combinedLimit == null) throw new Error(describeGatewayError(err));

    // This model caps output+reasoning tokens together below our default -
    // retry once with a budget that actually fits, leaving headroom for
    // reasoning tokens we don't control directly.
    try {
      result = await generateObject(buildRequest(Math.max(2000, combinedLimit - 4000)));
    } catch (retryErr) {
      throw new Error(describeGatewayError(retryErr));
    }
  }

  return result.object;
}

export async function autogradeSolution(params: AutogradeParams): Promise<AutogradeOutcome> {
  const { access, modelId, gradingKey, files, language } = params;
  const validIds = new Set(allCriterionIds(gradingKey));

  const { text: diffText, truncated, omittedFiles } = buildDiffText(files);
  const gradingKeyText = buildGradingKeyText(gradingKey);

  const prompt = [
    "# Grading rubric",
    gradingKeyText,
    "",
    "# Diff (starter code -> student solution)",
    "Only files that changed are shown (lockfiles, images/SVGs and build output are omitted as noise; source files are listed first). Each line is prefixed with a bracketed index like [12] giving its position in this diff listing - it is NOT a source line number (removed lines don't exist in the student's file, so real line numbers would be ambiguous once lines are added or removed).",
    diffText || "(no changed files)",
    truncated
      ? `\n[omitted for length, too large to include: ${omittedFiles.join(", ")} - do not assume these are unchanged, you simply cannot see them]`
      : "",
  ].join("\n");

  const instructions =
      "You are grading a student's code submission against the rubric below, using a diff between the starter code they were given and their submission. For every criterion listed in the rubric, decide whether it is satisfied (checked: true) based only on what the diff shows, and write a short comment (1-2 sentences) explaining your judgment either way. When a specific place in the diff supports your judgment, cite it in `references` using the exact file path and the bracketed index shown at the start of that line, e.g. for a line shown as `[42]+ foo` use lineIndex: 42 (at most 2 references per criterion; use an empty array if there's nothing specific to cite). Be conservative: if the diff doesn't show enough to be sure a criterion is met, leave it unchecked and say what's missing. Return one entry in `criteria` for every criterion id in the rubric." +
      ` Write all free-text fields (\`comment\` and \`overallComment\`) in ${language}, regardless of what language the rubric or the code comments are written in.`;

  let object: z.infer<typeof autogradeResponseSchema>;
  if (access.provider === "claude-cli") {
    object = await generateObjectWithClaudeCli({ model: modelId, schema: autogradeResponseSchema, instructions, prompt });
  } else {
    object = await generateWithGateway(access.apiKey, modelId, instructions, prompt);
  }

  const criteria: Record<string, CriterionGrade> = {};
  for (const item of object.criteria) {
    if (!validIds.has(item.id)) continue;

    const references: CodeReference[] = [];
    for (const ref of item.references ?? []) {
      const fileDiff = files.find((f) => f.path === ref.file);
      const line = fileDiff?.lines?.[ref.lineIndex];
      if (fileDiff && line) {
        references.push({
          id: `ai-${item.id}-${references.length}-${Date.now().toString(36)}`,
          file: ref.file,
          lineIndex: ref.lineIndex,
          // Display-only label - whichever side of the diff this line exists on.
          line: line.newLineNo ?? line.oldLineNo ?? ref.lineIndex,
          snippet: line.content.trim().slice(0, 160),
        });
      }
    }

    criteria[item.id] = { checked: item.checked, comment: item.comment, references };
  }

  return { overallComment: object.overallComment, criteria };
}
