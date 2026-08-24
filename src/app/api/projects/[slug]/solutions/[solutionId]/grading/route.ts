import { NextResponse } from "next/server";
import { allCriterionIds, parseGradingKey } from "@/lib/gradingKey";
import { getGradingKeyRaw, getGradingState, getProject, getSolution, saveGradingState } from "@/lib/storage";
import type { CriterionGrade } from "@/lib/types";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/solutions/[solutionId]/grading">
) {
  const { slug, solutionId } = await ctx.params;

  const project = await getProject(slug);
  if (!project) return NextResponse.json({ error: "Unknown project." }, { status: 404 });

  const solution = await getSolution(slug, solutionId);
  if (!solution) return NextResponse.json({ error: "Unknown solution." }, { status: 404 });

  const gradingKey = parseGradingKey(await getGradingKeyRaw(slug));
  const grading = await getGradingState(slug, solutionId, allCriterionIds(gradingKey));

  return NextResponse.json({ grading });
}

function isValidCriteria(value: unknown): value is Record<string, CriterionGrade> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as CriterionGrade).checked === "boolean" &&
      typeof (v as CriterionGrade).comment === "string" &&
      Array.isArray((v as CriterionGrade).references)
  );
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/solutions/[solutionId]/grading">
) {
  const { slug, solutionId } = await ctx.params;

  const project = await getProject(slug);
  if (!project) return NextResponse.json({ error: "Unknown project." }, { status: 404 });

  const solution = await getSolution(slug, solutionId);
  if (!solution) return NextResponse.json({ error: "Unknown solution." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const { overallComment, criteria } = body as { overallComment?: unknown; criteria?: unknown };
  if (typeof overallComment !== "string" || !isValidCriteria(criteria)) {
    return NextResponse.json({ error: "Invalid grading payload." }, { status: 400 });
  }

  const grading = await saveGradingState(slug, solutionId, { overallComment, criteria });
  return NextResponse.json({ grading });
}
