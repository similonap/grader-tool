import { NextResponse } from "next/server";
import { getLatestAutogradeJob, startBulkAutograde } from "@/lib/autogradeJobs";
import { getProject } from "@/lib/storage";

export async function GET(request: Request, ctx: RouteContext<"/api/projects/[slug]/autograde">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const job = await getLatestAutogradeJob(slug);
  return NextResponse.json({ job });
}

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/autograde">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { model?: unknown; language?: unknown; solutionIds?: unknown }
    | null;
  const model = body?.model;
  if (typeof model !== "string" || !model.trim()) {
    return NextResponse.json({ error: "Expected { model: string }." }, { status: 400 });
  }
  const language = typeof body?.language === "string" && body.language.trim() ? body.language.trim().slice(0, 60) : "English";

  const solutionIds = body?.solutionIds;
  if (!Array.isArray(solutionIds) || solutionIds.length === 0 || !solutionIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Expected { solutionIds: string[] } with at least one id." }, { status: 400 });
  }

  try {
    const job = await startBulkAutograde({ slug, model: model.trim(), language, solutionIds });
    return NextResponse.json({ job }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start bulk autograde.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
