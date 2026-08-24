import { NextResponse } from "next/server";
import { getProject, getSolution, getSolutionDiff } from "@/lib/storage";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/solutions/[solutionId]/diff">
) {
  const { slug, solutionId } = await ctx.params;
  const url = new URL(request.url);
  const file = url.searchParams.get("file");

  if (!file) {
    return NextResponse.json({ error: "Missing file query param." }, { status: 400 });
  }

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const solution = await getSolution(slug, solutionId);
  if (!solution) {
    return NextResponse.json({ error: "Unknown solution." }, { status: 404 });
  }

  const diff = await getSolutionDiff(slug, solution);
  const fileDiff = diff?.files.find((f) => f.path === file);
  if (!fileDiff) {
    return NextResponse.json({ error: "File not found in either version." }, { status: 404 });
  }

  return NextResponse.json({
    path: fileDiff.path,
    binary: fileDiff.binary,
    lines: fileDiff.lines ?? null,
    oldSize: fileDiff.oldSize ?? null,
    newSize: fileDiff.newSize ?? null,
  });
}
