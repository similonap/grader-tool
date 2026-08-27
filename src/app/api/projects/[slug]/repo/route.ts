import { NextResponse } from "next/server";
import { getProjectRepoStatus } from "@/lib/projectRepo";
import { getProject, projectDir } from "@/lib/storage";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]/repo">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  return NextResponse.json(await getProjectRepoStatus(projectDir(slug)));
}
