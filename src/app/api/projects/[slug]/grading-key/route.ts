import { NextResponse } from "next/server";
import { getProject, saveGradingKey } from "@/lib/storage";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/grading-key">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const formData = await request.formData();
  const gradingKey = formData.get("gradingKey") as File | null;
  if (!gradingKey || gradingKey.size === 0) {
    return NextResponse.json({ error: "A grading key file is required." }, { status: 400 });
  }

  const gradingKeyText = await gradingKey.text();
  try {
    JSON.parse(gradingKeyText);
  } catch {
    return NextResponse.json({ error: "The grading key must be valid JSON." }, { status: 400 });
  }

  await saveGradingKey(slug, gradingKeyText, gradingKey.name);
  return NextResponse.json({ ok: true });
}
