import { NextResponse } from "next/server";
import { getProjectRepoStatus, pullProjectRepo } from "@/lib/projectRepo";
import { getProject, projectDir } from "@/lib/storage";

export async function POST(_request: Request, ctx: RouteContext<"/api/projects/[slug]/repo/pull">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }
  const dir = projectDir(slug);

  try {
    const message = await pullProjectRepo(dir);
    return NextResponse.json({ message, status: await getProjectRepoStatus(dir) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pull.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
