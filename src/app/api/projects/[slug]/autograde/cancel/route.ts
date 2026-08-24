import { NextResponse } from "next/server";
import { requestCancelAutograde } from "@/lib/autogradeJobs";
import { getProject } from "@/lib/storage";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/autograde/cancel">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const cancelled = requestCancelAutograde(slug);
  if (!cancelled) {
    return NextResponse.json({ error: "No bulk autograde run is currently in progress." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
