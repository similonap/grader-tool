import { GatewayAuthenticationError, createGateway } from "@ai-sdk/gateway";
import { AISDKError, APICallError, generateObject } from "ai";
import { z } from "zod";
import { allCriterionIds, criterionId, type GradingKeyDoc } from "./gradingKey";
import type { CodeReference, CriterionGrade, StoredFileDiff } from "./types";

export interface GatewayModelOption {
  id: string;
  name: string;
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
];

function isNoiseFile(path: string): boolean {
  return NOISE_FILE_PATTERNS.some((re) => re.test(path));
}

function buildDiffText(files: StoredFileDiff[]): { text: string; truncated: boolean; omittedFiles: string[] } {
  const changed = files.filter((f) => f.status !== "unchanged" && !isNoiseFile(f.path));
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
  apiKey: string;
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

function describeGatewayError(err: unknown): string {
  const message = (() => {
    if (GatewayAuthenticationError.isInstance(err)) {
      return "The AI Gateway rejected the API key. Check it in Settings.";
    }
    if (APICallError.isInstance(err)) {
      return `AI Gateway request failed (${err.statusCode ?? "?"}): ${err.message}`;
    }
    if (AISDKError.isInstance(err)) {
      return err.message;
    }
    return err instanceof Error ? err.message : "Unknown AI Gateway error.";
  })();

  return message.replace(ANSI_ESCAPE, "").trim();
}

export async function autogradeSolution(params: AutogradeParams): Promise<AutogradeOutcome> {
  const { apiKey, modelId, gradingKey, files, language } = params;
  const validIds = new Set(allCriterionIds(gradingKey));
  const gatewayClient = createGateway({ apiKey });

  const { text: diffText, truncated, omittedFiles } = buildDiffText(files);
  const gradingKeyText = buildGradingKeyText(gradingKey);

  const prompt = [
    "# Grading rubric",
    gradingKeyText,
    "",
    "# Diff (starter code -> student solution)",
    "Only files that changed are shown (lockfiles are omitted as noise). Each line is prefixed with a bracketed index like [12] giving its position in this diff listing - it is NOT a source line number (removed lines don't exist in the student's file, so real line numbers would be ambiguous once lines are added or removed).",
    diffText || "(no changed files)",
    truncated
      ? `\n[omitted for length, too large to include: ${omittedFiles.join(", ")} - do not assume these are unchanged, you simply cannot see them]`
      : "",
  ].join("\n");

  let result;
  try {
    result = await generateObject({
      model: gatewayClient(modelId),
      schema: autogradeResponseSchema,
      instructions:
        "You are grading a student's code submission against the rubric below, using a diff between the starter code they were given and their submission. For every criterion listed in the rubric, decide whether it is satisfied (checked: true) based only on what the diff shows, and write a short comment (1-2 sentences) explaining your judgment either way. When a specific place in the diff supports your judgment, cite it in `references` using the exact file path and the bracketed index shown at the start of that line, e.g. for a line shown as `[42]+ foo` use lineIndex: 42 (at most 2 references per criterion; use an empty array if there's nothing specific to cite). Be conservative: if the diff doesn't show enough to be sure a criterion is met, leave it unchecked and say what's missing. Return one entry in `criteria` for every criterion id in the rubric." +
        ` Write all free-text fields (\`comment\` and \`overallComment\`) in ${language}, regardless of what language the rubric or the code comments are written in.`,
      prompt,
      maxOutputTokens: 8000,
    });
  } catch (err) {
    throw new Error(describeGatewayError(err));
  }

  const criteria: Record<string, CriterionGrade> = {};
  for (const item of result.object.criteria) {
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

  return { overallComment: result.object.overallComment, criteria };
}
