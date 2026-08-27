import { NextResponse } from "next/server";
import { applyPuntenlijstAssignments, getProject } from "@/lib/storage";

interface AssignmentInput {
  solutionId?: unknown;
  name?: unknown;
  group?: unknown;
}

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/puntenlijst/apply">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { assignments?: AssignmentInput[] } | null;
  const assignments = body?.assignments;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return NextResponse.json({ error: "Expected { assignments: [...] } with at least one entry." }, { status: 400 });
  }

  const valid = assignments.filter(
    (a): a is { solutionId: string; name: string; group: string | null } =>
      typeof a.solutionId === "string" &&
      typeof a.name === "string" &&
      a.name.trim() !== "" &&
      (a.group === null || typeof a.group === "string")
  );
  if (valid.length === 0) {
    return NextResponse.json({ error: "No valid assignments." }, { status: 400 });
  }

  const updatedCount = await applyPuntenlijstAssignments(
    slug,
    valid.map((a) => ({ solutionId: a.solutionId, label: a.name.trim(), group: a.group?.trim() || null }))
  );
  return NextResponse.json({ updatedCount });
}
