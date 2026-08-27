import { NextResponse } from "next/server";
import { getProjectRepoStatus, initProjectRepo, pushProjectRepo, setProjectRemote } from "@/lib/projectRepo";
import { getProject, projectDir } from "@/lib/storage";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/repo/init">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { remoteUrl?: unknown } | null;
  const remoteUrl = typeof body?.remoteUrl === "string" && body.remoteUrl.trim() ? body.remoteUrl.trim() : null;
  const dir = projectDir(slug);

  try {
    const status = await getProjectRepoStatus(dir);
    if (!status.isRepo) {
      // Old project that predates this feature - initialize it fresh.
      await initProjectRepo(dir, remoteUrl);
    } else if (remoteUrl) {
      // Already a local repo (e.g. auto-initialized at creation) - just
      // needs a remote wired up and its history pushed.
      await setProjectRemote(dir, remoteUrl);
      await pushProjectRepo(dir, "Initial project data");
    } else {
      return NextResponse.json({ error: "This project already has a git repository." }, { status: 400 });
    }
    return NextResponse.json({ status: await getProjectRepoStatus(dir) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to set up the git repository.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
