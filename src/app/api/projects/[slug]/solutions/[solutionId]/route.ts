import { NextResponse } from "next/server";
import { updateSolutionGroup } from "@/lib/storage";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[slug]/solutions/[solutionId]">) {
  const { slug, solutionId } = await ctx.params;

  const body = (await request.json().catch(() => null)) as { group?: unknown } | null;
  if (!body || (body.group !== null && typeof body.group !== "string")) {
    return NextResponse.json({ error: "Expected { group: string | null }." }, { status: 400 });
  }
  const group = typeof body.group === "string" ? body.group.trim() || null : null;

  const solution = await updateSolutionGroup(slug, solutionId, group);
  if (!solution) {
    return NextResponse.json({ error: "Unknown solution." }, { status: 404 });
  }

  return NextResponse.json({ solution });
}
