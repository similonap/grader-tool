import { NextResponse } from "next/server";
import { setSolutionLocked, updateSolutionGroup } from "@/lib/storage";
import type { SolutionMeta } from "@/lib/types";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[slug]/solutions/[solutionId]">) {
  const { slug, solutionId } = await ctx.params;

  const body = (await request.json().catch(() => null)) as { group?: unknown; locked?: unknown } | null;
  if (!body || (body.group === undefined && body.locked === undefined)) {
    return NextResponse.json({ error: "Expected { group?: string | null; locked?: boolean }." }, { status: 400 });
  }
  if (body.group !== undefined && body.group !== null && typeof body.group !== "string") {
    return NextResponse.json({ error: "group must be a string or null." }, { status: 400 });
  }
  if (body.locked !== undefined && typeof body.locked !== "boolean") {
    return NextResponse.json({ error: "locked must be a boolean." }, { status: 400 });
  }

  let solution: SolutionMeta | null = null;
  if (body.group !== undefined) {
    const group = typeof body.group === "string" ? body.group.trim() || null : null;
    solution = await updateSolutionGroup(slug, solutionId, group);
  }
  if (body.locked !== undefined) {
    solution = await setSolutionLocked(slug, solutionId, body.locked as boolean);
  }

  if (!solution) {
    return NextResponse.json({ error: "Unknown solution." }, { status: 404 });
  }

  return NextResponse.json({ solution });
}
