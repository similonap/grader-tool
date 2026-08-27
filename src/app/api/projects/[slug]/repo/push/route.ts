import { NextResponse } from "next/server";
import { getProjectRepoStatus, pushProjectRepo } from "@/lib/projectRepo";
import { getProject, projectDir } from "@/lib/storage";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/repo/push">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" && body.message.trim() ? body.message.trim() : "Sync from Grader";
  const dir = projectDir(slug);

  try {
    const result = await pushProjectRepo(dir, message);
    return NextResponse.json({ message: result, status: await getProjectRepoStatus(dir) });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : "Failed to push.";
    return NextResponse.json({ error: errMessage }, { status: 400 });
  }
}
