import { NextResponse } from "next/server";
import { deleteProject, exportProject } from "@/lib/storage";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]">) {
  const { slug } = await ctx.params;

  const zipBuffer = await exportProject(slug);
  if (!zipBuffer) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
    },
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[slug]">) {
  const { slug } = await ctx.params;

  const deleted = await deleteProject(slug);
  if (!deleted) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
