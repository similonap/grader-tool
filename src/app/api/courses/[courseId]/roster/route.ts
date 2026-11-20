import { NextResponse } from "next/server";
import { getCourse, setCourseRoster, type CourseStudent } from "@/lib/gradebook";
import { parsePuntenlijst } from "@/lib/puntenlijst";
import { slugify } from "@/lib/slug";

export async function POST(request: Request, ctx: RouteContext<"/api/courses/[courseId]/roster">) {
  const { courseId } = await ctx.params;
  const course = await getCourse(courseId);
  if (!course) return NextResponse.json({ error: "Unknown course." }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "A student list (.xlsx) is required." }, { status: 400 });
  }

  let students;
  try {
    students = parsePuntenlijst(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read the spreadsheet.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (students.length === 0) {
    return NextResponse.json({ error: "No students found in that spreadsheet." }, { status: 400 });
  }

  const roster: CourseStudent[] = students.map((s) => ({
    id: s.studentId ?? slugify(s.name),
    name: s.name,
    group: s.group,
    email: s.email,
    exemption: s.exemption,
  }));

  const updated = await setCourseRoster(courseId, roster);
  return NextResponse.json({ course: updated, imported: roster.length });
}
