import { NextResponse } from "next/server";
import { matchSolutionsToPuntenlijst, parsePuntenlijst } from "@/lib/puntenlijst";
import { getProject, listSolutions } from "@/lib/storage";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/puntenlijst/preview">) {
  const { slug } = await ctx.params;

  const project = await getProject(slug);
  if (!project) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "A puntenlijst .xlsx file is required." }, { status: 400 });
  }

  let students;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    students = parsePuntenlijst(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read the spreadsheet.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (students.length === 0) {
    return NextResponse.json({ error: "No students found in that spreadsheet." }, { status: 400 });
  }

  const solutions = await listSolutions(slug);
  const candidates = solutions.map((s) => ({ solutionId: s.id, label: s.label, originalFilename: s.originalFilename }));
  const suggestions = matchSolutionsToPuntenlijst(candidates, students);
  const suggestionById = new Map(suggestions.map((s) => [s.solutionId, s.suggestion]));

  const matches = solutions.map((s) => ({
    solutionId: s.id,
    currentLabel: s.label,
    currentGroup: s.group,
    suggestion: suggestionById.get(s.id) ?? null,
  }));

  return NextResponse.json({ matches, students });
}
