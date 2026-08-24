import { NextResponse } from "next/server";
import { deleteSolutions, getProject } from "@/lib/storage";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/solutions/delete">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { solutionIds?: unknown } | null;
  const solutionIds = body?.solutionIds;
  if (!Array.isArray(solutionIds) || solutionIds.length === 0 || !solutionIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Expected { solutionIds: string[] } with at least one id." }, { status: 400 });
  }

  const deletedCount = await deleteSolutions(slug, solutionIds);
  return NextResponse.json({ deletedCount });
}
