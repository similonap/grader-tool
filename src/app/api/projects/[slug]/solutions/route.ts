import { NextResponse } from "next/server";
import { addSolution, getProject } from "@/lib/storage";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/solutions">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const formData = await request.formData();
  const zip = formData.get("solutionZip") as File | null;
  const groupRaw = formData.get("group") as string | null;
  const group = groupRaw?.trim() ? groupRaw.trim() : null;

  if (!zip || zip.size === 0) {
    return NextResponse.json({ error: "A solution zip file is required." }, { status: 400 });
  }

  const zipBuffer = Buffer.from(await zip.arrayBuffer());

  try {
    const solution = await addSolution(slug, {
      zipBuffer,
      originalFilename: zip.name,
      group,
    });
    return NextResponse.json({ solution }, { status: 201 });
  } catch (err) {
    console.error("Failed to add solution", err);
    return NextResponse.json({ error: "Failed to upload the solution." }, { status: 500 });
  }
}
