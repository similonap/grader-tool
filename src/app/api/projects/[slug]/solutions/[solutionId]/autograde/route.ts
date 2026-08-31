import { NextResponse } from "next/server";
import { autogradeSolution } from "@/lib/aiGateway";
import { parseGradingKey } from "@/lib/gradingKey";
import { getAiGatewayKey } from "@/lib/settings";
import {
  getGradingKeyRaw,
  getProject,
  getSolution,
  getSolutionDiff,
  saveGradingState,
  saveLastAutogradeSettings,
} from "@/lib/storage";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/solutions/[solutionId]/autograde">
) {
  const { slug, solutionId } = await ctx.params;

  const apiKey = await getAiGatewayKey();
  if (!apiKey) {
    return NextResponse.json({ error: "No AI Gateway key configured. Set one in Settings first." }, { status: 400 });
  }

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const solution = await getSolution(slug, solutionId);
  if (!solution) {
    return NextResponse.json({ error: "Unknown solution." }, { status: 404 });
  }
  if (solution.locked) {
    return NextResponse.json({ error: "This solution is locked. Unlock it first." }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as { model?: unknown; language?: unknown } | null;
  const modelId = body?.model;
  if (typeof modelId !== "string" || !modelId.trim()) {
    return NextResponse.json({ error: "Expected { model: string }." }, { status: 400 });
  }

  const language = typeof body?.language === "string" && body.language.trim() ? body.language.trim().slice(0, 60) : "English";

  const gradingKey = parseGradingKey(await getGradingKeyRaw(slug));
  if (!gradingKey?.sections?.length) {
    return NextResponse.json({ error: "This project's grading key has no structured criteria to grade against." }, { status: 400 });
  }

  const solutionDiff = await getSolutionDiff(slug, solution);
  if (!solutionDiff) {
    return NextResponse.json({ error: "No diff found for this solution." }, { status: 404 });
  }

  try {
    const outcome = await autogradeSolution({
      apiKey,
      modelId: modelId.trim(),
      gradingKey,
      files: solutionDiff.files,
      language,
    });

    await saveLastAutogradeSettings(slug, modelId.trim(), language);
    const grading = await saveGradingState(slug, solutionId, outcome);
    return NextResponse.json({ grading });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Autograding failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
